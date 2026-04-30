#!/usr/bin/env tsx
/**
 * Standalone test script for WebSocket functionality
 * Run: npx tsx test-websocket.ts
 */

import { WebSocketManager } from './src/websocket/manager.js';

const WS_URL = process.env.GEMINI_WS_URL || 'wss://ws.gemini.com';

async function testWebSocket() {
  console.log('🚀 Testing Gemini WebSocket MCP Server\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Initialize WebSocket manager
  const wsManager = new WebSocketManager(WS_URL);

  try {
    // Step 1: Connect
    console.log('📡 Step 1: Connecting to', WS_URL);
    await wsManager.initialize();
    console.log('✅ Connected!\n');

    // Step 2: Check status
    console.log('📊 Step 2: Checking status...');
    const statusBefore = wsManager.getState();
    console.log('Status:', statusBefore.status);
    console.log('Subscriptions:', statusBefore.subscriptions.length);
    console.log('');

    // Step 3: Subscribe to BTC/USD trades
    console.log('🔔 Step 3: Subscribing to BTCUSD trades...');
    await wsManager.subscribe('btcusd', 'trade');
    console.log('✅ Subscribed!\n');

    // Step 4: Subscribe to ETH/USD trades
    console.log('🔔 Step 4: Subscribing to ETHUSD trades...');
    await wsManager.subscribe('ethusd', 'trade');
    console.log('✅ Subscribed!\n');

    // Step 5: Wait for data to accumulate
    console.log('⏳ Step 5: Waiting for real-time data (5 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('');

    // Step 6: Get BTC price from cache
    console.log('💰 Step 6: Getting BTC price from cache...');
    const store = wsManager.getStore();
    const btcPrice = store.getPrice('btcusd');

    if (btcPrice) {
      console.log('✅ BTC/USD Price:', btcPrice.price);
      console.log('   Source:', btcPrice.source);
      console.log('   Age:', store.getDataAge('btcusd'), 'ms');
      console.log('   Fresh?', store.isFresh('btcusd') ? '✅' : '❌');
    } else {
      console.log('❌ No BTC price data yet');
    }
    console.log('');

    // Step 7: Get ETH price from cache
    console.log('💰 Step 7: Getting ETH price from cache...');
    const ethPrice = store.getPrice('ethusd');

    if (ethPrice) {
      console.log('✅ ETH/USD Price:', ethPrice.price);
      console.log('   Source:', ethPrice.source);
      console.log('   Age:', store.getDataAge('ethusd'), 'ms');
      console.log('   Fresh?', store.isFresh('ethusd') ? '✅' : '❌');
    } else {
      console.log('❌ No ETH price data yet');
    }
    console.log('');

    // Step 8: Get recent BTC trades
    console.log('📈 Step 8: Getting recent BTC trades...');
    const btcTrades = store.getTrades('btcusd', 5);
    console.log(`✅ Found ${btcTrades.length} recent trades:`);

    btcTrades.forEach((trade, i) => {
      const side = trade.isMaker ? '🔴 SELL' : '🟢 BUY';
      console.log(`   ${i + 1}. ${side} ${trade.quantity} @ $${trade.price}`);
    });
    console.log('');

    // Step 9: Get snapshot
    console.log('📸 Step 9: Getting complete BTC snapshot...');
    const snapshot = store.getSnapshot('btcusd');
    console.log('✅ Snapshot:');
    console.log('   Price:', snapshot.price?.price || 'N/A');
    console.log('   Total trades:', snapshot.trades.length);
    console.log('   Last update:', snapshot.lastUpdate ? new Date(snapshot.lastUpdate).toISOString() : 'N/A');
    console.log('');

    // Step 10: Get statistics
    console.log('📊 Step 10: Getting cache statistics...');
    const stats = wsManager.getStats();
    console.log('✅ Cache Stats:');
    console.log('   Symbols:', stats.symbolCount);
    console.log('   Prices:', stats.priceCount);
    console.log('   Total trades:', stats.totalTradeCount);
    console.log('   Subscriptions:', stats.subscriptionCount);
    console.log('');

    // Step 11: Monitor live updates for 10 seconds
    console.log('📡 Step 11: Monitoring live updates (10 seconds)...');
    console.log('   (Watch the prices change in real-time)\n');

    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const btc = store.getPrice('btcusd');
      const eth = store.getPrice('ethusd');
      const btcAge = store.getDataAge('btcusd');
      const ethAge = store.getDataAge('ethusd');

      console.log(`   [${i + 1}s] BTC: $${btc?.price || 'N/A'} (${btcAge}ms ago) | ETH: $${eth?.price || 'N/A'} (${ethAge}ms ago)`);
    }
    console.log('');

    // Step 12: Unsubscribe
    console.log('🔕 Step 12: Unsubscribing from ETHUSD...');
    await wsManager.unsubscribe('ethusd', 'trade');
    console.log('✅ Unsubscribed!\n');

    // Step 13: Final status
    console.log('📊 Step 13: Final status...');
    const statusAfter = wsManager.getState();
    console.log('Status:', statusAfter.status);
    console.log('Active subscriptions:', statusAfter.subscriptions);
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ Test completed successfully!\n');
    console.log('🎉 WebSocket integration is working!\n');

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
testWebSocket();
