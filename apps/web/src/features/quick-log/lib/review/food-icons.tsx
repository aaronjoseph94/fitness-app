// Owns: the food icon next to a meal item — the keyword map in /food-icons/index.json (Fluent Emoji Flat, see SOURCE.md
// there) loaded once and cached, the matching rule it documents (lower-cased name; among keywords found as a whole
// word or phrase the longest wins, ties to the first entry; else the fallback), and the icon itself. A missing or
// broken index degrades to a plain glyph, never an error.
import RestaurantRounded from '@mui/icons-material/RestaurantRounded'
import Box from '@mui/material/Box'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import * as z from 'zod'
import { tokens } from '../../../../theme'

const IconIndex = z.object({
  fallback: z.string(),
  icons: z.array(z.object({ icon: z.string(), src: z.string().startsWith('/'), keywords: z.array(z.string()) })),
})
type IconIndex = z.infer<typeof IconIndex>

export interface FoodIconMatcher {
  /** The icon's URL for a food name (the fallback when nothing matches); null when there is no index. */
  (name: string): string | null
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Pure: build the matcher from an index (exported for the styleguide and tests). */
export function foodIconMatcher(index: IconIndex): FoodIconMatcher {
  const rules = index.icons.flatMap((entry, order) =>
    entry.keywords.map((keyword) => ({
      src: entry.src,
      order,
      length: keyword.length,
      pattern: new RegExp(`(^|[^a-z0-9])${escape(keyword.toLowerCase())}($|[^a-z0-9])`),
    })),
  )
  const fallback = index.icons.find((entry) => entry.icon === index.fallback)?.src ?? null
  const cache = new Map<string, string | null>()
  return (name) => {
    const key = name.toLowerCase()
    const hit = cache.get(key)
    if (hit !== undefined) return hit
    let best: (typeof rules)[number] | null = null
    for (const rule of rules) {
      if (!rule.pattern.test(key)) continue
      if (!best || rule.length > best.length || (rule.length === best.length && rule.order < best.order)) best = rule
    }
    const src = best?.src ?? fallback
    cache.set(key, src)
    return src
  }
}

const NONE: FoodIconMatcher = () => null

/** The matcher, from /food-icons/index.json (fetched once per session; no matcher until it loads or when missing). */
export function useFoodIcons(): FoodIconMatcher {
  const { data } = useQuery({
    queryKey: ['static', 'food-icons'],
    queryFn: async ({ signal }) => {
      const response = await fetch('/food-icons/index.json', { signal, credentials: 'include' })
      if (!response.ok) return null
      const parsed = IconIndex.safeParse(await response.json().catch(() => null))
      return parsed.success ? foodIconMatcher(parsed.data) : null
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    networkMode: 'offlineFirst',
  })
  return data ?? NONE
}

/** A decorative food icon in a soft circle; a plain glyph while the index loads, without one, or if the SVG fails. */
export function FoodIcon({ name, size = 32 }: { name: string; size?: number }) {
  const match = useFoodIcons()
  const src = match(name)
  const [failed, setFailed] = useState<string | null>(null)
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: tokens.radius.chip,
        bgcolor: tokens.ink.page,
        border: `1px solid ${tokens.ink.border}`,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {src && failed !== src ? (
        <Box component="img" src={src} alt="" onError={() => setFailed(src)} sx={{ width: size * 0.66, height: size * 0.66 }} />
      ) : (
        <RestaurantRounded sx={{ fontSize: size * 0.55, color: tokens.ink.secondary }} />
      )}
    </Box>
  )
}
