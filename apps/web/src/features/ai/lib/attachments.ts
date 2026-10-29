// Owns: what the next Ask AI message carries — the photos Aaron picked, waiting one by one for their tag, and the ones
// already attached (a photo meal logged, a scan sheet uploaded, a blacked-out screenshot uploaded) as chips with their
// ChatAttachmentRef; the limits (8 per message, MAX_SCREENSHOTS screenshots) and the note a progress photo leaves
// ("saved privately"). A progress photo never becomes an attachment.
import { MAX_SCREENSHOTS, type ChatAttachmentRef } from '@fitness/shared/schemas'
import { useEffect, useRef, useState } from 'react'
import { askAiCopy } from '../../../copy/ask-ai'

/** ChatSend takes at most 8 attachments. */
export const MAX_ATTACHMENTS = 8

export interface DraftAttachment {
  key: string
  label: string
  ref: ChatAttachmentRef
  /** A thumbnail of what was uploaded (re-encoded or blacked out), or null; revoked when the chip goes. */
  previewUrl: string | null
}

export interface Attachments {
  attached: DraftAttachment[]
  /** The photo waiting for its tag (the dialog's), and where it is in the picked batch. */
  current: { file: File; index: number; total: number } | null
  screenshotsLeft: number
  /** A line under the composer: a limit hit, or a progress photo saved privately. */
  notice: string | null
  pick: (files: FileList | readonly File[]) => void
  /** The current photo is done (attached, saved privately or skipped): on to the next. */
  next: () => void
  /** Drop every photo still waiting for a tag. */
  cancel: () => void
  add: (a: Omit<DraftAttachment, 'key'>) => void
  remove: (key: string) => void
  setNotice: (text: string | null) => void
  /** The message went: empty the chips (the thumbnails are freed). */
  clear: () => void
  refs: () => ChatAttachmentRef[]
}

export function useAttachments(): Attachments {
  const [attached, setAttached] = useState<DraftAttachment[]>([])
  const [queue, setQueue] = useState<File[]>([])
  const [done, setDone] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const latest = useRef(attached)
  latest.current = attached

  // Leaving the chat frees the thumbnails still on chips.
  useEffect(() => () => latest.current.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl)), [])

  const screenshots = attached.filter((a) => a.ref.tag === 'screenshot').length
  const pick: Attachments['pick'] = (files) => {
    const images = [...files].filter((f) => f.type === '' || f.type.startsWith('image/'))
    const room = MAX_ATTACHMENTS - latest.current.length - queue.length
    const take = images.slice(0, Math.max(0, room))
    setNotice(images.length > take.length ? askAiCopy.attachmentsFull(MAX_ATTACHMENTS) : null)
    if (queue.length === 0) setDone(0)
    setQueue((q) => [...q, ...take])
  }
  const next = () => {
    setQueue((q) => q.slice(1))
    setDone((n) => n + 1)
  }
  const add: Attachments['add'] = (a) => setAttached((list) => [...list, { ...a, key: crypto.randomUUID() }])
  const remove = (key: string) =>
    setAttached((list) => {
      const gone = list.find((a) => a.key === key)
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl)
      return list.filter((a) => a.key !== key)
    })
  const clear = () => {
    latest.current.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl))
    setAttached([])
    setNotice(null)
  }
  const file = queue[0]
  return {
    attached,
    current: file ? { file, index: done + 1, total: done + queue.length } : null,
    screenshotsLeft: Math.max(0, MAX_SCREENSHOTS - screenshots),
    notice,
    pick,
    next,
    cancel: () => {
      setQueue([])
      setDone(0)
    },
    add,
    remove,
    setNotice,
    clear,
    refs: () => latest.current.map((a) => a.ref),
  }
}
