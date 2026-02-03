<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';

import { getJson } from './lib/api';
import type { HealthResponse } from './types';

const route = useRoute();
const health = ref<HealthResponse | null>(null);
const healthError = ref('');

const navigation = [
  { to: '/', label: 'Dashboard' },
  { to: '/backtest', label: 'Backtest' },
  { to: '/factor-regression', label: 'Factor Regression' },
  { to: '/efficient-frontier', label: 'Efficient Frontier' },
  { to: '/optimization', label: 'Optimization' },
  { to: '/saved-portfolios', label: 'Saved Portfolios' },
] as const;

const activePath = computed(() => route.path);

onMounted(async () => {
  try {
    health.value = await getJson<HealthResponse>('/api/health');
  } catch (error) {
    healthError.value = error instanceof Error ? error.message : 'Unable to reach API';
  }
});
</script>

<template>
  <div class="app-shell">
    <header class="hero">
      <div>
        <p class="eyebrow">Honors Project</p>
        <h1>Portfolio Analytics Platform</h1>
        <p class="hero-copy">
          A full-stack workspace for portfolio backtests, factor analysis, optimization, and saved scenarios.
        </p>
      </div>
      <div class="status-card">
        <p class="status-label">API status</p>
        <strong v-if="health">{{ health.status }}</strong>
        <strong v-else-if="healthError">offline</strong>
        <strong v-else>checking...</strong>
        <p class="status-copy">
          {{ health?.service ?? (healthError || 'Health endpoint has not responded yet.') }}
        </p>
        <p v-if="health" class="status-copy">
          Database: {{ health.database.status }} | Checked: {{ new Date(health.checkedAt).toLocaleTimeString() }}
        </p>
      </div>
    </header>

    <nav class="nav-grid">
      <RouterLink
        v-for="item in navigation"
        :key="item.to"
        :to="item.to"
        class="nav-card"
        :class="{ active: activePath === item.to }"
      >
        {{ item.label }}
      </RouterLink>
    </nav>

    <main>
      <RouterView />
    </main>
  </div>
</template>
