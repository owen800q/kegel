<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { formatClock } from '@/lib/date'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const sessionStore = useSessionStore()
const ui = useUiStore()

const session = computed(() => sessionStore.sessions.find((s) => s.id === route.params.id))
const started = computed(() =>
  session.value ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(session.value.startedAt) : '',
)

async function remove() {
  if (!session.value) return
  const ok = await ui.confirm({ body: t('progress.deleteConfirm'), ok: t('common.delete'), cancel: t('common.cancel'), warn: true })
  if (!ok) return
  await sessionStore.removeSession(session.value.id)
  ui.showToast(t('progress.deleted'))
  void router.replace({ name: 'progress' })
}
</script>

<template>
  <div class="page">
    <h1 class="page__title">{{ t('progress.detail') }}</h1>
    <div v-if="session">
      <div class="weui-form-preview">
        <div class="weui-form-preview__bd">
          <div class="weui-form-preview__item">
            <span class="weui-form-preview__label">{{ t('progress.started') }}</span>
            <span class="weui-form-preview__value">{{ started }}</span>
          </div>
          <div class="weui-form-preview__item">
            <span class="weui-form-preview__label">{{ t('player.duration') }}</span>
            <span class="weui-form-preview__value">{{ formatClock(session.endedAt - session.startedAt) }}</span>
          </div>
          <div class="weui-form-preview__item">
            <span class="weui-form-preview__label">{{ t('progress.program') }}</span>
            <span class="weui-form-preview__value">
              {{ session.programId === 'custom' ? t('programs.custom') : t(`programs.${session.programId}.name`) }}
            </span>
          </div>
          <div class="weui-form-preview__item">
            <span class="weui-form-preview__label">{{ t('progress.status') }}</span>
            <span class="weui-form-preview__value">{{ session.completed ? t('progress.complete') : t('progress.incomplete') }}</span>
          </div>
          <div v-if="session.rating" class="weui-form-preview__item">
            <span class="weui-form-preview__label">{{ t('progress.rating') }}</span>
            <span class="weui-form-preview__value">{{ session.rating }} / 5</span>
          </div>
          <div v-if="session.note" class="weui-form-preview__item">
            <span class="weui-form-preview__label">{{ t('progress.note') }}</span>
            <span class="weui-form-preview__value">{{ session.note }}</span>
          </div>
        </div>
      </div>
      <h2 class="weui-cells__title">{{ t('progress.blocks') }}</h2>
      <div class="weui-cells">
        <div v-for="(b, i) in session.blocks" :key="i" class="weui-cell">
          <div class="weui-cell__bd">
            <p>{{ t('progress.blockLine', { type: t(`blockType.${b.type}`), done: b.repsCompleted, total: b.reps * b.sets }) }}</p>
            <p class="weui-cell__desc">
              {{ t('common.seconds', { n: b.holdSec }) }} / {{ t('common.seconds', { n: b.relaxSec }) }} · {{ b.reps }} × {{ b.sets }}
            </p>
          </div>
        </div>
      </div>
      <div class="weui-btn-area">
        <button type="button" class="weui-btn weui-btn_warn" @click="remove">{{ t('progress.deleteSession') }}</button>
      </div>
    </div>
    <p v-else class="muted center">{{ t('player.notFound') }}</p>
  </div>
</template>
