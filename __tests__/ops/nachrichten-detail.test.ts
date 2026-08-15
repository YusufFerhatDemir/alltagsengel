import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

describe('Nachrichten-Detail: korrekte API-Pfade', () => {
  const detailUi = fs.readFileSync(
    path.resolve('app/admin/nachrichten/[id]/page.tsx'),
    'utf-8'
  )
  const apiRoute = fs.readFileSync(
    path.resolve('app/api/ops/nachrichten/[id]/route.ts'),
    'utf-8'
  )

  it('Reply-Form POSTet auf /antworten statt /reply', () => {
    expect(detailUi).toContain('/antworten')
    expect(detailUi).not.toContain('/reply')
  })

  it('Gelesen-Markierung PATCHt auf /gelesen-Route', () => {
    expect(detailUi).toContain('/gelesen')
  })

  it('Reply sendet betreff mit', () => {
    expect(detailUi).toContain("betreff: `Re: ${msg?.betreff")
  })

  it('API-Route liefert replies aus Kind-Nachrichten', () => {
    expect(apiRoute).toContain('eltern_id')
    expect(apiRoute).toContain('replies')
  })
})
