# FuelBuddy — Product Specification (V1)

> **Origin note.** No `PRODUCT_SPEC.md` existed when the build started (2026-10-02). This
> document was derived from the owner's build instruction, with the owner's explicit
> decision that **Pro = Ad-free + Advanced statistics**. Items marked *(assumption)* are
> engineering decisions made where the instruction was silent. This file is the
> authoritative V1 requirements document from here on.

## 1. Product

FuelBuddy is an offline-first Android utility that lets a driver record fuel fill-ups per
vehicle and understand fuel consumption, cost per kilometre, spending and trip costs.

- Application name: **FuelBuddy**
- Android application ID / package: **`coza.wacko.fuelbuddy`**
- Primary market: South Africa. Currency **ZAR** (South African Rand), metric units
  (kilometres, litres, L/100 km).

## 2. Technology

| Concern | Choice |
|---|---|
| UI | Ionic Framework + Vue 3 (JavaScript, **no TypeScript**) |
| Native runtime | Capacitor, Android platform |
| Persistence | SQLite via `@capacitor-community/sqlite` (native) |
| Backend / accounts / API / cloud | **None in V1** (the route planner uses public OpenStreetMap services, §6.10) |

Non-negotiables:
- Works fully offline. Internet is used for ads, Google Play Billing and the optional
  online route planner (§6.10); none is required for any core feature.
- No user accounts, no authentication, no remote database, no analytics/telemetry.
- User vehicle and fuel data never leaves the device except when the user explicitly
  exports it.

## 3. Architecture

Strict layering — `UI (views/components) → Application services → Repositories → SQLite`.

```
src/
  config/          app + monetization configuration (no secrets)
  database/        connection handling, drivers, migrations
  repositories/    vehicleRepository, fuelEntryRepository, settingsRepository
  services/        fuelCalculationService, tripCalculationService, statisticsService,
                   exportService, monetizationService, validation, formatting
  stores/          reactive app state shared across views
  components/      reusable presentational components
  views/           screens
  router/          vue-router configuration
```

- Vue components never contain SQL or business formulas.
- Database access is driver-agnostic: the native driver wraps
  `@capacitor-community/sqlite`; a `sql.js` driver is used for the browser dev preview and
  for automated tests so tests run the *real* SQL schema and migrations. *(assumption)*

## 4. Data model

### 4.1 Vehicles (`vehicles`)
| Field | Type | Rules |
|---|---|---|
| id | INTEGER PK | auto |
| name | TEXT | required, 1–50 chars |
| make | TEXT | optional, ≤ 50 |
| model | TEXT | optional, ≤ 50 |
| registration | TEXT | optional, ≤ 20 |
| year | INTEGER | optional, 1900 … current year + 1 |
| fuelType | TEXT | one of `petrol`, `diesel`, `hybrid`, `lpg`, `other` |
| tankCapacity | REAL | optional, > 0 and ≤ 1000 L |
| currentOdometer | REAL | ≥ 0; never lower than the vehicle's highest recorded fill-up odometer |
| isDefault | INTEGER (0/1) | exactly one default vehicle when any vehicle exists |
| createdAt / updatedAt | TEXT (ISO 8601) | maintained by the repository |

### 4.2 Fuel entries (`fuel_entries`)
| Field | Type | Rules |
|---|---|---|
| id | INTEGER PK | auto |
| vehicleId | INTEGER FK → vehicles.id | required; entries are deleted with their vehicle |
| date | TEXT `YYYY-MM-DD` | required, not in the future |
| odometer | REAL | required, ≥ 0; must not decrease relative to the vehicle's chronologically previous entry and must not exceed the next entry |
| litres | REAL | required, > 0, ≤ 1000 |
| pricePerLitre | REAL | required, ≥ 0, ≤ 1000 |
| totalCost | REAL | = litres × pricePerLitre, rounded to 2 decimals |
| fuelStation | TEXT | optional, ≤ 80 |
| notes | TEXT | optional, ≤ 500 |
| isFullTank | INTEGER (0/1) | default 1 |
| createdAt / updatedAt | TEXT (ISO 8601) | |

