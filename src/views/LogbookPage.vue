<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/trip" />
        </ion-buttons>
        <ion-title>Travel logbook</ion-title>
        <ion-buttons v-if="activeVehicle" slot="end">
          <ion-button router-link="/logbook/new" aria-label="Log a trip">
            <ion-icon slot="icon-only" :icon="add" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="fb-page">
      <EmptyState v-if="!activeVehicle" :icon="carSportOutline" title="No vehicle yet" message="Add a vehicle to keep a logbook for it.">
        <ion-button expand="block" router-link="/vehicles/new">Add vehicle</ion-button>
      </EmptyState>

      <template v-else>
        <VehicleSwitcher />

        <ion-list lines="none" class="group year">
          <ion-item>
            <ion-select :value="taxYear" label="Tax year" interface="action-sheet" @ion-change="(e) => (taxYear = e.detail.value)">
              <ion-select-option v-for="y in taxYears" :key="y" :value="y">{{ y }} ({{ taxYearLabel(y) }})</ion-select-option>
            </ion-select>
          </ion-item>
        </ion-list>

        <div v-if="loading && !year" class="ion-text-center ion-padding"><ion-spinner /></div>

        <template v-else-if="year">
          <div class="fb-card summary">
            <div class="headline">
              <div>
                <span class="fb-muted label">Business</span>
                <strong class="big fb-tabular">{{ formatDistance(year.summary.businessKm) }}</strong>
              </div>
              <div v-if="year.summary.businessShare !== null" class="share">
                <strong class="fb-tabular">{{ formatNumber(year.summary.businessShare, 1) }}%</strong>
                <span class="fb-muted label">{{ year.summary.hasReadings ? 'of all driving' : 'of logged trips' }}</span>
              </div>
            </div>
            <div class="rows fb-muted">
              <span>Total {{ formatDistance(year.summary.totalKm) }}{{ year.summary.hasReadings ? '' : ' logged' }}</span>
              <span>Private {{ formatDistance(year.summary.privateKm) }}</span>
              <span>{{ year.summary.businessTrips }} business trip{{ year.summary.businessTrips === 1 ? '' : 's' }}</span>
            </div>
            <p v-if="year.summary.readingsTooLow" class="fb-warning-text">
              Your business trips add up to more than the odometer readings allow. Please check the readings.
            </p>
          </div>

          <ion-list lines="full" class="group">
            <ion-item button detail @click="editReadings">
              <ion-icon slot="start" :icon="speedometerOutline" aria-hidden="true" />
              <ion-label class="ion-text-wrap">
                Odometer readings
                <p>
                  Start {{ year.readings.openingOdometer === null ? 'not set' : formatDistance(year.readings.openingOdometer) }} ·
                  end {{ year.readings.closingOdometer === null ? 'not set' : formatDistance(year.readings.closingOdometer) }}
                </p>
                <p v-if="!year.summary.hasReadings" class="hint">SARS needs your readings on 1 March and at the end of February.</p>
              </ion-label>
            </ion-item>
            <ion-item button :disabled="exporting" detail="false" @click="exportAs('pdf')">
              <ion-icon slot="start" :icon="documentTextOutline" aria-hidden="true" />
              <ion-label>
                Export SARS logbook (PDF)
                <p>{{ hasPro ? 'Save or share for your tax return' : 'Pro feature — try it free for 7 days' }}</p>
              </ion-label>
              <ion-icon v-if="!hasPro" slot="end" :icon="lockClosedOutline" color="medium" aria-label="Pro" />
              <ion-spinner v-else-if="exporting === 'pdf'" slot="end" name="crescent" />
            </ion-item>
            <ion-item button :disabled="exporting" detail="false" @click="exportAs('csv')">
              <ion-icon slot="start" :icon="gridOutline" aria-hidden="true" />
              <ion-label>Export as spreadsheet (CSV)</ion-label>
              <ion-icon v-if="!hasPro" slot="end" :icon="lockClosedOutline" color="medium" aria-label="Pro" />
              <ion-spinner v-else-if="exporting === 'csv'" slot="end" name="crescent" />
            </ion-item>
          </ion-list>

          <div class="fb-section"><h2 class="fb-section-title">Trips</h2></div>
          <ion-list v-if="year.trips.length" lines="full" class="group">
            <ion-item v-for="t in year.trips" :key="t.id" button detail="false" :router-link="`/logbook/${t.id}/edit`">
              <ion-label class="ion-text-wrap">
                <h3>{{ t.destination || (t.purpose === 'private' ? 'Private trip' : 'Trip') }}</h3>
                <p>{{ formatDate(t.date) }}{{ t.reason ? ` · ${t.reason}` : '' }}</p>
              </ion-label>
              <div slot="end" class="trip-end">
                <strong class="fb-tabular">{{ formatDistance(t.distance) }}</strong>
                <ion-badge :color="t.purpose === 'business' ? 'primary' : 'medium'">{{ t.purpose === 'business' ? 'Business' : 'Private' }}</ion-badge>
              </div>
            </ion-item>
          </ion-list>
          <EmptyState
            v-else
            :icon="bookOutline"
            title="No trips this tax year"
            message="Log business trips as you go. SARS needs the date, distance, destination and reason for each one."
          >
            <ion-button expand="block" router-link="/logbook/new">Log a trip</ion-button>
          </EmptyState>
        </template>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonBackButton, IonBadge, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPage,
  IonSelect, IonSelectOption, IonSpinner, IonTitle, IonToolbar, alertController,
} from '@ionic/vue'
import {
  add, bookOutline, carSportOutline, documentTextOutline, gridOutline, lockClosedOutline, speedometerOutline,
} from 'ionicons/icons'
import EmptyState from '../components/EmptyState.vue'
import VehicleSwitcher from '../components/VehicleSwitcher.vue'
import { notifyDataChanged, useAppStore } from '../stores/appStore.js'
import { useServices } from '../services/appServices.js'
import { taxYearFor, taxYearLabel, taxYearRange } from '../services/logbookService.js'
import { exportLogbook } from '../services/logbookExport.js'
import { isShareCancelled } from '../services/fileService.js'
import { formatDate, formatDistance, formatNumber, toInputValue } from '../services/formatService.js'
import { toIsoDate } from '../services/dateUtils.js'
import { useFeedback } from '../composables/useFeedback.js'

