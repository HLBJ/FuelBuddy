<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/statistics" />
        </ion-buttons>
        <ion-title>Running costs</ion-title>
        <ion-buttons v-if="activeVehicle" slot="end">
          <ion-button router-link="/costs/new" aria-label="Add a running cost">
            <ion-icon slot="icon-only" :icon="add" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="fb-page">
      <EmptyState v-if="!activeVehicle" :icon="carSportOutline" title="No vehicle yet" message="Add a vehicle to track its running costs.">
        <ion-button expand="block" router-link="/vehicles/new">Add vehicle</ion-button>
      </EmptyState>

      <template v-else>
        <VehicleSwitcher />
        <div v-if="loading && !list.length" class="ion-text-center ion-padding"><ion-spinner /></div>

        <EmptyState
          v-else-if="!list.length"
          :icon="receiptOutline"
          title="No running costs yet"
          message="Add services, tyres, insurance, tolls and parking to see what your car really costs to run."
        >
          <ion-button expand="block" router-link="/costs/new">Add a running cost</ion-button>
        </EmptyState>

        <template v-else>
          <div class="fb-card total">
            <span class="fb-muted">Last 12 months</span>
            <strong class="fb-tabular">{{ formatCurrency(yearTotal, currency) }}</strong>
            <span class="fb-muted small">on top of fuel</span>
          </div>
          <ion-list lines="full" class="group">
            <ion-item v-for="e in list" :key="e.id" button detail="false" :router-link="`/costs/${e.id}/edit`">
              <ion-icon slot="start" :icon="iconFor(e.category)" color="medium" aria-hidden="true" />
              <ion-label class="ion-text-wrap">
                <h3>{{ e.description || categoryLabel(e.category) }}</h3>
                <p>{{ formatDate(e.date) }}{{ e.description ? ` · ${categoryLabel(e.category)}` : '' }}</p>
              </ion-label>
              <strong slot="end" class="fb-tabular">{{ formatCurrency(e.amount, currency) }}</strong>
            </ion-item>
          </ion-list>
        </template>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPage, IonSpinner,
  IonTitle, IonToolbar,
} from '@ionic/vue'
import {
  add, buildOutline, cardOutline, carOutline, carSportOutline, cashOutline, documentTextOutline, ellipseOutline, hammerOutline,
  receiptOutline, shieldCheckmarkOutline, waterOutline,
} from 'ionicons/icons'
import EmptyState from '../components/EmptyState.vue'
import VehicleSwitcher from '../components/VehicleSwitcher.vue'
import { useAppStore } from '../stores/appStore.js'
import { useServices } from '../services/appServices.js'
import { categoryLabel } from '../services/expenseService.js'
import { formatCurrency, formatDate } from '../services/formatService.js'
import { monthKey, shiftMonth, toIsoDate } from '../services/dateUtils.js'
import { useFeedback } from '../composables/useFeedback.js'

const { state, activeVehicle, currency } = useAppStore()
const feedback = useFeedback()
const list = ref([])
const loading = ref(false)

const ICONS = {
  service: buildOutline, repairs: hammerOutline, tyres: ellipseOutline, insurance: shieldCheckmarkOutline, finance: cardOutline,
  licence: documentTextOutline, tolls: cashOutline, parking: carOutline, washing: waterOutline,
}
const iconFor = (category) => ICONS[category] || receiptOutline

const yearTotal = computed(() => {
  const from = `${shiftMonth(monthKey(toIsoDate()), -11)}-01`
  return list.value.filter((e) => e.date >= from).reduce((s, e) => s + e.amount, 0)
})

async function load() {
  const v = activeVehicle.value
  if (!v) return
  loading.value = true
  try {
    list.value = (await useServices().expenses.listByVehicle(v.id)).reverse()
  } catch (error) {
    feedback.error(error.message)
  } finally {
    loading.value = false
  }
}

watch(() => [state.activeVehicleId, state.revision], load, { immediate: true })
</script>

<style scoped>
.group {
  margin: 0 16px 12px;
  border: 1px solid var(--fb-border);
  border-radius: var(--fb-radius);
  padding: 0;
}
.total {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.total strong {
  font-size: 1.6rem;
}
.small {
  font-size: 0.8rem;
}
h3 {
  font-size: 0.95rem;
  font-weight: 600;
}
</style>
