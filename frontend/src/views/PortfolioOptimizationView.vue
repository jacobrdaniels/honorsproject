<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { postJson } from '../lib/api';
import { formatAllocationText, parseAllocationText, sumAllocationWeights } from '../lib/portfolio';
import { getPortfolioIdFromQuery, getSavedPortfolio } from '../lib/savedPortfolio';
import type { OptimizationResponse } from '../types';

const route = useRoute();
const objective = ref('Max Sharpe');
const constraints = ref('Stocks: max 80%, Bonds: min 20%');
const allocations = ref('VTI:60, VXUS:20, BND:20');
const targetReturn = ref('8.5');
const selectedPortfolioName = ref('');
const result = ref<OptimizationResponse | null>(null);
const error = ref('');
const loading = ref(false);

const parsedAllocations = computed(() => parseAllocationText(allocations.value));
const totalWeight = computed(() => sumAllocationWeights(parsedAllocations.value));
const formError = computed(() => {
  if (!constraints.value.trim()) {
    return 'Add a short constraint summary for the optimizer.';
  }

  if (parsedAllocations.value.length === 0) {
    return 'Provide a seed allocation in the format TICKER:WEIGHT.';
  }

  if (objective.value === 'Target Return') {
    const target = Number(targetReturn.value);

    if (!Number.isFinite(target)) {
      return 'Target return must be a number.';
    }
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
    allocations.value = formatAllocationText(portfolio.assets);
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to load saved portfolio';
  }
}

async function optimizePortfolio() {
  const validationMessage = formError.value;

  if (validationMessage) {
    error.value = validationMessage;
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    result.value = await postJson<OptimizationResponse>('/api/analysis/optimize', {
      objective: objective.value,
      constraints: constraints.value,
      targetReturn: objective.value === 'Target Return' ? Number(targetReturn.value) : null,
      allocations: allocations.value,
    });
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to optimize portfolio';
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
        <h2>Portfolio optimization</h2>
        <p class="muted">Treat this as the base UI for optimization settings and a recommended allocation result.</p>
        <p v-if="selectedPortfolioName" class="success">Loaded seed allocation from saved portfolio: {{ selectedPortfolioName }}</p>
      </div>
    </div>

    <div class="grid-2">
      <form class="panel" @submit.prevent="optimizePortfolio">
        <label>
          Objective
          <select v-model="objective">
            <option>Max Sharpe</option>
            <option>Min Variance</option>
            <option>Target Return</option>
          </select>
        </label>
        <label>
          Constraints
          <textarea v-model="constraints" />
        </label>
        <label>
          Seed allocation
          <textarea v-model="allocations" />
        </label>
        <label v-if="objective === 'Target Return'">
          Target return (%)
          <input v-model="targetReturn" inputmode="decimal" />
        </label>
        <p class="muted">Seed holdings: {{ parsedAllocations.length }} | Total weight: {{ totalWeight.toFixed(2) }}%</p>
        <div class="button-row">
          <button class="primary-button" type="submit">{{ loading ? 'Optimizing...' : 'Optimize' }}</button>
        </div>
        <p v-if="formError && !error" class="muted">{{ formError }}</p>
      </form>

      <div class="panel">
        <h3>Recommended allocation</h3>
        <p v-if="error" class="error">{{ error }}</p>
        <template v-else-if="result">
          <div class="grid-2">
            <div class="result-card">
              <p class="metric-label">Expected return</p>
              <div class="metric">{{ result.expectedReturn.toFixed(2) }}%</div>
            </div>
            <div class="result-card">
              <p class="metric-label">Expected volatility</p>
              <div class="metric">{{ result.expectedVolatility.toFixed(2) }}%</div>
            </div>
          </div>
          <p class="muted">Objective: {{ result.objective }}</p>
          <p class="muted">Constraints: {{ result.constraintSummary }}</p>
          <p v-if="result.targetReturn !== null" class="muted">Target return: {{ result.targetReturn.toFixed(2) }}%</p>
          <div>
            <span v-for="asset in result.allocation" :key="asset.symbol" class="asset-pill">
              {{ asset.symbol }} {{ asset.weight.toFixed(0) }}%
            </span>
          </div>
          <ul class="list muted">
            <li v-for="note in result.notes" :key="note">{{ note }}</li>
          </ul>
        </template>
        <p v-else class="muted">The optimization endpoint currently returns a realistic-looking placeholder allocation.</p>
      </div>
    </div>
  </section>
</template>
