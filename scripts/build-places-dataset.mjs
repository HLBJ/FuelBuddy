#!/usr/bin/env node
/**
 * Rebuilds src/data/places-za.json (offline autocomplete for South African places)
 * from GeoNames: https://download.geonames.org/export/dump/ZA.zip (unzipped ZA.txt)
 * and admin1CodesASCII.txt.
 *
 *   node scripts/build-places-dataset.mjs path/to/ZA.txt path/to/admin1CodesASCII.txt
 *
 * GeoNames data is CC BY 4.0 — the attribution is stored in the file and shown in the app.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compactPlacesDataset } from '../src/services/placeIndex.js'

const [, , dumpFile, admin1File] = process.argv
if (!dumpFile || !admin1File) {
  console.error('Usage: node scripts/build-places-dataset.mjs ZA.txt admin1CodesASCII.txt')
  process.exit(1)
}
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const outFile = path.join(root, 'src', 'data', 'places-za.json')

const admin1 = {}
for (const line of fs.readFileSync(admin1File, 'utf8').split('\n')) {
  const [code, name] = line.split('\t')
  if (code?.startsWith('ZA.')) admin1[code.slice(3)] = name
}
const rows = fs.readFileSync(dumpFile, 'utf8').split('\n')
const data = compactPlacesDataset(rows, admin1)
if (data.places.length < 5000) throw new Error(`Only ${data.places.length} places — refusing to write a suspiciously small dataset.`)
fs.writeFileSync(outFile, JSON.stringify(data))
console.log(`Wrote ${outFile}: ${data.places.length} places in ${data.provinces.length} provinces`)
