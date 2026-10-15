<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Settings</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="fb-page">
      <ion-list lines="full" class="group">
        <ion-list-header><ion-label>Appearance</ion-label></ion-list-header>
        <ion-item>
          <ion-select
            :value="state.settings.theme"
            label="Theme"
            interface="action-sheet"
            @ion-change="(e) => updateSetting('theme', e.detail.value)"
          >
            <ion-select-option value="system">Use device setting</ion-select-option>
            <ion-select-option value="light">Light</ion-select-option>
            <ion-select-option value="dark">Dark</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-select
            :value="state.settings.currency"
            label="Currency"
            interface="action-sheet"
            :disabled="appConfig.supportedCurrencies.length < 2"
            @ion-change="(e) => updateSetting('currency', e.detail.value)"
          >
            <ion-select-option v-for="c in appConfig.supportedCurrencies" :key="c.code" :value="c.code">
              {{ c.label }}
            </ion-select-option>
          </ion-select>
        </ion-item>
      </ion-list>

      <ion-list lines="full" class="group">
        <ion-list-header><ion-label>Fuel prices</ion-label></ion-list-header>
        <ion-item>
          <ion-select
            :value="state.settings.fuelRegion"
            label="Where you fill up"
            interface="action-sheet"
            @ion-change="(e) => updateSetting('fuelRegion', e.detail.value)"
          >
            <ion-select-option v-for="r in FUEL_REGIONS" :key="r.value" :value="r.value">{{ r.label }}</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-select
            :value="state.settings.petrolGrade"
            label="Petrol"
            interface="action-sheet"
            @ion-change="(e) => updateSetting('petrolGrade', e.detail.value)"
          >
            <ion-select-option value="ulp93">93 unleaded</ion-select-option>
            <ion-select-option value="ulp95">95 unleaded</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-select
            :value="state.settings.dieselGrade"
            label="Diesel"
            interface="action-sheet"
            @ion-change="(e) => updateSetting('dieselGrade', e.detail.value)"
          >
            <ion-select-option value="diesel50">50ppm</ion-select-option>
            <ion-select-option value="diesel500">500ppm</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-toggle :checked="state.settings.fuelPriceAlerts" justify="space-between" @ion-change="togglePriceAlerts">
            Price change alerts
            <p class="toggle-help fb-muted">The evening before petrol or diesel prices change</p>
          </ion-toggle>
        </ion-item>
        <ion-item lines="none">
          <ion-label class="ion-text-wrap prices-note fb-muted">
            Official prices up to {{ formatDate(latestPriceDate) }}, from the Department of Mineral and Petroleum Resources.
          </ion-label>
        </ion-item>
      </ion-list>

      <ion-list lines="full" class="group">
        <ion-list-header><ion-label>Vehicles &amp; data</ion-label></ion-list-header>
        <ion-item button router-link="/vehicles" detail>
          <ion-icon slot="start" :icon="carSportOutline" aria-hidden="true" />
          <ion-label>Manage vehicles</ion-label>
          <ion-note slot="end">{{ state.vehicles.length }}</ion-note>
        </ion-item>
        <ion-item button router-link="/reminders" detail>
          <ion-icon slot="start" :icon="alarmOutline" aria-hidden="true" />
          <ion-label>
            Reminders
            <p>Licence disc, service and tyres</p>
          </ion-label>
        </ion-item>
        <ion-item button router-link="/logbook" detail>
          <ion-icon slot="start" :icon="bookOutline" aria-hidden="true" />
          <ion-label>
            Travel logbook
            <p>Business trips for SARS</p>
          </ion-label>
        </ion-item>
        <ion-item button :disabled="busy !== null" detail="false" @click="backUp">
          <ion-icon slot="start" :icon="cloudUploadOutline" aria-hidden="true" />
          <ion-label>
            Back up data
            <p>Save a backup to Google Drive, email or your phone</p>
          </ion-label>
          <ion-spinner v-if="busy === 'backup'" slot="end" name="crescent" />
        </ion-item>
        <ion-item button :disabled="busy !== null" detail="false" @click="pickBackup">
          <ion-icon slot="start" :icon="cloudDownloadOutline" aria-hidden="true" />
          <ion-label>
            Restore from backup
            <p>Moving to a new phone? Open your FuelBuddy backup file</p>
          </ion-label>
          <ion-spinner v-if="busy === 'restore'" slot="end" name="crescent" />
        </ion-item>
        <input ref="fileInput" type="file" class="hidden-input" aria-hidden="true" tabindex="-1" @change="restoreFromFile" />
        <ion-item button :disabled="busy !== null" detail="false" @click="exportData">
          <ion-icon slot="start" :icon="downloadOutline" aria-hidden="true" />
          <ion-label>
            Export to CSV
            <p>All vehicles and fill-ups, for spreadsheets</p>
          </ion-label>
          <ion-spinner v-if="busy === 'export'" slot="end" name="crescent" />
        </ion-item>
      </ion-list>

      <ion-list lines="full" class="group">
        <ion-list-header><ion-label>FuelBuddy Pro</ion-label></ion-list-header>
        <ion-item button router-link="/pro" detail>
          <ion-icon slot="start" :icon="hasPro ? checkmarkCircle : starOutline" :color="hasPro ? 'success' : 'secondary'" aria-hidden="true" />
          <ion-label>
            {{ state.isPro ? 'Pro unlocked' : trial.active ? `Pro trial · ${trial.daysLeft} day${trial.daysLeft === 1 ? '' : 's'} left` : 'Upgrade to Pro' }}
            <p>{{ state.isPro ? 'Ad-free, advanced statistics and logbook export. Thank you!' : trial.active ? 'Keep Pro for good with a one-time purchase' : trial.used ? 'No ads, advanced statistics and SARS logbook export' : 'Try Pro free for 7 days' }}</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <ion-list lines="full" class="group">
        <ion-list-header><ion-label>About</ion-label></ion-list-header>
        <ion-item button router-link="/privacy" detail>
          <ion-icon slot="start" :icon="shieldCheckmarkOutline" aria-hidden="true" />
          <ion-label>Privacy</ion-label>
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="informationCircleOutline" aria-hidden="true" />
          <ion-label>Version</ion-label>
          <ion-note slot="end">{{ appConfig.version }}</ion-note>
        </ion-item>
      </ion-list>

      <ion-list lines="full" class="group">
        <ion-list-header><ion-label>Danger zone</ion-label></ion-list-header>
        <ion-item button detail="false" @click="deleteAll">
          <ion-icon slot="start" :icon="trashOutline" color="danger" aria-hidden="true" />
          <ion-label color="danger">
            Delete all data
            <p>Removes every vehicle and fill-up from this phone</p>
          </ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonNote, IonPage, IonSelect,
  IonSelectOption, IonSpinner, IonTitle, IonToggle, IonToolbar,
} from '@ionic/vue'
import {
  alarmOutline, bookOutline, carSportOutline, checkmarkCircle, cloudDownloadOutline, cloudUploadOutline, downloadOutline, informationCircleOutline, shieldCheckmarkOutline, starOutline,
  trashOutline,
} from 'ionicons/icons'
import { appConfig } from '../config/appConfig.js'
import { notifyDataChanged, syncPriceAlert, updateSetting, useAppStore } from '../stores/appStore.js'
import { useServices } from '../services/appServices.js'
import { buildCsv, exportCsv } from '../services/exportService.js'
import { parseBackup, summariseBackup } from '../services/backupService.js'
import { isShareCancelled } from '../services/fileService.js'
import { formatDate } from '../services/formatService.js'
import { FUEL_REGIONS } from '../services/fuelPriceService.js'
import { ensureNotificationPermission } from '../services/notificationService.js'
import { useFeedback } from '../composables/useFeedback.js'

