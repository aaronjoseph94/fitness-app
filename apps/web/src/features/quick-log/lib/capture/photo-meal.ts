// Owns: a photo meal from pick to analysis — photos picked (camera or gallery, several), each downscaled and re-encoded
// on this phone; then the meal is created (input_method 'photo', with an optional note as raw_text) and every photo
// uploaded, which starts the Worker's meal_analysis. Needs a connection: a photo can't wait in the offline queue.
// A failed upload keeps the meal and what already went up, so "Try again" sends only the rest.
import { endpoints } from '@fitness/shared/api'
import type { MealSlot } from '@fitness/shared/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { apiQueryKey, call } from '../../../../api'
import { problemText } from '../ui'
import { preparePhoto, releasePhoto, uploadMealPhoto, type PreparedPhoto } from './photos'

/** Enough angles for one plate; more only slows the analysis. */
export const MAX_MEAL_PHOTOS = 4

export interface PhotoMeal {
  photos: PreparedPhoto[]
  /** Photos still being downscaled. */
  preparing: number
  /** Creating the meal or uploading: `done` of `total` photos sent. */
  sending: { done: number; total: number } | null
  error: string | null
  /** The meal exists on the server (a retry only uploads). */
  created: boolean
  add: (files: FileList | readonly File[]) => Promise<void>
  remove: (id: string) => void
  /** Create the meal (once) and upload what is not up yet. Resolves with the meal id, or null on failure (see error). */
  send: (meal: { slot: MealSlot; eatenAt: string; note: string }) => Promise<string | null>
  /** The caller now owns the previews (it shows them in the review and releases them). */
  handOff: () => string[]
}

export function usePhotoMeal(): PhotoMeal {
  const queryClient = useQueryClient()
  const [photos, setPhotos] = useState<PreparedPhoto[]>([])
  const [preparing, setPreparing] = useState(0)
  const [sending, setSending] = useState<PhotoMeal['sending']>(null)
  const [error, setError] = useState<string | null>(null)
  const mealId = useRef<string | null>(null)
  const uploaded = useRef(new Set<string>())
  const handedOff = useRef(false)
  const latest = useRef(photos)
  latest.current = photos

  // Leaving without sending: free the thumbnails.
  useEffect(() => () => void (handedOff.current || latest.current.forEach(releasePhoto)), [])

  const add: PhotoMeal['add'] = async (files) => {
    const list = [...files].filter((f) => f.type === '' || f.type.startsWith('image/'))
    const room = MAX_MEAL_PHOTOS - latest.current.length
    const take = list.slice(0, Math.max(0, room))
    setError(list.length > take.length ? `Up to ${MAX_MEAL_PHOTOS} photos per meal; the rest were left out.` : null)
    setPreparing((n) => n + take.length)
    for (const file of take) {
      try {
        const photo = await preparePhoto(file)
        setPhotos((p) => [...p, photo])
      } catch (e) {
        setError(e instanceof Error ? e.message : "That photo couldn't be read.")
      } finally {
        setPreparing((n) => n - 1)
      }
    }
  }

  /** Uploaded photos stay (they are on the meal already). */
  const remove = (id: string) => {
    const photo = latest.current.find((p) => p.id === id)
    if (!photo || uploaded.current.has(id)) return
    releasePhoto(photo)
    setPhotos((p) => p.filter((x) => x.id !== id))
  }

  const send: PhotoMeal['send'] = async ({ slot, eatenAt, note }) => {
    const toSend = latest.current.filter((p) => !uploaded.current.has(p.id))
    setError(null)
    setSending({ done: latest.current.length - toSend.length, total: latest.current.length })
    try {
      if (!mealId.current) {
        const id = crypto.randomUUID()
        const raw = note.trim()
        await call(endpoints.nutrition.createMeal, {
          body: { id, slot, eaten_at: eatenAt, input_method: 'photo', ...(raw ? { raw_text: raw.slice(0, 2000) } : {}) },
        })
        mealId.current = id
      }
      for (const photo of toSend) {
        await uploadMealPhoto(mealId.current, photo)
        uploaded.current.add(photo.id)
        setSending((s) => (s ? { ...s, done: s.done + 1 } : s))
      }
      for (const e of [endpoints.nutrition.listMeals, endpoints.day.get, endpoints.day.range]) {
        void queryClient.invalidateQueries({ queryKey: apiQueryKey(e) })
      }
      return mealId.current
    } catch (e) {
      const left = latest.current.filter((p) => !uploaded.current.has(p.id)).length
      setError(mealId.current ? `The meal is saved but ${left} ${left === 1 ? 'photo' : 'photos'} didn't upload. ${problemText(e)}` : problemText(e))
      return null
    } finally {
      setSending(null)
    }
  }

  const handOff = () => {
    handedOff.current = true
    return latest.current.map((p) => p.previewUrl)
  }

  return { photos, preparing, sending, error, created: mealId.current !== null, add, remove, send, handOff }
}
