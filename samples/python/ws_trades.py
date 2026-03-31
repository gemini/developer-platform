import os
import json
import signal
import sys
from datetime import datetime, timezone
from websocket import WebSocketApp
from dotenv import load_dotenv

load_dotenv()

GEMINI_WS_URL = os.getenv('GEMINI_WS_URL', 'wss://ws.gemini.com')


def stream_trades(symbol: str):
    """Stream real-time trades for a given symbol."""

    def on_open(ws):
        print(f'Connected to {GEMINI_WS_URL}')
        print(f'Subscribing to {symbol} trades...\n')

        ws.send(json.dumps({
            'id': '1',
            'method': 'subscribe',
            'params': [f'{symbol}@trade'],
        }))

    def on_message(ws, data):
        msg = json.loads(data)

        # Skip subscription confirmations
        if 'result' in msg or 'id' in msg:
            return

        side = 'sell' if msg['m'] else 'buy '
        time = datetime.fromtimestamp(msg['E'] / 1_000_000_000, tz=timezone.utc).isoformat()
        print(f"[{time}] {msg['s']} {side} {msg['q']} @ {msg['p']}")

    def on_error(ws, err):
        print(f'WebSocket error: {err}')

    def on_close(ws, status_code, msg):
        print('Connection closed')

    ws = WebSocketApp(
        GEMINI_WS_URL,
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
        print('Usage: python3 ws_trades.py [symbol]')
        print('Example: python3 ws_trades.py ethusd')
        print('Default symbol: btcusd')
        sys.exit(0)

    # Get symbol from command line or use default
    symbol = sys.argv[1] if len(sys.argv) > 1 else 'btcusd'
    stream_trades(symbol)
