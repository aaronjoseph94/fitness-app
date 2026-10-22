// Owns: Scans' "Fat and lean mass" plot (1d, README §4/§5.9) — fat and lean mass as grouped bars per confirmed scan
// (the latest ones, seven columns at most), the next scan the schedule expects as a dashed empty slot under its date
// (no values: there is no composition forecast), the summit's pair (SPEC §3: fat and lean at the goal) as dashed
// outlines, and the dashed "fat at the summit" line across, on a 0 / half / top axis; the legend says which columns are
// expected. The card around it is a size container, so the bars, their gaps and the value labels scale with its width
// (bars clamp(12px, 7cqi, 44px), gaps clamp(2px, 1.2cqi, 8px), labels clamp(9px, 2.6cqi, 13px) and never wrap). The
// figure is one image for assistive tech, named with every value.
import Box from '@mui/material/Box'
import { formatNumber, formatShortDate, sizeContainer, tabularNums, useEntrance } from '../../../components'
import { copy } from '../../../copy'
import { enterEasing, metricGradient, metricRamp, tokens } from '../../../theme'

/**
 * One column of the plot: a confirmed scan's pair, the summit's target pair (dashed outlines), or the next scan the
 * schedule expects (a dashed empty slot: it has no values yet).
 */
export type FatLeanBar =
  | { key: string; label: string; kind: 'scan' | 'target'; fat: number; lean: number }
  | { key: string; label: string; kind: 'expected' }

/** The plot's height, px; bar heights are computed against it (README: 260). */
const PLOT_HEIGHT = 260
/** At most this many columns (the latest scans, the next one, the summit): the bars keep their minimum width on a phone. */
const MAX_COLUMNS = 7
/** One bar's width and the gap inside a pair (README §4). */
const BAR_WIDTH = 'clamp(12px, 7cqi, 44px)'
const PAIR_GAP = 'clamp(2px, 1.2cqi, 8px)'
/** The axis column on the left and the margin on the right, px. */
const AXIS = 40
const RIGHT = 10

const columnGap = 'clamp(6px, 3cqi, 20px)'
const columnPad = '0 clamp(4px, 3cqi, 20px)'
/** The summit's pair is not measured: its dashed outlines (and their legend mark) are drawn faded. */
const TARGET_OPACITY = 0.55

/** The axis top: the tallest value with 10 % headroom, up to the next 10 kg (59.6 → 70). */
export function axisTop(values: readonly number[]): number {
  const top = Math.max(10, ...values) * 1.1
  return Math.ceil(top / 10) * 10
}

/**
 * The scans (oldest first) as bars, as many of the latest as fit `MAX_COLUMNS`; then `next` (the schedule's due date)
 * as an empty slot when it comes after the last scan; then the summit's target pair.
 */
export function fatLeanBars(
  scans: readonly { date: string; fat: number; lean: number }[],
  summit: { fat: number; lean: number },
  next: string | null = null,
): FatLeanBar[] {
  const last = scans.at(-1)?.date
  const expected = next !== null && (last === undefined || next > last)
  const room = MAX_COLUMNS - 1 - (expected ? 1 : 0)
  return [
    ...scans.slice(-room).map((s) => ({
      key: s.date,
      label: formatShortDate(s.date),
      kind: 'scan' as const,
      fat: s.fat,
      lean: s.lean,
    })),
    ...(expected ? [{ key: `next-${next}`, label: formatShortDate(next), kind: 'expected' as const }] : []),
    { key: 'summit', label: copy.GoalLabel, kind: 'target', fat: summit.fat, lean: summit.lean },
  ]
}

/** The next scan's column: one dashed empty slot the width of a pair, the plot's full height, with no values. */
function ExpectedSlot() {
  return (
    <Box
      sx={{
        width: `calc(2 * ${BAR_WIDTH} + ${PAIR_GAP})`,
        height: '100%',
        boxSizing: 'border-box',
        borderRadius: `${tokens.radius.control}px ${tokens.radius.control}px ${tokens.radius.bar}px ${tokens.radius.bar}px`,
        border: `2px dashed ${tokens.ink.faint}`,
      }}
    />
  )
}

