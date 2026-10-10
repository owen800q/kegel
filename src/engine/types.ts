/** Exercise kinds a session block can be built from. */
export type BlockType = 'hold' | 'flick' | 'relax'

/** Shape of one block before it is run (no progress information). */
export interface BlockSpec {
  type: BlockType
  /** Squeeze time, or inhale time for a relaxation block. */
  holdSec: number
  /** Release time, or exhale time for a relaxation block. */
  relaxSec: number
  reps: number
  sets: number
  restBetweenSetsSec: number
}

export type PhaseKind = 'idle' | 'squeeze' | 'relax' | 'rest' | 'done'
export type EngineStatus = 'idle' | 'running' | 'paused' | 'done'
