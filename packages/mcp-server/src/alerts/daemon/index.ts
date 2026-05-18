#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from '../../config.js';
import { GeminiHttpClient } from '../../client/http.js';
import { WebSocketManager } from '../../websocket/manager.js';
import { MarketDataStore } from '../../store/index.js';
import { AlertStore } from '../store.js';
import { Scheduler, type SchedulerFetchers, type SchedulerWsAdapter } from './scheduler.js';
import { ControlServer } from './control.js';
import { createNotifier, probeNotifier } from '../notifier/index.js';
import { MACOS_SENDER_BUNDLE_ID } from '../notifier/macos-sender.js';
import { writeDaemonMeta, deleteDaemonMeta } from '../ipc.js';
import { appendAlertEvent } from '../log.js';
import * as funds from '../../datasources/funds.js';
import * as orders from '../../datasources/orders.js';
import * as market from '../../datasources/market.js';
import * as margin from '../../datasources/margin.js';
import * as predictions from '../../datasources/predictions.js';
import type { BalanceSnapshot } from '../categories/balance.js';
import type { OrderRecord } from '../categories/order.js';
import type { TransferRecord } from '../categories/transfer.js';
import type { FundingRateSnapshot } from '../categories/funding.js';
import type { PositionSnapshot } from '../categories/position.js';
import type { PredictionSnapshot, PredictionEventRecord } from '../categories/prediction.js';

function resolveIconPath(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '..', '..', '..', 'assets', 'gemini-mcp-256.png'),
    join(here, '..', '..', '..', 'assets', 'gemini-mcp.ico'),
  ];
  return candidates.find((p) => existsSync(p));
}

function buildFetchers(client: GeminiHttpClient): SchedulerFetchers {
  return {
    balances: async (): Promise<BalanceSnapshot[]> => {
      const all = await funds.getBalances(client);
      // Use `available` as the comparable balance — `amount` includes
      // pending/locked, which moves around without user action.
      return all.map((b) => ({ currency: b.currency, balance: b.available }));
    },

    orders: async (): Promise<OrderRecord[]> => {
      const active = await orders.getActiveOrders(client);
      // Limitation: getActiveOrders typically excludes terminal-state orders.
      // For order.filled detection we rely on the brief window where Gemini
      // returns is_live=false in the active list. A future improvement is to
      // diff order ids across polls and call getOrderStatus on disappearances.
      return active.map((o) => ({
        order_id: o.order_id,
        client_order_id: o.client_order_id,
        symbol: o.symbol,
        is_live: o.is_live,
        is_cancelled: o.is_cancelled,
        executed_amount: o.executed_amount,
        remaining_amount: o.remaining_amount,
        original_amount: o.original_amount,
        stop_price: undefined,
      }));
    },

    transfers: async (): Promise<TransferRecord[]> => {
      const list = await funds.getTransfers(client);
      return list.map((t) => ({
        type: t.type,
        status: t.status,
        currency: t.currency,
        amount: t.amount,
        eid: t.eid,
        timestampms: t.timestampms,
      }));
    },

    fundingRate: async (symbol: string): Promise<FundingRateSnapshot> => {
      const raw = await market.getCurrentFundingRate(client, symbol);
      const rate = (raw.fundingRate ?? raw.funding_rate ?? raw.rate) as string | number | undefined;
      return { symbol, fundingRate: String(rate ?? '0') };
    },

    positions: async (): Promise<PositionSnapshot[]> => {
      const raw = await margin.getOpenPositions(client);
      return raw
        .map((p): PositionSnapshot | null => {
          const symbol = (p.symbol ?? p.instrument) as string | undefined;
          const pct = (p.marginPctRemaining ?? p.percentRemaining) as number | undefined;
          if (!symbol || typeof pct !== 'number') return null;
          return {
            symbol,
            marginPctRemaining: pct,
            liquidationPrice: p.liquidationPrice as string | undefined,
            currentPrice: p.markPrice as string | undefined,
          };
        })
        .filter((s): s is PositionSnapshot => s !== null);
    },

    predictionsSettled: async (): Promise<PredictionSnapshot> => {
      const resp = await predictions.listRecentlySettled(client);
      const events: PredictionEventRecord[] = resp.data.map((e) => ({
        id: e.id,
        ticker: e.ticker,
        status: e.status,
        settlementValue: e.settlementValue,
        settlementTime: e.settlementTime,
      }));
      return { events };
    },
  };
}

function buildWsAdapter(wsManager: WebSocketManager): SchedulerWsAdapter {
  return {
    subscribe: async (symbol: string) => {
      await wsManager.subscribe(symbol, 'trade');
    },
    unsubscribe: async (symbol: string) => {
      await wsManager.unsubscribe(symbol, 'trade');
    },
  };
}

async function main(): Promise<void> {
  const httpClient = new GeminiHttpClient();
  const marketStore = new MarketDataStore();
  const wsManager = new WebSocketManager(config.wsUrl, marketStore);
  await wsManager.initialize();

  const store = new AlertStore();
  const fetchers = buildFetchers(httpClient);
  const wsAdapter = buildWsAdapter(wsManager);

  const iconPath = resolveIconPath();
  const probe = probeNotifier({ appID: 'Gemini.MCP.Alerts' });
  for (const warning of probe.warnings) {
    console.error(`[notifier] ${warning}`);
  }
  const notifier = createNotifier({
    iconPath,
    appID: 'Gemini.MCP.Alerts',
    macosSender: process.platform === 'darwin' ? MACOS_SENDER_BUNDLE_ID : undefined,
  });

  const scheduler = new Scheduler({
    store,
    marketStore,
    fetchers,
    ws: wsAdapter,
    notifier,
    logger: (event) => appendAlertEvent(event),
  });

  const control = new ControlServer({ scheduler, store, notifier });
  const { port } = await control.start();
  await scheduler.start();

  await writeDaemonMeta({
    pid: process.pid,
    port,
    startedAt: Date.now(),
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(`[daemon] received ${signal}, shutting down`);
    await deleteDaemonMeta();
    await control.stop();
    await scheduler.stop();
    wsManager.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    console.error('[daemon] uncaughtException:', err);
  });
  process.on('unhandledRejection', (err) => {
    console.error('[daemon] unhandledRejection:', err);
  });

  console.error(
    `[daemon] gemini-mcp-alerts ready: pid=${process.pid} port=${port} platform=${process.platform}`,
  );
}

main().catch((err) => {
  console.error('[daemon] fatal:', err);
  process.exit(1);
});
