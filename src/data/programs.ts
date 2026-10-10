import type { Program } from '@/types'

/**
 * Built-in progressive programs, in progression order. Plain data: edit freely.
 * Names and descriptions live in the i18n files under `programs.<id>`.
 */
export const programs: Program[] = [
  {
    id: 'beginner',
    level: 'beginner',
    weeks: '1–2',
    blocks: [{ type: 'hold', holdSec: 3, relaxSec: 3, reps: 10, sets: 3, restBetweenSetsSec: 10 }],
  },
  {
    id: 'intermediate-1',
    level: 'intermediate',
    weeks: '3–4',
    blocks: [
      { type: 'hold', holdSec: 5, relaxSec: 5, reps: 10, sets: 2, restBetweenSetsSec: 15 },
      { type: 'flick', holdSec: 1, relaxSec: 1, reps: 10, sets: 1, restBetweenSetsSec: 0 },
    ],
  },
  {
    id: 'intermediate-2',
    level: 'intermediate',
    weeks: '5–6',
    blocks: [
      { type: 'hold', holdSec: 8, relaxSec: 8, reps: 8, sets: 2, restBetweenSetsSec: 20 },
      { type: 'flick', holdSec: 1, relaxSec: 1, reps: 10, sets: 2, restBetweenSetsSec: 10 },
    ],
  },
  {
    id: 'advanced',
    level: 'advanced',
    weeks: '7+',
    blocks: [
      { type: 'hold', holdSec: 10, relaxSec: 10, reps: 8, sets: 2, restBetweenSetsSec: 20 },
      { type: 'flick', holdSec: 1, relaxSec: 1, reps: 15, sets: 2, restBetweenSetsSec: 15 },
      { type: 'relax', holdSec: 4, relaxSec: 6, reps: 5, sets: 1, restBetweenSetsSec: 0 },
    ],
  },
]

export const defaultProgramId = programs[0].id

export function getProgram(id: string): Program | undefined {
  return programs.find((p) => p.id === id)
}

export function nextProgram(id: string): Program | undefined {
  const i = programs.findIndex((p) => p.id === id)
  return i >= 0 ? programs[i + 1] : undefined
}

/** Defaults for each exercise type, used by the custom builder. */
export const blockDefaults = {
  hold: { type: 'hold', holdSec: 5, relaxSec: 5, reps: 10, sets: 3, restBetweenSetsSec: 15 },
  flick: { type: 'flick', holdSec: 1, relaxSec: 1, reps: 10, sets: 2, restBetweenSetsSec: 10 },
  relax: { type: 'relax', holdSec: 4, relaxSec: 6, reps: 6, sets: 1, restBetweenSetsSec: 0 },
} as const
