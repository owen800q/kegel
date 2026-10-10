<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import WStepper from '@/components/WStepper.vue'
import WSwitchCell from '@/components/WSwitchCell.vue'
import { blockDefaults } from '@/data/programs'
import { totalDurationMs } from '@/engine/session-engine'
import type { BlockSpec, BlockType } from '@/engine/types'
import { formatClock } from '@/lib/date'
import { uuid } from '@/lib/platform'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const sessionStore = useSessionStore()
const ui = useUiStore()

const existing = sessionStore.routines.find((r) => r.id === route.params.id)
const id = existing?.id ?? uuid()
const name = ref(existing?.name ?? '')
const favourite = ref(existing?.favourite ?? false)
const blocks = ref<BlockSpec[]>(existing ? existing.blocks.map((b) => ({ ...b })) : [{ ...blockDefaults.hold }])

const total = computed(() => formatClock(totalDurationMs(blocks.value)))
const sec = (v: number) => t('common.seconds', { n: v })
const types: BlockType[] = ['hold', 'flick', 'relax']

async function chooseType(i: number) {
  const choice = await ui.showActionsheet({
    title: t('builder.chooseType'),
    actions: types.map((ty) => ({ label: t(`blockType.${ty}`), value: ty })),
    cancelLabel: t('common.cancel'),
  })
  if (choice) blocks.value[i] = { ...blockDefaults[choice as BlockType] }
}

async function addBlock() {
  const choice = await ui.showActionsheet({
    title: t('builder.chooseType'),
    actions: types.map((ty) => ({ label: t(`blockType.${ty}`), value: ty })),
    cancelLabel: t('common.cancel'),
  })
  if (choice) blocks.value.push({ ...blockDefaults[choice as BlockType] })
}

function removeBlock(i: number) {
  blocks.value.splice(i, 1)
}

async function save(): Promise<string> {
  await sessionStore.saveRoutine({
    id,
    name: name.value.trim() || t('builder.defaultName'),
    favourite: favourite.value,
    blocks: blocks.value.map((b) => ({ ...b })),
  })
  return id
}

async function onSave() {
  await save()
  ui.showToast(t('builder.saved'))
  void router.replace({ name: 'train' })
}

async function onStart() {
  const routineId = await save()
  void router.push({ name: 'player', query: { routine: routineId } })
}

async function onDelete() {
  const ok = await ui.confirm({ body: t('builder.deleteConfirm'), ok: t('common.delete'), cancel: t('common.cancel'), warn: true })
  if (!ok) return
  await sessionStore.removeRoutine(id)
  void router.replace({ name: 'train' })
}
</script>

<template>
  <div class="page">
    <h1 class="page__title">{{ t('builder.title') }}</h1>

    <div class="weui-cells weui-cells_form">
      <div class="weui-cell weui-cell_active">
        <div class="weui-cell__hd"><label class="weui-label" for="routine-name">{{ t('builder.name') }}</label></div>
        <div class="weui-cell__bd">
          <input id="routine-name" v-model="name" class="weui-input" maxlength="40" :placeholder="t('builder.namePlaceholder')" />
        </div>
      </div>
      <WSwitchCell v-model="favourite" :label="t('builder.favourite')" />
    </div>

    <template v-for="(b, i) in blocks" :key="i">
      <h2 class="weui-cells__title">{{ t('builder.block', { n: i + 1 }) }}</h2>
      <div class="weui-cells">
        <button type="button" class="weui-cell weui-cell_access btn-reset cell-btn" @click="chooseType(i)">
          <div class="weui-cell__bd">{{ t('builder.type') }}</div>
          <div class="weui-cell__ft">{{ t(`blockType.${b.type}`) }}</div>
        </button>
        <WStepper v-model="b.holdSec" :label="t(b.type === 'relax' ? 'builder.inhale' : 'builder.hold')" :min="1" :max="30" :format="sec" />
        <WStepper v-model="b.relaxSec" :label="t(b.type === 'relax' ? 'builder.exhale' : 'builder.relax')" :min="1" :max="30" :format="sec" />
        <WStepper v-model="b.reps" :label="t('builder.reps')" :min="1" :max="50" />
        <WStepper v-model="b.sets" :label="t('builder.sets')" :min="1" :max="10" />
        <WStepper v-model="b.restBetweenSetsSec" :label="t('builder.rest')" :min="0" :max="120" :step="5" :format="sec" />
        <button v-if="blocks.length > 1" type="button" class="weui-cell btn-reset cell-btn warn-text" @click="removeBlock(i)">
          <div class="weui-cell__bd">{{ t('builder.removeBlock') }}</div>
        </button>
      </div>
    </template>

    <div class="weui-btn-area">
      <button type="button" class="weui-btn weui-btn_default" @click="addBlock">{{ t('builder.addBlock') }}</button>
    </div>
    <p class="center muted">{{ t('builder.total', { time: total }) }}</p>
    <div class="weui-btn-area">
      <button type="button" class="weui-btn weui-btn_primary" @click="onStart">{{ t('builder.startNow') }}</button>
      <button type="button" class="weui-btn weui-btn_default" @click="onSave">{{ t('builder.saveRoutine') }}</button>
      <button v-if="existing" type="button" class="weui-btn weui-btn_warn" @click="onDelete">{{ t('builder.deleteRoutine') }}</button>
    </div>
  </div>
</template>
