// Owns: the Ask AI composer (2a) — a growing text box in a 12 px-radius frame (blue border and ring while focused), the
// dictation mic where the browser can transcribe, the blue Send (Enter sends, Shift+Enter breaks the line) and the
// helper line under it. Offline the helper line explains that answers need a connection.
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded'
import MicNoneRounded from '@mui/icons-material/MicNoneRounded'
import StopRounded from '@mui/icons-material/StopRounded'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import InputBase from '@mui/material/InputBase'
import { tokens } from '../../../theme'
import { appendPhrase, useDictation } from '../../quick-log'

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  sending: boolean
  online: boolean
  autoFocus?: boolean
}

export function Composer({ value, onChange, onSend, sending, online, autoFocus }: ComposerProps) {
  const dictation = useDictation((phrase) => onChange(appendPhrase(value, phrase)))
  const canSend = online && !sending && value.trim().length > 0
  const hint = !online ? 'Ask AI needs a connection; logging still works offline.' : dictation.error
  const shown = dictation.listening && dictation.interim ? `${value}${value ? ' ' : ''}${dictation.interim}` : value
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '8px',
          pl: '14px',
          pr: '8px',
          py: '8px',
          bgcolor: tokens.ink.card,
          border: `1px solid ${tokens.ink.border}`,
          borderRadius: `${tokens.radius.card}px`,
          boxShadow: tokens.elevation.card,
          '&:focus-within': { borderColor: tokens.accent.main, boxShadow: `0 0 0 3px ${tokens.accent.ring}` },
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
          placeholder={dictation.listening ? 'Listening…' : 'Ask about your day, your plan, or tell me what you ate…'}
          inputProps={{ 'aria-label': 'Message', maxLength: 4000, enterKeyHint: 'send' }}
          autoFocus={autoFocus}
          sx={{
            flex: 1,
            alignSelf: 'center',
            py: '8px',
            fontSize: tokens.font.size.body,
            lineHeight: tokens.font.leading.label,
            // The placeholder stays one line however narrow the thread: it ends in an ellipsis rather than wrapping.
            '& textarea:placeholder-shown, & textarea::placeholder': { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
          }}
        />
        {dictation.supported && (
          <IconButton
            aria-label={dictation.listening ? 'Stop dictation' : 'Dictate'}
            onClick={dictation.listening ? dictation.stop : dictation.start}
            disabled={sending}
            sx={{ color: dictation.listening ? tokens.status.flag : tokens.ink.label }}
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
            bgcolor: tokens.accent.main,
            color: tokens.dark.text,
            '&:hover': { bgcolor: tokens.accent.deep, color: tokens.dark.text },
            // Still reads as the blue send while there is nothing to send yet.
            '&.Mui-disabled': { bgcolor: tokens.accent.light, color: tokens.dark.text },
          }}
        >
          <ArrowUpwardRounded fontSize="small" />
        </IconButton>
      </Box>
      <Box
        sx={{
          mt: '8px',
          // The keyboard shortcuts mean little on a phone, whose sticky composer keeps every line it can.
          display: { xs: hint ? 'block' : 'none', md: 'block' },
          fontSize: tokens.font.size.caption,
          lineHeight: tokens.font.leading.caption,
          color: hint ? tokens.ink.label : tokens.ink.muted,
        }}
      >
        {hint ?? 'Enter to send · Shift + Enter for a new line · the AI never sees your progress photos'}
      </Box>
    </Box>
  )
}
