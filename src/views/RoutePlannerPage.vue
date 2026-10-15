<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/trip" />
        </ion-buttons>
        <ion-title>Route planner</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="fb-page">
      <!-- 1. Start and destination -->
      <div class="fb-card">
        <PlaceSearch ref="fromField" v-model="origin" v-model:text="fromText" label="From" allow-location />
        <PlaceSearch ref="toField" v-model="destination" v-model:text="toText" label="To" :near="origin" class="to" />
        <p v-if="sameError" class="error">{{ sameError }}</p>
        <ion-button expand="block" class="plan" :disabled="!canPlan || planning" @click="planRoute">
          <ion-spinner v-if="planning" slot="start" name="crescent" />
          {{ route ? 'Re-plan route' : 'Plan route' }}
        </ion-button>
        <p v-if="routeError" class="error" role="alert">{{ routeError }}</p>
        <p class="hint fb-muted">Route planning needs internet. Your fuel log stays on this phone.</p>
      </div>

      <template v-if="route">
        <RouteMap
          :route="route.points"
          :origin="origin"
          :destination="destination"
          :candidates="candidates"
          :selected-ids="selectedIds"
          :tolls="tolls"
          @toggle-stop="toggleStop"
        />

        <!-- Route summary -->
        <div class="fb-card summary fb-tabular">
          <div><span class="fb-muted">Distance</span><strong>{{ formatDistance(route.distanceKm) }}</strong></div>
          <div><span class="fb-muted">Drive time</span><strong>{{ formatDuration(route.durationMin) }}</strong></div>
          <div><span class="fb-muted">Toll plazas</span><strong>{{ tolls.length }}</strong></div>
          <div v-if="estimate"><span class="fb-muted">Fuel (est.)</span><strong>{{ formatLitres(estimate.fuelRequired, 0) }} · {{ formatCurrency(estimate.cost, currency) }}</strong></div>
        </div>
        <p v-if="estimate" class="note fb-muted">
          Estimate at {{ formatConsumption(estimate.consumption) }} and {{ formatPricePerLitre(estimate.fuelPrice, currency) }}
          {{ consumptionFromHistory ? '(your history)' : '(typical car)' }}. Toll fees are not included.
        </p>

        <!-- 2. How many stops -->
        <div class="fb-card">
          <h3 class="card-title">How many fuel stops?</h3>
          <div class="stepper">
            <ion-button fill="outline" size="small" aria-label="Fewer stops" :disabled="stopCount <= 0" @click="stopCount -= 1">
              <ion-icon slot="icon-only" :icon="removeOutline" />
            </ion-button>
            <span class="count fb-tabular" aria-live="polite">{{ stopCount }}</span>
            <ion-button fill="outline" size="small" aria-label="More stops" :disabled="stopCount >= PLANNER_LIMITS.maxStops" @click="stopCount += 1">
              <ion-icon slot="icon-only" :icon="addOutline" />
            </ion-button>
          </div>
          <p class="hint fb-muted">{{ suggestionText }}</p>
          <ion-button expand="block" :disabled="stationsLoading" @click="findStops">
            <ion-spinner v-if="stationsLoading" slot="start" name="crescent" />
            Find fuel stops
          </ion-button>
          <p v-if="stationsError" class="error" role="alert">{{ stationsError }}</p>
        </div>

        <!-- 3. Chosen stops -->
        <div v-if="searchedStops" class="fb-card">
          <div class="title-row">
            <h3 class="card-title">Your fuel stops</h3>
            <ion-button v-if="isCustomised" size="small" fill="clear" @click="resetToBest">Use best</ion-button>
          </div>
          <p v-if="!candidates.length" class="fb-muted">No fuel stations found within {{ PLANNER_LIMITS.maxStationDetourKm }} km of this route.</p>
          <p v-else-if="!selectedStops.length" class="fb-muted">No stops selected. Tap a grey dot on the map or a station below to add one.</p>
          <ol v-else class="stops">
            <li v-for="(s, i) in selectedStops" :key="s.id">
              <span class="badge">{{ i + 1 }}</span>
              <div class="stop-text">
                <strong>{{ s.name }}</strong>
                <span class="fb-muted fb-tabular">{{ formatDistance(s.alongKm) }} from start · {{ detourText(s.detourKm) }}</span>
              </div>
              <ion-button fill="clear" size="small" :aria-label="`Remove ${s.name}`" @click="toggleStop(s)">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </li>
          </ol>
          <div v-if="legWarnings.length" class="warning" role="status">
            <ion-icon :icon="warningOutline" aria-hidden="true" />
            <span>{{ legWarnings.join(' ') }}</span>
          </div>
          <p v-if="selectedStops.length < stopCount && candidates.length" class="fb-muted small">
            Only {{ selectedStops.length }} well-spaced station{{ selectedStops.length === 1 ? '' : 's' }} found for {{ stopCount }} stops.
          </p>

          <ion-accordion-group v-if="candidates.length">
            <ion-accordion value="all">
              <ion-item slot="header" lines="none" class="acc-head">
                <ion-label>All {{ candidates.length }} stations on the route</ion-label>
              </ion-item>
              <ion-list slot="content" lines="full" class="all-list">
                <ion-item v-for="c in candidates" :key="c.id" button detail="false" @click="toggleStop(c)">
                  <ion-checkbox slot="start" :checked="selectedIds.includes(c.id)" :aria-label="c.name" />
                  <ion-label class="ion-text-wrap">
                    {{ c.name }}
                    <p class="fb-tabular">{{ formatDistance(c.alongKm) }} · {{ detourText(c.detourKm) }}</p>
                  </ion-label>
                </ion-item>
              </ion-list>
            </ion-accordion>
          </ion-accordion-group>
        </div>

        <!-- Toll plazas -->
        <div v-if="tolls.length" class="fb-card">
          <h3 class="card-title">Toll plazas on this route</h3>
          <ul class="tolls fb-tabular">
            <li v-for="t in tolls" :key="t.id">
              <span class="toll-badge">T</span>
              <span>{{ t.name || 'Toll plaza' }}</span>
              <span class="fb-muted">{{ formatDistance(t.alongKm) }}</span>
            </li>
          </ul>
        </div>

        <!-- 4. Hand-off -->
        <div class="fb-form-actions">
          <ion-button expand="block" size="large" @click="navigate">
            <ion-icon slot="start" :icon="navigateOutline" />
            Navigate in Google Maps
          </ion-button>
          <p class="hint fb-muted center">
            Opens Google Maps with {{ selectedStops.length ? `your ${selectedStops.length} fuel stop${selectedStops.length === 1 ? '' : 's'} as waypoints` : 'the route' }}.
          </p>
        </div>

        <p class="attribution fb-muted">
          Map data © OpenStreetMap contributors. Stations and toll plazas: OpenStreetMap{{ datasetDate ? `, ${datasetDate}` : '' }}.
          Routing: FOSSGIS / OSRM. Search: Photon by Komoot, Nominatim; place names: GeoNames (CC BY 4.0).
        </p>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import {
  IonAccordion, IonAccordionGroup, IonBackButton, IonButton, IonButtons, IonCheckbox, IonContent, IonHeader, IonIcon,
  IonItem, IonLabel, IonList, IonPage, IonSpinner, IonTitle, IonToolbar,
} from '@ionic/vue'
import { addOutline, closeOutline, navigateOutline, removeOutline, warningOutline } from 'ionicons/icons'
import PlaceSearch from '../components/PlaceSearch.vue'
import RouteMap from '../components/RouteMap.vue'
import { useAppStore } from '../stores/appStore.js'
import { useServices } from '../services/appServices.js'
import { fetchRoute, openExternalNavigation } from '../services/geoService.js'
import { loadPoiDataset } from '../services/poiDataset.js'
import { createRouteIndex } from '../services/geoUtils.js'
import {
  PLANNER_LIMITS, chooseBestStops, googleMapsDirectionsUrl, isSamePlace, legsForStops, stationsAlongRoute,
  suggestStopCount, tollPlazasAlongRoute, vehicleRangeKm,
} from '../services/routePlannerService.js'
import { estimateTrip, suggestTripInputs } from '../services/tripCalculationService.js'
import {
  formatConsumption, formatCurrency, formatDate, formatDistance, formatLitres, formatNumber, formatPricePerLitre,
} from '../services/formatService.js'
import { useFeedback } from '../composables/useFeedback.js'

