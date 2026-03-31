import os
import requests
from dotenv import load_dotenv

load_dotenv()

GEMINI_BASE_URL = os.getenv('GEMINI_BASE_URL', 'https://api.gemini.com/v1')


def get_order_book(symbol: str):
    """Fetch the current order book for a given symbol."""
    symbol_lower = symbol.lower()
    url = f"{GEMINI_BASE_URL}/book/{symbol_lower}"

    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()

        bids = data['bids']
        asks = data['asks']

        print(f'Order book for {symbol}:\n')

        print('Asks (top 5):')
        for ask in reversed(asks[:5]):
            print(f"  {ask['price']:>12} | {ask['amount']}")

        print('  ------------|------------')

        print('Bids (top 5):')
        for bid in bids[:5]:
            print(f"  {bid['price']:>12} | {bid['amount']}")

        if asks and bids:
            spread = float(asks[0]['price']) - float(bids[0]['price'])
            print(f'\nSpread: {spread:.2f}')
    except requests.exceptions.RequestException as e:
        print(f'Error fetching order book: {e}')


if __name__ == '__main__':
    import sys

    # Show help message
    if '--help' in sys.argv or '-h' in sys.argv:
        print('Usage: python3 order_book.py [symbol]')
        print('Example: python3 order_book.py ethusd')
        print('Default symbol: btcusd')
        sys.exit(0)

    # Get symbol from command line or use default
    symbol = sys.argv[1] if len(sys.argv) > 1 else 'btcusd'
    get_order_book(symbol)
