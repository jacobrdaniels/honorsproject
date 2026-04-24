<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import OptimizationScatterChart from '../components/OptimizationScatterChart.vue';
import { postJson } from '../lib/api';
import { createOptimizationPortfolioText } from '../lib/portfolio';
import { listSavedPortfolios, resolveSelectedPortfolioId } from '../lib/savedPortfolio';
import type {
  OptimizationObjective,
  OptimizationPoint,
  OptimizationRequest,
  OptimizationResponse,
  SavedPortfolio,
} from '../types';

type DatePresetKey = 'oneYear' | 'threeYears' | 'fiveYears' | 'tenYears' | 'max';
type ValueTone = 'positive' | 'negative' | 'neutral';

type DatePreset = {
  key: DatePresetKey;
  label: string;
  startDate: string;
  endDate: string;
};

type ObjectiveOption = {
  value: OptimizationObjective;
  label: string;
  helper: string;
};

type SummaryMetric = {
  label: string;
  value: string;
  tone: ValueTone;
  helper?: string;
};

const MAX_HISTORY_START_DATE = '1900-01-01';

const objectiveOptions: ObjectiveOption[] = [
  {
    value: 'max_sharpe',
    label: 'Max Sharpe',
    helper: 'Pick the sampled portfolio with the highest reward per unit of volatility.',
  },
  {
    value: 'min_variance',
    label: 'Min Variance',
    helper: 'Pick the sampled portfolio with the lowest annualized volatility.',
  },
  {
    value: 'target_return',
    label: 'Target Return',
    helper: 'Find the lowest-volatility sample whose expected return hits the target.',
  },
];

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function subtractYears(anchorDate: string, years: number): string {
  const date = new Date(`${anchorDate}T00:00:00`);
  date.setFullYear(date.getFullYear() - years);
  return toIsoDate(date);
}

function getPresetRange(key: DatePresetKey, anchorDate: string): { startDate: string; endDate: string } {
  switch (key) {
    case 'oneYear':
      return { startDate: subtractYears(anchorDate, 1), endDate: anchorDate };
    case 'threeYears':
      return { startDate: subtractYears(anchorDate, 3), endDate: anchorDate };
    case 'fiveYears':
      return { startDate: subtractYears(anchorDate, 5), endDate: anchorDate };
    case 'tenYears':
      return { startDate: subtractYears(anchorDate, 10), endDate: anchorDate };
    case 'max':
      return { startDate: MAX_HISTORY_START_DATE, endDate: anchorDate };
  }
}

function formatPercent(value: number | null, digits = 2, includePlus = false): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }

  const prefix = includePlus && value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(digits)}%`;
}

function formatNumber(value: number | null, digits = 2, includePlus = false): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }

  const prefix = includePlus && value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(digits)}`;
}

function formatWindow(startDate: string, endDate: string): string {
  return `${startDate} to ${endDate}`;
}

function getValueTone(value: number | null): ValueTone {
  if (value === null || !Number.isFinite(value) || value === 0) {
    return 'neutral';
  }

  return value > 0 ? 'positive' : 'negative';
}

function toneClass(tone: ValueTone): string {
  if (tone === 'positive') {
    return 'value-positive';
  }

  if (tone === 'negative') {
    return 'value-negative';
  }

  return 'value-neutral';
}

function getRiskFreeSourceLabel(source: OptimizationResponse['coverage']['riskFreeSource']): string {
  if (source === 'factor_returns') {
    return 'From imported Ken French risk-free rate (annualized average over the window).';
  }

  if (source === 'override') {
    return 'From the risk-free rate you entered.';
  }

  return 'No Ken French data in the window, so the risk-free rate fell back to 0%.';
}

