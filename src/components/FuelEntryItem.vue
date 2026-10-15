<template>
  <ion-item button detail="false" :router-link="`/entries/${entry.id}/edit`" class="entry-item">
    <div class="entry">
      <div class="row top">
        <span class="date">{{ formatDate(entry.date) }}</span>
        <span class="cost fb-tabular">{{ formatCurrency(entry.totalCost, currency) }}</span>
      </div>
      <div class="row details fb-tabular">
        <span>{{ formatLitres(entry.litres) }} @ {{ formatPricePerLitre(entry.pricePerLitre, currency) }}</span>
        <span>{{ formatDistance(entry.odometer) }}</span>
      </div>
      <div class="row meta">
        <span class="station">{{ entry.fuelStation || '' }}</span>
        <span class="badges">
          <span v-if="segment" class="consumption fb-tabular">{{ formatConsumption(segment.consumption) }}</span>
          <span class="tank" :class="entry.isFullTank ? 'full' : 'partial'">{{ entry.isFullTank ? 'Full' : 'Partial' }}</span>
        </span>
      </div>
    </div>
  </ion-item>
</template>

<script setup>
import { IonItem } from '@ionic/vue'
import {
  formatConsumption,
  formatCurrency,
  formatDate,
  formatDistance,
  formatLitres,
  formatPricePerLitre,
} from '../services/formatService.js'

defineProps({
  entry: { type: Object, required: true },
  segment: { type: Object, default: null },
  currency: { type: String, default: 'ZAR' },
})
</script>

<style scoped>
.entry-item {
  --padding-start: 16px;
  --inner-padding-end: 16px;
}
.entry {
  width: 100%;
  padding: 10px 0;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.top .date {
  font-weight: 600;
}
.top .cost {
  font-weight: 650;
}
.details,
.meta {
  font-size: 0.82rem;
  color: var(--fb-text-muted);
  margin-top: 3px;
}
.station {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badges {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.tank,
.consumption {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
}
.consumption {
  background: rgba(var(--ion-color-primary-rgb), 0.12);
  color: var(--ion-color-primary);
}
.tank.full {
  background: var(--fb-surface-muted);
  color: var(--ion-text-color);
}
.tank.partial {
  background: rgba(var(--ion-color-secondary-rgb), 0.2);
  color: var(--ion-text-color);
}
</style>
