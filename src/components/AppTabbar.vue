<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

const { t } = useI18n()
const route = useRoute()

const tabs = [
  { name: 'today', to: '/', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2' },
  { name: 'train', to: '/train', icon: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z' },
  { name: 'progress', to: '/progress', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { name: 'settings', to: '/settings', icon: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 4v6M8 14v6' },
] as const
</script>

<template>
  <nav class="weui-tabbar app-tabbar">
    <RouterLink
      v-for="tab in tabs"
      :key="tab.name"
      :to="tab.to"
      class="weui-tabbar__item"
      :class="{ 'weui-bar__item_on': route.meta.tab === tab.name }"
      :aria-current="route.meta.tab === tab.name ? 'page' : undefined"
    >
      <svg class="weui-tabbar__icon tab-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path :d="tab.icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <p class="weui-tabbar__label">{{ t(`tabs.${tab.name}`) }}</p>
    </RouterLink>
  </nav>
</template>
