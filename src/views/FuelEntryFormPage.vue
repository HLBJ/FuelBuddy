<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/history" />
        </ion-buttons>
        <ion-title>{{ isEdit ? 'Edit fill-up' : 'Add fill-up' }}</ion-title>
        <ion-buttons v-if="isEdit && loaded" slot="end">
          <ion-button aria-label="Delete fill-up" @click="remove">
            <ion-icon slot="icon-only" :icon="trashOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="!loaded && !notFound" class="ion-text-center ion-padding"><ion-spinner /></div>

      <EmptyState v-else-if="notFound" :icon="alertCircleOutline" title="Fill-up not found" message="It may have been deleted.">
        <ion-button expand="block" router-link="/tabs/history">Back to history</ion-button>
      </EmptyState>

      <EmptyState
        v-else-if="!state.vehicles.length"
        :icon="carSportOutline"
        title="Add a vehicle first"
        message="Fill-ups are recorded per vehicle."
      >
        <ion-button expand="block" router-link="/vehicles/new">Add vehicle</ion-button>
      </EmptyState>

      <form v-else class="fb-form" novalidate @submit.prevent="save" @keydown.enter="advanceOnEnter">
        <ion-list lines="full">
          <ion-item>
            <ion-select
              v-model="form.vehicleId"
              label="Vehicle"
              label-placement="stacked"
              interface="action-sheet"
              :class="fieldClass('vehicleId')"
            >
              <ion-select-option v-for="v in state.vehicles" :key="v.id" :value="v.id">{{ v.name }}</ion-select-option>
            </ion-select>
          </ion-item>
          <div v-if="errors.vehicleId" class="field-error">{{ errors.vehicleId }}</div>

          <ion-item>
            <ion-input
              v-model="form.date"
              type="date"
              label="Date"
              label-placement="stacked"
              :max="today"
              :class="fieldClass('date')"
              :error-text="errors.date"
            />
          </ion-item>

          <ion-item>
            <ion-input
              v-model="form.odometer"
              label="Odometer (km)"
              label-placement="stacked"
              inputmode="decimal"
              enterkeyhint="next"
              :placeholder="odometerPlaceholder"
              :class="fieldClass('odometer')"
              :error-text="errors.odometer"
              :helper-text="odometerHelper"
            />
          </ion-item>
          <div v-if="warnings.odometer && !errors.odometer" class="fb-warning-text">{{ warnings.odometer }}</div>

          <ion-item>
            <ion-input
              v-model="form.litres"
              label="Litres"
              label-placement="stacked"
              inputmode="decimal"
              enterkeyhint="next"
              placeholder="e.g. 42.5"
              :class="fieldClass('litres')"
              :error-text="errors.litres"
            />
          </ion-item>
          <div v-if="warnings.litres && !errors.litres" class="fb-warning-text">{{ warnings.litres }}</div>

          <ion-item>
            <ion-input
              v-model="form.pricePerLitre"
              :label="`Price per litre (${currencySymbol})`"
              label-placement="stacked"
              inputmode="decimal"
              enterkeyhint="next"
              placeholder="e.g. 23.45"
              :class="fieldClass('pricePerLitre')"
              :error-text="errors.pricePerLitre"
              @ion-input="priceSource = 'user'"
            />
          </ion-item>
          <div v-if="officialHint" class="price-hint fb-muted">
            <span>{{ officialHint }}</span>
            <ion-button v-if="canUseOfficial" size="small" fill="clear" @click="useOfficialPrice">
              Use {{ formatCurrency(official.price, currency) }}
            </ion-button>
          </div>

          <ion-item lines="full" class="total-row">
            <ion-label>Total cost</ion-label>
            <span slot="end" class="total fb-tabular" aria-live="polite">{{ totalDisplay }}</span>
          </ion-item>

          <ion-item>
            <ion-toggle v-model="form.isFullTank" justify="space-between">
              Filled to full
              <p class="toggle-help fb-muted">Needed to measure consumption accurately.</p>
            </ion-toggle>
          </ion-item>

          <ion-item>
            <ion-input
              v-model="form.fuelStation"
              label="Fuel station (optional)"
              label-placement="stacked"
              autocapitalize="words"
              :maxlength="LIMITS.stationLength"
              :class="fieldClass('fuelStation')"
              :error-text="errors.fuelStation"
            />
          </ion-item>

          <ion-item>
            <ion-textarea
              v-model="form.notes"
              label="Notes (optional)"
              label-placement="stacked"
              auto-grow
              :maxlength="LIMITS.notesLength"
              :class="fieldClass('notes')"
              :error-text="errors.notes"
            />
          </ion-item>
        </ion-list>

        <div class="fb-form-actions">
          <ion-button expand="block" type="submit" :disabled="saving">
            <ion-spinner v-if="saving" slot="start" name="crescent" />
            {{ isEdit ? 'Save changes' : 'Save fill-up' }}
          </ion-button>
        </div>
      </form>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList,
  IonPage, IonSelect, IonSelectOption, IonSpinner, IonTextarea, IonTitle, IonToggle, IonToolbar,
} from '@ionic/vue'
import { alertCircleOutline, carSportOutline, trashOutline } from 'ionicons/icons'
import EmptyState from '../components/EmptyState.vue'
import { gradeForVehicle, notifyDataChanged, setActiveVehicle, useAppStore } from '../stores/appStore.js'
import { FUEL_GRADES, priceOn } from '../services/fuelPriceService.js'
import { advanceOnEnter } from '../composables/useEnterToAdvance.js'
import { useServices } from '../services/appServices.js'
import { LIMITS } from '../services/validation.js'
import { parseDecimal } from '../services/numberUtils.js'
import { calculateTotalCost } from '../services/fuelCalculationService.js'
import { toIsoDate } from '../services/dateUtils.js'
import { formatCurrency, formatDistance, toInputValue } from '../services/formatService.js'
import { useFeedback } from '../composables/useFeedback.js'
import { maybeAskForReview } from '../services/reviewService.js'

