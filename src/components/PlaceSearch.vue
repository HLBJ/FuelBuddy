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
        autocomplete="off"
        :autocorrect="false"
        :clear-input="true"
        :class="{ 'ion-invalid ion-touched': Boolean(error) }"
        :error-text="error"
        @keydown.enter.prevent="search"
        @ion-input="onTyping"
        @ion-focus="focused = true"
        @ion-blur="onBlur"
      />
      <ion-button fill="clear" :aria-label="`Search ${label}`" :disabled="busy" @click="search">
        <ion-spinner v-if="busy" slot="icon-only" name="crescent" />
        <ion-icon v-else slot="icon-only" :icon="searchOutline" />
      </ion-button>
    </div>
    <ion-button v-if="allowLocation && !modelValue && !query" size="small" fill="clear" class="locate" :disabled="busy" @click="useMyLocation">
      <ion-icon slot="start" :icon="locateOutline" />
      Use my location
    </ion-button>

    <ion-list v-if="showList" class="results" lines="full" role="listbox" :aria-label="`${label} suggestions`">
      <!-- mousedown.prevent keeps the input focused so the list does not vanish before the tap lands -->
      <ion-item v-for="(r, i) in results" :key="`${r.lat},${r.lon},${i}`" button detail="false" role="option" @mousedown.prevent @click="choose(r)">
        <ion-icon slot="start" :icon="r.source === 'online' ? globeOutline : locationOutline" aria-hidden="true" />
        <ion-label class="ion-text-wrap">{{ r.label }}</ion-label>
      </ion-item>
      <ion-item v-if="onlineLoading" lines="none" class="loading">
        <ion-spinner slot="start" name="dots" />
        <ion-label class="fb-muted">Looking up streets and places online…</ion-label>
      </ion-item>
    </ion-list>
    <p v-else-if="searched && !busy && !error && !results.length" class="none fb-muted">No places found. Try a town or street name.</p>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { IonButton, IonIcon, IonInput, IonItem, IonLabel, IonList, IonSpinner } from '@ionic/vue'
import { globeOutline, locateOutline, locationOutline, searchOutline } from 'ionicons/icons'
import { getCurrentPosition, reverseGeocode, searchPlaces, suggestPlaces } from '../services/geoService.js'
import { loadPlaceIndex, mergeSuggestions } from '../services/placeIndex.js'

const props = defineProps({
  label: { type: String, required: true },
  placeholder: { type: String, default: 'Town, suburb or address' },
  modelValue: { type: Object, default: null }, // { lat, lon, label }
  allowLocation: { type: Boolean, default: false },
  near: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'update:text'])

const query = ref(props.modelValue?.label || '')
const results = ref([])
const busy = ref(false)
const onlineLoading = ref(false)
const error = ref('')
const searched = ref(false)
const focused = ref(false)

let offlineTimer = null
let onlineTimer = null
let onlineAbort = null
let placeIndex = null
loadPlaceIndex().then((idx) => { placeIndex = idx }).catch(() => {})

const showList = computed(() => (focused.value || searched.value) && (results.value.length > 0 || onlineLoading.value))

watch(() => props.modelValue, (v) => {
  if (v && v.label !== query.value) query.value = v.label
})
watch(query, (v) => emit('update:text', v || ''))

function cancelOnline() {
  clearTimeout(onlineTimer)
  onlineAbort?.abort()
  onlineAbort = null
  onlineLoading.value = false
}

async function offlineSuggestions(text) {
  if (!placeIndex) placeIndex = await loadPlaceIndex().catch(() => null)
  return placeIndex ? placeIndex.search(text, 6) : []
}

function onTyping() {
  // Editing the text invalidates the previously chosen place.
  if (props.modelValue && query.value !== props.modelValue.label) emit('update:modelValue', null)
  searched.value = false
  error.value = ''
  const text = (query.value || '').trim()
  clearTimeout(offlineTimer)
  cancelOnline()
  if (text.length < 2) {
    results.value = []
    return
  }
  // Offline suggestions: instant, no network.
  offlineTimer = setTimeout(async () => {
    const offline = await offlineSuggestions(text)
    if ((query.value || '').trim() === text) results.value = offline
  }, 120)
  // Online suggestions (streets, landmarks) once typing pauses.
  if (text.length >= 3) {
    onlineTimer = setTimeout(async () => {
      onlineAbort = new AbortController()
      const signal = onlineAbort.signal
      onlineLoading.value = true
      try {
        const online = await suggestPlaces(text, { near: props.near || undefined, signal })
        if (!signal.aborted && (query.value || '').trim() === text) {
          results.value = mergeSuggestions(await offlineSuggestions(text), online)
        }
      } catch {
        // Offline suggestions remain; the search button falls back to Nominatim.
      } finally {
        if (!signal.aborted) onlineLoading.value = false
      }
    }, 450)
  }
}

function onBlur() {
  // Let a tap on a suggestion register before the list closes.
  setTimeout(() => { focused.value = false }, 200)
}

/** Full search (Enter / search button): online with Nominatim fallback, plus offline matches. */
async function search() {
  const text = (query.value || '').trim()
  if (text.length < 2) {
    error.value = 'Type at least two letters.'
    return
  }
  cancelOnline()
  busy.value = true
  error.value = ''
  const offline = await offlineSuggestions(text)
  try {
    const online = await searchPlaces(text, { near: props.near || undefined })
    results.value = mergeSuggestions(offline, online.map((p) => ({ ...p, source: 'online' })))
  } catch (e) {
    results.value = offline
    if (!offline.length) error.value = e.message
  } finally {
    searched.value = true
    busy.value = false
  }
}

function choose(place) {
  cancelOnline()
  results.value = []
  searched.value = false
  focused.value = false
  query.value = place.label
  emit('update:modelValue', place)
}

/**
 * Turns typed-but-unconfirmed text into a place (used by "Plan route"): best
 * offline match if it is a real name match, otherwise the first online result.
 * @returns {Promise<object|null>}
 */
async function resolve() {
  if (props.modelValue) return props.modelValue
  const text = (query.value || '').trim()
  if (text.length < 2) return null
  const offline = await offlineSuggestions(text)
  if (offline[0]) {
    choose(offline[0])
    return offline[0]
  }
  try {
    const online = await searchPlaces(text, { near: props.near || undefined })
    if (online[0]) {
      choose(online[0])
      return online[0]
    }
  } catch (e) {
    error.value = e.message
    return null
  }
  error.value = `Couldn't find "${text}". Pick a suggestion or try another name.`
  return null
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

onBeforeUnmount(() => {
  clearTimeout(offlineTimer)
  cancelOnline()
})

defineExpose({ resolve })
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
  max-height: 300px;
  overflow-y: auto;
}
.results ion-icon {
  color: var(--fb-text-muted);
  margin-inline-end: 12px;
}
.loading {
  --min-height: 40px;
  font-size: 0.82rem;
}
.none {
  font-size: 0.85rem;
  margin: 6px 0 0;
}
</style>