const router = useRouter()
const feedback = useFeedback()
const { state, hasPro, trial } = useAppStore()
const latestPriceDate = computed(() => state.fuelPrices.periods.at(-1)?.effective)

async function togglePriceAlerts(event) {
  const on = event.detail.checked
  await updateSetting('fuelPriceAlerts', on)
  if (on) ensureNotificationPermission().then((granted) => granted && syncPriceAlert()).catch(() => {})
}

const busy = ref(null) // 'export' | 'backup' | 'restore' | null
const fileInput = ref(null)

async function backUp() {
  if (!state.vehicles.length) {
    feedback.toast('Nothing to back up yet — add a vehicle first.')
    return
  }
  busy.value = 'backup'
  try {
    const { method, fileName } = await useServices().backup.share()
    if (method === 'download') feedback.success(`Downloaded ${fileName}`)
  } catch (error) {
    if (!isShareCancelled(error)) feedback.error(`Backup failed: ${error.message}`)
  } finally {
    busy.value = null
  }
}

function pickBackup() {
  fileInput.value.value = ''
  fileInput.value.click()
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

async function restoreFromFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  busy.value = 'restore'
  try {
    const text = await file.text()
    let summary
    try {
      summary = summariseBackup(parseBackup(text))
    } catch (error) {
      feedback.error(error.message)
      return
    }
    const made = summary.createdAt ? ` from ${formatDate(summary.createdAt.slice(0, 10))}` : ''
    const contents = [plural(summary.vehicles, 'vehicle'), plural(summary.fillUps, 'fill-up'), plural(summary.reminders, 'reminder'), plural(summary.trips, 'trip')].join(', ')
    const ok = await feedback.confirm({
      header: 'Restore this backup?',
      message: `Backup${made}: ${contents}. Everything currently on this phone will be replaced.`,
      confirmText: 'Restore',
      destructive: true,
    })
    if (!ok) return
    await useServices().backup.restore(text)
    feedback.success('Backup restored')
    // Start afresh so every screen, setting and reminder reflects the restored data.
    setTimeout(() => window.location.reload(), 1200)
  } catch (error) {
    feedback.error(`Restore failed: ${error.message}`)
  } finally {
    busy.value = null
  }
}

