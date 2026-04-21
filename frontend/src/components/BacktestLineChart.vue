<script setup lang="ts">
import {
  Chart as ChartJS,
  CategoryScale,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { computed } from 'vue';
import { Line } from 'vue-chartjs';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

type ChartValueKind = 'currency' | 'percent' | 'number';

const props = withDefaults(defineProps<{
  labels: string[];
  portfolioValues: Array<number | null>;
  benchmarkValues?: Array<number | null>;
  portfolioLabel?: string;
  benchmarkLabel?: string;
  valueKind?: ChartValueKind;
}>(), {
  benchmarkValues: () => [],
  portfolioLabel: 'Portfolio',
  benchmarkLabel: 'Benchmark',
  valueKind: 'currency',
});

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatChartValue(value: number, kind: ChartValueKind): string {
  if (kind === 'percent') {
    return `${value.toFixed(2)}%`;
  }

  if (kind === 'number') {
    return value.toFixed(2);
  }

  return currencyFormatter.format(value);
}

function formatAxisLabel(label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    return label;
  }

  const parsedDate = new Date(`${label}T00:00:00`);

  return parsedDate.toLocaleDateString(undefined, {
    month: 'short',
    year: '2-digit',
  });
}

const hasBenchmarkSeries = computed(() => props.benchmarkValues.some((value) => value !== null));

const chartData = computed<ChartData<'line'>>(() => ({
  labels: props.labels,
  datasets: [
    {
      label: props.portfolioLabel,
      data: props.portfolioValues,
      borderColor: '#78a8ff',
      backgroundColor: 'rgba(120, 168, 255, 0.12)',
      fill: false,
      tension: 0.24,
      pointRadius: 0,
      pointHoverRadius: 4,
      pointHitRadius: 16,
      borderWidth: 2.5,
      spanGaps: false,
    },
    ...(hasBenchmarkSeries.value
      ? [{
        label: props.benchmarkLabel,
        data: props.benchmarkValues,
        borderColor: '#9a86ff',
        backgroundColor: 'rgba(154, 134, 255, 0.1)',
        fill: false,
        tension: 0.24,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHitRadius: 16,
        borderWidth: 2.5,
        spanGaps: false,
      }]
      : []),
  ],
}));

const chartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index',
    intersect: false,
  },
  plugins: {
    legend: {
      position: 'top',
      align: 'start',
      labels: {
        color: '#dce8f9',
        usePointStyle: true,
        pointStyle: 'line',
        boxWidth: 18,
        boxHeight: 3,
        padding: 18,
      },
    },
    tooltip: {
      backgroundColor: 'rgba(7, 17, 31, 0.96)',
      borderColor: 'rgba(146, 174, 221, 0.18)',
      borderWidth: 1,
      titleColor: '#eff5ff',
      bodyColor: '#dce8f9',
      padding: 12,
      callbacks: {
        title: (items) => props.labels[items[0]?.dataIndex ?? 0] ?? '',
        label: (context) => {
          const value = context.parsed.y;
          return `${context.dataset.label}: ${formatChartValue(value, props.valueKind)}`;
        },
      },
    },
  },
  scales: {
    x: {
      grid: {
        display: false,
      },
      ticks: {
        color: '#9fb0c8',
        maxTicksLimit: 6,
        autoSkip: true,
        callback: (_, index) => formatAxisLabel(props.labels[index] ?? ''),
      },
    },
    y: {
      grid: {
        color: 'rgba(146, 174, 221, 0.12)',
      },
      ticks: {
        color: '#9fb0c8',
        callback: (value) => formatChartValue(Number(value), props.valueKind),
      },
    },
  },
}));
</script>

<template>
  <div class="backtest-chart-canvas">
    <Line :data="chartData" :options="chartOptions" />
  </div>
</template>

<style scoped>
.backtest-chart-canvas {
  height: 300px;
}
</style>
