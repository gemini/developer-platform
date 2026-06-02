# TODOs

## Batch stdin order placement
Support piping multiple orders as JSONL (one JSON object per line) into order placement commands. Currently `--stdin` accepts a single JSON object. Batch mode would allow agents to place multiple orders in one invocation:
```bash
cat orders.jsonl | gemini-markets predict order place --stdin --batch
```
Each line would be validated and placed independently, with results streamed back as JSONL. Errors on individual orders would not block the rest.

**Why:** Agent pipelines that rebalance portfolios or execute multi-leg strategies currently need to invoke the CLI once per order. Batch mode reduces overhead and latency.

**Priority:** Low — single-order stdin covers most agent use cases today.