async function exportData() {
  busy.value = 'export'
  try {
    const services = useServices()
    const [vehicles, entries] = await Promise.all([services.vehicles.list(), services.fuel.listAll()])
    if (!vehicles.length) {
      feedback.toast('Nothing to export yet — add a vehicle first.')
      return
    }
    const { method, fileName } = await exportCsv(buildCsv(vehicles, entries, { currency: state.settings.currency }))
    if (method === 'download') feedback.success(`Downloaded ${fileName}`)
  } catch (error) {
    // Closing the Android share sheet without choosing a target is not an error.
    if (!isShareCancelled(error)) feedback.error(`Export failed: ${error.message}`)
  } finally {
    busy.value = null
  }
}

async function deleteAll() {
  const first = await feedback.confirm({
    header: 'Delete all data?',
    message: 'Every vehicle and fill-up will be permanently removed from this phone. Consider backing up first.',
    confirmText: 'Continue',
    destructive: true,
  })
  if (!first) return
  const second = await feedback.confirm({
    header: 'Are you absolutely sure?',
    message: 'This cannot be undone.',
    confirmText: 'Delete everything',
    destructive: true,
  })
  if (!second) return
  try {
    await useServices().deleteAllData()
    await notifyDataChanged()
    feedback.success('All data deleted')
    router.replace('/tabs/dashboard')
  } catch (error) {
    feedback.error(error.message)
  }
}
</script>

<style scoped>
.group {
  margin: 12px 16px;
  border: 1px solid var(--fb-border);
  border-radius: var(--fb-radius);
  padding: 0;
}
.toggle-help {
  font-size: 0.78rem;
  margin: 2px 0 0;
  white-space: normal;
}
.prices-note {
  font-size: 0.78rem;
}
.hidden-input {
  display: none;
}
ion-list-header {
  min-height: 36px;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--fb-text-muted);
}
</style>
