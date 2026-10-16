# Releasing FuelBuddy: monetization and Google Play, step by step

Work through the phases in order. Steps marked **(code)** are done in this repository; tell
Claude the value and it will make the change. Everything else happens in Google's websites.

Nothing here may be committed to Git: the signing key, its passwords, or your account
details. The AdMob IDs and the Play product ID are public identifiers and are fine in the repo.

**Costs:** a one-time US$25 Play Console registration fee. Everything else (GitHub Pages,
AdMob, a MapTiler free plan) is free.

**Timeline:** about 3 weeks, mostly waiting. Identity verification takes a few days, and
new personal developer accounts must run a closed test with at least 12 testers for
14 days before the app can go public.

---

## Phase 1: Accounts (day 1)

### 1.1 Google Play developer account
1. Go to https://play.google.com/console/signup and sign in with the Google account that
   will own the app. Use one you'll keep for years, ideally a dedicated one.
2. Choose the account type:
   - **Personal**: quickest. Your name is shown as the developer unless you set a
     developer name. Requires the 12-tester closed test (Phase 7).
   - **Organisation**: for a registered company (for example Wacko (Pty) Ltd). Needs a
     D-U-N-S number, which is free from Dun & Bradstreet but can take a week or more.
     There is no 12-tester rule.
3. Pay the US$25 fee, and complete identity verification (ID document; organisations also
   need company documents).
4. Verify the contact email and phone number.

### 1.2 Payments profile (needed before you can sell Pro)
1. Play Console → **Setup → Payments profile**: create or attach a payments profile with
   your legal name and address.
2. Add a **South African bank account** for payouts, and complete the **tax information**.
   Google pays out monthly once your balance passes the minimum.
3. Google handles taxes on Play sales in many countries; check what your payments profile
   says for South Africa, and ask your accountant about income tax on what you earn.
4. Google keeps a 15% service fee on your first US$1 million a year (enrol in the 15% tier
   if Play Console asks). Of R59, you receive about R50 (less VAT where it applies).

### 1.3 AdMob payments
The AdMob app and banner ad unit already exist and are wired into the app.
1. In https://admob.google.com → **Payments**: add your address, tax information and bank
   account. AdMob pays monthly once earnings pass its payment threshold.
2. Never tap your own live ads, and never ask anyone to. Debug builds always show Google's
   test ads, so normal development is safe.

---

## Phase 2: A website for the privacy policy and app-ads.txt (day 1)

Google Play needs a public privacy policy URL, and AdMob needs an `app-ads.txt` file at the
root of your developer website. Both files are ready in [`site/`](../site/).

1. Replace `SUPPORT_EMAIL` (in `site/index.html` and `site/privacy.html`) with the support
   address you want users to see, and `PUBLISHER_NAME` (in `site/privacy.html`) with your name
   or company name. **(code)**
2. Create a free GitHub account if you don't have one, then a **public** repository named
   exactly **`<your-github-username>.github.io`**. The name matters: `app-ads.txt` only
   counts at the root of the domain.
3. Upload the four files from `site/` (`index.html`, `privacy.html`, `app-ads.txt`,
   `.nojekyll`).
4. Repository **Settings → Pages**: Source **Deploy from a branch**, branch **main**, folder
   **/ (root)**. After a minute, check that these load:
   - `https://<username>.github.io/`: your developer website
   - `https://<username>.github.io/privacy.html`: your privacy policy URL
   - `https://<username>.github.io/app-ads.txt`
5. A custom domain (for example fuelbuddy.co.za) is optional. If you add one later, update
   the Play listing's website and privacy URLs.

---

## Phase 3: Signing key (day 1, once, keep it forever)

