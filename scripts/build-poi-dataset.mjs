#!/usr/bin/env node
/**
 * Rebuilds src/data/poi-za.json — every fuel station and toll booth in South Africa,
 * Lesotho and Eswatini from OpenStreetMap — via the Overpass API.
 *
 *   node scripts/build-poi-dataset.mjs            (tries several public servers)
 *   node scripts/build-poi-dataset.mjs input.json (use an Overpass JSON export you already have)
 *
 * Run before each release so the bundled data stays current. Data © OpenStreetMap
 * contributors (ODbL) — the attribution is stored in the file and shown in the app.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compactPoiDataset } from '../src/services/poiDataset.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const outFile = path.join(root, 'src', 'data', 'poi-za.json')

const QUERY = `[out:json][timeout:180];
(area["ISO3166-1"="ZA"][admin_level=2];area["ISO3166-1"="LS"][admin_level=2];area["ISO3166-1"="SZ"][admin_level=2];)->.a;
(nwr["amenity"="fuel"](area.a);nwr["barrier"="toll_booth"](area.a););
out center tags;`

const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

async function fetchFromOverpass() {
  for (let attempt = 0; attempt < SERVERS.length * 3; attempt += 1) {
    const url = SERVERS[attempt % SERVERS.length]
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'FuelBuddy-dataset-build/1.0' },
        body: 'data=' + encodeURIComponent(QUERY),
        signal: AbortSignal.timeout(240_000),
      })
      const text = await res.text()
      if (res.ok && text.startsWith('{')) return JSON.parse(text)
      console.warn(`${new URL(url).host}: HTTP ${res.status}`)
    } catch (error) {
      console.warn(`${new URL(url).host}: ${error.name}`)
    }
    await new Promise((r) => setTimeout(r, Math.min(120_000, 10_000 * 2 ** Math.floor(attempt / SERVERS.length))))
  }
  throw new Error('All Overpass servers failed. Try again later or pass an Overpass JSON export as an argument.')
}

const input = process.argv[2]
const raw = input ? JSON.parse(fs.readFileSync(input, 'utf8')) : await fetchFromOverpass()
const data = compactPoiDataset(raw.elements, { osmBase: raw.osm3s?.timestamp_osm_base ?? null })
if (data.fuel.length < 1000) throw new Error(`Only ${data.fuel.length} fuel stations — refusing to write a suspiciously small dataset.`)
fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, JSON.stringify(data))
console.log(`Wrote ${outFile}: ${data.fuel.length} fuel stations, ${data.tolls.length} toll booths, ${data.brands.length} brands (OSM ${data.osmBase})`)
