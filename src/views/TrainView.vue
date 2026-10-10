<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { programs } from '@/data/programs'
import { totalDurationMs } from '@/engine/session-engine'
import type { BlockSpec } from '@/engine/types'
import { useProgramStore } from '@/stores/program'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import type { CustomRoutine, Program } from '@/types'

const { t } = useI18n()
const router = useRouter()
const program = useProgramStore()
const sessionStore = useSessionStore()
const ui = useUiStore()

function minutes(blocks: BlockSpec[]) {
  return Math.max(1, Math.round(totalDurationMs(blocks) / 60_000))
}

async function onProgram(p: Program) {
  const actions = [{ label: t('train.startThis'), value: 'start' }]
  if (p.id !== program.current.id) actions.push({ label: t('train.choose'), value: 'current' })
  const choice = await ui.showActionsheet({ title: t(`programs.${p.id}.name`), actions, cancelLabel: t('common.cancel') })
  if (choice === 'start') void router.push({ name: 'player', query: { program: p.id } })
  if (choice === 'current') {
    await program.setCurrent(p.id)
    ui.showToast(t('train.programSet'))
  }
}

async function onRoutine(r: CustomRoutine) {
  const choice = await ui.showActionsheet({
    title: r.name,
    actions: [
      { label: t('train.startThis'), value: 'start' },
      { label: t('common.edit'), value: 'edit' },
    ],
    cancelLabel: t('common.cancel'),
  })
  if (choice === 'start') void router.push({ name: 'player', query: { routine: r.id } })
  if (choice === 'edit') void router.push({ name: 'builder', params: { id: r.id } })
}
</script>

<template>
  <div class="page">
    <h1 class="page__title">{{ t('train.title') }}</h1>

    <h2 class="weui-cells__title">{{ t('train.programs') }}</h2>
    <div class="weui-cells">
      <button
        v-for="p in programs"
        :key="p.id"
        type="button"
        class="weui-cell weui-cell_access btn-reset cell-btn"
        @click="onProgram(p)"
      >
        <div class="weui-cell__bd">
          <p class="cell-title">
            {{ t(`programs.${p.id}.name`) }}
            <span v-if="p.id === program.current.id" class="tag">{{ t('train.current') }}</span>
          </p>
          <p class="weui-cell__desc">{{ t(`programs.${p.id}.desc`) }}</p>
          <p class="weui-cell__desc">{{ t('programs.weeks', { weeks: p.weeks }) }} · {{ t('train.duration', { min: minutes(p.blocks) }) }}</p>
        </div>
        <div class="weui-cell__ft"></div>
      </button>
    </div>

    <h2 class="weui-cells__title">{{ t('train.custom') }}</h2>
    <div class="weui-cells">
      <button
        v-for="r in sessionStore.sortedRoutines"
        :key="r.id"
        type="button"
        class="weui-cell weui-cell_access btn-reset cell-btn"
        @click="onRoutine(r)"
      >
        <div class="weui-cell__bd">
          <p class="cell-title">
            <span v-if="r.favourite" class="fav" :aria-label="t('train.favourites')">★</span>
            {{ r.name }}
          </p>
          <p class="weui-cell__desc">
            {{ r.blocks.map((b) => t(`blockType.${b.type}`)).join(' + ') }} · {{ t('train.duration', { min: minutes(r.blocks) }) }}
          </p>
        </div>
        <div class="weui-cell__ft"></div>
      </button>
      <div v-if="sessionStore.routines.length === 0" class="weui-cell">
        <div class="weui-cell__bd muted">{{ t('train.noRoutines') }}</div>
      </div>
    </div>
    <div class="weui-btn-area">
      <RouterLink :to="{ name: 'builder' }" class="weui-btn weui-btn_default">{{ t('train.newCustom') }}</RouterLink>
    </div>
  </div>
</template>
