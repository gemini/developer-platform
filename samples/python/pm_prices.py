import os
import json
import hmac
import hashlib
import base64
import signal
import sys
import time
from websocket import WebSocketApp
from dotenv import load_dotenv

load_dotenv()

GEMINI_WS_URL = os.getenv('GEMINI_WS_URL', 'wss://ws.gemini.com')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
GEMINI_API_SECRET = os.getenv('GEMINI_API_SECRET')


def stream_prediction_prices(symbol: str):
    """Stream real-time prediction market prices for a given symbol."""
    if not GEMINI_API_KEY or not GEMINI_API_SECRET:
        print('Error: GEMINI_API_KEY and GEMINI_API_SECRET must be set in .env file')
        return

    # Authentication — signs a timestamp with your secret so Gemini
    # can verify your identity.
    nonce = str(int(time.time()))
    payload = base64.b64encode(nonce.encode()).decode()
    signature = hmac.new(
        GEMINI_API_SECRET.encode(),
        payload.encode(),
        hashlib.sha384
    ).hexdigest()

    def on_open(ws):
        print(f'Connected to {GEMINI_WS_URL}')
        print(f'Subscribing to {symbol} book ticker...\n')

        ws.send(json.dumps({
            'id': '1',
            'method': 'subscribe',
            'params': [f'{symbol}@bookTicker'],
        }))

    def on_message(ws, data):
        msg = json.loads(data)

        if msg.get('b') and msg.get('a'):
            print(f"{msg['s']}  bid: ${msg['b']} ({msg['B']} contracts)  ask: ${msg['a']} ({msg['A']} contracts)")

    def on_error(ws, err):
        print(f'WebSocket error: {err}')

    def on_close(ws, status_code, msg):
        print('Connection closed')

    ws = WebSocketApp(
        GEMINI_WS_URL,
        header={
            'X-GEMINI-APIKEY': GEMINI_API_KEY,
            'X-GEMINI-NONCE': nonce,
            'X-GEMINI-PAYLOAD': payload,
            'X-GEMINI-SIGNATURE': signature,
        },
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close,
    )

    # Graceful shutdown
    signal.signal(signal.SIGINT, lambda *_: (print('\nClosing connection...'), ws.close(), sys.exit(0)))

    ws.run_forever()


if __name__ == '__main__':
    # Show help message
    if '--help' in sys.argv or '-h' in sys.argv:
        print('Usage: python3 pm_prices.py [symbol]')
        print('Example: python3 pm_prices.py GEMI-PRES2028-VANCE')
        print('Default symbol: GEMI-PRES2028-VANCE')
        sys.exit(0)

    # Get symbol from command line or use default
    symbol = sys.argv[1] if len(sys.argv) > 1 else 'GEMI-PRES2028-VANCE'
    stream_prediction_prices(symbol)