### 4.3 Settings (`settings`, key/value)
| Key | Default | Meaning |
|---|---|---|
| `theme` | `system` | `system` \| `light` \| `dark` |
| `currency` | `ZAR` | ISO-4217 code used for display (data model is currency-neutral) |
| `onboardingComplete` | `false` | first-run onboarding shown until completed |
| `proUnlocked` | `false` | cached Pro entitlement (re-verified with Google Play when possible) |

Schema changes are applied exclusively through numbered migrations tracked with
`PRAGMA user_version`; opening an older database after an app update upgrades it in place
without data loss.

## 5. Calculations

Primitive formulas (all guarded against zero/negative/invalid input → result is
"not available", never `NaN`/`Infinity`):

```
totalCost     = litres × pricePerLitre
distance      = currentOdometer − previousOdometer
consumption   = litres / distance × 100            (L/100 km)
costPerKm     = fuelCost / distance
fuelRequired  = distance × consumption / 100
tripCost      = fuelRequired × fuelPrice
```

Historical consumption uses the **full-tank-to-full-tank** method *(assumption — the only
method that is accurate with partial fills)*: a segment runs from one full-tank entry to
the next full-tank entry; the fuel of the segment is the sum of litres (and cost) of every
entry after the opening full tank up to and including the closing full tank. Entries
before the first full tank cannot be measured. Averages are distance-weighted
(Σ litres / Σ distance × 100). At least one complete segment is required before any
consumption or cost/km figure is shown; otherwise the UI states that more fill-ups are
needed.

## 6. Features

### 6.1 Onboarding (first run, max 3 screens)
1. What FuelBuddy does. 2. Your data stays on this phone. 3. Get started → add first vehicle.
Skippable; never shown again once completed.

### 6.2 Vehicle management
Add, edit, view, delete (confirmation stating how many fill-ups will be removed), set
default, switch active vehicle. Separate fuel records per vehicle. Validation per §4.1.
Empty state guides the user to add a vehicle. No demo data.

### 6.3 Fuel tracking
Add / edit / delete fill-ups: vehicle, date, odometer, litres, price per litre, total cost
(auto-calculated, shown live), optional station and notes, full-tank toggle. Validation per
§4.2 with clear human-readable messages.

### 6.4 History
Per-vehicle chronological list (newest first) grouped by month with monthly totals
(spend, litres), each entry showing date, odometer, litres, price, total, station,
full/partial badge and segment consumption where available. Tap to edit; delete with
confirmation.

### 6.5 Dashboard
Active vehicle (with switcher), average consumption, cost per km, this month's spend,
last fill-up, recent activity (latest 5), quick actions (Add fill-up, Trip calculator).
"Not enough data" states instead of misleading numbers.

### 6.6 Trip calculator
Inputs: distance (km), round-trip toggle, consumption (L/100 km), fuel price (R/L).
Consumption is pre-filled from the active vehicle's recorded average when available
(labelled *based on your history*), otherwise the user enters an estimate (labelled
*your estimate*). Fuel price pre-fills from the vehicle's latest fill-up. Outputs: total
distance, fuel required, estimated cost, cost per km; optional tank-capacity check
(number of full tanks needed). All results clearly labelled as **estimates**.

### 6.7 Statistics
- **Free:** average consumption, cost per km, total spend, total litres, distance tracked,
  number of fill-ups, this month's and last month's spend, average price per litre.
- **Pro (Advanced statistics):** monthly spending chart (last 12 months), consumption
  trend chart per segment, monthly breakdown table, best / worst segment consumption, and
  multi-vehicle comparison.
Statistics require sufficient data; otherwise an explanatory empty state is shown.

### 6.8 Settings
Theme (system / light / dark), currency display (ZAR), CSV export, FuelBuddy Pro
(upgrade / restore purchase), privacy statement, about/version, delete all data
(double confirmation).

### 6.9 CSV export (free)
Exports vehicles and all fill-ups as CSV (UTF-8 with BOM for spreadsheet compatibility).
Android: file is written to the app cache via `@capacitor/filesystem` and handed to the
system share sheet via `@capacitor/share` — **no storage permissions requested**.
Browser preview: regular file download.

### 6.10 Route planner with fuel stops (added 2026-10-15, owner request)
Free for all users. Online feature; the fuel log stays offline.
1. The user picks a start (search, or "Use my location") and a destination (search).
2. FuelBuddy plans the driving route (OSRM), shows it on a map with distance, drive time,
   toll plazas on the route and a fuel/cost estimate (vehicle history or typical values;
   toll fees not included).