1. Create the upload key (choose a strong password and write it down somewhere safe):

   ```bash
   keytool -genkeypair -v -keystore fuelbuddy-upload.jks -keyalg RSA -keysize 4096 -validity 10000 -alias fuelbuddy
   ```

   On this PC, `keytool` is in `C:\Program Files\Android\openjdk\jdk-21.0.8\bin\`.
2. Move the `.jks` file **outside the project folder** (for example `C:\secure\`), and back it
   up in two places: a password manager or encrypted drive, plus an offline copy.
3. Create `android/keystore.properties` (already ignored by Git):

   ```properties
   storeFile=C:/secure/fuelbuddy-upload.jks
   storePassword=...
   keyAlias=fuelbuddy
   keyPassword=...
   ```

4. Play App Signing (on by default) means Google holds the real app-signing key and this is
   only the *upload* key. If you ever lose it, Google can reset it (Play Console → App
   integrity), but that takes time. Don't lose it.

---

## Phase 4: Finish the app configuration

1. **Map tiles (required before public release).** OpenStreetMap's own tile servers don't
   allow use in published apps.
   - Create a free account at https://cloud.maptiler.com and copy your API key.
   - Give Claude the key. It goes in `.env.production` **(code)**:
     ```properties
     VITE_MAP_TILE_URL=https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=YOUR_KEY
     VITE_MAP_TILE_ATTRIBUTION=&copy; MapTiler &copy; OpenStreetMap contributors
     ```
   - In MapTiler, restrict the key to your app if the option is offered. The key is visible
     in the app, which is normal for map keys.
2. **Fuel prices:** make sure the latest month is in `src/data/fuel-prices-za.json` and
   your Google Drive copy ([FUEL_PRICES.md](FUEL_PRICES.md)). **(code)**
3. **Version:** for every upload, increase `versionCode` (1, 2, 3…) and set `versionName`
   (1.0.0, 1.0.1…) in `android/app/build.gradle`, and `version` in `src/config/appConfig.js`. **(code)**
4. **Refresh the bundled fuel stations and toll plazas** occasionally
   (`node scripts/build-poi-dataset.mjs`). **(code)**
5. The **Pro product ID** is set in Phase 6, after the first upload.

---

## Phase 5: Create the app in Play Console and upload the first build

### 5.1 Build the release bundle
```bash
npm run android:release
```
This builds with real ads and the release signing key. The file to upload is
`android/app/build/outputs/bundle/release/app-release.aab`. Don't install a release build
on your own phone to look at the ads.

### 5.2 Create the app
Play Console → **Create app**:
- App name: `FuelBuddy: Fuel & Petrol Log`
- Default language: English (United Kingdom), or English (United States)
- App or game: **App**. Free or paid: **Free** (Pro is an in-app purchase).
- Accept the declarations.

### 5.3 Upload to internal testing
1. **Test and release → Testing → Internal testing → Create new release.**
2. Accept **Play App Signing**, upload `app-release.aab`, and add release notes
   (for example "First test release").
3. **Testers:** create an email list with your own Google account (and anyone helping) and
   save. Copy the opt-in link, open it on your phone, accept, and install FuelBuddy from Play.

Internal testing works within minutes and needs no review, but the store listing and app
content (5.4 and 5.5) must be filled in before you can publish anything wider.

### 5.4 Store listing
**Grow users → Store presence → Main store listing.** Everything is ready to paste:
- Name, short and full description: [store-listing.md](store-listing.md)
- App icon (512 × 512): `store/play/app-icon-512.png`
- Feature graphic (1024 × 500): `store/play/feature-graphic.png`
- Phone screenshots (at least 2, up to 8): the seven files `store/play/01…07-*.png`
- Category: **Auto & Vehicles**. Contact email: your support address. Website:
  `https://<username>.github.io/`

### 5.5 App content (Policy → App content)
Answer each section:

| Section | Answer |
|---|---|
| Privacy policy | `https://<username>.github.io/privacy.html` |
| Ads | **Yes, my app contains ads** |
| App access | All functionality is available without special access (no login) |
| Content rating | Fill in the questionnaire: category *Utility, productivity, communication or other*; answer No to violence, sexuality, gambling and similar questions. Expect *Everyone / 3+*. Say **Yes** to "Does the app share the user's physical location?" only if Play asks about it for the route planner; it is shared with the routing service only when the user plans a route. |
| Target audience | **18 and over**. It's a driver's app, and choosing older ages avoids the extra Families policy rules for ads. |
| News app | No |
| Health apps | No health features |
| Financial features | My app doesn't provide any financial features |
| Government apps | No |
| Data safety | See below |
| Advertising ID | **Yes**, the app uses the advertising ID (AdMob), for **Advertising or marketing** |

**Data safety form** (FuelBuddy itself collects nothing; the declarations are for the
AdMob SDK and the online route planner):
- Does your app collect or share user data? **Yes** (because of AdMob and the route planner).
- Is all data encrypted in transit? **Yes** (HTTPS).
- Can users request deletion? Users delete everything in the app or by uninstalling. FuelBuddy
  keeps no data on a server.
- Data types. Follow Google's own guide for the AdMob part:
  https://developers.google.com/admob/android/privacy/play-data-disclosure
  - **Location → Approximate location**: collected and shared, for Advertising (AdMob, from
    the IP address) and App functionality (route planner).
  - **Location → Precise location**: shared, for App functionality, only when the user taps
    "Use my location" in the route planner. Optional for the user.
  - **App activity → Other actions / In-app search**: shared, for App functionality (place
    searches in the route planner).
  - **App info and performance → Crash logs, Diagnostics**: collected by AdMob, for
    Analytics/Advertising, as listed in Google's guide.
  - **Device or other IDs**: collected and shared, for Advertising (AdMob).
  - Photos: **not collected**. Slip photos are read on the phone and never leave it.
  - Fuel records, vehicles, trips and costs: **not collected**. They stay on the phone.

### 5.6 Countries
**Test and release → Production → Countries/regions:** start with **South Africa**. Add
neighbouring countries later if you like; fuel prices and SARS features are South African.

---

## Phase 6: Create FuelBuddy Pro (the in-app product)

