import os
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

GEMINI_BASE_URL = os.getenv('GEMINI_BASE_URL', 'https://api.gemini.com/v1')


def get_trade_history(symbol: str):
    """Fetch recent trade history for a given symbol."""
    symbol_lower = symbol.lower()
    url = f"{GEMINI_BASE_URL}/trades/{symbol_lower}"

    try:
        response = requests.get(url)
        response.raise_for_status()
        trades = response.json()

        print(f'Recent trades for {symbol} ({len(trades)} trades):\n')

        for trade in trades:
            time = datetime.fromtimestamp(trade['timestampms'] / 1000, tz=timezone.utc).isoformat()
            print(f"[{time}] {trade['type']:<4} {trade['amount']} @ {trade['price']} (tid: {trade['tid']})")
    except requests.exceptions.RequestException as e:
        print(f'Error fetching trade history: {e}')


if __name__ == '__main__':
    import sys

    # Show help message
    if '--help' in sys.argv or '-h' in sys.argv:
        print('Usage: python3 trade_history.py [symbol]')
        print('Example: python3 trade_history.py ethusd')
        print('Default symbol: btcusd')
        sys.exit(0)

    # Get symbol from command line or use default
    symbol = sys.argv[1] if len(sys.argv) > 1 else 'btcusd'
    get_trade_history(symbol)
