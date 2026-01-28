<script setup lang="ts">
import { ref } from 'vue';

import { postJson } from '../lib/api';
import type { EfficientFrontierResponse } from '../types';

const universe = ref('VTI:0.08:0.16, VXUS:0.07:0.18, BND:0.04:0.06');
const result = ref<EfficientFrontierResponse | null>(null);
const error = ref('');
const loading = ref(false);

async function buildFrontier() {
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
</script>

<template>
  <section class="page">
    <div class="page-header">
      <div>
        <h2>Efficient frontier</h2>
        <p class="muted">Use this page to frame the eventual frontier chart and model portfolio recommendations.</p>
      </div>
    </div>

    <div class="grid-2">
      <form class="panel" @submit.prevent="buildFrontier">
        <label>
          Asset universe
          <textarea v-model="universe" />
        </label>
        <div class="button-row">
          <button class="primary-button" type="submit">{{ loading ? 'Generating...' : 'Generate frontier' }}</button>
        </div>
      </form>

      <div class="panel">
        <h3>Frontier preview</h3>
        <p v-if="error" class="error">{{ error }}</p>
        <template v-else-if="result">
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
        </template>
        <p v-else class="muted">The backend sends frontier points that can later feed a charting library.</p>
      </div>
    </div>
  </section>
</template>
