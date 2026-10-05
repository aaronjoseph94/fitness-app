// Owns: the /photos page — "Take photos", the view switch (grid by month, compare two, monthly strip) and the pose
// filter, all kept in the URL (?view=&pose=&before=&after=&mode=) so back and reload land in the same place.
import AddAPhotoOutlined from '@mui/icons-material/AddAPhotoOutlined'
import LockOutlined from '@mui/icons-material/LockOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { Pose, type ProgressPhoto } from '@fitness/shared/schemas'
import { useMemo, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router'
import { EmptyState, LoadProblem } from '../../../components'
import { tokens } from '../../../theme'
import { CompareView, type CompareMode } from './CompareView'
import { POSE_LABEL, POSES, usePhotos } from './data'
import { defaultPair } from './grouping'
import { MonthlyStrip } from './MonthlyStrip'
import { PhotoGrid } from './PhotoGrid'
import { PoseFilter } from './PhotoParts'
import { PhotoViewer } from './PhotoViewer'

type View = 'grid' | 'compare' | 'strip'
const VIEWS: { key: View; label: string }[] = [
  { key: 'grid', label: 'By date' },
  { key: 'compare', label: 'Compare' },
  { key: 'strip', label: 'Monthly' },
]

const isView = (v: string | null): v is View => VIEWS.some((x) => x.key === v)

export function PhotosLibrary() {
  const [params, setParams] = useSearchParams()
  const view: View = isView(params.get('view')) ? (params.get('view') as View) : 'grid'
  const parsedPose = Pose.safeParse(params.get('pose'))
  const pose = parsedPose.success ? parsedPose.data : null
  const mode: CompareMode = params.get('mode') === 'slider' ? 'slider' : 'side'
  const { data, error, isLoading, refetch } = usePhotos()
  const [open, setOpen] = useState<ProgressPhoto | null>(null)

  const all = useMemo(() => data ?? [], [data])
  const shown = useMemo(() => (pose ? all.filter((p) => p.pose === pose) : all), [all, pose])

  const update = (next: Record<string, string | null>) =>
    setParams(
      (current) => {
        const out = new URLSearchParams(current)
        for (const [k, v] of Object.entries(next)) {
          if (v === null) out.delete(k)
          else out.set(k, v)
        }
        return out
      },
      { replace: true },
    )

  /** From the viewer: this photo against the latest of its pose (or the first, when it is the latest). */
  const compareFrom = (photo: ProgressPhoto) => {
    const ofPose = all.filter((p) => p.pose === photo.pose)
    const newest = ofPose[0]
    const pair = newest && newest.id !== photo.id ? [photo, newest] : [ofPose[ofPose.length - 1] ?? photo, photo]
    setOpen(null)
    update({ view: 'compare', pose: photo.pose, before: pair[0]!.id, after: pair[1]!.id })
  }

  const pair = useMemo((): [ProgressPhoto, ProgressPhoto] | null => {
    const byId = (id: string | null) => (id ? shown.find((p) => p.id === id) : undefined)
    const fallback = defaultPair(shown, pose ?? shown[0]?.pose ?? 'front') ?? (shown.length >= 2 ? [shown[shown.length - 1]!, shown[0]!] : null)
    if (!fallback) return null
    return [byId(params.get('before')) ?? fallback[0], byId(params.get('after')) ?? fallback[1]]
  }, [shown, pose, params])

  return (
    <Stack spacing={4} data-testid="photos-page">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
        <Button component={RouterLink} to="/photos/new" variant="contained" startIcon={<AddAPhotoOutlined />} sx={{ px: 5 }}>
          Take photos
        </Button>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontSize: tokens.font.size.label, color: tokens.ink.secondary }}>
          <LockOutlined sx={{ fontSize: tokens.font.size.body }} />
          Private. Never sent to any AI.
        </Box>
      </Box>

      <ToggleButtonGroup
        value={view}
        exclusive
        onChange={(_, next: View | null) => next && update({ view: next === 'grid' ? null : next })}
        aria-label="View"
        data-testid="photo-view"
        sx={{ width: { xs: '100%', sm: 'auto' }, '& .MuiToggleButton-root': { flex: { xs: 1, sm: 'none' }, minHeight: tokens.tapTarget, px: 5, textTransform: 'none', fontWeight: tokens.font.weight.label, fontSize: tokens.font.size.emphasis } }}
      >
        {VIEWS.map((v) => (
          <ToggleButton key={v.key} value={v.key}>
            {v.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <PoseFilter value={pose} onChange={(next) => update({ pose: next, before: null, after: null })} />

      {isLoading ? (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} variant="rounded" sx={{ aspectRatio: '3 / 4', height: 'auto', borderRadius: `${tokens.radius.control}px` }} />
          ))}
        </Box>
      ) : error && !data ? (
        <LoadProblem what="Your photos" error={error} onRetry={() => void refetch()} />
      ) : shown.length === 0 ? (
        <EmptyState
          illustration="progress"
          title={pose ? `No ${POSE_LABEL[pose].toLowerCase()} photos yet` : 'No progress photos yet'}
          body="Front, side and back with a faint pose outline, so every month lines up. They stay private and never go to any AI."
          action={
            <Button component={RouterLink} to={pose ? `/photos/new?pose=${pose}` : '/photos/new'} variant="contained" startIcon={<AddAPhotoOutlined />}>
              Take {pose ? `a ${POSE_LABEL[pose].toLowerCase()} photo` : 'your first photos'}
            </Button>
          }
          testId="photos-empty"
        />
      ) : view === 'grid' ? (
        <PhotoGrid photos={shown} onOpen={setOpen} showPose={pose === null} />
      ) : view === 'strip' ? (
        <MonthlyStrip photos={shown} poses={pose ? [pose] : POSES} onOpen={setOpen} />
      ) : pair ? (
        <CompareView
          photos={shown}
          before={pair[0]}
          after={pair[1]}
          mode={mode}
          onChange={(next) =>
            update({
              ...(next.before ? { before: next.before, after: pair[1].id } : {}),
              ...(next.after ? { after: next.after, before: pair[0].id } : {}),
              ...(next.mode ? { mode: next.mode === 'side' ? null : next.mode } : {}),
            })
          }
        />
      ) : (
        <EmptyState
          illustration={null}
          title="Two photos to compare"
          body="Compare needs at least two photos. Take another one next week, same spot, same light."
          testId="photos-compare-empty"
        />
      )}

      <PhotoViewer photo={open} onClose={() => setOpen(null)} onCompare={compareFrom} />
    </Stack>
  )
}