const router = useRouter()
const feedback = useFeedback()
const { state, activeVehicle, hasPro } = useAppStore()

const currentTaxYear = taxYearFor(toIsoDate())
const taxYear = ref(currentTaxYear)
const taxYears = [currentTaxYear, currentTaxYear - 1, currentTaxYear - 2]
const year = ref(null)
const loading = ref(false)
const exporting = ref(null)

async function load() {
  const v = activeVehicle.value
  if (!v) return
  loading.value = true
  try {
    year.value = await useServices().logbook.year(v.id, taxYear.value)
  } catch (error) {
    feedback.error(error.message)
  } finally {
    loading.value = false
  }
}

watch(() => [state.activeVehicleId, state.revision, taxYear.value], load, { immediate: true })

const range = computed(() => taxYearRange(taxYear.value))

async function editReadings() {
  const { readings, suggested } = year.value
  const alert = await alertController.create({
    header: 'Odometer readings',
    message: `Tax year ${taxYear.value}: readings on ${formatDate(range.value.start)} and ${formatDate(range.value.end)}.`,
    inputs: [
      {
        name: 'openingOdometer',
        type: 'number',
        min: 0,
        label: 'Start of tax year (km)',
        placeholder: suggested.openingOdometer !== null ? `Start (e.g. ${Math.round(suggested.openingOdometer)})` : 'Start of tax year (km)',
        value: toInputValue(readings.openingOdometer),
      },
      {
        name: 'closingOdometer',
        type: 'number',
        min: 0,
        label: 'End of tax year (km)',
        placeholder: 'End of tax year (km)',
        value: toInputValue(readings.closingOdometer),
      },
    ],
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      { text: 'Save', role: 'confirm' },
    ],
  })
  await alert.present()
  const { role, data } = await alert.onDidDismiss()
  if (role !== 'confirm') return
  try {
    await useServices().logbook.setReadings(activeVehicle.value.id, taxYear.value, data.values)
    await notifyDataChanged()
    feedback.success('Readings saved')
  } catch (error) {
    feedback.error(error.message)
  }
}

async function exportAs(format) {
  if (!hasPro.value) {
    feedback.toast('Logbook export is part of FuelBuddy Pro. Try it free for 7 days.', 'dark', 3000)
    router.push('/pro')
    return
  }
  exporting.value = format
  try {
    const { method, fileName } = await exportLogbook(activeVehicle.value, year.value, format)
    if (method === 'download') feedback.success(`Downloaded ${fileName}`)
  } catch (error) {
    if (!isShareCancelled(error)) feedback.error(`Export failed: ${error.message}`)
  } finally {
    exporting.value = null
  }
}
</script>

<style scoped>
.group {
  margin: 0 16px 12px;
  border: 1px solid var(--fb-border);
  border-radius: var(--fb-radius);
  padding: 0;
}
.summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.headline {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}
.headline > div {
  display: flex;
  flex-direction: column;
}
.share {
  align-items: flex-end;
}
.label {
  font-size: 0.8rem;
}
.big {
  font-size: 1.6rem;
}
.rows {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  font-size: 0.85rem;
}
.hint {
  color: var(--ion-color-warning-shade);
}
.trip-end {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}
h3 {
  font-size: 0.95rem;
  font-weight: 600;
}
</style>
