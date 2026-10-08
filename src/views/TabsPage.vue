<template>
  <ion-page>
    <ion-tabs @ion-tabs-did-change="positionBanner">
      <ion-router-outlet />
      <ion-tab-bar id="fb-tab-bar" ref="tabBar" slot="bottom">
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
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { IonIcon, IonLabel, IonPage, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs, onIonViewDidEnter, onIonViewWillLeave } from '@ionic/vue'
import { listOutline, mapOutline, settingsOutline, speedometerOutline, statsChartOutline } from 'ionicons/icons'
import { Capacitor } from '@capacitor/core'
import { hideBanner, removeBanner, shouldShowAds, showBanner } from '../services/adService.js'
import { useAppStore } from '../stores/appStore.js'

// Banner ads (free tier only) are shown while the tab screens are visible and
// hidden on forms, onboarding and the Pro page.
const { state } = useAppStore()
const tabBar = ref(null)
const active = ref(false)
const adsWanted = computed(() => shouldShowAds({ isPro: state.isPro, isNative: Capacitor.isNativePlatform() }))

function tabBarHeight() {
  const el = tabBar.value?.$el
  if (!el) return 56
  return Math.max(0, window.innerHeight - el.getBoundingClientRect().top)
}

async function positionBanner() {
  if (!active.value || !adsWanted.value) return
  await nextTick()
  showBanner(tabBarHeight())
}

onIonViewDidEnter(() => {
  active.value = true
  positionBanner()
})
onIonViewWillLeave(() => {
  active.value = false
  hideBanner()
})
onUnmounted(() => hideBanner())

watch(adsWanted, (wanted) => {
  if (wanted) positionBanner()
  else removeBanner()
})
</script>
