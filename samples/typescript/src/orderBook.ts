import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || 'https://api.gemini.com/v1';

async function getOrderBook(symbol: string): Promise<void> {
  try {
    const symbolLower = symbol.toLowerCase();
    const response = await axios.get(`${GEMINI_BASE_URL}/book/${symbolLower}`);

    const { bids, asks } = response.data;

    console.log(`Order book for ${symbol}:\n`);

    console.log('Asks (top 5):');
    for (const ask of asks.slice(0, 5).reverse()) {
      console.log(`  ${ask.price.padStart(12)} | ${ask.amount}`);
    }

    console.log('  ------------|------------');

    console.log('Bids (top 5):');
    for (const bid of bids.slice(0, 5)) {
      console.log(`  ${bid.price.padStart(12)} | ${bid.amount}`);
    }

    if (asks.length > 0 && bids.length > 0) {
      console.log(`\nSpread: ${(parseFloat(asks[0].price) - parseFloat(bids[0].price)).toFixed(2)}`);
    }
  } catch (error) {
    console.error('Error fetching order book:', error);
  }
}

// Get symbol from command line or use default
const symbol = process.argv[2] || 'btcusd';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: npx ts-node src/orderBook.ts [symbol]');
  console.log('Example: npx ts-node src/orderBook.ts ethusd');
  console.log('Default symbol: btcusd');
  process.exit(0);
}

getOrderBook(symbol);
