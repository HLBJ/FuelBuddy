<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Statistics</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="fb-page">
      <EmptyState
        v-if="!activeVehicle"
        :icon="statsChartOutline"
        title="No statistics yet"
        message="Add a vehicle and record fill-ups to see your fuel statistics."
      >
        <ion-button expand="block" router-link="/vehicles/new">Add vehicle</ion-button>
      </EmptyState>

      <template v-else>
        <VehicleSwitcher />

        <div v-if="loading" class="ion-text-center ion-padding"><ion-spinner /></div>

        <div v-else-if="loadError" class="fb-card" role="alert">
          <p>Could not load statistics: {{ loadError }}</p>
          <ion-button size="small" @click="load">Retry</ion-button>
        </div>

        <EmptyState
          v-else-if="!stats.hasEntries"
          :icon="waterOutline"
          title="No fill-ups recorded"
          message="Statistics appear once you start recording fill-ups for this vehicle."
        >
          <ion-button expand="block" router-link="/entries/new">Add fill-up</ion-button>
        </EmptyState>

        <template v-else>
          <div class="fb-section"><h2 class="fb-section-title">Overview</h2></div>
          <div class="fb-grid-2">
            <StatTile label="Average consumption" :value="formatConsumption(stats.averageConsumption)" :available="stats.hasEnoughData" />
            <StatTile label="Cost per km" :value="formatCostPerKm(stats.averageCostPerKm, currency)" :available="stats.hasEnoughData" />
            <StatTile label="This month" :value="formatCurrency(stats.thisMonthSpend, currency)" />
            <StatTile label="Last month" :value="formatCurrency(stats.lastMonthSpend, currency)" />
            <StatTile label="Total spent" :value="formatCurrency(stats.totalSpend, currency)" :hint="`${stats.fillUpCount} fill-up${stats.fillUpCount === 1 ? '' : 's'}`" />
            <StatTile label="Total fuel" :value="formatLitres(stats.totalLitres, 1)" />
            <StatTile label="Distance tracked" :value="formatDistance(stats.distanceTracked)" :available="stats.distanceTracked > 0" />
            <StatTile label="Average price" :value="formatPricePerLitre(stats.averagePricePerLitre, currency)" :available="stats.averagePricePerLitre !== null" />
          </div>
          <p v-if="!stats.hasEnoughData" class="note fb-muted">
            Consumption and cost per km need at least two full-tank fill-ups. Partial fills are included once a full
            tank closes the period.
          </p>

          <div class="fb-section pro-heading">
            <h2 class="fb-section-title">Advanced statistics</h2>
            <ion-badge v-if="!state.isPro" color="secondary">Pro</ion-badge>
          </div>

          <div v-if="!state.isPro" class="fb-card locked">
            <ion-icon :icon="lockClosedOutline" class="lock-icon" aria-hidden="true" />
            <h3>Unlock trends and comparisons</h3>
            <ul>
              <li>12-month spending chart and monthly breakdown</li>
              <li>Consumption trend for every full-tank period</li>
              <li>Best and worst consumption</li>
              <li>Compare all your vehicles</li>
            </ul>
            <ion-button expand="block" router-link="/pro">See FuelBuddy Pro</ion-button>
          </div>

          <template v-else>
            <div class="fb-card">
              <h3 class="card-title">Monthly spending · last 12 months</h3>
              <BarChart :data="spendChart" :format="(v) => formatCurrency(v, currency)" aria-label="Monthly fuel spending" />
            </div>

            <div class="fb-card">
              <h3 class="card-title">Consumption trend</h3>
              <LineChart
                v-if="trendChart.length >= 2"
                :data="trendChart"
                :format="formatConsumption"
                aria-label="Consumption per full-tank period"
              />
              <p v-else class="fb-muted small">
                Record at least three full-tank fill-ups to see a trend.
              </p>
              <div v-if="extremes.best && stats.segmentCount > 1" class="extremes fb-tabular">
                <div>
                  <span class="fb-muted">Best</span>
                  <strong>{{ formatConsumption(extremes.best.consumption) }}</strong>
                  <span class="fb-muted small">to {{ formatDate(extremes.best.endDate) }}</span>
                </div>
                <div>
                  <span class="fb-muted">Worst</span>
                  <strong>{{ formatConsumption(extremes.worst.consumption) }}</strong>
                  <span class="fb-muted small">to {{ formatDate(extremes.worst.endDate) }}</span>
                </div>
              </div>
            </div>

            <div class="fb-card table-card">
              <h3 class="card-title">Monthly breakdown</h3>
              <table class="breakdown fb-tabular">
                <thead>
                  <tr><th>Month</th><th>Fill-ups</th><th>Litres</th><th>Spent</th></tr>
                </thead>
                <tbody>
                  <tr v-for="row in breakdownRows" :key="row.month">
                    <td>{{ formatMonth(row.month) }}</td>
                    <td>{{ row.fillUps }}</td>
                    <td>{{ formatNumber(row.litres, 1) }}</td>
                    <td>{{ formatCurrency(row.spend, currency) }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-if="!breakdownRows.length" class="fb-muted small">No fill-ups in the last 12 months.</p>
            </div>

            <div v-if="comparison.length > 1" class="fb-card table-card">
              <h3 class="card-title">Vehicle comparison</h3>
              <table class="breakdown fb-tabular">
                <thead>
                  <tr><th>Vehicle</th><th>L/100 km</th><th>Cost/km</th><th>Spent</th></tr>
                </thead>
                <tbody>
                  <tr v-for="row in comparison" :key="row.vehicleId">
                    <td>{{ row.name }}</td>
                    <td>{{ row.hasEnoughData ? formatNumber(row.averageConsumption, 1) : '—' }}</td>
                    <td>{{ row.hasEnoughData ? formatCurrency(row.averageCostPerKm, currency) : '—' }}</td>
                    <td>{{ formatCurrency(row.totalSpend, currency) }}</td>
                  </tr>
                </tbody>
              </table>
              <p class="fb-muted small">— means not enough full-tank fill-ups yet.</p>
            </div>
          </template>
        </template>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { IonBadge, IonButton, IonContent, IonHeader, IonIcon, IonPage, IonSpinner, IonTitle, IonToolbar } from '@ionic/vue'
import { lockClosedOutline, statsChartOutline, waterOutline } from 'ionicons/icons'
import EmptyState from '../components/EmptyState.vue'
import StatTile from '../components/StatTile.vue'
import VehicleSwitcher from '../components/VehicleSwitcher.vue'
import BarChart from '../components/BarChart.vue'
import LineChart from '../components/LineChart.vue'
import { useAppStore } from '../stores/appStore.js'
import { useServices } from '../services/appServices.js'
import {
  compareVehicles, computeVehicleStatistics, consumptionExtremes, consumptionTrend, monthlyBreakdown,
} from '../services/statisticsService.js'
import {
  formatConsumption, formatCostPerKm, formatCurrency, formatDate, formatDistance, formatLitres, formatMonth,
  formatNumber, formatPricePerLitre,
} from '../services/formatService.js'

const { state, activeVehicle, currency } = useAppStore()
const loading = ref(false)
const loadError = ref(null)
const entries = ref([])
const comparison = ref([])

const stats = computed(() => computeVehicleStatistics(entries.value))
const breakdown = computed(() => monthlyBreakdown(entries.value))
const breakdownRows = computed(() => [...breakdown.value].reverse().filter((r) => r.fillUps > 0))
const extremes = computed(() => consumptionExtremes(entries.value))
const spendChart = computed(() =>
  breakdown.value.map((r) => ({ label: formatMonth(r.month, 'short').slice(0, 3), fullLabel: formatMonth(r.month), value: r.spend })),
)
const trendChart = computed(() =>
  consumptionTrend(entries.value).map((p) => ({ label: formatDate(p.date, 'short'), fullLabel: formatDate(p.date), value: p.consumption })),
)

async function load() {
  const vehicle = activeVehicle.value
  if (!vehicle) return
  loading.value = true
  loadError.value = null
  try {
    const fuel = useServices().fuel
    entries.value = await fuel.listByVehicle(vehicle.id)
    if (state.isPro && state.vehicles.length > 1) {
      const datasets = []
      for (const v of state.vehicles) datasets.push({ vehicle: v, entries: await fuel.listByVehicle(v.id) })
      comparison.value = compareVehicles(datasets)
    } else {
      comparison.value = []
    }
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
}

watch(() => [state.activeVehicleId, state.revision, state.isPro], load, { immediate: true })
</script>

<style scoped>
.note {
  font-size: 0.82rem;
  margin: 0 20px 8px;
  line-height: 1.4;
}
.pro-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}
.locked {
  text-align: center;
}
.lock-icon {
  font-size: 32px;
  color: var(--ion-color-secondary);
}
.locked h3 {
  margin: 8px 0;
  font-size: 1.05rem;
}
.locked ul {
  text-align: left;
  margin: 0 0 12px;
  padding-left: 20px;
  color: var(--fb-text-muted);
  font-size: 0.9rem;
  line-height: 1.6;
}
.card-title {
  font-size: 0.95rem;
  margin: 0 0 12px;
}
.small {
  font-size: 0.8rem;
}
.extremes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 14px;
}
.extremes div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.table-card {
  overflow-x: auto;
}
.breakdown {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.breakdown th {
  text-align: right;
  font-weight: 600;
  color: var(--fb-text-muted);
  font-size: 0.75rem;
  padding: 6px 4px;
  border-bottom: 1px solid var(--fb-border);
}
.breakdown td {
  text-align: right;
  padding: 8px 4px;
  border-bottom: 1px solid var(--fb-border);
}
.breakdown th:first-child,
.breakdown td:first-child {
  text-align: left;
}
.breakdown tr:last-child td {
  border-bottom: none;
}
</style>
