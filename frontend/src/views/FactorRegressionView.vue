<script setup lang="ts">
import { ref } from 'vue';

import { postJson } from '../lib/api';
import type { FactorResponse } from '../types';

const method = ref('OLS');
const model = ref('Five-Factor Model');
const tickers = ref('VTI, VXUS, BND');
const result = ref<FactorResponse | null>(null);
const error = ref('');
const loading = ref(false);

async function runAnalysis() {
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
</script>

<template>
  <section class="page">
    <div class="page-header">
      <div>
        <h2>Factor regression</h2>
        <p class="muted">Start with the model and regression controls that will later map to real factor return data.</p>
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
        <div class="button-row">
          <button class="primary-button" type="submit">{{ loading ? 'Running...' : 'Run regression' }}</button>
        </div>
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
          </div>
          <ul class="list">
            <li v-for="factor in result.factors" :key="factor.name">
              <strong>{{ factor.name }}</strong>: {{ factor.exposure.toFixed(2) }}
            </li>
          </ul>
        </template>
        <p v-else class="muted">The backend currently returns placeholder exposures for the selected model.</p>
      </div>
    </div>
  </section>
</template>
