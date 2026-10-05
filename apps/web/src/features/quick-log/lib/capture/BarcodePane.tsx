// Owns: the barcode part of the meal form (SPEC §6) — a live rear-camera scan inside a viewfinder, the typed-code
// fallback (no camera, access refused, or the scanner could not load), the lookup GET /api/foods/search?barcode=
// (cache, then Open Food Facts), then grams with live kcal and macros, and "Log" as a one-item barcode meal.
import KeyboardRounded from '@mui/icons-material/KeyboardRounded'
import QrCodeScannerRounded from '@mui/icons-material/QrCodeScannerRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import TextField from '@mui/material/TextField'
import { alpha } from '@mui/material/styles'
import { endpoints } from '@fitness/shared/api'
import type { Food } from '@fitness/shared/schemas'
import { useEffect, useRef, useState } from 'react'
import { useApiQuery } from '../../../../api'
import { formatNumber } from '../../../../components'
import { tokens } from '../../../../theme'
import { FoodPicker, pickedFromFood, type PickedFood } from '../FoodPicker'
import { portion } from '../nutrition'
import { FoodIcon } from '../review/food-icons'
import { NumberField, parseNumber, problemText } from '../ui'
import { isValidGtin, loadBarcodeReader, openRearCamera, scanVideo, stopStream } from './barcode'

export interface BarcodeItem {
  id: string
  food_id: string
  grams: number
  description: string
}

interface BarcodePaneProps {
  busy: boolean
  onSave: (item: BarcodeItem, kcal: number) => void
}

type CameraProblem = 'denied' | 'no-camera' | 'no-reader' | null

export function BarcodePane({ busy, onSave }: BarcodePaneProps) {
  const [code, setCode] = useState<string | null>(null)
  const [typing, setTyping] = useState(false)
  const [searching, setSearching] = useState(false)
  const lookup = useApiQuery(endpoints.nutrition.searchFoods, { query: { barcode: code ?? '00000000' } }, { enabled: code !== null, staleTime: 60 * 60_000 })
  const found: Food | null = code ? (lookup.data?.find((f) => f.barcode === code) ?? lookup.data?.[0] ?? null) : null
  const [picked, setPicked] = useState<PickedFood | null>(null)
  const food = picked ?? (found ? pickedFromFood(found) : null)

  const rescan = () => {
    setCode(null)
    setPicked(null)
    setSearching(false)
    setTyping(false)
  }

  if (food) return <FoundFood key={food.id} food={food} code={code} busy={busy} onSave={onSave} onRescan={rescan} />

  if (code !== null) {
    return (
      <Box sx={{ display: 'grid', gap: 3 }} data-testid="barcode-lookup">
        <Box sx={{ fontSize: 14, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>Barcode {code}</Box>
        {lookup.isLoading ? (
          <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 15 }}>
            <CircularProgress size={18} aria-hidden /> Looking it up…
          </Box>
        ) : lookup.isError ? (
          <Box role="alert" sx={{ fontSize: 15 }}>
            {problemText(lookup.error)}
          </Box>
        ) : (
          <Box sx={{ fontSize: 15, lineHeight: 1.5 }}>Not in Open Food Facts yet. Find it by name, or add it as a new food.</Box>
        )}
        {!lookup.isLoading && (searching ? <FoodPicker autoFocus onPick={setPicked} /> : null)}
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Button variant="outlined" startIcon={<QrCodeScannerRounded />} onClick={rescan}>
            Scan again
          </Button>
          {!lookup.isLoading && !searching && (
            <Button variant="contained" onClick={() => setSearching(true)}>
              Find by name
            </Button>
          )}
          {lookup.isError && (
            <Button variant="text" onClick={() => void lookup.refetch()}>
              Try again
            </Button>
          )}
        </Box>
      </Box>
    )
  }

  return typing ? <TypedCode onCode={setCode} onCamera={() => setTyping(false)} /> : <Scanner onCode={setCode} onType={() => setTyping(true)} />
}

