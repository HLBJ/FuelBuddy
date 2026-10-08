<template>
  <figure class="chart" :aria-label="ariaLabel">
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" preserveAspectRatio="none">
      <line v-for="g in gridLines" :key="g" x1="0" :x2="W" :y1="g" :y2="g" class="grid" />
      <polyline v-if="points.length > 1" :points="polyline" class="line" />
    </svg>
    <div class="dots">
      <button
        v-for="(p, i) in points"
        :key="i"
        type="button"
        class="dot"
        :class="{ active: i === selected }"
        :style="{ left: `${(p.x / W) * 100}%`, top: `${p.y}px` }"
        :aria-label="`${data[i].fullLabel || data[i].label}: ${format(data[i].value)}`"
        @click="selected = i"
      />
    </div>
    <div class="axis fb-muted">
      <span>{{ data[0]?.label }}</span>
      <span>{{ data[data.length - 1]?.label }}</span>
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
  ariaLabel: { type: String, default: 'Line chart' },
})

const W = 320
const H = 140
const PAD = 10
const selected = ref(null)

watch(() => props.data, (d) => { selected.value = d.length ? d.length - 1 : null }, { immediate: true })

const selectedItem = computed(() => (selected.value === null ? null : props.data[selected.value]))

const points = computed(() => {
  const values = props.data.map((d) => d.value)
  if (!values.length) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const n = values.length
  return values.map((v, i) => ({
    x: n === 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (n - 1),
    y: max === min ? H / 2 : PAD + ((max - v) / span) * (H - PAD * 2),
  }))
})

const polyline = computed(() => points.value.map((p) => `${p.x},${p.y}`).join(' '))
const gridLines = [H * 0.25, H * 0.5, H * 0.75]
</script>

<style scoped>
.chart {
  margin: 0;
  position: relative;
}
svg {
  width: 100%;
  height: 140px;
  display: block;
}
.dots {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 140px;
}
.grid {
  stroke: var(--fb-chart-grid);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.line {
  fill: none;
  stroke: var(--fb-chart-bar);
  stroke-width: 2.5;
  vector-effect: non-scaling-stroke;
  stroke-linejoin: round;
}
.dot {
  position: absolute;
  width: 12px;
  height: 12px;
  margin: -6px 0 0 -6px;
  padding: 0;
  border-radius: 50%;
  background: var(--fb-surface);
  border: 2px solid var(--fb-chart-bar);
  cursor: pointer;
}
.dot.active {
  background: var(--fb-chart-bar);
}
.axis {
  display: flex;
  justify-content: space-between;
  font-size: 0.65rem;
  margin-top: 4px;
}
.readout {
  margin-top: 8px;
  font-size: 0.85rem;
}
</style>
