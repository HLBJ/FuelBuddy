<template>
  <ion-app>
    <div v-if="state.status === 'error'" class="startup-error" role="alert">
      <ion-icon :icon="warningOutline" aria-hidden="true" />
      <h1>FuelBuddy couldn't start</h1>
      <p>{{ errorMessage }}</p>
      <ion-button @click="retry">Try again</ion-button>
    </div>
    <ion-router-outlet v-else />
  </ion-app>
</template>

<script setup>
import { computed } from 'vue'
import { IonApp, IonButton, IonIcon, IonRouterOutlet, useBackButton, useIonRouter } from '@ionic/vue'
import { warningOutline } from 'ionicons/icons'
import { Capacitor } from '@capacitor/core'
import { startApp, useAppStore } from './stores/appStore.js'

const { state } = useAppStore()
const ionRouter = useIonRouter()

// With @capacitor/app installed, Android hands the back button to the app. Overlays
// and page history are handled by Ionic at higher priorities; this lowest-priority
// handler runs only when there is nowhere left to go back to, and sends the app to
// the background like any Android app at its root screen (state is kept).
useBackButton(-1, async () => {
  if (ionRouter.canGoBack()) return
  if (!Capacitor.isNativePlatform()) return
  const { App } = await import('@capacitor/app')
  await App.minimizeApp()
})
const errorMessage = computed(() => state.error?.message || 'An unexpected error occurred.')

async function retry() {
  await startApp()
  if (state.status === 'ready') window.location.reload()
}
</script>

<style scoped>
.startup-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 32px;
  text-align: center;
  background: var(--ion-background-color);
  color: var(--ion-text-color);
}
.startup-error ion-icon {
  font-size: 56px;
  color: var(--ion-color-danger);
}
.startup-error p {
  color: var(--fb-text-muted);
}
</style>