3. The app asks how many fuel stops to make (0–9), suggesting a number from the
   vehicle's tank range (¾ of a full tank per leg) or ~400 km per leg if unknown.
4. "Find fuel stops" matches fuel stations within 3 km of the route, picks the best
   evenly spaced ones (closest to each target point, preferring stations on the road),
   numbers them on the map, warns about legs longer than ¾ of the range, and lets the
   user add/remove stops from the map or the station list.
5. "Navigate in Google Maps" opens Google Maps with the stops as waypoints (max 9) for
   turn-by-turn navigation. A full in-app navigator is out of scope (owner decision).
Data: fuel stations and toll plazas are bundled in the app (OpenStreetMap extract,
ODbL, refreshed per release with `scripts/build-poi-dataset.mjs`); search uses Photon,
routing the FOSSGIS OSRM server, map tiles OpenStreetMap (production needs a tile
provider that permits app use). Location permission is requested only on "Use my
location".

### 6.11 Engagement (added 2026-10-15)
- **Reminders**: licence disc, service, tyres or other, per vehicle, due by date and/or
  odometer. Date reminders notify a week before and on the day at 09:00 (local, inexact
  alarms; no exact-alarm permission). Completing a licence-disc reminder creates next
  year's. Urgent reminders show on the dashboard.
- **7-day Pro trial**: one-time, in-app (Play only offers trials on subscriptions). A
  dashboard offer appears once two consumption segments exist; dismissible.
- **Rating prompt**: Play in-app review once, after the 5th fill-up.
- **Home-screen widget and app shortcuts** open Add fill-up, the route planner and
  reminders via `fuelbuddy://` links (handled by `DeepLinkActivity` so a link is never
  replayed when Android recreates the task).

### 6.12 Fuel range forecast (free)
From measured consumption, tank capacity and average daily distance (fill-ups in the last
120 days, at least 7 days of history) the dashboard shows fuel left, range left and the
day to fill up (when ~15% of the tank remains). Presented as an estimate; needs the tank
size and one measured segment.

### 6.13 Official SA fuel prices (free)
Monthly DMPR prices (inland = Gauteng, coastal = zone 1A; 93/95 pump prices, 50/500ppm
wholesale diesel) ship with the app and can be updated from a hosted JSON file
(`VITE_FUEL_PRICES_URL`, see docs/FUEL_PRICES.md). The fill-up form pre-fills the
regulated petrol price for the fill-up date (user edits win) and shows the diesel
wholesale price as a hint. An announced change shows a dashboard card with the effect on
a full tank, and a notification at 17:00 the evening before (toggle in Settings). Region
and grades are settings.

### 6.14 Fuel slip scanning (free)
"Scan fuel slip" on Add fill-up takes a photo (camera app) or picks one (photo picker);
ML Kit text recognition runs on the device (bundled model, offline). The parser rebuilds
printed rows (correcting tilt), scores numbers by label and unit, prefers a combination
where litres × price ≈ total, and fills litres, price, date and station. Uncertain values
are left for the user; a mismatch with the slip total is flagged. No camera or storage
permission.

### 6.14b Odometer scanning (free)
A camera button on the odometer fields (fill-up and logbook trip) reads the reading from a
photo of the dashboard with on-device ML Kit. Numbers are scored by digit count, size, a
nearby "ODO" label, trip/range/clock/temperature hints and the vehicle's last reading; the
best fills the field and the next candidates are offered as chips.

### 6.15 Backup and restore (free)
Settings → Back up data writes one JSON file (all tables + settings, schema version) and
opens the share sheet (Google Drive, email, Files). Restore picks a file, shows what it
contains, and replaces all data in one transaction (a bad file changes nothing). The Pro
purchase is never restored from a file.

### 6.15b Vehicle catalogue and consumption comparison (free)
src/data/vehicles-za.json holds ~270 popular SA cars and bakkies (make, model, years,
engine, fuel type, tank litres, official combined L/100 km, source URL; researched October
2026). The vehicle form suggests makes and models, offers an engine picker that fills in
fuel type and tank size, and stores the match (vehicles.catalog_key). Statistics compares
measured consumption with the official figure, allowing for the usual real-world gap (20–40%
for NEDC-style figures, 10–25% for WLTP). There is no comparison with other users: the app
has no server.

