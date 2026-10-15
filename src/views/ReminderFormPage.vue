<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/reminders" />
        </ion-buttons>
        <ion-title>{{ isEdit ? 'Edit reminder' : 'New reminder' }}</ion-title>
        <ion-buttons v-if="isEdit && loaded && !notFound" slot="end">
          <ion-button aria-label="Delete reminder" @click="remove">
            <ion-icon slot="icon-only" :icon="trashOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="!loaded" class="ion-text-center ion-padding"><ion-spinner /></div>
      <EmptyState v-else-if="notFound" :icon="alertCircleOutline" title="Reminder not found" message="It may have been deleted.">
        <ion-button expand="block" router-link="/reminders">Back to reminders</ion-button>
      </EmptyState>

      <form v-else class="fb-form" novalidate @submit.prevent="save" @keydown.enter="advanceOnEnter">
        <ion-list lines="full">
          <ion-item>
            <ion-select v-model="form.vehicleId" label="Vehicle" label-placement="stacked" interface="action-sheet">
              <ion-select-option v-for="v in state.vehicles" :key="v.id" :value="v.id">{{ v.name }}</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-select v-model="form.type" label="Type" label-placement="stacked" interface="action-sheet" @ion-change="onTypeChange">
              <ion-select-option v-for="t in REMINDER_TYPES" :key="t.value" :value="t.value">{{ t.label }}</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-input
              v-model="form.title"
              label="Name"
              label-placement="stacked"
              :maxlength="REMINDER_RULES.titleLength"
              autocapitalize="sentences"
              enterkeyhint="next"
              :class="fieldClass('title')"
              :error-text="errors.title"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="form.dueDate"
              type="date"
              label="Due date"
              label-placement="stacked"
              :class="fieldClass('dueDate')"
              :error-text="errors.dueDate"
              :helper-text="form.type === 'licence' ? 'The expiry date on your licence disc.' : ''"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="form.dueOdometer"
              label="Or due at odometer (km)"
              label-placement="stacked"
              inputmode="decimal"
              enterkeyhint="next"
              :placeholder="odometerHint"
              :class="fieldClass('dueOdometer')"
              :error-text="errors.dueOdometer"
            />
          </ion-item>
          <ion-item>
            <ion-textarea v-model="form.notes" label="Notes (optional)" label-placement="stacked" auto-grow :maxlength="REMINDER_RULES.notesLength" />
          </ion-item>
        </ion-list>
        <p class="hint fb-muted">
          With a due date you get a notification a week before and on the day. Distance reminders show on the dashboard
          when you're within {{ formatDistance(REMINDER_RULES.dueSoonKm) }}.
        </p>
        <div class="fb-form-actions">
          <ion-button expand="block" type="submit" :disabled="saving">
            <ion-spinner v-if="saving" slot="start" name="crescent" />
            {{ isEdit ? 'Save changes' : 'Save reminder' }}
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
  IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonList, IonPage, IonSelect,
  IonSelectOption, IonSpinner, IonTextarea, IonTitle, IonToolbar,
} from '@ionic/vue'
import { alertCircleOutline, trashOutline } from 'ionicons/icons'
import EmptyState from '../components/EmptyState.vue'
import { notifyDataChanged, useAppStore } from '../stores/appStore.js'
import { useServices } from '../services/appServices.js'
import { REMINDER_RULES, REMINDER_TYPES } from '../services/reminderService.js'
import { ensureNotificationPermission } from '../services/notificationService.js'
import { formatDistance, toInputValue } from '../services/formatService.js'
import { advanceOnEnter } from '../composables/useEnterToAdvance.js'
import { useFeedback } from '../composables/useFeedback.js'

const props = defineProps({ id: { type: String, default: null } })
const router = useRouter()
const feedback = useFeedback()
const { state } = useAppStore()

const isEdit = computed(() => Boolean(props.id))
const loaded = ref(false)
const notFound = ref(false)
const saving = ref(false)
const errors = ref({})
const form = reactive({ vehicleId: null, type: 'licence', title: REMINDER_TYPES[0].defaultTitle, dueDate: '', dueOdometer: '', notes: '' })

const odometerHint = computed(() => {
  const v = state.vehicles.find((x) => x.id === form.vehicleId)
  return v ? `Now ${Math.round(v.currentOdometer)}` : ''
})

function fieldClass(field) {
  return { 'ion-invalid': Boolean(errors.value[field]), 'ion-touched': Boolean(errors.value[field]) }
}

function onTypeChange() {
  // Suggest a name for the chosen type unless the user typed their own.
  const known = REMINDER_TYPES.map((t) => t.defaultTitle)
  if (!form.title || known.includes(form.title)) form.title = REMINDER_TYPES.find((t) => t.value === form.type)?.defaultTitle || ''
}

onMounted(async () => {
  if (isEdit.value) {
    const r = await useServices().reminders.getById(Number(props.id))
    if (!r) notFound.value = true
    else Object.assign(form, { vehicleId: r.vehicleId, type: r.type, title: r.title, dueDate: r.dueDate || '', dueOdometer: toInputValue(r.dueOdometer), notes: r.notes || '' })
  } else {
    form.vehicleId = state.activeVehicleId
  }
  loaded.value = true
})

async function save() {
  saving.value = true
  errors.value = {}
  try {
    const services = useServices()
    if (isEdit.value) await services.reminders.update(Number(props.id), { ...form })
    else await services.reminders.create({ ...form })
    await notifyDataChanged()
    // A date-based reminder needs notification permission. Ask after saving, without
    // waiting, and schedule the notifications once it's granted.
    if (form.dueDate) {
      ensureNotificationPermission()
        .then((granted) => granted && services.reminders.resyncAll())
        .catch(() => {})
    }
    feedback.success(isEdit.value ? 'Reminder updated' : 'Reminder saved')
    router.back()
  } catch (e) {
    if (e.errors) errors.value = e.errors
    feedback.error(e.errors ? 'Please fix the highlighted fields.' : e.message)
  } finally {
    saving.value = false
  }
}

async function remove() {
  const ok = await feedback.confirm({ header: 'Delete reminder?', message: form.title, confirmText: 'Delete', destructive: true })
  if (!ok) return
  await useServices().reminders.delete(Number(props.id))
  await notifyDataChanged()
  router.back()
}
</script>

<style scoped>
.hint {
  font-size: 0.8rem;
  margin: 10px 16px 0;
  line-height: 1.4;
}
</style>
