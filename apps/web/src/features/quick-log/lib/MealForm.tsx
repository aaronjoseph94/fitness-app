// Owns: the meal form (SPEC §6, five input methods) — the slot (default by time of day), three capture tiles (photo:
// camera or gallery, several; barcode scan; voice into the text box) and three panes (favourites and recents, one
// tap; foods by search, grams each, live kcal; a free-text description). Every meal is POST /api/meals with a client
// id and eaten_at. Text, voice and photo meals hand over to the review (analysis, then items to confirm); the rest
// close the sheet with a notice.
import CloseRounded from '@mui/icons-material/CloseRounded'
import MicNoneRounded from '@mui/icons-material/MicNoneRounded'
import MicRounded from '@mui/icons-material/MicRounded'
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined'
import QrCodeScannerRounded from '@mui/icons-material/QrCodeScannerRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import type SvgIcon from '@mui/material/SvgIcon'
import { endpoints } from '@fitness/shared/api'
import type { MealCreate, MealSlot } from '@fitness/shared/schemas'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { problemText, useApiQuery } from '../../../api'
import { formatNumber, NumberField, parseNumber } from '../../../components'
import { tokens } from '../../../theme'
import { BarcodePane } from './capture/BarcodePane'
import { PhotoPane } from './capture/PhotoPane'
import { usePhotoMeal } from './capture/photo-meal'
import { appendPhrase, useDictation, type Dictation } from './capture/voice'
import { clockOf, instantAt, todayLocal } from './dates'
import { FavouritesPane, type QuickMeal } from './FavouritesPane'
import { FoodPicker, type PickedFood } from './FoodPicker'
import { defaultSlot, portion, SLOT_LABEL, SLOT_TIME, sum, visibleSlots } from './nutrition'
import { useRecentFoods, useRecentFoodsState } from './reads'
import { noticeFor, type LogNotice } from './ui'
import { useLogMutation } from './writes'

type Mode = 'favourites' | 'foods' | 'describe' | 'photo' | 'barcode'

/** A meal the AI is analysing: the sheet switches to its review. `previews` are thumbnails made on this phone. */
export interface CapturedMeal {
  mealId: string
  date: string
  previews: string[]
}

interface MealFormProps {
  date: string
  slot?: MealSlot
  onLogged: (notice: LogNotice) => void
  /** A text, voice or photo meal reached the server: show its analysis and review. */
  onCaptured: (meal: CapturedMeal) => void
}

