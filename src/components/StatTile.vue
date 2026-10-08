<template>
  <div class="stat-tile" :class="{ unavailable: !available }">
    <div class="label">{{ label }}</div>
    <div class="value fb-tabular">{{ available ? value : 'Not enough data' }}</div>
    <div v-if="hint" class="hint">{{ hint }}</div>
  </div>
</template>

<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: String, default: '' },
  hint: { type: String, default: '' },
  available: { type: Boolean, default: true },
})
</script>

<style scoped>
.stat-tile {
  background: var(--fb-surface);
  border: 1px solid var(--fb-border);
  border-radius: var(--fb-radius);
  padding: 14px;
  min-height: 92px;
}
.label {
  font-size: 0.78rem;
  color: var(--fb-text-muted);
  margin-bottom: 6px;
}
.value {
  font-size: 1.2rem;
  font-weight: 650;
  line-height: 1.25;
  word-break: break-word;
}
.unavailable .value {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--fb-text-muted);
}
.hint {
  font-size: 0.72rem;
  color: var(--fb-text-muted);
  margin-top: 4px;
}
</style>
