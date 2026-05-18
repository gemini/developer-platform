import type { AlertCategory } from '../types.js';
import type { AnyCategoryDef } from './spec.js';
import { priceThreshold, pricePercentChange, priceAbsoluteChange } from './price.js';
import { balanceChange } from './balance.js';
import { orderFilled, orderStopTriggered } from './order.js';
import { fundingRateThreshold } from './funding.js';
import { transferDepositConfirmed } from './transfer.js';
import { positionLiquidationRisk } from './position.js';
import { predictionSettled } from './prediction.js';

const REGISTRY: Record<AlertCategory, AnyCategoryDef> = {
  'price.threshold': priceThreshold as AnyCategoryDef,
  'price.percent_change': pricePercentChange as AnyCategoryDef,
  'price.absolute_change': priceAbsoluteChange as AnyCategoryDef,
  'balance.change': balanceChange as AnyCategoryDef,
  'order.filled': orderFilled as AnyCategoryDef,
  'order.stop_triggered': orderStopTriggered as AnyCategoryDef,
  'funding_rate.threshold': fundingRateThreshold as AnyCategoryDef,
  'transfer.deposit_confirmed': transferDepositConfirmed as AnyCategoryDef,
  'position.liquidation_risk': positionLiquidationRisk as AnyCategoryDef,
  'prediction.settled': predictionSettled as AnyCategoryDef,
};

export function getCategoryDef(category: AlertCategory): AnyCategoryDef {
  return REGISTRY[category];
}

export function listCategoryDefs(): AnyCategoryDef[] {
  return Object.values(REGISTRY);
}

export type { AnyCategoryDef, CategoryDef, CategoryEvalResult } from './spec.js';
