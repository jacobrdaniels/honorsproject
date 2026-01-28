import { createRouter, createWebHistory } from 'vue-router';

import BacktestView from '../views/BacktestView.vue';
import DashboardView from '../views/DashboardView.vue';
import EfficientFrontierView from '../views/EfficientFrontierView.vue';
import FactorRegressionView from '../views/FactorRegressionView.vue';
import PortfolioOptimizationView from '../views/PortfolioOptimizationView.vue';
import SavedPortfoliosView from '../views/SavedPortfoliosView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardView },
    { path: '/backtest', name: 'backtest', component: BacktestView },
    { path: '/factor-regression', name: 'factor-regression', component: FactorRegressionView },
    { path: '/efficient-frontier', name: 'efficient-frontier', component: EfficientFrontierView },
    { path: '/optimization', name: 'optimization', component: PortfolioOptimizationView },
    { path: '/saved-portfolios', name: 'saved-portfolios', component: SavedPortfoliosView },
  ],
  scrollBehavior() {
    return { top: 0 };
  },
});

export default router;
