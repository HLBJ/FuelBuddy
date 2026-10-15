<template>
  <div class="fb-card price-change" :class="up ? 'up' : 'down'" role="status">
    <ion-icon :icon="up ? trendingUpOutline : trendingDownOutline" class="icon" aria-hidden="true" />
    <div class="text">
      <strong>{{ headline }}</strong>
      <span class="fb-muted">{{ advice }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { IonIcon } from '@ionic/vue'
import { trendingDownOutline, trendingUpOutline } from 'ionicons/icons'
import { FUEL_GRADES, formatPriceChange } from '../services/fuelPriceService.js'
import { formatCurrency } from '../services/formatService.js'

const props = defineProps({
  change: { type: Object, required: true },
  tankCapacity: { type: Number, default: null },
  currency: { type: String, default: 'ZAR' },
})

const up = computed(() => props.change.change > 0)

const when = computed(() =>
  new Date(`${props.change.effective}T12:00:00`).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'short' }),
)

const headline = computed(() => {
  const grade = FUEL_GRADES[props.change.grade]
  const name = grade.regulated ? `${grade.short} petrol` : grade.label
  const amount = formatPriceChange(props.change.change)
  return `${name} ${up.value ? 'goes up' : 'drops'} ${amount}/L on ${when.value}`
})

const advice = computed(() => {
  const tankEffect = props.tankCapacity > 0 ? Math.abs(props.change.change) * props.tankCapacity : null
  const money = tankEffect ? formatCurrency(Math.round(tankEffect), props.currency, { decimals: 0 }) : null
  if (up.value) return money ? `Fill up before then and save about ${money} on a full tank.` : 'Fill up before then to beat the increase.'
  return money ? `If you can wait, a full tank will cost about ${money} less.` : 'If you can, wait until then to fill up.'
})
</script>

<style scoped>
.price-change {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.price-change.up {
  border-color: rgba(var(--ion-color-danger-rgb), 0.5);
  background: rgba(var(--ion-color-danger-rgb), 0.07);
}
.price-change.down {
  border-color: rgba(var(--ion-color-success-rgb), 0.5);
  background: rgba(var(--ion-color-success-rgb), 0.07);
}
.icon {
  font-size: 28px;
  flex-shrink: 0;
}
.up .icon {
  color: var(--ion-color-danger);
}
.down .icon {
  color: var(--ion-color-success);
}
.text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.88rem;
}
</style>
