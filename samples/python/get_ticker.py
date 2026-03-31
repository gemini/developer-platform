import os
import requests
from dotenv import load_dotenv

load_dotenv()

GEMINI_BASE_URL = os.getenv('GEMINI_BASE_URL', 'https://api.gemini.com/v1')

def get_ticker(symbol: str):
    """Fetch ticker data for a given symbol."""
    # Symbol should be lowercase for Gemini API
    symbol_lower = symbol.lower()
    url = f"{GEMINI_BASE_URL}/pubticker/{symbol_lower}"

    try:
        response = requests.get(url)
        response.raise_for_status()
        print('Ticker data:', response.json())
    except requests.exceptions.RequestException as e:
        print(f'Error fetching ticker: {e}')

if __name__ == '__main__':
    import sys

    # Show help message
    if '--help' in sys.argv or '-h' in sys.argv:
        print('Usage: python3 get_ticker.py [symbol]')
        print('Example: python3 get_ticker.py ethusd')
        print('Default symbol: btcusd')
        sys.exit(0)

    # Get symbol from command line or use default
    symbol = sys.argv[1] if len(sys.argv) > 1 else 'btcusd'
    get_ticker(symbol)
