<script setup lang="ts">
import { RouterLink } from 'vue-router';

const featureCards = [
  {
    title: 'Backtest portfolios',
    description: 'Compare allocations, benchmark them, and surface risk-adjusted return metrics.',
    to: '/backtest',
    action: 'Open backtest',
  },
  {
    title: 'Run factor regression',
    description: 'Inspect portfolio exposure to market, size, value, momentum, and related factors.',
    to: '/factor-regression',
    action: 'Open regression',
  },
  {
    title: 'Explore the efficient frontier',
    description: 'Visualize risk and return trade-offs before choosing a target allocation.',
    to: '/efficient-frontier',
    action: 'Open frontier',
  },
  {
    title: 'Optimize allocations',
    description: 'Start from guardrails and let the API propose a portfolio mix for the selected objective.',
    to: '/optimization',
    action: 'Open optimizer',
  },
  {
    title: 'Save scenarios',
    description: 'Store portfolio ideas locally so they can be revisited quickly during analysis.',
    to: '/saved-portfolios',
    action: 'Open saved portfolios',
  },
  {
    title: 'Iterate quickly',
    description: 'The scaffold keeps route boundaries and API shapes in place for later real analytics logic.',
    to: '/saved-portfolios',
    action: 'Start with saved scenarios',
  },
];
</script>

<template>
  <section class="page">
    <div class="page-header">
      <div>
        <h2>Project dashboard</h2>
        <p class="muted">
          This base project mirrors the main analysis workflows you outlined in the honors project proposal.
        </p>
      </div>
      <div class="panel">
        <p class="list-label">Initial scope</p>
        <ul class="list">
          <li>Backtest portfolio</li>
          <li>Factor regression</li>
          <li>Efficient frontier</li>
          <li>Portfolio optimization</li>
          <li>Saved portfolio information</li>
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
