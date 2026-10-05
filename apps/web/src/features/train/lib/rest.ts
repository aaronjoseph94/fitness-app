// Owns: the rest timer's reach outside the page — asking for notification permission once (from the tap that ticks a
// set, since browsers only ask from a user gesture), and the "rest over" local notification through the service
// worker registration (Notification constructor as the fallback where there is none, e.g. dev), plus a vibration.

const ASKED_KEY = 'fitness.train.notify-asked'

function supported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

/** Ask once, from a user gesture; later calls do nothing. Never throws. */
export function askNotificationPermission(): void {
  if (!supported() || Notification.permission !== 'default') return
  try {
    if (localStorage.getItem(ASKED_KEY)) return
    localStorage.setItem(ASKED_KEY, '1')
  } catch {
    // Storage blocked: ask anyway, the browser remembers the answer.
  }
  void Notification.requestPermission().catch(() => undefined)
}

/** Tell Aaron the rest is over: a local notification when allowed (and the app is not in front), and a buzz. */
export async function notifyRestOver(body: string): Promise<void> {
  if ('vibrate' in navigator) navigator.vibrate?.([200, 100, 200])
  if (!supported() || Notification.permission !== 'granted' || document.visibilityState === 'visible') return
  const options: NotificationOptions = {
    body,
    tag: 'rest-timer',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
  }
  try {
    const registration =
      'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (registration) await registration.showNotification('Rest over', options)
    else new Notification('Rest over', options)
  } catch {
    // A refused or unsupported notification is not worth an error: the bar on screen says it too.
  }
}
