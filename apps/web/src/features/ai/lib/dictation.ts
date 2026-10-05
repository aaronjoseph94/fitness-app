// Owns: dictating a question (SPEC §6 voice → the text path). Where the browser has SpeechRecognition the mic fills the
// composer; iOS Home Screen apps may not expose it, so `supported` is false there and the keyboard's mic does the job.
import { useCallback, useEffect, useRef, useState } from 'react'

/** The slice of the Web Speech API we use (lib.dom declares the events but not the recogniser itself). */
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type RecognitionConstructor = new () => Recognition

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export interface Dictation {
  supported: boolean
  listening: boolean
  /** What is being said right now (not final yet). */
  interim: string
  /** A calm sentence when dictation stopped on an error. */
  error: string | null
  start: () => void
  stop: () => void
}

const ERRORS: Record<string, string | null> = {
  'not-allowed': 'Microphone access is off for this app. Type instead, or use the mic on your keyboard.',
  'service-not-allowed': 'Microphone access is off for this app. Type instead, or use the mic on your keyboard.',
  'no-speech': "Didn't catch that. Tap the mic and try again.",
  network: 'Dictation needs a connection here. Use the mic on your keyboard instead.',
  aborted: null,
}

/** Dictation in Canadian English; each final phrase goes to `onFinal`. Start it from a tap (Safari needs the gesture). */
export function useDictation(onFinal: (phrase: string) => void): Dictation {
  const Ctor = recognitionConstructor()
  const current = useRef<Recognition | null>(null)
  const onFinalRef = useRef(onFinal)
  onFinalRef.current = onFinal
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => current.current?.abort(), [])

  const start = useCallback(() => {
    if (!Ctor) return
    current.current?.abort()
    const r = new Ctor()
    r.lang = 'en-CA'
    r.interimResults = true
    r.continuous = false
    r.onresult = (event) => {
      let pending = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result?.[0]?.transcript ?? ''
        if (result?.isFinal) onFinalRef.current(text.trim())
        else pending += text
      }
      setInterim(pending.trim())
    }
    r.onerror = (event) => setError(event.error in ERRORS ? ERRORS[event.error]! : 'Dictation stopped. Type instead.')
    r.onend = () => {
      setListening(false)
      setInterim('')
      if (current.current === r) current.current = null
    }
    current.current = r
    setError(null)
    setListening(true)
    try {
      r.start()
    } catch {
      setListening(false)
      setError('Dictation could not start. Type instead, or use the mic on your keyboard.')
    }
  }, [Ctor])

  const stop = useCallback(() => current.current?.stop(), [])
  return { supported: Ctor !== null, listening, interim, error, start, stop }
}
