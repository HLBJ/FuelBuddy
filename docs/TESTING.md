# Phone test checklist

Run this on a real phone with a build installed from the Play **internal testing** link,
so purchases, the rating prompt and real ads behave as they will for users. Use a test
vehicle; don't tap live ads.

Tick each item, and note anything odd (with a screenshot) for fixing.

## First run
- [ ] Fresh install → onboarding → add a vehicle, with tank size → lands on Home
- [ ] Banner ad shows below the tab bar (free version); content isn't hidden behind it
- [ ] Hardware back on Home minimizes the app

## Fill-ups
- [ ] Add fill-up: the official 95 price is filled in; changing the date changes it; a price you type stays
- [ ] **Scan fuel slip → Take photo** of a real slip: litres, price, date and station are filled in
- [ ] Scan a crumpled or faded slip: anything wrong is easy to correct, and nothing crashes
- [ ] Save two full-tank fill-ups → consumption and cost per km appear
- [ ] Edit and delete a fill-up
- [ ] Partial fill-up (Filled to full off) is handled in consumption

## Dashboard
- [ ] "Fill up in about N days" card with the gauge (needs tank size and 2+ full fills)
- [ ] Vehicle without tank size → "Add your tank size" prompt opens the vehicle form
- [ ] After the month's price announcement: the price-change card appears, with the full-tank saving

## Reminders and notifications
- [ ] Add a licence disc reminder due in 8 days → notification permission prompt
- [ ] (Optional) Reminder due tomorrow → the notification arrives at 09:00 and opens the reminder
- [ ] Tick a licence reminder → next year's is created
- [ ] Settings → Price change alerts on/off

## Statistics and Pro
- [ ] Try Pro free for 7 days → ads disappear; advanced statistics and true cost unlock
- [ ] Running costs: add insurance, a service and a toll → True cost of driving shows cost per km and a breakdown
- [ ] **Unlock Pro** with a licence-test account → Play's test purchase sheet → Pro stays after the trial
- [ ] Uninstall, reinstall → Settings → Pro → **Restore purchase** → Pro is back

## Logbook
- [ ] Log a business trip → "Save and log the return trip" swaps the places and carries the odometer forward
- [ ] Business trip without destination/reason → clear error
- [ ] Set odometer readings → private km and business % update
- [ ] Export PDF (Pro) → share sheet → the PDF opens and looks right

## Trip and route
- [ ] Trip calculator estimates a cost from your history
- [ ] Route planner: search places, Use my location (permission prompt), Plan route, map with stops and toll plazas
- [ ] Navigate in Google Maps opens with the stops

## Data
- [ ] Back up data → save to Google Drive
- [ ] Delete all data → Restore from backup (from Drive) → everything is back
- [ ] Import: export CSV from another app (or FuelBuddy's own export) → Settings → Import → numbers look right
- [ ] Export to CSV → opens in Google Sheets or Excel

## Widget and shortcuts
- [ ] Long-press the home screen → Widgets → FuelBuddy quick add → tapping it opens Add fill-up
- [ ] Long-press the app icon → Add fill-up / Plan route / Reminders shortcuts work
- [ ] Open from the widget, close the app fully, open it normally → it opens on Home, not Add fill-up

## Robustness
- [ ] Airplane mode: everything except the route planner, ads and price updates works
- [ ] Dark mode (phone setting) looks right on every screen
- [ ] Large font size (phone accessibility setting): nothing is cut off
- [ ] After the 5th fill-up, the Play rating prompt may appear (Google decides whether to show it)
