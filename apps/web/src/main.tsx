// Owns: booting the page — the two self-hosted variable fonts (OFL): Outfit for display and numbers, DM Sans for the UI
// (their latin files are preloaded and their @font-face CSS inlined at build by vite.config.ts), startup wiring and
// mounting React. (Zod's settings are applied before any module loads, by public/zod-config.js from index.html.)
import '@fontsource-variable/dm-sans'
import '@fontsource-variable/outfit'
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
