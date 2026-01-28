<script setup lang="ts">
import { ref } from 'vue';

import { postJson } from '../lib/api';
import type { OptimizationResponse } from '../types';

const objective = ref('Max Sharpe');
const constraints = ref('Stocks: max 80%, Bonds: min 20%');
const result = ref<OptimizationResponse | null>(null);
const error = ref('');
const loading = ref(false);

async function optimizePortfolio() {
  loading.value = true;
  error.value = '';

  try {
    result.value = await postJson<OptimizationResponse>('/api/analysis/optimize', {
      objective: objective.value,
      constraints: constraints.value,
    });
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to optimize portfolio';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="page">
    <div class="page-header">
      <div>
        <h2>Portfolio optimization</h2>
        <p class="muted">Treat this as the base UI for optimization settings and a recommended allocation result.</p>
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
        <div class="button-row">
          <button class="primary-button" type="submit">{{ loading ? 'Optimizing...' : 'Optimize' }}</button>
        </div>
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
          <div>
            <span v-for="asset in result.allocation" :key="asset.symbol" class="asset-pill">
              {{ asset.symbol }} {{ asset.weight.toFixed(0) }}%
            </span>
          </div>
        </template>
        <p v-else class="muted">The optimization endpoint currently returns a realistic-looking placeholder allocation.</p>
      </div>
    </div>
  </section>
</template>
