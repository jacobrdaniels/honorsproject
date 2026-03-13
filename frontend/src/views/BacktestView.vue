<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import BacktestLineChart from '../components/BacktestLineChart.vue';
import { postJson } from '../lib/api';
import { formatAllocationText, sumAllocationWeights } from '../lib/portfolio';
import { listSavedPortfolios, resolveSelectedPortfolioId } from '../lib/savedPortfolio';
import type { BacktestCoverage, BacktestRebalanceMode, BacktestRequest, BacktestResponse, SavedPortfolio } from '../types';

type DatePresetKey = 'ytd' | 'oneYear' | 'threeYears' | 'fiveYears' | 'tenYears' | 'max';
type ValueTone = 'positive' | 'negative' | 'neutral';
type BannerTone = 'info' | 'warning';

type DatePreset = {
  key: DatePresetKey;
  label: string;
  startDate: string;
  endDate: string;
};

type SummaryMetric = {
  label: string;
  value: string;
  tone: ValueTone;
  helper?: string;
};

type OverviewStat = {
  label: string;
  value: string;
  helper?: string;
};

type ResultBanner = {
  title: string;
  text: string;
  tone: BannerTone;
};

type HighlightChip = {
  label: string;
  tone: ValueTone;
};

const route = useRoute();
const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const rebalanceOptions: Array<{ value: BacktestRebalanceMode; label: string }> = [
  { value: 'none', label: 'No rebalance' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
];
const DEFAULT_MAX_START_DATE = '2018-01-01';

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const integerFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

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
    case 'ytd':
      return { startDate: `${anchorDate.slice(0, 4)}-01-01`, endDate: anchorDate };
    case 'oneYear':
      return { startDate: subtractYears(anchorDate, 1), endDate: anchorDate };
    case 'threeYears':
      return { startDate: subtractYears(anchorDate, 3), endDate: anchorDate };
    case 'fiveYears':
      return { startDate: subtractYears(anchorDate, 5), endDate: anchorDate };
    case 'tenYears':
      return { startDate: subtractYears(anchorDate, 10), endDate: anchorDate };
    case 'max':
      return { startDate: DEFAULT_MAX_START_DATE, endDate: anchorDate };
  }
}

function formatPercent(value: number | null, digits = 2, includePlus = false): string {
  if (value === null) {
    return '—';
  }

  const prefix = includePlus && value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(digits)}%`;
}

function formatCurrency(value: number | null): string {
  return value === null ? '—' : currencyFormatter.format(value);
}

function formatNumber(value: number | null, digits = 2, includePlus = false): string {
  if (value === null) {
    return '—';
  }

  const prefix = includePlus && value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(digits)}`;
}

function formatCount(value: number | null): string {
  return value === null ? '—' : integerFormatter.format(value);
}

