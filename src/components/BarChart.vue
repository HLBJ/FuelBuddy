<template>
  <figure class="chart" :aria-label="ariaLabel">
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" preserveAspectRatio="none">
      <line v-for="g in gridLines" :key="g.y" :x1="PAD_L" :x2="W" :y1="g.y" :y2="g.y" class="grid" />
      <rect
        v-for="(bar, i) in bars"
        :key="i"
        :x="bar.x"
        :y="bar.y"
        :width="bar.width"
        :height="bar.height"
        rx="3"
        class="bar"
        :class="{ active: i === selected }"
        @click="selected = i"
      />
    </svg>
    <div class="labels">
      <span v-for="(item, i) in data" :key="i" :class="{ active: i === selected }" @click="selected = i">{{ item.label }}</span>
    </div>
    <figcaption v-if="selectedItem" class="readout fb-tabular">
      <strong>{{ selectedItem.fullLabel || selectedItem.label }}:</strong> {{ format(selectedItem.value) }}
    </figcaption>
  </figure>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  data: { type: Array, required: true }, // [{ label, fullLabel?, value }]
  format: { type: Function, default: (v) => String(v) },
  ariaLabel: { type: String, default: 'Bar chart' },
})

const W = 320
const H = 140
const PAD_L = 0
const PAD_T = 8
const selected = ref(null)

watch(
  () => props.data,
  (d) => { selected.value = d.length ? d.length - 1 : null },
  { immediate: true },
)

const max = computed(() => Math.max(0, ...props.data.map((d) => d.value || 0)))
const selectedItem = computed(() => (selected.value === null ? null : props.data[selected.value]))

const bars = computed(() => {
  const n = props.data.length || 1
  const slot = (W - PAD_L) / n
  const width = Math.max(4, slot * 0.62)
  return props.data.map((d, i) => {
    const h = max.value > 0 ? ((d.value || 0) / max.value) * (H - PAD_T) : 0
    return { x: PAD_L + i * slot + (slot - width) / 2, y: H - h, width, height: Math.max(h, d.value > 0 ? 2 : 0) }
  })
})

const gridLines = computed(() => [0.25, 0.5, 0.75].map((f) => ({ y: PAD_T + (H - PAD_T) * f })))
</script>

<style scoped>
.chart {
  margin: 0;
}
svg {
  width: 100%;
  height: 140px;
  display: block;
}
.grid {
  stroke: var(--fb-chart-grid);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.bar {
  fill: var(--fb-chart-bar);
  opacity: 0.55;
  cursor: pointer;
}
.bar.active {
  opacity: 1;
}
.labels {
  display: flex;
  justify-content: space-around;
  font-size: 0.65rem;
  color: var(--fb-text-muted);
  margin-top: 4px;
}
.labels span {
  flex: 1;
  text-align: center;
}
.labels .active {
  color: var(--ion-text-color);
  font-weight: 600;
}
.readout {
  margin-top: 8px;
  font-size: 0.85rem;
}
</style>
