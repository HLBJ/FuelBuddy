<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/settings" />
        </ion-buttons>
        <ion-title>FuelBuddy Pro</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="hero">
        <ion-icon :icon="state.isPro ? checkmarkCircle : star" class="hero-icon" :class="{ owned: state.isPro }" aria-hidden="true" />
        <h1>{{ state.isPro ? 'Pro is unlocked' : 'Go Pro' }}</h1>
        <p class="fb-muted">
          {{ state.isPro ? 'Thank you for supporting FuelBuddy.' : 'A one-time purchase. No subscription.' }}
        </p>
      </div>

      <ion-list lines="none" class="features">
        <ion-item>
          <ion-icon slot="start" :icon="eyeOffOutline" color="primary" aria-hidden="true" />
          <ion-label class="ion-text-wrap">
            <h2>No ads</h2>
            <p>Remove all advertising, everywhere in the app.</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="statsChartOutline" color="primary" aria-hidden="true" />
          <ion-label class="ion-text-wrap">
            <h2>Advanced statistics</h2>
            <p>12-month spending chart, consumption trends, monthly breakdown, best and worst consumption, and vehicle comparison.</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <p class="free-note fb-muted">
        Fuel tracking, unlimited vehicles, history, the trip calculator, basic statistics and CSV export are always free.
      </p>

      <template v-if="!state.isPro">
        <ion-button expand="block" size="large" :disabled="busy || !available" @click="buy">
          <ion-spinner v-if="busy === 'buy'" slot="start" name="crescent" />
          Unlock Pro · {{ price }}
        </ion-button>
        <p v-if="unavailableReason" class="unavailable" role="status">{{ unavailableReason }}</p>
      </template>

      <ion-button expand="block" fill="clear" :disabled="Boolean(busy) || !available" @click="restore">
        <ion-spinner v-if="busy === 'restore'" slot="start" name="crescent" />
        Restore purchase
      </ion-button>

      <p class="legal fb-muted">
        Payment is handled by Google Play. FuelBuddy never sees your payment details. The price shown is
        {{ productLoaded ? 'from Google Play' : 'indicative; Google Play shows the final price' }}.
      </p>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPage, IonSpinner,
  IonTitle, IonToolbar,
} from '@ionic/vue'
import { checkmarkCircle, eyeOffOutline, star, statsChartOutline } from 'ionicons/icons'
import { setPro, useAppStore } from '../stores/appStore.js'
import { useServices } from '../services/appServices.js'
import { displayPrice, ENTITLEMENT } from '../services/monetizationService.js'
import { formatCurrency } from '../services/formatService.js'
import { useFeedback } from '../composables/useFeedback.js'

const { state } = useAppStore()
const feedback = useFeedback()
const busy = ref(null)
const product = ref(null)

const monetization = useServices().monetization
const unavailableReason = monetization.unavailableReason()
const available = !unavailableReason
const productLoaded = computed(() => Boolean(product.value?.priceString))
const price = computed(() => displayPrice(product.value, undefined, (amount, currency) => formatCurrency(amount, currency, { decimals: 0 })))

onMounted(async () => {
  product.value = await monetization.getProduct()
})

function describeError(error) {
  const message = error?.message || ''
  if (/cancel/i.test(message)) return null
  return `Purchase could not be completed: ${message || 'unknown error'}`
}

async function buy() {
  busy.value = 'buy'
  try {
    const { isPro, status } = await monetization.purchasePro()
    setPro(isPro)
    if (isPro) feedback.success('Pro unlocked. Thank you!')
    else if (status === ENTITLEMENT.PENDING)
      feedback.toast('Your payment is pending. Pro unlocks as soon as Google Play confirms it.')
  } catch (error) {
    const message = describeError(error)
    if (message) feedback.error(message)
  } finally {
    busy.value = null
  }
}

async function restore() {
  busy.value = 'restore'
  try {
    const { isPro, status } = await monetization.restorePurchases()
    setPro(isPro)
    if (isPro) feedback.success('Pro restored')
    else if (status === ENTITLEMENT.PENDING) feedback.toast('A purchase is still pending with Google Play.')
    else feedback.toast('No Pro purchase found for this Google account.')
  } catch (error) {
    feedback.error(`Restore failed: ${error.message}`)
  } finally {
    busy.value = null
  }
}
</script>

<style scoped>
.hero {
  text-align: center;
  padding: 12px 0 4px;
}
.hero-icon {
  font-size: 64px;
  color: var(--ion-color-secondary);
}
.hero-icon.owned {
  color: var(--ion-color-success);
}
.hero h1 {
  margin: 8px 0 4px;
  font-size: 1.5rem;
}
.features {
  background: transparent;
  margin: 16px 0 8px;
}
.features ion-item {
  --background: var(--fb-surface);
  border: 1px solid var(--fb-border);
  border-radius: var(--fb-radius);
  margin-bottom: 10px;
}
.free-note {
  font-size: 0.85rem;
  line-height: 1.45;
  margin: 8px 4px 20px;
}
.unavailable {
  font-size: 0.85rem;
  text-align: center;
  color: var(--fb-text-muted);
}
.legal {
  font-size: 0.75rem;
  text-align: center;
  margin-top: 16px;
}
</style>