/** Used when the vehicle has no fill-up history yet. */
const TYPICAL_CONSUMPTION = 8
const TYPICAL_PRICE = 23

const { activeVehicle, currency, state } = useAppStore()
const feedback = useFeedback()

const origin = ref(null)
const destination = ref(null)
const fromText = ref('')
const toText = ref('')
const fromField = ref(null)
const toField = ref(null)
// Typed text is enough: Plan route resolves it to the best match.
const canPlan = computed(() => (origin.value || fromText.value.trim().length >= 2) && (destination.value || toText.value.trim().length >= 2))
const route = ref(null)
const planning = ref(false)
const routeError = ref('')
const sameError = ref('')

const stopCount = ref(0)
const candidates = ref([])
const bestIds = ref([])
const selectedIds = ref([])
const tolls = ref([])
const searchedStops = ref(false)
const stationsLoading = ref(false)
const stationsError = ref('')
const datasetDate = ref('')
let routeIndex = null

// Vehicle history → consumption and price for estimates and range.
const history = ref({ consumption: null, fuelPrice: null })
watch(() => [state.activeVehicleId, state.revision], async () => {
  const v = activeVehicle.value
  history.value = v ? suggestTripInputs(await useServices().fuel.listByVehicle(v.id)) : { consumption: null, fuelPrice: null }
}, { immediate: true })

