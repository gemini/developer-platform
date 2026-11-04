import type { SdkClient } from '../../client/sdk.js';
import type {
  PositionsResponse,
  SettledPositionsResponse,
  PredictionPosition,
  SettledPosition,
  CashedOutPosition,
} from '../../types/predictions.js';
import { mapContractMetadata } from './mappers.js';

type PredictionsService = SdkClient['predictions'];
type SdkPositionsResult = Awaited<ReturnType<PredictionsService['getPositions']>>;
type SdkSettledPositionsResult = Awaited<ReturnType<PredictionsService['getSettledPositions']>>;
type SdkPosition = NonNullable<SdkPositionsResult['positions']>[number];
type SdkSettledPosition = NonNullable<SdkSettledPositionsResult['positions']>[number];
type SdkCashedOutPosition = NonNullable<SdkSettledPositionsResult['cashOuts']>[number];

// Derived directly from the SDK's own method signatures rather than hand-declared, so
// the accepted `sort`/etc. literal unions can't silently drift from what the SDK (and
// the tool layer's Zod schemas, which already validate against the same enums) expect.
export type GetPositionsOptions = NonNullable<Parameters<PredictionsService['getPositions']>[0]>;
export type GetSettledPositionsOptions = NonNullable<
  Parameters<PredictionsService['getSettledPositions']>[0]
>;

// The SDK returns instrumentId/accountId as bigint (int64-precision fields) — stringify
// them so the existing Int64/string contracts hold and so wrapHandler's JSON.stringify
// doesn't throw (bigint isn't serializable by JSON.stringify at all, not just imprecise).
function mapPosition(p: SdkPosition): PredictionPosition {
  return {
    symbol: p.symbol!,
    instrumentId: p.instrumentId !== undefined ? p.instrumentId.toString() : '',
    totalQuantity: p.totalQuantity!,
    avgPrice: p.avgPrice!,
    outcome: p.outcome!,
    contractMetadata: mapContractMetadata(p.contractMetadata),
  };
}

function mapSettledPosition(p: SdkSettledPosition): SettledPosition {
  return {
    accountId: p.accountId !== undefined ? p.accountId.toString() : undefined,
    contractMetadata: mapContractMetadata(p.contractMetadata),
    costBasis: p.costBasis,
    instrumentId: p.instrumentId !== undefined ? p.instrumentId.toString() : undefined,
    instrumentSymbol: p.instrumentSymbol,
    netProfit: p.netProfit,
    outcome: p.outcome,
    payout: p.payout,
    position: p.position,
    positionQuantity: p.positionQuantity,
    realizedPnl: p.realizedPnl,
    resolutionSide: p.resolutionSide,
    settledAt: p.settledAt,
  };
}

function mapCashedOutPosition(p: SdkCashedOutPosition): CashedOutPosition {
  return {
    accountId: p.accountId.toString(),
    contractMetadata: mapContractMetadata(p.contractMetadata),
    costBasis: p.costBasis,
    filledQuantity: p.filledQuantity,
    instrumentId: p.instrumentId.toString(),
    instrumentSymbol: p.instrumentSymbol,
    netProfit: p.netProfit,
    proceeds: p.proceeds,
    side: p.side,
    timestamp: p.timestamp,
  };
}

export async function getPositions(
  client: SdkClient,
  opts: GetPositionsOptions = {}
): Promise<PositionsResponse> {
  const result = await client.predictions.getPositions(opts);
  return { positions: (result.positions ?? []).map(mapPosition) };
}

export async function getSettledPositions(
  client: SdkClient,
  opts: GetSettledPositionsOptions = {}
): Promise<SettledPositionsResponse> {
  const result = await client.predictions.getSettledPositions(opts);
  return {
    positions: result.positions?.map(mapSettledPosition),
    cashOuts: result.cashOuts?.map(mapCashedOutPosition),
    total: result.total ?? undefined,
    totalCostBasis: result.totalCostBasis,
    totalNetProfit: result.totalNetProfit,
    totalPayout: result.totalPayout,
    totalCashOutCostBasis: result.totalCashOutCostBasis,
    totalCashOutNetProfit: result.totalCashOutNetProfit,
    totalCashOutProceeds: result.totalCashOutProceeds,
  };
}
