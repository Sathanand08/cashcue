# CashCue

Cash-flow control and financial-risk visibility for solo freelancers and small web/design studios in Hyderabad, Telangana.

## Running locally

Node 22.12 requires the built-in SQLite flag. In PowerShell, set the environment variable before installing and running:

```powershell
$env:NODE_OPTIONS="--experimental-sqlite"
npm install
npm run dev
```

## Tests

```powershell
npm test
```

The test script already passes the `--experimental-sqlite` flag.

The seed does not update existing data on its own. Prefer **Settings → Reset demo data** (type `RESET`) to wipe and reseed PixelCraft Studio, or delete `data/cashcue.db` and restart.

## Limitations

- No authentication (single demo workspace).
- No Postgres row-level security (embedded store; isolation is enforced in the repository layer).
- No WhatsApp sending.
- Forecasts are estimates based on user-entered data, not tax, accounting or financial advice.
- No bank integration.
