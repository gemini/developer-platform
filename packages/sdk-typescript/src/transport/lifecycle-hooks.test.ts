import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { boundaryValueKind } from "../utils/boundary-value.js";
import { HttpTransport, type RequestHookPayload, type ResponseHookPayload } from "./http.js";
import { streamingTextResponse } from "../tests/support/http-fixtures.js";

void describe("HttpTransport observability hooks", () => {
  it("invokes onRequest and onResponse hooks with structured payloads", async () => {
    const requests: RequestHookPayload[] = [];
    const responses: ResponseHookPayload[] = [];

    const mockFetch = async () => streamingTextResponse(
      JSON.stringify({ status: "ok" }),
      200,
      new Headers({ "content-type": "application/json" }),
    );

    const transport = new HttpTransport({
      env: "sandbox",
      fetchImpl: mockFetch,
      onRequest: (req) => requests.push(req),
      onResponse: (res) => responses.push(res),
    });

    const result = await transport.requestPublic({
      method: "GET",
      path: "/v1/symbols",
    });

    assert.deepEqual(result, { status: "ok" });
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.method, "GET");
    assert.equal(requests[0]?.url, "https://api.sandbox.gemini.com/v1/symbols");
    assert.equal(requests[0]?.endpoint, "/v1/symbols");
    assert.equal(requests[0]?.attempt, 0);
    assert.ok(requests[0]?.correlationId);

    assert.equal(responses.length, 1);
    assert.equal(responses[0]?.method, "GET");
    assert.equal(responses[0]?.status, 200);
    assert.equal(responses[0]?.endpoint, "/v1/symbols");
    assert.equal(responses[0]?.attempt, 0);
    assert.equal(boundaryValueKind(responses[0]?.durationMs), "number");
    assert.ok(responses[0]?.durationMs >= 0);
    assert.ok(responses[0]?.correlationId);
  });

  it("sanitizes query parameters from lifecycle hook URLs", async () => {
    const requests: RequestHookPayload[] = [];
    const responses: ResponseHookPayload[] = [];
    let fetchedUrl = "";

    const mockFetch = async (url: string) => {
      fetchedUrl = url;
      return streamingTextResponse(
        JSON.stringify({ status: "ok" }),
        200,
        new Headers({ "content-type": "application/json" }),
      );
    };

    const transport = new HttpTransport({
      env: "sandbox",
      fetchImpl: mockFetch,
      onRequest: (req) => requests.push(req),
      onResponse: (res) => responses.push(res),
    });

    await transport.requestPublic({
      method: "GET",
      path: "/v1/symbols",
      query: { symbol: "btcusd", token: "sensitive-token-value" },
    });

    assert.equal(fetchedUrl, "https://api.sandbox.gemini.com/v1/symbols?symbol=btcusd&token=sensitive-token-value");
    assert.equal(requests[0]?.url, "https://api.sandbox.gemini.com/v1/symbols");
    assert.equal(responses[0]?.url, "https://api.sandbox.gemini.com/v1/symbols");
    assert.ok(!requests[0]?.url.includes("sensitive-token-value"));
    assert.ok(!responses[0]?.url.includes("sensitive-token-value"));
  });

  it("passes correlationId, timestamp, and duration on errors", async () => {
    const responses: ResponseHookPayload[] = [];

    const mockFetch = async () => streamingTextResponse(
      JSON.stringify({ result: "error", reason: "InternalError" }),
      500,
      new Headers({ "content-type": "application/json" }),
    );

    const transport = new HttpTransport({
      env: "sandbox",
      fetchImpl: mockFetch,
      maxRetries: 0,
      onResponse: (res) => responses.push(res),
    });

    await assert.rejects(
      async () => {
        await transport.requestPublic({
          method: "GET",
          path: "/v1/symbols",
        });
      },
    );

    assert.equal(responses.length, 1);
    assert.equal(responses[0]?.status, 500);
    assert.ok(responses[0]?.correlationId);
  });
});
