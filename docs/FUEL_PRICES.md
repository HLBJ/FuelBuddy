# Fuel prices

FuelBuddy ships with the official South African fuel prices in
[`src/data/fuel-prices-za.json`](../src/data/fuel-prices-za.json). They are used to:

- pre-fill the petrol price on the Add fill-up form (petrol pump prices are regulated),
- show the wholesale diesel price as a hint (diesel pump prices are not regulated),
- warn about an announced price change: a dashboard card, and a notification at 17:00
  the evening before.

Prices change on the first Wednesday of each month. The Department of Mineral and
Petroleum Resources (DMPR) normally announces them a few days before.

## Where the numbers come from

- **Official:** https://www.dmpr.gov.za/Branches/Petroleum-Resources/Fuel-Prices. Each
  month has a "Breakdown of Prices" document (inland and coastal 93/95, inland diesel) and
  a fuel price schedule (zone 1A = coastal).
- **Easiest single table:** https://fuelsindustry.org.za/consumer-information/fuel-prices-current-past/.
  It shows every grade in cents per litre, including coastal 50ppm diesel, and matched
  DMPR for every figure checked.

"Inland" means the Gauteng price, and "coastal" means zone 1A. Other towns differ by a
few cents, which the app mentions next to the price.

## Monthly update (about 5 minutes)

1. Add a period to `src/data/fuel-prices-za.json`, in rand per litre:

   ```json
   {
     "effective": "2026-11-04",
     "inland": { "ulp93": 0, "ulp95": 0, "diesel50": 0, "diesel500": 0 },
     "coastal": { "ulp93": 0, "ulp95": 0, "diesel50": 0, "diesel500": 0 }
   }
   ```

   Then set `"updated"` to today's date.
2. Run `npm test`. The file is validated: the dates must be real, and every price must be
   between R5 and R200 per litre.
3. Publish the same file to the hosted location (below), so phones pick it up without an
   app update.

Leave out any grade you don't have. Never estimate a price.

## Hosting the file (free, optional)

Without a hosted file, the app only knows the prices it shipped with, and it can't warn
about an announced change. To host the file on GitHub Pages:

1. Create a **public** GitHub repository, for example `fuelbuddy-data`.
2. Upload `fuel-prices-za.json` to it.
3. In the repository, open **Settings → Pages**, choose **Deploy from a branch**, then
   **main / root**.
4. After a minute the file is available at
   `https://<your-github-user>.github.io/fuelbuddy-data/fuel-prices-za.json`.
   GitHub Pages allows cross-origin requests, which the app needs.
5. Put that URL in `.env.production` as `VITE_FUEL_PRICES_URL=...`, then rebuild with
   `npm run cap:sync:release`.

The app checks the file when it starts or comes back to the foreground, at most every
6 hours. It keeps the last good copy for offline use and ignores a broken file. The file
contains no personal data, and the request sends none.

Each month, upload the new file as soon as the DMPR announces the prices. Phones that
open FuelBuddy before the change will schedule the "price changes tomorrow" alert.

## Later: automatic updates from a paid API

[FuelSA](https://www.fuelsa.co.za/) offers a South African fuel price API (about R59 per
1 000 requests a month, as of October 2026). When it's worth paying for:

- **Never put the API key in the app.** Keys can be extracted from an APK, and calls from
  every phone would use up the quota quickly.
- Instead, run a scheduled job (for example a GitHub Action, daily) that calls the API with
  the key stored as a repository secret, converts the response to the format above, and
  publishes `fuel-prices-za.json` to GitHub Pages. That's about 30 requests a month,
  however many people use the app, and the app needs no changes.
