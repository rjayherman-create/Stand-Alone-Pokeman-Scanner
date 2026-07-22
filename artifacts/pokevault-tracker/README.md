# PokéVault Tracker

Standalone Pokémon sealed-product investment tracker built inside the existing Retail Flip Scanner workspace so it can reuse the scanner backend and shared services.

## Included in this MVP

- Responsive desktop and mobile portfolio dashboard
- Initial Target purchase loaded as seven product records / eight sealed units
- True cost, current market value, target value, 30-day trend, and HOLD/WATCH/SELL signals
- Portfolio totals, gross appreciation, estimated online net value, review date, alerts, and sell opportunity panel
- Navigation structure for scanning, inventory, market monitoring, price targets, capital recovery, and alerts

## Run locally

From the repository root:

```bash
pnpm install
pnpm --filter @workspace/pokevault-tracker dev
```

Build:

```bash
pnpm --filter @workspace/pokevault-tracker build
```

## Next backend connection

The UI currently uses seeded portfolio data. Connect it to the existing API server by adding Pokémon-specific routes and tables for:

- purchases and receipt tax allocation
- pokemon_products and identifiers
- individual inventory units
- market snapshots
- price targets and sell signals
- alerts and sales ledger

The existing inventory, watchlist, accounting-ledger, scan, upload, and selling-assistant patterns should be reused rather than rebuilt.

## Railway

Create a separate Railway service and PostgreSQL database for PokéVault. Keep the code in this workspace initially, but use isolated environment variables and database credentials. Set the service root/build command to this artifact or create a dedicated deployment configuration after API integration.
