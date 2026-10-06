// Owns: putting text on the clipboard — with the fallback older iOS Safari needs (it has no async clipboard in a plain
// http origin), so "Copy" works in the installed PWA and in a local dev tab alike.
/** True when `text` reached the clipboard; false when the browser refused (the caller shows it for a manual copy). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Falls through to the selection fallback below.
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}
