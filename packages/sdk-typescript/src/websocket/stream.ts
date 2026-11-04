import { TypedEmitter } from "../utils/typed-emitter.js";
import { type RequestOptions } from "../utils/deadline.js";
import { SdkError } from "../errors.js";
import { utf8ByteLength } from "../utils/encoding.js";
import {
  isBoundaryBigInt,
  type BoundaryValue,
} from "../utils/boundary-value.js";
import type { GenericSuccessResponse } from "./types.js";
import { WebSocketSession, type WsSubscription } from "./session.js";

export type StreamEvent = "message" | "error" | "close" | "resubscribed" | "subscriptionError";
export type StreamListener<T extends BoundaryValue> = ((message: T) => void) | ((err: Error) => void) | (() => void);
export type FrameMatcher<T extends BoundaryValue> = (frame: BoundaryValue) => frame is T;
export type WebSocketStreamState = "active" | "reconnecting" | "failed" | "closed";

export interface WebSocketStream<T extends BoundaryValue> extends AsyncIterable<T> {
  /** Stable SDK-generated ID shared by diagnostics for this stream subscription. */
  readonly correlationId: string;
  readonly ready: Promise<GenericSuccessResponse>;
  readonly state: WebSocketStreamState;
  readonly lastError?: Error;
  readonly malformedFrameCount: number;
  on(event: "message", cb: (message: T) => void, options?: { signal?: AbortSignal }): this;
  on(event: "error", cb: (err: Error) => void, options?: { signal?: AbortSignal }): this;
  on(event: "close", cb: () => void, options?: { signal?: AbortSignal }): this;
  on(event: "resubscribed", cb: () => void, options?: { signal?: AbortSignal }): this;
  /** Emit the failed subscription and notify the registered error listeners. */
  on(event: "subscriptionError", cb: (err: Error) => void, options?: { signal?: AbortSignal }): this;
  off(event: "message", cb: (message: T) => void): this;
  off(event: "error", cb: (err: Error) => void): this;
  off(event: "close", cb: () => void): this;
  off(event: "resubscribed", cb: () => void): this;
  off(event: "subscriptionError", cb: (err: Error) => void): this;
  close(options?: RequestOptions): Promise<void>;
  [Symbol.dispose]?(): void;
  [Symbol.asyncDispose]?(): Promise<void>;
}

export type WebSocketOverflowStrategy = "drop-oldest" | "drop-newest" | "error";

export interface WebSocketStreamOptions extends RequestOptions {
  /** Maximum number of unconsumed messages in the async iterator. Default: 10,000. */
  highWaterMark?: number;
  /** Maximum estimated UTF-8 bytes in the async iterator. Default: 16 MiB. */
  highWaterMarkBytes?: number;
  /** Action to take when the async iterator buffer is full. Default: drop-oldest. */
  overflowStrategy?: WebSocketOverflowStrategy;
}

export function validateWebSocketStreamOptions(options?: WebSocketStreamOptions): void {
  const highWaterMark = options?.highWaterMark;
  if (highWaterMark !== undefined && (!Number.isSafeInteger(highWaterMark) || highWaterMark < 0)) {
    throw new SdkError("highWaterMark must be a non-negative safe integer");
  }
  const highWaterMarkBytes = options?.highWaterMarkBytes;
  if (highWaterMarkBytes !== undefined && (!Number.isSafeInteger(highWaterMarkBytes) || highWaterMarkBytes < 0)) {
    throw new SdkError("highWaterMarkBytes must be a non-negative safe integer");
  }
  const overflowStrategy = options?.overflowStrategy;
  if (overflowStrategy !== undefined && !["drop-oldest", "drop-newest", "error"].includes(overflowStrategy)) {
    throw new SdkError(`unsupported WebSocket stream overflow strategy ${String(overflowStrategy)}`);
  }
}

const DEFAULT_STREAM_HIGH_WATER_MARK = 10_000;
const DEFAULT_STREAM_HIGH_WATER_MARK_BYTES = 16 * 1024 * 1024;

type StreamEmitterEvents<T extends BoundaryValue> = {
  message: (frame: T) => void;
  error: (error: BoundaryValue) => void;
  close: () => void;
  resubscribed: () => void;
  subscriptionError: (error: BoundaryValue) => void;
};

