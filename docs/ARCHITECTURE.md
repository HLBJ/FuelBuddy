# FuelBuddy architecture and decisions

## Layers

```
views / components (Vue)   presentation only, no SQL, no formulas
        │
stores/appStore.js         shared state: settings, vehicles, active vehicle, Pro status, revision counter
        │
services/                  validation, calculations, statistics, trip, export, monetization, ads
        │
repositories/              one module per table; SQL and row mapping only
        │
database/                  driver interface + migrator + migrations
   ├─ drivers/capacitorDriver.js   Android: @capacitor-community/sqlite (bundled SQLCipher/SQLite)
   ├─ drivers/webDriver.js         browser preview: sql.js + IndexedDB
   └─ drivers/sqljsDriver.js       tests (Node) and the browser preview
```

`services/appServices.js` is the composition root. It opens the database once and wires the services.

## Database

- **Driver interface:** `query`, `run`, `transaction(fn)` and `close`. `serializedDriver.js` queues every
  operation on the single connection, so an async transaction can never interleave with other statements.
- **Migrations:** an ordered list in `src/database/migrations/index.js`, tracked with `PRAGMA user_version`.
  Each migration runs in its own transaction together with its version bump. A failed upgrade leaves the
  database at the last good version. A database from a newer app version is refused instead of being
  corrupted. Shipped migrations are never edited; add a new version instead.
- The SQLite plugin's own upgrade mechanism is not used. With no plugin upgrade statements registered, the
  plugin does not touch `user_version` (checked in its Android source), and it enables foreign keys on open.
- **Do not add columns named `last_modified` and `sql_deleted`.** When any table has both, the Android
  plugin silently rewrites `DELETE … WHERE` into a soft-delete `UPDATE` (its sync feature). That would break
  deletes and the foreign-key cascade.
- Integrity is enforced twice: service-level validation with friendly messages, plus SQL `CHECK` and
  foreign-key constraints as a last line of defence.

## Calculation rules

- Consumption uses the **full-tank-to-full-tank** method. Partial fills are added to the next full-tank
  segment, and fills before the first full tank are ignored. A zero-distance segment is skipped instead of
  dividing by zero.
- Averages are distance-weighted (Σ litres / Σ km). A simple mean of per-segment figures would over-weight
  short segments.
- **Odometer rule:** a reading may not be lower than any reading on an earlier date, or higher than any
  reading on a later date. Two fills on the same day may be entered in any order.
- A new latest fill-up below the vehicle's current odometer only produces a warning, because the user may be
  back-dating. The vehicle's odometer never decreases automatically.

## Money and locale

- Amounts are plain numbers. The currency is a setting (`ZAR`) applied only when values are displayed
  (`formatService.js`, locale `en-ZA`). Adding a currency means adding it to `appConfig.supportedCurrencies`.
- Inputs accept `,` or `.` as the decimal separator (`numberUtils.parseDecimal`).

## Monetization

- **Pro** = ad-free + advanced statistics (owner decision). CSV export and unlimited vehicles are free.
- **Billing:** `@capgo/native-purchases` (Google Play Billing Library 9). It is wrapped in an adapter, so the
  entitlement logic in `monetizationService.js` is tested without a device. Pro is granted only when Play
  reports `purchaseState === "1"` (PURCHASED); pending purchases do not unlock it. The entitlement is cached
  in settings, so Pro works offline. It is re-verified on launch and revoked if Play reports no purchase.
- **Ads:** `@capacitor-community/admob` adaptive banner above the tab bar. It appears on tab screens only,
  never for Pro, and never in the browser preview. The Google UMP consent form is shown when the SDK
  reports consent is required. Debug builds use Google's published test IDs.
- All identifiers live in `src/config/monetization.js` and are filled from build-time environment
  variables. See [RELEASE.md](RELEASE.md).

## Export

- The CSV (UTF-8 with BOM, CRLF line endings, RFC 4180 quoting, formula-injection guard) is written to the
  app cache with `@capacitor/filesystem`. It is then handed to the Android share sheet with
  `@capacitor/share`, so no storage permission is needed. The FileProvider only exposes the cache directory.

## Environment notes

- Node 24 is used (Capacitor 8 CLI requires Node ≥ 22). Ionic 9 requires vue-router 5, so route guards
  return values instead of calling `next()`.

## Route planner (online)

- `services/geoService.js` is the only module that talks to online map services: Photon (search),
  OSRM/FOSSGIS (routing), device location (only when the user asks), and Google Maps hand-off via
  `@capacitor/app-launcher`. Endpoints live in `config/maps.js`.
- `services/routePlannerService.js` and `services/geoUtils.js` are pure and unit-tested. They cover matching
  stations and toll booths to the route (with a grid index over route segments), choosing evenly spaced stops,
  range warnings, and building the Google Maps URL (max 9 waypoints, the Android app's limit).
- **Fuel stations and toll plazas are bundled** (`src/data/poi-za.json`, OpenStreetMap/ODbL, compact
  integer coordinates) instead of being queried live. The public Overpass servers proved unreliable (all
  returned 5xx during development), and bundling makes stop finding instant, offline and private. The file
  is loaded lazily on first use, so it is not part of the startup bundle.
- Turn-by-turn navigation is deliberately handed to Google Maps (owner decision). FOSSGIS routing cannot
  exclude tolls, so no "avoid tolls" option is offered: FuelBuddy's map would disagree with Google's route.
- **Place autocomplete** is offline first: `src/data/places-za.json` (13 251 SA places from GeoNames, CC BY 4.0,
  rebuilt with `scripts/build-places-dataset.mjs`) gives instant suggestions with no network. Photon adds online
  suggestions (streets, landmarks) from 3 letters, after a 450 ms pause, with superseded requests aborted.
  Nominatim is used only for explicit searches and Plan route, never as-you-type, because its usage policy
  forbids autocomplete. Plan route accepts typed text and resolves it to the best match.
