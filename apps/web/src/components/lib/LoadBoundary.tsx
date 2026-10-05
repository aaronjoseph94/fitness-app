// Owns: the error boundary around code that loads on demand (the Recharts chunk behind a plot, the Ask AI panel, the
// quick-log sheet). A chunk that can't be fetched (offline before the service worker has cached it, a deploy that
// removed it) shows the caller's small fallback instead of throwing up to the route boundary, which would replace the
// whole page, or, for the shell's overlays, the whole app. A new `resetKey` renders the children again.
import { Component, type ReactNode } from 'react'

export interface LoadBoundaryProps {
  children: ReactNode
  /** What shows instead of the children after a failure (null: nothing). */
  fallback: ReactNode
  /** Changing it clears a failure and renders the children again. */
  resetKey?: unknown
  /** Told once per failure, e.g. to close the overlay and say why. */
  onError?: (error: unknown) => void
}

interface LoadBoundaryState {
  failed: boolean
}

export class LoadBoundary extends Component<LoadBoundaryProps, LoadBoundaryState> {
  override state: LoadBoundaryState = { failed: false }

  static getDerivedStateFromError(): LoadBoundaryState {
    return { failed: true }
  }

  // React itself logs the caught error to the console.
  override componentDidCatch(error: unknown): void {
    this.props.onError?.(error)
  }

  override componentDidUpdate(previous: LoadBoundaryProps): void {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
