import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || 'https://api.gemini.com/v1';

async function getTicker(symbol: string): Promise<void> {
  try {
    // Symbol should be lowercase for Gemini API
    const symbolLower = symbol.toLowerCase();
    const response = await axios.get(`${GEMINI_BASE_URL}/pubticker/${symbolLower}`);

    console.log('Ticker data:', response.data);
  } catch (error) {
    console.error('Error fetching ticker:', error);
  }
}

// Get symbol from command line or use default
const symbol = process.argv[2] || 'btcusd';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: npx ts-node src/getTicker.ts [symbol]');
  console.log('Example: npx ts-node src/getTicker.ts ethusd');
  console.log('Default symbol: btcusd');
  process.exit(0);
}

getTicker(symbol);
