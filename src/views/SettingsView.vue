<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PinPad from '@/components/PinPad.vue'
import WStepper from '@/components/WStepper.vue'
import WSwitchCell from '@/components/WSwitchCell.vue'
import WTimePicker from '@/components/WTimePicker.vue'
import { DEFAULT_APP_NAME } from '@/db/defaults'
import { ImportError, parseImport } from '@/db/export'
import { canVibrate, playCue, unlockAudio } from '@/lib/cues'
import { buildIcs } from '@/lib/ics'
import { hashPin, newSalt } from '@/lib/pin'
import { disablePush, enablePush, PushError, pushSupport, sendTestPush } from '@/lib/push'
import { downloadFile } from '@/lib/platform'
import { storage } from '@/lib/storage'
import { useProgramStore } from '@/stores/program'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { useUpdateStore } from '@/stores/update'
import type { AudioPref, Locale, Settings, ThemePref } from '@/types'

const { t, locale } = useI18n()
const settingsStore = useSettingsStore()
const sessionStore = useSessionStore()
const program = useProgramStore()
const ui = useUiStore()
const s = computed(() => settingsStore.settings)
const version = __APP_VERSION__
const update = useUpdateStore()
const checking = ref(false)

async function onUpdateRow() {
  if (update.available) {
    await update.apply()
    return
  }
  checking.value = true
  try {
    const found = await update.check()
    if (!found) ui.showToast(t('settings.upToDate'), 'none')
  } finally {
    checking.value = false
  }
}

function set<K extends keyof Settings>(key: K, value: Settings[K]) {
  void settingsStore.update({ [key]: value } as Partial<Settings>)
}

const vibration = computed({ get: () => s.value.vibration, set: (v) => set('vibration', v) })
const discreet = computed({ get: () => s.value.discreetMode, set: (v) => set('discreetMode', v) })
const dailyTarget = computed({ get: () => s.value.dailyTarget, set: (v) => set('dailyTarget', v) })

const languages: { value: Locale; label: string }[] = [
  { value: 'zh-HK', label: '繁體中文（香港）' },
  { value: 'en', label: 'English' },
]
const themeLabel = computed(() => t(`settings.theme${s.value.theme[0].toUpperCase()}${s.value.theme.slice(1)}`))
const audioLabel = computed(() => t(`settings.audio${s.value.audio[0].toUpperCase()}${s.value.audio.slice(1)}`))

async function chooseLanguage() {
  const v = await ui.showActionsheet({ title: t('settings.language'), actions: languages, cancelLabel: t('common.cancel') })
  if (v) set('locale', v as Locale)
}

async function chooseTheme() {
  const v = await ui.showActionsheet({
    title: t('settings.theme'),
    actions: (['system', 'light', 'dark'] as const).map((x) => ({
      value: x,
      label: t(`settings.theme${x[0].toUpperCase()}${x.slice(1)}`),
    })),
    cancelLabel: t('common.cancel'),
  })
  if (v) set('theme', v as ThemePref)
}

async function chooseAudio() {
  const v = await ui.showActionsheet({
    title: t('settings.audio'),
    actions: (['off', 'tone', 'voice'] as const).map((x) => ({
      value: x,
      label: t(`settings.audio${x[0].toUpperCase()}${x.slice(1)}`),
    })),
    cancelLabel: t('common.cancel'),
  })
  if (v) set('audio', v as AudioPref)
}

function testCue() {
  unlockAudio()
  playCue('squeeze', { vibration: s.value.vibration, audio: s.value.audio, lang: locale.value, word: t('voice.squeeze') })
}

// Reminders
const editingReminder = ref<number | null>(null)
const sortedTimes = computed(() => [...s.value.reminderTimes].sort())

function saveReminder(value: string) {
  const times = [...sortedTimes.value]
  if (editingReminder.value === -1) times.push(value)
  else if (editingReminder.value !== null) times[editingReminder.value] = value
  set('reminderTimes', [...new Set(times)].sort())
  editingReminder.value = null
}