export function MealForm({ date, slot: initialSlot, onLogged, onCaptured }: MealFormProps) {
  const isToday = date === todayLocal()
  const [slot, setSlot] = useState<MealSlot>(initialSlot ?? (isToday ? defaultSlot(clockOf(Date.now())) : 'lunch'))
  const favourites = useApiQuery(endpoints.nutrition.listFavourites, {})
  const recents = useRecentFoodsState(date)
  const hasQuick = (favourites.data?.length ?? 0) > 0 || recents.foods.length > 0
  const [mode, setMode] = useState<Mode | null>(null)
  // Decide once favourites and recent foods have both loaded (whichever answers last), then hold it, so a late answer
  // never swaps the pane under Aaron's thumb.
  const quickLoading = favourites.isLoading || recents.isLoading
  useEffect(() => {
    if (mode === null && !quickLoading) setMode(hasQuick ? 'favourites' : 'describe')
  }, [mode, quickLoading, hasQuick])
  const shown: Mode = mode ?? 'favourites'
  const create = useLogMutation(endpoints.nutrition.createMeal)

  // Describe / voice share one text box. The voice tile starts dictation (or focuses the box with a hint) in the tap.
  const [text, setText] = useState('')
  const [spoken, setSpoken] = useState(false)
  const [keyboardMicHint, setKeyboardMicHint] = useState(false)
  const dictation = useDictation((phrase) => {
    setSpoken(true)
    setText((t) => appendPhrase(t, phrase))
  })
  const textBox = useRef<HTMLTextAreaElement>(null)

  const photo = usePhotoMeal()
  const fileInput = useRef<HTMLInputElement>(null)

  const slots = visibleSlots()
  const eatenAt = () => (isToday ? new Date().toISOString() : instantAt(date, SLOT_TIME[slot]))

  const save = (body: MealCreate, message: string) => {
    create.mutate({ body }, { onSuccess: (o) => onLogged(noticeFor(o, message)) })
  }

  const logQuick = (meal: QuickMeal) => {
    const base = { id: crypto.randomUUID(), slot, eaten_at: eatenAt() }
    const message = `${SLOT_LABEL[slot]}: ${meal.label} · ${formatNumber(meal.nutrients.kcal)} kcal`
    if (meal.kind === 'favourite') save({ ...base, input_method: 'favorite', favorite_id: meal.favouriteId, scale: meal.scale }, message)
    else save({ ...base, input_method: 'manual', items: [{ id: crypto.randomUUID(), food_id: meal.foodId, grams: meal.grams, description: meal.label }] }, message)
  }

  const saveText = (raw: string) => {
    const id = crypto.randomUUID()
    const body: MealCreate = { id, slot, eaten_at: eatenAt(), input_method: spoken ? 'voice' : 'text', raw_text: raw }
    create.mutate(
      { body },
      {
        onSuccess: (outcome) => {
          // Queued offline: the analysis starts once it syncs; nothing to watch here.
          if (outcome.status === 'queued') onLogged(noticeFor(outcome, `${SLOT_LABEL[slot]} saved; it's analysed when it syncs`))
          else onCaptured({ mealId: id, date, previews: [] })
        },
      },
    )
  }

  const sendPhotos = async (note: string) => {
    const mealId = await photo.send({ slot, eatenAt: eatenAt(), note })
    if (mealId) onCaptured({ mealId, date, previews: photo.handOff() })
  }

  // Taps: each runs inside the user gesture (iOS opens the picker, the keyboard or the mic only from one).
  const pickPhotos = () => {
    flushSync(() => setMode('photo'))
    fileInput.current?.click()
  }
  const speak = () => {
    flushSync(() => {
      setMode('describe')
      setKeyboardMicHint(!dictation.supported)
    })
    textBox.current?.focus()
    // The meal counts as spoken once a phrase arrives (useDictation's onFinal), not on the tap: with the mic refused,
    // what Aaron then types is a text meal.
    if (dictation.supported) dictation.start()
  }

  return (
    <Box sx={{ display: 'grid', gap: 4 }} data-testid="meal-form">
      <Box role="radiogroup" aria-label="Slot" sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {slots.map((s) => (
          <Chip
            key={s}
            role="radio"
            aria-checked={slot === s}
            label={SLOT_LABEL[s]}
            onClick={() => setSlot(s)}
            variant={slot === s ? 'filled' : 'outlined'}
            sx={{
              height: tokens.tapTarget,
              px: 1,
              borderRadius: tokens.radius.chip,
              ...(slot === s ? { bgcolor: tokens.ink.text, color: tokens.ink.card, '&:hover': { bgcolor: tokens.ink.text } } : {}),
            }}
          />
        ))}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }} aria-label="Capture">
        <CaptureTile Icon={PhotoCameraOutlined} label="Photo" active={shown === 'photo'} onClick={pickPhotos} testId="capture-photo" />
        <CaptureTile Icon={QrCodeScannerRounded} label="Barcode" active={shown === 'barcode'} onClick={() => setMode('barcode')} testId="capture-barcode" />
        <CaptureTile Icon={dictation.listening ? MicRounded : MicNoneRounded} label={dictation.listening ? 'Listening…' : 'Voice'} active={dictation.listening} onClick={speak} testId="capture-voice" />
      </Box>
      {/* No `capture` attribute: iOS and Android then offer both the camera and the photo library. */}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = e.target.files
          if (files && files.length > 0) {
            setMode('photo')
            void photo.add([...files])
          }
          e.target.value = ''
        }}
        data-testid="photo-input"
      />

      <ToggleButtonGroup
        value={shown === 'photo' || shown === 'barcode' ? null : shown}
        exclusive
        fullWidth
        onChange={(_, v: Mode | null) => v && setMode(v)}
        aria-label="How to log"
        sx={{ '& .MuiToggleButton-root': { minHeight: tokens.tapTarget, textTransform: 'none', fontWeight: tokens.font.weight.label } }}
      >
        <ToggleButton value="favourites">Favourites</ToggleButton>
        <ToggleButton value="foods">Foods</ToggleButton>
        <ToggleButton value="describe">Describe</ToggleButton>
      </ToggleButtonGroup>

      {shown === 'favourites' && <FavouritesPane date={date} onLog={logQuick} busy={create.isPending} />}
      {shown === 'foods' && (
        <FoodsPane
          date={date}
          busy={create.isPending}
          onSave={(items, kcal) =>
            save(
              { id: crypto.randomUUID(), slot, eaten_at: eatenAt(), input_method: 'manual', items },
              `${SLOT_LABEL[slot]}: ${items.length} ${items.length === 1 ? 'item' : 'items'} · ${formatNumber(kcal)} kcal`,
            )
          }
        />
      )}
      {shown === 'describe' && (
        <DescribePane
          text={text}
          onText={setText}
          textBox={textBox}
          dictation={dictation}
          keyboardMicHint={keyboardMicHint}
          onMic={speak}
          busy={create.isPending}
          onSave={saveText}
        />
      )}
      {shown === 'photo' && <PhotoPane capture={photo} onPick={() => fileInput.current?.click()} onSend={(note) => void sendPhotos(note)} onDescribe={() => setMode('describe')} />}
      {shown === 'barcode' && (
        <BarcodePane
          busy={create.isPending}
          onSave={(item, kcal) =>
            save(
              { id: crypto.randomUUID(), slot, eaten_at: eatenAt(), input_method: 'barcode', items: [item] },
              `${SLOT_LABEL[slot]}: ${item.description} · ${formatNumber(kcal)} kcal`,
            )
          }
        />
      )}

      {create.isError && (
        <Box role="alert" sx={{ color: 'error.main', fontSize: tokens.font.size.small }}>
          {problemText(create.error)}
        </Box>
      )}
    </Box>
  )
}

