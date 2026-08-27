import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { boundaryValueKind } from "../utils/boundary-value.js";
import { GeminiMarkets } from "./server.js";
import { OrderBook } from "../services/market-data/orderbook.js";

void describe("Async and sync disposal (Symbol.dispose / Symbol.asyncDispose)", () => {
  it("disposes GeminiMarkets cleanly via Symbol.dispose and Symbol.asyncDispose", async () => {
    const client = new GeminiMarkets({ env: "sandbox" });
    assert.equal(boundaryValueKind(client[Symbol.dispose]), "function");
    assert.equal(boundaryValueKind(client[Symbol.asyncDispose]), "function");

    // Sync disposal
    client[Symbol.dispose]();

    // Async disposal
    await client[Symbol.asyncDispose]();
  });

  it("requires an explicit environment instead of defaulting to production", () => {
    assert.throws(
      () => new GeminiMarkets({} as never),
      /env is required; choose "sandbox" or "production"/,
    );
  });

  it("disposes OrderBook cleanly via Symbol.dispose and Symbol.asyncDispose", async () => {
    let closed = false;
    const book = new OrderBook("btcusd", {
      onClose: () => {
        closed = true;
      },
    });

    assert.equal(boundaryValueKind(book[Symbol.dispose]), "function");
    assert.equal(boundaryValueKind(book[Symbol.asyncDispose]), "function");

    book[Symbol.dispose]();
    assert.equal(closed, true);
    assert.equal(book.isClosed(), true);
  });
});