const props = defineProps({ id: { type: String, default: null } })
const router = useRouter()
const feedback = useFeedback()
const { state, currency } = useAppStore()

const isEdit = computed(() => Boolean(props.id))
const today = toIsoDate()
const loaded = ref(false)
const notFound = ref(false)
const saving = ref(false)
const submitted = ref(false)
const errors = ref({})
const warnings = ref({})
const lastEntry = ref(null)
/** Where the price came from: 'official' follows the date; 'user'/'last'/'slip' stay put. */
const priceSource = ref(null)

const form = reactive({
  vehicleId: null,
  date: today,
  odometer: '',
  litres: '',
  pricePerLitre: '',
  fuelStation: '',
  notes: '',
  isFullTank: true,
})

const currencySymbol = computed(() => formatCurrency(0, currency.value).replace(/[\d.,\s ]/g, '') || currency.value)

const totalDisplay = computed(() => {
  const total = calculateTotalCost(parseDecimal(form.litres), parseDecimal(form.pricePerLitre))
  return total === null ? '—' : formatCurrency(total, currency.value)
})

const selectedVehicle = computed(() => state.vehicles.find((v) => v.id === form.vehicleId) || null)
const odometerPlaceholder = computed(() =>
  selectedVehicle.value ? `Current: ${Math.round(selectedVehicle.value.currentOdometer)}` : '',
)
const odometerHelper = computed(() =>
  !isEdit.value && lastEntry.value ? `Last fill-up: ${formatDistance(lastEntry.value.odometer)}` : '',
)

// Official SA price for this vehicle's fuel on the fill-up date.
const official = computed(() => {
  const grade = gradeForVehicle(selectedVehicle.value)
  return priceOn(state.fuelPrices, { date: form.date, region: state.settings.fuelRegion, grade })
})
const officialHint = computed(() => {
  const o = official.value
  if (!o) return ''
  const grade = FUEL_GRADES[gradeForVehicle(selectedVehicle.value)]
  const where = state.settings.fuelRegion === 'coastal' ? 'Coastal' : 'Gauteng'
  const price = formatCurrency(o.price, currency.value)
  return o.regulated
    ? `${where} ${grade.short} price on this date: ${price}. Prices vary slightly by town.`
    : `Wholesale ${grade.label.toLowerCase()}: ${price}. Pumps charge a little more.`
})
const canUseOfficial = computed(() =>
  Boolean(official.value?.regulated) && parseDecimal(form.pricePerLitre) !== official.value.price,
)

function useOfficialPrice() {
  form.pricePerLitre = toInputValue(official.value.price)
  priceSource.value = 'official'
}

