<template>
  <div class="suggest">
    <ion-input
      :value="modelValue"
      :label="label"
      label-placement="stacked"
      :placeholder="placeholder"
      autocapitalize="words"
      autocomplete="off"
      :autocorrect="false"
      :maxlength="maxlength"
      :class="inputClass"
      :error-text="errorText"
      enterkeyhint="next"
      @ion-input="(e) => emit('update:modelValue', e.detail.value ?? '')"
      @ion-focus="focused = true"
      @ion-blur="onBlur"
    />
    <ion-list v-if="showList" class="list" lines="full" role="listbox" :aria-label="`${label} suggestions`">
      <!-- mousedown.prevent keeps focus in the input so the tap lands before the list closes -->
      <ion-item v-for="s in matches" :key="s" button detail="false" role="option" @mousedown.prevent @click="choose(s)">
        <ion-label>{{ s }}</ion-label>
      </ion-item>
    </ion-list>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { IonInput, IonItem, IonLabel, IonList } from '@ionic/vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  suggestions: { type: Array, default: () => [] },
  label: { type: String, required: true },
  placeholder: { type: String, default: '' },
  maxlength: { type: Number, default: 50 },
  inputClass: { type: [Object, String], default: '' },
  errorText: { type: String, default: undefined },
  limit: { type: Number, default: 6 },
})
const emit = defineEmits(['update:modelValue', 'chosen'])
const focused = ref(false)

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '')

/** Starts-with matches first, then contains. All suggestions when the box is empty. */
const matches = computed(() => {
  const q = norm(props.modelValue)
  if (!q) return props.suggestions.slice(0, props.limit)
  const starts = props.suggestions.filter((s) => norm(s).startsWith(q))
  const contains = props.suggestions.filter((s) => !norm(s).startsWith(q) && norm(s).includes(q))
  return [...starts, ...contains].slice(0, props.limit)
})

const showList = computed(
  () => focused.value && matches.value.length > 0 && !(matches.value.length === 1 && norm(matches.value[0]) === norm(props.modelValue)),
)

function choose(value) {
  emit('update:modelValue', value)
  emit('chosen', value)
  focused.value = false
}

function onBlur() {
  // Let a tap on a suggestion register first.
  setTimeout(() => { focused.value = false }, 150)
}
</script>

<style scoped>
.suggest {
  width: 100%;
}
.list {
  margin: 4px 0 8px;
  border: 1px solid var(--fb-border);
  border-radius: 10px;
  padding: 0;
  max-height: 260px;
  overflow-y: auto;
}
.list ion-item {
  --min-height: 44px;
}
</style>