### 6.15c Toll fees (free)
SANRAL's tariffs (from 1 March each year; 2026 data in src/data/toll-tariffs-za.json, incl.
VAT) price each plaza on a planned route for the vehicle's toll class (vehicles.toll_class,
changeable per trip). Ramp plazas are charged only near the start or end of the trip;
elsewhere they are listed as "only if you use this exit". Totals are one way, without e-tag
discounts. New tariffs arrive from a hosted copy on Google Drive (checked daily, applied from their
effectiveFrom date; see docs/TOLL_TARIFFS.md).

### 6.16 SARS travel logbook (logging free, export Pro)
Trips per vehicle: date, start/end odometer, business or private, from, destination and
reason (destination and reason required for business trips). Grouped by SA tax year
(1 March – end of February) with opening/closing odometer readings; totals for business,
private (total − business when readings exist) and business share. "Save and log the
return trip" pre-fills the way back. Export as a SARS-style PDF or CSV is a Pro feature.

## 7. Monetization

| | Free | Pro |
|---|---|---|
| Fuel tracking, vehicles (unlimited), history, trip calculator, basic statistics, CSV export | ✓ | ✓ |
| Advertising (banner) | shown | **removed** |
| Advanced statistics (§6.7) | locked preview | **✓** |
| Slip scanning, fuel prices and alerts, range forecast, reminders, backup, trip logging | ✓ | ✓ |
| SARS logbook export, PDF and CSV (§6.16) | locked | **✓** |

- Pro is a **one-time, non-consumable** in-app product via **Google Play Billing**.
- Suggested price **R59 once-off**. The price shown to users comes from Google Play's
  localized product details; the R59 figure exists only as a configurable display fallback
  in `src/config/monetization.js`, never in business logic.
- The Play product ID is configuration. While it is not configured, purchase is
  unavailable and the UI says so; there are no fake purchases or bypasses.
- Purchases can be restored. Entitlement is cached locally so Pro works offline.
- Ads via Google AdMob. Development uses Google's **published test IDs** only; production
  ad unit / app IDs are supplied through configuration at release time. Ads are never shown
  to Pro users, never block core features and fail silently offline. A consent request
  (Google UMP) is made before ads load where required.

## 8. Privacy & permissions

- No analytics, telemetry, crash reporting or data upload.
- Android permissions: `INTERNET` (ads, billing, route planner, fuel price file),
  `POST_NOTIFICATIONS` + `RECEIVE_BOOT_COMPLETED` (reminders and price alerts; asked when
  first needed; `SCHEDULE_EXACT_ALARM` removed), `ACCESS_COARSE_LOCATION` /
  `ACCESS_FINE_LOCATION` (requested only for the route planner's "Use my location") and those merged by the billing /
  ads SDKs (`com.android.vending.BILLING`, `ACCESS_NETWORK_STATE`, `AD_ID`,
  `ACCESS_ADSERVICES_*`, plus `WAKE_LOCK` / `FOREGROUND_SERVICE` used internally by the Google
  Mobile Ads SDK's WorkManager). No storage, camera or biometric permissions (slip photos
  come from the camera app or photo picker) (the
  SQLite plugin's unused biometric permissions are removed in the manifest).
- In-app privacy statement explains local storage, ads and billing.

## 9. UI quality bar

Light and dark themes (system default), consistent spacing, large touch targets,
accessible text sizing, loading / empty / error states, confirmation for destructive
actions, numeric keyboards for numeric fields, works on small phone screens.

## 10. Quality

- Automated tests: calculation services, trip and statistics services, validation,
  database initialization, migrations, repository CRUD, relationships and constraints.
- Builds: web build, `cap sync android`, Gradle debug APK and release build
  configuration (release signing supplied by the owner, never committed).

## 11. Delivery phases (internal roadmap)

0 Foundation · 1 Architecture & SQLite · 2 Vehicles · 3 Fuel tracking · 4 Calculations ·
5 Dashboard & history · 6 Trip calculator · 7 Statistics · 8 Onboarding, theming &
settings · 9 Export · 10 Monetization · 11 Android build & release readiness.

## 12. Out of scope for V1

Cloud sync, accounts, multiple currencies in one dataset, electric-vehicle charging,
in-app turn-by-turn navigation, toll fee calculation,
maintenance cost tracking, iOS release.