// An official price follows the date and vehicle until the user types their own.
watch(official, (o) => {
  if (!isEdit.value && priceSource.value === 'official' && o?.regulated) form.pricePerLitre = toInputValue(o.price)
})

function fieldClass(field) {
  return { 'ion-invalid': Boolean(errors.value[field]), 'ion-touched': Boolean(errors.value[field]) }
}

async function loadLastEntry() {
  lastEntry.value = null
  if (!form.vehicleId) return
  const [latest] = await useServices().fuel.listRecent(form.vehicleId, 1)
  lastEntry.value = latest || null
}

onMounted(async () => {
  try {
    if (isEdit.value) {
      const entry = await useServices().fuel.getById(Number(props.id))
      if (!entry) {
        notFound.value = true
        return
      }
      Object.assign(form, {
        vehicleId: entry.vehicleId,
        date: entry.date,
        odometer: toInputValue(entry.odometer),
        litres: toInputValue(entry.litres),
        pricePerLitre: toInputValue(entry.pricePerLitre),
        fuelStation: entry.fuelStation || '',
        notes: entry.notes || '',
        isFullTank: entry.isFullTank,
      })
    } else {
      form.vehicleId = state.activeVehicleId
      await loadLastEntry()
      // Pre-fill the official petrol price, else the previous fill-up's; the user can change it.
      if (official.value?.regulated) useOfficialPrice()
      else if (lastEntry.value?.pricePerLitre) {
        form.pricePerLitre = toInputValue(lastEntry.value.pricePerLitre)
        priceSource.value = 'last'
      }
    }
  } catch (error) {
    feedback.error(error.message)
  } finally {
    loaded.value = true
  }
})

watch(
  () => state.activeVehicleId,
  async (id) => {
    if (!isEdit.value && !form.vehicleId && id) {
      form.vehicleId = id
      await loadLastEntry()
    }
  },
)

watch(() => form.vehicleId, (id, previous) => {
  if (!isEdit.value && previous !== undefined && previous !== null) loadLastEntry()
})

// After the first save attempt, re-validate as the user edits.
watch(form, () => {
  if (submitted.value) runCheck()
})

async function runCheck() {
  const excludeId = isEdit.value ? Number(props.id) : null
  const result = await useServices().fuel.check({ ...form }, excludeId)
  errors.value = result.errors
  warnings.value = result.warnings
  return result
}

async function save() {
  submitted.value = true
  const check = await runCheck()
  if (!check.valid) {
    feedback.error('Please fix the highlighted fields.')
    return
  }
  saving.value = true
  try {
    const services = useServices()
    if (isEdit.value) await services.fuel.update(Number(props.id), { ...form })
    else await services.fuel.create({ ...form })
    setActiveVehicle(form.vehicleId)
    await notifyDataChanged()
    feedback.success(isEdit.value ? 'Fill-up updated' : 'Fill-up saved')
    router.back()
    // After a new fill-up (not an edit), maybe ask for a Play Store rating, once the
    // screen has settled back on the previous page.
    if (!isEdit.value) setTimeout(() => maybeAskForReview(services), 1500)
  } catch (error) {
    if (error.errors) errors.value = error.errors
    feedback.error(error.message)
  } finally {
    saving.value = false
  }
}

async function remove() {
  const ok = await feedback.confirm({
    header: 'Delete fill-up?',
    message: 'This fill-up will be removed permanently.',
    confirmText: 'Delete',
    destructive: true,
  })
  if (!ok) return
  try {
    await useServices().fuel.delete(Number(props.id))
    await notifyDataChanged()
    feedback.success('Fill-up deleted')
    router.back()
  } catch (error) {
    feedback.error(error.message)
  }
}
</script>

<style scoped>
.total-row {
  --background: var(--fb-surface-muted);
}
.total {
  font-size: 1.25rem;
  font-weight: 700;
}
.toggle-help {
  font-size: 0.78rem;
  margin: 2px 0 0;
  white-space: normal;
}
.price-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.78rem;
  padding: 4px 8px 0 16px;
  line-height: 1.35;
}
.price-hint ion-button {
  flex-shrink: 0;
  margin: 0;
}
.field-error {
  color: var(--ion-color-danger);
  font-size: 0.8rem;
  padding: 4px 16px 0;
}
</style>