function removeReminder(i: number) {
  set('reminderTimes', sortedTimes.value.filter((_, j) => j !== i))
}

function exportIcs() {
  const ics = buildIcs({
    times: sortedTimes.value,
    title: s.value.discreetMode ? t('settings.icsTitleDiscreet') : t('settings.icsTitle'),
  })
  downloadFile('reminders.ics', ics, 'text/calendar')
}

// Push reminders
const support = pushSupport()
const pushBusy = ref(false)

function pushErrorText(err: unknown) {
  const code = err instanceof PushError ? err.code : 'failed'
  return t(`settings.pushError.${code}`)
}

const pushEnabled = computed({
  get: () => s.value.pushEnabled,
  set: (on: boolean) => void togglePush(on),
})

async function togglePush(on: boolean) {
  if (pushBusy.value) return
  pushBusy.value = true
  try {
    if (on) {
      await enablePush(sortedTimes.value)
      await settingsStore.update({ pushEnabled: true })
      ui.showToast(t('settings.pushOn'))
    } else {
      await disablePush()
      await settingsStore.update({ pushEnabled: false })
      ui.showToast(t('settings.pushOff'), 'none')
    }
  } catch (err) {
    ui.showToast(pushErrorText(err), 'warn', 2600)
  } finally {
    pushBusy.value = false
  }
}

async function testPush() {
  try {
    await sendTestPush()
    ui.showToast(t('settings.pushTestSent'), 'none')
  } catch (err) {
    ui.showToast(pushErrorText(err), 'warn', 2600)
  }
}

// Privacy
const appName = ref(s.value.appName)
function saveAppName() {
  const name = appName.value.trim() || DEFAULT_APP_NAME
  appName.value = name
  set('appName', name)
}

const pinStep = ref<'new' | 'confirm' | null>(null)
const pinError = ref('')
let firstPin = ''

async function onPinMenu() {
  if (!s.value.pinHash) {
    pinStep.value = 'new'
    return
  }
  const v = await ui.showActionsheet({
    title: t('settings.pin'),
    actions: [
      { value: 'change', label: t('settings.pinChange') },
      { value: 'remove', label: t('settings.pinRemove'), warn: true },
    ],
    cancelLabel: t('common.cancel'),
  })
  if (v === 'change') pinStep.value = 'new'
  if (v === 'remove') {
    await settingsStore.update({ pinHash: undefined, pinSalt: undefined })
    ui.showToast(t('pin.removed'))
  }
}

async function onPin(pin: string) {
  if (pinStep.value === 'new') {
    firstPin = pin
    pinError.value = ''
    pinStep.value = 'confirm'
    return
  }
  if (pin !== firstPin) {
    pinError.value = t('pin.mismatch')
    pinStep.value = 'new'
    return
  }
  const salt = newSalt()
  await settingsStore.update({ pinSalt: salt, pinHash: await hashPin(pin, salt) })
  pinStep.value = null
  pinError.value = ''
  firstPin = ''
  ui.showToast(t('pin.set'))
}

function cancelPin() {
  pinStep.value = null
  pinError.value = ''
  firstPin = ''
}

// Data
const fileInput = ref<HTMLInputElement | null>(null)

async function exportData() {
  const payload = await sessionStore.exportAll()
  const date = payload.exportedAt.slice(0, 10)
  downloadFile(`core-timer-${date}.json`, JSON.stringify(payload, null, 2), 'application/json')
  ui.showToast(t('settings.exported'))
}

async function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const payload = parseImport(await file.text())
    const ok = await ui.confirm({ body: t('settings.importConfirm'), ok: t('common.ok'), cancel: t('common.cancel'), warn: true })
    if (!ok) return
    await sessionStore.importAll(payload)
    appName.value = settingsStore.settings.appName
    ui.showToast(t('settings.imported'))
  } catch (err) {
    const code = err instanceof ImportError ? err.code : 'invalid'
    ui.showToast(t(`settings.importError.${code}`), 'warn', 2600)
  }
}

