<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet />
      <ion-tab-bar id="fb-tab-bar" slot="bottom">
        <ion-tab-button tab="dashboard" href="/tabs/dashboard">
          <ion-icon :icon="speedometerOutline" aria-hidden="true" />
          <ion-label>Home</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="history" href="/tabs/history">
          <ion-icon :icon="listOutline" aria-hidden="true" />
          <ion-label>History</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="trip" href="/tabs/trip">
          <ion-icon :icon="mapOutline" aria-hidden="true" />
          <ion-label>Trip</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="statistics" href="/tabs/statistics">
          <ion-icon :icon="statsChartOutline" aria-hidden="true" />
          <ion-label>Stats</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="settings" href="/tabs/settings">
          <ion-icon :icon="settingsOutline" aria-hidden="true" />
          <ion-label>Settings</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { IonIcon, IonLabel, IonPage, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs, onIonViewDidEnter, onIonViewWillLeave } from '@ionic/vue'
import { listOutline, mapOutline, settingsOutline, speedometerOutline, statsChartOutline } from 'ionicons/icons'
import { Capacitor } from '@capacitor/core'
import { hideBanner, removeBanner, shouldShowAds, showBanner } from '../services/adService.js'
import { useAppStore } from '../stores/appStore.js'

// Banner ads (free tier only) are shown while the tab screens are visible, docked
// below the tab bar (see adService), and hidden on forms, onboarding and the Pro page.
const { state } = useAppStore()
const active = ref(false)
const adsWanted = computed(() => shouldShowAds({ isPro: state.isPro, isNative: Capacitor.isNativePlatform() }))

function updateBanner() {
  if (active.value && adsWanted.value) showBanner()
}

onIonViewDidEnter(() => {
  active.value = true
  updateBanner()
})
onIonViewWillLeave(() => {
  active.value = false
  hideBanner()
})
onUnmounted(() => hideBanner())

watch(adsWanted, (wanted) => {
  if (wanted) updateBanner()
  else removeBanner()
})
</script>
