# FuelBuddy

Offline-first fuel tracking for Android. Record fill-ups per vehicle, and see fuel consumption,
cost per kilometre, monthly spending and trip cost estimates. Everything is stored on the phone in SQLite.
There are no accounts, no server and no analytics.

- **App ID:** `za.co.fuelbuddy.app`
- **Stack:** Ionic 9 + Vue 3 (JavaScript) + Capacitor 8 + `@capacitor-community/sqlite`
- **Requirements:** [PRODUCT_SPEC.md](PRODUCT_SPEC.md)
- **Release steps:** [docs/RELEASE.md](docs/RELEASE.md)
- **Architecture and decisions:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Prerequisites

| Tool | Version used | Notes |
|---|---|---|
| Node.js | 24.x (≥ 22.12 required by Capacitor 8 / Vite 8) | |
| JDK | 21 | e.g. `C:\Program Files\Android\openjdk\jdk-21.0.8` |
| Android SDK | platform 36, build-tools 36 | set `sdk.dir` in `android/local.properties` |

The Ionic and Capacitor CLIs are project dependencies. Run them with `npx`; no global install is needed.

## Commands

```bash
npm install
```

```bash
npm run dev
```

Browser preview at http://localhost:5173. Data is kept in the browser's IndexedDB via sql.js (development only).

```bash
npm test
```

```bash
npm run build
```

```bash
npx cap sync android
```

Debug APK (Windows; JAVA_HOME must point at JDK 21):

```bash
cd android && gradlew.bat assembleDebug
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

## Project layout

```
src/
  config/        app + monetization configuration (no secrets)
  database/      drivers (native SQLite, sql.js), migrator, migrations
  repositories/  SQL access per table
  services/      calculations, validation, statistics, trip, export, monetization, ads
  stores/        shared reactive state
  components/    presentational components (charts, tiles, list items)
  views/         screens
  router/        routes + onboarding guard
tests/           Vitest suites (run against real SQLite via sql.js)
android/         Capacitor Android project
```
