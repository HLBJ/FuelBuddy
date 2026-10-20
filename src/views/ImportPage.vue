<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/settings" />
        </ion-buttons>
        <ion-title>Import history</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding import">
      <input ref="fileInput" type="file" class="hidden-input" aria-hidden="true" tabindex="-1" @change="readFile" />

      <!-- 1. Choose a file -->
      <template v-if="!plan && !result">
        <ion-icon :icon="cloudUploadOutline" class="hero-icon" aria-hidden="true" />
        <h2>Bring your fuel history with you</h2>
        <p class="fb-muted">
          Import a CSV export from another fuel app (Fuelio, Drivvo, Fuelly and more), a spreadsheet, or a FuelBuddy export. Your
          consumption and statistics are ready straight away.
        </p>
        <ion-button expand="block" :disabled="reading" @click="pickFile">
          <ion-spinner v-if="reading" slot="start" name="crescent" />
          Choose file
        </ion-button>
        <details class="help">
          <summary>How do I get the file from my old app?</summary>
          <p>
            In your old app, look for <strong>Export</strong> or <strong>Backup</strong> (usually in Settings or the
            menu) and choose <strong>CSV</strong>. Save the file to your phone or Google Drive, then choose it here.
          </p>
          <p class="fb-muted">
            Works with exports from Fuelio, Drivvo, Fuelly (app and website), aCar, Spritmonitor, Simply Auto, My Cars
            and LubeLogger. For a spreadsheet, save it as CSV with a header row: Date, Odometer, Litres, and Price per
            litre or Total.
          </p>
        </details>
      </template>

      <!-- 2. Review what was found -->
      <template v-else-if="plan && !result">
        <div class="fb-card summary">
          <strong>{{ fileName }}</strong>
          <span v-if="plan.app" class="fb-muted">Recognised as a {{ plan.app }} export</span>
          <span>{{ plural(selectedFillUps.length, 'fill-up') }}<template v-if="selectedCosts.length">, {{ plural(selectedCosts.length, 'running cost') }}</template></span>
          <span v-if="range" class="fb-muted">{{ formatDate(range.from) }} to {{ formatDate(range.to) }}</span>
          <span v-for="w in plan.warnings" :key="w" class="fb-warning-text">{{ w }}</span>
          <span v-if="plan.skipped.length" class="fb-muted">{{ plural(plan.skipped.length, 'row') }} couldn't be read and will be left out.</span>
        </div>

        <p v-if="!plan.fillUps.length && !plan.costs.length" class="fb-warning-text">
          No fill-ups were found. The file needs a header row with at least a date, an odometer reading (or trip
          distance) and the amount of fuel.
        </p>

        <ion-list v-else lines="full" class="group">
          <ion-item v-if="plan.vehicleNames.length > 1">
            <ion-select v-model="fileVehicle" label="Vehicle in the file" interface="action-sheet">
              <ion-select-option v-for="n in plan.vehicleNames" :key="n" :value="n">{{ n }}</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-select v-model="targetId" label="Import into" interface="action-sheet">
              <ion-select-option value="new">A new vehicle</ion-select-option>
              <ion-select-option v-for="v in state.vehicles" :key="v.id" :value="v.id">{{ v.name }}</ion-select-option>
            </ion-select>
          </ion-item>
          <template v-if="targetId === 'new'">
            <ion-item>
              <ion-input v-model="newName" label="Name" label-placement="stacked" :maxlength="50" autocapitalize="words" />
            </ion-item>
            <ion-item>
              <ion-select v-model="newFuelType" label="Fuel" interface="action-sheet">
                <ion-select-option v-for="t in FUEL_TYPES" :key="t.value" :value="t.value">{{ t.label }}</ion-select-option>
              </ion-select>
            </ion-item>
          </template>
        </ion-list>

        <template v-if="preview.length">
          <div class="fb-section"><h2 class="fb-section-title">Latest fill-ups in the file</h2></div>
          <ion-list lines="full" class="group">
            <ion-item v-for="f in preview" :key="f.line">
              <ion-label>
                <h3>{{ formatDate(f.date) }} · {{ formatDistance(f.odometer) }}</h3>
                <p>{{ formatLitres(f.litres) }} @ {{ formatCurrency(f.pricePerLitre, currency) }}/L{{ f.isFullTank ? '' : ' · partial' }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </template>

        <ion-button expand="block" :disabled="importing || (!selectedFillUps.length && !selectedCosts.length)" @click="runImport">
          <ion-spinner v-if="importing" slot="start" name="crescent" />
          Import
        </ion-button>
        <ion-button expand="block" fill="clear" @click="reset">Choose another file</ion-button>
      </template>

      <!-- 3. Done -->
      <template v-else-if="result">
        <ion-icon :icon="checkmarkCircleOutline" class="hero-icon done" aria-hidden="true" />
        <h2>Imported {{ plural(result.fillUps, 'fill-up') }}<template v-if="result.costs"> and {{ plural(result.costs, 'running cost') }}</template></h2>
        <p v-if="result.duplicates" class="fb-muted">{{ plural(result.duplicates, 'row was', 'rows were') }} already in FuelBuddy and skipped.</p>
        <template v-if="problems.length">
          <p class="fb-muted">{{ plural(problems.length, 'row') }} could not be imported:</p>
          <ul class="problems fb-muted">
            <li v-for="p in problems.slice(0, 20)" :key="`${p.line}-${p.reason}`">Line {{ p.line }}: {{ p.reason }}</li>
            <li v-if="problems.length > 20">…and {{ problems.length - 20 }} more</li>
          </ul>
        </template>
        <ion-button expand="block" @click="finish">See my statistics</ion-button>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonPage,
  IonSelect, IonSelectOption, IonSpinner, IonTitle, IonToolbar,
} from '@ionic/vue'
import { checkmarkCircleOutline, cloudUploadOutline } from 'ionicons/icons'
import { notifyDataChanged, setActiveVehicle, useAppStore } from '../stores/appStore.js'
import { useServices } from '../services/appServices.js'
import { FUEL_TYPES } from '../services/validation.js'
import { formatCurrency, formatDate, formatDistance, formatLitres } from '../services/formatService.js'
import { useFeedback } from '../composables/useFeedback.js'