const consumptionFromHistory = computed(() => history.value.consumption !== null)
const consumption = computed(() => history.value.consumption ?? TYPICAL_CONSUMPTION)
const rangeKm = computed(() => vehicleRangeKm(activeVehicle.value?.tankCapacity, consumption.value))

const estimate = computed(() => {
  if (!route.value) return null
  const r = estimateTrip({
    distance: route.value.distanceKm,
    consumption: consumption.value,
    fuelPrice: history.value.fuelPrice ?? TYPICAL_PRICE,
  })
  return r.valid ? r.result : null
})

const suggested = computed(() => (route.value ? suggestStopCount(route.value.distanceKm, rangeKm.value) : 0))
const suggestionText = computed(() => {
  const v = activeVehicle.value
  if (rangeKm.value) return `Suggested: ${suggested.value}, based on ${v.name}'s range of about ${formatDistance(rangeKm.value)} per tank.`
  return `Suggested: ${suggested.value} (one stop roughly every ${PLANNER_LIMITS.defaultLegKm} km). Add your tank size to the vehicle for a better suggestion.`
})

const byId = computed(() => new Map(candidates.value.map((c) => [c.id, c])))
const selectedStops = computed(() => selectedIds.value.map((id) => byId.value.get(id)).filter(Boolean).sort((a, b) => a.alongKm - b.alongKm))
const isCustomised = computed(() => selectedIds.value.join() !== bestIds.value.join())
const legWarnings = computed(() => {
  if (!route.value || !searchedStops.value || !rangeKm.value) return []
  const long = legsForStops(selectedStops.value, route.value.distanceKm, rangeKm.value).filter((l) => l.tooLong)
  return long.length ? [`${long.length} leg${long.length === 1 ? ' is' : 's are'} longer than ¾ of your tank range (${long.map((l) => formatDistance(l.km)).join(', ')}). Consider more stops.`] : []
})

function resetStops() {
  candidates.value = []
  bestIds.value = []
  selectedIds.value = []
  searchedStops.value = false
  stationsError.value = ''
}

async function planRoute() {
  routeError.value = ''
  sameError.value = ''
  planning.value = true
  const [from, to] = [await fromField.value?.resolve(), await toField.value?.resolve()]
  await nextTick() // let the "place changed" reset run before the new route is set
  planning.value = false
  if (!from || !to) return
  if (isSamePlace(origin.value, destination.value)) {
    sameError.value = 'Start and destination are the same place.'
    return
  }
  planning.value = true
  try {
    const r = await fetchRoute(origin.value, destination.value)
    routeIndex = createRouteIndex(r.points)
    route.value = r
    resetStops()
    stopCount.value = suggestStopCount(r.distanceKm, rangeKm.value)
    // Toll plazas are shown straight away (bundled data, no extra request).
    const data = await loadPoiDataset()
    datasetDate.value = data.osmBase ? formatDate(data.osmBase.slice(0, 10)) : ''
    tolls.value = tollPlazasAlongRoute(r.points, data.tolls, { index: routeIndex })
  } catch (e) {
    routeError.value = e.message
  } finally {
    planning.value = false
  }
}

