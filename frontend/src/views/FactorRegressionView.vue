<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import BacktestLineChart from '../components/BacktestLineChart.vue';
import { postJson } from '../lib/api';
import { formatAllocationText, getAllocationValidationMessage, sumAllocationWeights } from '../lib/portfolio';
import { listSavedPortfolios, resolveSelectedPortfolioId } from '../lib/savedPortfolio';
import type {
  BacktestRebalanceMode,
  FactorColumnKey,
  FactorFrequency,
  FactorRegressionCoefficient,
  FactorRequest,
  FactorResponse,
  SavedPortfolio,
} from '../types';

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
const rebalanceOptions: Array<{ value: BacktestRebalanceMode; label: string }> = [
  { value: 'none', label: 'No rebalance' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
];
const regressionMethodLabel = 'OLS';
const DEFAULT_MAX_START_DATE = '2018-01-01';

const FACTOR_DISPLAY_NAMES: Record<FactorColumnKey, string> = {
  marketExcess: 'MKT-RF',
  smb: 'SMB',
  hml: 'HML',
  momentum: 'MOM',
  rmw: 'RMW',
  cma: 'CMA',
};

const FACTOR_DESCRIPTIONS: Record<FactorColumnKey, string> = {
  marketExcess: 'Market excess return',
  smb: 'Small minus big (size)',
  hml: 'High minus low (value)',
  momentum: 'Momentum',
  rmw: 'Robust minus weak (profitability)',
  cma: 'Conservative minus aggressive (investment)',
};

const FREQUENCY_FACTORS: Record<FactorFrequency, FactorColumnKey[]> = {
  daily: ['marketExcess', 'smb', 'hml', 'momentum', 'rmw', 'cma'],
  weekly: ['marketExcess', 'smb', 'hml'],
  monthly: ['marketExcess', 'smb', 'hml', 'momentum'],
};

const FREQUENCY_OPTIONS: Array<{ value: FactorFrequency; label: string }> = [
  { value: 'daily', label: 'Daily (6 factors)' },
  { value: 'weekly', label: 'Weekly (3 factors)' },
  { value: 'monthly', label: 'Monthly (4 factors)' },
];

const FREQUENCY_META: Record<FactorFrequency, { periodLabel: string; periodLabelPlural: string; periodsPerYear: number; rollingWindow: number; periodSuffix: string }> = {
  daily: { periodLabel: 'day', periodLabelPlural: 'daily observations', periodsPerYear: 252, rollingWindow: 60, periodSuffix: 'daily' },
  weekly: { periodLabel: 'week', periodLabelPlural: 'weekly observations', periodsPerYear: 52, rollingWindow: 26, periodSuffix: 'weekly' },
  monthly: { periodLabel: 'month', periodLabelPlural: 'monthly observations', periodsPerYear: 12, rollingWindow: 24, periodSuffix: 'monthly' },
};

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

function formatWindow(startDate: string, endDate: string): string {
  return `${startDate} to ${endDate}`;
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

function getCoverageStatusLabel(status: FactorResponse['coverage']['factorStatus']): string {
  if (status === 'full') {
    return 'Full factor alignment';
  }

  if (status === 'partial') {
    return 'Partial factor alignment';
  }

  return 'Missing factor alignment';
}

function getSignificanceLabel(significance: FactorRegressionCoefficient['significance']): string {
  if (significance === 'high') {
    return 'High';
  }

  if (significance === 'moderate') {
    return 'Moderate';
  }

  if (significance === 'limited') {
    return 'Limited';
  }

  return 'Insufficient';
}

function getSignificanceClass(significance: FactorRegressionCoefficient['significance']): string {
  if (significance === 'high') {
    return 'factor-significance-high';
  }

  if (significance === 'moderate') {
    return 'factor-significance-moderate';
  }

  if (significance === 'limited') {
    return 'factor-significance-limited';
  }

  return 'factor-significance-insufficient';
}

function formatCoefficientEstimate(row: FactorRegressionCoefficient): string {
  if (row.name === 'Alpha') {
    return formatPercent(row.exposure * 100, 4, true);
  }

  return formatNumber(row.exposure, 3, true);
}

function formatStandardError(row: FactorRegressionCoefficient): string {
  if (row.standardError === null) {
    return '—';
  }

  if (row.name === 'Alpha') {
    return formatPercent(row.standardError * 100, 4);
  }

  return formatNumber(row.standardError, 4);
}

function getCoefficientDisplayName(row: FactorRegressionCoefficient): string {
  if (row.name !== 'Alpha') {
    return row.name;
  }
  const meta = resultFrequencyMeta.value;
  return meta ? `Alpha (${meta.periodLabel}ly)` : 'Alpha';
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
const frequency = ref<FactorFrequency>('daily');
const selectedFactorKeys = ref<FactorColumnKey[]>([...FREQUENCY_FACTORS.daily]);
const startDate = ref(defaultRange.startDate);
const endDate = ref(defaultRange.endDate);
const rebalanceMode = ref<BacktestRebalanceMode>('none');
const result = ref<FactorResponse | null>(null);
const error = ref('');
const loading = ref(false);

const availableFactors = computed(() => FREQUENCY_FACTORS[frequency.value]);
const factorSetLabel = computed(() => {
  const names = availableFactors.value.map((key) => FACTOR_DISPLAY_NAMES[key]).join(', ');
  return `Ken French ${frequency.value} factors (${names})`;
});
const resultFrequencyMeta = computed(() => (result.value ? FREQUENCY_META[result.value.frequency] : null));
const resultFrequencyLabel = computed(() => {
  if (!result.value) {
    return '';
  }
  const names = result.value.selectedFactors.map((key) => FACTOR_DISPLAY_NAMES[key]).join(', ');
  return `${result.value.frequency.charAt(0).toUpperCase()}${result.value.frequency.slice(1)} regression: ${names}`;
});

function toggleFactor(key: FactorColumnKey) {
  const existingIndex = selectedFactorKeys.value.indexOf(key);
  if (existingIndex >= 0) {
    selectedFactorKeys.value = selectedFactorKeys.value.filter((factor) => factor !== key);
    return;
  }
  selectedFactorKeys.value = [...selectedFactorKeys.value, key];
}

watch(frequency, (nextFrequency) => {
  const available = FREQUENCY_FACTORS[nextFrequency];
  const retained = selectedFactorKeys.value.filter((key) => available.includes(key));
  selectedFactorKeys.value = retained.length > 0 ? retained : [...available];
});

const selectedPortfolio = computed(() =>
  portfolios.value.find((portfolio) => portfolio.id === selectedPortfolioId.value) ?? null,
);
const totalWeight = computed(() => selectedPortfolio.value ? sumAllocationWeights(selectedPortfolio.value.assets) : 0);
const resultRebalanceLabel = computed(() => (
  rebalanceOptions.find((option) => option.value === result.value?.rebalanceMode)?.label ?? 'No rebalance'
));
const runDisabled = computed(() => Boolean(formError.value) || loading.value);
const requestedWindowChanged = computed(() => (
  result.value
  && (result.value.coverage.requestedStartDate !== result.value.startDate || result.value.coverage.requestedEndDate !== result.value.endDate)
));

const formError = computed(() => {
  if (!selectedPortfolio.value) {
    return 'Create or select a saved portfolio first.';
  }

  const allocationMessage = getAllocationValidationMessage(selectedPortfolio.value.assets);

  if (allocationMessage) {
    return allocationMessage;
  }

  if (!startDate.value || !endDate.value) {
    return 'Select both a start and end date.';
  }

  if (startDate.value > endDate.value) {
    return 'Start date must be before the end date.';
  }

  if (selectedFactorKeys.value.length === 0) {
    return 'Select at least one factor to regress against.';
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
      text: `Aligned price and factor history reduced the usable regression window to ${result.value.startDate} through ${result.value.endDate}.`,
    });
  }

  banners.push({
    tone: 'info',
    title: 'Factor coverage',
    text: `${getCoverageStatusLabel(result.value.coverage.factorStatus)} across ${formatCount(result.value.coverage.regressionObservations)} observations.`,
  });

  if (!result.value.rolling.length) {
    banners.push({
      tone: 'info',
      title: 'Rolling diagnostics unavailable',
      text: 'A longer aligned window is required before trailing market beta diagnostics appear.',
    });
  }

  return banners;
});

const resultHighlights = computed<HighlightChip[]>(() => {
  if (!result.value) {
    return [];
  }

  const frequencyLabel = result.value.frequency.charAt(0).toUpperCase() + result.value.frequency.slice(1);
  const factorNames = result.value.selectedFactors.map((key) => FACTOR_DISPLAY_NAMES[key]).join(', ');
  const hasRolling = result.value.rolling.length > 0;

  return [
    { label: `${frequencyLabel} frequency`, tone: 'neutral' },
    { label: factorNames, tone: 'neutral' },
    { label: `${result.value.portfolio.length} holdings`, tone: 'neutral' },
    { label: hasRolling ? 'Rolling beta ready' : 'Static diagnostics only', tone: hasRolling ? 'positive' : 'neutral' },
    { label: resultRebalanceLabel.value, tone: 'neutral' },
  ];
});

const summaryMetrics = computed<SummaryMetric[]>(() => {
  if (!result.value) {
    return [];
  }

  const meta = resultFrequencyMeta.value;
  const alphaHelper = meta
    ? `${meta.periodLabel.charAt(0).toUpperCase()}${meta.periodLabel.slice(1)} intercept scaled by ${meta.periodsPerYear} periods per year`
    : undefined;

  return [
    {
      label: 'Annualized alpha',
      value: formatPercent(result.value.summary.annualizedAlpha, 2, true),
      tone: getValueTone(result.value.summary.annualizedAlpha),
      helper: alphaHelper,
    },
    {
      label: 'R-squared',
      value: formatNumber(result.value.summary.rSquared, 3),
      tone: 'neutral',
    },
    {
      label: 'Adj. R-squared',
      value: formatNumber(result.value.summary.adjustedRSquared, 3),
      tone: 'neutral',
    },
    {
      label: 'Observations',
      value: formatCount(result.value.summary.observations),
      tone: 'neutral',
    },
    {
      label: 'Portfolio CAGR',
      value: formatPercent(result.value.summary.portfolioCagr, 2, true),
      tone: getValueTone(result.value.summary.portfolioCagr),
    },
    {
      label: 'Residual volatility',
      value: formatPercent(result.value.summary.residualVolatility, 2),
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
      label: 'Requested window',
      value: formatWindow(result.value.coverage.requestedStartDate, result.value.coverage.requestedEndDate),
    },
    {
      label: 'Effective window',
      value: formatWindow(result.value.startDate, result.value.endDate),
      helper: `${formatCount(result.value.coverage.regressionObservations)} regression observations`,
    },
    {
      label: 'Annualized excess return',
      value: formatPercent(result.value.summary.annualizedExcessReturn, 2, true),
    },
    {
      label: 'Portfolio volatility',
      value: formatPercent(result.value.summary.portfolioVolatility, 2),
    },
    {
      label: 'Price trading days',
      value: formatCount(result.value.coverage.priceTradingDays),
      helper: `${result.value.coverage.priceStartDate} to ${result.value.coverage.priceEndDate}`,
    },
    {
      label: 'Factor rows loaded',
      value: formatCount(result.value.coverage.factorTradingDays),
      helper: result.value.coverage.factorStartDate && result.value.coverage.factorEndDate
        ? `${result.value.coverage.factorStartDate} to ${result.value.coverage.factorEndDate}`
        : 'No factor rows available',
    },
  ];
});

async function loadPortfolios() {
  try {
    portfolios.value = await listSavedPortfolios();
    selectedPortfolioId.value = resolveSelectedPortfolioId(portfolios.value, route.query, selectedPortfolioId.value);
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to load saved portfolios';
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

async function runAnalysis() {
  const validationMessage = formError.value;

  if (validationMessage || !selectedPortfolio.value) {
    error.value = validationMessage || 'Select a saved portfolio first.';
    return;
  }

  const payload: FactorRequest = {
    allocations: formatAllocationText(selectedPortfolio.value.assets),
    startDate: startDate.value,
    endDate: endDate.value,
    rebalanceMode: rebalanceMode.value,
    method: 'OLS',
    frequency: frequency.value,
    factors: [...selectedFactorKeys.value],
  };

  loading.value = true;
  error.value = '';

  try {
    result.value = await postJson<FactorResponse>('/api/analysis/factors', payload);
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to run factor regression';
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
        <h2>Factor regression</h2>
        <p class="muted">
          Run an OLS factor regression on a saved portfolio using stored market prices and imported Ken French factor returns. Choose the factor frequency (daily, weekly, or monthly) and the exact mix of factors to regress against.
        </p>
      </div>
    </div>

    <div class="grid-2 backtest-layout">
      <form class="panel backtest-form-panel" @submit.prevent="runAnalysis">
        <div class="backtest-form-header">
          <label>
            Premade portfolio
            <select v-model="selectedPortfolioId">
              <option v-for="portfolio in portfolios" :key="portfolio.id" :value="portfolio.id">
                {{ portfolio.name }}
              </option>
            </select>
          </label>

          <div class="grid-2">
            <label>
              Factor frequency
              <select v-model="frequency">
                <option v-for="option in FREQUENCY_OPTIONS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>

            <label>
              Portfolio rebalance
              <select v-model="rebalanceMode">
                <option v-for="option in rebalanceOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>
          </div>

          <div class="mode-summary">
            <div>
              <p class="list-label">Factors to regress against</p>
              <p class="muted" style="margin: 0 0 0.5rem;">
                Check the factors you want included. Daily exposes 6 factors, monthly 4, weekly 3.
              </p>
              <div class="factor-checkbox-grid">
                <label v-for="factorKey in availableFactors" :key="factorKey" class="factor-checkbox">
                  <input
                    type="checkbox"
                    :checked="selectedFactorKeys.includes(factorKey)"
                    @change="toggleFactor(factorKey)"
                  >
                  <span class="factor-checkbox-label">
                    <span class="factor-checkbox-name">{{ FACTOR_DISPLAY_NAMES[factorKey] }}</span>
                    <span class="factor-checkbox-desc muted">{{ FACTOR_DESCRIPTIONS[factorKey] }}</span>
                  </span>
                </label>
              </div>
            </div>

            <div class="factor-summary-row">
              <div>
                <p class="list-label">Regression method</p>
                <p class="factor-static-value">{{ regressionMethodLabel }}</p>
              </div>
              <div>
                <p class="list-label">Factor data</p>
                <p class="factor-static-value">{{ factorSetLabel }}</p>
              </div>
            </div>

            <template v-if="selectedPortfolio">
              <p class="list-label">Portfolio allocations</p>
              <div>
                <span v-for="asset in selectedPortfolio.assets" :key="asset.symbol" class="asset-pill">
                  {{ asset.symbol }} <span class="muted">{{ formatPercent(asset.weight, 2) }}</span>
                </span>
              </div>
              <p class="muted">
                Benchmark context: {{ selectedPortfolio.benchmark }} | Total weight: {{ formatPercent(totalWeight, 2) }}
              </p>
            </template>
          </div>

          <div class="backtest-date-panel">
            <div class="backtest-date-header">
              <div>
                <p class="metric-label">Date range</p>
                <h3>Choose a regression window</h3>
              </div>
              <p class="muted">Short windows can fail if there are not enough aligned factor observations.</p>
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
                <input v-model="startDate" type="date">
              </label>
              <label>
                End date
                <input v-model="endDate" type="date">
              </label>
            </div>
          </div>
        </div>

        <div class="button-row">
          <button class="primary-button" :disabled="runDisabled" type="submit">
            {{ loading ? 'Running...' : 'Run regression' }}
          </button>
          <button class="secondary-button" type="button" @click="resetWindow">
            Reset to 5Y
          </button>
        </div>

        <p v-if="formError && !error" class="muted">{{ formError }}</p>
        <p v-if="!portfolios.length" class="muted">
          No premade portfolios yet.
          <RouterLink class="secondary-link inline-link" to="/saved-portfolios">Build one on the saved portfolios page</RouterLink>
        </p>
      </form>

      <div v-if="error" class="panel backtest-empty-state">
        <h3>Regression output</h3>
        <p class="error">{{ error }}</p>
        <p class="muted">Try a longer date range or make sure the selected holdings and factor data have been imported locally.</p>
      </div>

      <div v-else-if="loading" class="panel backtest-empty-state">
        <h3>Regression output</h3>
        <p class="muted">Building the portfolio return series and aligning it with factor data...</p>
      </div>

      <div v-else-if="result" class="backtest-results-stack">
        <div class="backtest-banner-stack">
          <div
            v-for="banner in resultBanners"
            :key="banner.title"
            class="backtest-banner"
            :class="banner.tone === 'warning' ? 'backtest-banner-warning' : 'backtest-banner-info'"
          >
            <p class="metric-label">{{ banner.title }}</p>
            <p>{{ banner.text }}</p>
          </div>
        </div>

        <section class="panel backtest-section">
          <div class="backtest-section-heading">
            <div>
              <p class="metric-label">Regression overview</p>
              <h3>{{ resultFrequencyLabel }}</h3>
              <p class="muted">Saved portfolio weights are regressed against the selected Ken French factors at {{ result.frequency }} frequency.</p>
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
              <p class="backtest-overview-value numeric-text">{{ stat.value }}</p>
              <p v-if="stat.helper" class="muted">{{ stat.helper }}</p>
            </div>
          </div>
        </section>

        <section class="panel backtest-section">
          <div class="backtest-panel-header">
            <div>
              <p class="metric-label">Charts</p>
              <h3>Model fit diagnostics</h3>
            </div>
            <p class="muted">Compare realized returns with the model-implied path and inspect residual behavior over time.</p>
          </div>

          <div class="grid-2">
            <div class="panel backtest-chart-card">
              <div class="backtest-panel-header">
                <div>
                  <p class="metric-label">Cumulative return fit</p>
                  <h3>Actual vs model-implied</h3>
                </div>
              </div>
              <BacktestLineChart
                :labels="result.series.map((point) => point.period)"
                :portfolio-values="result.series.map((point) => point.cumulativePortfolioReturn)"
                :benchmark-values="result.series.map((point) => point.cumulativeFittedReturn)"
                portfolio-label="Actual cumulative return"
                benchmark-label="Model-implied cumulative return"
                value-kind="percent"
              />
            </div>

            <div class="panel backtest-chart-card">
              <div class="backtest-panel-header">
                <div>
                  <p class="metric-label">Residuals</p>
                  <h3>Unexplained excess return</h3>
                </div>
              </div>
              <BacktestLineChart
                :labels="result.series.map((point) => point.period)"
                :portfolio-values="result.series.map((point) => point.residual)"
                portfolio-label="Residual excess return"
                value-kind="percent"
              />
            </div>
          </div>

          <div v-if="result.rolling.length && resultFrequencyMeta" class="backtest-panel-section">
            <div class="backtest-panel-header">
              <div>
                <p class="metric-label">Rolling diagnostics</p>
                <h3>Trailing {{ resultFrequencyMeta.rollingWindow }}-{{ resultFrequencyMeta.periodLabel }} regression</h3>
              </div>
              <p class="muted">Each point is estimated from the trailing {{ resultFrequencyMeta.rollingWindow }} {{ resultFrequencyMeta.periodLabelPlural }} ending on that date.</p>
            </div>

            <div class="grid-2">
              <div class="panel backtest-chart-card">
                <div class="backtest-panel-header">
                  <div>
                    <p class="metric-label">Market beta</p>
                    <h3>Rolling MKT-RF exposure</h3>
                  </div>
                </div>
                <BacktestLineChart
                  :labels="result.rolling.map((point) => point.period)"
                  :portfolio-values="result.rolling.map((point) => point.marketBeta)"
                  portfolio-label="Rolling market beta"
                  value-kind="number"
                />
              </div>

              <div class="panel backtest-chart-card">
                <div class="backtest-panel-header">
                  <div>
                    <p class="metric-label">Annualized alpha</p>
                    <h3>Rolling intercept (x{{ resultFrequencyMeta?.periodsPerYear ?? 252 }})</h3>
                  </div>
                </div>
                <BacktestLineChart
                  :labels="result.rolling.map((point) => point.period)"
                  :portfolio-values="result.rolling.map((point) => point.annualizedAlpha)"
                  portfolio-label="Rolling annualized alpha"
                  value-kind="percent"
                />
              </div>
            </div>

            <div class="panel backtest-chart-card">
              <div class="backtest-panel-header">
                <div>
                  <p class="metric-label">Fit quality</p>
                  <h3>Rolling R-squared</h3>
                </div>
                <p class="muted">Shows how much of the portfolio's excess return the model explains over time.</p>
              </div>
              <BacktestLineChart
                :labels="result.rolling.map((point) => point.period)"
                :portfolio-values="result.rolling.map((point) => point.rSquared)"
                portfolio-label="Rolling R-squared"
                value-kind="number"
              />
            </div>
          </div>
        </section>

        <section class="panel backtest-section">
          <div class="backtest-panel-header">
            <div>
              <p class="metric-label">Coefficients</p>
              <h3>Exposure and significance</h3>
            </div>
            <p class="muted">
              Alpha is the {{ resultFrequencyMeta?.periodLabel ?? 'period' }}ly intercept from the regression; the annualized contribution column scales it by {{ resultFrequencyMeta?.periodsPerYear ?? 252 }} periods per year.
              Factor rows show unitless exposures (betas) and their annualized contribution uses the average factor return over the window.
            </p>
          </div>

          <div class="backtest-table-wrap">
            <table class="backtest-table">
              <thead>
                <tr>
                  <th>Term</th>
                  <th>Estimate</th>
                  <th>Std. error</th>
                  <th>t-stat</th>
                  <th>Significance</th>
                  <th>Ann. contribution</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in result.coefficients" :key="row.name">
                  <td>{{ getCoefficientDisplayName(row) }}</td>
                  <td class="numeric-text">{{ formatCoefficientEstimate(row) }}</td>
                  <td class="numeric-text">{{ formatStandardError(row) }}</td>
                  <td class="numeric-text">{{ formatNumber(row.tStatistic, 3, true) }}</td>
                  <td>
                    <span class="factor-significance-badge" :class="getSignificanceClass(row.significance)">
                      {{ getSignificanceLabel(row.significance) }}
                    </span>
                  </td>
                  <td class="numeric-text">{{ formatPercent(row.annualizedContribution, 2, true) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel backtest-section">
          <div class="backtest-panel-header">
            <div>
              <p class="metric-label">Attribution</p>
              <h3>Average factor return context</h3>
            </div>
            <p class="muted">This ties each exposure to the average annualized factor return observed during the regression window.</p>
          </div>

          <div class="backtest-table-wrap">
            <table class="backtest-table">
              <thead>
                <tr>
                  <th>Factor</th>
                  <th>Exposure</th>
                  <th>Avg. factor return</th>
                  <th>Ann. contribution</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="factor in result.factors" :key="factor.name">
                  <td>{{ factor.name }}</td>
                  <td class="numeric-text">{{ formatNumber(factor.exposure, 3, true) }}</td>
                  <td class="numeric-text">{{ formatPercent(factor.averageFactorReturn, 2, true) }}</td>
                  <td class="numeric-text">{{ formatPercent(factor.annualizedContribution, 2, true) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel backtest-section">
          <div class="backtest-panel-header">
            <div>
              <p class="metric-label">Portfolio context</p>
              <h3>Holdings used in the regression</h3>
            </div>
            <p class="muted">{{ result.analyzedTickers.join(', ') }}</p>
          </div>

          <div class="backtest-table-wrap">
            <table class="backtest-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Weight</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="asset in result.portfolio" :key="asset.symbol">
                  <td>{{ asset.symbol }}</td>
                  <td class="numeric-text">{{ formatPercent(asset.weight, 2) }}</td>
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
        <h3>Regression output</h3>
        <p class="muted">Run a regression to see factor exposures, diagnostics, and fit charts for the selected saved portfolio.</p>
      </div>
    </div>
  </section>
</template>
