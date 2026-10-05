// Owns: the state of notifications on this device for the Reminders page — support, permission, subscribed — read on
// mount (and kept in step with the Worker via syncPush), plus the three actions: enable (from a tap), send a test,
// turn off. Errors come back as one sentence.
import { endpoints } from '@fitness/shared/api'
import type { PushResult } from '@fitness/shared/schemas'
import { useCallback, useEffect, useState } from 'react'
import { call, isApiError, problemText, useApiQuery } from '../../../api'
import { currentSubscription, disablePush, enablePush, permission, pushSupport, syncPush, type PushSupport } from './push-client'

export interface PushDevice {
  /** null while the first check runs. */
  support: PushSupport | null
  permission: NotificationPermission | 'unsupported'
  subscribed: boolean
  /** The Worker's VAPID public key: undefined while loading, null when push isn't configured on the server. */
  publicKey: string | null | undefined
  busy: boolean
  enable: () => Promise<string>
  test: () => Promise<string>
  disable: () => Promise<string>
}

function sentence(error: unknown): string {
  if (isApiError(error)) return problemText(error)
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError') return 'Notifications were not allowed.'
  if (name === 'AbortError') return 'The browser couldn’t reach its push service. Try again.'
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}

function testOutcome(r: PushResult): string {
  if (!r.configured) return 'Push isn’t set up on the server (VAPID keys missing).'
  if (r.sent > 0) return 'Test sent. It should arrive in a few seconds.'
  if (r.removed > 0) return 'This device’s subscription had expired. Enable notifications again.'
  return 'The push service refused the test. Try again later.'
}

export function usePushDevice(): PushDevice {
  const key = useApiQuery(endpoints.push.key, {}, { staleTime: 60 * 60 * 1000 })
  const publicKey = key.data ? key.data.public_key : key.isError ? null : undefined
  const [support, setSupport] = useState<PushSupport | null>(null)
  const [perm, setPerm] = useState(permission)
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setPerm(permission())
    setSubscribed((await currentSubscription().catch(() => null)) !== null)
  }, [])

  useEffect(() => {
    let live = true
    void pushSupport().then((s) => {
      if (!live) return
      setSupport(s)
      if (s === 'ready') void refresh()
    })
    return () => {
      live = false
    }
  }, [refresh])

  // Once the key is known, make sure the Worker has this device (restores, key changes, rotated endpoints).
  useEffect(() => {
    if (support !== 'ready' || publicKey === undefined) return
    syncPush(publicKey).then(setSubscribed, () => undefined)
  }, [support, publicKey])

  const run = async (action: () => Promise<string>) => {
    setBusy(true)
    try {
      return await action()
    } catch (e) {
      return sentence(e)
    } finally {
      await refresh()
      setBusy(false)
    }
  }

  return {
    support,
    permission: perm,
    subscribed,
    publicKey,
    busy,
    enable: () =>
      run(async () => {
        if (!publicKey) return 'Push isn’t set up on the server (VAPID keys missing).'
        const result = await enablePush(publicKey)
        if (result === 'granted') return 'Notifications are on for this device.'
        return result === 'denied' ? 'Notifications are blocked for this app.' : 'Notifications were not allowed.'
      }),
    test: () =>
      run(async () => {
        const subscription = await currentSubscription()
        return testOutcome(await call(endpoints.push.test, { body: subscription ? { endpoint: subscription.endpoint } : {} }))
      }),
    disable: () =>
      run(async () => {
        await disablePush()
        return 'Notifications are off for this device.'
      }),
  }
}
