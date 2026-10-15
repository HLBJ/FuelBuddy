<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>History</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="fb-page">
      <EmptyState
        v-if="!activeVehicle"
        :icon="carSportOutline"
        title="No vehicle yet"
        message="Add a vehicle to start recording fill-ups."
      >
        <ion-button expand="block" router-link="/vehicles/new">Add vehicle</ion-button>
      </EmptyState>

      <template v-else>
        <VehicleSwitcher />

        <div v-if="loading" class="ion-text-center ion-padding"><ion-spinner /></div>

        <div v-else-if="loadError" class="fb-card" role="alert">
          <p>Could not load history: {{ loadError }}</p>
          <ion-button size="small" @click="load">Retry</ion-button>
        </div>

        <EmptyState
          v-else-if="!groups.length"
          :icon="waterOutline"
          title="No fill-ups recorded"
          :message="`Fill-ups for ${activeVehicle.name} will appear here.`"
        >
          <ion-button expand="block" router-link="/entries/new">Add fill-up</ion-button>
        </EmptyState>

        <template v-else>
          <div class="totals fb-card fb-tabular">
            <div><span class="fb-muted">Fill-ups</span><strong>{{ totals.count }}</strong></div>
            <div><span class="fb-muted">Litres</span><strong>{{ formatLitres(totals.litres, 1) }}</strong></div>
            <div><span class="fb-muted">Spent</span><strong>{{ formatCurrency(totals.spend, currency) }}</strong></div>
          </div>

          <ion-list v-for="group in groups" :key="group.month" class="month" lines="full">
            <ion-list-header class="month-header">
              <ion-label>{{ formatMonth(group.month) }}</ion-label>
              <span class="month-total fb-tabular">
                {{ formatLitres(group.litres, 1) }} · {{ formatCurrency(group.spend, currency) }}
              </span>
            </ion-list-header>
            <ion-item-sliding v-for="entry in group.entries" :key="entry.id">
              <FuelEntryItem :entry="entry" :segment="segments.get(entry.id)" :currency="currency" />
              <ion-item-options side="end">
                <ion-item-option color="danger" @click="remove(entry)">
                  <ion-icon slot="icon-only" :icon="trashOutline" aria-label="Delete fill-up" />
                </ion-item-option>
              </ion-item-options>
            </ion-item-sliding>
          </ion-list>
          <p class="hint fb-muted">Tap a fill-up to edit it. Swipe left to delete.</p>
        </template>
      </template>

      <ion-fab v-if="activeVehicle" slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button router-link="/entries/new" aria-label="Add fill-up">
          <ion-icon :icon="add" />
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  IonButton, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItemOption, IonItemOptions, IonItemSliding,
  IonLabel, IonList, IonListHeader, IonPage, IonSpinner, IonTitle, IonToolbar,
} from '@ionic/vue'
import { add, carSportOutline, trashOutline, waterOutline } from 'ionicons/icons'
import EmptyState from '../components/EmptyState.vue'
import VehicleSwitcher from '../components/VehicleSwitcher.vue'
import FuelEntryItem from '../components/FuelEntryItem.vue'
import { notifyDataChanged, useAppStore } from '../stores/appStore.js'
import { useServices } from '../services/appServices.js'
import { groupEntriesByMonth } from '../services/statisticsService.js'
import { segmentsByClosingEntry } from '../services/fuelCalculationService.js'
import { formatCurrency, formatDate, formatLitres, formatMonth } from '../services/formatService.js'
import { roundTo } from '../services/numberUtils.js'
import { useFeedback } from '../composables/useFeedback.js'

const { state, activeVehicle, currency } = useAppStore()
const feedback = useFeedback()
const loading = ref(false)
const loadError = ref(null)
const groups = ref([])
const segments = ref(new Map())

const totals = computed(() => {
  const all = groups.value.flatMap((g) => g.entries)
  return {
    count: all.length,
    litres: roundTo(all.reduce((s, e) => s + e.litres, 0), 2),
    spend: roundTo(all.reduce((s, e) => s + e.totalCost, 0), 2),
  }
})

async function load() {
  const vehicle = activeVehicle.value
  if (!vehicle) return
  loading.value = true
  loadError.value = null
  try {
    const entries = await useServices().fuel.listByVehicle(vehicle.id)
    groups.value = groupEntriesByMonth(entries)
    segments.value = segmentsByClosingEntry(entries)
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
}

async function remove(entry) {
  const ok = await feedback.confirm({
    header: 'Delete fill-up?',
    message: `${formatDate(entry.date)} · ${formatLitres(entry.litres)} · ${formatCurrency(entry.totalCost, currency.value)}. This cannot be undone.`,
    confirmText: 'Delete',
    destructive: true,
  })
  if (!ok) return
  try {
    await useServices().fuel.delete(entry.id)
    await notifyDataChanged()
    feedback.success('Fill-up deleted')
  } catch (error) {
    feedback.error(error.message)
  }
}

watch(() => [state.activeVehicleId, state.revision], load, { immediate: true })
</script>

<style scoped>
.totals {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  text-align: center;
  padding: 12px 8px;
}
.totals div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.8rem;
}
.totals strong {
  font-size: 0.95rem;
}
.month {
  margin: 0 16px 12px;
  border: 1px solid var(--fb-border);
  border-radius: var(--fb-radius);
  overflow: hidden;
  padding: 0;
}
.month-header {
  padding-inline-end: 16px;
  min-height: 40px;
  background: var(--fb-surface-muted);
}
.month-total {
  font-size: 0.8rem;
  color: var(--fb-text-muted);
  white-space: nowrap;
}
.hint {
  text-align: center;
  font-size: 0.78rem;
  margin: 4px 16px 72px;
}
</style>
