import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || 'https://api.gemini.com/v1';

async function getPriceFeed(): Promise<void> {
  try {
    const response = await axios.get(`${GEMINI_BASE_URL}/pricefeed`);

    const pairs = response.data;
    console.log(`Price feed (${pairs.length} pairs):\n`);

    for (const entry of pairs) {
      const change = parseFloat(entry.percentChange24h);
      const sign = change >= 0 ? '+' : '';
      console.log(`${entry.pair.padEnd(12)} ${entry.price.padStart(12)} (${sign}${entry.percentChange24h}%)`);
    }
  } catch (error) {
    console.error('Error fetching price feed:', error);
  }
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: npx ts-node src/priceFeed.ts');
  console.log('Fetches current prices for all trading pairs.');
  process.exit(0);
}

getPriceFeed();
