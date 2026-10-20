<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/logbook" />
        </ion-buttons>
        <ion-title>{{ isEdit ? 'Edit trip' : 'Log a trip' }}</ion-title>
        <ion-buttons v-if="isEdit && loaded && !notFound" slot="end">
          <ion-button aria-label="Delete trip" @click="remove">
            <ion-icon slot="icon-only" :icon="trashOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="!loaded" class="ion-text-center ion-padding"><ion-spinner /></div>
      <EmptyState v-else-if="notFound" :icon="alertCircleOutline" title="Trip not found" message="It may have been deleted.">
        <ion-button expand="block" router-link="/logbook">Back to logbook</ion-button>
      </EmptyState>

      <form v-else class="fb-form" novalidate @submit.prevent="save" @keydown.enter="advanceOnEnter">
        <div class="purpose">
          <ion-segment :value="form.purpose" @ion-change="(e) => (form.purpose = e.detail.value)">
            <ion-segment-button value="business"><ion-label>Business</ion-label></ion-segment-button>
            <ion-segment-button value="private"><ion-label>Private</ion-label></ion-segment-button>
          </ion-segment>
        </div>

        <ion-list lines="full">
          <ion-item>
            <ion-select v-model="form.vehicleId" label="Vehicle" label-placement="stacked" interface="action-sheet">
              <ion-select-option v-for="v in state.vehicles" :key="v.id" :value="v.id">{{ v.name }}</ion-select-option>
            </ion-select>
          </ion-item>
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
              v-model="form.startOdometer"
              label="Odometer at start (km)"
              label-placement="stacked"
              inputmode="decimal"
              enterkeyhint="next"
              :class="fieldClass('startOdometer')"
              :error-text="errors.startOdometer"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="form.endOdometer"
              label="Odometer at end (km)"
              label-placement="stacked"
              inputmode="decimal"
              enterkeyhint="next"
              :class="fieldClass('endOdometer')"
              :error-text="errors.endOdometer"
              :helper-text="distanceText"
            />
            <ion-button v-if="canScan" slot="end" fill="clear" :disabled="scanning" aria-label="Read the odometer from a photo" @click="scanOdo('endOdometer')">
              <ion-spinner v-if="scanning" slot="icon-only" name="crescent" />
              <ion-icon v-else slot="icon-only" :icon="cameraOutline" />
            </ion-button>
          </ion-item>
          <ion-item>
            <ion-input
              v-model="form.origin"
              label="From (optional)"
              label-placement="stacked"
              autocapitalize="words"
              enterkeyhint="next"
              :maxlength="LOGBOOK_LIMITS.placeLength"
              :class="fieldClass('origin')"
              :error-text="errors.origin"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="form.destination"
              :label="form.purpose === 'business' ? 'Destination' : 'Destination (optional)'"
              label-placement="stacked"
              autocapitalize="words"
              enterkeyhint="next"
              placeholder="e.g. ABC Ltd, Bellville"
              :maxlength="LOGBOOK_LIMITS.placeLength"
              :class="fieldClass('destination')"
              :error-text="errors.destination"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="form.reason"
              :label="form.purpose === 'business' ? 'Reason for the trip' : 'Reason (optional)'"
              label-placement="stacked"
              autocapitalize="sentences"
              enterkeyhint="next"
              placeholder="e.g. Client meeting"
              :maxlength="LOGBOOK_LIMITS.reasonLength"
              :class="fieldClass('reason')"
              :error-text="errors.reason"
            />
          </ion-item>
          <ion-item>
            <ion-textarea v-model="form.notes" label="Notes (optional)" label-placement="stacked" auto-grow :maxlength="LOGBOOK_LIMITS.notesLength" />
          </ion-item>
        </ion-list>

        <div class="fb-form-actions">
          <ion-button expand="block" type="submit" :disabled="saving">
            <ion-spinner v-if="saving" slot="start" name="crescent" />
            {{ isEdit ? 'Save changes' : 'Save trip' }}
          </ion-button>
          <ion-button v-if="!isEdit" expand="block" fill="outline" :disabled="saving" @click="save({ returnTrip: true })">
            Save and log the return trip
          </ion-button>
        </div>
      </form>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonPage,
  IonSegment, IonSegmentButton, IonSelect, IonSelectOption, IonSpinner, IonTextarea, IonTitle, IonToolbar,
} from '@ionic/vue'
import { alertCircleOutline, cameraOutline, trashOutline } from 'ionicons/icons'
import { Capacitor } from '@capacitor/core'
import { scanOdometer } from '../services/odometerScanService.js'
import EmptyState from '../components/EmptyState.vue'
import { notifyDataChanged, useAppStore } from '../stores/appStore.js'
import { useServices } from '../services/appServices.js'
import { LOGBOOK_LIMITS } from '../services/logbookService.js'
import { parseDecimal } from '../services/numberUtils.js'
import { toIsoDate } from '../services/dateUtils.js'
import { formatDistance, toInputValue } from '../services/formatService.js'
import { advanceOnEnter } from '../composables/useEnterToAdvance.js'
import { useFeedback } from '../composables/useFeedback.js'

