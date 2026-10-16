// Builds a FuelBuddy backup file full of realistic demo data, for store screenshots and
// demos. Uses the app's own services on an in-memory SQLite database.
//
//   node scripts/make-demo-backup.mjs [output.json] [today=YYYY-MM-DD]
//
// Restore the file in the app (Settings → Restore from backup) on a test device only.
import { writeFileSync } from 'node:fs'
import initSqlJs from 'sql.js'
import { createSqlJsDriver } from '../src/database/drivers/sqljsDriver.js'
import { runMigrations } from '../src/database/migrator.js'
import { createVehicleService } from '../src/services/vehicleService.js'
import { createFuelEntryService } from '../src/services/fuelEntryService.js'
import { createExpenseService } from '../src/services/expenseService.js'
import { createReminderService } from '../src/services/reminderService.js'
import { createLogbookService } from '../src/services/logbookService.js'
import { createBackup } from '../src/services/backupService.js'
import { addDays, monthKey, shiftMonth } from '../src/services/dateUtils.js'

const output = process.argv[2] || 'fuelbuddy-demo-backup.json'
const today = process.argv[3] || new Date().toISOString().slice(0, 10)
const db = createSqlJsDriver(await initSqlJs())
await runMigrations(db)

const vehicles = createVehicleService(db)
const fuel = createFuelEntryService(db, { today: () => today })
const expenses = createExpenseService(db, { today: () => today })
const reminders = createReminderService(db, { today: () => today })
const logbook = createLogbookService(db, { today: () => today })

const polo = await vehicles.create({
  name: 'Polo Vivo', make: 'Volkswagen', model: 'Polo Vivo 1.4', registration: 'CA 123-456', year: '2019',
  fuelType: 'petrol', tankCapacity: '45', currentOdometer: '58000',
})
const hilux = await vehicles.create({
  name: 'Hilux', make: 'Toyota', model: 'Hilux 2.4 GD-6', registration: 'CY 98-765', year: '2021',
  fuelType: 'diesel', tankCapacity: '80', currentOdometer: '41000',
})

// Official Gauteng 95 / 50ppm diesel prices by month (older months approximate).
const petrol = [22.1, 21.6, 21.9, 22.4, 23.0, 24.6, 26.63, 28.06, 26.1, 25.58, 26.92, 30.25]
const diesel = [21.4, 21.0, 21.3, 21.9, 22.6, 25.8, 31.38, 28.76, 25.17, 26.41, 29.56, 32.8]
const firstMonth = shiftMonth(monthKey(today), -11)

async function fillUps(vehicle, prices, { start, kmPerFill, baseConsumption, extra, stations }) {
  let odo = start
  for (let m = 0; m < 12; m += 1) {
    for (const day of ['03', '13', '23']) {
      const date = `${shiftMonth(firstMonth, m)}-${day}`
      if (date > addDays(today, -3)) continue
      const km = kmPerFill + Math.round(Math.sin(odo / 900) * 60)
      odo += km
      const consumption = baseConsumption + Math.cos(odo / 1300) * extra
      await fuel.create({
        vehicleId: vehicle.id, date, odometer: String(odo), litres: (Math.round(km * consumption) / 100).toFixed(2),
        pricePerLitre: String(prices[m] + (vehicle === hilux ? 1.2 : 0)), fuelStation: stations[odo % stations.length], notes: '', isFullTank: true,
      })
    }
  }
  return odo
}

const poloOdo = await fillUps(polo, petrol, { start: 58000, kmPerFill: 520, baseConsumption: 6.4, extra: 0.5, stations: ['Engen Main Rd', 'Shell Claremont', 'Sasol Rondebosch'] })
await fillUps(hilux, diesel, { start: 41000, kmPerFill: 640, baseConsumption: 9.1, extra: 0.6, stations: ['Engen N1 City', 'Shell Ultra City', 'TotalEnergies Bellville'] })

const month = (offset, day) => `${shiftMonth(monthKey(today), offset)}-${day}`
for (let i = -9; i <= 0; i += 1) {
  if (month(i, '15') <= today) await expenses.create({ vehicleId: polo.id, date: month(i, '15'), category: 'insurance', amount: '650', description: 'Monthly premium' })
}
const costs = [
  [-7, '08', 'service', 2450, '60 000 km service'], [-4, '20', 'tyres', 3980, '2 front tyres'], [-3, '02', 'licence', 612, 'Licence disc renewal'],
  [-2, '11', 'tolls', 286, 'N1 Huguenot return'], [-1, '05', 'parking', 180, 'Airport parking'], [0, '04', 'washing', 120, 'Car wash'],
]
for (const [offset, day, category, amount, description] of costs) {
  if (month(offset, day) <= today) await expenses.create({ vehicleId: polo.id, date: month(offset, day), category, amount: String(amount), description })
}

await reminders.create({ vehicleId: polo.id, type: 'licence', title: 'Renew licence disc', dueDate: addDays(today, 12) })
await reminders.create({ vehicleId: polo.id, type: 'service', title: '90 000 km service', dueOdometer: '90000' })

const trips = [
  [-1, 64, 'Office, Claremont', 'Bellville Business Park', 'Client meeting – Acme Logistics'],
  [-1, 66, 'Bellville Business Park', 'Office, Claremont', 'Return from client meeting'],
  [-6, 98, 'Office, Claremont', 'Stellenbosch', 'Site inspection – Winelands project'],
  [-9, 42, 'Office, Claremont', 'Cape Town CBD', 'Supplier visit – Harbour Electrical'],
]
let tripOdo = poloOdo
for (const [daysAgo, km, origin, destination, reason] of [...trips].reverse()) {
  await logbook.create({ vehicleId: polo.id, date: addDays(today, daysAgo), purpose: 'business', startOdometer: String(tripOdo), endOdometer: String(tripOdo + km), origin, destination, reason })
  tripOdo += km
}
await logbook.setReadings(polo.id, Number(today.slice(0, 4)) + (Number(today.slice(5, 7)) >= 3 ? 1 : 0), { openingOdometer: '64850', closingOdometer: '' })

await db.run("INSERT INTO settings (key, value, updated_at) VALUES ('onboardingComplete', 'true', ?)", [new Date().toISOString()])
const backup = await createBackup(db, { appVersion: 'demo' })
writeFileSync(output, JSON.stringify(backup))
console.log(`Wrote ${output}:`, Object.fromEntries(Object.entries(backup.tables).map(([k, v]) => [k, v.length])))
