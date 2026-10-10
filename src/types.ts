import type { BlockSpec } from './engine/types'

export type Level = 'beginner' | 'intermediate' | 'advanced'
export type Rating = 1 | 2 | 3 | 4 | 5

export interface SessionBlock extends BlockSpec {
  repsCompleted: number
}

export interface Session {
  id: string
  startedAt: number
  endedAt: number
  programId: string | 'custom'
  level?: Level
  blocks: SessionBlock[]
  /** false if ended early */
  completed: boolean
  rating?: Rating
  note?: string
}

export interface CustomRoutine {
  id: string
  name: string
  blocks: BlockSpec[]
  favourite: boolean
}

export type Locale = 'zh-HK' | 'en'
export type ThemePref = 'system' | 'light' | 'dark'
export type AudioPref = 'off' | 'tone' | 'voice'

export interface Settings {
  locale: Locale
  theme: ThemePref
  vibration: boolean
  audio: AudioPref
  dailyTarget: number
  reminderTimes: string[]
  discreetMode: boolean
  appName: string
  pinHash?: string
  pinSalt?: string
  currentProgramId: string
  onboardingDone: boolean
}

export interface Program {
  id: string
  level: Level
  /** Weeks this program is meant for, for display. */
  weeks: string
  blocks: BlockSpec[]
}
