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
  { to: '/factor-regression', label: 'Factor regression' },
  { to: '/optimization', label: 'Portfolio optimization' },
  { to: '/saved-portfolios', label: 'Portfolios' },
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
      <div class="brand-block">
        <div class="brand-mark">PA</div>
        <div>
          <p class="eyebrow">Portfolio Analytics</p>
          <h1>Workspace</h1>
        </div>
      </div>
      <div class="status-card">
        <div class="status-heading">
          <p class="status-label">API status</p>
          <strong
            class="status-pill"
            :class="{ 'status-pill-ok': health, 'status-pill-error': healthError }"
          >
            <template v-if="health">{{ health.status }}</template>
            <template v-else-if="healthError">offline</template>
            <template v-else>checking...</template>
          </strong>
        </div>
        <p class="status-copy">
          {{ health?.service ?? (healthError || 'Health endpoint has not responded yet.') }}
        </p>
        <p v-if="health" class="status-copy">
          Database: {{ health.database.status }} | Checked {{ new Date(health.checkedAt).toLocaleTimeString() }}
        </p>
      </div>
    </header>

    <nav class="nav-grid" aria-label="Primary navigation">
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

    <main class="workspace">
      <RouterView />
    </main>
  </div>
</template>
