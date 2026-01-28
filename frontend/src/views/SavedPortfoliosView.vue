<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { getJson, postJson } from '../lib/api';
import type { SavedPortfolio } from '../types';

const name = ref('Core three-fund');
const benchmark = ref('SPY');
const notes = ref('Simple long-term allocation for comparisons.');
const assetsText = ref('VTI:60, VXUS:20, BND:20');
const portfolios = ref<SavedPortfolio[]>([]);
const loading = ref(false);
const saving = ref(false);
const message = ref('');
const error = ref('');

const assetPreview = computed(() =>
  assetsText.value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean),
);

async function loadPortfolios() {
  loading.value = true;
  error.value = '';

  try {
    portfolios.value = await getJson<SavedPortfolio[]>('/api/portfolios');
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to load portfolios';
  } finally {
    loading.value = false;
  }
}

async function savePortfolio() {
  saving.value = true;
  error.value = '';
  message.value = '';

  try {
    const saved = await postJson<SavedPortfolio>('/api/portfolios', {
      name: name.value,
      benchmark: benchmark.value,
      notes: notes.value,
      allocations: assetsText.value,
    });

    portfolios.value = [saved, ...portfolios.value.filter((portfolio) => portfolio.id !== saved.id)];
    message.value = 'Portfolio saved locally.';
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to save portfolio';
  } finally {
    saving.value = false;
  }
}

onMounted(loadPortfolios);
</script>

<template>
  <section class="page">
    <div class="page-header">
      <div>
        <h2>Saved portfolios</h2>
        <p class="muted">This page is connected to the local JSON-backed API so saved scenarios survive page reloads.</p>
      </div>
      <div class="button-row">
        <button class="secondary-button" type="button" @click="loadPortfolios">Refresh</button>
      </div>
    </div>

    <div class="grid-2">
      <form class="panel" @submit.prevent="savePortfolio">
        <label>
          Portfolio name
          <input v-model="name" placeholder="Income tilt" />
        </label>
        <label>
          Benchmark
          <input v-model="benchmark" placeholder="SPY" />
        </label>
        <label>
          Allocations
          <textarea v-model="assetsText" />
        </label>
        <label>
          Notes
          <textarea v-model="notes" />
        </label>
        <div>
          <p class="list-label">Preview</p>
          <span v-for="asset in assetPreview" :key="asset" class="asset-pill">{{ asset }}</span>
        </div>
        <div class="button-row">
          <button class="primary-button" type="submit">{{ saving ? 'Saving...' : 'Save portfolio' }}</button>
        </div>
        <p v-if="message" class="success">{{ message }}</p>
        <p v-if="error" class="error">{{ error }}</p>
      </form>

      <div class="panel">
        <h3>Portfolio library</h3>
        <p v-if="loading" class="muted">Loading portfolios...</p>
        <ul v-else-if="portfolios.length" class="list">
          <li v-for="portfolio in portfolios" :key="portfolio.id" class="portfolio-card">
            <div>
              <h3>{{ portfolio.name }}</h3>
              <p class="muted">Benchmark: {{ portfolio.benchmark }}</p>
            </div>
            <p>{{ portfolio.notes }}</p>
            <div>
              <span v-for="asset in portfolio.assets" :key="`${portfolio.id}-${asset.symbol}`" class="asset-pill">
                {{ asset.symbol }} {{ asset.weight.toFixed(0) }}%
              </span>
            </div>
          </li>
        </ul>
        <p v-else class="muted">No saved portfolios yet. Create the first one from the form.</p>
      </div>
    </div>
  </section>
</template>