function Scanner({ onCode, onType }: { onCode: (code: string) => void; onType: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [problem, setProblem] = useState<CameraProblem>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let stopScan: (() => void) | null = null
    let cancelled = false
    void (async () => {
      try {
        const [reader, camera] = await Promise.all([
          loadBarcodeReader().catch(() => {
            throw new Error('no-reader')
          }),
          openRearCamera(),
        ])
        stream = camera
        if (cancelled || !video.current) return stopStream(camera)
        const el = video.current
        el.muted = true
        el.srcObject = camera
        await el.play().catch(() => undefined)
        setReady(true)
        stopScan = scanVideo(el, reader, (code) => {
          if ('vibrate' in navigator) navigator.vibrate?.(40)
          stopStream(stream)
          onCode(code)
        })
      } catch (e) {
        if (cancelled) return
        const name = e instanceof DOMException ? e.name : e instanceof Error ? e.message : ''
        setProblem(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'no-reader' ? 'no-reader' : 'no-camera')
      }
    })()
    return () => {
      cancelled = true
      stopScan?.()
      stopStream(stream)
    }
  }, [onCode])

  if (problem) {
    const text = {
      denied: 'Camera access is off for this app. Allow it in Settings, or type the numbers under the barcode.',
      'no-camera': "There's no camera available here. Type the numbers under the barcode instead.",
      'no-reader': "The scanner didn't load (it needs a connection the first time). Type the numbers instead.",
    }[problem]
    return <TypedCode note={text} onCode={onCode} />
  }

  return (
    <Box sx={{ display: 'grid', gap: 3 }} data-testid="barcode-scanner">
      <Box sx={{ position: 'relative', aspectRatio: '4 / 3', borderRadius: `${tokens.radius.control}px`, overflow: 'hidden', bgcolor: tokens.ink.text }}>
        <Box component="video" ref={video} playsInline muted autoPlay aria-label="Camera" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        {/* Viewfinder: a clear window, the rest dimmed. */}
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            left: '10%',
            right: '10%',
            top: '32%',
            bottom: '32%',
            borderRadius: `${tokens.radius.control}px`,
            border: `2px solid ${tokens.ink.card}`,
            boxShadow: `0 0 0 999px ${alpha(tokens.ink.text, 0.45)}`,
          }}
        >
          <Box sx={{ position: 'absolute', left: 12, right: 12, top: '50%', height: 2, bgcolor: alpha(tokens.metric.calories, 0.85), borderRadius: 1 }} />
        </Box>
        {!ready && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: tokens.ink.card, fontSize: 14 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <CircularProgress size={18} sx={{ color: tokens.ink.card }} aria-hidden /> Starting the camera…
            </Box>
          </Box>
        )}
      </Box>
      <Box sx={{ fontSize: 14, color: 'text.secondary', textAlign: 'center' }}>Line the barcode up inside the frame.</Box>
      <Button variant="text" startIcon={<KeyboardRounded />} onClick={onType} sx={{ justifySelf: 'center' }}>
        Type the numbers instead
      </Button>
    </Box>
  )
}

function TypedCode({ note, onCode, onCamera }: { note?: string; onCode: (code: string) => void; onCamera?: () => void }) {
  const [text, setText] = useState('')
  const digits = text.replace(/\D/g, '')
  const lengthOk = digits.length >= 8 && digits.length <= 14
  const checkOk = !lengthOk || isValidGtin(digits)
  return (
    <Box
      component="form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (lengthOk) onCode(digits)
      }}
      sx={{ display: 'grid', gap: 3 }}
      data-testid="barcode-typed"
    >
      {note && <Box sx={{ fontSize: 14, color: 'text.secondary', lineHeight: 1.5 }}>{note}</Box>}
      <TextField
        label="Barcode number"
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
        autoComplete="off"
        helperText={lengthOk && !checkOk ? "The last digit doesn't check out; look it up anyway or retype it." : '8 to 14 digits, under the bars.'}
        slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9 ]*', maxLength: 18, enterKeyHint: 'search' } }}
      />
      <Box sx={{ display: 'flex', gap: 2 }}>
        {onCamera && (
          <Button variant="text" startIcon={<QrCodeScannerRounded />} onClick={onCamera}>
            Use the camera
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button type="submit" variant="contained" disabled={!lengthOk}>
          Look up
        </Button>
      </Box>
    </Box>
  )
}

function FoundFood({
  food,
  code,
  busy,
  onSave,
  onRescan,
}: {
  food: PickedFood
  code: string | null
  busy: boolean
  onSave: (item: BarcodeItem, kcal: number) => void
  onRescan: () => void
}) {
  const [gramsText, setGramsText] = useState(String(Math.round(food.servingG ?? 100)))
  const grams = parseNumber(gramsText)
  const valid = grams !== null && grams > 0 && grams <= 5000
  const n = valid ? portion(food.per100, grams) : null
  const presets = [...new Set([food.servingG ? Math.round(food.servingG) : null, 100].filter((g): g is number => g !== null && g > 0))]

  return (
    <Box sx={{ display: 'grid', gap: 3 }} data-testid="barcode-found">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <FoodIcon name={food.name} size={44} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ fontSize: 16, fontWeight: tokens.font.weight.label, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{food.name}</Box>
          <Box sx={{ fontSize: 13, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
            {formatNumber(food.per100.kcal_per_100g)} kcal · {formatNumber(food.per100.protein_g, 1)} g protein per 100 g
            {code ? ` · ${code}` : ''}
          </Box>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <NumberField label="Grams" value={gramsText} onChange={setGramsText} unit="g" error={!valid} sx={{ width: 140 }} />
        {presets.map((g) => (
          <Chip
            key={g}
            label={g === Math.round(food.servingG ?? -1) ? `1 serving · ${g} g` : `${g} g`}
            onClick={() => setGramsText(String(g))}
            variant={grams === g ? 'filled' : 'outlined'}
            sx={{ height: tokens.tapTarget - 8 }}
          />
        ))}
      </Box>
      {n && (
        <Box sx={{ fontSize: 13, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
          {formatNumber(n.protein_g)} g protein · {formatNumber(n.carbs_g)} g carbs · {formatNumber(n.fat_g)} g fat
        </Box>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 2 }}>
        <Button onClick={onRescan} disabled={busy}>
          Scan another
        </Button>
        <Button
          variant="contained"
          size="large"
          disabled={!valid || busy}
          onClick={() => valid && n && onSave({ id: crypto.randomUUID(), food_id: food.id, grams, description: food.name }, n.kcal)}
          data-testid="barcode-log"
        >
          {busy ? 'Saving…' : n ? `Log · ${formatNumber(n.kcal)} kcal` : 'Log'}
        </Button>
      </Box>
    </Box>
  )
}
