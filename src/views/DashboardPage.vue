<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>FuelBuddy</ion-title>
        <ion-buttons slot="end">
          <ion-button router-link="/vehicles" aria-label="Manage vehicles">
            <ion-icon slot="icon-only" :icon="carSportOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="fb-page">
      <EmptyState
        v-if="!activeVehicle"
        :icon="carSportOutline"
        title="Add your first vehicle"
        message="FuelBuddy tracks fill-ups per vehicle. Add a vehicle to start recording fuel."
      >
        <ion-button expand="block" router-link="/vehicles/new">Add vehicle</ion-button>
      </EmptyState>

      <template v-else>
        <VehicleSwitcher />

        <div class="quick-actions">
          <ion-button expand="block" router-link="/entries/new">
            <ion-icon slot="start" :icon="addCircleOutline" />
            Add fill-up
          </ion-button>
          <ion-button expand="block" fill="outline" router-link="/tabs/trip">
            <ion-icon slot="start" :icon="mapOutline" />
            Trip cost
          </ion-button>
        </div>

        <div v-if="loading" class="ion-text-center ion-padding"><ion-spinner /></div>

        <template v-else-if="stats">
          <div class="fb-grid-2">
            <StatTile
              label="Average consumption"
              :value="formatConsumption(stats.averageConsumption)"
              :available="stats.hasEnoughData"
              :hint="stats.hasEnoughData ? `Over ${formatDistance(stats.measuredDistance)}` : 'Needs 2 full-tank fill-ups'"
            />
            <StatTile
              label="Cost per km"
              :value="formatCostPerKm(stats.averageCostPerKm, currency)"
              :available="stats.hasEnoughData"
              :hint="stats.hasEnoughData ? 'Measured fuel cost' : 'Needs 2 full-tank fill-ups'"
            />
            <StatTile
              label="Spent this month"
              :value="formatCurrency(stats.thisMonthSpend, currency)"
              :hint="`Last month ${formatCurrency(stats.lastMonthSpend, currency)}`"
            />
            <StatTile
              label="Last fill-up"
              :value="stats.lastEntry ? formatDate(stats.lastEntry.date) : 'None yet'"
              :hint="stats.lastEntry ? `${formatLitres(stats.lastEntry.litres)} · ${formatCurrency(stats.lastEntry.totalCost, currency)}` : ''"
            />
          </div>

          <p v-if="stats.hasEntries && !stats.hasEnoughData" class="data-note fb-muted">
            Consumption is measured between two full-tank fill-ups. Fill to full and record it next time to see
            your averages.
          </p>

          <div class="fb-section"><h2 class="fb-section-title">Recent activity</h2></div>
          <ion-list v-if="recent.length" class="recent" lines="full">
            <FuelEntryItem
              v-for="entry in recent"
              :key="entry.id"
              :entry="entry"
              :segment="segments.get(entry.id)"
              :currency="currency"
            />
          </ion-list>
          <EmptyState
            v-else
            :icon="waterOutline"
            title="No fill-ups yet"
            message="Record your next fill-up to start tracking consumption and spending."
          />
          <div v-if="recent.length" class="ion-padding-horizontal">
            <ion-button fill="clear" expand="block" router-link="/tabs/history">View full history</ion-button>
          </div>
        </template>

        <div v-else-if="loadError" class="fb-card" role="alert">
          <p>Could not load your data: {{ loadError }}</p>
          <ion-button size="small" @click="load">Retry</ion-button>
        </div>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { ref, watch } from 'vue'
import {
  IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonList, IonPage, IonSpinner, IonTitle, IonToolbar,
} from '@ionic/vue'
import { addCircleOutline, carSportOutline, mapOutline, waterOutline } from 'ionicons/icons'
import EmptyState from '../components/EmptyState.vue'
import StatTile from '../components/StatTile.vue'
import VehicleSwitcher from '../components/VehicleSwitcher.vue'
import FuelEntryItem from '../components/FuelEntryItem.vue'
import { useAppStore } from '../stores/appStore.js'
import { useServices } from '../services/appServices.js'
import { computeVehicleStatistics } from '../services/statisticsService.js'
import { segmentsByClosingEntry } from '../services/fuelCalculationService.js'
import {
  formatConsumption, formatCostPerKm, formatCurrency, formatDate, formatDistance, formatLitres,
} from '../services/formatService.js'

const { state, activeVehicle, currency } = useAppStore()
const loading = ref(false)
const loadError = ref(null)
const stats = ref(null)
const recent = ref([])
const segments = ref(new Map())

async function load() {
  const vehicle = activeVehicle.value
  if (!vehicle) return
  loading.value = true
  loadError.value = null
  try {
    const entries = await useServices().fuel.listByVehicle(vehicle.id)
    stats.value = computeVehicleStatistics(entries)
    segments.value = segmentsByClosingEntry(entries)
    recent.value = entries.slice(-5).reverse()
  } catch (error) {
    stats.value = null
    loadError.value = error.message
  } finally {
    loading.value = false
  }
}

watch(() => [state.activeVehicleId, state.revision], load, { immediate: true })
</script>

<style scoped>
.quick-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 0 16px 12px;
}
.quick-actions ion-button {
  margin: 0;
  --border-radius: 12px;
  min-height: 48px;
}
.data-note {
  font-size: 0.82rem;
  margin: 0 20px 8px;
  line-height: 1.4;
}
.recent {
  margin: 0 16px;
  border-radius: var(--fb-radius);
  border: 1px solid var(--fb-border);
  padding: 0;
}
</style>
