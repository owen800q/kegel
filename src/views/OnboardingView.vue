<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import WStepper from '@/components/WStepper.vue'
import WTimePicker from '@/components/WTimePicker.vue'
import { programs } from '@/data/programs'
import { useSettingsStore } from '@/stores/settings'
import type { Locale } from '@/types'

const TOTAL = 3
const { t } = useI18n()
const router = useRouter()
const settingsStore = useSettingsStore()

const step = ref(1)
const programId = ref(settingsStore.settings.currentProgramId)
const target = ref(settingsStore.settings.dailyTarget)
const times = ref([...settingsStore.settings.reminderTimes])
const editing = ref<number | null>(null)
const heading = ref<HTMLElement | null>(null)

function go(n: number) {
  step.value = n
  // Move focus to the new step's heading for screen readers.
  requestAnimationFrame(() => heading.value?.focus())
}

function setLocale(locale: Locale) {
  void settingsStore.update({ locale })
}

function saveTime(v: string) {
  if (editing.value !== null) times.value[editing.value] = v
  times.value = [...new Set(times.value)].sort()
  editing.value = null
}

async function finish() {
  await settingsStore.update({
    currentProgramId: programId.value,
    dailyTarget: target.value,
    reminderTimes: times.value,
    onboardingDone: true,
  })
  void router.replace({ name: 'today' })
}
</script>

<template>
  <div class="page onboarding">
    <div class="onboarding__top">
      <span class="muted">{{ t('onboarding.step', { n: step, total: TOTAL }) }}</span>
      <div class="lang-switch" role="group" aria-label="Language / 語言">
        <button type="button" class="btn-reset link-btn" :aria-pressed="settingsStore.settings.locale === 'zh-HK'" @click="setLocale('zh-HK')">中文</button>
        <button type="button" class="btn-reset link-btn" :aria-pressed="settingsStore.settings.locale === 'en'" @click="setLocale('en')">EN</button>
      </div>
    </div>

    <section v-if="step === 1" class="onboarding__step">
      <div class="onboarding__art" aria-hidden="true"><span class="onboarding__circle"></span></div>
      <h1 ref="heading" tabindex="-1" class="page__title">{{ t('onboarding.s1Title') }}</h1>
      <p class="onboarding__body">{{ t('onboarding.s1Body') }}</p>
    </section>

    <section v-else-if="step === 2" class="onboarding__step">
      <div class="onboarding__art" aria-hidden="true"><span class="onboarding__circle onboarding__circle_breathe"></span></div>
      <h1 ref="heading" tabindex="-1" class="page__title">{{ t('onboarding.s2Title') }}</h1>
      <ul class="onboarding__list">
        <li>{{ t('onboarding.s2Body1') }}</li>
        <li>{{ t('onboarding.s2Body2') }}</li>
        <li>{{ t('onboarding.s2Body3') }}</li>
      </ul>
      <p class="muted small">{{ t('about.safety') }}</p>
    </section>

    <section v-else class="onboarding__step">
      <h1 ref="heading" tabindex="-1" class="page__title">{{ t('onboarding.s3Title') }}</h1>
      <p class="onboarding__body">{{ t('onboarding.s3Body') }}</p>
      <div class="weui-cells weui-cells_radio">
        <label v-for="p in programs" :key="p.id" class="weui-cell weui-cell_active weui-check__label">
          <div class="weui-cell__bd">
            <p>{{ t(`programs.${p.id}.name`) }}</p>
            <p class="weui-cell__desc">{{ t(`programs.${p.id}.desc`) }}</p>
          </div>
          <div class="weui-cell__ft">
            <input v-model="programId" type="radio" class="weui-check" name="program" :value="p.id" />
            <span class="weui-icon-checked"></span>
          </div>
        </label>
      </div>
      <div class="weui-cells">
        <WStepper v-model="target" :label="t('onboarding.target')" :min="1" :max="10" />
      </div>
      <h2 class="weui-cells__title">{{ t('onboarding.remindersOptional') }}</h2>
      <div class="weui-cells">
        <div v-for="(time, i) in times" :key="time" class="weui-cell reminder-cell">
          <button type="button" class="weui-cell__bd btn-reset reminder-time" @click="editing = i">
            {{ t('settings.reminderTime', { n: i + 1 }) }} <strong>{{ time }}</strong>
          </button>
          <button type="button" class="weui-cell__ft btn-reset link-btn warn-text" @click="times.splice(i, 1)">
            {{ t('settings.removeReminder') }}
          </button>
        </div>
      </div>
    </section>

    <div class="weui-btn-area onboarding__actions">
      <button v-if="step < TOTAL" type="button" class="weui-btn weui-btn_primary big-btn" @click="go(step + 1)">{{ t('common.next') }}</button>
      <button v-else type="button" class="weui-btn weui-btn_primary big-btn" @click="finish">{{ t('onboarding.finish') }}</button>
      <button v-if="step > 1" type="button" class="weui-btn weui-btn_default" @click="go(step - 1)">{{ t('common.back') }}</button>
    </div>

    <WTimePicker
      v-if="editing !== null"
      :value="times[editing]"
      :title="t('onboarding.remindersOptional')"
      @confirm="saveTime"
      @cancel="editing = null"
    />
  </div>
</template>
