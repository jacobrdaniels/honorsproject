<script setup lang="ts">
import {
  Chart as ChartJS,
  CategoryScale,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
  type ScatterDataPoint,
} from 'chart.js';
import { computed } from 'vue';
import { Scatter } from 'vue-chartjs';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

type LabeledPoint = ScatterDataPoint & { label?: string };

const props = defineProps<{
  cloud: Array<{ volatility: number; expectedReturn: number }>;
  frontier: Array<{ volatility: number; expectedReturn: number }>;
  assets: Array<{ symbol: string; volatility: number; expectedReturn: number }>;
  markers: Array<{
    id: 'minVariance' | 'maxSharpe' | 'selected';
    label: string;
    volatility: number;
    expectedReturn: number;
  }>;
}>();

const markerColors: Record<'minVariance' | 'maxSharpe' | 'selected', string> = {
  minVariance: '#0f766e',
  maxSharpe: '#b7791f',
  selected: '#c2413d',
};

const chartData = computed<ChartData<'scatter'>>(() => {
  const frontierPoints: LabeledPoint[] = props.frontier.map((point) => ({
    x: point.volatility,
    y: point.expectedReturn,
  }));
  const cloudPoints: LabeledPoint[] = props.cloud.map((point) => ({
    x: point.volatility,
    y: point.expectedReturn,
  }));
  const assetPoints: LabeledPoint[] = props.assets.map((asset) => ({
    x: asset.volatility,
    y: asset.expectedReturn,
    label: asset.symbol,
  }));

  const markerDatasets = props.markers.map((marker) => ({
    type: 'scatter' as const,
    label: marker.label,
    data: [{ x: marker.volatility, y: marker.expectedReturn, label: marker.label } as LabeledPoint],
    backgroundColor: markerColors[marker.id],
    borderColor: markerColors[marker.id],
    pointRadius: 7,
    pointHoverRadius: 9,
    pointStyle: marker.id === 'selected' ? 'rectRot' : 'triangle',
    showLine: false,
  }));

  return {
    datasets: [
      {
        type: 'scatter' as const,
        label: 'Random portfolios',
        data: cloudPoints,
        backgroundColor: 'rgba(37, 99, 235, 0.16)',
        borderColor: 'rgba(37, 99, 235, 0.28)',
        pointRadius: 2,
        pointHoverRadius: 4,
        showLine: false,
      },
      {
        type: 'scatter' as const,
        label: 'Efficient frontier',
        data: frontierPoints,
        backgroundColor: '#2563eb',
        borderColor: '#2563eb',
        pointRadius: 3,
        pointHoverRadius: 5,
        showLine: true,
        tension: 0.18,
        borderWidth: 2,
      },
      {
        type: 'scatter' as const,
        label: 'Individual holdings',
        data: assetPoints,
        backgroundColor: '#334155',
        borderColor: '#334155',
        pointRadius: 5,
        pointHoverRadius: 7,
        pointStyle: 'circle',
        showLine: false,
      },
      ...markerDatasets,
    ],
  };
});

const chartOptions = computed<ChartOptions<'scatter'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top',
      align: 'start',
      labels: {
        color: '#334155',
        usePointStyle: true,
        boxWidth: 10,
        padding: 14,
      },
    },
    tooltip: {
      backgroundColor: 'rgba(23, 32, 51, 0.96)',
      borderColor: 'rgba(203, 213, 225, 0.45)',
      borderWidth: 1,
      titleColor: '#ffffff',
      bodyColor: '#e2e8f0',
      padding: 12,
      callbacks: {
        title: (items) => {
          const first = items[0];
          if (!first) {
            return '';
          }
          const raw = first.raw as LabeledPoint | undefined;
          return raw?.label ? `${first.dataset.label} — ${raw.label}` : (first.dataset.label ?? '');
        },
        label: (context) => {
          const point = context.raw as ScatterDataPoint;
          return `Volatility ${point.x.toFixed(2)}% | Return ${point.y.toFixed(2)}%`;
        },
      },
    },
  },
  scales: {
    x: {
      type: 'linear',
      title: {
        display: true,
        text: 'Annualized volatility (%)',
        color: '#64748b',
      },
      grid: { color: 'rgba(203, 213, 225, 0.62)' },
      ticks: {
        color: '#64748b',
        callback: (value) => `${Number(value).toFixed(1)}%`,
      },
    },
    y: {
      type: 'linear',
      title: {
        display: true,
        text: 'Annualized expected return (%)',
        color: '#64748b',
      },
      grid: { color: 'rgba(203, 213, 225, 0.62)' },
      ticks: {
        color: '#64748b',
        callback: (value) => `${Number(value).toFixed(1)}%`,
      },
    },
  },
}));
</script>

<template>
  <div class="optimization-chart-canvas">
    <Scatter :data="chartData" :options="chartOptions" />
  </div>
</template>

<style scoped>
.optimization-chart-canvas {
  height: 380px;
}
</style>
