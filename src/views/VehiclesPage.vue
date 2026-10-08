<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/dashboard" />
        </ion-buttons>
        <ion-title>Vehicles</ion-title>
        <ion-buttons slot="end">
          <ion-button router-link="/vehicles/new" aria-label="Add vehicle">
            <ion-icon slot="icon-only" :icon="add" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <EmptyState
        v-if="!state.vehicles.length"
        :icon="carSportOutline"
        title="No vehicles yet"
        message="Add the vehicles you want to track. Each keeps its own fill-up history."
      >
        <ion-button expand="block" router-link="/vehicles/new">Add vehicle</ion-button>
      </EmptyState>

      <template v-else>
        <ion-list lines="full" class="vehicles">
          <ion-item v-for="v in state.vehicles" :key="v.id">
            <ion-icon
              slot="start"
              :icon="v.id === state.activeVehicleId ? radioButtonOn : radioButtonOff"
              :color="v.id === state.activeVehicleId ? 'primary' : 'medium'"
              aria-hidden="true"
            />
            <ion-label class="ion-text-wrap" @click="select(v)">
              <h2>
                {{ v.name }}
                <ion-badge v-if="v.isDefault" color="primary" class="default-badge">Default</ion-badge>
              </h2>
              <p>{{ describe(v) }}</p>
            </ion-label>
            <ion-button slot="end" fill="clear" :aria-label="`Options for ${v.name}`" @click="openActions(v)">
              <ion-icon slot="icon-only" :icon="ellipsisVertical" />
            </ion-button>
          </ion-item>
        </ion-list>
        <p class="hint fb-muted">
          Tap a vehicle to view it. The default vehicle is shown when FuelBuddy opens.
        </p>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { useRouter } from 'vue-router'
import {
  actionSheetController, IonBackButton, IonBadge, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem,
  IonLabel, IonList, IonPage, IonTitle, IonToolbar,
} from '@ionic/vue'
import { add, carSportOutline, ellipsisVertical, radioButtonOff, radioButtonOn } from 'ionicons/icons'
import EmptyState from '../components/EmptyState.vue'
import { notifyDataChanged, setActiveVehicle, useAppStore } from '../stores/appStore.js'
import { useServices } from '../services/appServices.js'
import { FUEL_TYPES } from '../services/validation.js'
import { formatDistance } from '../services/formatService.js'
import { useFeedback } from '../composables/useFeedback.js'

const router = useRouter()
const feedback = useFeedback()
const { state } = useAppStore()

function describe(v) {
  const fuel = FUEL_TYPES.find((t) => t.value === v.fuelType)?.label
  return [[v.year, v.make, v.model].filter(Boolean).join(' '), v.registration, fuel, formatDistance(v.currentOdometer)]
    .filter(Boolean)
    .join(' · ')
}

function select(v) {
  setActiveVehicle(v.id)
  router.push('/tabs/dashboard')
}

async function openActions(v) {
  const sheet = await actionSheetController.create({
    header: v.name,
    buttons: [
      { text: 'Edit', data: 'edit' },
      ...(v.isDefault ? [] : [{ text: 'Set as default', data: 'default' }]),
      { text: 'Delete', role: 'destructive', data: 'delete' },
      { text: 'Cancel', role: 'cancel' },
    ],
  })
  await sheet.present()
  const { data } = await sheet.onDidDismiss()
  if (data === 'edit') router.push(`/vehicles/${v.id}/edit`)
  if (data === 'default') await makeDefault(v)
  if (data === 'delete') await remove(v)
}

async function makeDefault(v) {
  try {
    await useServices().vehicles.setDefault(v.id)
    await notifyDataChanged()
    feedback.success(`${v.name} is now the default vehicle`)
  } catch (error) {
    feedback.error(error.message)
  }
}

async function remove(v) {
  try {
    const { fillUps } = await useServices().vehicles.deletionImpact(v.id)
    const ok = await feedback.confirm({
      header: `Delete ${v.name}?`,
      message:
        fillUps > 0
          ? `This also permanently deletes ${fillUps} fill-up${fillUps === 1 ? '' : 's'} recorded for this vehicle.`
          : 'This vehicle has no fill-ups recorded.',
      confirmText: 'Delete',
      destructive: true,
    })
    if (!ok) return
    await useServices().vehicles.delete(v.id)
    await notifyDataChanged()
    feedback.success('Vehicle deleted')
  } catch (error) {
    feedback.error(error.message)
  }
}
</script>

<style scoped>
.vehicles {
  margin: 12px 16px;
  border: 1px solid var(--fb-border);
  border-radius: var(--fb-radius);
  padding: 0;
}
.default-badge {
  margin-left: 6px;
  vertical-align: middle;
  font-size: 0.65rem;
}
.hint {
  font-size: 0.8rem;
  margin: 8px 20px;
}
</style>
