<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div class="page">
    <article class="weui-article about">
      <h1 class="page__title">{{ t('about.title') }}</h1>
      <section>
        <h2>{{ t('about.findTitle') }}</h2>
        <p>{{ t('about.find') }}</p>
      </section>
      <section>
        <h2>{{ t('about.techniqueTitle') }}</h2>
        <ul>
          <li>{{ t('about.technique1') }}</li>
          <li>{{ t('about.technique2') }}</li>
          <li>{{ t('about.technique3') }}</li>
          <li>{{ t('about.technique4') }}</li>
        </ul>
      </section>
      <section>
        <h2>{{ t('about.safetyTitle') }}</h2>
        <p>{{ t('about.safety') }}</p>
      </section>
      <p class="about__disclaimer">{{ t('about.disclaimer') }}</p>
      <p class="muted">{{ t('settings.privacyNote') }}</p>
    </article>
  </div>
</template>
