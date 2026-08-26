// Generated from rest.yaml#Staking. Do not edit.

import type { HttpTransport } from "../../transport/http.js";
import type { RestPromise } from "../../transport/rest-promise.js";
import type { RequestOptions } from "../../utils/deadline.js";
import { executeRestOperation } from "../../transport/rest-operation.js";

import {
  STAKING_OPERATIONS,
  type StakingOperationTypes,
} from "./operations.js";

export class StakingRest {
  constructor(private readonly transport: HttpTransport) {}

  listStakingBalances(input?: StakingOperationTypes["listStakingBalances"]["input"], requestOptions?: RequestOptions): RestPromise<StakingOperationTypes["listStakingBalances"]["response"]> {
    const operation = STAKING_OPERATIONS["listStakingBalances"];
    return executeRestOperation<StakingOperationTypes["listStakingBalances"]>(this.transport, operation, input, requestOptions);
  }

  listStakingEventHistory(input?: StakingOperationTypes["listStakingEventHistory"]["input"], requestOptions?: RequestOptions): RestPromise<StakingOperationTypes["listStakingEventHistory"]["response"]> {
    const operation = STAKING_OPERATIONS["listStakingEventHistory"];
    return executeRestOperation<StakingOperationTypes["listStakingEventHistory"]>(this.transport, operation, input, requestOptions);
  }

  listStakingRates(requestOptions?: RequestOptions): RestPromise<StakingOperationTypes["listStakingRates"]["response"]> {
    const operation = STAKING_OPERATIONS["listStakingRates"];
    return executeRestOperation<StakingOperationTypes["listStakingRates"]>(this.transport, operation, undefined, requestOptions);
  }

  listStakingRewards(input: StakingOperationTypes["listStakingRewards"]["input"], requestOptions?: RequestOptions): RestPromise<StakingOperationTypes["listStakingRewards"]["response"]> {
    const operation = STAKING_OPERATIONS["listStakingRewards"];
    return executeRestOperation<StakingOperationTypes["listStakingRewards"]>(this.transport, operation, input, requestOptions);
  }

  stakeCryptoFunds(input: StakingOperationTypes["stakeCryptoFunds"]["input"], requestOptions?: RequestOptions): RestPromise<StakingOperationTypes["stakeCryptoFunds"]["response"]> {
    const operation = STAKING_OPERATIONS["stakeCryptoFunds"];
    return executeRestOperation<StakingOperationTypes["stakeCryptoFunds"]>(this.transport, operation, input, requestOptions);
  }

  unstakeCryptoFunds(input: StakingOperationTypes["unstakeCryptoFunds"]["input"], requestOptions?: RequestOptions): RestPromise<StakingOperationTypes["unstakeCryptoFunds"]["response"]> {
    const operation = STAKING_OPERATIONS["unstakeCryptoFunds"];
    return executeRestOperation<StakingOperationTypes["unstakeCryptoFunds"]>(this.transport, operation, input, requestOptions);
  }
}
