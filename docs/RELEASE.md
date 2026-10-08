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

1. Create the app with package name `za.co.fuelbuddy.app`.
2. **Monetize → Products → In-app products:** create a **one-time, non-consumable** product, e.g.
   `fuelbuddy_pro`, priced at **R59** (or any price you choose; the app shows Play's localized price).
3. Complete the Data safety form. FuelBuddy collects no user data itself. Declare the AdMob SDK's
   advertising ID / device data usage for the free tier.
4. Add licence testers (Setup → License testing) to try purchases without being charged.

## 3. AdMob

1. Create an AdMob app for `za.co.fuelbuddy.app` and an **adaptive banner** ad unit.
2. Configure the GDPR/consent message in AdMob → Privacy & messaging. The app already requests and shows the
   UMP consent form when Google requires it.

## 4. Build-time configuration

Create `.env.production.local` (gitignored) from `.env.example`:

```properties
VITE_PLAY_PRO_PRODUCT_ID=fuelbuddy_pro
VITE_ADMOB_BANNER_ID=ca-app-pub-XXXXXXXXXXXXXXXX/NNNNNNNNNN
VITE_ADS_USE_TEST_IDS=false
```

Put the AdMob **app** ID in `%USERPROFILE%\.gradle\gradle.properties` (outside the repository):

```properties
ADMOB_APP_ID=ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY
```

If `ADMOB_APP_ID` is missing, Gradle uses Google's **sample** app ID. That is correct for development and
wrong for production.

## 5. Build the release bundle

```bash
npm run build && npx cap sync android
```

```bash
cd android && gradlew.bat bundleRelease
```

Upload `android/app/build/outputs/bundle/release/app-release.aab` to an internal testing track first.

Before each release, increase `versionCode` (and `versionName`) in `android/app/build.gradle`.

## 6. Verify on a real device (internal testing track)

- Fresh install → onboarding → add vehicle → fill-ups → statistics.
- Free tier shows a banner above the tab bar (real ads; **never click your own ads**).
- Buy Pro with a licence-test account → ads disappear and advanced statistics unlock.
- Uninstall, reinstall → **Restore purchase** brings Pro back.
- Airplane mode → every core feature still works; Pro stays unlocked.
- Settings → Export to CSV → share sheet opens and the file opens in a spreadsheet app.
