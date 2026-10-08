<template>
  <div class="empty-state">
    <ion-icon v-if="icon" :icon="icon" class="empty-icon" aria-hidden="true" />
    <h2>{{ title }}</h2>
    <p v-if="message">{{ message }}</p>
    <div class="actions"><slot /></div>
  </div>
</template>

<script setup>
import { IonIcon } from '@ionic/vue'

defineProps({
  icon: { type: String, default: null },
  title: { type: String, required: true },
  message: { type: String, default: '' },
})
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 32px 24px;
}
.empty-icon {
  font-size: 56px;
  color: var(--ion-color-primary);
  opacity: 0.85;
}
h2 {
  font-size: 1.15rem;
  margin: 12px 0 4px;
}
p {
  color: var(--fb-text-muted);
  margin: 0 0 16px;
  max-width: 320px;
  line-height: 1.45;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 280px;
}
</style>
