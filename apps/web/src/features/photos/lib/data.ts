// Owns: the photos feature's server data — the photo list (GET /api/photos; signed URLs are short-lived, so the list
// refreshes well before they expire and whenever an image fails to load), the binary upload (POST /api/photos, queued
// on this phone when offline) and delete. Photos are never cached by the service worker: only this list (URLs, not
// pixels) is kept for offline reads, and its links expire within 30 minutes.
import { endpoints } from '@fitness/shared/api'
import type { Pose } from '@fitness/shared/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { apiQueryKey, useApiMutation, useApiQuery, type WriteOutcome } from '../../../api'
import type { PreparedPhoto } from './prepare'

/** Refetch the list every 20 min while open: the Worker signs photo links for 30 min. */
const REFRESH_MS = 20 * 60_000

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
 * Upload one prepared photo through the shared client (octet-stream body, metadata in the query). Resolves with
 * 'saved', or 'queued' when the phone is offline: the photo then waits in this phone's offline queue (IndexedDB, never
 * the service worker cache) and replays in order; its client id makes the replay idempotent. Throws ApiError otherwise.
 */
export function useUploadPhoto(): (photo: PreparedPhoto, meta: PhotoMeta) => Promise<WriteOutcome<typeof endpoints.photos.upload>> {
  const { mutateAsync } = useApiMutation(endpoints.photos.upload, { invalidates: [endpoints.photos.list] })
  return useCallback(
    async (photo, meta) =>
      mutateAsync({
        query: {
          id: photo.id,
          taken_at: meta.takenAt,
          pose: meta.pose,
          width: photo.width,
          height: photo.height,
          content_type: photo.contentType,
          ...(meta.note?.trim() ? { note: meta.note.trim() } : {}),
        },
        body: await photo.blob.arrayBuffer(),
      }),
    [mutateAsync],
  )
}
