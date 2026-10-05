// Owns: UI state shared across the shell and features (Zustand): the quick-log sheet (kind, and the day and meal slot
// it logs to), the Ask AI panel, the last tab. Server data never lives here (TanStack Query owns it).
import type { MealSlot } from '@fitness/shared/schemas'
import { create } from 'zustand'

export type TabKey = 'today' | 'log' | 'train' | 'progress' | 'ai'

/** What the quick-log sheet can log in one tap (SPEC §6 quick-log row). 'fast' starts or stops a fast. */
export type QuickLogKind = 'weigh-in' | 'meal' | 'water' | 'fast' | 'photo'

/** Where a quick log goes: a local date ("2026-10-04", default today) and, for a meal, its slot. */
export interface QuickLogTarget {
  date?: string
  slot?: MealSlot
}

interface UiState {
  /** The quick-log sheet; `kind` null shows the list of kinds. `date`/`slot` absent: today, slot by time of day. */
  quickLog: { open: boolean; kind: QuickLogKind | null } & QuickLogTarget
  askAiOpen: boolean
  /** The tab Aaron was last on; the back arrow returns there when there is no history. */
  lastTab: TabKey
  /** Open the sheet on `kind` (or the list of kinds), logging to `target.date` / `target.slot` when given. */
  openQuickLog: (kind?: QuickLogKind | null, target?: QuickLogTarget) => void
  closeQuickLog: () => void
  setAskAiOpen: (open: boolean) => void
  setLastTab: (tab: TabKey) => void
}

export const useUiStore = create<UiState>()((set) => ({
  quickLog: { open: false, kind: null },
  askAiOpen: false,
  lastTab: 'today',
  openQuickLog: (kind, target) => set({ quickLog: { open: true, kind: kind ?? null, date: target?.date, slot: target?.slot } }),
  closeQuickLog: () => set((state) => ({ quickLog: { ...state.quickLog, open: false } })),
  setAskAiOpen: (askAiOpen) => set({ askAiOpen }),
  setLastTab: (lastTab) => set({ lastTab }),
}))