const route = useRoute();
const todayIso = toIsoDate(new Date());
const defaultRange = getPresetRange('fiveYears', todayIso);
const datePresets: DatePreset[] = [
  { key: 'oneYear', label: '1Y', ...getPresetRange('oneYear', todayIso) },
  { key: 'threeYears', label: '3Y', ...getPresetRange('threeYears', todayIso) },
  { key: 'fiveYears', label: '5Y', ...getPresetRange('fiveYears', todayIso) },
  { key: 'tenYears', label: '10Y', ...getPresetRange('tenYears', todayIso) },
  { key: 'max', label: 'Max', ...getPresetRange('max', todayIso) },
];
const resetPreset = datePresets.find((preset) => preset.key === 'fiveYears') ?? datePresets[0];

const portfolios = ref<SavedPortfolio[]>([]);
const selectedPortfolioId = ref('');
const objective = ref<OptimizationObjective>('max_sharpe');
const startDate = ref(defaultRange.startDate);
const endDate = ref(defaultRange.endDate);
const targetReturn = ref('8');
const riskFreeOverride = ref('');
const result = ref<OptimizationResponse | null>(null);
const error = ref('');
const loading = ref(false);

const selectedPortfolio = computed(() =>
  portfolios.value.find((portfolio) => portfolio.id === selectedPortfolioId.value) ?? null,
);

const activeObjective = computed(() => (
  objectiveOptions.find((option) => option.value === objective.value) ?? objectiveOptions[0]
));

const formError = computed(() => {
  if (!selectedPortfolio.value) {
    return 'Create or select a portfolio first.';
  }

  if (selectedPortfolio.value.assets.length < 2) {
    return 'The selected portfolio must have at least two holdings.';
  }

  if (!startDate.value || !endDate.value) {
    return 'Select both a start and end date.';
  }

  if (startDate.value > endDate.value) {
    return 'Start date must be before the end date.';
  }

  if (objective.value === 'target_return') {
    const parsed = Number(targetReturn.value);

    if (!Number.isFinite(parsed)) {
      return 'Target return must be a number (in percent).';
    }
  }

  if (riskFreeOverride.value.trim() !== '' && !Number.isFinite(Number(riskFreeOverride.value))) {
    return 'Risk-free rate must be a number (in percent).';
  }

  return '';
});

const runDisabled = computed(() => Boolean(formError.value) || loading.value);

const objectiveLabelFor = (value: OptimizationObjective): string => (
  objectiveOptions.find((option) => option.value === value)?.label ?? value
);

const selectedPointLabel = computed(() => {
  if (!result.value) {
    return '';
  }

  if (result.value.objective === 'target_return' && result.value.targetReturn !== null) {
    return `Target Return (${result.value.targetReturn.toFixed(2)}%)`;
  }

  return objectiveLabelFor(result.value.objective);
});

const summaryMetrics = computed<SummaryMetric[]>(() => {
  if (!result.value) {
    return [];
  }

  const selected = result.value.selected;

  return [
    {
      label: 'Selected expected return',
      value: formatPercent(selected.expectedReturn, 2, true),
      tone: getValueTone(selected.expectedReturn),
    },
    {
      label: 'Selected volatility',
      value: formatPercent(selected.volatility, 2),
      tone: 'neutral',
    },
    {
      label: 'Selected Sharpe',
      value: formatNumber(selected.sharpe, 3, true),
      tone: getValueTone(selected.sharpe),
    },
    {
      label: 'Max-Sharpe Sharpe',
      value: formatNumber(result.value.maxSharpe.sharpe, 3, true),
      tone: getValueTone(result.value.maxSharpe.sharpe),
      helper: `Return ${formatPercent(result.value.maxSharpe.expectedReturn, 2, true)} · vol ${formatPercent(result.value.maxSharpe.volatility, 2)}`,
    },
    {
      label: 'Min-variance volatility',
      value: formatPercent(result.value.minVariance.volatility, 2),
      tone: 'neutral',
      helper: `Return ${formatPercent(result.value.minVariance.expectedReturn, 2, true)}`,
    },
    {
      label: 'Risk-free rate',
      value: formatPercent(result.value.riskFreeRate, 2),
      tone: 'neutral',
      helper: getRiskFreeSourceLabel(result.value.coverage.riskFreeSource),
    },
  ];
});

