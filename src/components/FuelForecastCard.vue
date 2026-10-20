<template>
  <div v-if="forecast.available" class="fb-card forecast" role="group" aria-label="Fuel estimate">
    <div class="head">
      <ion-icon :icon="speedometerOutline" class="icon" aria-hidden="true" />
      <div>
        <strong>{{ headline }}</strong>
        <span class="fb-muted sub">
          About {{ formatLitres(forecast.fuelLeftLitres, 0) }} · {{ formatDistance(forecast.rangeLeftKm) }} left
        </span>
      </div>
    </div>
    <div
      class="gauge"
      role="meter"
      :aria-valuenow="forecast.percentLeft"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="`About ${forecast.percentLeft}% of the tank left`"
    >
      <div class="fill" :class="level" :style="{ width: `${forecast.percentLeft}%` }" />
    </div>
    <p class="note fb-muted">
      Estimated from your {{ formatConsumption(forecast.consumption) }} average<template v-if="forecast.dailyKm">
        and about {{ formatDistance(forecast.dailyKm) }} a day</template>. Full tank ≈ {{ formatDistance(forecast.fullRangeKm) }}.
    </p>
  </div>

  <ion-item
    v-else-if="forecast.reason === 'no-tank'"
    class="fb-card tank-prompt"
    button
    detail
    lines="none"
    :router-link="`/vehicles/${vehicleId}/edit`"
  >
    <ion-icon slot="start" :icon="speedometerOutline" color="medium" aria-hidden="true" />
    <ion-label class="ion-text-wrap">
      See your range and next fill-up
      <p>Add your tank size to the vehicle.</p>
    </ion-label>
  </ion-item>
</template>

<script setup>
import { computed } from 'vue'
import { IonIcon, IonItem, IonLabel } from '@ionic/vue'
import { speedometerOutline } from 'ionicons/icons'
import { formatConsumption, formatDate, formatDistance, formatLitres } from '../services/formatService.js'

const props = defineProps({
  forecast: { type: Object, required: true },
  vehicleId: { type: Number, required: true },
})

const headline = computed(() => {
  const { daysUntilFill, nextFillDate, percentLeft } = props.forecast
  if (daysUntilFill === null) return `About ${percentLeft}% of a tank left`
  if (daysUntilFill === 0) return 'Time to fill up'
  if (daysUntilFill === 1) return 'Fill up tomorrow'
  if (daysUntilFill <= 6) return `Fill up in about ${daysUntilFill} days`
  return `Next fill-up around ${formatDate(nextFillDate)}`
})

const level = computed(() => {
  const p = props.forecast.percentLeft
  return p <= 15 ? 'low' : p <= 35 ? 'mid' : 'ok'
})
</script>

<style scoped>
.forecast {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.head {
  display: flex;
  gap: 12px;
  align-items: center;
}
.head > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.icon {
  font-size: 28px;
  color: var(--ion-color-primary);
  flex-shrink: 0;
}
.sub {
  font-size: 0.85rem;
}
.gauge {
  height: 10px;
  border-radius: 5px;
  background: var(--fb-border);
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 5px;
  transition: width 0.4s ease;
}
.fill.ok {
  background: var(--ion-color-primary);
}
.fill.mid {
  background: var(--ion-color-warning);
}
.fill.low {
  background: var(--ion-color-danger);
}
.note {
  font-size: 0.78rem;
  margin: 0;
  line-height: 1.4;
}
.tank-prompt {
  --background: transparent;
  padding: 0;
}
</style>
