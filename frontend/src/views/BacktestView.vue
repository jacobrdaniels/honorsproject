<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { postJson } from '../lib/api';
import { formatAllocationText, parseAllocationText, sumAllocationWeights } from '../lib/portfolio';
import { getPortfolioIdFromQuery, getSavedPortfolio } from '../lib/savedPortfolio';
import type { BacktestResponse } from '../types';

const route = useRoute();
const benchmark = ref('SPY');
const allocations = ref('VTI:60, VXUS:20, BND:20');
const startDate = ref('2018-01-01');
const endDate = ref('2026-01-28');
const selectedPortfolioName = ref('');
const result = ref<BacktestResponse | null>(null);
const error = ref('');
const loading = ref(false);

const parsedAllocations = computed(() => parseAllocationText(allocations.value));
const totalWeight = computed(() => sumAllocationWeights(parsedAllocations.value));
const formError = computed(() => {
  if (parsedAllocations.value.length === 0) {
    return 'Use at least one allocation in the format TICKER:WEIGHT.';
  }

  if (!startDate.value || !endDate.value) {
    return 'Select both a start and end date.';
  }

  if (startDate.value > endDate.value) {
    return 'Start date must be before the end date.';
  }

  return '';
});

async function syncSavedPortfolio() {
  const portfolioId = getPortfolioIdFromQuery(route.query);

  if (!portfolioId) {
    selectedPortfolioName.value = '';
    return;
  }

  try {
    const portfolio = await getSavedPortfolio(`/api/portfolios/${portfolioId}`);
    selectedPortfolioName.value = portfolio.name;
    benchmark.value = portfolio.benchmark;
    allocations.value = formatAllocationText(portfolio.assets);
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to load saved portfolio';
  }
}

async function runBacktest() {
  const validationMessage = formError.value;

  if (validationMessage) {
    error.value = validationMessage;
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    result.value = await postJson<BacktestResponse>('/api/analysis/backtest', {
      benchmark: benchmark.value,
      allocations: allocations.value,
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
  void syncSavedPortfolio();
}, { immediate: true });
</script>

<template>
  <section class="page">
    <div class="page-header">
      <div>
        <h2>Backtest portfolio</h2>
        <p class="muted">Capture the main controls you saw in the reference tool and wire them to a placeholder API.</p>
        <p v-if="selectedPortfolioName" class="success">Loaded from saved portfolio: {{ selectedPortfolioName }}</p>
      </div>
    </div>

    <div class="grid-2">
      <form class="panel" @submit.prevent="runBacktest">
        <label>
          Benchmark
          <input v-model="benchmark" placeholder="SPY" />
        </label>
        <label>
          Allocations
          <textarea v-model="allocations" />
        </label>
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
        <p class="muted">Holdings parsed: {{ parsedAllocations.length }} | Total weight: {{ totalWeight.toFixed(2) }}%</p>
        <div class="button-row">
          <button class="primary-button" type="submit">{{ loading ? 'Running...' : 'Run backtest' }}</button>
        </div>
        <p v-if="formError && !error" class="muted">{{ formError }}</p>
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