const router = useRouter()
const feedback = useFeedback()
const { state, currency } = useAppStore()

const fileInput = ref(null)
const fileName = ref('')
const plan = ref(null)
const result = ref(null)
const reading = ref(false)
const importing = ref(false)
const fileVehicle = ref(null)
const targetId = ref('new')
const newName = ref('')
const newFuelType = ref('petrol')

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const forFileVehicle = (row) => !fileVehicle.value || !row.vehicle || row.vehicle === fileVehicle.value
const selectedFillUps = computed(() => plan.value?.fillUps.filter(forFileVehicle) ?? [])
const selectedCosts = computed(() => plan.value?.costs.filter(forFileVehicle) ?? [])
const preview = computed(() => [...selectedFillUps.value].reverse().slice(0, 5))
const range = computed(() => {
  const dates = [...selectedFillUps.value, ...selectedCosts.value].map((r) => r.date).sort()
  return dates.length ? { from: dates[0], to: dates.at(-1) } : null
})
const problems = computed(() => [...(plan.value?.skipped ?? []), ...(result.value?.rejected ?? [])].sort((a, b) => a.line - b.line))

function pickFile() {
  fileInput.value.value = ''
  fileInput.value.click()
}

async function readFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  reading.value = true
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('That file is too large to be a fuel log.')
    const text = await file.text()
    plan.value = useServices().importer.read(text)
    fileName.value = file.name
    fileVehicle.value = plan.value.vehicleNames[0] ?? null
    newName.value = (fileVehicle.value || file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')).slice(0, 50)
    targetId.value = state.vehicles.length === 1 && !plan.value.vehicleNames.length ? state.vehicles[0].id : 'new'
  } catch (error) {
    feedback.error(`Couldn't read that file: ${error.message}`)
  } finally {
    reading.value = false
  }
}

async function runImport() {
  importing.value = true
  try {
    const target = targetId.value === 'new'
      ? { newVehicle: { name: newName.value.trim() || 'Imported vehicle', fuelType: newFuelType.value }, vehicleName: fileVehicle.value }
      : { vehicleId: targetId.value, vehicleName: fileVehicle.value }
    result.value = await useServices().importer.run(plan.value, target)
    await notifyDataChanged()
    setActiveVehicle(result.value.vehicleId)
  } catch (error) {
    feedback.error(error.errors ? Object.values(error.errors)[0] : `Import failed: ${error.message}`)
  } finally {
    importing.value = false
  }
}

function reset() {
  plan.value = null
  result.value = null
  pickFile()
}

function finish() {
  router.replace('/tabs/statistics')
}
</script>

<style scoped>
.import h2 {
  font-size: 1.25rem;
  margin: 8px 0;
}
.hero-icon {
  font-size: 52px;
  color: var(--ion-color-primary);
  display: block;
  margin: 12px auto 4px;
}
.hero-icon.done {
  color: var(--ion-color-success);
}
.hidden-input {
  display: none;
}
.help {
  margin-top: 20px;
  font-size: 0.9rem;
}
.help summary {
  cursor: pointer;
  color: var(--ion-color-primary);
  font-weight: 600;
}
.help li {
  margin: 6px 0;
}
.summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 0 12px;
}
.group {
  margin: 0 0 12px;
  border: 1px solid var(--fb-border);
  border-radius: var(--fb-radius);
  padding: 0;
}
.problems {
  font-size: 0.82rem;
  padding-left: 18px;
}
h3 {
  font-size: 0.95rem;
  font-weight: 600;
}
</style>
