import { createRouter, createWebHistory } from 'vue-router';

import DashboardView from '../views/DashboardView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardView },
  ],
  scrollBehavior() {
    return { top: 0 };
  },
});

export default router;
