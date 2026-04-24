import os
import json
import signal
import sys
from datetime import datetime, timezone
from websocket import WebSocketApp
from dotenv import load_dotenv

load_dotenv()

GEMINI_WS_URL = os.getenv('GEMINI_WS_URL', 'wss://ws.gemini.com')


def stream_contract_status():
    """Stream prediction-market contract lifecycle events.

    Emits status transitions (e.g. Awaiting Approval -> Approved -> Active)
    and strike-populated moments for Up/Down contracts. The `p` field
    (strike price) is parsed from strike-based tickers; for Up/Down
    contracts it is omitted until the strike is set.
    """

    def on_open(ws):
        print(f'Connected to {GEMINI_WS_URL}')
        print('Subscribing to contractStatus...\n')

        ws.send(json.dumps({
            'id': '1',
            'method': 'subscribe',
            'params': ['contractStatus'],
        }))

    def on_message(ws, data):
        msg = json.loads(data)

        # Skip subscription confirmations
        if 'result' in msg or 'id' in msg:
            return

        time = datetime.fromtimestamp(msg['E'] / 1000, tz=timezone.utc).isoformat()
        strike = f" strike={msg['p']}" if msg.get('p') else ''
        print(f"[{time}] {msg['s']} [{msg['c']}] {msg['o']} -> {msg['n']}{strike}")

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
        print('Usage: python3 ws_contract_status.py')
        print('Streams prediction-market contract lifecycle events (status transitions and strike-populated moments).')
        sys.exit(0)

    stream_contract_status()
