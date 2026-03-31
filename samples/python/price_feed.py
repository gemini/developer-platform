import os
import requests
from dotenv import load_dotenv

load_dotenv()

GEMINI_BASE_URL = os.getenv('GEMINI_BASE_URL', 'https://api.gemini.com/v1')


def get_price_feed():
    """Fetch current prices for all trading pairs."""
    url = f"{GEMINI_BASE_URL}/pricefeed"

    try:
        response = requests.get(url)
        response.raise_for_status()
        pairs = response.json()

        print(f'Price feed ({len(pairs)} pairs):\n')

        for entry in pairs:
            change = float(entry['percentChange24h'])
            sign = '+' if change >= 0 else ''
            print(f"{entry['pair']:<12} {entry['price']:>12} ({sign}{entry['percentChange24h']}%)")
    except requests.exceptions.RequestException as e:
        print(f'Error fetching price feed: {e}')


if __name__ == '__main__':
    import sys

    # Show help message
    if '--help' in sys.argv or '-h' in sys.argv:
        print('Usage: python3 price_feed.py')
        print('Fetches current prices for all trading pairs.')
        sys.exit(0)

    get_price_feed()
