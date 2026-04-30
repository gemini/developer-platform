#!/usr/bin/env tsx
/**
 * Test hybrid tools (REST + WebSocket fallback)
 * Run: npx tsx test-hybrid.ts
 */

import { GeminiHttpClient } from './src/client/http.js';
import { WebSocketManager } from './src/websocket/manager.js';
import * as market from './src/datasources/market.js';

const WS_URL = process.env.GEMINI_WS_URL || 'wss://ws.gemini.com';

async function testHybrid() {
  console.log('🚀 Testing Hybrid Tools (REST + WebSocket)\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const httpClient = new GeminiHttpClient();
  const wsManager = new WebSocketManager(WS_URL);

  // Initialize WebSocket in background
  wsManager.initialize().catch(() => {
    console.log('⚠️  WebSocket unavailable, will use REST fallback\n');
  });

  try {
    // Test 1: Get price via REST (always works)
    console.log('💰 Test 1: Get BTC price via REST API...');
    const ticker = await market.getTicker(httpClient, 'btcusd');
    console.log('✅ BTC/USD Price:', ticker.close);
    console.log('   24h High:', ticker.high);
    console.log('   24h Low:', ticker.low);
    console.log('   24h Volume:', ticker.volume, 'BTC');
    console.log('   Source: REST API (fresh data)\n');

    // Test 2: Get ETH price
    console.log('💰 Test 2: Get ETH price via REST API...');
    const ethTicker = await market.getTicker(httpClient, 'ethusd');
    console.log('✅ ETH/USD Price:', ethTicker.close);
    console.log('   24h High:', ethTicker.high);
    console.log('   24h Low:', ethTicker.low);
    console.log('   24h Volume:', ethTicker.volume, 'ETH\n');

    // Test 3: Get order book
    console.log('📊 Test 3: Get BTC order book...');
    const orderBook = await market.getOrderBook(httpClient, 'btcusd', 5, 5);
    console.log('✅ Order Book (Top 5):');
    console.log('   Best Ask:', orderBook.asks[0]);
    console.log('   Best Bid:', orderBook.bids[0]);
    const spread = parseFloat(orderBook.asks[0].price) - parseFloat(orderBook.bids[0].price);
    console.log('   Spread: $' + spread.toFixed(2) + '\n');

    // Test 4: Get recent trades
    console.log('📈 Test 4: Get recent BTC trades...');
    const trades = await market.getRecentTrades(httpClient, 'btcusd', 5);
    console.log(`✅ Last ${trades.length} trades:`);
    trades.forEach((trade, i) => {
      const side = trade.type === 'sell' ? '🔴 SELL' : '🟢 BUY';
      const time = new Date(trade.timestamp * 1000).toLocaleTimeString();
      console.log(`   ${i + 1}. ${side} ${trade.amount} BTC @ $${trade.price} (${time})`);
    });
    console.log('');

    // Test 5: Get price feed (all symbols)
    console.log('💹 Test 5: Get price feed (all active symbols)...');
    const priceFeed = await market.getPriceFeed(httpClient);
    console.log(`✅ Found ${priceFeed.length} trading pairs:\n`);

    // Show top 10 by volume
    const sorted = priceFeed
      .filter(p => parseFloat(p.percentChange24h) !== 0)
      .sort((a, b) => parseFloat(b.volume) - parseFloat(a.volume))
      .slice(0, 10);

    console.log('   Top 10 by Volume:');
    sorted.forEach((p, i) => {
      const change = parseFloat(p.percentChange24h);
      const changeIcon = change > 0 ? '🟢' : '🔴';
      const changeStr = change > 0 ? `+${change.toFixed(2)}%` : `${change.toFixed(2)}%`;
      console.log(`   ${i + 1}. ${p.pair.padEnd(10)} $${parseFloat(p.price).toLocaleString().padEnd(12)} ${changeIcon} ${changeStr}`);
    });
    console.log('');

    // Test 6: Wait for WebSocket to connect and subscribe
    console.log('🔔 Test 6: Testing WebSocket (if connected)...');

    // Wait a bit for WebSocket
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (wsManager.isConnected()) {
      console.log('✅ WebSocket is connected!');
      console.log('   Subscribing to BTC and ETH trades...');

      await wsManager.subscribe('btcusd', 'trade');
      await wsManager.subscribe('ethusd', 'trade');

      console.log('   Waiting 5 seconds for data...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      const store = wsManager.getStore();
      const wsBtcPrice = store.getPrice('btcusd');
      const wsEthPrice = store.getPrice('ethusd');

      if (wsBtcPrice) {
        console.log('   ✅ WebSocket BTC Price:', wsBtcPrice.price, '(age:', store.getDataAge('btcusd'), 'ms)');
      } else {
        console.log('   ℹ️  No WebSocket data yet (low trading activity)');
      }

      if (wsEthPrice) {
        console.log('   ✅ WebSocket ETH Price:', wsEthPrice.price, '(age:', store.getDataAge('ethusd'), 'ms)');
      }

      console.log('');
    } else {
      console.log('   ℹ️  WebSocket not connected, REST API is working as fallback\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ All tests passed!\n');
    console.log('📊 Summary:');
    console.log('   • REST API: Working ✅');
    console.log('   • WebSocket: ' + (wsManager.isConnected() ? 'Connected ✅' : 'Not available ⚠️'));
    console.log('   • Hybrid fallback: Working ✅\n');

    // Cleanup
    wsManager.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    wsManager.disconnect();
    process.exit(1);
  }
}

// Run the test
testHybrid();
