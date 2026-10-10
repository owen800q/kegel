import type { AudioPref } from '@/types'

export type CueKind = 'squeeze' | 'relax' | 'inhale' | 'exhale' | 'rest' | 'done'

export const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

const VIBRATION: Record<CueKind, number[]> = {
  squeeze: [80],
  relax: [50, 80, 50],
  inhale: [80],
  exhale: [50, 80, 50],
  rest: [200],
  done: [120, 100, 120, 100, 120],
}

/** Silently does nothing where vibration is unsupported (e.g. iOS Safari). */
export function vibrate(kind: CueKind) {
  if (!canVibrate) return
  try {
    navigator.vibrate(VIBRATION[kind])
  } catch {
    /* ignore */
  }
}

let ctx: AudioContext | null = null

/** Must be called from a user gesture (e.g. the Start button) so iOS lets audio play. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    ctx = null
  }
}

const TONES: Record<CueKind, number[]> = {
  squeeze: [660],
  relax: [440, 440],
  inhale: [523],
  exhale: [392, 392],
  rest: [330],
  done: [523, 659, 784],
}

function playTone(kind: CueKind) {
  if (!ctx) return
  const start = ctx.currentTime + 0.01
  TONES[kind].forEach((freq, i) => {
    const t = start + i * 0.18
    const osc = ctx!.createOscillator()
    const gain = ctx!.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    // Soft attack and release, low volume.
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.18, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15)
    osc.connect(gain).connect(ctx!.destination)
    osc.start(t)
    osc.stop(t + 0.16)
  })
}

/**
 * Spoken prompt using on-device voices only: network voices would send text
 * to a third party, so if none is local we fall back to a tone.
 */
function speak(text: string, lang: string, fallback: CueKind) {
  const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null
  const voices = synth?.getVoices().filter((v) => v.localService) ?? []
  const base = lang.split('-')[0]
  const voice =
    voices.find((v) => v.lang.replace('_', '-') === lang) ??
    voices.find((v) => v.lang.replace('_', '-').startsWith(base))
  if (!synth || !voice) {
    playTone(fallback)
    return
  }
  synth.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.voice = voice
  u.lang = voice.lang
  u.rate = 1
  u.volume = 0.8
  synth.speak(u)
}

export interface CueOptions {
  vibration: boolean
  audio: AudioPref
  lang: string
  /** Spoken word for this cue, when audio is 'voice'. */
  word?: string
}

export function playCue(kind: CueKind, opts: CueOptions) {
  if (opts.vibration) vibrate(kind)
  if (opts.audio === 'tone') playTone(kind)
  else if (opts.audio === 'voice') {
    if (opts.word) speak(opts.word, opts.lang, kind)
    else playTone(kind)
  }
}

/** Screen Wake Lock that re-acquires itself when the page becomes visible again. */
export function createWakeLock() {
  let sentinel: WakeLockSentinel | null = null
  let wanted = false

  async function acquire() {
    if (!wanted || sentinel || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return
    try {
      sentinel = await navigator.wakeLock.request('screen')
      sentinel.addEventListener('release', () => (sentinel = null))
    } catch {
      sentinel = null
    }
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') void acquire()
  }

  return {
    async request() {
      wanted = true
      document.addEventListener('visibilitychange', onVisibility)
      await acquire()
    },
    async release() {
      wanted = false
      document.removeEventListener('visibilitychange', onVisibility)
      const s = sentinel
      sentinel = null
      await s?.release().catch(() => {})
    },
  }
}
