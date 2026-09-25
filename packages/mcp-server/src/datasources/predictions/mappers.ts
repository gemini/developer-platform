import type { SdkClient } from '../../client/sdk.js';
import type { ContractMetadata } from '../../types/predictions.js';

type PredictionsService = SdkClient['predictions'];
type SdkPositionsResult = Awaited<ReturnType<PredictionsService['getPositions']>>;
type SdkPosition = NonNullable<SdkPositionsResult['positions']>[number];
// Widened with `| null`: Position.contractMetadata is only ever undefined, but combo
// legs' `contract` field (a different embedding of the same ContractMetadata schema)
// is typed nullable on the SDK side — one shared mapper needs to accept both.
export type SdkContractMetadata = SdkPosition['contractMetadata'] | null;

// Shared across every prediction datasource that embeds contract metadata (positions,
// combos, ...). The SDK marks contract metadata's identifying fields optional; a real
// contract response always has them, matching the level of trust the legacy client
// already placed in this shape (no runtime validation there either).
export function mapContractMetadata(meta: SdkContractMetadata): ContractMetadata | undefined {
  if (!meta) return undefined;
  return {
    contractId: meta.contractId!,
    contractName: meta.contractName!,
    eventTicker: meta.eventTicker!,
    eventName: meta.eventName!,
    category: meta.category!,
  };
}
