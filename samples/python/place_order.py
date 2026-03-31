import os
import json
import base64
import hmac
import hashlib
import time
import requests
from dotenv import load_dotenv
from typing import Literal

load_dotenv()

GEMINI_BASE_URL = os.getenv('GEMINI_BASE_URL', 'https://api.gemini.com/v1')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
GEMINI_API_SECRET = os.getenv('GEMINI_API_SECRET')

def place_order(
    symbol: str,
    side: Literal['buy', 'sell'],
    order_type: Literal['market', 'limit'],
    quantity: float,
    price: float = None
):
    """Place an order."""
    if not GEMINI_API_KEY or not GEMINI_API_SECRET:
        print('Error: GEMINI_API_KEY and GEMINI_API_SECRET must be set in .env file')
        return

    # Create the payload
    payload = {
        'request': '/v1/order/new',
        'nonce': str(int(time.time() * 1000)),
        'symbol': symbol,
        'amount': str(quantity),
        'side': side,
        'type': order_type,
    }

    if price is not None:
        payload['price'] = str(price)

    # Base64 encode the payload
    encoded_payload = base64.b64encode(json.dumps(payload).encode()).decode()

    # Create the signature
    signature = hmac.new(
        GEMINI_API_SECRET.encode(),
        encoded_payload.encode(),
        hashlib.sha384
    ).hexdigest()

    url = f"{GEMINI_BASE_URL}/order/new"
    headers = {
        'Content-Type': 'application/json',
        'X-GEMINI-APIKEY': GEMINI_API_KEY,
        'X-GEMINI-PAYLOAD': encoded_payload,
        'X-GEMINI-SIGNATURE': signature,
    }

    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        print('Order placed:', response.json())
    except requests.exceptions.RequestException as e:
        print(f'Error placing order: {e}')
        if hasattr(e, 'response') and e.response is not None:
            print(f'Response: {e.response.text}')

if __name__ == '__main__':
    place_order('BTCUSD', 'buy', 'limit', 0.01, 50000)
