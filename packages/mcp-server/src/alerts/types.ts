export const ALERT_CATEGORIES = [
  'price.threshold',
  'price.percent_change',
  'price.absolute_change',
  'balance.change',
  'order.filled',
  'order.stop_triggered',
  'funding_rate.threshold',
  'transfer.deposit_confirmed',
  'position.liquidation_risk',
  'prediction.settled',
] as const;

export type AlertCategory = (typeof ALERT_CATEGORIES)[number];

export type AlertDirection = 'above' | 'below';

export interface AlertRule {
  id: string;
  name: string;
  category: AlertCategory;
  enabled: boolean;
  oneShot: boolean;
  cooldownMs: number;
  params: Record<string, unknown>;
  createdAt: string;
  lastFiredAt: string | null;
}

export interface AlertEvent {
  ruleId: string;
  ruleName: string;
  category: AlertCategory;
  firedAt: string;
  reason: string;
  snapshot?: Record<string, unknown>;
}

export interface AlertsFile {
  version: 1;
  rules: AlertRule[];
}

export const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;
