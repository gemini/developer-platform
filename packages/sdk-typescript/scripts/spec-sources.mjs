import { createHash } from "node:crypto";

export const PUBLISHED_SPECS = Object.freeze({
  rest: "https://developer.gemini.com/specs/openapi/rest.yaml",
  predictionMarkets: "https://developer.gemini.com/specs/openapi/prediction-markets.yaml",
  websocket: "https://developer.gemini.com/specs/asyncapi/websocket.yaml",
});

// Update these values only in a reviewed change that also updates generated output.
const PUBLISHED_SPEC_SHA256 = Object.freeze({
  [PUBLISHED_SPECS.rest]: "79a0dc4061f3942dca8b30a589bbd406c781d2c6c19283d87cb21177afdcab5e",
  [PUBLISHED_SPECS.predictionMarkets]: "0c70a976f4553ae39d14d6851416cb974f081919216b94ebd851f044d108cfe7",
  [PUBLISHED_SPECS.websocket]: "72910c6993db03ada3aaf7de4f6c0c3bb56d74148c77407e9a96a121ab333feb",
});

export async function loadPublishedSpecText(specUrl) {
  const expectedHash = PUBLISHED_SPEC_SHA256[specUrl];
  if (!expectedHash) throw new Error(`Unallowlisted published specification URL: ${specUrl}`);
  const response = await fetch(specUrl);
  if (!response.ok) throw new Error(`Failed to fetch spec: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== expectedHash) {
    throw new Error(`Published specification hash mismatch for ${specUrl}: expected ${expectedHash}, got ${actualHash}`);
  }
  return bytes.toString("utf8");
}
