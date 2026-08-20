#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillFile = path.join(__dirname, 'SKILL.md');
const refFile = path.join(__dirname, 'reference.md');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
  }
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf-8');
}

function extractJsonFenceAfter(content, marker) {
  const markerIndex = content.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Missing section: ${marker}`);
  const match = content.slice(markerIndex).match(/```json\n([\s\S]*?)\n```/);
  assert.ok(match, `Missing JSON example after: ${marker}`);
  return JSON.parse(match[1]);
}

console.log('\n======================================================');
console.log('  EVALUATION HARNESS: integrate-gemini Skill');
console.log('======================================================\n');

// ----------------------------------------------------
// 1. Skill File Structure & Frontmatter Validation
// ----------------------------------------------------
console.log('1. Skill Structure & Frontmatter Checks');

runTest('SKILL.md exists and is non-empty', () => {
  assert.ok(fs.existsSync(skillFile), 'SKILL.md does not exist');
  const content = fs.readFileSync(skillFile, 'utf-8');
  assert.ok(content.length > 500, 'SKILL.md content is too short');
});

runTest('SKILL.md contains valid YAML frontmatter with correct name', () => {
  const content = fs.readFileSync(skillFile, 'utf-8');
  const frontmatterMatch = content.match(/^---\n([\s\S]+?)\n---/);
  assert.ok(frontmatterMatch, 'Missing frontmatter delimiter');
  assert.match(frontmatterMatch[1], /^name:\s*integrate-gemini\s*$/m);
  assert.match(frontmatterMatch[1], /^description:\s*.+$/m);
  assert.match(frontmatterMatch[1], /^argument-hint:\s*.+$/m);
});

runTest('reference.md exists and contains code samples', () => {
  assert.ok(fs.existsSync(refFile), 'reference.md does not exist');
  const content = fs.readFileSync(refFile, 'utf-8');
  assert.ok(content.includes('import hmac'), 'Missing Python HMAC code sample');
  assert.ok(content.includes('wss://ws.sandbox.gemini.com'), 'Missing ws.sandbox.gemini.com endpoint');
});

// ----------------------------------------------------
// 2. Legacy Endpoint Exclusion & Canonical Endpoint Check
// ----------------------------------------------------
console.log('\n2. Anti-Legacy & Canonical Endpoint Checks');

runTest('SKILL.md does NOT contain legacy v2/marketdata or v1/order/events', () => {
  const content = fs.readFileSync(skillFile, 'utf-8');
  assert.ok(!content.includes('v2/marketdata'), 'Found forbidden legacy endpoint v2/marketdata');
  assert.ok(!content.includes('v1/order/events'), 'Found forbidden legacy endpoint v1/order/events');
});

runTest('reference.md does NOT contain legacy v2/marketdata or v1/order/events', () => {
  const content = fs.readFileSync(refFile, 'utf-8');
  assert.ok(!content.includes('v2/marketdata'), 'Found forbidden legacy endpoint v2/marketdata in reference.md');
  assert.ok(!content.includes('v1/order/events'), 'Found forbidden legacy endpoint v1/order/events in reference.md');
});

runTest('Skill documents canonical wss://ws.gemini.com endpoint', () => {
  const skillContent = fs.readFileSync(skillFile, 'utf-8');
  const refContent = fs.readFileSync(refFile, 'utf-8');
  assert.ok(skillContent.includes('wss://ws.gemini.com'), 'SKILL.md missing wss://ws.gemini.com');
  assert.ok(refContent.includes('wss://ws.gemini.com'), 'reference.md missing wss://ws.gemini.com');
});

// ----------------------------------------------------
// 3. Canonical Endpoint and Product Guidance
// ----------------------------------------------------
console.log('\n3. Canonical Endpoint and Product Guidance');

runTest('skill points to the published spec catalog and canonical URLs', () => {
  const skillContent = readText(skillFile);
  assert.ok(skillContent.includes('https://developer.gemini.com/specs/index.json'));
  assert.ok(skillContent.includes('https://developer.gemini.com/specs/openapi/rest.yaml'));
  assert.ok(skillContent.includes('https://developer.gemini.com/specs/asyncapi/websocket.yaml'));
  assert.ok(skillContent.includes('https://developer.gemini.com/specs/openapi/prediction-markets.yaml'));
  assert.ok(!skillContent.includes('file:///Users/'), 'Skill contains a machine-specific file URL');
});

runTest('skill does not claim a local apis/ directory that does not exist in this repo', () => {
  const skillContent = readText(skillFile);
  const referenceContent = readText(refFile);
  const repoHasApisDir = fs.existsSync(path.join(__dirname, '..', '..', 'apis'));
  assert.ok(!repoHasApisDir, 'apis/ now exists in the repo — the skill can reference it again');
  assert.ok(!skillContent.includes('apis/rest.yaml'), 'SKILL.md references a nonexistent apis/ directory');
  assert.ok(!referenceContent.includes('apis/rest.yaml'), 'reference.md references a nonexistent apis/ directory');
});

runTest('skill separates Prediction Markets REST guidance', () => {
  const skillContent = readText(skillFile);
  const referenceContent = readText(refFile);
  assert.ok(skillContent.includes('/v1/prediction-markets/order'));
  assert.ok(referenceContent.includes('/v1/prediction-markets/order'));
});

// ----------------------------------------------------
// 4. Crypto Signature Logic Verification (Unit Test)
// ----------------------------------------------------
console.log('\n4. Authentication Crypto Logic Verification');

runTest('HMAC-SHA384 implementation matches the RFC 4231 test vector', () => {
  const key = Buffer.alloc(20, 0x0b);
  const computedSignature = crypto
    .createHmac('sha384', key)
    .update('Hi There')
    .digest('hex');

  assert.equal(
    computedSignature,
    'afd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59cfaea9ea9076ede7f4af152e8b2fa9cb6'
  );
});

// ----------------------------------------------------
// 5. WebSocket Envelope Validation
// ----------------------------------------------------
console.log('\n5. WebSocket Envelope Validation');

runTest('SUBSCRIBE frame matches AsyncAPI spec schema', () => {
  const subFrame = extractJsonFenceAfter(readText(skillFile), '#### Stream Subscription Format');

  assert.equal(subFrame.method, 'SUBSCRIBE');
  assert.ok(Array.isArray(subFrame.params));
  assert.equal(typeof subFrame.id, 'number');
  assert.ok(subFrame.params.includes('orders@account'));
});

runTest('order.place example matches the documented WebSocket order schema', () => {
  const placeFrame = extractJsonFenceAfter(readText(skillFile), '#### Executing Orders over WebSocket');
  const params = placeFrame.params;

  assert.equal(placeFrame.method, 'order.place');
  for (const requiredField of ['symbol', 'side', 'type', 'timeInForce', 'price', 'quantity', 'clientOrderId']) {
    assert.ok(Object.hasOwn(params, requiredField), `Missing required field: ${requiredField}`);
  }
  assert.ok(['BUY', 'SELL'].includes(params.side));
  assert.ok(['LIMIT', 'MARKET'].includes(params.type));
  assert.ok(['GTC', 'IOC', 'FOK', 'MOC'].includes(params.timeInForce));
  assert.equal(typeof params.quantity, 'string');
  assert.equal(typeof params.clientOrderId, 'string');
  assert.ok(!Object.hasOwn(params, 'amount'));
  assert.ok(!Object.hasOwn(params, 'client_order_id'));
});

runTest('reference client uses flat WebSocket event frames and current Python headers', () => {
  const referenceContent = readText(refFile);
  assert.ok(referenceContent.includes('additional_headers=headers'));
  assert.ok(referenceContent.includes('msg.get("e") == "orderUpdate"'));
  for (const field of ['X', 'i', 'Z']) {
    assert.match(referenceContent, new RegExp(`msg\\.get\\(['"]${field}['"]\\)`));
  }
  assert.ok(!referenceContent.includes('msg.get("stream")'));
  assert.ok(!referenceContent.includes('msg.get("data", {})'));
});

runTest('FIX reference uses provisioned session authentication', () => {
  const referenceContent = readText(refFile);
  assert.ok(referenceContent.includes('source-IP allowlisting'));
  assert.ok(referenceContent.includes('9001'));
  assert.ok(!referenceContent.includes('- `553` (Username)'));
  assert.ok(!referenceContent.includes('- `554` (Password)'));
  assert.ok(!referenceContent.includes('- `96` (RawData)'));
});

runTest('sandbox order example is opt-in and includes cleanup', () => {
  const referenceContent = readText(refFile);
  assert.ok(referenceContent.includes('RUN_SANDBOX_ORDER'));
  assert.ok(referenceContent.includes('"method": "order.cancel"'));
  assert.ok(referenceContent.includes('"timeInForce": "MOC"'));
});

// ----------------------------------------------------
// Final Results
// ----------------------------------------------------
console.log('\n======================================================');
console.log(`  EVAL SUMMARY: ${passedTests}/${totalTests} Tests Passed`);
console.log('======================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
