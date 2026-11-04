import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PredictionMarkets } from "./predictions.js";
import { HttpTransport, type AuthStrategy } from "../transport/http.js";
import { isBoundaryObject, isBoundaryString } from "../utils/boundary-value.js";
import { streamingTextResponse } from "../tests/support/http-fixtures.js";

void describe("PredictionMarkets auto-paginating iterators", () => {
  it("iterates positions across multiple pages", async () => {
    let callCount = 0;
    const requests: Array<{ method: string | undefined; url: string }> = [];
    const mockFetch = async (url: string, init?: RequestInit) => {
      callCount++;
      requests.push({ method: init?.method, url });
      const u = new URL(url);
      const offset = Number(u.searchParams.get("offset") ?? "0");

      if (offset === 0) {
        return streamingTextResponse(
          '{"positions":[{"symbol":"POS-1","instrumentId":9007199254740993,"totalQuantity":"10"},{"symbol":"POS-2","totalQuantity":"20"}]}',
          200,
          new Headers({ "content-type": "application/json" }),
        );
      }

      return streamingTextResponse(JSON.stringify({
          positions: [
            { symbol: "POS-3", totalQuantity: "30" },
          ],
        }), 200, new Headers({ "content-type": "application/json" }));
    };

    const dummyAuth: AuthStrategy = {
      nextNonce: () => undefined,
      credentialHeaders: async () => ({ Authorization: "Bearer test" }),
    };

    const transport = new HttpTransport({
      env: "sandbox",
      fetchImpl: mockFetch,
      auth: dummyAuth,
    });

    const pm = new PredictionMarkets(transport);
    const collected: string[] = [];

    for await (const pos of pm.iteratePositions({}, { limit: 2 })) {
      if (!isBoundaryObject(pos) || !isBoundaryString(pos.symbol)) throw new Error("position fixture is missing symbol");
      collected.push(pos.symbol);
    }

    assert.deepEqual(collected, ["POS-1", "POS-2", "POS-3"]);
    assert.equal(callCount, 2);
    assert.deepEqual(requests.map(({ method, url }) => ({
      method,
      path: new URL(url).pathname,
      offset: new URL(url).searchParams.get("offset"),
    })), [
      { method: "POST", path: "/v1/prediction-markets/positions", offset: "0" },
      { method: "POST", path: "/v1/prediction-markets/positions", offset: "2" },
    ]);
  });

  it("rejects time-bounded order history pagination before making a request", async () => {
    let callCount = 0;
    const transport = new HttpTransport({
      env: "production",
      fetchImpl: async () => {
        callCount++;
        throw new Error("should not fetch");
      },
    });
    const pm = new PredictionMarkets(transport);

    await assert.rejects(
      (async () => {
        for await (const _order of pm.iterateOrderHistory({ from: 1700000000n })) {
          // The iterator must fail before entering the loop body.
        }
      })(),
      /cannot paginate when from or to is supplied/,
    );
    assert.equal(callCount, 0);
  });

  it("iterates prediction events across pages using data key", async () => {
    let callCount = 0;
    const mockFetch = async (url: string) => {
      callCount++;
      const u = new URL(url);
      const offset = Number(u.searchParams.get("offset") ?? "0");

      if (offset === 0) {
        return streamingTextResponse(JSON.stringify({
            data: [
              { id: "EV-1", title: "Event 1" },
              { id: "EV-2", title: "Event 2" },
            ],
            pagination: { limit: 2, offset: 0, total: 3 },
          }), 200, new Headers({ "content-type": "application/json" }));
      }

      return streamingTextResponse(JSON.stringify({
          data: [
            { id: "EV-3", title: "Event 3" },
          ],
          pagination: { limit: 2, offset: 2, total: 3 },
        }), 200, new Headers({ "content-type": "application/json" }));
    };

    const transport = new HttpTransport({
      env: "production",
      fetchImpl: mockFetch,
    });

    const pm = new PredictionMarkets(transport);
    const collected: string[] = [];

    for await (const ev of pm.iterateEvents({}, { limit: 2 })) {
      if (!isBoundaryObject(ev) || !isBoundaryString(ev.id)) throw new Error("event fixture is missing id");
      collected.push(ev.id);
    }

    assert.deepEqual(collected, ["EV-1", "EV-2", "EV-3"]);
    assert.equal(callCount, 2);
  });

  it("iterates combos across pages using combos key", async () => {
    let callCount = 0;
    const mockFetch = async (url: string) => {
      callCount++;
      const u = new URL(url);
      const offset = Number(u.searchParams.get("offset") ?? "0");

      return streamingTextResponse(JSON.stringify({
          combos: offset === 0
            ? [{ contract: { contractTicker: "COMBO-1" }, legs: [] }, { contract: { contractTicker: "COMBO-2" }, legs: [] }]
            : [{ contract: { contractTicker: "COMBO-3" }, legs: [] }],
          pagination: { limit: 2, offset, total: 3 },
        }), 200, new Headers({ "content-type": "application/json" }));
    };

    const transport = new HttpTransport({
      env: "production",
      fetchImpl: mockFetch,
    });

    const pm = new PredictionMarkets(transport);
    const collected: string[] = [];

    for await (const combo of pm.iterateCombos({}, { limit: 2 })) {
      collected.push(combo.contract?.contractTicker ?? "");
    }

    assert.deepEqual(collected, ["COMBO-1", "COMBO-2", "COMBO-3"]);
    assert.equal(callCount, 2);
  });

  it("iterates active orders across pages using orders key", async () => {
    let callCount = 0;
    const mockFetch = async (_url: string, init?: RequestInit) => {
      callCount++;
      const headers = init?.headers;
      let rawPayload = "";
      if (headers instanceof Headers) {
        rawPayload = headers.get("X-GEMINI-PAYLOAD") ?? "";
      } else if (headers) {
        rawPayload = new Headers(headers).get("X-GEMINI-PAYLOAD") ?? "";
      }
      const body = rawPayload
        ? JSON.parse(Buffer.from(rawPayload, "base64").toString("utf-8"))
        : {};
      const offset = body.offset ?? 0;

      return streamingTextResponse(JSON.stringify({
          orders: offset === 0 ? [{ orderId: "101" }, { orderId: "102" }] : [{ orderId: "103" }],
          pagination: { limit: 2, offset, total: 3 },
        }), 200, new Headers({ "content-type": "application/json" }));
    };

    const dummyAuth: AuthStrategy = {
      nextNonce: () => undefined,
      credentialHeaders: async () => ({ Authorization: "Bearer test" }),
    };

    const transport = new HttpTransport({
      env: "sandbox",
      fetchImpl: mockFetch,
      auth: dummyAuth,
    });

    const pm = new PredictionMarkets(transport);
    const collected: string[] = [];

    for await (const order of pm.iterateActiveOrders({}, { limit: 2 })) {
      collected.push(String(order.orderId));
    }

    assert.deepEqual(collected, ["101", "102", "103"]);
    assert.equal(callCount, 2);
  });
});
