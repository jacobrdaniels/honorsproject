<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { listSavedPortfolios } from '../lib/savedPortfolio';
import type { SavedPortfolio } from '../types';

const analysisTools = [
  {
    label: 'Backtest',
    meta: 'Compare returns, drawdowns, yearly performance, and holdings.',
    to: '/backtest',
  },
  {
    label: 'Factor regression',
    meta: 'Estimate alpha, beta, factor exposure, and fit quality.',
    to: '/factor-regression',
  },
  {
    label: 'Portfolio optimization',
    meta: 'Solve long-only weights from the tickers in a portfolio.',
    to: '/optimization',
  },
];

const portfolios = ref<SavedPortfolio[]>([]);
const loading = ref(true);
const error = ref('');

const visiblePortfolios = computed(() => portfolios.value.slice(0, 4));
const hasPortfolios = computed(() => portfolios.value.length > 0);

async function loadPortfolios() {
  loading.value = true;
  error.value = '';

  try {
    portfolios.value = await listSavedPortfolios();
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to load portfolios';
  } finally {
    loading.value = false;
  }
}

onMounted(loadPortfolios);
</script>

<template>
  <section class="page">
    <section class="dashboard-tools">
      <div>
        <p class="list-label">Analysis tools</p>
        <h2>Run analysis</h2>
      </div>
      <div class="tool-grid">
        <RouterLink v-for="tool in analysisTools" :key="tool.label" :to="tool.to" class="tool-link">
          <h3>{{ tool.label }}</h3>
          <p class="muted">{{ tool.meta }}</p>
        </RouterLink>
      </div>
    </section>

    <section v-if="loading || error || hasPortfolios" class="panel dashboard-library-panel">
      <div class="dashboard-section-header">
        <div>
          <p class="list-label">Portfolio shortcuts</p>
          <h3>Portfolios</h3>
        </div>
        <div class="button-row">
          <button class="secondary-button" type="button" @click="loadPortfolios">Refresh</button>
          <RouterLink class="secondary-link" to="/saved-portfolios">
            Manage portfolios
          </RouterLink>
        </div>
      </div>

      <p v-if="loading" class="muted">Loading portfolios...</p>
      <p v-else-if="error" class="error">{{ error }}</p>
      <div v-else-if="visiblePortfolios.length" class="dashboard-portfolio-list">
        <div v-for="portfolio in visiblePortfolios" :key="portfolio.id" class="dashboard-portfolio-row">
          <div>
            <h3>{{ portfolio.name }}</h3>
            <p class="muted">
              {{ portfolio.assets.length }} holdings | Benchmark ticker {{ portfolio.benchmark }}
            </p>
          </div>
          <div class="button-row">
            <RouterLink class="secondary-link" :to="{ path: '/backtest', query: { portfolioId: portfolio.id } }">
              Backtest
            </RouterLink>
            <RouterLink class="secondary-link" :to="{ path: '/factor-regression', query: { portfolioId: portfolio.id } }">
              Factor regression
            </RouterLink>
            <RouterLink class="secondary-link" :to="{ path: '/optimization', query: { portfolioId: portfolio.id } }">
              Portfolio optimization
            </RouterLink>
          </div>
        </div>
      </div>
    </section>
  </section>
</template>
