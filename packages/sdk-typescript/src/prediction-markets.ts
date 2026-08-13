import { AcceptTermsRequired } from "./errors.js";
import { validateRequestBody } from "./core/request-validation.js";
import { PredictionMarketsRest } from "./generated/rest.js";
import type { PredictionMarketOperationTypes } from "./generated/operations.js";
import type { RequestOptions } from "./core/deadline.js";

export class PredictionMarkets extends PredictionMarketsRest {
  acceptTerms(requestOptions?: RequestOptions) {
    return this.acceptPredictionMarketsTerms(requestOptions);
  }

  override async placeOrder(body: PredictionMarketOperationTypes["placeOrder"]["body"], requestOptions?: RequestOptions) {
    validateRequestBody("predictionMarkets.placeOrder", body);
    await this.requireAcceptedTerms(requestOptions);
    return super.placeOrder(body, requestOptions);
  }

  override async placeOrderBatch(body: PredictionMarketOperationTypes["placeOrderBatch"]["body"], requestOptions?: RequestOptions) {
    validateRequestBody("predictionMarkets.placeOrderBatch", body);
    await this.requireAcceptedTerms(requestOptions);
    return super.placeOrderBatch(body, requestOptions);
  }

  private async requireAcceptedTerms(requestOptions?: RequestOptions): Promise<void> {
    const status = await this.getPredictionMarketsTermsStatus(requestOptions);
    if (!status.hasAcceptedLatest) {
      throw new AcceptTermsRequired({
        status: 403,
        reason: "AcceptTermsRequired",
        message: "Prediction Markets terms must be accepted before placing orders",
        body: status,
      });
    }
  }
}
