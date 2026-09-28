import { z } from 'zod';
import type { SdkClient } from '../../client/sdk.js';
import type { ToolDefinition } from '../index.js';
import { wrapHandler } from '../index.js';
import * as predictions from '../../datasources/predictions/combos.js';

export function createPredictionComboTools(sdkClient: SdkClient): ToolDefinition[] {
  return [
    {
      name: 'gemini_list_prediction_combos',
      description:
        'List multi-leg combo contracts on Gemini. A combo bundles 2-6 underlying prediction ' +
        'market contracts, each with a required outcome, into a single tradeable instrument. ' +
        'Defaults to Active combos when status is not specified.',
      inputSchema: z.object({
        status: z.string().optional().describe('Filter by combo status (e.g. Active, Settled, Voided). Defaults to Active.'),
        contractId: z.string().optional().describe('Filter to combos containing this underlying contract ID as a leg'),
        instrumentRegistered: z.boolean().optional().describe('Filter by whether the combo has a registered tradeable instrument symbol'),
        limit: z.number().min(1).max(500).optional().describe('Number of results (max 500)'),
        offset: z.number().min(0).optional().describe('Pagination offset'),
      }),
      handler: wrapHandler((args) => predictions.listCombos(sdkClient, args)),
    },
    {
      name: 'gemini_get_prediction_combo',
      description: 'Get the legs and contract metadata for a single combo by its instrument symbol.',
      inputSchema: z.object({
        instrumentSymbol: z.string().describe('Combo instrument symbol'),
      }),
      handler: wrapHandler(({ instrumentSymbol }) => predictions.getCombo(sdkClient, instrumentSymbol)),
    },
    {
      name: 'gemini_create_prediction_combo',
      description:
        'Register a canonical combo contract for a set of 2-6 underlying contract legs, or ' +
        'retrieve the existing one if this exact set of legs was already registered ' +
        '(alreadyExisted: true). This does NOT place a trade and moves no funds — it only ' +
        'registers the combo so it can be discovered and traded as a single instrument. Leg ' +
        'order does not create a distinct combo; the service canonicalizes the complete leg ' +
        'set. Once registered with an instrument symbol, trade it using gemini_place_prediction_order ' +
        'with that symbol.',
      inputSchema: z.object({
        legs: z
          .array(
            z.object({
              contractId: z.string().describe('Underlying contract ID as a decimal string'),
              requiredOutcome: z.enum(['Yes', 'No']).describe('Outcome this leg must settle for the combo to settle YES'),
            })
          )
          .min(2)
          .max(6)
          .describe('2-6 distinct underlying contract legs')
          .refine(
            (legs) => new Set(legs.map((l) => l.contractId)).size === legs.length,
            { message: 'legs must not contain duplicate contractIds' }
          ),
      }),
      handler: wrapHandler((args) => predictions.createCombo(sdkClient, args.legs)),
      mutates: 'write',
    },
  ];
}
