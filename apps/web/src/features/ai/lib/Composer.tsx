// Owns: the Ask AI composer — a growing text box, the dictation mic where the browser can transcribe, and Send (Enter
// sends, Shift+Enter breaks the line). Offline it explains that answers need a connection.
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
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 1,
          pl: 4,
          pr: 1,
          py: 1,
          bgcolor: tokens.ink.card,
          border: `1px solid ${tokens.ink.border}`,
          borderRadius: `${tokens.radius.card}px`,
        }}
      >
        <InputBase
          multiline
          maxRows={6}
          value={dictation.listening && dictation.interim ? `${value}${value ? ' ' : ''}${dictation.interim}` : value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              if (canSend) onSend()
            }
          }}
          placeholder={dictation.listening ? 'Listening…' : 'Ask about your data, or ask for a change'}
          inputProps={{ 'aria-label': 'Message', maxLength: 4000, enterKeyHint: 'send' }}
          autoFocus={autoFocus}
          sx={{ flex: 1, py: 1.75, fontSize: tokens.font.size.body, lineHeight: 1.4 }}
        />
        {dictation.supported && (
          <IconButton
            aria-label={dictation.listening ? 'Stop dictation' : 'Dictate'}
            onClick={dictation.listening ? dictation.stop : dictation.start}
            disabled={sending}
            sx={{ width: tokens.tapTarget, height: tokens.tapTarget, color: dictation.listening ? tokens.status.flag : tokens.ink.secondary }}
          >
            {dictation.listening ? <StopRounded /> : <MicNoneRounded />}
          </IconButton>
        )}
        <IconButton
          aria-label="Send"
          data-testid="ask-ai-send"
          onClick={onSend}
          disabled={!canSend}
          sx={{
            width: tokens.tapTarget,
            height: tokens.tapTarget,
            bgcolor: tokens.ink.text,
            color: tokens.ink.card,
            '&:hover': { bgcolor: tokens.ink.text },
            '&.Mui-disabled': { bgcolor: tokens.ink.border, color: tokens.ink.card },
          }}
        >
          <ArrowUpwardRounded />
        </IconButton>
      </Box>
      {hint && <Box sx={{ mt: 1.5, px: 1, fontSize: tokens.font.size.label, color: tokens.ink.secondary }}>{hint}</Box>}
    </Box>
  )
}