function Bar({
  value,
  top,
  kind,
  target,
  grown,
  reduced,
  delay,
}: {
  value: number
  top: number
  kind: 'fat' | 'lean'
  target: boolean
  grown: boolean
  reduced: boolean
  delay: number
}) {
  const metric = kind === 'fat' ? 'fat' : 'lean'
  const label = kind === 'fat' ? tokens.tone.danger.text : tokens.tone.success.text
  return (
    <Box
      sx={{
        width: BAR_WIDTH,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <Box
        aria-hidden
        sx={{
          fontSize: 'clamp(9px, 2.6cqi, 13px)',
          fontWeight: tokens.font.weight.heading,
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          color: target ? tokens.ink.muted : label,
          ...tabularNums,
        }}
      >
        {formatNumber(value, 1)}
      </Box>
      <Box
        sx={{
          alignSelf: 'stretch',
          height: `${(value / top) * PLOT_HEIGHT}px`,
          mt: '4px',
          borderRadius: `${tokens.radius.control}px ${tokens.radius.control}px ${tokens.radius.bar}px ${tokens.radius.bar}px`,
          boxSizing: 'border-box',
          ...(target
            ? { border: `2px dashed ${metricRamp(metric).to}` }
            : { backgroundImage: metricGradient(metric, '0deg') }),
          transformOrigin: 'bottom',
          transform: grown ? 'none' : 'scaleY(0)',
          // Bars grow from the baseline (README §6); under reduced motion they are simply there.
          transition: reduced
            ? 'none'
            : `transform ${tokens.motion.duration.grow}ms ${enterEasing()} ${delay}ms`,
        }}
      />
    </Box>
  )
}

export function FatLeanChart({ bars, fatTarget }: { bars: readonly FatLeanBar[]; fatTarget: number }) {
  const { entered, reduced } = useEntrance()
  const grown = entered || reduced
  const top = axisTop(bars.flatMap((b) => (b.kind === 'expected' ? [] : [b.fat, b.lean])))
  const columns = `repeat(${bars.length}, minmax(0, 1fr))`
  const kg = (v: number) => `${formatNumber(v, 1)} kg`
  /** The latest measured scan, whose date reads in ink as "now" does on every 1d chart. */
  const latest = bars.reduce((at, b, i) => (b.kind === 'scan' ? i : at), -1)
  const next = bars.find((b) => b.kind === 'expected')
  const label = [
    'Fat and lean mass per scan:',
    ...bars.map((b) =>
      b.kind === 'expected'
        ? `${b.label}, the next scan, not measured yet.`
        : `${b.kind === 'target' ? `${b.label} target` : b.label}, fat ${kg(b.fat)}, lean ${kg(b.lean)}.`,
    ),
    `${copy.fatAtGoal} ${kg(fatTarget)}.`,
  ].join(' ')
  const axisLabel = {
    position: 'absolute',
    left: -AXIS,
    fontSize: tokens.font.size.caption,
    fontWeight: tokens.font.weight.body,
    color: tokens.chart.axis,
    ...tabularNums,
  } as const
  return (
    <Box
      data-testid="chart-body-composition"
      role="img"
      aria-label={label}
      sx={{ ...sizeContainer, minWidth: 0 }}
    >
      <Box aria-hidden sx={{ position: 'relative', height: PLOT_HEIGHT, m: `26px ${RIGHT}px 0 ${AXIS}px` }}>
        {[0, 50, 100].map((at) => (
          <Box
            key={at}
            sx={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${at}%`,
              borderTop: `1px solid ${tokens.chart.grid}`,
            }}
          />
        ))}
        <Box sx={{ ...axisLabel, top: 0, transform: 'translateY(-50%)' }}>{`${formatNumber(top)} kg`}</Box>
        <Box sx={{ ...axisLabel, top: '50%', transform: 'translateY(-50%)' }}>{formatNumber(top / 2)}</Box>
        <Box sx={{ ...axisLabel, bottom: 0, transform: 'translateY(50%)' }}>0</Box>
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${(1 - fatTarget / top) * 100}%`,
            borderTop: `2px dashed ${tokens.metric.fatMass}`,
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            gridTemplateColumns: columns,
            alignItems: 'end',
            gap: columnGap,
            p: columnPad,
          }}
        >
          {bars.map((b, i) => (
            <Box
              key={b.key}
              sx={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                gap: PAIR_GAP,
                height: '100%',
                minWidth: 0,
                opacity: b.kind === 'target' ? TARGET_OPACITY : 1,
              }}
            >
              {b.kind === 'expected' ? (
                <ExpectedSlot />
              ) : (
                <>
                  <Bar
                    value={b.fat}
                    top={top}
                    kind="fat"
                    target={b.kind === 'target'}
                    grown={grown}
                    reduced={reduced}
                    delay={i * 80}
                  />
                  <Bar
                    value={b.lean}
                    top={top}
                    kind="lean"
                    target={b.kind === 'target'}
                    grown={grown}
                    reduced={reduced}
                    delay={i * 80 + 60}
                  />
                </>
              )}
            </Box>
          ))}
        </Box>
      </Box>
      <Box
        aria-hidden
        sx={{
          display: 'grid',
          gridTemplateColumns: columns,
          gap: columnGap,
          m: `10px ${RIGHT}px 0 ${AXIS}px`,
          p: columnPad,
          textAlign: 'center',
          fontSize: tokens.font.size.caption,
          fontWeight: tokens.font.weight.body,
          color: tokens.ink.muted,
        }}
      >
        {bars.map((b, i) => (
          <Box
            component="span"
            key={b.key}
            sx={{
              minWidth: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: i === latest ? tokens.ink.text : undefined,
            }}
          >
            {b.label}
          </Box>
        ))}
      </Box>
      <Box
        aria-hidden
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px 16px',
          mt: '16px',
          fontSize: tokens.font.size.caption,
          fontWeight: tokens.font.weight.body,
          color: tokens.ink.muted,
        }}
      >
        <Key mark={{ bgcolor: tokens.metric.fatMass }}>Fat</Key>
        <Key mark={{ bgcolor: tokens.metric.lean }}>Lean</Key>
        {/* Which columns are expected rather than measured: the next scan's empty slot and the summit's outlines. */}
        {next && <Key mark={{ border: `2px dashed ${tokens.ink.faint}` }}>{`${next.label}: next scan`}</Key>}
        <Key
          mark={{ border: `2px dashed ${metricRamp('fat').to}`, opacity: TARGET_OPACITY }}
        >{`${copy.GoalLabel}: the plan's target`}</Key>
        <Key line>{`${copy.fatAtGoal} ${kg(fatTarget)}`}</Key>
      </Box>
    </Box>
  )
}

/** One legend entry: a 10 px square (filled or dashed), or a short dashed line. */
function Key({ mark, line = false, children }: { mark?: object; line?: boolean; children: string }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
      {line ? (
        <Box component="span" sx={{ width: 14, borderTop: `2px dashed ${tokens.metric.fatMass}` }} />
      ) : (
        <Box
          component="span"
          sx={{
            width: 10,
            height: 10,
            borderRadius: `${tokens.radius.bar}px`,
            boxSizing: 'border-box',
            ...mark,
          }}
        />
      )}
      {children}
    </Box>
  )
}