function CaptureTile({
  Icon,
  label,
  active,
  onClick,
  testId,
}: {
  Icon: typeof SvgIcon
  label: string
  active: boolean
  onClick: () => void
  testId: string
}) {
  return (
    <ButtonBase
      onClick={onClick}
      data-testid={testId}
      aria-pressed={active}
      sx={{
        minHeight: 64,
        borderRadius: `${tokens.radius.control}px`,
        border: `1px solid ${active ? tokens.ink.text : tokens.ink.border}`,
        bgcolor: tokens.ink.card,
        display: 'grid',
        placeItems: 'center',
        gap: 0.5,
        py: 1.5,
        fontSize: tokens.font.size.label,
        fontWeight: tokens.font.weight.label,
        color: tokens.ink.text,
      }}
    >
      <Icon sx={{ color: tokens.metric.calories }} />
      {label}
    </ButtonBase>
  )
}

interface DraftItem {
  /** The meal item's client id. */
  id: string
  food: PickedFood
  grams: string
}

type ManualItem = { id: string; food_id: string; grams: number; description: string }

function FoodsPane({ date, busy, onSave }: { date: string; busy: boolean; onSave: (items: ManualItem[], kcal: number) => void }) {
  const [items, setItems] = useState<DraftItem[]>([])
  const recents = useRecentFoods(date)
  const lastGrams = new Map(recents.map((r) => [r.foodId, r.grams]))

  const add = (food: PickedFood) => {
    const grams = lastGrams.get(food.id) ?? food.servingG ?? 100
    setItems((list) => [...list, { id: crypto.randomUUID(), food, grams: String(Math.round(grams)) }])
  }
  const parsed = items.map((item) => ({ item, grams: parseNumber(item.grams) }))
  const valid = parsed.length > 0 && parsed.every(({ grams }) => grams !== null && grams > 0 && grams <= 5000)
  const total = sum(parsed.map(({ item, grams }) => portion(item.food.per100, grams ?? 0)))

  return (
    <Box sx={{ display: 'grid', gap: 4 }} data-testid="foods-pane">
      <FoodPicker onPick={add} autoFocus={items.length === 0} />
      {items.length > 0 && (
        <Box component="ul" aria-label="Items" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 2 }}>
          {parsed.map(({ item, grams }) => (
            <Box component="li" key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ fontSize: tokens.font.size.emphasis, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.food.name}</Box>
                <Box sx={{ fontSize: tokens.font.size.label, color: 'text.secondary' }}>
                  {grams !== null && grams > 0 ? `${formatNumber(portion(item.food.per100, grams).kcal)} kcal` : 'Enter grams'}
                </Box>
              </Box>
              <NumberField
                value={item.grams}
                onChange={(v) => setItems((list) => list.map((i) => (i.id === item.id ? { ...i, grams: v } : i)))}
                unit="g"
                size="small"
                sx={{ width: 104 }}
                slotProps={{ htmlInput: { 'aria-label': `Grams of ${item.food.name}` } }}
              />
              <IconButton aria-label={`Remove ${item.food.name}`} onClick={() => setItems((list) => list.filter((i) => i.id !== item.id))}>
                <CloseRounded />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}
      <Button
        variant="contained"
        size="large"
        disabled={!valid || busy}
        onClick={() =>
          onSave(
            parsed.map(({ item, grams }) => ({ id: item.id, food_id: item.food.id, grams: grams ?? 0, description: item.food.name })),
            total.kcal,
          )
        }
        data-testid="meal-save-items"
      >
        {busy ? 'Saving…' : items.length === 0 ? 'Add foods to log' : `Log meal · ${formatNumber(total.kcal)} kcal · ${formatNumber(total.protein_g)} g protein`}
      </Button>
    </Box>
  )
}

interface DescribePaneProps {
  text: string
  onText: (text: string) => void
  textBox: RefObject<HTMLTextAreaElement | null>
  dictation: Dictation
  /** The browser can't transcribe (iOS Home Screen app): point at the keyboard's mic. */
  keyboardMicHint: boolean
  onMic: () => void
  busy: boolean
  onSave: (text: string) => void
}

function DescribePane({ text, onText, textBox, dictation, keyboardMicHint, onMic, busy, onSave }: DescribePaneProps) {
  const trimmed = text.trim()
  return (
    <Box
      component="form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (trimmed) onSave(trimmed)
      }}
      sx={{ display: 'grid', gap: 3 }}
      data-testid="describe-pane"
    >
      <TextField
        label="What did you eat?"
        placeholder="2 eggs, toast with butter, black coffee"
        value={dictation.interim ? appendPhrase(text, dictation.interim) : text}
        onChange={(e) => onText(e.target.value)}
        multiline
        minRows={3}
        inputRef={textBox}
        slotProps={{
          htmlInput: { maxLength: 2000 },
          input: dictation.supported
            ? {
                endAdornment: (
                  <InputAdornment position="end" sx={{ alignSelf: 'flex-end', mb: 1 }}>
                    <IconButton
                      aria-label={dictation.listening ? 'Stop dictation' : 'Dictate'}
                      onClick={dictation.listening ? dictation.stop : onMic}
                      sx={{ color: dictation.listening ? tokens.metric.calories : tokens.ink.secondary }}
                    >
                      {dictation.listening ? <MicRounded /> : <MicNoneRounded />}
                    </IconButton>
                  </InputAdornment>
                ),
              }
            : undefined,
        }}
      />
      {keyboardMicHint && !dictation.supported && (
        <Box role="status" data-testid="keyboard-mic-hint" sx={{ fontSize: tokens.font.size.small, color: tokens.ink.text, display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <MicNoneRounded fontSize="small" sx={{ color: tokens.metric.calories }} />
          Tap the mic on your keyboard to dictate.
        </Box>
      )}
      {dictation.listening && (
        <Box role="status" sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>
          Listening… say what you ate, then pause.
        </Box>
      )}
      {dictation.error && (
        <Box role="alert" sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>
          {dictation.error}
        </Box>
      )}
      <Box sx={{ fontSize: tokens.font.size.label, color: 'text.secondary', lineHeight: 1.5 }}>
        The AI turns it into items with grams and kcal for you to check before it counts.
      </Box>
      <Button type="submit" variant="contained" size="large" disabled={!trimmed || busy || dictation.listening} data-testid="meal-save-text">
        {busy ? 'Saving…' : 'Analyse'}
      </Button>
    </Box>
  )
}
