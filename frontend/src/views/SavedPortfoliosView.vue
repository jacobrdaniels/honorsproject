<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { deleteJson, getJson, postJson, putJson } from '../lib/api';
import {
  assetRowsToAllocationText,
  createPortfolioAssetRows,
  getAllocationValidationMessage,
  parseAllocationText,
  portfolioToAssetRows,
  sumAssetRowWeights,
  type PortfolioAssetRow,
} from '../lib/portfolio';
import type { SavedPortfolio } from '../types';

const defaultName = 'Core three-fund';
const defaultBenchmark = 'SPY';
const defaultNotes = 'Simple long-term allocation for comparisons.';

const name = ref(defaultName);
const benchmark = ref(defaultBenchmark);
const notes = ref(defaultNotes);
const assetRows = ref<PortfolioAssetRow[]>(createPortfolioAssetRows());
const editingId = ref<string | null>(null);
const deletingId = ref<string | null>(null);
const portfolios = ref<SavedPortfolio[]>([]);
const loading = ref(false);
const saving = ref(false);
const message = ref('');
const error = ref('');

const allocationsText = computed(() => assetRowsToAllocationText(assetRows.value));
const parsedAssets = computed(() => parseAllocationText(allocationsText.value));
const totalWeight = computed(() => sumAssetRowWeights(assetRows.value));
const isEditing = computed(() => editingId.value !== null);
const totalIsBalanced = computed(() => totalWeight.value === 100);

const formError = computed(() => {
  if (!name.value.trim()) {
    return 'Portfolio name is required.';
  }

  if (!benchmark.value.trim()) {
    return 'Benchmark ticker is required.';
  }

  const filledRows = assetRows.value.filter((row) => row.symbol.trim() || row.weight.trim());

  if (filledRows.length === 0) {
    return 'Enter at least one holding ticker and weight.';
  }

  const incompleteOrInvalidRows = filledRows.filter((row) => {
    const symbol = row.symbol.trim();
    const rawWeight = row.weight.trim();
    return !symbol || !rawWeight || !Number.isFinite(Number(rawWeight));
  });

  if (incompleteOrInvalidRows.length > 0) {
    return 'Each holding row needs a ticker and numeric weight.';
  }

  const allocationMessage = getAllocationValidationMessage(parsedAssets.value);

  if (allocationMessage) {
    return allocationMessage;
  }

  return '';
});

function resetForm() {
  name.value = defaultName;
  benchmark.value = defaultBenchmark;
  notes.value = defaultNotes;
  assetRows.value = createPortfolioAssetRows();
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
  assetRows.value = portfolioToAssetRows(portfolio);
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
      benchmark: benchmark.value.trim().toUpperCase(),
      notes: notes.value,
      allocations: allocationsText.value,
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
        <h2>Portfolios</h2>
        <p class="muted">Create portfolios with ticker weights, notes, and a benchmark ticker.</p>
      </div>
      <div class="button-row">
        <button class="secondary-button" type="button" @click="loadPortfolios">Refresh</button>
        <button v-if="isEditing" class="secondary-button" type="button" @click="resetForm">Cancel edit</button>
      </div>
    </div>

    <div class="builder-shell">
      <form class="panel builder-panel" @submit.prevent="savePortfolio">
        <div class="builder-section">
          <p class="list-label">Portfolio settings</p>
          <div class="config-grid">
            <div class="config-row">
              <label class="config-label" for="portfolio-name">Portfolio name</label>
              <div class="config-control">
                <input id="portfolio-name" v-model="name" placeholder="Income tilt" />
              </div>
            </div>
            <div class="config-row">
              <label class="config-label" for="benchmark-ticker">Benchmark ticker</label>
              <div class="config-control">
                <input id="benchmark-ticker" v-model="benchmark" placeholder="SPY" />
              </div>
            </div>
            <div class="config-row">
              <label class="config-label" for="portfolio-notes">Notes</label>
              <div class="config-control">
                <textarea id="portfolio-notes" v-model="notes" />
              </div>
            </div>
          </div>
        </div>

        <div class="builder-section">
          <div class="assets-header">
            <p class="list-label">Holdings</p>
            <p class="muted">Enter tickers and target weights. Total weight must equal 100%.</p>
          </div>
          <div class="asset-grid">
            <div class="asset-grid-row asset-grid-header">
              <div>Holding</div>
              <div>Ticker</div>
              <div>Weight</div>
              <div>%</div>
            </div>
            <div v-for="(row, index) in assetRows" :key="row.label" class="asset-grid-row">
              <div class="asset-row-label">{{ row.label }}</div>
              <input v-model="assetRows[index].symbol" :placeholder="`Ticker ${index + 1}`" />
              <input v-model="assetRows[index].weight" inputmode="decimal" placeholder="0" />
              <div class="asset-suffix">%</div>
            </div>
            <div class="asset-grid-row asset-grid-total">
              <div>Total</div>
              <div class="muted">Portfolio</div>
              <div :class="{ success: totalIsBalanced, error: !totalIsBalanced && totalWeight > 0 }">
                {{ totalWeight.toFixed(2) }}
              </div>
              <div class="asset-suffix">%</div>
            </div>
          </div>
        </div>

        <div class="builder-section">
          <p class="list-label">Preview</p>
          <div>
            <span v-for="asset in parsedAssets" :key="asset.symbol" class="asset-pill">
              {{ asset.symbol }} {{ asset.weight.toFixed(0) }}%
            </span>
          </div>
        </div>

        <div class="button-row">
          <button class="primary-button" type="submit">{{ saving ? 'Saving...' : (isEditing ? 'Update portfolio' : 'Save portfolio') }}</button>
          <button class="secondary-button" type="button" @click="resetForm">Clear form</button>
        </div>
        <p v-if="formError && !error" class="muted">{{ formError }}</p>
        <p v-if="message" class="success">{{ message }}</p>
        <p v-if="error" class="error">{{ error }}</p>
      </form>

      <div class="panel library-panel">
        <h3>Portfolios</h3>
        <p class="muted">Portfolios available for analysis runs.</p>
        <p v-if="loading" class="muted">Loading portfolios...</p>
        <ul v-else-if="portfolios.length" class="list">
          <li v-for="portfolio in portfolios" :key="portfolio.id" class="portfolio-card">
            <div>
              <h3>{{ portfolio.name }}</h3>
              <p class="muted">Benchmark ticker: {{ portfolio.benchmark }}</p>
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
              <RouterLink class="secondary-link" :to="{ path: '/backtest', query: { portfolioId: portfolio.id } }">Backtest</RouterLink>
              <RouterLink class="secondary-link" :to="{ path: '/factor-regression', query: { portfolioId: portfolio.id } }">Factor regression</RouterLink>
              <RouterLink class="secondary-link" :to="{ path: '/optimization', query: { portfolioId: portfolio.id } }">Portfolio optimization</RouterLink>
            </div>
          </li>
        </ul>
        <p v-else class="muted">No portfolios yet. Create the first one here.</p>
      </div>
    </div>
  </section>
</template>