export class WebSocketStreamImpl<T extends BoundaryValue> implements WebSocketStream<T> {
  readonly correlationId: string;
  readonly ready: Promise<GenericSuccessResponse>;
  private readonly emitter = new TypedEmitter<StreamEmitterEvents<T>>();
  private readonly onMessage: (frame: BoundaryValue) => void;
  private readonly onError: (error: BoundaryValue) => void;
  private readonly onClose: () => void;
  private readonly onReconnecting: () => void;
  private readonly onReconnected: (event: { id: string | number }) => void;
  private readonly onSubscriptionError: (event: { id: string | number; error: BoundaryValue }) => void;
  private streamState: WebSocketStreamState = "active";
  private streamError?: Error;
  private malformedFrames = 0;
  private closed = false;
  private readonly iteratorQueue: Array<{ value: T; bytes: number }> = [];
  private iteratorQueueBytes = 0;
  private readonly iteratorWaiters: Array<{
    resolve: (result: IteratorResult<T>) => void;
    reject: (error: BoundaryValue) => void;
  }> = [];
  private readonly highWaterMark: number;
  private readonly highWaterMarkBytes: number;
  private readonly overflowStrategy: WebSocketOverflowStrategy;

  constructor(
    private readonly session: WebSocketSession,
    private readonly subscription: WsSubscription,
    private readonly matcher: FrameMatcher<T>,
    private readonly isCandidateFrame: (frame: BoundaryValue) => boolean,
    private readonly release: () => void,
    private readonly symbol: string | undefined,
    private readonly onMalformed: (count: number) => void,
    private readonly onOverflow: (metadata: {
      symbol?: string;
      queueSize: number;
      queueBytes: number;
      highWaterMark: number;
      highWaterMarkBytes: number;
      frameBytes: number;
      strategy: WebSocketOverflowStrategy;
    }) => void,
    options?: WebSocketStreamOptions,
  ) {
    validateWebSocketStreamOptions(options);
    const highWaterMark = options?.highWaterMark ?? DEFAULT_STREAM_HIGH_WATER_MARK;
    const highWaterMarkBytes = options?.highWaterMarkBytes ?? DEFAULT_STREAM_HIGH_WATER_MARK_BYTES;
    const overflowStrategy = options?.overflowStrategy ?? "drop-oldest";
    this.highWaterMark = highWaterMark;
    this.highWaterMarkBytes = highWaterMarkBytes;
    this.overflowStrategy = overflowStrategy;
    this.correlationId = subscription.correlationId;
    this.ready = subscription.ready;
    this.onMessage = (frame) => {
      if (this.closed) return;
      if (this.matcher(frame)) {
        this.emitter.emit("message", frame);
        this.enqueueIteratorValue(frame);
      } else if (this.isCandidateFrame(frame)) {
        this.malformedFrames++;
        this.onMalformed(this.malformedFrames);
      }
    };
    this.onError = (error) => {
      if (this.closed) return;
      const streamError = this.toError(error);
      // An error with an unexpected close is transient.
      // The transport emits `reconnecting` before the close error.
      // Keep iterator waiters alive so the replayed subscription can deliver the next value.
      if (this.streamState === "reconnecting") {
        if (this.emitter.listenerCount("error") > 0) this.emitter.emit("error", streamError);
        return;
      }
      this.fail(streamError);
    };
    this.onClose = () => {
      this.streamState = "closed";
      this.dispose();
    };
    this.onReconnecting = () => {
      if (!this.closed && this.streamState !== "failed") this.streamState = "reconnecting";
    };
    this.onReconnected = (event) => {
      if (!this.closed && this.streamState === "reconnecting" && String(event.id) === String(this.subscription.id)) {
        this.streamError = undefined;
        this.streamState = "active";
        this.emitter.emit("resubscribed");
      }
    };
    this.onSubscriptionError = (event) => {
      if (!this.closed && String(event.id) === String(this.subscription.id)) {
        this.fail(event.error);
        this.emitter.emit("subscriptionError", this.streamError);
      }
    };
    session.on("message", this.onMessage);
    session.on("error", this.onError);
    session.on("reconnecting", this.onReconnecting);
    session.on("close", this.onClose);
    session.on("resubscribed", this.onReconnected);
    session.on("subscriptionError", this.onSubscriptionError);
    void this.ready.catch((error) => this.fail(error));
  }

