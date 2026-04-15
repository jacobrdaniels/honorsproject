<script setup lang="ts">
import { RouterLink } from 'vue-router';

const featureCards = [
  {
    title: 'Backtest saved models',
    description: 'Run historical performance analysis using one of your premade portfolios and its saved benchmark ticker.',
    to: '/backtest',
    action: 'Open backtest',
  },
  {
    title: 'Run factor regression',
    description: 'Analyze factor exposures from a premade portfolio without rebuilding the ticker list in each mode.',
    to: '/factor-regression',
    action: 'Open regression',
  },
  {
    title: 'Optimize and explore the frontier',
    description: 'Use a saved portfolio as the universe, then plot the long-only efficient frontier and pick the max-Sharpe, min-variance, or target-return mix.',
    to: '/optimization',
    action: 'Open optimizer',
  },
  {
    title: 'Build saved portfolios',
    description: 'Use the portfolio builder page to define benchmark tickers and reusable allocations for every mode.',
    to: '/saved-portfolios',
    action: 'Open portfolio builder',
  },
  {
    title: 'One source of truth',
    description: 'Portfolio design happens in one place, while every analysis page stays focused on mode-specific settings.',
    to: '/saved-portfolios',
    action: 'Start with builder',
  },
];
</script>

<template>
  <section class="page">
    <div class="page-header">
      <div>
        <h2>Project dashboard</h2>
        <p class="muted">
          Build a portfolio once on the saved portfolios page, then choose that premade model inside each analysis workflow.
        </p>
      </div>
      <div class="panel">
        <p class="list-label">Workflow</p>
        <ul class="list">
          <li>Design a premade portfolio</li>
          <li>Save its benchmark ticker</li>
          <li>Select it in backtest</li>
          <li>Select it in factor regression</li>
          <li>Select it in optimization</li>
        </ul>
      </div>
    </div>

    <div class="grid-3">
      <RouterLink v-for="card in featureCards" :key="card.title" :to="card.to" class="feature-card feature-link">
        <h3>{{ card.title }}</h3>
        <p class="muted">{{ card.description }}</p>
        <span class="feature-action">{{ card.action }}</span>
      </RouterLink>
    </div>
  </section>
</template>
