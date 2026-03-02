# SEC Insiders 📈
### Automated SEC Form 4 cluster detection, scoring, and publishing pipeline.

SEC Insiders parses Form 4 filings of S&P 500 companies to detect discretionary buy/sell clusters. In addition to these findings, we compute contextual market metrics and automatically generate shareable market commentary.

Built with a focus on creating a system that provides succinct, dispassionate analysis of insider activity, while leveraging modular construction to allow future extensibility.

---

## What It Does
1. __Ingests Form 4 filings__
   * Parses XML filings from the SEC
   * Normalizes transactions into structured records
   * Stores data in SQLite
2. __Filters for quality-signal activity__
   * We exclude: 10b5-1 plan transactions, option exercises, exercise-related sales, equity swaps
   * Focus on discretionary open-market buys (P) and sells (S)
3. __Detects clusters__
   * Groups transactions by:
     * CIK
     * Transaction code
     * Rolling time window (configurable)
     * Identifies multi-insider accumulation or distribution events
4. __Adds contextual metrics__
     * Moving averages (20MA, 200MA)
     * Price location vs MA
     * Transaction size in relation to holdings
     * Role aggregation (CEO, CFO, Director, etc.)
5. __Generates output__
     * Renders shareable images, which are automatically posted to Bluesky and X

### Example Output
--

## Architecture
```markdown
SEC XML Feed
     ↓
XML Parser → Normalizer
     ↓
SQLite (WAL mode)
     ↓
Cluster Engine
     ↓
Metric Enrichment (Price relation to 20/200 MA)
     ↓
Renderer HTML → Puppeteer / Publisher
```
---
## Signal Philosophy - The goal is quality, not volume.

To limit noise, we first exclude officers that are typically not affiliated with daily business. Such as titles that contain: `retired`, `former`, `emeritus`, `interim`, `advisor`, etc.

__A Purchase Cluster Qualifies if:__

1. The transactions are in a 45-day window (subject to change)
2. The minimum transaction in the window is met (currently 3)
3. An equity swap *wasn't* involved
4. Was *not* an option exercise
5. Was *not* the result of an exercise or exercise-related sale
6. Was *not* a predetermined sale under a 10b5-1 plan
7. The weighted average purchase price is less than the 20 MA *and* 200 MA

__A Sale Cluster Qualifies if:__

1. The transactions are in a 45-day window (subject to change)
2. The minimum transaction in the window is met (currently 3)
3. An equity swap *wasn't* involved
4. Was *not* an option exercise
5. Was *not* the result of an exercise or exercise-related sale
6. Was *not* a predetermined sale under a 10b5-1 plan
7. The weighted average purchase price is greater than the 200 MA

---

## Tech Stack

- Node.js (ESM)
- TypeScript
- SQLite (better-sqlite3)
- Puppeteer (image generation)
- Docker (deployment)
- LaunchAgent (timed runs)

--- 
## Disclaimer

This tool surfaces public SEC filings and applies filtering logic.
It does not constitute investment advice.