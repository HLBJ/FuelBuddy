<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
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

      <form v-else class="fb-form" novalidate @submit.prevent="save" @keydown.enter="advanceOnEnter">
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
            <SuggestInput
              v-model="form.make"
              label="Make"
              placeholder="e.g. Volkswagen"
              :suggestions="makeList"
              :maxlength="LIMITS.makeModelLength"
              :input-class="fieldClass('make')"
              :error-text="errors.make"
              @update:model-value="form.catalogKey = null"
            />
          </ion-item>
          <ion-item>
            <SuggestInput
              v-model="form.model"
              label="Model"
              placeholder="e.g. Polo Vivo"
              :suggestions="modelList"
              :maxlength="LIMITS.makeModelLength"
              :input-class="fieldClass('model')"
              :error-text="errors.model"
              @update:model-value="form.catalogKey = null"
              @chosen="onModelChosen"
            />
          </ion-item>
          <ion-item v-if="variants.length > 1">
            <ion-select
              :value="form.catalogKey"
              label="Engine"
              label-placement="stacked"
              interface="action-sheet"
              placeholder="Choose the engine (fills in the tank size)"
              @ion-change="(e) => chooseVariant(e.detail.value)"
            >
              <ion-select-option v-for="v in variants" :key="v.key" :value="v.key">
                {{ v.model.toLowerCase() !== form.model.trim().toLowerCase() ? `${v.model} ` : '' }}{{ v.variant }}{{ v.years ? ` (${v.years})` : '' }}
              </ion-select-option>
            </ion-select>
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
              :helper-text="tankHelper"
              :class="fieldClass('tankCapacity')"
              :error-text="errors.tankCapacity"
            />
          </ion-item>
          <div v-if="tankSuggestion" class="tank-hint">
            <span class="fb-muted">{{ tankSuggestion.text }}</span>
            <ion-button size="small" fill="clear" @click="useSuggestedTank">Use {{ tankSuggestion.litres }} L</ion-button>
          </div>
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
          <ion-item>
            <ion-select v-model="form.tollClass" label="Toll class" label-placement="stacked" interface="action-sheet">
              <ion-select-option :value="1">Class 1: cars, bakkies, minibuses (2 axles)</ion-select-option>
              <ion-select-option :value="2">Class 2: medium heavy (2 axles, dual wheels)</ion-select-option>
              <ion-select-option :value="3">Class 3: large heavy (3–4 axles)</ion-select-option>
              <ion-select-option :value="4">Class 4: extra-large heavy (5+ axles)</ion-select-option>
            </ion-select>
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
import SuggestInput from '../components/SuggestInput.vue'
import { findByKey, makes, modelsFor, suggestTank, variantsFor } from '../services/vehicleCatalog.js'
import { parseDecimal } from '../services/numberUtils.js'
import { notifyDataChanged, setActiveVehicle, useAppStore } from '../stores/appStore.js'
import { advanceOnEnter } from '../composables/useEnterToAdvance.js'
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
  catalogKey: null,
  tollClass: 1,
})

// Make/model suggestions and tank size from the built-in vehicle catalogue.
const makeList = makes()
const modelList = computed(() => modelsFor(form.make))
const variants = computed(() => variantsFor(form.make, form.model))
const suggestion = computed(() => suggestTank(form))

const tankSuggestion = computed(() => {
  const s = suggestion.value
  if (!s?.tankLitres || parseDecimal(form.tankCapacity) === s.tankLitres) return null
  const what = s.entry ? `${s.entry.model} ${s.entry.variant}` : form.model
  return { litres: s.tankLitres, text: `${s.certain ? 'The' : 'A typical'} ${what} has a ${s.tankLitres} L tank.` }
})
const tankHelper = computed(() =>
  variants.value.length > 1 && !form.catalogKey && !suggestion.value?.tankLitres
    ? 'Choose the engine above to fill this in, or check your manual.'
    : 'Optional. Used to estimate your range and to check fill-ups.',
)

function useSuggestedTank() {
  form.tankCapacity = String(tankSuggestion.value.litres)
  if (suggestion.value.entry) form.catalogKey = suggestion.value.entry.key
}

function chooseVariant(key) {
  const v = findByKey(key)
  if (!v) return
  form.catalogKey = key
  if (v.tankLitres) form.tankCapacity = String(v.tankLitres)
  if (v.fuelType) form.fuelType = v.fuelType
}

function onModelChosen() {
  // One engine: take it straight away. Several: the Engine picker appears.
  const list = variants.value
  if (list.length === 1) chooseVariant(list[0].key)
  else if (!form.tankCapacity && suggestion.value?.certain && suggestion.value.tankLitres) form.tankCapacity = String(suggestion.value.tankLitres)
}

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
        catalogKey: v.catalogKey,
        tollClass: v.tollClass ?? 1,
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

<style scoped>
.tank-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 8px 0 16px;
  font-size: 0.8rem;
}
</style>
