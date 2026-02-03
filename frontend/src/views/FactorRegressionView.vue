<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { postJson } from '../lib/api';
import { getPortfolioTickers, parseTickerText } from '../lib/portfolio';
import { getPortfolioIdFromQuery, getSavedPortfolio } from '../lib/savedPortfolio';
import type { FactorResponse } from '../types';

const route = useRoute();
const method = ref('OLS');
const model = ref('Five-Factor Model');
const tickers = ref('VTI, VXUS, BND');
const selectedPortfolioName = ref('');
const result = ref<FactorResponse | null>(null);
const error = ref('');
const loading = ref(false);

const parsedTickers = computed(() => parseTickerText(tickers.value));
const formError = computed(() => parsedTickers.value.length === 0 ? 'Enter at least one ticker symbol.' : '');

async function syncSavedPortfolio() {
  const portfolioId = getPortfolioIdFromQuery(route.query);

  if (!portfolioId) {
    selectedPortfolioName.value = '';
    return;
  }

  try {
    const portfolio = await getSavedPortfolio(`/api/portfolios/${portfolioId}`);
    selectedPortfolioName.value = portfolio.name;
    tickers.value = getPortfolioTickers(portfolio);
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to load saved portfolio';
  }
}

async function runAnalysis() {
  const validationMessage = formError.value;

  if (validationMessage) {
    error.value = validationMessage;
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    result.value = await postJson<FactorResponse>('/api/analysis/factors', {
      method: method.value,
      model: model.value,
      tickers: tickers.value,
    });
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to run factor analysis';
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
        <h2>Factor regression</h2>
        <p class="muted">Start with the model and regression controls that will later map to real factor return data.</p>
        <p v-if="selectedPortfolioName" class="success">Loaded tickers from saved portfolio: {{ selectedPortfolioName }}</p>
      </div>
    </div>

    <div class="grid-2">
      <form class="panel" @submit.prevent="runAnalysis">
        <div class="grid-2">
          <label>
            Regression method
            <select v-model="method">
              <option>OLS</option>
              <option>LASSO</option>
            </select>
          </label>
          <label>
            Factor model
            <select v-model="model">
              <option>CAPM</option>
              <option>Three-Factor Model</option>
              <option>Four-Factor Model</option>
              <option>Five-Factor Model</option>
            </select>
          </label>
        </div>
        <label>
          Tickers
          <textarea v-model="tickers" />
        </label>
        <p class="muted">Parsed tickers: {{ parsedTickers.join(', ') || 'none yet' }}</p>
        <div class="button-row">
          <button class="primary-button" type="submit">{{ loading ? 'Running...' : 'Run regression' }}</button>
        </div>
        <p v-if="formError && !error" class="muted">{{ formError }}</p>
      </form>

      <div class="panel">
        <h3>Regression output</h3>
        <p v-if="error" class="error">{{ error }}</p>
        <template v-else-if="result">
          <div class="grid-2">
            <div class="result-card">
              <p class="metric-label">Alpha</p>
              <div class="metric">{{ result.alpha.toFixed(2) }}%</div>
            </div>
            <div class="result-card">
              <p class="metric-label">R-squared</p>
              <div class="metric">{{ result.rSquared.toFixed(2) }}</div>
            </div>
            <div class="result-card">
              <p class="metric-label">Observations</p>
              <div class="metric">{{ result.observations }}</div>
            </div>
          </div>
          <p class="muted">Method: {{ result.regressionMethod }} | Model: {{ result.factorModel }}</p>
          <p class="muted">Tickers analyzed: {{ result.analyzedTickers.join(', ') }}</p>
          <ul class="list">
            <li v-for="factor in result.factors" :key="factor.name">
              <strong>{{ factor.name }}</strong>: {{ factor.exposure.toFixed(2) }}
            </li>
          </ul>
          <ul class="list muted">
            <li v-for="note in result.notes" :key="note">{{ note }}</li>
          </ul>
        </template>
        <p v-else class="muted">The backend currently returns placeholder exposures for the selected model.</p>
      </div>
    </div>
  </section>
</template>
