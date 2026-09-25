import type { SdkClient } from '../../client/sdk.js';
import type {
  ListCombosResponse,
  ComboResponse,
  ComboLeg,
  ComboSummary,
  ComboSummaryLeg,
  CreateComboResponse,
} from '../../types/predictions.js';
import { mapContractMetadata } from './mappers.js';

type PredictionsService = SdkClient['predictions'];
type SdkListCombosResult = Awaited<ReturnType<PredictionsService['listCombos']>>;
type SdkComboResponse = SdkListCombosResult['combos'][number];
type SdkComboLeg = SdkComboResponse['legs'][number];
type SdkCreateComboResult = Awaited<ReturnType<PredictionsService['createCombo']>>;
type SdkComboSummary = SdkCreateComboResult['combo'];
type SdkComboSummaryLeg = SdkComboSummary['legs'][number];

// Kept as a hand-declared shape rather than derived from the SDK's own listCombos
// input type: the SDK types contractId as bigint|number (via Int64Input), but the
// existing tool schema/datasource contract keeps it a string — converted with
// BigInt() below, same "never Number(), it loses precision above 2^53" reasoning
// already applied to instrumentId/accountId in positions.ts.
export interface ListCombosOptions {
  status?: string;
  contractId?: string;
  instrumentRegistered?: boolean;
  limit?: number;
  offset?: number;
}

// comboId is bigint (int64-precision) — stringify it so the existing Int64/string
// contract holds and so wrapHandler's JSON.stringify doesn't throw (bigint isn't
// serializable by JSON.stringify at all, not just imprecise). contractId stays a
// plain string on the SDK side too — no conversion needed, distinct from the
// bigint|number contractId filter on the listCombos request above.
function mapComboLeg(leg: SdkComboLeg): ComboLeg {
  return {
    comboId: leg.comboId.toString(),
    contract: mapContractMetadata(leg.contract),
    contractId: leg.contractId,
    legIndex: leg.legIndex,
    requiredOutcome: leg.requiredOutcome,
    // ComboLeg.legOutcome is typed as a loose `string | null` on the SDK side (unlike
    // ComboSummaryLeg's, which is a proper "Yes"|"No" enum) — the wire format is
    // documented as always "Yes"/"No"/absent, matching the existing local type.
    legOutcome: (leg.legOutcome ?? undefined) as 'Yes' | 'No' | undefined,
    resolvedAt: leg.resolvedAt ?? undefined,
  };
}

function mapComboResponse(r: SdkComboResponse): ComboResponse {
  return {
    contract: mapContractMetadata(r.contract)!,
    legs: r.legs.map(mapComboLeg),
  };
}

// ComboSummaryLeg is structurally identical to ComboLeg (confirmed against the SDK's
// generated spec) — SdkComboSummaryLeg's slightly stricter legOutcome/contract types
// are assignable into mapComboLeg's parameter type, so there's no need to duplicate
// the mapping logic.
function mapComboSummaryLeg(leg: SdkComboSummaryLeg): ComboSummaryLeg {
  return mapComboLeg(leg);
}

function mapComboSummary(s: SdkComboSummary): ComboSummary {
  return {
    canonicalLegKey: s.canonicalLegKey,
    createdAt: s.createdAt,
    displayName: s.displayName,
    id: s.id.toString(),
    instrumentId: s.instrumentId !== undefined ? s.instrumentId.toString() : undefined,
    instrumentRegistered: s.instrumentRegistered,
    instrumentSymbol: s.instrumentSymbol,
    latestExpiryDate: s.latestExpiryDate,
    legCount: s.legCount,
    legs: s.legs.map(mapComboSummaryLeg),
    status: s.status,
    updatedAt: s.updatedAt,
  };
}

export async function listCombos(
  client: SdkClient,
  opts: ListCombosOptions = {}
): Promise<ListCombosResponse> {
  const result = await client.predictions.listCombos({
    status: opts.status,
    contractId: opts.contractId !== undefined ? BigInt(opts.contractId) : undefined,
    instrumentRegistered: opts.instrumentRegistered,
    limit: opts.limit,
    offset: opts.offset,
  });
  return {
    combos: result.combos.map(mapComboResponse),
    // limit/offset are optional on the SDK's generated Pagination type, but the real
    // API always returns them on a listing response — same trust the legacy client
    // already placed in this shape (it passed the raw parsed response straight
    // through with no runtime validation at all).
    pagination: {
      limit: result.pagination.limit!,
      offset: result.pagination.offset!,
      total: result.pagination.total,
    },
  };
}

export async function getCombo(client: SdkClient, instrumentSymbol: string): Promise<ComboResponse> {
  const result = await client.predictions.getComboByInstrumentSymbol({ instrumentSymbol });
  return mapComboResponse(result);
}

export async function createCombo(
  client: SdkClient,
  legs: Array<{ contractId: string; requiredOutcome: 'Yes' | 'No' }>
): Promise<CreateComboResponse> {
  const result = await client.predictions.createCombo({ legs });
  return {
    alreadyExisted: result.alreadyExisted,
    combo: mapComboSummary(result.combo),
  };
}
