<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useNow } from '@/composables/useNow'
import { needsIosInstallHint } from '@/lib/platform'
import { storage } from '@/lib/storage'
import { countInWeek, countOnDay, dueReminder, streaks } from '@/lib/stats'
import { useProgramStore } from '@/stores/program'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

const { t } = useI18n()
const router = useRouter()
const now = useNow()
const settingsStore = useSettingsStore()
const sessionStore = useSessionStore()
const program = useProgramStore()
const ui = useUiStore()

const target = computed(() => settingsStore.settings.dailyTarget)
const doneToday = computed(() => countOnDay(sessionStore.sessions, now.value))
const streak = computed(() => streaks(sessionStore.sessions, now.value).current)
const week = computed(() => countInWeek(sessionStore.sessions, now.value))
const goalMet = computed(() => doneToday.value >= target.value)
const due = computed(() => dueReminder(settingsStore.settings.reminderTimes, doneToday.value, now.value))
const showIosHint = ref(needsIosInstallHint() && !storage.get('iosHintDismissed'))

function dismissIosHint() {
  storage.set('iosHintDismissed', '1')
  showIosHint.value = false
}

function start() {
  void router.push({ name: 'player', query: { program: program.current.id } })
}

async function moveUp() {
  const s = program.suggestion
  if (!s) return
  await program.setCurrent(s.to.id)
  ui.showToast(t('train.programSet'))
}
</script>

<template>
  <div class="page">
    <h1 class="page__title">{{ t('today.title') }}</h1>

    <div v-if="showIosHint" class="weui-information-bar weui-information-bar_tips-weak app-bar">
      <div class="weui-information-bar__bd">{{ t('today.iosHint') }}</div>
      <div class="weui-information-bar__ft">
        <button type="button" class="btn-reset app-bar__close" :aria-label="t('common.close')" @click="dismissIosHint">
          <i class="weui-icon-close" aria-hidden="true"></i>
        </button>
      </div>
    </div>

    <div v-if="due && !goalMet" class="weui-information-bar weui-information-bar_tips-strong app-bar" role="status">
      <div class="weui-information-bar__bd">{{ t('today.nudge', { time: due }) }}</div>
      <div class="weui-information-bar__ft">
        <button type="button" class="btn-reset app-bar__action" @click="start">{{ t('today.nudgeAction') }}</button>
      </div>
    </div>

    <section class="card plan" aria-labelledby="plan-title">
      <h2 id="plan-title" class="card__title">{{ t('today.planTitle') }}</h2>
      <div class="plan__dots" role="img" :aria-label="t('today.planProgress', { done: doneToday, target })">
        <span v-for="i in Math.max(target, doneToday)" :key="i" class="plan__dot" :class="{ plan__dot_on: i <= doneToday }">
          <i v-if="i <= doneToday" class="weui-icon-success-no-circle" aria-hidden="true"></i>
        </span>
      </div>
      <p class="plan__text">{{ goalMet ? t('today.planDone') : t('today.planProgress', { done: doneToday, target }) }}</p>
      <p class="plan__program">{{ t('today.currentProgram', { name: t(`programs.${program.current.id}.name`) }) }}</p>
      <button type="button" class="weui-btn weui-btn_primary big-btn" @click="start">
        {{ goalMet ? t('today.startExtra') : t('today.start') }}
      </button>
    </section>

    <div class="stat-row">
      <section class="card stat">
        <h2 class="stat__label">{{ t('today.streak') }}</h2>
        <p class="stat__value">{{ t('today.streakDays', { n: streak }) }}</p>
      </section>
      <section class="card stat">
        <h2 class="stat__label">{{ t('today.week') }}</h2>
        <p class="stat__value">{{ t('today.weekValue', { done: week, target: target * 7 }) }}</p>
        <div class="weui-progress" aria-hidden="true">
          <div class="weui-progress__bar">
            <div class="weui-progress__inner-bar" :style="{ width: `${Math.min(100, (week / (target * 7)) * 100)}%` }"></div>
          </div>
        </div>
      </section>
    </div>

    <section v-if="program.suggestion" class="card" aria-labelledby="suggest-title">
      <h2 id="suggest-title" class="card__title">{{ t('today.progressTitle') }}</h2>
      <p class="card__body">
        {{
          t('today.progressBody', {
            n: program.suggestion.count,
            from: t(`programs.${program.suggestion.from.id}.name`),
            to: t(`programs.${program.suggestion.to.id}.name`),
          })
        }}
      </p>
      <div class="weui-btn-area weui-btn-area_inline">
        <button type="button" class="weui-btn weui-btn_default" @click="program.dismissSuggestion()">{{ t('today.progressNo') }}</button>
        <button type="button" class="weui-btn weui-btn_primary" @click="moveUp">{{ t('today.progressYes') }}</button>
      </div>
    </section>
  </div>
</template>
