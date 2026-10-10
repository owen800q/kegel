/** iOS Safari has no install prompt; detect when to show the "Add to Home Screen" hint. */
export function needsIosInstallHint(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  return ios && !nav.standalone && !matchMedia('(display-mode: standalone)').matches
}

export function uuid(): string {
  return crypto.randomUUID()
}

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
