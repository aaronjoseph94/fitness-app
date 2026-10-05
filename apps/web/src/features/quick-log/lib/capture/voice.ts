// Owns: dictating a meal (SPEC §6 voice → the text path). Where the browser has SpeechRecognition (Chrome, Safari in a
// tab) the mic button transcribes into the text box; iOS Home Screen apps may not expose it, so `supported` is false
// there and the form falls back to focusing the box with a hint to use the keyboard's mic. Same text either way.
import { useCallback, useEffect, useRef, useState } from 'react'

/** The slice of the Web Speech API we use (lib.dom declares the events but not the recogniser itself). */
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
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
  /** The browser can transcribe here. False: use the keyboard's mic instead. */
  supported: boolean
  listening: boolean
  /** What is being said right now (not yet final). */
  interim: string
  /** A calm sentence when dictation stopped on an error, else null. */
  error: string | null
  /** Start listening; call from a tap (Safari needs the user gesture). */
  start: () => void
  stop: () => void
}

function errorText(code: string): string | null {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access is off for this app. Type instead, or use the mic on your keyboard.'
    case 'no-speech':
      return "Didn't catch that. Tap the mic and try again."
    case 'network':
      return 'Dictation needs a connection here. Use the mic on your keyboard instead.'
    case 'aborted':
      return null
    default:
      return 'Dictation stopped. Type instead, or use the mic on your keyboard.'
  }
}

/** Dictation in Canadian English; each final phrase is handed to `onFinal` (append it to the text box). */
export function useDictation(onFinal: (text: string) => void): Dictation {
  const Ctor = recognitionConstructor()
  const recognition = useRef<Recognition | null>(null)
  const onFinalRef = useRef(onFinal)
  onFinalRef.current = onFinal
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => recognition.current?.abort(), [])

  const start = useCallback(() => {
    if (!Ctor) return
    recognition.current?.abort()
    const r = new Ctor()
    r.lang = 'en-CA'
    r.interimResults = true
    r.continuous = false
    r.maxAlternatives = 1
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
    r.onerror = (event) => setError(errorText(event.error))
    r.onend = () => {
      setListening(false)
      setInterim('')
      if (recognition.current === r) recognition.current = null
    }
    recognition.current = r
    setError(null)
    setListening(true)
    try {
      r.start()
    } catch {
      setListening(false)
      setError(errorText('start'))
    }
  }, [Ctor])

  const stop = useCallback(() => recognition.current?.stop(), [])

  return { supported: Ctor !== null, listening, interim, error, start, stop }
}

/** Append a dictated phrase to what is typed: one space between, nothing doubled. */
export function appendPhrase(text: string, phrase: string): string {
  if (!phrase) return text
  const base = text.trimEnd()
  return base ? `${base} ${phrase}` : phrase
}