const props = defineProps({ id: { type: String, default: null } })
const router = useRouter()
const feedback = useFeedback()
const { state } = useAppStore()

const today = toIsoDate()
const isEdit = computed(() => Boolean(props.id))
const loaded = ref(false)
const notFound = ref(false)
const saving = ref(false)
const errors = ref({})
const form = reactive({
  vehicleId: null, date: today, purpose: 'business', startOdometer: '', endOdometer: '', origin: '', destination: '', reason: '', notes: '',
})

const distanceText = computed(() => {
  const start = parseDecimal(form.startOdometer)
  const end = parseDecimal(form.endOdometer)
  return start !== null && end !== null && end >= start ? `Distance: ${formatDistance(end - start)}` : ''
})

const canScan = Capacitor.isNativePlatform()
const scanning = ref(false)

async function scanOdo(field) {
  scanning.value = true
  try {
    const result = await scanOdometer({ lastOdometer: parseDecimal(form.startOdometer) })
    if (!result) return
    if (result.best === null) feedback.error("Couldn't find the odometer reading. Try a closer, sharper photo.")
    else {
      form[field] = String(result.best)
      feedback.toast(`Odometer ${formatDistance(result.best)}. Please check it.`, 'success', 2500)
    }
  } catch (error) {
    feedback.error(`Couldn't read the photo: ${error.message}`)
  } finally {
    scanning.value = false
  }
}

function fieldClass(field) {
  return { 'ion-invalid': Boolean(errors.value[field]), 'ion-touched': Boolean(errors.value[field]) }
}

onMounted(async () => {
  try {
    if (isEdit.value) {
      const t = await useServices().logbook.getById(Number(props.id))
      if (!t) notFound.value = true
      else {
        Object.assign(form, {
          vehicleId: t.vehicleId, date: t.date, purpose: t.purpose, startOdometer: toInputValue(t.startOdometer),
          endOdometer: toInputValue(t.endOdometer), origin: t.origin || '', destination: t.destination || '', reason: t.reason || '', notes: t.notes || '',
        })
      }
    } else {
      form.vehicleId = state.activeVehicleId
      if (form.vehicleId) form.startOdometer = toInputValue(await useServices().logbook.suggestedStart(form.vehicleId))
    }
  } catch (error) {
    feedback.error(error.message)
  } finally {
    loaded.value = true
  }
})

async function save({ returnTrip = false } = {}) {
  saving.value = true
  errors.value = {}
  try {
    const services = useServices()
    if (isEdit.value) await services.logbook.update(Number(props.id), { ...form })
    else await services.logbook.create({ ...form })
    await notifyDataChanged()
    if (returnTrip) {
      // Same day, back the way you came: start where this trip ended.
      Object.assign(form, {
        startOdometer: form.endOdometer,
        endOdometer: '',
        origin: form.destination,
        destination: form.origin,
        notes: '',
      })
      feedback.toast('Trip saved. Now enter the odometer at the end of the return trip.', 'success', 3000)
      return
    }
    feedback.success(isEdit.value ? 'Trip updated' : 'Trip saved')
    router.back()
  } catch (error) {
    if (error.errors) errors.value = error.errors
    feedback.error(error.errors ? 'Please fix the highlighted fields.' : error.message)
  } finally {
    saving.value = false
  }
}

async function remove() {
  const ok = await feedback.confirm({ header: 'Delete trip?', message: 'This trip will be removed from your logbook.', confirmText: 'Delete', destructive: true })
  if (!ok) return
  await useServices().logbook.delete(Number(props.id))
  await notifyDataChanged()
  router.back()
}
</script>

<style scoped>
.purpose {
  padding: 12px 16px 4px;
}
.fb-form-actions ion-button + ion-button {
  margin-top: 8px;
}
</style>
