<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import { postJson } from '../lib/api';
import { createUniverseText } from '../lib/portfolio';
import { listSavedPortfolios, resolveSelectedPortfolioId } from '../lib/savedPortfolio';
import type { EfficientFrontierResponse, SavedPortfolio } from '../types';

const route = useRoute();
const portfolios = ref<SavedPortfolio[]>([]);
const selectedPortfolioId = ref('');
const result = ref<EfficientFrontierResponse | null>(null);
const error = ref('');
const loading = ref(false);

const selectedPortfolio = computed(() =>
  portfolios.value.find((portfolio) => portfolio.id === selectedPortfolioId.value) ?? null,
);
const formError = computed(() =>
  selectedPortfolio.value && selectedPortfolio.value.assets.length >= 2
    ? ''
    : 'Select a premade portfolio with at least two holdings.',
);

async function loadPortfolios() {
  try {
    portfolios.value = await listSavedPortfolios();
    selectedPortfolioId.value = resolveSelectedPortfolioId(portfolios.value, route.query, selectedPortfolioId.value);
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to load saved portfolios';
  }
}

async function buildFrontier() {
  const validationMessage = formError.value;

  if (validationMessage || !selectedPortfolio.value) {
    error.value = validationMessage || 'Select a saved portfolio first.';
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    result.value = await postJson<EfficientFrontierResponse>('/api/analysis/efficient-frontier', {
      universe: createUniverseText(selectedPortfolio.value),
    });
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to build frontier';
  } finally {
    loading.value = false;
  }
}

watch(() => route.query.portfolioId, () => {
  selectedPortfolioId.value = resolveSelectedPortfolioId(portfolios.value, route.query, selectedPortfolioId.value);
}, { immediate: true });

void loadPortfolios();
</script>

<template>
  <section class="page">
    <div class="page-header">
      <div>
        <h2>Efficient frontier</h2>
        <p class="muted">Use a premade portfolio as the asset universe for the frontier analysis.</p>
      </div>
    </div>

    <div class="grid-2">
      <form class="panel" @submit.prevent="buildFrontier">
        <label>
          Premade portfolio
          <select v-model="selectedPortfolioId">
            <option v-for="portfolio in portfolios" :key="portfolio.id" :value="portfolio.id">
              {{ portfolio.name }}
            </option>
          </select>
        </label>
        <div v-if="selectedPortfolio" class="mode-summary">
          <p class="list-label">Portfolio universe</p>
          <p>{{ selectedPortfolio.assets.length }} holdings | Benchmark ticker: {{ selectedPortfolio.benchmark }}</p>
          <div>
            <span v-for="asset in selectedPortfolio.assets" :key="asset.symbol" class="asset-pill">
              {{ asset.symbol }} {{ asset.weight.toFixed(0) }}%
            </span>
          </div>
        </div>
        <div class="button-row">
          <button class="primary-button" type="submit">{{ loading ? 'Generating...' : 'Generate frontier' }}</button>
        </div>
        <p v-if="formError && !error" class="muted">{{ formError }}</p>
        <p v-if="!portfolios.length" class="muted">
          No premade portfolios yet.
          <RouterLink class="secondary-link inline-link" to="/saved-portfolios">Build one on the saved portfolios page</RouterLink>
        </p>
      </form>

      <div class="panel">
        <h3>Frontier preview</h3>
        <p v-if="error" class="error">{{ error }}</p>
        <template v-else-if="result">
          <p class="muted">Universe size: {{ result.universeCount }}</p>
          <ul class="list">
            <li v-for="asset in result.universe" :key="asset.symbol">
              <strong>{{ asset.symbol }}</strong>: return {{ (asset.expectedReturn * 100).toFixed(2) }}%, volatility {{ (asset.volatility * 100).toFixed(2) }}%
            </li>
          </ul>
          <ul class="list">
            <li v-for="point in result.frontier" :key="`${point.risk}-${point.return}`">
              Risk {{ point.risk.toFixed(2) }} / Return {{ point.return.toFixed(2) }}
            </li>
          </ul>
          <div>
            <p class="list-label">Model portfolio</p>
            <span v-for="asset in result.modelPortfolio" :key="asset.symbol" class="asset-pill">
              {{ asset.symbol }} {{ asset.weight.toFixed(0) }}%
            </span>
          </div>
          <ul class="list muted">
            <li v-for="assumption in result.assumptions" :key="assumption">{{ assumption }}</li>
          </ul>
        </template>
        <p v-else class="muted">The backend sends frontier points that can later feed a charting library.</p>
      </div>
    </div>
  </section>
</template>
