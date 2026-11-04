import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { Scheduler } from './scheduler.js';
import type { AlertStore } from '../store.js';
import type { AlertEvent } from '../types.js';

export interface ControlServerDeps {
  scheduler: Scheduler;
  store: AlertStore;
  notifier: (event: AlertEvent) => Promise<void> | void;
  /** Override for tests; defaults to process.pid. */
  pid?: number;
  /** Override for tests; defaults to Date.now() at start(). */
  now?: () => number;
}

export class ControlServer {
  private server?: Server;
  private port = 0;
  private startedAt = 0;
  private readonly deps: ControlServerDeps;

  constructor(deps: ControlServerDeps) {
    this.deps = deps;
  }

  async start(): Promise<{ port: number }> {
    if (this.server) return { port: this.port };

    this.startedAt = this.deps.now ? this.deps.now() : Date.now();
    const server = createServer((req, res) => {
      this.handle(req, res).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('control-plane handler crashed:', err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end();
        }
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      // 127.0.0.1-only bind is the entire access control. Anything that can
      // connect to loopback already has the same trust as our process.
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('control plane: address() returned no port');
    }

    this.server = server;
    this.port = addr.port;
    return { port: this.port };
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = undefined;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  getPort(): number {
    return this.port;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);

    if (req.method === 'GET' && url.pathname === '/status') {
      return this.json(res, 200, this.statusBody());
    }

    if (req.method === 'POST' && url.pathname === '/reload') {
      await this.deps.scheduler.reload();
      return this.json(res, 200, { ok: true });
    }

    const testFire = url.pathname.match(/^\/test-fire\/(.+)$/);
    if (req.method === 'POST' && testFire) {
      const ruleId = decodeURIComponent(testFire[1]);
      const rule = await this.deps.store.get(ruleId);
      if (!rule) return this.json(res, 404, { error: 'rule not found' });
      const event: AlertEvent = {
        ruleId: rule.id,
        ruleName: rule.name,
        category: rule.category,
        firedAt: new Date().toISOString(),
        reason: '[test] manual fire',
      };
      try {
        await this.deps.notifier(event);
      } catch (err) {
        return this.json(res, 502, {
          error: 'notifier failed',
          message: err instanceof Error ? err.message : String(err),
        });
      }
      return this.json(res, 200, { ok: true, event });
    }

    return this.json(res, 404, { error: 'not found' });
  }

  private json(res: ServerResponse, code: number, body: unknown): void {
    res.statusCode = code;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  }

  private statusBody() {
    const s = this.deps.scheduler.status();
    const now = this.deps.now ? this.deps.now() : Date.now();
    return {
      pid: this.deps.pid ?? process.pid,
      port: this.port,
      startedAt: this.startedAt,
      uptimeMs: now - this.startedAt,
      running: s.running,
      firedCount: s.firedCount,
      subscribedSymbols: s.subscribedSymbols,
      activePollers: s.activePollers,
    };
  }
}
