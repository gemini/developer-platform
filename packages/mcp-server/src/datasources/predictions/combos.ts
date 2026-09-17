import type { GeminiHttpClient } from '../../client/http.js';
import type { ListCombosResponse, ComboResponse, CreateComboResponse } from '../../types/predictions.js';

export async function listCombos(
  client: GeminiHttpClient,
  opts: { status?: string; contractId?: string; instrumentRegistered?: boolean; limit?: number; offset?: number } = {}
): Promise<ListCombosResponse> {
  const params: Record<string, string> = {};
  if (opts.status) params['status'] = opts.status;
  if (opts.contractId) params['contractId'] = opts.contractId;
  if (opts.instrumentRegistered !== undefined) params['instrumentRegistered'] = String(opts.instrumentRegistered);
  if (opts.limit !== undefined) params['limit'] = String(opts.limit);
  if (opts.offset !== undefined) params['offset'] = String(opts.offset);
  return client.publicGet<ListCombosResponse>('/v1/prediction-markets/combos', params);
}

export async function getCombo(
  client: GeminiHttpClient,
  instrumentSymbol: string
): Promise<ComboResponse> {
  return client.publicGet<ComboResponse>(`/v1/prediction-markets/combos/${instrumentSymbol}`);
}

export async function createCombo(
  client: GeminiHttpClient,
  legs: Array<{ contractId: string; requiredOutcome: 'Yes' | 'No' }>
): Promise<CreateComboResponse> {
  return client.authenticatedPost<CreateComboResponse>('/v1/prediction-markets/combos', { legs });
}