async function findStops() {
  if (!route.value) return
  stationsLoading.value = true
  stationsError.value = ''
  try {
    const data = await loadPoiDataset()
    candidates.value = stationsAlongRoute(route.value.points, data.stations, { index: routeIndex })
    bestIds.value = chooseBestStops(candidates.value, stopCount.value, route.value.distanceKm).map((s) => s.id)
    selectedIds.value = [...bestIds.value]
    searchedStops.value = true
  } catch (e) {
    stationsError.value = e.message
  } finally {
    stationsLoading.value = false
  }
}

function toggleStop(station) {
  if (selectedIds.value.includes(station.id)) {
    selectedIds.value = selectedIds.value.filter((id) => id !== station.id)
    return
  }
  if (selectedIds.value.length >= PLANNER_LIMITS.maxStops) {
    feedback.toast(`Google Maps accepts at most ${PLANNER_LIMITS.maxStops} stops.`)
    return
  }
  selectedIds.value = [...selectedIds.value, station.id]
  searchedStops.value = true
}

function resetToBest() {
  selectedIds.value = [...bestIds.value]
}

async function navigate() {
  try {
    await openExternalNavigation(googleMapsDirectionsUrl(origin.value, destination.value, selectedStops.value))
  } catch (e) {
    feedback.error(`Could not open Google Maps: ${e.message}`)
  }
}

// A new start or destination invalidates the planned route.
watch([origin, destination], () => {
  route.value = null
  tolls.value = []
  resetStops()
})

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return h ? `${h} h ${m} min` : `${m} min`
}

function detourText(km) {
  if (km < 0.1) return 'on the route'
  return km < 1 ? `${Math.round(km * 1000)} m off route` : `${formatNumber(km, 1)} km off route`
}
</script>

<style scoped>
.to {
  margin-top: 8px;
}
.plan {
  margin-top: 12px;
}
.hint {
  font-size: 0.8rem;
  margin: 8px 0 0;
}
.center {
  text-align: center;
}
.error {
  color: var(--ion-color-danger);
  font-size: 0.85rem;
  margin: 8px 0 0;
}
.summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.summary div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.8rem;
}
.summary strong {
  font-size: 1rem;
}
.note {
  font-size: 0.78rem;
  margin: -4px 20px 12px;
  line-height: 1.4;
}
.card-title {
  font-size: 0.95rem;
  margin: 0 0 10px;
}
.title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.stepper {
  display: flex;
  align-items: center;
  gap: 16px;
}
.count {
  font-size: 1.6rem;
  font-weight: 700;
  min-width: 2ch;
  text-align: center;
}
.stops {
  list-style: none;
  padding: 0;
  margin: 0;
}
.stops li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--fb-border);
}
.stops li:last-child {
  border-bottom: none;
}
.badge {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #0b6e4f;
  color: #fff;
  font-weight: 700;
  flex-shrink: 0;
}
.stop-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  font-size: 0.9rem;
}
.stop-text span {
  font-size: 0.78rem;
}
.warning {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-top: 10px;
  padding: 10px;
  border-radius: 10px;
  background: rgba(var(--ion-color-warning-rgb), 0.15);
  font-size: 0.82rem;
}
.warning ion-icon {
  color: var(--ion-color-warning-shade);
  flex-shrink: 0;
  font-size: 18px;
}
.small {
  font-size: 0.8rem;
}
.acc-head {
  --padding-start: 0;
  --background: transparent;
  font-size: 0.9rem;
}
.all-list {
  padding: 0;
  max-height: 320px;
  overflow-y: auto;
}
.tolls {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 0.88rem;
}
.tolls li {
  display: grid;
  grid-template-columns: 26px 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 6px 0;
}
.toll-badge {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: #e07b00;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: grid;
  place-items: center;
}
.attribution {
  font-size: 0.7rem;
  margin: 0 20px 24px;
  text-align: center;
}
</style>
