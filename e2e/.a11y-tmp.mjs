import { chromium } from '@playwright/test'
const base = process.argv[2]
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
for (const p of ['/', '/dashboard', '/log', '/progress', '/train', '/train/library', '/train/equipment', '/scans', '/settings/ai', '/settings/data', '/settings/reminders']) {
  await page.goto(base + p, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(2500)
  const r = await page.evaluate(() => {
    const ids = {}
    for (const el of document.querySelectorAll('[id]')) ids[el.id] = (ids[el.id] || 0) + 1
    const dup = Object.entries(ids).filter(([, n]) => n > 1).map(([k]) => k).filter(k => !k.startsWith(':') && !k.startsWith('«') && !k.startsWith('_r'))
    const missing = []
    for (const el of document.querySelectorAll('[aria-labelledby]')) for (const id of el.getAttribute('aria-labelledby').split(/\s+/)) if (!document.getElementById(id)) missing.push(id)
    const hs = [...document.querySelectorAll('main h1, main h2, main h3, main h4, h1, h2, h3, h4')].filter((h, i, a) => a.indexOf(h) === i)
    const outline = hs.map(h => h.tagName[1] + ':' + h.textContent.trim().slice(0, 28))
    const skips = []
    for (let i = 1; i < hs.length; i++) if (+hs[i].tagName[1] - +hs[i-1].tagName[1] > 1) skips.push(outline[i-1] + ' -> ' + outline[i])
    return { dup, missing, skips, outline: outline.join(' | ') }
  })
  console.log('\n##', p, JSON.stringify({ dup: r.dup, missing: r.missing, skips: r.skips }))
  console.log(r.outline.slice(0, 900))
}
await browser.close()