  get state(): WebSocketStreamState { return this.streamState; }
  get lastError(): Error | undefined { return this.streamError; }
  get malformedFrameCount(): number { return this.malformedFrames; }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.streamError) return Promise.reject(this.streamError);
        if (this.iteratorQueue.length > 0) {
          const queued = this.iteratorQueue.shift()!;
          this.iteratorQueueBytes -= queued.bytes;
          return Promise.resolve({ done: false, value: queued.value });
        }
        if (this.closed) return Promise.resolve({ done: true, value: undefined });
        return new Promise<IteratorResult<T>>((resolve, reject) => {
          this.iteratorWaiters.push({ resolve, reject });
        });
      },
      return: async () => {
        await this.close();
        return { done: true, value: undefined };
      },
    };
  }

  on(event: "message", cb: (message: T) => void, options?: { signal?: AbortSignal }): this;
  on(event: "error", cb: (err: Error) => void, options?: { signal?: AbortSignal }): this;
  on(event: "close", cb: () => void, options?: { signal?: AbortSignal }): this;
  on(event: "resubscribed", cb: () => void, options?: { signal?: AbortSignal }): this;
  on(event: "subscriptionError", cb: (err: Error) => void, options?: { signal?: AbortSignal }): this;
  on(event: StreamEvent, cb: StreamListener<T>, options?: { signal?: AbortSignal }): this {
    if (this.closed) return this;
    // SAFETY: The overloads above pair each event name with its corresponding listener type.
    this.emitter.on(event, cb as StreamEmitterEvents<T>[typeof event], options);
    return this;
  }

  off(event: "message", cb: (message: T) => void): this;
  off(event: "error", cb: (err: Error) => void): this;
  off(event: "close", cb: () => void): this;
  off(event: "resubscribed", cb: () => void): this;
  off(event: "subscriptionError", cb: (err: Error) => void): this;
  off(event: StreamEvent, cb: StreamListener<T>): this {
    // SAFETY: The overloads above pair each event name with its corresponding listener type.
    this.emitter.off(event, cb as StreamEmitterEvents<T>[typeof event]);
    return this;
  }

  async close(options?: RequestOptions): Promise<void> {
    if (this.closed) return;
    this.dispose();
    await this.subscription.close(options);
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.streamState = "closed";
    this.session.off("message", this.onMessage);
    this.session.off("error", this.onError);
    this.session.off("reconnecting", this.onReconnecting);
    this.session.off("close", this.onClose);
    this.session.off("resubscribed", this.onReconnected);
    this.session.off("subscriptionError", this.onSubscriptionError);
    this.release();
    this.iteratorQueue.length = 0;
    this.iteratorQueueBytes = 0;
    this.resolveIteratorDone();
    this.emitter.emit("close");
    this.emitter.removeAllListeners();
  }

  [Symbol.dispose](): void {
    this.dispose();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  private enqueueIteratorValue(value: T): void {
    if (this.streamError) return;
    const waiter = this.iteratorWaiters.shift();
    if (waiter) {
      waiter.resolve({ done: false, value });
      return;
    }
    const frameBytes = estimateFrameBytes(value);
    const exceedsLimit = (): boolean => this.iteratorQueue.length >= this.highWaterMark ||
      this.iteratorQueueBytes + frameBytes > this.highWaterMarkBytes;
    if (exceedsLimit()) {
      this.onOverflow({
        symbol: this.symbol,
        queueSize: this.iteratorQueue.length,
        queueBytes: this.iteratorQueueBytes,
        highWaterMark: this.highWaterMark,
        highWaterMarkBytes: this.highWaterMarkBytes,
        frameBytes,
        strategy: this.overflowStrategy,
      });
      if (this.overflowStrategy === "error") {
        this.fail(new SdkError(
          `WebSocket stream iterator buffer overflow (exceeded ${this.highWaterMark} messages or ${this.highWaterMarkBytes} bytes)`,
        ));
        return;
      }
      if (this.overflowStrategy === "drop-oldest") {
        while (this.iteratorQueue.length > 0 && exceedsLimit()) {
          const dropped = this.iteratorQueue.shift()!;
          this.iteratorQueueBytes -= dropped.bytes;
        }
        if (exceedsLimit()) return;
      }
      else if (this.overflowStrategy === "drop-newest") return;
    }
    this.iteratorQueue.push({ value, bytes: frameBytes });
    this.iteratorQueueBytes += frameBytes;
  }

  private rejectIteratorWaiters(error: Error): void {
    while (this.iteratorWaiters.length > 0) this.iteratorWaiters.shift()!.reject(error);
  }

  private toError(error: BoundaryValue): Error {
    return error instanceof Error ? error : new SdkError("WebSocket stream error");
  }

  private fail(error: BoundaryValue): void {
    if (this.closed || this.streamState === "failed") return;
    this.streamError = this.toError(error);
    this.streamState = "failed";
    this.iteratorQueue.length = 0;
    this.iteratorQueueBytes = 0;
    this.rejectIteratorWaiters(this.streamError);
    if (this.emitter.listenerCount("error") > 0) this.emitter.emit("error", this.streamError);
  }

  private resolveIteratorDone(): void {
    while (this.iteratorWaiters.length > 0) this.iteratorWaiters.shift()!.resolve({ done: true, value: undefined });
  }
}

export function estimateFrameBytes(frame: BoundaryValue): number {
  try {
    const serialized = JSON.stringify(frame, (_key, value: BoundaryValue) =>
      isBoundaryBigInt(value) ? value.toString() : value);
    return serialized === undefined ? Number.MAX_SAFE_INTEGER : utf8ByteLength(serialized);
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}
