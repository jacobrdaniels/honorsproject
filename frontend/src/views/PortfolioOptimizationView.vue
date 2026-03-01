<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import { postJson } from '../lib/api';
import { formatAllocationText, sumAllocationWeights } from '../lib/portfolio';
import { listSavedPortfolios, resolveSelectedPortfolioId } from '../lib/savedPortfolio';
import type { OptimizationResponse, SavedPortfolio } from '../types';

const route = useRoute();
const portfolios = ref<SavedPortfolio[]>([]);
const selectedPortfolioId = ref('');
const objective = ref('Max Sharpe');
const constraints = ref('Stocks: max 80%, Bonds: min 20%');
const targetReturn = ref('8.5');
const result = ref<OptimizationResponse | null>(null);
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

  if (!constraints.value.trim()) {
    return 'Add a short constraint summary for the optimizer.';
  }

  if (objective.value === 'Target Return') {
    const target = Number(targetReturn.value);

    if (!Number.isFinite(target)) {
      return 'Target return must be a number.';
    }
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

async function optimizePortfolio() {
  const validationMessage = formError.value;

  if (validationMessage || !selectedPortfolio.value) {
    error.value = validationMessage || 'Select a saved portfolio first.';
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    result.value = await postJson<OptimizationResponse>('/api/analysis/optimize', {
      objective: objective.value,
      constraints: constraints.value,
      targetReturn: objective.value === 'Target Return' ? Number(targetReturn.value) : null,
      allocations: formatAllocationText(selectedPortfolio.value.assets),
    });
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to optimize portfolio';
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
        <h2>Portfolio optimization</h2>
        <p class="muted">Use a premade portfolio as the starting model, then adjust optimization-specific settings here.</p>
      </div>
    </div>

    <div class="grid-2">
      <form class="panel" @submit.prevent="optimizePortfolio">
        <label>
          Premade portfolio
          <select v-model="selectedPortfolioId">
            <option v-for="portfolio in portfolios" :key="portfolio.id" :value="portfolio.id">
              {{ portfolio.name }}
            </option>
          </select>
        </label>
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
        <label v-if="objective === 'Target Return'">
          Target return (%)
          <input v-model="targetReturn" inputmode="decimal" />
        </label>
        <div v-if="selectedPortfolio" class="mode-summary">
          <p class="list-label">Seed allocation</p>
          <p>Benchmark ticker: {{ selectedPortfolio.benchmark }} | Total weight: {{ totalWeight.toFixed(2) }}%</p>
          <div>
            <span v-for="asset in selectedPortfolio.assets" :key="asset.symbol" class="asset-pill">
              {{ asset.symbol }} {{ asset.weight.toFixed(0) }}%
            </span>
          </div>
        </div>
        <div class="button-row">
          <button class="primary-button" type="submit">{{ loading ? 'Optimizing...' : 'Optimize' }}</button>
        </div>
        <p v-if="formError && !error" class="muted">{{ formError }}</p>
        <p v-if="!portfolios.length" class="muted">
          No premade portfolios yet.
          <RouterLink class="secondary-link inline-link" to="/saved-portfolios">Build one on the saved portfolios page</RouterLink>
        </p>
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
