# Import formats

`src/services/csvImport.js` reads CSV exports from other fuel apps. It recognises the app
from the file where it can, then matches columns **by header name, never by position**:
several apps have added or moved columns between versions. Tests with one fixture per
format are in `tests/importFormats.test.js` and `tests/fixtures/imports/`.

Researched in October 2026 from real export files and open-source importers. Lines marked
*inferred* were not confirmed against a real file. When a user reports a file that doesn't
import, add it (with personal details removed) as a fixture and fix the parser.

| App | Recognised by | Units | Notes |
|---|---|---|---|
| Fuelio | `"## Vehicle"` / `"## Log"` sections | Vehicle row `DistUnit` (0 km, 1 mi), `FuelUnit` (0 L, 1 US gal, 2 UK gal) | `Price (optional)` is the **total**, `VolumePrice` the price per litre. `Full` 1/0, `Missed` 1/0. Costs join `CostTypeID` to `## CostCategories`; rows with `isTemplate=1` (reminders) or `isIncome=1` are skipped (*inferred* meaning). |
| Drivvo | `##Refuelling` (translated in other languages) | Header text: `Odometer (km)`, `Price / L` | `Fuel` is the fuel **name**; litres are in `Volume`. Up to three fuels per row (only the first is imported). Full tank: Yes/No in the phone's language. No missed flag. `##Expense` / `##Service` become running costs. |
| Fuelly app (ex-aCar) | `Type,MPG,Date,Time,…` | Headers say MPG/Gallons (*inferred*: metric users may get other headers) | `Type` Gas/Service; Service rows become costs. `Filled Up` Full/Partial/Reset (Reset treated as a restart of the consumption chain, *inferred*). Values carry `$` and thousands commas. |
| Fuelly website | `car_name`, `fuelup_date` | Header names `miles`/`km`, `gallons`/`litres` | `price` is **per unit**. `missed_fuelup`, `partial_fuelup` 1/0. |
| aCar | `Distance Unit` + `Volume Unit` columns | Per row | `R`-prefixed amounts, thousands commas, `dd-MM-yyyy` dates, Yes/No flags. |
| Spritmonitor | `Km-Stand` / `Tankart` | km/L (German export) | Semicolons, decimal commas, `dd.MM.yyyy`. Total only (`Kosten`). `Tankart` 1 full, 2 partial, 3 first fill. Costs are a separate file (not specially handled). English headers *not confirmed*. |
| Simply Auto | `Row ID` + `Record Type` | None in the file (assumed km/L) | Date split into `Day`, `Month`, `Year`. `Record Type` 0 fuel, 1 service, 2 expense. From the vendor's import guide, *not a real export*. |
| My Cars | `// mycar export file` | `preferences` entity | `distance` is the odometer when `refuelDistanceType` is `odometer`; `cost_pos_curr` is the total. `refuel_type` not used (*meaning inferred*). |
| LubeLogger | `IsFillToFull` | None in the file | `Cost` is the total; True/False flags. |
| FuelBuddy | `FuelBuddy fill-ups` title | km, L | Our own CSV export, including running costs. |

Anything else is read as a generic spreadsheet: a header row with a date, an odometer
reading (or trip distance), litres, and a price per litre or a total.

## General rules

- **Delimiter:** comma, semicolon or tab, whichever appears most.
- **Dates:** ISO, `d/m/y`, `m/d/y` (chosen from the whole column; day-first when it can't
  be told), `dd.mm.yy` and month names.
- **Numbers:** currency symbols are stripped. When a table writes decimals with a dot, a
  comma before three digits groups thousands (`37,625`); otherwise a comma is the decimal
  separator (`22,23`).
- **"price" on its own:** a total in some apps and a per-litre price in others. Per-litre
  prices barely change from fill to fill while totals follow the litres, so the column with
  the smaller relative spread wins.
- **Missed fill-ups:** FuelBuddy has no such flag, so a note is added to the entry.
- **Import rules** (`importService.js`): one transaction; rows go through the same
  validation as the forms; rows already present (same date and odometer) are skipped; rows
  whose odometer contradicts other fill-ups are rejected with a reason.

## Sources

- LubeLogger import aliases: https://github.com/hargata/lubelog/blob/main/MapProfile/ImportMappers.cs
- Fuelio samples and units: https://github.com/tigattack/lubelogger-fuelio-importer,
  https://github.com/dundee/fuelio2fuelly, https://github.com/Programistyk/FuelioImport
- Drivvo: https://github.com/milkway/drivvo (real export),
  https://github.com/alfhou/hammond/blob/master/server/service/drivvoImportService.go
- Fuelly app exports: https://github.com/akhilrex/hammond/issues/11
- Fuelly website export: fuelly.com forum threads 16323 and 16411; import spec https://www.fuelly.com/csv-import
- aCar: fuelly.com forum thread 16432
- Spritmonitor: https://github.com/dannymcc/may (tests), https://github.com/LukasMaly/PySpritmonitor
- Simply Auto: https://simplyauto.app/importguide.php
- My Cars: fuelly.com forum thread 19085
