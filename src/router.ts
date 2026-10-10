import { createRouter, createWebHistory } from 'vue-router'
import { useSettingsStore } from './stores/settings'
import TodayView from './views/TodayView.vue'

declare module 'vue-router' {
  interface RouteMeta {
    tab?: 'today' | 'train' | 'progress' | 'settings'
    /** Full-screen route without the tab bar. */
    bare?: boolean
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'today', component: TodayView, meta: { tab: 'today' } },
    { path: '/train', name: 'train', component: () => import('./views/TrainView.vue'), meta: { tab: 'train' } },
    {
      path: '/train/custom/:id?',
      name: 'builder',
      component: () => import('./views/BuilderView.vue'),
      meta: { tab: 'train' },
    },
    { path: '/progress', name: 'progress', component: () => import('./views/ProgressView.vue'), meta: { tab: 'progress' } },
    {
      path: '/progress/session/:id',
      name: 'session-detail',
      component: () => import('./views/SessionDetailView.vue'),
      meta: { tab: 'progress' },
    },
    { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue'), meta: { tab: 'settings' } },
    { path: '/settings/about', name: 'about', component: () => import('./views/AboutView.vue'), meta: { tab: 'settings' } },
    { path: '/player', name: 'player', component: () => import('./views/PlayerView.vue'), meta: { bare: true } },
    { path: '/onboarding', name: 'onboarding', component: () => import('./views/OnboardingView.vue'), meta: { bare: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const { settings } = useSettingsStore()
  if (!settings.onboardingDone && to.name !== 'onboarding') return { name: 'onboarding' }
  if (settings.onboardingDone && to.name === 'onboarding') return { name: 'today' }
})
