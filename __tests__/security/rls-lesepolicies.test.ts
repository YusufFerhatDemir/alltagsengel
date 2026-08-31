// ═══════════════════════════════════════════════════════════════════════
// Die Lesepolicies: Entscheidung (TypeScript) gegen Umsetzung (SQL)
// ═══════════════════════════════════════════════════════════════════════
//
// `lib/auth/rls-lesepolicies.ts` sagt, WELCHE Berechtigung ueber das Lesen
// welcher Tabelle entscheidet. Die Migration
// 20261022000000_rk_lesepolicies_verwaltungsrollen.sql setzt das in
// Policies um. Zwei Dateien, eine Aussage — also genau die Konstellation,
// in der sie auseinanderlaufen.
//
// Dieser Test macht das Auseinanderlaufen unmoeglich, ohne eine
// Datenbank zu brauchen. Was er NICHT kann: sagen, ob die Migration live
// angewendet ist. Das misst `npm run verify:rls-lesepolicies` gegen die
// Produktionsdatenbank — ein gruener Testlauf hier ist ausdruecklich KEIN
// Beleg dafuer, dass die Policies stehen.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  RLS_LESEPOLICIES, policyName, rollenMitLeserecht,
} from '../../lib/auth/rls-lesepolicies'
import { BERECHTIGUNGEN, NUR_ADMINISTRATION } from '../../lib/auth/rollen'
import { BEREICHE } from '../../lib/auth/bereiche'

const WURZEL = process.cwd()
const MIGRATION = join(
  WURZEL, 'supabase/migrations/20261022000000_rk_lesepolicies_verwaltungsrollen.sql',
)
const ROLLBACK = join(
  WURZEL, 'supabase/migrations/20261022000001_rollback_rk_lesepolicies_verwaltungsrollen.sql',
)

const sql = readFileSync(MIGRATION, 'utf8')
const rollbackSql = readFileSync(ROLLBACK, 'utf8')

/** Alle CREATE POLICY-Bloecke der Migration, grob zerlegt. */
function bloecke(): { name: string; tabelle: string; rumpf: string }[] {
  const treffer = [...sql.matchAll(
    /CREATE POLICY (rk_[a-z_0-9]+) ON public\.([a-z_0-9]+)([\s\S]*?);\n/g,
  )]
  return treffer.map(m => ({ name: m[1], tabelle: m[2], rumpf: m[3] }))
}

