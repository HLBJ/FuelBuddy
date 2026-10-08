<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-back-button default-href="/vehicles" />
        </ion-buttons>
        <ion-title>{{ isEdit ? 'Edit vehicle' : 'Add vehicle' }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="!loaded" class="ion-text-center ion-padding"><ion-spinner /></div>

      <EmptyState v-else-if="notFound" :icon="alertCircleOutline" title="Vehicle not found" message="It may have been deleted.">
        <ion-button expand="block" router-link="/vehicles">Back to vehicles</ion-button>
      </EmptyState>

      <form v-else class="fb-form" novalidate @submit.prevent="save">
        <ion-list lines="full">
          <ion-item>
            <ion-input
              v-model="form.name"
              label="Name *"
              label-placement="stacked"
              placeholder="e.g. My Polo"
              autocapitalize="words"
              :maxlength="LIMITS.nameLength"
              :class="fieldClass('name')"
              :error-text="errors.name"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="form.make"
              label="Make"
              label-placement="stacked"
              placeholder="e.g. Volkswagen"
              autocapitalize="words"
              :maxlength="LIMITS.makeModelLength"
              :class="fieldClass('make')"
              :error-text="errors.make"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="form.model"
              label="Model"
              label-placement="stacked"
              placeholder="e.g. Polo Vivo"
              autocapitalize="words"
              :maxlength="LIMITS.makeModelLength"
              :class="fieldClass('model')"
              :error-text="errors.model"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="form.registration"
              label="Registration"
              label-placement="stacked"
              placeholder="e.g. CA 123-456"
              autocapitalize="characters"
              :maxlength="LIMITS.registrationLength"
              :class="fieldClass('registration')"
              :error-text="errors.registration"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="form.year"
              label="Year"
              label-placement="stacked"
              inputmode="numeric"
              placeholder="e.g. 2019"
              :class="fieldClass('year')"
              :error-text="errors.year"
            />
          </ion-item>
          <ion-item>
            <ion-select v-model="form.fuelType" label="Fuel type" label-placement="stacked" interface="action-sheet">
              <ion-select-option v-for="t in FUEL_TYPES" :key="t.value" :value="t.value">{{ t.label }}</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-input
              v-model="form.tankCapacity"
              label="Tank capacity (litres)"
              label-placement="stacked"
              inputmode="decimal"
              placeholder="e.g. 45"
              helper-text="Optional. Used to check fill-ups and trip planning."
              :class="fieldClass('tankCapacity')"
              :error-text="errors.tankCapacity"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="form.currentOdometer"
              label="Current odometer (km) *"
              label-placement="stacked"
              inputmode="decimal"
              placeholder="e.g. 85000"
              :class="fieldClass('currentOdometer')"
              :error-text="errors.currentOdometer"
            />
          </ion-item>
          <ion-item v-if="showDefaultToggle">
            <ion-toggle v-model="form.isDefault" justify="space-between">Default vehicle</ion-toggle>
          </ion-item>
        </ion-list>

        <div class="fb-form-actions">
          <ion-button expand="block" type="submit" :disabled="saving">
            <ion-spinner v-if="saving" slot="start" name="crescent" />
            {{ isEdit ? 'Save changes' : 'Add vehicle' }}
          </ion-button>
        </div>
      </form>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonInput, IonItem, IonList, IonPage, IonSelect,
  IonSelectOption, IonSpinner, IonTitle, IonToggle, IonToolbar,
} from '@ionic/vue'
import { alertCircleOutline } from 'ionicons/icons'
import EmptyState from '../components/EmptyState.vue'
import { notifyDataChanged, setActiveVehicle, useAppStore } from '../stores/appStore.js'
import { useServices } from '../services/appServices.js'
import { FUEL_TYPES, LIMITS } from '../services/validation.js'
import { toInputValue } from '../services/formatService.js'
import { useFeedback } from '../composables/useFeedback.js'

const props = defineProps({ id: { type: String, default: null } })
const route = useRoute()
const router = useRouter()
const feedback = useFeedback()
const { state } = useAppStore()

const isEdit = computed(() => Boolean(props.id))
const loaded = ref(false)
const notFound = ref(false)
const saving = ref(false)
const errors = ref({})
const wasDefault = ref(false)

const form = reactive({
  name: '',
  make: '',
  model: '',
  registration: '',
  year: '',
  fuelType: 'petrol',
  tankCapacity: '',
  currentOdometer: '',
  isDefault: false,
})

// The first vehicle is always the default; an existing default stays default
// until another vehicle is made default.
const showDefaultToggle = computed(() => state.vehicles.length > 0 && !wasDefault.value)

function fieldClass(field) {
  return { 'ion-invalid': Boolean(errors.value[field]), 'ion-touched': Boolean(errors.value[field]) }
}

onMounted(async () => {
  if (isEdit.value) {
    const v = await useServices().vehicles.getById(Number(props.id))
    if (!v) notFound.value = true
    else {
      wasDefault.value = v.isDefault
      Object.assign(form, {
        name: v.name,
        make: v.make || '',
        model: v.model || '',
        registration: v.registration || '',
        year: v.year ? String(v.year) : '',
        fuelType: v.fuelType,
        tankCapacity: toInputValue(v.tankCapacity),
        currentOdometer: toInputValue(v.currentOdometer),
        isDefault: v.isDefault,
      })
    }
  }
  loaded.value = true
})

async function save() {
  saving.value = true
  errors.value = {}
  try {
    const services = useServices()
    const saved = isEdit.value
      ? await services.vehicles.update(Number(props.id), { ...form })
      : await services.vehicles.create({ ...form })
    await notifyDataChanged()
    if (!isEdit.value) setActiveVehicle(saved.id)
    feedback.success(isEdit.value ? 'Vehicle updated' : `${saved.name} added`)
    if (route.query.from === 'onboarding') router.replace('/tabs/dashboard')
    else router.back()
  } catch (error) {
    if (error.errors) errors.value = error.errors
    feedback.error(error.errors ? 'Please fix the highlighted fields.' : error.message)
  } finally {
    saving.value = false
  }
}
</script>
