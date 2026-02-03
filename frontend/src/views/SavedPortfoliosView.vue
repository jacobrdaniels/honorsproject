<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { deleteJson, getJson, postJson, putJson } from '../lib/api';
import {
  formatAllocationText,
  parseAllocationText,
  sumAllocationWeights,
} from '../lib/portfolio';
import type { SavedPortfolio } from '../types';

const name = ref('Core three-fund');
const benchmark = ref('SPY');
const notes = ref('Simple long-term allocation for comparisons.');
const assetsText = ref('VTI:60, VXUS:20, BND:20');
const editingId = ref<string | null>(null);
const deletingId = ref<string | null>(null);
const portfolios = ref<SavedPortfolio[]>([]);
const loading = ref(false);
const saving = ref(false);
const message = ref('');
const error = ref('');

const parsedAssets = computed(() => parseAllocationText(assetsText.value));
const assetPreview = computed(() => parsedAssets.value.map((asset) => `${asset.symbol}:${asset.weight}`));
const totalWeight = computed(() => sumAllocationWeights(parsedAssets.value));
const isEditing = computed(() => editingId.value !== null);

const formError = computed(() => {
  if (!name.value.trim()) {
    return 'Portfolio name is required.';
  }

  if (!assetsText.value.trim()) {
    return 'Allocations are required.';
  }

  if (parsedAssets.value.length === 0) {
    return 'Use the format TICKER:WEIGHT, for example VTI:60, VXUS:20, BND:20.';
  }

  return '';
});

function resetForm() {
  name.value = 'Core three-fund';
  benchmark.value = 'SPY';
  notes.value = 'Simple long-term allocation for comparisons.';
  assetsText.value = 'VTI:60, VXUS:20, BND:20';
  editingId.value = null;
  message.value = '';
  error.value = '';
}

function upsertPortfolio(saved: SavedPortfolio) {
  portfolios.value = [saved, ...portfolios.value.filter((portfolio) => portfolio.id !== saved.id)];
}

function startEditing(portfolio: SavedPortfolio) {
  editingId.value = portfolio.id;
  name.value = portfolio.name;
  benchmark.value = portfolio.benchmark;
  notes.value = portfolio.notes;
  assetsText.value = formatAllocationText(portfolio.assets);
  message.value = `Editing ${portfolio.name}.`;
  error.value = '';
}

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
  const validationMessage = formError.value;

  if (validationMessage) {
    error.value = validationMessage;
    message.value = '';
    return;
  }

  saving.value = true;
  error.value = '';
  message.value = '';

  try {
    const wasEditing = editingId.value !== null;
    const payload = {
      name: name.value,
      benchmark: benchmark.value,
      notes: notes.value,
      allocations: assetsText.value,
    };

    const saved = editingId.value
      ? await putJson<SavedPortfolio>(`/api/portfolios/${editingId.value}`, payload)
      : await postJson<SavedPortfolio>('/api/portfolios', payload);

    upsertPortfolio(saved);
    resetForm();
    message.value = wasEditing ? 'Portfolio updated.' : 'Portfolio saved locally.';
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to save portfolio';
  } finally {
    saving.value = false;
  }
}

async function removePortfolio(portfolio: SavedPortfolio) {
  deletingId.value = portfolio.id;
  error.value = '';
  message.value = '';

  try {
    await deleteJson(`/api/portfolios/${portfolio.id}`);
    portfolios.value = portfolios.value.filter((item) => item.id !== portfolio.id);

    if (editingId.value === portfolio.id) {
      resetForm();
    }

    message.value = `${portfolio.name} removed from the library.`;
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to delete portfolio';
  } finally {
    deletingId.value = null;
  }
}

onMounted(loadPortfolios);
</script>

<template>
  <section class="page">
    <div class="page-header">
      <div>
        <h2>Saved portfolios</h2>
        <p class="muted">This page is connected to the local SQLite-backed API so saved scenarios can be reused across the analysis tools.</p>
      </div>
      <div class="button-row">
        <button class="secondary-button" type="button" @click="loadPortfolios">Refresh</button>
        <button v-if="isEditing" class="secondary-button" type="button" @click="resetForm">Cancel edit</button>
      </div>
    </div>

    <div class="grid-2">
      <form class="panel" @submit.prevent="savePortfolio">
        <p class="list-label">Portfolio editor</p>
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
          <p class="muted">Parsed assets: {{ parsedAssets.length }} | Total weight: {{ totalWeight.toFixed(2) }}%</p>
        </div>
        <div class="button-row">
          <button class="primary-button" type="submit">{{ saving ? 'Saving...' : (isEditing ? 'Update portfolio' : 'Save portfolio') }}</button>
        </div>
        <p v-if="formError && !error" class="muted">{{ formError }}</p>
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
            <div class="button-row">
              <button class="secondary-button" type="button" @click="startEditing(portfolio)">Edit</button>
              <button
                class="secondary-button danger-button"
                type="button"
                :disabled="deletingId === portfolio.id"
                @click="removePortfolio(portfolio)"
              >
                {{ deletingId === portfolio.id ? 'Removing...' : 'Delete' }}
              </button>
            </div>
            <div class="button-row">
              <RouterLink class="secondary-link" :to="{ path: '/backtest', query: { portfolioId: portfolio.id } }">Use in backtest</RouterLink>
              <RouterLink class="secondary-link" :to="{ path: '/factor-regression', query: { portfolioId: portfolio.id } }">Use in factors</RouterLink>
              <RouterLink class="secondary-link" :to="{ path: '/efficient-frontier', query: { portfolioId: portfolio.id } }">Use in frontier</RouterLink>
              <RouterLink class="secondary-link" :to="{ path: '/optimization', query: { portfolioId: portfolio.id } }">Use in optimization</RouterLink>
            </div>
          </li>
        </ul>
        <p v-else class="muted">No saved portfolios yet. Create the first one from the form.</p>
      </div>
    </div>
  </section>
</template>
