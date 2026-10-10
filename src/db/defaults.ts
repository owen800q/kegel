import { defaultProgramId } from '@/data/programs'
import type { Settings } from '@/types'

export const DEFAULT_APP_NAME = 'Core Timer'

export function defaultSettings(): Settings {
  return {
    locale: 'zh-HK',
    theme: 'system',
    vibration: true,
    audio: 'off',
    dailyTarget: 3,
    reminderTimes: ['08:00', '13:00', '21:00'],
    discreetMode: true,
    appName: DEFAULT_APP_NAME,
    currentProgramId: defaultProgramId,
    onboardingDone: false,
  }
}
