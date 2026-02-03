<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { postJson } from '../lib/api';
import { createUniverseText, parseUniverseText } from '../lib/portfolio';
import { getPortfolioIdFromQuery, getSavedPortfolio } from '../lib/savedPortfolio';
import type { EfficientFrontierResponse } from '../types';

const route = useRoute();
const universe = ref('VTI:0.08:0.16, VXUS:0.07:0.18, BND:0.04:0.06');
const selectedPortfolioName = ref('');
const result = ref<EfficientFrontierResponse | null>(null);
const error = ref('');
const loading = ref(false);

const parsedUniverse = computed(() => parseUniverseText(universe.value));
const formError = computed(() =>
  parsedUniverse.value.length < 2 ? 'Enter at least two assets in the format TICKER:RETURN:VOL.' : ''
);

async function syncSavedPortfolio() {
  const portfolioId = getPortfolioIdFromQuery(route.query);

  if (!portfolioId) {
    selectedPortfolioName.value = '';
    return;
  }

  try {
    const portfolio = await getSavedPortfolio(`/api/portfolios/${portfolioId}`);
    selectedPortfolioName.value = portfolio.name;
    universe.value = createUniverseText(portfolio);
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to load saved portfolio';
  }
}

async function buildFrontier() {
  const validationMessage = formError.value;

  if (validationMessage) {
    error.value = validationMessage;
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    result.value = await postJson<EfficientFrontierResponse>('/api/analysis/efficient-frontier', {
      universe: universe.value,
    });
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to build frontier';
  } finally {
    loading.value = false;
  }
}

watch(() => route.query.portfolioId, () => {
  void syncSavedPortfolio();
}, { immediate: true });
</script>

<template>
  <section class="page">
    <div class="page-header">
      <div>
        <h2>Efficient frontier</h2>
        <p class="muted">Use this page to frame the eventual frontier chart and model portfolio recommendations.</p>
        <p v-if="selectedPortfolioName" class="success">Loaded universe from saved portfolio: {{ selectedPortfolioName }}</p>
      </div>
    </div>

    <div class="grid-2">
      <form class="panel" @submit.prevent="buildFrontier">
        <label>
          Asset universe
          <textarea v-model="universe" />
        </label>
        <p class="muted">Parsed assets: {{ parsedUniverse.length }}</p>
        <div class="button-row">
          <button class="primary-button" type="submit">{{ loading ? 'Generating...' : 'Generate frontier' }}</button>
        </div>
        <p v-if="formError && !error" class="muted">{{ formError }}</p>
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
