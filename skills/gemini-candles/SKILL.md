---
name: gemini-candles
description: Display candlestick charts for Gemini trading pairs in the terminal
---

# gemini-candles

Display terminal-based candlestick charts for any Gemini trading pair using live market data.

## When to use

When the user asks to see a candlestick chart, candle chart, price chart, or OHLC chart for a trading pair on Gemini.

## Instructions

1. Determine the trading pair symbol (e.g., `btcusd`, `ethusd`) and timeframe from the user's request. Default to `1d` if no timeframe is specified. Valid timeframes: `1m`, `5m`, `15m`, `30m`, `1hr`, `6hr`, `1day`.

2. Download candle data and convert to CSV entirely on disk using a single bash command. Do NOT use WebFetch or any tool that loads the API response into context. Use curl and jq piped together:
   ```bash
   (echo "timestamp,open,high,low,close,volume" && curl -s "https://api.gemini.com/v2/candles/{symbol}/{time_frame}" | jq -r '.[] | [.[0], .[1], .[2], .[3], .[4], .[5]] | @csv') > /tmp/gemini_candles.csv
   ```

3. Run the chart using npx:
   ```bash
   npx -y @neabyte/candlestick-cli -f /tmp/gemini_candles.csv -t "{SYMBOL} {timeframe}" 2>&1 | tail -n +8
   ```

4. Display the chart output to the user. **IMPORTANT: Output the raw terminal output of the candlestick-cli command verbatim inside a code block. Do NOT summarize, interpret, or describe the chart. The user needs to see the actual rendered ASCII chart, not a description of it.**