function getValueTone(value: number | null): ValueTone {
  if (value === null || value === 0) {
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

function getHeatmapClass(value: number | null): string {
  if (value === null) {
    return 'backtest-heatmap-empty';
  }

  if (value >= 6) {
    return 'backtest-heatmap-strong-positive';
  }

  if (value >= 0) {
    return 'backtest-heatmap-positive';
  }

  if (value <= -6) {
    return 'backtest-heatmap-strong-negative';
  }

  return 'backtest-heatmap-negative';
}

function formatCoverageStatus(status: BacktestCoverage['benchmarkStatus']): string {
  if (status === 'full') {
    return 'Full coverage';
  }

  if (status === 'partial') {
    return 'Partial coverage';
  }

  return 'Missing coverage';
}

const todayIso = toIsoDate(new Date());
const defaultRange = getPresetRange('fiveYears', todayIso);
const datePresets: DatePreset[] = [
  { key: 'ytd', label: 'YTD', ...getPresetRange('ytd', todayIso) },
  { key: 'oneYear', label: '1Y', ...getPresetRange('oneYear', todayIso) },
  { key: 'threeYears', label: '3Y', ...getPresetRange('threeYears', todayIso) },
  { key: 'fiveYears', label: '5Y', ...getPresetRange('fiveYears', todayIso) },
  { key: 'tenYears', label: '10Y', ...getPresetRange('tenYears', todayIso) },
  { key: 'max', label: 'Max', ...getPresetRange('max', todayIso) },
];
const resetPreset = datePresets.find((preset) => preset.key === 'fiveYears') ?? datePresets[0];

const portfolios = ref<SavedPortfolio[]>([]);
const selectedPortfolioId = ref('');
const benchmark = ref('');
const startDate = ref(defaultRange.startDate);
const endDate = ref(defaultRange.endDate);
const rebalanceMode = ref<BacktestRebalanceMode>('none');
const result = ref<BacktestResponse | null>(null);
const error = ref('');
const loading = ref(false);

const selectedPortfolio = computed(() =>
  portfolios.value.find((portfolio) => portfolio.id === selectedPortfolioId.value) ?? null,
);
const totalWeight = computed(() => selectedPortfolio.value ? sumAllocationWeights(selectedPortfolio.value.assets) : 0);
const normalizedBenchmark = computed(() => benchmark.value.trim().toUpperCase());
const resultRebalanceLabel = computed(() => (
  rebalanceOptions.find((option) => option.value === result.value?.rebalanceMode)?.label ?? 'No rebalance'
));
const requestedWindowChanged = computed(() => (
  result.value
  && (result.value.coverage.requestedStartDate !== result.value.startDate || result.value.coverage.requestedEndDate !== result.value.endDate)
));
const benchmarkDifference = computed(() => (
  result.value?.benchmarkSummary
    ? result.value.summary.totalReturn - result.value.benchmarkSummary.totalReturn
    : null
));
const runDisabled = computed(() => Boolean(formError.value) || loading.value);

const formError = computed(() => {
  if (!selectedPortfolio.value) {
    return 'Create or select a saved portfolio first.';
  }

  if (!startDate.value || !endDate.value) {
    return 'Select both a start and end date.';
  }

  if (startDate.value > endDate.value) {
    return 'Start date must be before the end date.';
  }

  if (!normalizedBenchmark.value) {
    return 'Enter a benchmark ticker.';
  }

  return '';
});

const resultBanners = computed<ResultBanner[]>(() => {
  if (!result.value) {
    return [];
  }

  const banners: ResultBanner[] = [];

  if (requestedWindowChanged.value) {
    banners.push({
      tone: 'warning',
      title: 'Window trimmed',
      text: `Shared history set the usable range to ${result.value.startDate} through ${result.value.endDate}.`,
    });
  }

  banners.push({
    tone: 'info',
    title: 'Benchmark aligned',
    text: `${result.value.benchmark} has ${formatCoverageStatus(result.value.coverage.benchmarkStatus).toLowerCase()} across ${formatCount(result.value.coverage.benchmarkTradingDays)} trading days.`,
  });

  return banners;
});

const resultHighlights = computed<HighlightChip[]>(() => {
  if (!result.value) {
    return [];
  }

  return [
    {
      label: formatCoverageStatus(result.value.coverage.benchmarkStatus),
      tone: result.value.coverage.benchmarkStatus === 'full' ? 'positive' : 'neutral',
    },
    {
      label: `${formatCount(result.value.coverage.tradingDays)} aligned days`,
      tone: 'neutral',
    },
    {
      label: resultRebalanceLabel.value,
      tone: 'neutral',
    },
    {
      label: `${result.value.portfolio.length} holdings`,
      tone: 'neutral',
    },
  ];
});

const summaryMetrics = computed<SummaryMetric[]>(() => {
  if (!result.value) {
    return [];
  }

  return [
    {
      label: 'Total return',
      value: formatPercent(result.value.summary.totalReturn, 2, true),
      tone: getValueTone(result.value.summary.totalReturn),
      helper: benchmarkDifference.value === null ? 'Portfolio result' : `Excess vs benchmark ${formatPercent(benchmarkDifference.value, 2, true)}`,
    },
    {
      label: 'CAGR',
      value: formatPercent(result.value.summary.cagr, 2, true),
      tone: getValueTone(result.value.summary.cagr),
    },
    {
      label: 'Sharpe',
      value: formatNumber(result.value.summary.sharpe, 2, true),
      tone: getValueTone(result.value.summary.sharpe),
    },
    {
      label: 'Volatility',
      value: formatPercent(result.value.summary.volatility),
      tone: 'neutral',
    },
    {
      label: 'Max drawdown',
      value: formatPercent(result.value.summary.maxDrawdown),
      tone: getValueTone(result.value.summary.maxDrawdown),
    },
    {
      label: 'Ending value',
      value: formatCurrency(result.value.summary.endingValue),
      tone: 'neutral',
    },
  ];
});

const overviewStats = computed<OverviewStat[]>(() => {
  if (!result.value) {
    return [];
  }

  return [
    {
      label: 'Effective window',
      value: `${result.value.startDate} to ${result.value.endDate}`,
      helper: `Requested ${result.value.coverage.requestedStartDate} to ${result.value.coverage.requestedEndDate}`,
    },
    {
      label: 'Benchmark',
      value: result.value.benchmark,
      helper: `${formatCoverageStatus(result.value.coverage.benchmarkStatus)} • ${formatCount(result.value.coverage.benchmarkTradingDays)} days`,
    },
    {
      label: 'Rebalancing',
      value: resultRebalanceLabel.value,
      helper: 'Applied across the aligned date range.',
    },
    {
      label: 'Best / worst year',
      value: `${formatPercent(result.value.summary.bestYear, 2, true)} / ${formatPercent(result.value.summary.worstYear, 2, true)}`,
      helper: 'Calendar-period annual returns.',
    },
  ];
});

const relativeMetrics = computed<SummaryMetric[]>(() => {
  if (!result.value) {
    return [];
  }

  return [
    {
      label: 'Excess return',
      value: formatPercent(result.value.benchmarkRelative.excessReturn, 2, true),
      tone: getValueTone(result.value.benchmarkRelative.excessReturn),
    },
    {
      label: 'Tracking error',
      value: formatPercent(result.value.benchmarkRelative.trackingError),
      tone: 'neutral',
    },
    {
      label: 'Information ratio',
      value: formatNumber(result.value.benchmarkRelative.informationRatio, 2, true),
      tone: getValueTone(result.value.benchmarkRelative.informationRatio),
    },
    {
      label: 'Beta',
      value: formatNumber(result.value.benchmarkRelative.beta),
      tone: 'neutral',
    },
    {
      label: 'Alpha',
      value: formatPercent(result.value.benchmarkRelative.alpha, 2, true),
      tone: getValueTone(result.value.benchmarkRelative.alpha),
    },
    {
      label: 'Upside capture',
      value: formatPercent(result.value.benchmarkRelative.upsideCapture),
      tone: 'neutral',
    },
    {
      label: 'Downside capture',
      value: formatPercent(result.value.benchmarkRelative.downsideCapture),
      tone: 'neutral',
    },
  ];
});

const equityChartLabels = computed(() => result.value?.equityCurve.map((point) => point.period) ?? []);
const equityPortfolioValues = computed(() => result.value?.equityCurve.map((point) => point.portfolio) ?? []);
const equityBenchmarkValues = computed(() => result.value?.equityCurve.map((point) => point.benchmark) ?? []);
const drawdownPortfolioValues = computed(() => result.value?.drawdownCurve.map((point) => point.portfolio) ?? []);
const drawdownBenchmarkValues = computed(() => result.value?.drawdownCurve.map((point) => point.benchmark) ?? []);

function syncBenchmarkFromSelection() {
  if (selectedPortfolio.value) {
    benchmark.value = selectedPortfolio.value.benchmark;
  }
}

function applyDatePreset(preset: DatePreset) {
  startDate.value = preset.startDate;
  endDate.value = preset.endDate;
}

function isActiveDatePreset(preset: DatePreset): boolean {
  return startDate.value === preset.startDate && endDate.value === preset.endDate;
}

async function loadPortfolios() {
  try {
    portfolios.value = await listSavedPortfolios();
    selectedPortfolioId.value = resolveSelectedPortfolioId(portfolios.value, route.query, selectedPortfolioId.value);
    syncBenchmarkFromSelection();
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to load saved portfolios';
  }
}

async function runBacktest() {
  const validationMessage = formError.value;

  if (validationMessage || !selectedPortfolio.value) {
    error.value = validationMessage || 'Select a saved portfolio first.';
    return;
  }

  loading.value = true;
  error.value = '';
  result.value = null;

  try {
    const payload: BacktestRequest = {
      benchmark: normalizedBenchmark.value,
      allocations: formatAllocationText(selectedPortfolio.value.assets),
      startDate: startDate.value,
      endDate: endDate.value,
      rebalanceMode: rebalanceMode.value,
    };

    result.value = await postJson<BacktestResponse>('/api/analysis/backtest', payload);
  } catch (requestError) {
    result.value = null;
    error.value = requestError instanceof Error ? requestError.message : 'Unable to run backtest';
  } finally {
    loading.value = false;
  }
}

watch(() => route.query.portfolioId, () => {
  selectedPortfolioId.value = resolveSelectedPortfolioId(portfolios.value, route.query, selectedPortfolioId.value);
  syncBenchmarkFromSelection();
}, { immediate: true });

watch(selectedPortfolioId, () => {
  syncBenchmarkFromSelection();
});

void loadPortfolios();
</script>

<template>
  <section class="page">
    <div class="page-header">
      <div>
        <h2>Backtest portfolio</h2>
        <p class="muted">Run an interactive backtest with quicker date controls, clearer sections, and more readable performance tables.</p>
      </div>
    </div>

    <div class="grid-2 backtest-layout">
      <form class="panel backtest-form-panel" @submit.prevent="runBacktest">
        <div class="backtest-form-header">
          <div>
            <h3>Run setup</h3>
            <p class="muted">Choose a saved portfolio, tighten the window, and rerun with a different benchmark or rebalance cadence.</p>
          </div>
        </div>

        <div v-if="portfolios.length" class="mode-form-grid">
          <label>
            Premade portfolio
            <select v-model="selectedPortfolioId">
              <option v-for="portfolio in portfolios" :key="portfolio.id" :value="portfolio.id">
                {{ portfolio.name }}
              </option>
            </select>
          </label>
          <div v-if="selectedPortfolio" class="mode-summary">
            <p class="list-label">Selected benchmark</p>
            <p>{{ selectedPortfolio.benchmark }}</p>
            <p class="muted">Holdings: {{ selectedPortfolio.assets.length }} | Total weight: {{ totalWeight.toFixed(2) }}%</p>
          </div>
        </div>

        <div class="grid-2">
          <label>
            Benchmark override
            <input v-model="benchmark" type="text" placeholder="SPY" />
          </label>
          <label>
            Rebalance
            <select v-model="rebalanceMode">
              <option v-for="option in rebalanceOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
        </div>

        <div class="backtest-date-panel">
          <div class="backtest-date-header">
            <div>
              <p class="metric-label">Date range</p>
              <p class="muted">Use presets for quick comparisons or enter an exact window.</p>
            </div>
            <div class="backtest-date-presets">
              <button
                v-for="preset in datePresets"
                :key="preset.key"
                class="backtest-date-preset"
                :class="{ active: isActiveDatePreset(preset) }"
                type="button"
                @click="applyDatePreset(preset)"
              >
                {{ preset.label }}
              </button>
            </div>
          </div>

          <div class="grid-2">
            <label>
              Start date
              <input v-model="startDate" :max="endDate" type="date" />
            </label>
            <label>
              End date
              <input v-model="endDate" :max="todayIso" :min="startDate" type="date" />
            </label>
          </div>
        </div>

        <div v-if="selectedPortfolio" class="backtest-holdings-preview">
          <p class="metric-label">Holdings preview</p>
          <div class="backtest-chip-row">
            <span v-for="asset in selectedPortfolio.assets" :key="asset.symbol" class="asset-pill">
              {{ asset.symbol }} {{ asset.weight.toFixed(0) }}%
            </span>
          </div>
        </div>

        <div class="button-row">
          <button class="primary-button" :disabled="runDisabled" type="submit">
            {{ loading ? 'Running...' : 'Run backtest' }}
          </button>
          <button class="secondary-button" type="button" @click="applyDatePreset(resetPreset)">
            Reset to 5Y
          </button>
        </div>

        <p v-if="formError && !error" class="muted">{{ formError }}</p>
        <p v-if="!portfolios.length" class="muted">
          No premade portfolios yet.
          <RouterLink class="secondary-link inline-link" to="/saved-portfolios">Build one on the saved portfolios page</RouterLink>
        </p>
      </form>

      <div class="backtest-results-stack">
        <div v-if="error" class="panel backtest-empty-state">
          <h3>Backtest results</h3>
          <p class="error">{{ error }}</p>
        </div>

        <div v-else-if="loading" class="panel backtest-empty-state">
          <h3>Running backtest</h3>
          <p class="muted">Fetching aligned price history, computing returns, and preparing interactive charts.</p>
        </div>

        <template v-else-if="result">
          <div class="backtest-banner-stack" v-if="resultBanners.length">
            <div
              v-for="banner in resultBanners"
              :key="banner.title"
              class="backtest-banner"
              :class="`backtest-banner-${banner.tone}`"
            >
              <p class="metric-label">{{ banner.title }}</p>
              <p>{{ banner.text }}</p>
            </div>
          </div>

          <section class="panel backtest-section">
            <div class="backtest-section-heading">
              <div>
                <h3>Overview</h3>
                <p class="muted">Headline performance and the run settings that produced it.</p>
              </div>
              <div class="backtest-chip-row">
                <span
                  v-for="chip in resultHighlights"
                  :key="chip.label"
                  class="backtest-highlight-chip"
                  :class="toneClass(chip.tone)"
                >
                  {{ chip.label }}
                </span>
              </div>
            </div>

            <div class="backtest-metrics-grid">
              <div v-for="metric in summaryMetrics" :key="metric.label" class="result-card backtest-metric-card">
                <p class="metric-label">{{ metric.label }}</p>
                <div class="metric numeric-text" :class="toneClass(metric.tone)">{{ metric.value }}</div>
                <p v-if="metric.helper" class="muted backtest-card-helper">{{ metric.helper }}</p>
              </div>
            </div>

            <div class="backtest-overview-grid">
              <div v-for="stat in overviewStats" :key="stat.label" class="backtest-overview-card">
                <p class="metric-label">{{ stat.label }}</p>
                <p class="backtest-overview-value">{{ stat.value }}</p>
                <p v-if="stat.helper" class="muted">{{ stat.helper }}</p>
              </div>
            </div>
          </section>

          <section class="panel backtest-section">
            <div class="backtest-section-heading">
              <div>
                <h3>Charts</h3>
                <p class="muted">Hover any point for exact values. The benchmark line now breaks cleanly when data is missing.</p>
              </div>
            </div>

            <div class="grid-2">
              <div class="backtest-chart-card">
                <div class="backtest-panel-header">
                  <div>
                    <h3>Equity curve</h3>
                    <p class="muted">Growth of an initial $10,000 for the portfolio and benchmark.</p>
                  </div>
                </div>
                <BacktestLineChart
                  :benchmark-values="equityBenchmarkValues"
                  :labels="equityChartLabels"
                  :portfolio-values="equityPortfolioValues"
                  benchmark-label="Benchmark"
                  portfolio-label="Portfolio"
                  value-kind="currency"
                />
              </div>

              <div class="backtest-chart-card">
                <div class="backtest-panel-header">
                  <div>
                    <h3>Drawdown curve</h3>
                    <p class="muted">Underwater performance over the same aligned history window.</p>
                  </div>
                </div>
                <BacktestLineChart
                  :benchmark-values="drawdownBenchmarkValues"
                  :labels="equityChartLabels"
                  :portfolio-values="drawdownPortfolioValues"
                  benchmark-label="Benchmark"
                  portfolio-label="Portfolio"
                  value-kind="percent"
                />
              </div>
            </div>

            <div class="backtest-metrics-grid backtest-relative-grid">
              <div v-for="metric in relativeMetrics" :key="metric.label" class="result-card backtest-metric-card">
                <p class="metric-label">{{ metric.label }}</p>
                <div class="metric numeric-text" :class="toneClass(metric.tone)">{{ metric.value }}</div>
              </div>
            </div>
          </section>

          <section class="panel backtest-section">
            <div class="backtest-section-heading">
              <div>
                <h3>Returns</h3>
                <p class="muted">Calendar returns with consistent signs, aligned decimals, and heatmap cues.</p>
              </div>
              <div class="backtest-heatmap-legend">
                <span class="backtest-legend-pill backtest-heatmap-positive">Positive</span>
                <span class="backtest-legend-pill backtest-heatmap-strong-positive">Strong positive</span>
                <span class="backtest-legend-pill backtest-heatmap-negative">Negative</span>
                <span class="backtest-legend-pill backtest-heatmap-strong-negative">Strong negative</span>
              </div>
            </div>

            <div class="backtest-table-wrap">
              <table class="backtest-table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Portfolio</th>
                    <th>Benchmark</th>
                    <th>Excess</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in result.annualReturns" :key="row.year">
                    <td>{{ row.year }}</td>
                    <td class="numeric-text" :class="toneClass(getValueTone(row.portfolio))">
                      {{ formatPercent(row.portfolio, 2, true) }}
                    </td>
                    <td class="numeric-text" :class="toneClass(getValueTone(row.benchmark))">
                      {{ formatPercent(row.benchmark, 2, true) }}
                    </td>
                    <td class="numeric-text" :class="toneClass(getValueTone(row.benchmark === null ? null : row.portfolio - row.benchmark))">
                      {{ formatPercent(row.benchmark === null ? null : row.portfolio - row.benchmark, 2, true) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="backtest-table-wrap">
              <table class="backtest-table backtest-monthly-table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th v-for="month in monthLabels" :key="month">{{ month }}</th>
                    <th>Portfolio total</th>
                    <th>Benchmark total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in result.monthlyReturns" :key="row.year">
                    <td>{{ row.year }}</td>
                    <td
                      v-for="(value, index) in row.portfolio"
                      :key="`${row.year}-${monthLabels[index]}`"
                      :class="['backtest-heatmap-cell', 'numeric-text', getHeatmapClass(value)]"
                    >
                      {{ formatPercent(value, 2, true) }}
                    </td>
                    <td class="numeric-text" :class="toneClass(getValueTone(row.portfolioTotal))">
                      {{ formatPercent(row.portfolioTotal, 2, true) }}
                    </td>
                    <td class="numeric-text" :class="toneClass(getValueTone(row.benchmarkTotal))">
                      {{ formatPercent(row.benchmarkTotal, 2, true) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="panel backtest-section">
            <div class="backtest-section-heading">
              <div>
                <h3>Holdings</h3>
                <p class="muted">Holding-level performance over the same aligned window as the main backtest.</p>
              </div>
            </div>

            <div class="backtest-table-wrap">
              <table class="backtest-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Target weight</th>
                    <th>Total return</th>
                    <th>CAGR</th>
                    <th>Volatility</th>
                    <th>Max drawdown</th>
                    <th>Ending value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="asset in result.assetBreakdown" :key="asset.symbol">
                    <td>{{ asset.symbol }}</td>
                    <td class="numeric-text">{{ formatPercent(asset.weight) }}</td>
                    <td class="numeric-text" :class="toneClass(getValueTone(asset.totalReturn))">
                      {{ formatPercent(asset.totalReturn, 2, true) }}
                    </td>
                    <td class="numeric-text" :class="toneClass(getValueTone(asset.cagr))">
                      {{ formatPercent(asset.cagr, 2, true) }}
                    </td>
                    <td class="numeric-text">{{ formatPercent(asset.volatility) }}</td>
                    <td class="numeric-text" :class="toneClass(getValueTone(asset.maxDrawdown))">
                      {{ formatPercent(asset.maxDrawdown) }}
                    </td>
                    <td class="numeric-text">{{ formatCurrency(asset.endingValue) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <details class="backtest-notes-details">
              <summary>Detailed engine notes</summary>
              <ul class="list muted">
                <li v-for="note in result.notes" :key="note">{{ note }}</li>
              </ul>
            </details>
          </section>
        </template>

        <div v-else class="panel backtest-empty-state">
          <h3>Backtest results</h3>
          <p class="muted">Run a saved portfolio against stored market data to populate the dashboard with charts, returns, and holding-level stats.</p>
        </div>
      </div>
    </div>
  </section>
</template>
