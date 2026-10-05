// Owns: the one TanStack QueryClient and its defaults. Per-endpoint behaviour (offline cache, retries) lives in src/api.
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Server state changes mostly through this app; 30 s avoids refetch storms on tab switches.
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
})
