import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || 'https://api.gemini.com/v1';

async function getTradeHistory(symbol: string): Promise<void> {
  try {
    const symbolLower = symbol.toLowerCase();
    const response = await axios.get(`${GEMINI_BASE_URL}/trades/${symbolLower}`);

    const trades = response.data;
    console.log(`Recent trades for ${symbol} (${trades.length} trades):\n`);

    for (const trade of trades) {
      const time = new Date(trade.timestampms).toISOString();
      console.log(`[${time}] ${trade.type.padEnd(4)} ${trade.amount} @ ${trade.price} (tid: ${trade.tid})`);
    }
  } catch (error) {
    console.error('Error fetching trade history:', error);
  }
}

// Get symbol from command line or use default
const symbol = process.argv[2] || 'btcusd';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: npx ts-node src/tradeHistory.ts [symbol]');
  console.log('Example: npx ts-node src/tradeHistory.ts ethusd');
  console.log('Default symbol: btcusd');
  process.exit(0);
}

getTradeHistory(symbol);
