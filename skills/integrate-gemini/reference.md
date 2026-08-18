# Gemini Exchange API & Protocol Reference Manual

This reference manual provides technical specifications, HMAC-SHA384 signing code, unified WebSocket (`wss://ws.gemini.com`) AsyncAPI schemas, and FIX 4.4 protocol definitions for integrating with Gemini Exchange. For narrative documentation beyond this manual, start at the official [API reference](https://developer.gemini.com/api-reference); see [SKILL.md](SKILL.md#step-2-locate-canonical-specifications) for which `.md` page variants render as empty template shells and which are safe to read directly.

---

## Environment Endpoints & Protocol Summary

| Capability | Sandbox Environment | Production Environment | Protocol Standard |
| :--- | :--- | :--- | :--- |
| **REST API** | `https://api.sandbox.gemini.com` | `https://api.gemini.com` | OpenAPI 3.0 |
| **Prediction Markets** | `https://api.sandbox.gemini.com` | `https://api.gemini.com` | OpenAPI 3.0 |
| **WebSocket API** | `wss://ws.sandbox.gemini.com` | `wss://ws.gemini.com` | AsyncAPI 3.0 |
| **FIX Order Entry** | Provisioned after FIX sandbox onboarding | Provisioned after FIX production onboarding | FIX 4.4 Specification |
| **FIX Market Data** | Provisioned after FIX sandbox onboarding | Provisioned after FIX production onboarding | FIX 4.4 Specification |
| **FIX Drop Copy** | Provisioned after FIX sandbox onboarding | Provisioned after FIX production onboarding | FIX 4.4 Specification |

See [SKILL.md](SKILL.md#step-2-locate-canonical-specifications) for the live spec URLs — this repository does not commit them locally.

---

## Authentication & Signing Implementation

### REST API Signature Header Generation

Authenticated REST API requests send the base64-encoded JSON payload in the `X-GEMINI-PAYLOAD` header. REST payloads are product-specific: the spot `/v1/order/new` example below is not interchangeable with Prediction Markets' `/v1/prediction-markets/order` payload.

Master API keys must also send `account` (the target subaccount name, e.g. `"primary"`) on every private request. The OpenAPI spec marks `account` as a hard-required field specifically on `/v1/balances` (not just "recommended for Master keys" as its own description states) — omitting it there breaks Master-key calls even though other endpoints treat it as optional. Pass `account` when constructing the client if you're using a Master API key.

#### Python REST Client (`gemini_rest.py`)

```python
import base64
import hashlib
import hmac
import json
import time
import requests

class GeminiRestClient:
    def __init__(self, api_key: str, api_secret: str, is_sandbox: bool = True, account: str = None):
        self.api_key = api_key
        self.api_secret = api_secret.encode('utf-8')
        self.base_url = "https://api.sandbox.gemini.com" if is_sandbox else "https://api.gemini.com"
        self.account = account  # required on /v1/balances for Master API keys

    def _build_headers(self, request_path: str, params: dict = None) -> dict:
        if params is None:
            params = {}

        payload = {
            "request": request_path,
            "nonce": int(time.time() * 1000),
            **({"account": self.account} if self.account else {}),
            **params
        }
        
        encoded_payload = base64.b64encode(json.dumps(payload).encode('utf-8'))
        signature = hmac.new(self.api_secret, encoded_payload, hashlib.sha384).hexdigest()
        
        return {
            "Content-Type": "text/plain",
            "Content-Length": "0",
            "X-GEMINI-APIKEY": self.api_key,
            "X-GEMINI-PAYLOAD": encoded_payload.decode('utf-8'),
            "X-GEMINI-SIGNATURE": signature,
            "Cache-Control": "no-cache"
        }

    def get_balances(self) -> list:
        path = "/v1/balances"
        headers = self._build_headers(path)
        res = requests.post(f"{self.base_url}{path}", headers=headers)
        res.raise_for_status()
        return res.json()

    def new_order(self, symbol: str, amount: str, price: str, side: str = "buy") -> dict:
        path = "/v1/order/new"
        params = {
            "symbol": symbol.lower(),
            "amount": str(amount),
            "price": str(price),
            "side": side.lower(),
            "type": "exchange limit",
            "client_order_id": f"agent_{int(time.time()*1000)}"
        }
        headers = self._build_headers(path, params)
        res = requests.post(f"{self.base_url}{path}", headers=headers)
        res.raise_for_status()
        return res.json()

    def cancel_order(self, order_id: str) -> dict:
        path = "/v1/order/cancel"
        params = {"order_id": int(order_id)}
        headers = self._build_headers(path, params)
        res = requests.post(f"{self.base_url}{path}", headers=headers)
        res.raise_for_status()
        return res.json()
```

Prediction Markets uses `/v1/prediction-markets/order` and separate order-management endpoints. Check the current terms status and accept the latest terms before placing a Prediction Markets order. Do not reuse the spot fields (`amount`, `type: "exchange limit"`, or `client_order_id`) for the Prediction Markets REST API.

---

### WebSocket Connection Upgrade Authentication (`wss://ws.gemini.com`)

Private streams (`orders@account`, `balances@account`, `positions@account`) and WebSocket order methods require authentication on the WebSocket connection upgrade. HMAC sessions require an account-scoped API key with time-based nonces enabled; the `Trader` role is required for order methods.

#### Header Specs
- `X-GEMINI-APIKEY`: API key string
- `X-GEMINI-NONCE`: Timestamp in seconds (e.g. `str(int(time.time()))`)
- `X-GEMINI-PAYLOAD`: `base64(X-GEMINI-NONCE)`
- `X-GEMINI-SIGNATURE`: `hex(HMAC_SHA384(X-GEMINI-PAYLOAD, key=api_secret))`

```python
import base64
import hashlib
import hmac
import time

def get_ws_auth_headers(api_key: str, api_secret: str) -> dict:
    nonce = str(int(time.time()))
    encoded_payload = base64.b64encode(nonce.encode('utf-8'))
    signature = hmac.new(
        api_secret.encode('utf-8'),
        encoded_payload,
        hashlib.sha384
    ).hexdigest()
    
    return {
        "X-GEMINI-APIKEY": api_key,
        "X-GEMINI-NONCE": nonce,
        "X-GEMINI-PAYLOAD": encoded_payload.decode('utf-8'),
        "X-GEMINI-SIGNATURE": signature
    }
```

---

## Modern WebSocket Client (`wss://ws.gemini.com`)

Complete async trading bot streaming market data and private order events using `wss://ws.sandbox.gemini.com`.

```python
import asyncio
import json
import os
import time
import base64
import hmac
import hashlib
import websockets

API_KEY = "YOUR_GEMINI_API_KEY"
API_SECRET = "YOUR_GEMINI_API_SECRET"
WS_URL = "wss://ws.sandbox.gemini.com?snapshot=-1&cancelOnDisconnect=true"
RUN_SANDBOX_ORDER = os.getenv("RUN_SANDBOX_ORDER") == "1"

def build_ws_headers(api_key: str, api_secret: str) -> dict:
    nonce = str(int(time.time()))
    encoded_payload = base64.b64encode(nonce.encode('utf-8'))
    signature = hmac.new(
        api_secret.encode('utf-8'),
        encoded_payload,
        hashlib.sha384
    ).hexdigest()
    
    return {
        "X-GEMINI-APIKEY": api_key,
        "X-GEMINI-NONCE": nonce,
        "X-GEMINI-PAYLOAD": encoded_payload.decode('utf-8'),
        "X-GEMINI-SIGNATURE": signature
    }

async def run_gemini_ws_bot():
    headers = build_ws_headers(API_KEY, API_SECRET)
    
    async with websockets.connect(WS_URL, additional_headers=headers) as ws:
        print("Connected to wss://ws.sandbox.gemini.com")
        
        # 1. Subscribe to public market data & private user order events
        subscribe_msg = {
          "method": "SUBSCRIBE",
          "params": [
            "btcusd@bookTicker",
            "btcusd@depth5@100ms",
            "btcusd@trade",
            "orders@account",
            "balances@account"
          ],
          "id": 1
        }
        await ws.send(json.dumps(subscribe_msg))

        if not RUN_SANDBOX_ORDER:
            print("Streaming only. Set RUN_SANDBOX_ORDER=1 to place and cancel a sandbox order.")
            async for raw_msg in ws:
                msg = json.loads(raw_msg)
                if msg.get("s") == "btcusd" and "b" in msg and "a" in msg:
                    print(f"[BOOK TICKER] Best Bid: {msg['b']} ({msg.get('B')}), Best Ask: {msg['a']} ({msg.get('A')})")
            return

        # 2. Place a maker-only sandbox order after receiving a live price.
        async for raw_msg in ws:
            msg = json.loads(raw_msg)
            if msg.get("s") == "btcusd" and "b" in msg and "a" in msg:
                best_bid = msg["b"]
                break

        order_msg = {
          "id": 2,
          "method": "order.place",
          "params": {
            "symbol": "btcusd",
            "side": "BUY",
            "type": "LIMIT",
            "price": best_bid,
            "timeInForce": "MOC",
            "quantity": "0.001",
            "clientOrderId": f"ws_bot_{int(time.time())}"
          }
        }
        await ws.send(json.dumps(order_msg))

        # 3. Handle incoming WebSocket stream events
        async for raw_msg in ws:
            msg = json.loads(raw_msg)
            if msg.get("s") == "btcusd" and "b" in msg and "a" in msg:
                print(f"[BOOK TICKER] Best Bid: {msg['b']} ({msg.get('B')}), Best Ask: {msg['a']} ({msg.get('A')})")

            elif msg.get("e") == "orderUpdate":
                print(f"[USER ORDER EVENT] Order ID: {msg.get('i')}, Status: {msg.get('X')}, Executed Qty: {msg.get('Z')}")
                if msg.get("X") in {"NEW", "OPEN"} and msg.get("i") is not None:
                    await ws.send(json.dumps({
                        "id": 3,
                        "method": "order.cancel",
                        "params": {"orderId": msg["i"]},
                    }))
                elif msg.get("X") == "CANCELED":
                    return

            elif msg.get("id") == 2:
                print(f"[ORDER PLACE RESULT] {msg}")

if __name__ == "__main__":
    asyncio.run(run_gemini_ws_bot())
```

---

## FIX 4.4 Protocol Integration Specs

Gemini supports FIX 4.4 for institutional market access. Complete account verification, connectivity onboarding, and source-IP allowlisting first; Gemini supplies the endpoint, SenderCompID, and TargetCompID.

### Session Logon Message (MsgType `35=A`)
- `35`: `A`
- `49` (SenderCompID): The SenderCompID supplied during onboarding
- `56` (TargetCompID): The TargetCompID supplied during onboarding
- `34` (MsgSeqNum): Session sequence number
- `52` (SendingTime): UTC timestamp
- `98` (EncryptMethod): `0` (None)
- `108` (HeartBtInt): `30`
- `141` (ResetSeqNumFlag): Optional `Y` when resetting sequence numbers
- `9001` (CancelOnDisconnect): Optional `Y`/`N` for Order Entry sessions

Do not add API-key/HMAC fields such as 553, 554, or 96 unless Gemini's provisioned session documentation explicitly requires them.

### New Order Single (MsgType `35=D`)
- `35`: `D`
- `11` (ClOrdID): Unique Client Order ID
- `55` (Symbol): Gemini Symbol (e.g. `BTCUSD`)
- `54` (Side): `1` (Buy) or `2` (Sell)
- `38` (OrderQty): Quantity in base currency
- `44` (Price): Limit price
- `40` (OrdType): `2` (Limit) or `1` (Market)
- `59` (TimeInForce): Use the value required by the selected order type and the current FIX Order Entry specification.