async function deleteAll() {
  const ok = await ui.confirm({
    title: t('settings.deleteAll'),
    body: t('settings.deleteAllConfirm'),
    ok: t('settings.deleteAllOk'),
    cancel: t('common.cancel'),
    warn: true,
  })
  if (!ok) return
  // Remove this device's push subscription from the server too.
  await disablePush().catch(() => {})
  await sessionStore.deleteAll()
  storage.clear()
  // Start over from onboarding with a clean in-memory state.
  location.replace('/')
}
</script>

<template>
  <div class="page">
    <h1 class="page__title">{{ t('settings.title') }}</h1>

    <h2 class="weui-cells__title">{{ t('settings.general') }}</h2>
    <div class="weui-cells">
      <button type="button" class="weui-cell weui-cell_access btn-reset cell-btn" @click="chooseLanguage">
        <div class="weui-cell__bd">{{ t('settings.language') }}</div>
        <div class="weui-cell__ft">{{ languages.find((l) => l.value === s.locale)?.label }}</div>
      </button>
      <button type="button" class="weui-cell weui-cell_access btn-reset cell-btn" @click="chooseTheme">
        <div class="weui-cell__bd">{{ t('settings.theme') }}</div>
        <div class="weui-cell__ft">{{ themeLabel }}</div>
      </button>
    </div>

    <h2 class="weui-cells__title">{{ t('settings.cues') }}</h2>
    <div class="weui-cells">
      <WSwitchCell v-model="vibration" :label="t('settings.vibration')" :hint="canVibrate ? undefined : t('settings.vibrationUnsupported')" />
      <button type="button" class="weui-cell weui-cell_access btn-reset cell-btn" @click="chooseAudio">
        <div class="weui-cell__bd">{{ t('settings.audio') }}</div>
        <div class="weui-cell__ft">{{ audioLabel }}</div>
      </button>
      <button type="button" class="weui-cell weui-cell_access btn-reset cell-btn" @click="testCue">
        <div class="weui-cell__bd">{{ t('settings.testCue') }}</div>
        <div class="weui-cell__ft"></div>
      </button>
    </div>

    <h2 class="weui-cells__title">{{ t('settings.training') }}</h2>
    <div class="weui-cells">
      <WStepper v-model="dailyTarget" :label="t('settings.dailyTarget')" :min="1" :max="10" />
      <RouterLink to="/train" class="weui-cell weui-cell_access">
        <div class="weui-cell__bd">{{ t('settings.program') }}</div>
        <div class="weui-cell__ft">{{ t(`programs.${program.current.id}.name`) }}</div>
      </RouterLink>
    </div>

    <h2 class="weui-cells__title">{{ t('settings.reminders') }}</h2>
    <div class="weui-cells">
      <div v-for="(time, i) in sortedTimes" :key="time" class="weui-cell reminder-cell">
        <button type="button" class="weui-cell__bd btn-reset reminder-time" @click="editingReminder = i">
          {{ t('settings.reminderTime', { n: i + 1 }) }} <strong>{{ time }}</strong>
        </button>
        <button type="button" class="weui-cell__ft btn-reset link-btn warn-text" @click="removeReminder(i)">
          {{ t('settings.removeReminder') }}
        </button>
      </div>
      <button type="button" class="weui-cell weui-cell_access btn-reset cell-btn" @click="editingReminder = -1">
        <div class="weui-cell__bd">{{ t('settings.addReminder') }}</div>
        <div class="weui-cell__ft"></div>
      </button>
      <WSwitchCell
        v-model="pushEnabled"
        :label="t('settings.push')"
        :disabled="support !== 'supported' || pushBusy"
        :hint="support === 'needs-install' ? t('settings.pushIos') : support === 'unsupported' ? t('settings.pushUnsupported') : undefined"
      />
      <button v-if="s.pushEnabled" type="button" class="weui-cell weui-cell_access btn-reset cell-btn" @click="testPush">
        <div class="weui-cell__bd">{{ t('settings.pushTest') }}</div>
        <div class="weui-cell__ft"></div>
      </button>
      <button type="button" class="weui-cell weui-cell_access btn-reset cell-btn" :disabled="sortedTimes.length === 0" @click="exportIcs">
        <div class="weui-cell__bd">{{ t('settings.exportIcs') }}</div>
        <div class="weui-cell__ft"></div>
      </button>
    </div>
    <p class="weui-cells__tips">{{ t('settings.remindersTip') }}</p>
    <p v-if="support === 'supported'" class="weui-cells__tips">{{ t('settings.pushTip') }}</p>

    <h2 class="weui-cells__title">{{ t('settings.privacy') }}</h2>
    <div class="weui-cells weui-cells_form">
      <WSwitchCell v-model="discreet" :label="t('settings.discreet')" :hint="t('settings.discreetTip')" />
      <div class="weui-cell weui-cell_active">
        <div class="weui-cell__hd"><label class="weui-label" for="app-name">{{ t('settings.appName') }}</label></div>
        <div class="weui-cell__bd">
          <input id="app-name" v-model="appName" class="weui-input" maxlength="30" @change="saveAppName" @blur="saveAppName" />
        </div>
      </div>
      <button type="button" class="weui-cell weui-cell_access btn-reset cell-btn" @click="onPinMenu">
        <div class="weui-cell__bd">{{ t('settings.pin') }}</div>
        <div class="weui-cell__ft">{{ s.pinHash ? t('common.on') : t('common.off') }}</div>
      </button>
    </div>
    <p class="weui-cells__tips">{{ t('settings.pinTip') }}</p>

    <h2 class="weui-cells__title">{{ t('settings.data') }}</h2>
    <div class="weui-cells">
      <button type="button" class="weui-cell weui-cell_access btn-reset cell-btn" @click="exportData">
        <div class="weui-cell__bd">{{ t('settings.export') }}</div>
        <div class="weui-cell__ft"></div>
      </button>
      <button type="button" class="weui-cell weui-cell_access btn-reset cell-btn" @click="fileInput?.click()">
        <div class="weui-cell__bd">{{ t('settings.import') }}</div>
        <div class="weui-cell__ft"></div>
      </button>
      <button type="button" class="weui-cell btn-reset cell-btn warn-text" @click="deleteAll">
        <div class="weui-cell__bd">{{ t('settings.deleteAll') }}</div>
      </button>
    </div>
    <input
      ref="fileInput"
      type="file"
      accept="application/json,.json"
      class="visually-hidden"
      tabindex="-1"
      aria-hidden="true"
      data-testid="import-input"
      @change="onImportFile"
    />
    <p class="weui-cells__tips">{{ t('settings.privacyNote') }}</p>

    <div class="weui-cells">
      <RouterLink to="/settings/about" class="weui-cell weui-cell_access">
        <div class="weui-cell__bd">{{ t('settings.about') }}</div>
        <div class="weui-cell__ft"></div>
      </RouterLink>
    </div>
    <div class="weui-cells">
      <button type="button" class="weui-cell weui-cell_access btn-reset cell-btn" :disabled="checking" @click="onUpdateRow">
        <div class="weui-cell__bd">
          {{ update.available ? t('settings.updateAvailable') : t('settings.checkUpdate') }}
        </div>
        <div class="weui-cell__ft">
          <span v-if="update.available" class="tag">{{ t('today.updateNow') }}</span>
          <span v-else>{{ t('settings.version', { v: version }) }}</span>
        </div>
      </button>
    </div>

    <WTimePicker
      v-if="editingReminder !== null"
      :value="editingReminder >= 0 ? sortedTimes[editingReminder] : '12:00'"
      :title="t('settings.reminders')"
      @confirm="saveReminder"
      @cancel="editingReminder = null"
    />

    <div v-if="pinStep" class="lock-screen">
      <PinPad :key="pinStep" :title="pinStep === 'new' ? t('pin.new') : t('pin.confirm')" :error="pinError" @complete="onPin">
        <template #extra>
          <button type="button" class="btn-reset pinpad__key pinpad__key_fn" @click="cancelPin">{{ t('common.cancel') }}</button>
        </template>
      </PinPad>
    </div>
  </div>
</template>
