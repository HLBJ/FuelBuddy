<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Trip calculator</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="fb-page">
      <VehicleSwitcher v-if="activeVehicle" />

      <form class="fb-form" novalidate @submit.prevent @keydown.enter="advanceOnEnter">
        <ion-list lines="full" class="inputs">
          <ion-item>
            <ion-input
              v-model="form.distance"
              label="Trip distance (km)"
              label-placement="stacked"
              inputmode="decimal"
              placeholder="e.g. 1400"
              :class="fieldClass('distance')"
              :error-text="errors.distance"
            />
          </ion-item>
          <ion-item>
            <ion-toggle v-model="form.roundTrip" justify="space-between">Return trip</ion-toggle>
          </ion-item>
          <ion-item>
            <ion-input
              v-model="form.consumption"
              label="Fuel consumption (L/100 km)"
              label-placement="stacked"
              inputmode="decimal"
              placeholder="e.g. 7.5"
              :class="fieldClass('consumption')"
              :error-text="errors.consumption"
              :helper-text="consumptionHelper"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="form.fuelPrice"
              label="Fuel price per litre"
              label-placement="stacked"
              inputmode="decimal"
              placeholder="e.g. 23.45"
              :class="fieldClass('fuelPrice')"
              :error-text="errors.fuelPrice"
              :helper-text="priceHelper"
            />
          </ion-item>
        </ion-list>
      </form>

      <div v-if="result" class="fb-card result" aria-live="polite">
        <div class="result-head">
          <span class="fb-badge-estimate">Estimate</span>
          <span class="fb-muted source">{{ sourceNote }}</span>
        </div>
        <div class="cost fb-tabular">{{ formatCurrency(result.cost, currency) }}</div>
        <div class="fb-muted">estimated fuel cost</div>
        <dl class="details fb-tabular">
          <div><dt>Distance</dt><dd>{{ formatDistance(result.totalDistance) }}</dd></div>
          <div><dt>Fuel required</dt><dd>{{ formatLitres(result.fuelRequired, 1) }}</dd></div>
          <div><dt>Consumption used</dt><dd>{{ formatConsumption(result.consumption) }}</dd></div>
          <div><dt>Cost per km</dt><dd>{{ formatCostPerKm(result.costPerKm, currency) }}</dd></div>
          <div v-if="result.tanksNeeded !== null">
            <dt>Tanks needed</dt>
            <dd>{{ formatNumber(result.tanksNeeded, 1) }} × {{ formatLitres(activeVehicle.tankCapacity, 0) }} tank</dd>
          </div>
        </dl>
        <p class="disclaimer fb-muted">
          Real costs vary with traffic, load, speed and price changes along the way.
        </p>
      </div>

      <div v-else class="fb-card placeholder fb-muted">
        Enter a distance, consumption and fuel price to estimate the cost of a trip.
        <template v-if="activeVehicle && !suggestion.consumption">
          Once you have recorded two full-tank fill-ups, your measured consumption is filled in automatically.
        </template>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { IonContent, IonHeader, IonInput, IonItem, IonList, IonPage, IonTitle, IonToggle, IonToolbar } from '@ionic/vue'
import VehicleSwitcher from '../components/VehicleSwitcher.vue'
import { useAppStore } from '../stores/appStore.js'
import { advanceOnEnter } from '../composables/useEnterToAdvance.js'
import { useServices } from '../services/appServices.js'
import { estimateTrip, suggestTripInputs } from '../services/tripCalculationService.js'
import { parseDecimal } from '../services/numberUtils.js'
import {
  formatConsumption, formatCostPerKm, formatCurrency, formatDate, formatDistance, formatLitres, formatNumber,
  toInputValue,
} from '../services/formatService.js'

const { state, activeVehicle, currency } = useAppStore()
const form = reactive({ distance: '', roundTrip: false, consumption: '', fuelPrice: '' })
const suggestion = ref({ consumption: null, fuelPrice: null })

async function loadSuggestion() {
  const vehicle = activeVehicle.value
  const previous = suggestion.value
  suggestion.value = vehicle
    ? suggestTripInputs(await useServices().fuel.listByVehicle(vehicle.id))
    : { consumption: null, fuelPrice: null }
  // Replace values only if the user has not typed their own.
  if (form.consumption === '' || form.consumption === toInputValue(previous.consumption))
    form.consumption = toInputValue(suggestion.value.consumption)
  if (form.fuelPrice === '' || form.fuelPrice === toInputValue(previous.fuelPrice))
    form.fuelPrice = toInputValue(suggestion.value.fuelPrice)
}

watch(() => [state.activeVehicleId, state.revision], loadSuggestion, { immediate: true })

const usingHistoryConsumption = computed(
  () => suggestion.value.consumption !== null && parseDecimal(form.consumption) === suggestion.value.consumption,
)

const consumptionHelper = computed(() => {
  if (usingHistoryConsumption.value)
    return `Based on your history (${formatDistance(suggestion.value.measuredDistance)} measured)`
  if (suggestion.value.consumption !== null) return `Your estimate · history says ${formatConsumption(suggestion.value.consumption)}`
  return 'Your estimate — typical cars use 6–10 L/100 km'
})

const priceHelper = computed(() => {
  const s = suggestion.value
  if (s.fuelPrice !== null && parseDecimal(form.fuelPrice) === s.fuelPrice)
    return `From your last fill-up (${formatDate(s.fuelPriceDate)})`
  return ''
})

const estimate = computed(() => {
  const anyInput = form.distance !== '' || form.consumption !== '' || form.fuelPrice !== ''
  if (!anyInput) return { errors: {}, result: null }
  return estimateTrip({ ...form, tankCapacity: activeVehicle.value?.tankCapacity })
})

// Only flag fields the user has filled in, so a half-completed form stays calm.
const errors = computed(() => {
  const all = estimate.value.errors || {}
  return Object.fromEntries(Object.entries(all).filter(([key]) => form[key] !== ''))
})
const result = computed(() => estimate.value.result)

const sourceNote = computed(() =>
  usingHistoryConsumption.value ? 'Uses your recorded consumption' : 'Uses your estimated consumption',
)

function fieldClass(field) {
  return { 'ion-invalid': Boolean(errors.value[field]), 'ion-touched': Boolean(errors.value[field]) }
}
</script>

<style scoped>
.inputs {
  margin: 12px 16px;
  border: 1px solid var(--fb-border);
  border-radius: var(--fb-radius);
  padding: 0;
}
.result-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.source {
  font-size: 0.75rem;
  text-align: right;
}
.cost {
  font-size: 2rem;
  font-weight: 750;
  margin-top: 10px;
  color: var(--ion-color-primary);
}
.details {
  margin: 16px 0 0;
  display: grid;
  gap: 8px;
}
.details div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.details dt {
  color: var(--fb-text-muted);
}
.details dd {
  margin: 0;
  font-weight: 600;
  text-align: right;
}
.disclaimer {
  font-size: 0.75rem;
  margin: 14px 0 0;
}
.placeholder {
  font-size: 0.9rem;
  line-height: 1.45;
}
</style>
