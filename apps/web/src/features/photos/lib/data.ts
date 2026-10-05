// Owns: the photos feature's server data — the photo list (GET /api/photos; signed URLs are short-lived, so the list
// refreshes well before they expire and whenever an image fails to load), the binary upload (POST /api/photos as
// octet-stream with the metadata in the query) and delete. Photos are never cached by the service worker: only this
// list (URLs, not pixels) is kept for offline reads, and its links expire within 30 minutes.
import { endpoints } from '@fitness/shared/api'
import { MAX_UPLOAD_BYTES, PhotoUploadQuery, type Pose, type ProgressPhoto } from '@fitness/shared/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { ApiError, apiQueryKey, useApiMutation, useApiQuery } from '../../../api'
import type { PreparedPhoto } from './prepare'

/** Refetch the list every 20 min while open: the Worker signs photo links for 30 min. */
const REFRESH_MS = 20 * 60_000
const UPLOAD_TIMEOUT_MS = 30_000

export const POSES: readonly Pose[] = ['front', 'side', 'back']
export const POSE_LABEL: Record<Pose, string> = { front: 'Front', side: 'Side', back: 'Back' }

/** Every progress photo, newest first (filtering by pose happens on the phone, so switching filters is instant). */
export function usePhotos() {
  return useApiQuery(endpoints.photos.list, { query: {} }, { staleTime: 5 * 60_000, refetchInterval: REFRESH_MS })
}

/** Mark the list stale (an image failed to load: its link probably expired). */
export function useRefreshPhotos(): () => void {
  const queryClient = useQueryClient()
  return useCallback(() => void queryClient.invalidateQueries({ queryKey: apiQueryKey(endpoints.photos.list) }), [queryClient])
}

export function useRemovePhoto() {
  return useApiMutation(endpoints.photos.remove, { invalidates: [endpoints.photos.list] })
}

export interface PhotoMeta {
  pose: Pose
  /** ISO instant. */
  takenAt: string
  note?: string
}

/**
 * Upload one prepared photo. Resolves with the stored photo (validated); throws ApiError like every other call
 * ('network' when offline or timed out, 'auth-expired' on an Access bounce, 'http' otherwise). Not queued offline:
 * the queue carries JSON bodies only, so the capture screen keeps the shot and offers a retry.
 */
export async function uploadPhoto(photo: PreparedPhoto, meta: PhotoMeta, signal?: AbortSignal): Promise<ProgressPhoto> {
  const endpoint = endpoints.photos.upload
  const query = {
    id: photo.id,
    taken_at: meta.takenAt,
    pose: meta.pose,
    width: String(photo.width),
    height: String(photo.height),
    content_type: photo.contentType,
    ...(meta.note?.trim() ? { note: meta.note.trim() } : {}),
  }
  const path = `${endpoint.path}?${new URLSearchParams(query).toString()}`
  const label = `POST ${endpoint.path}`
  const checked = PhotoUploadQuery.safeParse(query)
  if (!checked.success || photo.blob.size === 0 || photo.blob.size > MAX_UPLOAD_BYTES) {
    throw new ApiError({ kind: 'invalid-request', request: label, message: 'The photo is empty or too large' })
  }
  const timeout = AbortSignal.timeout(UPLOAD_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/octet-stream' },
      body: photo.blob,
      credentials: 'include',
      // Access answers an expired session with a redirect: see it, never follow it.
      redirect: 'manual',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
  } catch (cause) {
    if (signal?.aborted) throw cause
    throw new ApiError({ kind: 'network', request: label, message: navigator.onLine ? 'Could not reach the server' : 'You are offline' })
  }
  if (response.type === 'opaqueredirect' || response.status === 401) {
    throw new ApiError({ kind: 'auth-expired', request: label, message: 'Your sign-in expired' })
  }
  const body: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const fields = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
    const code = typeof fields.error === 'string' ? fields.error : null
    const message = typeof fields.message === 'string' ? fields.message : (code ?? `HTTP ${response.status}`)
    throw new ApiError({ kind: 'http', request: label, status: response.status, code, message, detail: body })
  }
  const parsed = endpoint.response.safeParse(body)
  if (!parsed.success) throw new ApiError({ kind: 'invalid-response', request: label, message: 'Unexpected photo response', detail: parsed.error.issues })
  return parsed.data
}
