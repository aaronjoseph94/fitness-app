// Owns: the push-subscribe seam — POST /api/push/subscribe accepts only the browsers' own https push services as an
// endpoint (the Worker POSTs to it on every reminder), never an arbitrary URL.
import { describe, expect, test } from 'vitest'
import { isPushEndpoint, PushSubscribe } from '../index'

const keys = { p256dh: 'BPhone-p256dh', auth: 'phone-auth' }
const body = (endpoint: string) => ({ endpoint, keys, kinds: ['weigh_in'] })

describe('PushSubscribe endpoint', () => {
  test('accepts Apple, Google (FCM), Mozilla and Windows push services over https', () => {
    for (const endpoint of [
      'https://web.push.apple.com/QGuQyavXutnMH8Ip',
      'https://fcm.googleapis.com/fcm/send/dUf2Hk9:APA91b',
      'https://updates.push.services.mozilla.com/wpush/v2/gAAAAA',
      'https://wns2-by3p.notify.windows.com/w/?token=BQYAAA',
    ])
      expect(PushSubscribe.safeParse(body(endpoint)).success, endpoint).toBe(true)
  })

  test('refuses any other host, plain http, and look-alike hosts', () => {
    for (const endpoint of [
      'https://evil.example/collect',
      'http://fcm.googleapis.com/fcm/send/x',
      'https://fcm.googleapis.com.evil.example/fcm/send/x',
      'https://push.apple.com.evil.example/x',
      'https://localhost:8787/api/settings',
      'https://169.254.169.254/latest/meta-data',
    ]) {
      expect(PushSubscribe.safeParse(body(endpoint)).success, endpoint).toBe(false)
      expect(isPushEndpoint(endpoint), endpoint).toBe(false)
    }
  })
})
