<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
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

        <!-- Reminders: urgent ones first; otherwise a gentle prompt to add one -->
        <ion-list lines="full" class="reminders">
          <ion-item v-for="r in urgentReminders" :key="r.id" button detail="false" :router-link="`/reminders/${r.id}/edit`">
            <ion-icon slot="start" :icon="alarmOutline" :color="r.status === 'overdue' ? 'danger' : 'warning'" aria-hidden="true" />
            <ion-label class="ion-text-wrap">
              <h3>{{ r.title }}</h3>
              <p>{{ r.status === 'overdue' ? 'Overdue' : 'Due soon' }}{{ r.dueDate ? ` · ${formatDate(r.dueDate)}` : '' }}{{ r.dueOdometer !== null ? ` · at ${formatDistance(r.dueOdometer)}` : '' }}</p>
            </ion-label>
          </ion-item>
          <ion-item button detail router-link="/reminders" lines="none">
            <ion-icon slot="start" :icon="urgentReminders.length ? listOutline : alarmOutline" color="medium" aria-hidden="true" />
            <ion-label class="ion-text-wrap">
              {{ reminderCount ? 'All reminders' : 'Set a reminder' }}
              <p v-if="!reminderCount">Licence disc, service or tyres. We'll remind you.</p>
              <p v-else-if="!urgentReminders.length">Nothing due soon.</p>
            </ion-label>
          </ion-item>
        </ion-list>

        <!-- Pro offer, shown once trends are meaningful -->
        <div v-if="showProNudge" class="fb-card nudge">
          <ion-icon :icon="trendingUpOutline" class="nudge-icon" aria-hidden="true" />
          <div class="nudge-text">
            <strong>Your fuel trends are ready</strong>
            <span class="fb-muted">See your consumption trend, 12-month spending and best and worst tanks.</span>
            <div class="nudge-actions">
              <ion-button size="small" @click="tryPro">{{ trial.used ? 'See Pro' : 'Try Pro free for 7 days' }}</ion-button>
              <ion-button size="small" fill="clear" @click="dismissNudge">Not now</ion-button>
            </div>
          </div>
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
import { computed, ref, watch } from 'vue'
import {
  IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPage, IonSpinner, IonTitle, IonToolbar,
} from '@ionic/vue'
import { addCircleOutline, alarmOutline, carSportOutline, listOutline, mapOutline, trendingUpOutline, waterOutline } from 'ionicons/icons'
import EmptyState from '../components/EmptyState.vue'
import StatTile from '../components/StatTile.vue'
import VehicleSwitcher from '../components/VehicleSwitcher.vue'
import FuelEntryItem from '../components/FuelEntryItem.vue'
import { startProTrial, updateSetting, useAppStore } from '../stores/appStore.js'
import { useRouter } from 'vue-router'
import { shouldShowProNudge } from '../services/engagementService.js'
import { useServices } from '../services/appServices.js'
import { computeVehicleStatistics } from '../services/statisticsService.js'
import { segmentsByClosingEntry } from '../services/fuelCalculationService.js'
import {
  formatConsumption, formatCostPerKm, formatCurrency, formatDate, formatDistance, formatLitres,
} from '../services/formatService.js'

const { state, activeVehicle, currency, trial } = useAppStore()
const router = useRouter()
const urgentReminders = ref([])
const reminderCount = ref(0)
const showProNudge = computed(() =>
  Boolean(stats.value) &&
  shouldShowProNudge({
    isPro: state.isPro,
    trialStartedAt: state.settings.proTrialStartedAt,
    segmentCount: stats.value.segmentCount,
    nudgeDismissedAt: state.settings.proNudgeDismissedAt,
    now: state.now,
  }),
)

async function tryPro() {
  if (!trial.value.used && (await startProTrial())) {
    router.push('/tabs/statistics')
    return
  }
  router.push('/pro')
}

function dismissNudge() {
  updateSetting('proNudgeDismissedAt', new Date().toISOString())
}
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
    const open = await useServices().reminders.upcoming(vehicle.id, vehicle.currentOdometer)
    reminderCount.value = open.length
    urgentReminders.value = open.filter((r) => r.status !== 'upcoming').slice(0, 3)
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
.reminders {
  margin: 0 16px 12px;
  border: 1px solid var(--fb-border);
  border-radius: var(--fb-radius);
  padding: 0;
}
.reminders h3 {
  font-size: 0.95rem;
  font-weight: 600;
}
.nudge {
  display: flex;
  gap: 12px;
  border-color: rgba(var(--ion-color-secondary-rgb), 0.6);
  background: rgba(var(--ion-color-secondary-rgb), 0.08);
}
.nudge-icon {
  font-size: 28px;
  color: var(--ion-color-secondary-shade);
  flex-shrink: 0;
}
.nudge-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.88rem;
}
.nudge-actions {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  flex-wrap: wrap;
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
