<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
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
        <ion-list-header><ion-label>Vehicles &amp; data</ion-label></ion-list-header>
        <ion-item button router-link="/vehicles" detail>
          <ion-icon slot="start" :icon="carSportOutline" aria-hidden="true" />
          <ion-label>Manage vehicles</ion-label>
          <ion-note slot="end">{{ state.vehicles.length }}</ion-note>
        </ion-item>
        <ion-item button :disabled="exporting" detail="false" @click="exportData">
          <ion-icon slot="start" :icon="downloadOutline" aria-hidden="true" />
          <ion-label>
            Export to CSV
            <p>All vehicles and fill-ups, for spreadsheets or backup</p>
          </ion-label>
          <ion-spinner v-if="exporting" slot="end" name="crescent" />
        </ion-item>
      </ion-list>

      <ion-list lines="full" class="group">
        <ion-list-header><ion-label>FuelBuddy Pro</ion-label></ion-list-header>
        <ion-item button router-link="/pro" detail>
          <ion-icon slot="start" :icon="state.isPro ? checkmarkCircle : starOutline" :color="state.isPro ? 'success' : 'secondary'" aria-hidden="true" />
          <ion-label>
            {{ state.isPro ? 'Pro unlocked' : 'Upgrade to Pro' }}
            <p>{{ state.isPro ? 'Ad-free with advanced statistics. Thank you!' : 'Remove ads and unlock advanced statistics' }}</p>
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
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonNote, IonPage, IonSelect,
  IonSelectOption, IonSpinner, IonTitle, IonToolbar,
} from '@ionic/vue'
import {
  carSportOutline, checkmarkCircle, downloadOutline, informationCircleOutline, shieldCheckmarkOutline, starOutline,
  trashOutline,
} from 'ionicons/icons'
import { appConfig } from '../config/appConfig.js'
import { notifyDataChanged, updateSetting, useAppStore } from '../stores/appStore.js'
import { useServices } from '../services/appServices.js'
import { buildCsv, exportCsv } from '../services/exportService.js'
import { useFeedback } from '../composables/useFeedback.js'

const router = useRouter()
const feedback = useFeedback()
const { state } = useAppStore()
const exporting = ref(false)

async function exportData() {
  exporting.value = true
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
    if (!/cancel/i.test(error?.message || '')) feedback.error(`Export failed: ${error.message}`)
  } finally {
    exporting.value = false
  }
}

async function deleteAll() {
  const first = await feedback.confirm({
    header: 'Delete all data?',
    message: 'Every vehicle and fill-up will be permanently removed from this phone. Consider exporting to CSV first.',
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
ion-list-header {
  min-height: 36px;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--fb-text-muted);
}
</style>
