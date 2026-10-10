import { onBeforeUnmount, onMounted, ref } from 'vue'

/** A clock that updates every `intervalMs` and when the page becomes visible. */
export function useNow(intervalMs = 30_000) {
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined
  const update = () => (now.value = Date.now())
  onMounted(() => {
    timer = setInterval(update, intervalMs)
    document.addEventListener('visibilitychange', update)
  })
  onBeforeUnmount(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', update)
  })
  return now
}
