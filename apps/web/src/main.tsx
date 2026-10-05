// Owns: booting the page — the self-hosted Outfit font, startup wiring, and mounting React.
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