describe('RLS-Lesepolicies: Entscheidung und Migration', () => {
  it('deckt genau die Tabellen ab, ueber die entschieden wurde', () => {
    const inSql = bloecke().map(b => b.tabelle).sort()
    const entschieden = RLS_LESEPOLICIES.map(p => p.tabelle).sort()
    expect(inSql).toEqual(entschieden)
  })

  it('vergibt je Tabelle genau eine Policy', () => {
    const namen = bloecke().map(b => b.name)
    expect(new Set(namen).size).toBe(namen.length)
  })

  it('setzt in jeder Policy die Berechtigung, die die Entscheidung nennt', () => {
    for (const p of RLS_LESEPOLICIES) {
      const block = bloecke().find(b => b.tabelle === p.tabelle)
      expect(block, `keine Policy fuer ${p.tabelle}`).toBeDefined()
      expect(block!.name).toBe(policyName(p.tabelle))
      expect(block!.rumpf, `${p.tabelle}: falsches Recht`)
        .toContain(`public.darf('${p.recht}')`)
      // Genau EIN darf() — ein zweites waere eine ODER-Verknuepfung, die
      // stillschweigend eine weitere Rolle hereinliesse.
      expect(block!.rumpf.match(/public\.darf\(/g)?.length).toBe(1)
    }
  })

  it('liest nur — keine Policy oeffnet nebenbei das Schreiben', () => {
    for (const block of bloecke()) {
      expect(block.rumpf, `${block.tabelle}: nicht FOR SELECT`).toContain('FOR SELECT')
      expect(block.rumpf).not.toContain('FOR ALL')
      expect(block.rumpf).not.toContain('WITH CHECK')
    }
  })

  it('gilt nur fuer angemeldete Konten — anon wertet nichts aus', () => {
    for (const block of bloecke()) {
      expect(block.rumpf, `${block.tabelle}: nicht TO authenticated`)
        .toContain('TO authenticated')
      expect(block.rumpf).not.toMatch(/TO\s+(public|anon)/)
    }
  })

  it('bindet jede Policy zusaetzlich an den eigenen Mandanten', () => {
    for (const p of RLS_LESEPOLICIES) {
      const block = bloecke().find(b => b.tabelle === p.tabelle)!
      expect(block.rumpf, `${p.tabelle}: keine Mandantenbindung`)
        .toContain('organization_id = public.current_org_id()')
      // Nur datenannahmestellen darf bundesweite Zeilen ohne Mandant
      // durchlassen — dort tut es der org_fence auch.
      if (p.globalZeilenErlaubt) {
        expect(block.rumpf).toContain('organization_id IS NULL')
      } else {
        expect(block.rumpf, `${p.tabelle}: laesst Zeilen ohne Mandant durch`)
          .not.toContain('organization_id IS NULL')
      }
    }
  })

  it('ist umkehrbar: der Rollback nimmt jede Policy wieder weg', () => {
    for (const p of RLS_LESEPOLICIES) {
      expect(rollbackSql).toContain(
        `DROP POLICY IF EXISTS ${policyName(p.tabelle)} ON public.${p.tabelle};`,
      )
    }
  })

  it('legt keine Policy an, ohne sie vorher zu entfernen (wiederholbar)', () => {
    for (const p of RLS_LESEPOLICIES) {
      expect(sql).toContain(
        `DROP POLICY IF EXISTS ${policyName(p.tabelle)} ON public.${p.tabelle};`,
      )
    }
  })
})

describe('RLS-Lesepolicies: die Entscheidung selbst', () => {
  it('nennt nur Rechte, die es gibt', () => {
    for (const p of RLS_LESEPOLICIES) {
      expect(BERECHTIGUNGEN as readonly string[]).toContain(p.recht)
    }
  })

  it('begruendet jede Zuordnung', () => {
    for (const p of RLS_LESEPOLICIES) {
      expect(p.grund.length, `${p.tabelle} ohne Begruendung`).toBeGreaterThan(40)
    }
  })

  it('haelt Gesundheitsdaten von der Buchhaltung fern', () => {
    // lib/auth/rollen.ts haelt woertlich fest, dass die Buchhaltung
    // „KEINE Gesundheitsdaten und keine Personalakten" bekommt. Diese
    // vier Tabellen fuehren genau das — wer ihr Recht auf eines lockert,
    // das die Buchhaltung traegt, bricht hier.
    for (const tabelle of ['verordnungen', 'verordnung_leistungen', 'care_notes']) {
      const p = RLS_LESEPOLICIES.find(x => x.tabelle === tabelle)!
      expect(rollenMitLeserecht(p.recht), `${tabelle} waere fuer buchhaltung offen`)
        .not.toContain('buchhaltung')
    }
    // Abwesenheiten tragen den Krankheitsgrund der Mitarbeitenden.
    const abwesenheit = RLS_LESEPOLICIES.find(x => x.tabelle === 'absences')!
    expect(rollenMitLeserecht(abwesenheit.recht)).not.toContain('buchhaltung')
  })

  it('laesst die Verguetung beim Vorbehalt der Administration', () => {
    const boni = RLS_LESEPOLICIES.find(x => x.tabelle === 'caregiver_bonuses')!
    expect(NUR_ADMINISTRATION as readonly string[]).toContain(boni.recht)
    expect(rollenMitLeserecht(boni.recht)).toEqual(
      expect.arrayContaining(['admin', 'superadmin']),
    )
    expect(rollenMitLeserecht(boni.recht)).not.toContain('pdl')
    expect(rollenMitLeserecht(boni.recht)).not.toContain('qm')
  })

  it('oeffnet keine Tabelle fuer eine Rolle ohne Verwaltungsauftrag', () => {
    for (const p of RLS_LESEPOLICIES) {
      const rollen = rollenMitLeserecht(p.recht)
      for (const gesperrt of ['engel', 'fahrer', 'kunde', 'angehoerige']) {
        expect(rollen, `${p.tabelle} waere fuer ${gesperrt} offen`).not.toContain(gesperrt)
      }
      expect(rollen.length, `${p.tabelle}: niemand duerfte lesen`).toBeGreaterThan(0)
    }
  })

  it('sagt es auf der Seite, wo eine Rolle deshalb leer ausgeht', () => {
    // Wo Gegenstand und Bereich auseinanderfallen, bleibt eine Seite fuer
    // eine Rolle leer. Das ist die richtige Antwort — aber nur, wenn die
    // Seite es ausspricht. Die Zusatzrechte sind der Ort dafuer.
    const erwartet: Record<string, string> = {
      '/admin/abrechnung': 'pflege.lesen',   // liest verordnungen
      '/admin/kundenakte': 'pflege.lesen',   // liest verordnungen
      '/admin/notizen': 'pflege.lesen',      // liest care_notes
      '/admin/caregivers': 'bonus.verwalten', // liest caregiver_bonuses
    }
    for (const [pfad, recht] of Object.entries(erwartet)) {
      const regel = BEREICHE[pfad as keyof typeof BEREICHE]
      expect(regel, `${pfad} fehlt in BEREICHE`).toBeDefined()
      expect(regel.zusatzRechte ?? [], `${pfad} sagt nicht, dass ${recht} fehlt`)
        .toContain(recht)
    }
  })
})
