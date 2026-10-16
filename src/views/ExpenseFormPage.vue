<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/costs" />
        </ion-buttons>
        <ion-title>{{ isEdit ? 'Edit running cost' : 'Add running cost' }}</ion-title>
        <ion-buttons v-if="isEdit && loaded && !notFound" slot="end">
          <ion-button aria-label="Delete running cost" @click="remove">
            <ion-icon slot="icon-only" :icon="trashOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="!loaded" class="ion-text-center ion-padding"><ion-spinner /></div>
      <EmptyState v-else-if="notFound" :icon="alertCircleOutline" title="Not found" message="It may have been deleted.">
        <ion-button expand="block" router-link="/costs">Back to running costs</ion-button>
      </EmptyState>

      <form v-else class="fb-form" novalidate @submit.prevent="save" @keydown.enter="advanceOnEnter">
        <ion-list lines="full">
          <ion-item>
            <ion-select v-model="form.vehicleId" label="Vehicle" label-placement="stacked" interface="action-sheet">
              <ion-select-option v-for="v in state.vehicles" :key="v.id" :value="v.id">{{ v.name }}</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-select v-model="form.category" label="Category" label-placement="stacked" interface="action-sheet" :class="fieldClass('category')">
              <ion-select-option v-for="c in EXPENSE_CATEGORIES" :key="c.value" :value="c.value">{{ c.label }}</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-input
              v-model="form.amount"
              :label="`Amount (${currencySymbol})`"
              label-placement="stacked"
              inputmode="decimal"
              enterkeyhint="next"
              placeholder="e.g. 2450"
              :class="fieldClass('amount')"
              :error-text="errors.amount"
            />
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
              v-model="form.description"
              label="Description (optional)"
              label-placement="stacked"
              autocapitalize="sentences"
              enterkeyhint="next"
              placeholder="e.g. 60 000 km service"
              :maxlength="EXPENSE_LIMITS.descriptionLength"
              :class="fieldClass('description')"
              :error-text="errors.description"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="form.odometer"
              label="Odometer (optional, km)"
              label-placement="stacked"
              inputmode="decimal"
              enterkeyhint="done"
              :placeholder="odometerHint"
              :class="fieldClass('odometer')"
              :error-text="errors.odometer"
            />
          </ion-item>
        </ion-list>

        <div class="fb-form-actions">
          <ion-button expand="block" type="submit" :disabled="saving">
            <ion-spinner v-if="saving" slot="start" name="crescent" />
            {{ isEdit ? 'Save changes' : 'Save' }}
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
  IonSelectOption, IonSpinner, IonTitle, IonToolbar,
} from '@ionic/vue'
import { alertCircleOutline, trashOutline } from 'ionicons/icons'
import EmptyState from '../components/EmptyState.vue'
import { notifyDataChanged, useAppStore } from '../stores/appStore.js'
import { useServices } from '../services/appServices.js'
import { EXPENSE_CATEGORIES, EXPENSE_LIMITS } from '../services/expenseService.js'
import { toIsoDate } from '../services/dateUtils.js'
import { formatCurrency, toInputValue } from '../services/formatService.js'
import { advanceOnEnter } from '../composables/useEnterToAdvance.js'
import { useFeedback } from '../composables/useFeedback.js'

const props = defineProps({ id: { type: String, default: null } })
const router = useRouter()
const feedback = useFeedback()
const { state, currency } = useAppStore()

const today = toIsoDate()
const isEdit = computed(() => Boolean(props.id))
const loaded = ref(false)
const notFound = ref(false)
const saving = ref(false)
const errors = ref({})
const form = reactive({ vehicleId: null, category: 'service', amount: '', date: today, description: '', odometer: '' })

const currencySymbol = computed(() => formatCurrency(0, currency.value).replace(/[\d.,\s ]/g, '') || currency.value)
const odometerHint = computed(() => {
  const v = state.vehicles.find((x) => x.id === form.vehicleId)
  return v ? `Now ${Math.round(v.currentOdometer)}` : ''
})

function fieldClass(field) {
  return { 'ion-invalid': Boolean(errors.value[field]), 'ion-touched': Boolean(errors.value[field]) }
}

onMounted(async () => {
  try {
    if (isEdit.value) {
      const e = await useServices().expenses.getById(Number(props.id))
      if (!e) notFound.value = true
      else {
        Object.assign(form, {
          vehicleId: e.vehicleId, category: e.category, amount: toInputValue(e.amount), date: e.date,
          description: e.description || '', odometer: toInputValue(e.odometer),
        })
      }
    } else {
      form.vehicleId = state.activeVehicleId
    }
  } finally {
    loaded.value = true
  }
})

async function save() {
  saving.value = true
  errors.value = {}
  try {
    const services = useServices()
    if (isEdit.value) await services.expenses.update(Number(props.id), { ...form })
    else await services.expenses.create({ ...form })
    await notifyDataChanged()
    feedback.success(isEdit.value ? 'Running cost updated' : 'Running cost saved')
    router.back()
  } catch (error) {
    if (error.errors) errors.value = error.errors
    feedback.error(error.errors ? 'Please fix the highlighted fields.' : error.message)
  } finally {
    saving.value = false
  }
}

async function remove() {
  const ok = await feedback.confirm({ header: 'Delete this cost?', message: 'It will be removed permanently.', confirmText: 'Delete', destructive: true })
  if (!ok) return
  await useServices().expenses.delete(Number(props.id))
  await notifyDataChanged()
  router.back()
}
</script>
