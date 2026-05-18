import WebSocket from 'ws';
import type {
  WSSubscribeRequest,
  WSMessage,
  WSTradeMessage,
  WSDepthMessage,
  WSBookTickerMessage,
  WSTickerMessage,
  WSSubscribeResponse,
} from '../types/websocket.js';

export type WSEventHandler = (message: WSMessage) => void;

/**
 * WebSocket client for Gemini API
 */
export class GeminiWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private messageHandlers: Set<WSEventHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000; // Start with 1 second
  private maxReconnectDelay = 60000; // Max 60 seconds
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private isManualClose = false;
  private subscriptionQueue: string[] = [];

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Connect to WebSocket
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.isManualClose = false;
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        console.error('[WS] Connected to', this.url);
        this.reconnectAttempts = 0;
        this.startPingInterval();

        // Resubscribe to queued channels
        if (this.subscriptionQueue.length > 0) {
          console.error('[WS] Resubscribing to', this.subscriptionQueue.length, 'channels');
          this.subscribe(this.subscriptionQueue).catch((err) => {
            console.error('[WS] Resubscription error:', err);
          });
        }

        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString()) as WSMessage;
          this.handleMessage(message);
        } catch (err) {
          console.error('[WS] Failed to parse message:', err);
        }
      });

      this.ws.on('error', (err: Error) => {
        console.error('[WS] WebSocket error:', err.message);
        reject(err);
      });

      this.ws.on('close', () => {
        console.error('[WS] Connection closed');
        this.stopPingInterval();

        if (!this.isManualClose && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('pong', () => {
        // Connection is alive
      });
    });
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    console.error(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect().catch((err) => {
        console.error('[WS] Reconnection failed:', err.message);
      });
    }, delay);
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPingInterval(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000); // Ping every 30 seconds
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(message: WSMessage): void {
    // Notify all handlers
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (err) {
        console.error('[WS] Handler error:', err);
      }
    }
  }

  /**
   * Subscribe to channels
   */
  async subscribe(channels: string[]): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    const request: WSSubscribeRequest = {
      id: Date.now().toString(),
      method: 'subscribe',
      params: channels,
    };

    // Add to subscription queue for reconnection
    for (const channel of channels) {
      if (!this.subscriptionQueue.includes(channel)) {
        this.subscriptionQueue.push(channel);
      }
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Subscribe timeout'));
      }, 5000);

      const responseHandler = (message: WSMessage) => {
        const response = message as WSSubscribeResponse;
        if (response.id === request.id) {
          clearTimeout(timeout);
          this.removeMessageHandler(responseHandler);

          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve();
          }
        }
      };

      this.addMessageHandler(responseHandler);
      this.ws!.send(JSON.stringify(request));
    });
  }

  /**
   * Unsubscribe from channels
   */
  async unsubscribe(channels: string[]): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    const request: WSSubscribeRequest = {
      id: Date.now().toString(),
      method: 'unsubscribe',
      params: channels,
    };

    // Remove from subscription queue
    this.subscriptionQueue = this.subscriptionQueue.filter(
      (ch) => !channels.includes(ch)
    );

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Unsubscribe timeout'));
      }, 5000);

      const responseHandler = (message: WSMessage) => {
        const response = message as WSSubscribeResponse;
        if (response.id === request.id) {
          clearTimeout(timeout);
          this.removeMessageHandler(responseHandler);

          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve();
          }
        }
      };

      this.addMessageHandler(responseHandler);
      this.ws!.send(JSON.stringify(request));
    });
  }

  /**
   * Add message handler
   */
  addMessageHandler(handler: WSEventHandler): void {
    this.messageHandlers.add(handler);
  }

  /**
   * Remove message handler
   */
  removeMessageHandler(handler: WSEventHandler): void {
    this.messageHandlers.delete(handler);
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    this.isManualClose = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopPingInterval();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.subscriptionQueue = [];
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection state
   */
  getState(): string {
    if (!this.ws) return 'disconnected';

    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      case WebSocket.CLOSING:
        return 'closing';
      case WebSocket.CLOSED:
        return 'closed';
      default:
        return 'unknown';
    }
  }

  /**
   * Get active subscriptions
   */
  getSubscriptions(): string[] {
    return [...this.subscriptionQueue];
  }
}

/**
 * Helper to check if message is a trade message
 */
export function isTradeMessage(msg: WSMessage): msg is WSTradeMessage {
  return 't' in msg && 'q' in msg && 'm' in msg;
}

/**
 * Helper to check if message is a depth message
 */
export function isDepthMessage(msg: WSMessage): msg is WSDepthMessage {
  return 'b' in msg && 'a' in msg && Array.isArray((msg as WSDepthMessage).b);
}

/**
 * Helper to check if message is a book ticker message
 */
export function isBookTickerMessage(msg: WSMessage): msg is WSBookTickerMessage {
  return 'b' in msg && 'B' in msg && 'a' in msg && 'A' in msg;
}

/**
 * Helper to check if message is a ticker message
 */
export function isTickerMessage(msg: WSMessage): msg is WSTickerMessage {
  return 'o' in msg && 'h' in msg && 'l' in msg && 'c' in msg && 'v' in msg;
}

/**
 * Helper to check if message is a subscription response
 */
export function isSubscribeResponse(msg: WSMessage): msg is WSSubscribeResponse {
  return 'id' in msg && ('result' in msg || 'error' in msg);
}