const scatterMarkers = computed(() => {
  if (!result.value) {
    return [];
  }

  return [
    {
      id: 'minVariance' as const,
      label: 'Min variance',
      volatility: result.value.minVariance.volatility,
      expectedReturn: result.value.minVariance.expectedReturn,
    },
    {
      id: 'maxSharpe' as const,
      label: 'Max Sharpe',
      volatility: result.value.maxSharpe.volatility,
      expectedReturn: result.value.maxSharpe.expectedReturn,
    },
    {
      id: 'selected' as const,
      label: `Selected · ${selectedPointLabel.value}`,
      volatility: result.value.selected.volatility,
      expectedReturn: result.value.selected.expectedReturn,
    },
  ];
});

const scatterAssets = computed(() => (
  result.value?.assets.map((asset) => ({
    symbol: asset.symbol,
    volatility: asset.volatility,
    expectedReturn: asset.expectedReturn,
  })) ?? []
));

const scatterFrontier = computed(() => (
  result.value?.frontier.map((point) => ({
    volatility: point.volatility,
    expectedReturn: point.expectedReturn,
  })) ?? []
));

const comparisonRows = computed(() => {
  if (!result.value) {
    return [];
  }

  return [
    { key: 'Min variance', point: result.value.minVariance },
    { key: 'Max Sharpe', point: result.value.maxSharpe },
    { key: `Selected · ${selectedPointLabel.value}`, point: result.value.selected },
  ];
});

async function loadPortfolios() {
  try {
    portfolios.value = await listSavedPortfolios();
    selectedPortfolioId.value = resolveSelectedPortfolioId(portfolios.value, route.query, selectedPortfolioId.value);
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to load portfolios';
  }
}

function applyDatePreset(preset: DatePreset) {
  startDate.value = preset.startDate;
  endDate.value = preset.endDate;
}

function resetWindow() {
  if (!resetPreset) {
    return;
  }

  applyDatePreset(resetPreset);
}

async function runOptimization() {
  if (formError.value || !selectedPortfolio.value) {
    error.value = formError.value || 'Select a portfolio first.';
    return;
  }

  const payload: OptimizationRequest = {
    universe: createOptimizationPortfolioText(selectedPortfolio.value),
    startDate: startDate.value,
    endDate: endDate.value,
    objective: objective.value,
    targetReturn: objective.value === 'target_return' ? Number(targetReturn.value) : undefined,
    riskFreeRate: riskFreeOverride.value.trim() !== '' ? Number(riskFreeOverride.value) : undefined,
  };

  loading.value = true;
  error.value = '';

  try {
    result.value = await postJson<OptimizationResponse>('/api/analysis/optimize', payload);
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to run optimization';
  } finally {
    loading.value = false;
  }
}

