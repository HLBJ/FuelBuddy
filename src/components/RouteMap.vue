<template>
  <div class="route-map-wrap">
    <div ref="mapEl" class="route-map" role="application" aria-label="Route map" />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { mapsConfig } from '../config/maps.js'

const props = defineProps({
  route: { type: Array, default: () => [] }, // [{lat, lon}]
  origin: { type: Object, default: null },
  destination: { type: Object, default: null },
  candidates: { type: Array, default: () => [] }, // stations along the route
  selectedIds: { type: Array, default: () => [] }, // ordered ids of chosen stops
  tolls: { type: Array, default: () => [] },
})
const emit = defineEmits(['toggle-stop'])

const mapEl = ref(null)
let map = null
let routeLayer = null
let markerLayer = null
let resizeObserver = null

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const pin = (cls, html = '', size = 28) =>
  L.divIcon({ className: `fb-pin ${cls}`, html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] })

function drawRoute() {
  if (!map) return
  routeLayer?.remove()
  routeLayer = null
  if (props.route.length > 1) {
    routeLayer = L.polyline(props.route.map((p) => [p.lat, p.lon]), { className: 'fb-route-line', weight: 5, opacity: 0.9 }).addTo(map)
    map.fitBounds(routeLayer.getBounds(), { padding: [24, 24] })
  } else if (props.origin) {
    map.setView([props.origin.lat, props.origin.lon], 11)
  }
}

function drawMarkers() {
  if (!map) return
  markerLayer?.clearLayers()
  const selected = new Map(props.selectedIds.map((id, i) => [id, i + 1]))
  for (const c of props.candidates) {
    if (selected.has(c.id)) continue
    L.marker([c.lat, c.lon], { icon: pin('fb-pin-candidate', '', 14), title: c.name, keyboard: false })
      .bindTooltip(`${esc(c.name)} · ${c.alongKm} km`)
      .on('click', () => emit('toggle-stop', c))
      .addTo(markerLayer)
  }
  for (const t of props.tolls) {
    L.marker([t.lat, t.lon], { icon: pin('fb-pin-toll', 'T', 22), title: t.name || 'Toll plaza' })
      .bindTooltip(`${esc(t.name || 'Toll plaza')} · ${t.alongKm} km`)
      .addTo(markerLayer)
  }
  for (const c of props.candidates) {
    const n = selected.get(c.id)
    if (!n) continue
    L.marker([c.lat, c.lon], { icon: pin('fb-pin-stop', String(n), 30), title: c.name, zIndexOffset: 1000 })
      .bindTooltip(`Stop ${n}: ${esc(c.name)} · ${c.alongKm} km`)
      .on('click', () => emit('toggle-stop', c))
      .addTo(markerLayer)
  }
  if (props.origin) L.marker([props.origin.lat, props.origin.lon], { icon: pin('fb-pin-end', 'A', 30), zIndexOffset: 2000 }).addTo(markerLayer)
  if (props.destination) L.marker([props.destination.lat, props.destination.lon], { icon: pin('fb-pin-end', 'B', 30), zIndexOffset: 2000 }).addTo(markerLayer)
}

/** Leaflet needs a size recalculation when the map's container changes size. */
function invalidate() {
  map?.invalidateSize()
}

onMounted(() => {
  map = L.map(mapEl.value, { zoomControl: true, attributionControl: true }).setView([-29, 24], 5)
  L.tileLayer(mapsConfig.tileUrl, { maxZoom: 19, attribution: mapsConfig.tileAttribution }).addTo(map)
  markerLayer = L.layerGroup().addTo(map)
  resizeObserver = new ResizeObserver(() => invalidate())
  resizeObserver.observe(mapEl.value)
  drawRoute()
  drawMarkers()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  map?.remove()
  map = null
})

watch(() => props.route, () => { drawRoute(); drawMarkers() })
watch(() => [props.candidates, props.selectedIds, props.tolls, props.origin, props.destination], drawMarkers, { deep: true })

defineExpose({ invalidate })
</script>

<style scoped>
.route-map-wrap {
  margin: 0 16px 12px;
  border-radius: var(--fb-radius);
  overflow: hidden;
  border: 1px solid var(--fb-border);
}
.route-map {
  height: 46vh;
  min-height: 260px;
  background: var(--fb-surface-muted);
}
</style>

<style>
/* Leaflet markers are created outside Vue's scoped styles. */
.fb-route-line {
  stroke: var(--ion-color-primary);
}
.fb-pin {
  display: grid;
  place-items: center;
  border-radius: 50%;
  font: 700 13px/1 system-ui, sans-serif;
  color: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
}
.fb-pin-stop {
  background: #0b6e4f;
  border: 2px solid #fff;
}
.fb-pin-candidate {
  background: #8a948f;
  border: 2px solid #fff;
}
.fb-pin-toll {
  background: #e07b00;
  border: 2px solid #fff;
  border-radius: 6px;
  font-size: 11px;
}
.fb-pin-end {
  background: #1f2a25;
  border: 2px solid #fff;
}
.leaflet-container {
  font: inherit;
}
</style>
