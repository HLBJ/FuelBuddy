# Toll tariffs

FuelBuddy prices the toll plazas on a planned route from
[`src/data/toll-tariffs-za.json`](../src/data/toll-tariffs-za.json). The app also checks a
copy of that file on Google Drive (about once a day), so new tariffs reach phones without an
app update.

SANRAL changes toll tariffs once a year, on **1 March**, and announces them in February.
Chapman's Peak (a provincial toll) changes on **1 July**.

## Yearly update (February, about 15 minutes)

1. Get SANRAL's new **toll tariff poster** (PDF). It's linked from
   https://www.nra.co.za/publications/tolls, and N3TC (n3tc.co.za) posts the same poster.
   The current file's `source` field shows last year's link.
2. Copy `src/data/toll-tariffs-za.json`, and for every plaza update the four prices
   (Class 1 to 4, in rand, including VAT). Set `effectiveFrom` to the new date, for example
   `"2027-03-01"`. Or send the PDF to Claude, which can do this and check it.
3. Run `npm test`. The file is checked: every plaza needs a name and four prices between
   R0 and R5 000 (or `null` when a class may not use it), and `effectiveFrom` must be a
   real date.
4. Upload it to Google Drive as a **new version** of the existing toll file (below).

You can upload before 1 March: phones download the file but keep using the old tariffs
until the `effectiveFrom` date. Keep the file in the repository up to date too, so that new
installs start with the latest tariffs.

**Rules for the file:**
- `names` lists the plaza names as they appear in the map data. Several spellings are fine.
- Mark ramp plazas with `"ramp": true`; they're only charged where a trip joins or leaves
  the highway.
- Never guess a price. Use `null` if it isn't published.

## Hosting the file on Google Drive (once)

1. Upload `src/data/toll-tariffs-za.json` to your Google Drive.
2. Share it as **Anyone with the link** (Viewer) and copy the link.
3. Done: the link is set as `DEFAULT_TOLL_TARIFFS_URL` in `src/config/tollTariffs.js`
   (`VITE_TOLL_TARIFFS_URL` in `.env.production` overrides it).
4. Each year, replace the file with **File information → Manage versions → Upload new
   version**, so the link never changes.
