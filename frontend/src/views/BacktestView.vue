<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import { postJson } from '../lib/api';
import { formatAllocationText, sumAllocationWeights } from '../lib/portfolio';
import { listSavedPortfolios, resolveSelectedPortfolioId } from '../lib/savedPortfolio';
import type { BacktestResponse, SavedPortfolio } from '../types';

const route = useRoute();
const portfolios = ref<SavedPortfolio[]>([]);
const selectedPortfolioId = ref('');
const startDate = ref('2018-01-01');
const endDate = ref('2026-01-28');
const result = ref<BacktestResponse | null>(null);
const error = ref('');
const loading = ref(false);

const selectedPortfolio = computed(() =>
  portfolios.value.find((portfolio) => portfolio.id === selectedPortfolioId.value) ?? null,
);
const totalWeight = computed(() => selectedPortfolio.value ? sumAllocationWeights(selectedPortfolio.value.assets) : 0);
const formError = computed(() => {
  if (!selectedPortfolio.value) {
    return 'Create or select a saved portfolio first.';
  }

  if (!startDate.value || !endDate.value) {
    return 'Select both a start and end date.';
  }

  if (startDate.value > endDate.value) {
    return 'Start date must be before the end date.';
  }

  return '';
});

async function loadPortfolios() {
  try {
    portfolios.value = await listSavedPortfolios();
    selectedPortfolioId.value = resolveSelectedPortfolioId(portfolios.value, route.query, selectedPortfolioId.value);
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to load saved portfolios';
  }
}

async function runBacktest() {
  const validationMessage = formError.value;

  if (validationMessage || !selectedPortfolio.value) {
    error.value = validationMessage || 'Select a saved portfolio first.';
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    result.value = await postJson<BacktestResponse>('/api/analysis/backtest', {
      benchmark: selectedPortfolio.value.benchmark,
      allocations: formatAllocationText(selectedPortfolio.value.assets),
      startDate: startDate.value,
      endDate: endDate.value,
    });
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to run backtest';
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
        <h2>Backtest portfolio</h2>
        <p class="muted">Choose a premade portfolio, then run the backtest with mode-specific timing settings.</p>
      </div>
    </div>

    <div class="grid-2">
      <form class="panel" @submit.prevent="runBacktest">
        <div v-if="portfolios.length" class="mode-form-grid">
          <label>
            Premade portfolio
            <select v-model="selectedPortfolioId">
              <option v-for="portfolio in portfolios" :key="portfolio.id" :value="portfolio.id">
                {{ portfolio.name }}
              </option>
            </select>
          </label>
          <div v-if="selectedPortfolio" class="mode-summary">
            <p class="list-label">Selected benchmark</p>
            <p>{{ selectedPortfolio.benchmark }}</p>
            <p class="muted">Holdings: {{ selectedPortfolio.assets.length }} | Total weight: {{ totalWeight.toFixed(2) }}%</p>
          </div>
        </div>
        <div class="grid-2">
          <label>
            Start date
            <input v-model="startDate" type="date" />
          </label>
          <label>
            End date
            <input v-model="endDate" type="date" />
          </label>
        </div>
        <div v-if="selectedPortfolio">
          <span v-for="asset in selectedPortfolio.assets" :key="asset.symbol" class="asset-pill">
            {{ asset.symbol }} {{ asset.weight.toFixed(0) }}%
          </span>
        </div>
        <div class="button-row">
          <button class="primary-button" type="submit">{{ loading ? 'Running...' : 'Run backtest' }}</button>
        </div>
        <p v-if="formError && !error" class="muted">{{ formError }}</p>
        <p v-if="!portfolios.length" class="muted">
          No premade portfolios yet.
          <RouterLink class="secondary-link inline-link" to="/saved-portfolios">Build one on the saved portfolios page</RouterLink>
        </p>
      </form>

      <div class="panel">
        <h3>Sample result</h3>
        <p v-if="error" class="error">{{ error }}</p>
        <template v-else-if="result">
          <div class="grid-2">
            <div class="result-card">
              <p class="metric-label">CAGR</p>
              <div class="metric">{{ result.summary.cagr.toFixed(2) }}%</div>
            </div>
            <div class="result-card">
              <p class="metric-label">Sharpe</p>
              <div class="metric">{{ result.summary.sharpe.toFixed(2) }}</div>
            </div>
            <div class="result-card">
              <p class="metric-label">Volatility</p>
              <div class="metric">{{ result.summary.volatility.toFixed(2) }}%</div>
            </div>
            <div class="result-card">
              <p class="metric-label">Max drawdown</p>
              <div class="metric">{{ result.summary.maxDrawdown.toFixed(2) }}%</div>
            </div>
            <div class="result-card">
              <p class="metric-label">Ending value</p>
              <div class="metric">${{ result.summary.endingValue.toLocaleString() }}</div>
            </div>
          </div>
          <p class="muted">Benchmark: {{ result.benchmark }} | Window: {{ result.startDate }} to {{ result.endDate }}</p>
          <div>
            <span v-for="asset in result.portfolio" :key="asset.symbol" class="asset-pill">
              {{ asset.symbol }} {{ asset.weight.toFixed(0) }}%
            </span>
          </div>
          <ul class="list">
            <li v-for="point in result.equityCurve" :key="point.period">
              <span class="inline-code">{{ point.period }}</span>: {{ point.value.toLocaleString() }}
            </li>
          </ul>
          <ul class="list muted">
            <li v-for="note in result.notes" :key="note">{{ note }}</li>
          </ul>
        </template>
        <p v-else class="muted">Run the stub endpoint to preview the page flow.</p>
      </div>
    </div>
  </section>
</template>
