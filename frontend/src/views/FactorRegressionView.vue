<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import { postJson } from '../lib/api';
import { getPortfolioTickers } from '../lib/portfolio';
import { listSavedPortfolios, resolveSelectedPortfolioId } from '../lib/savedPortfolio';
import type { FactorResponse, SavedPortfolio } from '../types';

const route = useRoute();
const portfolios = ref<SavedPortfolio[]>([]);
const selectedPortfolioId = ref('');
const method = ref('OLS');
const model = ref('Five-Factor Model');
const result = ref<FactorResponse | null>(null);
const error = ref('');
const loading = ref(false);

const selectedPortfolio = computed(() =>
  portfolios.value.find((portfolio) => portfolio.id === selectedPortfolioId.value) ?? null,
);
const formError = computed(() => selectedPortfolio.value ? '' : 'Create or select a saved portfolio first.');

async function loadPortfolios() {
  try {
    portfolios.value = await listSavedPortfolios();
    selectedPortfolioId.value = resolveSelectedPortfolioId(portfolios.value, route.query, selectedPortfolioId.value);
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to load saved portfolios';
  }
}

async function runAnalysis() {
  const validationMessage = formError.value;

  if (validationMessage || !selectedPortfolio.value) {
    error.value = validationMessage || 'Select a saved portfolio first.';
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    result.value = await postJson<FactorResponse>('/api/analysis/factors', {
      method: method.value,
      model: model.value,
      tickers: getPortfolioTickers(selectedPortfolio.value),
    });
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to run factor analysis';
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
        <h2>Factor regression</h2>
        <p class="muted">Choose a premade portfolio, then configure the regression model for that saved set of tickers.</p>
      </div>
    </div>

    <div class="grid-2">
      <form class="panel" @submit.prevent="runAnalysis">
        <label>
          Premade portfolio
          <select v-model="selectedPortfolioId">
            <option v-for="portfolio in portfolios" :key="portfolio.id" :value="portfolio.id">
              {{ portfolio.name }}
            </option>
          </select>
        </label>
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
        <div v-if="selectedPortfolio" class="mode-summary">
          <p class="list-label">Portfolio tickers</p>
          <p>{{ getPortfolioTickers(selectedPortfolio) }}</p>
          <p class="muted">Benchmark ticker: {{ selectedPortfolio.benchmark }}</p>
        </div>
        <div class="button-row">
          <button class="primary-button" type="submit">{{ loading ? 'Running...' : 'Run regression' }}</button>
        </div>
        <p v-if="formError && !error" class="muted">{{ formError }}</p>
        <p v-if="!portfolios.length" class="muted">
          No premade portfolios yet.
          <RouterLink class="secondary-link inline-link" to="/saved-portfolios">Build one on the saved portfolios page</RouterLink>
        </p>
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
