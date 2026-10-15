<template>
  <div class="place-search">
    <div class="row">
      <ion-input
        v-model="query"
        :label="label"
        label-placement="stacked"
        :placeholder="placeholder"
        enterkeyhint="search"
        autocapitalize="words"
        :clear-input="true"
        :class="{ 'ion-invalid ion-touched': Boolean(error) }"
        :error-text="error"
        @keydown.enter.prevent="search"
        @ion-input="onTyping"
      />
      <ion-button fill="clear" :aria-label="`Search ${label}`" :disabled="busy" @click="search">
        <ion-spinner v-if="busy" slot="icon-only" name="crescent" />
        <ion-icon v-else slot="icon-only" :icon="searchOutline" />
      </ion-button>
    </div>
    <ion-button v-if="allowLocation && !modelValue" size="small" fill="clear" class="locate" :disabled="busy" @click="useMyLocation">
      <ion-icon slot="start" :icon="locateOutline" />
      Use my location
    </ion-button>

    <ion-list v-if="results.length" class="results" lines="full">
      <ion-item v-for="(r, i) in results" :key="i" button detail="false" @click="choose(r)">
        <ion-icon slot="start" :icon="locationOutline" aria-hidden="true" />
        <ion-label class="ion-text-wrap">{{ r.label }}</ion-label>
      </ion-item>
    </ion-list>
    <p v-else-if="searched && !busy && !error" class="none fb-muted">No places found. Try a town or street name.</p>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { IonButton, IonIcon, IonInput, IonItem, IonLabel, IonList, IonSpinner } from '@ionic/vue'
import { locateOutline, locationOutline, searchOutline } from 'ionicons/icons'
import { getCurrentPosition, reverseGeocode, searchPlaces } from '../services/geoService.js'

const props = defineProps({
  label: { type: String, required: true },
  placeholder: { type: String, default: 'Town, suburb or address' },
  modelValue: { type: Object, default: null }, // { lat, lon, label }
  allowLocation: { type: Boolean, default: false },
  near: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue'])

const query = ref(props.modelValue?.label || '')
const results = ref([])
const busy = ref(false)
const error = ref('')
const searched = ref(false)

watch(() => props.modelValue, (v) => {
  if (v && v.label !== query.value) query.value = v.label
})

function onTyping() {
  // Editing the text invalidates the previously chosen place.
  if (props.modelValue && query.value !== props.modelValue.label) emit('update:modelValue', null)
  searched.value = false
  error.value = ''
}

async function search() {
  if ((query.value || '').trim().length < 2) {
    error.value = 'Type at least two letters.'
    return
  }
  busy.value = true
  error.value = ''
  try {
    results.value = await searchPlaces(query.value, { near: props.near || undefined })
    searched.value = true
  } catch (e) {
    results.value = []
    error.value = e.message
  } finally {
    busy.value = false
  }
}

function choose(place) {
  results.value = []
  searched.value = false
  query.value = place.label
  emit('update:modelValue', place)
}

async function useMyLocation() {
  busy.value = true
  error.value = ''
  try {
    const pos = await getCurrentPosition()
    const label = await reverseGeocode(pos)
    choose({ ...pos, label })
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.row {
  display: flex;
  align-items: flex-end;
  gap: 4px;
}
.row ion-input {
  flex: 1;
}
.locate {
  margin: 0;
  --padding-start: 0;
}
.results {
  margin-top: 4px;
  border: 1px solid var(--fb-border);
  border-radius: 10px;
  padding: 0;
  max-height: 260px;
  overflow-y: auto;
}
.results ion-icon {
  color: var(--fb-text-muted);
  margin-inline-end: 12px;
}
.none {
  font-size: 0.85rem;
  margin: 6px 0 0;
}
</style>
