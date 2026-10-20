<template>
  <div class="fb-card compare">
    <h3 class="card-title">How you compare</h3>
    <div class="bars" role="img" :aria-label="`You use ${formatConsumption(result.measured)}; the official figure is ${formatConsumption(result.rated)}`">
      <div class="bar-row">
        <span class="who">You</span>
        <div class="track"><div class="fill you" :class="result.verdict" :style="{ width: `${widthOf(result.measured)}%` }" /></div>
        <strong class="fb-tabular">{{ formatNumber(result.measured, 1) }}</strong>
      </div>
      <div class="bar-row">
        <span class="who">Official</span>
        <div class="track"><div class="fill rated" :style="{ width: `${widthOf(result.rated)}%` }" /></div>
        <strong class="fb-tabular">{{ formatNumber(result.rated, 1) }}</strong>
      </div>
    </div>
    <p class="verdict">{{ verdictText }}</p>
    <p class="fb-muted small">
      {{ entry.make }} {{ entry.model }} {{ entry.variant }}: official combined figure{{ result.cycle ? ` (${result.cycle} test)` : '' }}, in L/100 km.
      Official figures come from a lab test; real-world driving is usually {{ result.typicalMin }}–{{ result.typicalMax }}% higher.
    </p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatConsumption, formatNumber } from '../services/formatService.js'

const props = defineProps({
  result: { type: Object, required: true },
  entry: { type: Object, required: true },
})

const widthOf = (v) => Math.round((v / Math.max(props.result.measured, props.result.rated)) * 100)

const verdictText = computed(() => {
  const { diffPercent, verdict } = props.result
  if (verdict === 'better') return `You're doing better than the official figure${diffPercent < 0 ? ` by ${Math.abs(diffPercent)}%` : ''}. Excellent driving!`
  if (verdict === 'good') return `Only ${diffPercent}% above the official figure: better than most drivers manage on real roads.`
  if (verdict === 'typical') return `You use ${diffPercent}% more than the official figure, which is normal for real-world driving.`
  return `You use ${diffPercent}% more than the official figure. Check tyre pressures, roof racks and heavy loads, and try smoother acceleration.`
})
</script>

<style scoped>
.bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0 10px;
}
.bar-row {
  display: grid;
  grid-template-columns: 64px 1fr 44px;
  align-items: center;
  gap: 8px;
  font-size: 0.88rem;
}
.bar-row strong {
  text-align: right;
}
.track {
  height: 12px;
  border-radius: 6px;
  background: var(--fb-border);
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 6px;
}
.fill.rated {
  background: var(--ion-color-medium);
}
.fill.you,
.fill.you.typical,
.fill.you.good,
.fill.you.better {
  background: var(--ion-color-primary);
}
.fill.you.high {
  background: var(--ion-color-warning);
}
.verdict {
  margin: 0 0 6px;
  font-size: 0.92rem;
}
.small {
  font-size: 0.78rem;
  margin: 0;
  line-height: 1.4;
}
</style>