function formatWeights(point: OptimizationPoint): string {
  return point.weights
    .filter((asset) => asset.weight >= 0.5)
    .map((asset) => `${asset.symbol} ${asset.weight.toFixed(1)}%`)
    .join(' · ');
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
        <p class="muted">
          Select a portfolio, objective, date range, and risk-free rate input.
        </p>
      </div>
    </div>

    <div class="grid-2 backtest-layout">
      <form class="panel backtest-form-panel" @submit.prevent="runOptimization">
        <div class="backtest-form-header">
          <label>
            Portfolio
            <select v-model="selectedPortfolioId">
              <option v-for="portfolio in portfolios" :key="portfolio.id" :value="portfolio.id">
                {{ portfolio.name }}
              </option>
            </select>
          </label>

          <label>
            Objective
            <select v-model="objective">
              <option v-for="option in objectiveOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>

          <p class="muted">{{ activeObjective?.helper }}</p>

          <label v-if="objective === 'target_return'">
            Target return (annualized %)
            <input v-model="targetReturn" inputmode="decimal" />
          </label>

          <label>
            Risk-free rate override (annualized %, optional)
            <input v-model="riskFreeOverride" inputmode="decimal" placeholder="Leave blank to use Ken French RF" />
          </label>

          <div v-if="selectedPortfolio" class="mode-summary">
            <p class="list-label">Portfolio tickers</p>
            <div>
              <span v-for="asset in selectedPortfolio.assets" :key="asset.symbol" class="asset-pill">
                {{ asset.symbol }}
              </span>
            </div>
            <p class="muted">
              The optimizer uses these tickers and solves a new long-only allocation.
            </p>
          </div>

          <div class="backtest-date-panel">
            <div class="backtest-date-header">
              <div>
                <p class="metric-label">Date range</p>
                <h3>Choose an estimation window</h3>
              </div>
              <p class="muted">Longer windows produce more stable mean and covariance estimates.</p>
            </div>

            <div class="backtest-date-presets">
              <button
                v-for="preset in datePresets"
                :key="preset.key"
                class="secondary-button backtest-date-preset"
                :class="{ active: startDate === preset.startDate && endDate === preset.endDate }"
                type="button"
                @click="applyDatePreset(preset)"
              >
                {{ preset.label }}
              </button>
            </div>

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
          </div>
        </div>

        <div class="button-row">
          <button class="primary-button" :disabled="runDisabled" type="submit">
            {{ loading ? 'Optimizing...' : 'Run optimization' }}
          </button>
          <button class="secondary-button" type="button" @click="resetWindow">Reset to 5Y</button>
        </div>

        <p v-if="formError && !error" class="muted">{{ formError }}</p>
        <p v-if="!portfolios.length" class="muted">
          No portfolios yet.
          <RouterLink class="secondary-link inline-link" to="/saved-portfolios">Create portfolio</RouterLink>
        </p>
      </form>

      <div v-if="error" class="panel backtest-empty-state">
        <h3>Portfolio optimization output</h3>
        <p class="error">{{ error }}</p>
        <p class="muted">
          Make sure every portfolio ticker has stored price history for the selected window. Run
          <code class="inline-code">npm run market:import --workspace backend -- TICKER ...</code> if needed.
        </p>
      </div>

      <div v-else-if="loading" class="panel backtest-empty-state">
        <h3>Portfolio optimization output</h3>
        <p class="muted">Estimating mean returns and covariance, then sampling the long-only simplex...</p>
      </div>

      <div v-else-if="result" class="backtest-results-stack">
        <section class="panel backtest-section">
          <div class="backtest-section-heading">
            <div>
              <p class="metric-label">Selected portfolio</p>
              <h3>{{ selectedPointLabel }}</h3>
              <p class="muted">
                Estimated over {{ result.coverage.tradingDays }} trading days ({{ formatWindow(result.startDate, result.endDate) }}).
              </p>
            </div>
            <div class="backtest-chip-row">
              <span class="backtest-highlight-chip value-neutral">{{ result.assets.length }} holdings</span>
              <span class="backtest-highlight-chip value-neutral">{{ result.frontier.length }} frontier points</span>
              <span class="backtest-highlight-chip value-neutral">{{ result.samplePoints.length }} sampled portfolios shown</span>
            </div>
          </div>

          <div class="backtest-metrics-grid">
            <div v-for="metric in summaryMetrics" :key="metric.label" class="result-card backtest-metric-card">
              <p class="metric-label">{{ metric.label }}</p>
              <div class="metric numeric-text" :class="toneClass(metric.tone)">{{ metric.value }}</div>
              <p v-if="metric.helper" class="muted backtest-card-helper">{{ metric.helper }}</p>
            </div>
          </div>
        </section>

        <section class="panel backtest-section">
          <div class="backtest-panel-header">
            <div>
              <p class="metric-label">Efficient frontier</p>
              <h3>Risk vs expected return</h3>
            </div>
            <p class="muted">
              The cloud is random long-only portfolios sampled from the simplex; the line is the lowest-variance
              sample per return bin. Markers show min-variance, max-Sharpe, and your selected point.
            </p>
          </div>
          <OptimizationScatterChart
            :cloud="result.samplePoints"
            :frontier="scatterFrontier"
            :assets="scatterAssets"
            :markers="scatterMarkers"
          />
        </section>

        <section class="panel backtest-section">
          <div class="backtest-panel-header">
            <div>
              <p class="metric-label">Allocation</p>
              <h3>Selected portfolio weights</h3>
            </div>
            <p class="muted">Weights sum to 100% and are clipped to greater than or equal to 0% (long-only).</p>
          </div>
          <div class="backtest-table-wrap">
            <table class="backtest-table backtest-compact-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Selected weight</th>
                  <th>Min-variance weight</th>
                  <th>Max-Sharpe weight</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="asset in result.assets" :key="asset.symbol">
                  <td>{{ asset.symbol }}</td>
                  <td class="numeric-text">
                    {{ formatPercent(result.selected.weights.find((weight) => weight.symbol === asset.symbol)?.weight ?? 0, 2) }}
                  </td>
                  <td class="numeric-text">
                    {{ formatPercent(result.minVariance.weights.find((weight) => weight.symbol === asset.symbol)?.weight ?? 0, 2) }}
                  </td>
                  <td class="numeric-text">
                    {{ formatPercent(result.maxSharpe.weights.find((weight) => weight.symbol === asset.symbol)?.weight ?? 0, 2) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel backtest-section">
          <div class="backtest-panel-header">
            <div>
              <p class="metric-label">Key portfolios</p>
              <h3>Comparison</h3>
            </div>
            <p class="muted">A quick summary of the three reference portfolios side by side.</p>
          </div>
          <div class="backtest-table-wrap">
            <table class="backtest-table">
              <thead>
                <tr>
                  <th>Portfolio</th>
                  <th>Expected return</th>
                  <th>Volatility</th>
                  <th>Sharpe</th>
                  <th>Top weights</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in comparisonRows" :key="row.key">
                  <td>{{ row.key }}</td>
                  <td class="numeric-text">{{ formatPercent(row.point.expectedReturn, 2, true) }}</td>
                  <td class="numeric-text">{{ formatPercent(row.point.volatility, 2) }}</td>
                  <td class="numeric-text">{{ formatNumber(row.point.sharpe, 3, true) }}</td>
                  <td>{{ formatWeights(row.point) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel backtest-section">
          <div class="backtest-panel-header">
            <div>
              <p class="metric-label">Portfolio context</p>
              <h3>Per-holding annualized statistics</h3>
            </div>
            <p class="muted">Raw inputs to the optimizer: arithmetic mean return times 252 and daily standard deviation times the square root of 252.</p>
          </div>
          <div class="backtest-table-wrap">
            <table class="backtest-table backtest-compact-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Expected return</th>
                  <th>Volatility</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="asset in result.assets" :key="asset.symbol">
                  <td>{{ asset.symbol }}</td>
                  <td class="numeric-text">{{ formatPercent(asset.expectedReturn, 2, true) }}</td>
                  <td class="numeric-text">{{ formatPercent(asset.volatility, 2) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <details class="backtest-notes-details">
            <summary>Engine notes and assumptions</summary>
            <ul class="list muted">
              <li v-for="note in result.notes" :key="note">{{ note }}</li>
            </ul>
          </details>
        </section>
      </div>

      <div v-else class="panel backtest-empty-state">
        <h3>Portfolio optimization output</h3>
        <p class="muted">Results appear after the run completes.</p>
      </div>
    </div>
  </section>
</template>
