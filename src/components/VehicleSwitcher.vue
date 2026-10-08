<template>
  <div class="vehicle-switcher">
    <ion-select
      v-if="state.vehicles.length > 1"
      :value="state.activeVehicleId"
      label="Vehicle"
      label-placement="stacked"
      interface="action-sheet"
      :interface-options="{ header: 'Switch vehicle' }"
      @ion-change="onChange"
    >
      <ion-select-option v-for="v in state.vehicles" :key="v.id" :value="v.id">
        {{ v.name }}{{ v.isDefault ? ' (default)' : '' }}
      </ion-select-option>
    </ion-select>
    <div v-else-if="activeVehicle" class="single">
      <span class="caption">Vehicle</span>
      <span class="name">{{ activeVehicle.name }}</span>
    </div>
    <div v-if="activeVehicle && subtitle" class="subtitle">{{ subtitle }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { IonSelect, IonSelectOption } from '@ionic/vue'
import { setActiveVehicle, useAppStore } from '../stores/appStore.js'
import { formatDistance } from '../services/formatService.js'

const { state, activeVehicle } = useAppStore()

const subtitle = computed(() => {
  const v = activeVehicle.value
  if (!v) return ''
  return [[v.make, v.model].filter(Boolean).join(' '), v.registration, formatDistance(v.currentOdometer)]
    .filter(Boolean)
    .join(' · ')
})

function onChange(event) {
  setActiveVehicle(Number(event.detail.value))
}
</script>

<style scoped>
.vehicle-switcher {
  background: var(--fb-surface);
  border: 1px solid var(--fb-border);
  border-radius: var(--fb-radius);
  margin: 12px 16px;
  padding: 6px 16px 12px;
}
ion-select {
  font-size: 1.15rem;
  font-weight: 600;
}
.single {
  display: flex;
  flex-direction: column;
  padding-top: 8px;
}
.caption {
  font-size: 0.75rem;
  color: var(--fb-text-muted);
}
.name {
  font-size: 1.15rem;
  font-weight: 600;
}
.subtitle {
  font-size: 0.8rem;
  color: var(--fb-text-muted);
}
</style>
