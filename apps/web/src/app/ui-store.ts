// Owns: UI state shared across the shell and features (Zustand): the quick-log sheet, the Ask AI panel, the last tab.
// Server data never lives here (TanStack Query owns it).
import { create } from 'zustand'

export type TabKey = 'today' | 'log' | 'train' | 'progress' | 'ai'

/** What the quick-log sheet can log in one tap (SPEC §6 quick-log row). 'fast' starts or stops a fast. */
export type QuickLogKind = 'weigh-in' | 'meal' | 'water' | 'fast' | 'photo'

interface UiState {
  /** The quick-log sheet; `kind` null shows the list of kinds. */
  quickLog: { open: boolean; kind: QuickLogKind | null }
  askAiOpen: boolean
  /** The tab Aaron was last on; the back arrow returns there when there is no history. */
  lastTab: TabKey
  openQuickLog: (kind?: QuickLogKind) => void
  closeQuickLog: () => void
  setAskAiOpen: (open: boolean) => void
  setLastTab: (tab: TabKey) => void
}

export const useUiStore = create<UiState>()((set) => ({
  quickLog: { open: false, kind: null },
  askAiOpen: false,
  lastTab: 'today',
  openQuickLog: (kind) => set({ quickLog: { open: true, kind: kind ?? null } }),
  closeQuickLog: () => set((state) => ({ quickLog: { ...state.quickLog, open: false } })),
  setAskAiOpen: (askAiOpen) => set({ askAiOpen }),
  setLastTab: (lastTab) => set({ lastTab }),
}))
