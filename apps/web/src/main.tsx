// Owns: booting the page — startup wiring and mounting React. (Zod's settings are applied before any module loads, by
// public/zod-config.js from index.html.) The type is the platform's own face (see theme.ts), so there is nothing to
// load here.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App, startApp } from './app/App'

const container = document.getElementById('root')
if (!container) throw new Error('index.html is missing #root')

startApp()
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