Play Console only allows in-app products once an uploaded build includes the billing
library, which the 5.3 upload does.

1. **Monetize with Play → Products → One-time products → Create product.**
2. Product ID: **`fuelbuddy_pro`**. This can never be changed or reused, so type it carefully.
3. Name: `FuelBuddy Pro`. Description: `No ads, advanced statistics, the true cost of
   driving and SARS logbook export. One payment, yours to keep.`
4. Purchase option: **Buy**, non-consumable (bought once, owned forever).
5. Price: **R59.00** for South Africa. Let Play convert other countries, or set them by hand.
6. **Save → Activate.**
7. Tell Claude the product ID. It goes in `.env.production` as
   `VITE_PLAY_PRO_PRODUCT_ID=fuelbuddy_pro` **(code)**. Then increase `versionCode`, build
   again (5.1) and upload to internal testing.

### 6.1 Test purchases without paying
1. Play Console (all apps) → **Settings → License testing**: add your Google account and any
   testers' accounts, with response **RESPOND_NORMALLY**.
2. Install from the internal test link. In FuelBuddy: Settings → Upgrade to Pro → **Unlock Pro**.
   The Play purchase sheet says it is a test purchase and nothing is charged.
3. Check that ads disappear, Pro features unlock, and reinstalling followed by
   **Restore purchase** brings Pro back.
4. Test-purchase refunds: Play Console → **Order management**.

---

## Phase 7: Testing before going public

### 7.1 Internal test (you)
Run [TESTING.md](TESTING.md) on your phone: every feature, plus purchase, restore,
airplane mode and the real-ads banner (look, don't tap).

### 7.2 Closed test (required for new personal accounts)
1. **Test and release → Testing → Closed testing → Create track**. Upload the same AAB.
2. Add at least **12 testers** (Google accounts) through an email list or Google Group. Family,
   friends and colleagues with Android phones are fine.
3. Each tester opens the opt-in link, joins the test and installs the app. They must stay
   opted in for **14 days in a row**. Ask them to use it and send feedback.
4. After 14 days, Play Console's dashboard shows **Apply for production**. Answer the
   questions about your testing; review takes about 1–7 days.

Organisation accounts can skip the 12-tester rule, but a short closed test is still wise.

---

## Phase 8: Production release

1. **Test and release → Production → Create new release**. Promote the tested build, or
   upload a new one with a higher `versionCode`.
2. Release notes, for example: `First release: fuel log, slip scanning, SA fuel prices and
   alerts, SARS logbook, reminders and route planner.`
3. **Staged rollout:** start at 20%, watch **Quality → Android vitals** and reviews for a few
   days, then go to 100%.
4. Submit for review (usually 1–3 days for a new app).

### 8.1 Right after publishing: AdMob
1. AdMob → **Apps → FuelBuddy → App settings → Link to app store**: find FuelBuddy on Google
   Play and link it. Ads are limited until AdMob reviews the app (a few days).
2. AdMob → **Apps → View all apps → app-ads.txt**: check it shows **Found** for your
   developer website. If not, check that the Play listing's website matches your site.
3. AdMob → **Privacy & messaging → GDPR**: create and publish a consent message for FuelBuddy.
   The app already shows it when Google says it's required (EU/UK users). South African
   users normally don't see it.
4. Earnings appear the day after; payouts follow AdMob's monthly schedule.

---

## Phase 9: After launch (monthly routine)

- **Fuel prices:** around the end of each month, when the DMPR announces the new prices,
  update the JSON and upload a new version of the Google Drive file (Manage versions).
  See [FUEL_PRICES.md](FUEL_PRICES.md).
- **Reviews:** reply in Play Console → Ratings and reviews; quick, friendly replies lift ratings.
- **Updates:** increase `versionCode` every time, build with `npm run android:release`, and
  upload to internal testing first, then production.
- **Android vitals:** fix crashes and ANRs that show up there.
- **Target API level:** Google requires apps to target a recent Android version (currently
  API 36). Each year, update the target SDK when Play Console warns you.

---

## Quick reference

| Item | Value / location |
|---|---|
| Package name | `coza.wacko.fuelbuddy` |
| AdMob app ID | `ca-app-pub-2782099330274635~6863135200` (release builds) |
| AdMob banner unit | `ca-app-pub-2782099330274635/4533405200` (release builds) |
| Pro product ID | `fuelbuddy_pro` (set in `.env.production` once created) |
| Pro price | R59, set in Play Console. The app shows Play's price; R59 is only a fallback in `src/config/monetization.js` |
| Trial | 7 days, in the app (`src/services/engagementService.js`) |
| Release build | `npm run android:release` → `android/app/build/outputs/bundle/release/app-release.aab` |
| Signing | `android/keystore.properties` → your `.jks` (never in Git) |
| Store text and images | `docs/store-listing.md`, `store/play/` |
| Website files | `site/` (privacy policy, app-ads.txt) |
