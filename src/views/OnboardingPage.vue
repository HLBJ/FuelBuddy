<template>
  <ion-page>
    <ion-content class="onboarding" :fullscreen="true">
      <div class="wrap">
        <div class="top">
          <ion-button v-if="step < steps.length - 1" fill="clear" size="small" @click="finish(false)">Skip</ion-button>
        </div>

        <div class="slide" :key="step" role="region" :aria-label="`Step ${step + 1} of ${steps.length}`">
          <div class="icon-circle"><ion-icon :icon="current.icon" aria-hidden="true" /></div>
          <h1>{{ current.title }}</h1>
          <p>{{ current.text }}</p>
        </div>

        <div class="bottom">
          <div class="dots" aria-hidden="true">
            <span v-for="(s, i) in steps" :key="i" :class="{ active: i === step }" />
          </div>
          <ion-button v-if="step < steps.length - 1" expand="block" @click="step += 1">Next</ion-button>
          <template v-else>
            <ion-button expand="block" @click="finish(true)">Add my first vehicle</ion-button>
            <ion-button expand="block" fill="clear" @click="finish(false)">I'll do it later</ion-button>
          </template>
          <ion-button v-if="step > 0" fill="clear" size="small" @click="step -= 1">Back</ion-button>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { IonButton, IonContent, IonIcon, IonPage } from '@ionic/vue'
import { carSportOutline, lockClosedOutline, speedometerOutline } from 'ionicons/icons'
import { updateSetting } from '../stores/appStore.js'

const router = useRouter()
const step = ref(0)

const steps = [
  {
    icon: speedometerOutline,
    title: 'Know what your car really costs',
    text: 'Log each fill-up and FuelBuddy works out your fuel consumption, cost per kilometre and monthly spending — and estimates trip costs.',
  },
  {
    icon: lockClosedOutline,
    title: 'Your data stays on your phone',
    text: 'No account, no cloud, no tracking. Everything is stored locally and works offline. Export to CSV whenever you like.',
  },
  {
    icon: carSportOutline,
    title: 'Get started in seconds',
    text: 'Add your vehicle and current odometer reading, then record your next fill-up. Fill to full for the most accurate figures.',
  },
]
const current = computed(() => steps[step.value])

async function finish(addVehicle) {
  await updateSetting('onboardingComplete', true)
  if (addVehicle) await router.replace('/vehicles/new?from=onboarding')
  else await router.replace('/tabs/dashboard')
}
</script>

<style scoped>
.onboarding {
  --background: var(--ion-background-color);
}
.wrap {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: calc(env(safe-area-inset-top) + 8px) 24px calc(env(safe-area-inset-bottom) + 24px);
  max-width: 480px;
  margin: 0 auto;
}
.top {
  display: flex;
  justify-content: flex-end;
  min-height: 40px;
}
.slide {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  animation: fade 0.25s ease;
}
.icon-circle {
  width: 112px;
  height: 112px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(var(--ion-color-primary-rgb), 0.12);
  margin-bottom: 24px;
}
.icon-circle ion-icon {
  font-size: 56px;
  color: var(--ion-color-primary);
}
h1 {
  font-size: 1.5rem;
  margin: 0 0 12px;
}
p {
  color: var(--fb-text-muted);
  line-height: 1.55;
  margin: 0;
}
.dots {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 20px;
}
.dots span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--fb-border);
  transition: width 0.2s;
}
.dots span.active {
  width: 24px;
  border-radius: 4px;
  background: var(--ion-color-primary);
}
.bottom {
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
@keyframes fade {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .slide { animation: none; }
}
</style>
