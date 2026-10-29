// Owns: the Ask AI "dump or ask" composer (1d) — the attached photos as chips (each with remove) over a growing text
// box in a warm well (radius 20, a hairline ring that turns violet while focused) that invites a dump, the attach
// button (photos picked here are tagged in the attach dialog), the dictation mic where the browser can transcribe, the
// coral Send (Enter sends, Shift+Enter breaks the line) and the helper line under it. Offline a message still sends (it
// waits in the queue) and the helper line says so; attaching needs a connection.
import AddPhotoAlternateOutlined from '@mui/icons-material/AddPhotoAlternateOutlined'
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded'
import CancelRounded from '@mui/icons-material/CancelRounded'
import MicNoneRounded from '@mui/icons-material/MicNoneRounded'
import StopRounded from '@mui/icons-material/StopRounded'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import InputBase from '@mui/material/InputBase'
import { useRef } from 'react'
import { askAiCopy } from '../../../copy/ask-ai'
import { tokens, transitionOf } from '../../../theme'
import { appendPhrase, useDictation } from '../../quick-log'
import type { DraftAttachment } from './attachments'

const coral = tokens.summit.cta.coral
/** The composer well's radius, px (1d draws 20; the nearest token is the large well's 18). */
const COMPOSER_RADIUS = tokens.summit.radius.wellLarge

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  sending: boolean
  online: boolean
  autoFocus?: boolean
  /** What the message carries, as chips over the text box. */
  attachments?: readonly DraftAttachment[]
  /** Photos picked with the attach button (each is tagged next); absent: no attach button. */
  onAttach?: (files: FileList) => void
  onRemoveAttachment?: (key: string) => void
  /** A line for the helper row (a limit hit, a progress photo saved privately). */
  notice?: string | null
}

export function Composer({
  value,
  onChange,
  onSend,
  sending,
  online,
  autoFocus,
  attachments = [],
  onAttach,
  onRemoveAttachment,
  notice = null,
}: ComposerProps) {
  const dictation = useDictation((phrase) => onChange(appendPhrase(value, phrase)))
  const picker = useRef<HTMLInputElement>(null)
  // Offline a message is queued and answered when the connection is back, so Send stays on.
  const canSend = !sending && value.trim().length > 0
  const hint = !online ? askAiCopy.offlineHelper : (dictation.error ?? notice)
  const shown =
    dictation.listening && dictation.interim ? `${value}${value ? ' ' : ''}${dictation.interim}` : value
  return (
    <Box>
      {attachments.length > 0 && (
        <Box
          data-testid="ask-ai-attachments"
          sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px', mb: '8px' }}
        >
          {attachments.map((a) => (
            <Chip
              key={a.key}
              data-testid="ask-ai-attachment"
              label={a.label}
              avatar={a.previewUrl ? <Avatar alt="" src={a.previewUrl} variant="rounded" /> : undefined}
              onDelete={onRemoveAttachment ? () => onRemoveAttachment(a.key) : undefined}
              // The meal and the scan are logged already: removing the chip only leaves them out of this message.
              deleteIcon={
                <CancelRounded titleAccess={askAiCopy.chipRemove(a.label, a.ref.tag !== 'screenshot')} />
              }
              sx={{
                maxWidth: '100%',
                border: 0,
                borderRadius: `${tokens.radius.pill}px`,
                bgcolor: tokens.summit.surface.soft,
                color: tokens.summit.ink.deep,
                fontSize: tokens.font.size.small,
                fontWeight: tokens.font.weight.label,
              }}
            />
          ))}
        </Box>
      )}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '8px',
          pl: '18px',
          pr: '8px',
          py: '8px',
          bgcolor: tokens.ink.panel,
          borderRadius: `${COMPOSER_RADIUS}px`,
          boxShadow: `inset 0 0 0 2px ${tokens.ink.hairline}`,
          transition: transitionOf('box-shadow', tokens.motion.duration.fast),
          '&:focus-within': {
            boxShadow: `inset 0 0 0 2px ${tokens.accent.main}, 0 0 0 ${tokens.focusRing.inputRing}px ${tokens.accent.ring}`,
          },
        }}
      >
        <InputBase
          multiline
          // Empty, the box is one line tall (2a) even where the placeholder would wrap: it sizes itself to the
          // placeholder's text, which ends in an ellipsis instead (below).
          maxRows={shown ? 6 : 1}
          value={shown}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              if (canSend) onSend()
            }
          }}
          placeholder={dictation.listening ? askAiCopy.listening : askAiCopy.placeholder}
          inputProps={{ 'aria-label': 'Message', maxLength: 4000, enterKeyHint: 'send' }}
          autoFocus={autoFocus}
          sx={{
            flex: 1,
            // The text box gives way to the mic and Send in a narrow thread, never the other way round.
            minWidth: 0,
            alignSelf: 'center',
            py: '9px',
            fontSize: tokens.font.size.emphasis,
            fontWeight: tokens.font.weight.body,
            lineHeight: tokens.font.leading.label,
            // The placeholder stays one line however narrow the thread: it ends in an ellipsis rather than wrapping.
            '& textarea:placeholder-shown, & textarea::placeholder': {
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            },
          }}
        />
        {onAttach && (
          <>
            <input
              ref={picker}
              type="file"
              accept="image/*"
              multiple
              hidden
              data-testid="ask-ai-attach-input"
              onChange={(e) => {
                if (e.target.files?.length) onAttach(e.target.files)
                e.target.value = '' // picking the same photo again still fires
              }}
            />
            <IconButton
              aria-label={askAiCopy.attach}
              data-testid="ask-ai-attach-button"
              onClick={() => picker.current?.click()}
              disabled={sending || !online}
              sx={{ color: tokens.ink.muted }}
            >
              <AddPhotoAlternateOutlined fontSize="small" />
            </IconButton>
          </>
        )}
        {dictation.supported && (
          <IconButton
            aria-label={dictation.listening ? 'Stop dictation' : 'Dictate'}
            onClick={dictation.listening ? dictation.stop : dictation.start}
            disabled={sending}
            sx={{ color: dictation.listening ? tokens.status.flag : tokens.ink.muted }}
          >
            {dictation.listening ? <StopRounded fontSize="small" /> : <MicNoneRounded fontSize="small" />}
          </IconButton>
        )}
        <IconButton
          aria-label="Send"
          data-testid="ask-ai-send"
          onClick={onSend}
          disabled={!canSend}
          sx={{
            backgroundImage: coral.bg,
            color: coral.text,
            boxShadow: coral.shadow,
            '&:hover': { backgroundImage: coral.bg, color: coral.text, boxShadow: coral.shadowHover },
            // Still reads as the coral send while there is nothing to send yet, only quieter.
            '&.Mui-disabled': {
              backgroundImage: coral.bg,
              color: coral.text,
              boxShadow: 'none',
              opacity: 0.45,
            },
          }}
        >
          <ArrowUpwardRounded fontSize="small" />
        </IconButton>
      </Box>
      <Box
        sx={{
          mt: '10px',
          // The keyboard shortcuts mean little on a phone, whose sticky composer keeps every line it can.
          display: { xs: hint ? 'block' : 'none', md: 'block' },
          fontSize: tokens.font.size.caption,
          fontWeight: tokens.font.weight.body,
          lineHeight: tokens.font.leading.caption,
          color: hint ? tokens.ink.label : tokens.ink.muted,
        }}
      >
        {hint ?? askAiCopy.helper}
      </Box>
    </Box>
  )
}
