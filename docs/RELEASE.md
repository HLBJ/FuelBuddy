# Releasing FuelBuddy to Google Play

Everything that can be prepared without the owner's accounts is done. The steps below need the owner's
Google Play Console and AdMob accounts, and a private signing key. None of these values are, or should
ever be, committed to Git.

## 1. Create the release signing key (once, keep it safe)

```bash
keytool -genkeypair -v -keystore fuelbuddy-release.jks -keyalg RSA -keysize 4096 -validity 10000 -alias fuelbuddy
```

Store the `.jks` file **outside** the repository and back it up. Then create `android/keystore.properties`
(already gitignored):

```properties
storeFile=C:/secure/fuelbuddy-release.jks
storePassword=********
keyAlias=fuelbuddy
keyPassword=********
```

`android/app/build.gradle` picks this file up automatically for release builds. Without it, the release
build is produced unsigned.

## 2. Google Play Console

1. Create the app with package name `coza.wacko.fuelbuddy`.
2. **Monetize → Products → In-app products:** create a **one-time, non-consumable** product, e.g.
   `fuelbuddy_pro`, priced at **R59** (or any price you choose; the app shows Play's localized price).
3. Complete the Data safety form. FuelBuddy collects no user data itself. Declare the AdMob SDK's
   advertising ID / device data usage for the free tier.
4. Add licence testers (Setup → License testing) to try purchases without being charged.

## 3. AdMob

Done: the AdMob app (`ca-app-pub-2782099330274635~6863135200`) and adaptive banner unit
(`ca-app-pub-2782099330274635/4533405200`) are configured. Release builds use them; debug builds always
use Google's test IDs, so **never install a release build on your own phone to "check the ads"**. Tapping
your own live ads is invalid traffic and can get the AdMob account suspended.

Still to do in AdMob:
1. **Privacy & messaging:** create the GDPR/consent message. The app already shows Google's UMP consent
   form when it is required.
2. After the app is published on Google Play, **link the AdMob app to the Play listing** (App settings).
   Live ads are limited until AdMob has reviewed the app.

## 4. Build-time configuration

The AdMob IDs are already in the repository (`.env.production` and `android/app/build.gradle`). They are
public identifiers, not secrets. The only value still missing is the Pro product ID. Set it in
`.env.production` once the product exists in Play Console:

```properties
VITE_PLAY_PRO_PRODUCT_ID=fuelbuddy_pro
```

## 4b. Route planner (map, routing, station data)

The route planner uses free OpenStreetMap services. Two of them need attention before a public release:

1. **Map tiles (required).** OpenStreetMap's own tile servers forbid distributing an app that uses them.
   Create a key with a tile provider that allows app traffic (for example MapTiler, Stadia Maps or
   Thunderforest, all of which have free tiers) and set it in `.env.production`:

   ```properties
   VITE_MAP_TILE_URL=https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=YOUR_KEY
   VITE_MAP_TILE_ATTRIBUTION=&copy; MapTiler &copy; OpenStreetMap contributors
   ```
2. **Routing and search.** The FOSSGIS router and Photon are community servers with fair-use limits. They are
   fine for launch volumes. If usage grows, point `VITE_ROUTER_URL` / `VITE_GEOCODER_URL` at a hosted or
   self-hosted OSRM/Photon.
3. **Refresh the bundled fuel stations and toll plazas** before each release:

   ```bash
   node scripts/build-poi-dataset.mjs
   ```

   If the public Overpass servers are overloaded, pass an Overpass-style JSON export built from a Geofabrik
   extract instead (see the script header). Refresh the autocomplete place list from GeoNames' `ZA.zip` too:

   ```bash
   node scripts/build-places-dataset.mjs ZA.txt admin1CodesASCII.txt
   ```
4. **Play Console data safety:** declare that *approximate/precise location* and *app activity: searches*
   are shared with third parties (map/routing services) for app functionality, only when the route planner is
   used, not collected by you, and not used for tracking.

## 4c. Fuel prices

1. Make sure `src/data/fuel-prices-za.json` includes the latest monthly prices (see
   [FUEL_PRICES.md](FUEL_PRICES.md)).
2. Optional but recommended: host the price file (free on GitHub Pages) and set
   `VITE_FUEL_PRICES_URL` in `.env.production`. Without it, price-change alerts only work
   for prices that shipped with the release.

## 4d. App size

Slip scanning bundles Google's on-device text recognition model, so each CPU type adds a
few MB. Always upload an **Android App Bundle (AAB)**: Google Play then delivers only the
files each phone needs. The debug APK, which contains every CPU type, is much larger than
what users download.

## 5. Build the release bundle

Release mode (real ads, real app ID):

```bash
npm run android:release
```

For day-to-day development use `npm run android:debug` (test ads).

Upload `android/app/build/outputs/bundle/release/app-release.aab` to an internal testing track first.

Before each release, increase `versionCode` (and `versionName`) in `android/app/build.gradle`.

## 6. Verify on a real device (internal testing track)

- Fresh install → onboarding → add vehicle → fill-ups → statistics.
- Free tier shows a banner above the tab bar (real ads; **never click your own ads**).
- Buy Pro with a licence-test account → ads disappear and advanced statistics unlock.
- Uninstall, reinstall → **Restore purchase** brings Pro back.
- Airplane mode → every core feature still works; Pro stays unlocked.
- Settings → Export to CSV → share sheet opens and the file opens in a spreadsheet app.
