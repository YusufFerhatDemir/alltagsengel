/**
 * Mandantenzaun: die Erlaubnisliste ist eine Entscheidung, kein Vorrat.
 * @see scripts/verify-mandantenzaun-live.mjs
 *
 * ── WOFÜR ─────────────────────────────────────────────────────────
 * `verify:mandantenzaun` prüft live, ob jede Tabelle mit
 * `organization_id` den Mandanten auch in einer Policy nennt. Drei tun
 * das heute nicht und stehen deshalb in einer Erlaubnisliste.
 *
 * Eine solche Liste verfällt auf zwei Arten, und beide sind still:
 *   · Ein Eintrag ohne Begründung — niemand weiß später, ob er noch gilt.
 *   · Ein Eintrag, der stehen bleibt, nachdem die Migration eingespielt
 *     wurde. Dann deckt die Liste etwas ab, das längst gelöst ist, und
 *     der nächste echte Fall fällt unter denselben Namen.
 *
 * Diese Tests halten die Liste knapp und begründet. Sie prüfen NICHT die
 * Produktion — das tut der Lauf selbst.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const REPO = process.cwd()
const SKRIPT = join(REPO, 'scripts/verify-mandantenzaun-live.mjs')
const quelle = readFileSync(SKRIPT, 'utf8')

/** Die Tabellennamen aus dem ERLAUBT-Block. */
function erlaubteTabellen(): string[] {
  const block = quelle.slice(quelle.indexOf('const ERLAUBT = {'), quelle.indexOf('const sql ='))
  return [...block.matchAll(/^\s{2}([a-z_]+):/gm)].map(m => m[1])
}

describe('Die Erlaubnisliste', () => {
  it('enthält genau die drei bekannten org-blinden Tabellen', () => {
    expect(erlaubteTabellen().sort()).toEqual([
      'email_entwuerfe', 'marketing_content_status', 'security_watchlist',
    ])
  })

  it('begründet jeden Eintrag und nennt die wartende Migration', () => {
    const block = quelle.slice(quelle.indexOf('const ERLAUBT = {'), quelle.indexOf('const sql ='))
    for (const t of erlaubteTabellen()) {
      const stelle = block.indexOf(`${t}:`)
      const text = block.slice(stelle, stelle + 400)
      expect(text, `${t} ohne Begründung`).toMatch(/BEFUND/)
      expect(text, `${t} nennt die Migration nicht`).toMatch(/20261115000000/)
    }
  })
})

describe('Die vorbereitete Migration', () => {
  const MIG = join(REPO, 'supabase/migrations/20261115000000_org_fence_drei_blinde_tabellen.sql')

  it('liegt als Datei vor', () => {
    expect(existsSync(MIG)).toBe(true)
  })

  it('deckt genau die drei Tabellen der Erlaubnisliste ab', () => {
    const sql = readFileSync(MIG, 'utf8')
    for (const t of erlaubteTabellen()) {
      expect(sql, `${t} fehlt in der Migration`).toMatch(new RegExp(`ON public\\.${t}`))
    }
  })

  it('setzt den Zaun RESTRICTIVE — permissiv wäre wirkungslos', () => {
    // Permissive Policies sind ODER-verknüpft: eine permissive
    // Fence-Policy neben `is_admin()` änderte gar nichts.
    const sql = readFileSync(MIG, 'utf8')
    const zaeune = [...sql.matchAll(/CREATE POLICY\s+\w+_org_fence[\s\S]*?FOR ALL/g)]
    expect(zaeune.length).toBe(3)
    for (const z of zaeune) expect(z[0]).toMatch(/AS RESTRICTIVE/)
  })

  it('sagt ausdrücklich, dass sie NICHT angewendet ist', () => {
    expect(readFileSync(MIG, 'utf8')).toMatch(/NICHT angewendet/)
  })

  it('hat eine Rücknahme', () => {
    expect(existsSync(join(REPO,
      'supabase/migrations/20261115000001_rollback_org_fence_drei_blinde_tabellen.sql'))).toBe(true)
  })
})

describe('Der Prüflauf selbst', () => {
  it('erkennt beide Schreibweisen des Wahrheitswerts', () => {
    // Postgres liefert relrowsecurity je nach Ausgabeform als 't' ODER
    // 'true'. Ein Vergleich auf nur eine Form meldete am 14.09.2026 alle
    // 269 Tabellen als „RLS aus" — ein Lauf mit 269 Falschbefunden wird
    // beim ersten Lesen abgeschaltet.
    expect(quelle).toMatch(/rls === 't' \|\| rls === 'true'/)
  })

  it('sucht den Mandantenbezug im AUSDRUCK, nicht im Policy-Namen', () => {
    // Der Zaun trägt im Bestand mehrere Schreibweisen, und manche
    // Tabellen lösen die Frage ohne eigene Fence-Policy (state_waitlist
    // prüft `organization_id = current_org_id()` direkt in jeder Policy).
    // Wer nur nach `%org_fence%` sucht, meldet die fälschlich.
    expect(quelle).toMatch(/qual ILIKE '%organization_id%'/)
  })
})
