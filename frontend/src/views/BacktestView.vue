<script setup lang="ts">
import { ref } from 'vue';

import { postJson } from '../lib/api';
import type { BacktestResponse } from '../types';

const benchmark = ref('SPY');
const allocations = ref('VTI:60, VXUS:20, BND:20');
const startDate = ref('2018-01-01');
const endDate = ref('2026-01-28');
const result = ref<BacktestResponse | null>(null);
const error = ref('');
const loading = ref(false);

async function runBacktest() {
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
</script>

<template>
  <section class="page">
    <div class="page-header">
      <div>
        <h2>Backtest portfolio</h2>
        <p class="muted">Capture the main controls you saw in the reference tool and wire them to a placeholder API.</p>
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
        <div class="button-row">
          <button class="primary-button" type="submit">{{ loading ? 'Running...' : 'Run backtest' }}</button>
        </div>
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
          </div>
          <ul class="list">
            <li v-for="point in result.equityCurve" :key="point.period">
              <span class="inline-code">{{ point.period }}</span>: {{ point.value.toLocaleString() }}
            </li>
          </ul>
        </template>
        <p v-else class="muted">Run the stub endpoint to preview the page flow.</p>
      </div>
    </div>
  </section>
</template>
