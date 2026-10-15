import { createRouter, createWebHistory } from '@ionic/vue-router'
import TabsPage from '../views/TabsPage.vue'
import { startApp, useAppStore } from '../stores/appStore.js'

const routes = [
  { path: '/', redirect: '/tabs/dashboard' },
  { path: '/onboarding', component: () => import('../views/OnboardingPage.vue'), meta: { public: true } },
  {
    path: '/tabs/',
    component: TabsPage,
    children: [
      { path: '', redirect: '/tabs/dashboard' },
      { path: 'dashboard', component: () => import('../views/DashboardPage.vue') },
      { path: 'history', component: () => import('../views/HistoryPage.vue') },
      { path: 'trip', component: () => import('../views/TripCalculatorPage.vue') },
      { path: 'statistics', component: () => import('../views/StatisticsPage.vue') },
      { path: 'settings', component: () => import('../views/SettingsPage.vue') },
    ],
  },
  { path: '/vehicles', component: () => import('../views/VehiclesPage.vue') },
  { path: '/vehicles/new', component: () => import('../views/VehicleFormPage.vue') },
  { path: '/vehicles/:id/edit', component: () => import('../views/VehicleFormPage.vue'), props: true },
  { path: '/entries/new', component: () => import('../views/FuelEntryFormPage.vue') },
  { path: '/entries/:id/edit', component: () => import('../views/FuelEntryFormPage.vue'), props: true },
  { path: '/reminders', component: () => import('../views/RemindersPage.vue') },
  { path: '/reminders/new', component: () => import('../views/ReminderFormPage.vue') },
  { path: '/reminders/:id/edit', component: () => import('../views/ReminderFormPage.vue'), props: true },
  { path: '/trip/route', component: () => import('../views/RoutePlannerPage.vue') },
  { path: '/pro', component: () => import('../views/ProPage.vue') },
  { path: '/privacy', component: () => import('../views/PrivacyPage.vue'), meta: { public: true } },
  { path: '/:pathMatch(.*)*', redirect: '/tabs/dashboard' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// First-run onboarding gate. vue-router 5 style: return a location or true.
router.beforeEach(async (to) => {
  await startApp()
  const { state } = useAppStore()
  if (state.status !== 'ready') return true // App.vue renders the error state
  if (!state.settings.onboardingComplete && !to.meta.public) return '/onboarding'
  if (state.settings.onboardingComplete && to.path === '/onboarding') return '/tabs/dashboard'
  return true
})

export default router
