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
  minVariance: '#7bd1a8',
  maxSharpe: '#ffd27d',
  selected: '#ff8fb8',
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
        backgroundColor: 'rgba(120, 168, 255, 0.22)',
        borderColor: 'rgba(120, 168, 255, 0.35)',
        pointRadius: 2,
        pointHoverRadius: 4,
        showLine: false,
      },
      {
        type: 'scatter' as const,
        label: 'Efficient frontier',
        data: frontierPoints,
        backgroundColor: '#4a9fff',
        borderColor: '#4a9fff',
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
        backgroundColor: '#c8d8ef',
        borderColor: '#c8d8ef',
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
        color: '#dce8f9',
        usePointStyle: true,
        boxWidth: 10,
        padding: 14,
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
        color: '#9fb0c8',
      },
      grid: { color: 'rgba(146, 174, 221, 0.12)' },
      ticks: {
        color: '#9fb0c8',
        callback: (value) => `${Number(value).toFixed(1)}%`,
      },
    },
    y: {
      type: 'linear',
      title: {
        display: true,
        text: 'Annualized expected return (%)',
        color: '#9fb0c8',
      },
      grid: { color: 'rgba(146, 174, 221, 0.12)' },
      ticks: {
        color: '#9fb0c8',
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
