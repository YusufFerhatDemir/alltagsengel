import { test, expect } from '@playwright/test'
test('DIAGNOSE Fokusverlauf', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/'); await page.waitForLoadState('load')
  const ausloeser = page.getByRole('button', { name: 'Rückruf anfordern' })
  await ausloeser.waitFor({ state: 'visible', timeout: 15_000 })
  await ausloeser.focus(); await ausloeser.click()
  const dialog = page.getByRole('dialog', { name: 'Rückrufservice' })
  await dialog.waitFor({ state: 'visible' })
  const lage = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]') as HTMLElement
    const inerte = Array.from(document.querySelectorAll('[inert]')).map(e => (e as HTMLElement).tagName + '.' + ((e as HTMLElement).className || '').toString().slice(0,20))
    const iframes = Array.from(document.querySelectorAll('iframe')).map(f => ({ src: (f.src||'').slice(0,40), inert: !!f.closest('[inert]'), imDialog: d?.contains(f) }))
    return { inertUnterstuetzt: 'inert' in HTMLElement.prototype, anzahlInert: inerte.length, inerte: inerte.slice(0,8), iframes }
  })
  console.log('[D] Lage:', JSON.stringify(lage))
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab')
    const info = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null
      const d = document.querySelector('[role="dialog"]')
      return { tag: a?.tagName, id: a?.id, inInert: !!a?.closest('[inert]'), drin: !!d && !!a && d.contains(a) }
    })
    console.log(`[D] Tab ${i + 1}:`, JSON.stringify(info))
  }
  expect(true).toBe(true)
})
