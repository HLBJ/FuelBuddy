<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/dashboard" />
        </ion-buttons>
        <ion-title>Reminders</ion-title>
        <ion-buttons v-if="activeVehicle" slot="end">
          <ion-button router-link="/reminders/new" aria-label="Add reminder">
            <ion-icon slot="icon-only" :icon="add" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="fb-page">
      <EmptyState v-if="!activeVehicle" :icon="carSportOutline" title="No vehicle yet" message="Add a vehicle to set reminders for it.">
        <ion-button expand="block" router-link="/vehicles/new">Add vehicle</ion-button>
      </EmptyState>

      <template v-else>
        <VehicleSwitcher />
        <div v-if="loading" class="ion-text-center ion-padding"><ion-spinner /></div>

        <EmptyState
          v-else-if="!open.length && !done.length"
          :icon="alarmOutline"
          title="No reminders yet"
          :message="`Never miss a licence disc renewal, service or tyre check for ${activeVehicle.name}.`"
        >
          <ion-button expand="block" router-link="/reminders/new">Add reminder</ion-button>
        </EmptyState>

        <template v-else>
          <ion-list v-if="open.length" lines="full" class="group">
            <ion-item v-for="r in open" :key="r.id" button detail="false" :router-link="`/reminders/${r.id}/edit`">
              <ion-icon slot="start" :icon="iconFor(r.type)" :color="colourFor(r.status)" aria-hidden="true" />
              <ion-label class="ion-text-wrap">
                <h2>{{ r.title }}</h2>
                <p>{{ dueText(r) }}</p>
              </ion-label>
              <ion-badge v-if="r.status !== 'upcoming'" slot="end" :color="colourFor(r.status)">
                {{ r.status === 'overdue' ? 'Overdue' : 'Due soon' }}
              </ion-badge>
              <ion-button slot="end" fill="clear" :aria-label="`Mark ${r.title} done`" @click.stop.prevent="complete(r)">
                <ion-icon slot="icon-only" :icon="checkmarkDoneOutline" />
              </ion-button>
            </ion-item>
          </ion-list>

          <template v-if="done.length">
            <div class="fb-section"><h2 class="fb-section-title">Done</h2></div>
            <ion-list lines="full" class="group done">
              <ion-item-sliding v-for="r in done" :key="r.id">
                <ion-item>
                  <ion-icon slot="start" :icon="checkmarkCircle" color="medium" aria-hidden="true" />
                  <ion-label class="ion-text-wrap">
                    <h2>{{ r.title }}</h2>
                    <p>Done {{ formatDate(r.doneAt.slice(0, 10)) }}</p>
                  </ion-label>
                </ion-item>
                <ion-item-options side="end">
                  <ion-item-option color="danger" @click="remove(r)">
                    <ion-icon slot="icon-only" :icon="trashOutline" aria-label="Delete reminder" />
                  </ion-item-option>
                </ion-item-options>
              </ion-item-sliding>
            </ion-list>
          </template>
          <p class="hint fb-muted">Tap a reminder to edit it. Tick it when it's done. Licence disc reminders renew for next year automatically.</p>
        </template>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  IonBackButton, IonBadge, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonItemOption, IonItemOptions,
  IonItemSliding, IonLabel, IonList, IonPage, IonSpinner, IonTitle, IonToolbar,
} from '@ionic/vue'
import {
  add, alarmOutline, buildOutline, carSportOutline, checkmarkCircle, checkmarkDoneOutline, documentTextOutline,
  ellipseOutline, trashOutline,
} from 'ionicons/icons'
import EmptyState from '../components/EmptyState.vue'
import VehicleSwitcher from '../components/VehicleSwitcher.vue'
import { notifyDataChanged, useAppStore } from '../stores/appStore.js'
import { useServices } from '../services/appServices.js'
import { formatDate, formatDistance } from '../services/formatService.js'
import { useFeedback } from '../composables/useFeedback.js'

const { state, activeVehicle } = useAppStore()
const feedback = useFeedback()
const loading = ref(false)
const all = ref([])

const open = computed(() => all.value.filter((r) => !r.doneAt))
const done = computed(() => all.value.filter((r) => r.doneAt).slice(0, 10))

async function load() {
  const v = activeVehicle.value
  if (!v) return
  loading.value = true
  try {
    const services = useServices()
    const [upcoming, everything] = await Promise.all([services.reminders.upcoming(v.id, v.currentOdometer), services.reminders.listByVehicle(v.id)])
    all.value = [...upcoming, ...everything.filter((r) => r.doneAt).sort((a, b) => (a.doneAt < b.doneAt ? 1 : -1))]
  } finally {
    loading.value = false
  }
}

const iconFor = (type) => ({ licence: documentTextOutline, service: buildOutline, tyres: ellipseOutline }[type] || alarmOutline)
const colourFor = (status) => ({ overdue: 'danger', 'due-soon': 'warning' }[status] || 'medium')

function dueText(r) {
  const parts = []
  if (r.dueDate) parts.push(`Due ${formatDate(r.dueDate)}`)
  if (r.dueOdometer !== null) parts.push(`at ${formatDistance(r.dueOdometer)}`)
  return parts.join(' · ')
}

async function complete(r) {
  try {
    const { next } = await useServices().reminders.complete(r.id)
    await notifyDataChanged()
    feedback.success(next ? `Done. Next licence disc reminder set for ${formatDate(next.dueDate)}.` : 'Reminder done')
  } catch (e) {
    feedback.error(e.message)
  }
}

async function remove(r) {
  const ok = await feedback.confirm({ header: 'Delete reminder?', message: r.title, confirmText: 'Delete', destructive: true })
  if (!ok) return
  await useServices().reminders.delete(r.id)
  await notifyDataChanged()
}

watch(() => [state.activeVehicleId, state.revision], load, { immediate: true })
</script>

<style scoped>
.group {
  margin: 0 16px 12px;
  border: 1px solid var(--fb-border);
  border-radius: var(--fb-radius);
  padding: 0;
}
.done {
  opacity: 0.75;
}
.hint {
  font-size: 0.8rem;
  margin: 8px 20px;
}
</style>
