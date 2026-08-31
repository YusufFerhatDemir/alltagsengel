// ═══════════════════════════════════════════════════════════════════════
// Die Verordnungs-Projektion: was die Abrechnung sehen darf — und nichts sonst
// ═══════════════════════════════════════════════════════════════════════
//
// `verordnungen` fuehrt eine Spalte `diagnose`. Die Tabelle steht deshalb
// unter `pflege.lesen`, das die Buchhaltung ausdruecklich nicht hat.
// Gleichzeitig braucht `/admin/abrechnung` acht Angaben aus derselben
// Zeile, um einen Abrechnungsfall zu bilden.
//
// RLS kann diese Unterscheidung nicht treffen — Row Level Security
// entscheidet ueber ZEILEN. Die Trennung steckt deshalb in der Abfrage,
// und dieser Test ist das, was sie zusammenhaelt.
//
// Was hier geprueft wird, ist nicht „laeuft der Code", sondern eine
// Richtung: die Liste ist eine ERLAUBNISLISTE. Eine Sperrliste („alles
// ausser diagnose") waere bequemer und waere falsch — die naechste Spalte
// auf dieser Tabelle waere damit automatisch drin, und niemand haette
// eine Entscheidung getroffen.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ABRECHNUNGSSPALTEN, NIEMALS_AN_DIE_ABRECHNUNG, unerlaubteFelder,
} from '../../lib/billing/verordnung-projektion'
import { RLS_LESEPOLICIES } from '../../lib/auth/rls-lesepolicies'
import { rollenMitLeserecht } from '../../lib/auth/rls-lesepolicies'

const WURZEL = process.cwd()
/**
 * Quelltext OHNE Kommentare.
 *
 * Der erste Anlauf pruefte den Rohtext und schlug fehl, weil im
 * Kommentar der Route steht, warum `select('*')` die falsche Variante
 * waere. Ein Test, der ueber die eigene Begruendung stolpert, erzieht
 * dazu, die Begruendung wegzulassen — und genau die ist hier das
 * Wertvollste. Geprueft wird deshalb, was ausgefuehrt wird.
 */
function ohneKommentare(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(z => !z.trim().startsWith('//')).join('\n')
}

const routenQuelle = ohneKommentare(readFileSync(
  join(WURZEL, 'app/api/billing/verordnungen/route.ts'), 'utf8'))
const seitenQuelle = ohneKommentare(readFileSync(
  join(WURZEL, 'app/admin/abrechnung/page.tsx'), 'utf8'))

describe('Verordnungs-Projektion: die Erlaubnisliste', () => {
  it('nennt genau die acht Felder, die ein Abrechnungsfall braucht', () => {
    expect([...ABRECHNUNGSSPALTEN].sort()).toEqual([
      'client_id', 'genehmigung_aktenzeichen', 'genehmigung_status',
      'gueltig_bis', 'gueltig_von', 'id',
      'kostentraeger_ik_nummer', 'kostentraeger_name',
    ])
  })

  it('gibt kein Gesundheitsdatum heraus', () => {
    for (const feld of NIEMALS_AN_DIE_ABRECHNUNG) {
      expect(
        (ABRECHNUNGSSPALTEN as readonly string[]).includes(feld),
        `${feld} steht in der Erlaubnisliste — die Buchhaltung bekaeme es`,
      ).toBe(false)
    }
    // Der Kern des Befundes, ausdruecklich benannt.
    expect(NIEMALS_AN_DIE_ABRECHNUNG).toContain('diagnose')
  })

  it('erkennt einen Datensatz, der ueber die Liste hinausgeht', () => {
    expect(unerlaubteFelder({ id: 'a', client_id: 'b' })).toEqual([])
    expect(unerlaubteFelder({ id: 'a', diagnose: 'M54.5' })).toEqual(['diagnose'])
  })
})

describe('Verordnungs-Projektion: der Riegel ist die Route', () => {
  it('verlangt abrechnung.lesen — nicht pflege.lesen', () => {
    // Wer die Diagnose sehen darf, nimmt die Pflegedoku-Seiten. Stuende
    // hier `pflege.lesen`, waere die Route fuer die Buchhaltung zu und
    // damit sinnlos; stuende hier gar nichts, waere sie fuer jeden offen.
    expect(routenQuelle).toContain("requireOpsAdmin('abrechnung.lesen')")
    expect(routenQuelle).not.toContain("requireOpsAdmin('pflege.lesen')")
  })

  it('nimmt den Mandanten aus dem Kontext, nie aus der Anfrage', () => {
    // Eine organization_id aus dem Aufruf waere ein Mandantenwechsel per
    // Parameter — mit dem Dienstschluessel dahinter sieht RLS das nie.
    expect(routenQuelle).toContain("eq('organization_id', auth.ctx.organizationId)")
    expect(routenQuelle).not.toMatch(/searchParams\.get\(['"]organization/)
  })

  it('waehlt ueber die Liste aus und niemals mit *', () => {
    expect(routenQuelle).toContain("select(ABRECHNUNGSSPALTEN.join(', '))")
    expect(routenQuelle).not.toContain("select('*')")
  })

  it('laesst geloeschte Verordnungen aussen vor', () => {
    expect(routenQuelle).toContain("is('deleted_at', null)")
  })
})

describe('Verordnungs-Projektion: die Seite nutzt sie auch', () => {
  it('liest verordnungen NICHT mehr ueber den Browser-Client', () => {
    // Der eigentliche Fehler waere, die Route zu bauen und die alte
    // Abfrage stehen zu lassen: dann bliebe die Seite leer, und die Route
    // waere ein ungenutztes Versprechen.
    expect(seitenQuelle).not.toMatch(/supabase\s*\n?\s*\.from\('verordnungen'\)/)
    expect(seitenQuelle).not.toContain("supabase.from('verordnungen')")
    expect(seitenQuelle).toContain('/api/billing/verordnungen')
  })

  it('bleibt bei einem Fehler leer, statt einen Teilbestand zu zeigen', () => {
    // Eine halbe Verordnungsliste waere gefaehrlicher als keine: sie
    // saehe vollstaendig aus und liesse Abrechnungsfaelle weg.
    expect(seitenQuelle).toContain('if (!res.ok) return []')
  })
})

describe('Verordnungs-Projektion: die Policy bleibt, wie sie ist', () => {
  it('haelt verordnungen weiterhin unter pflege.lesen', () => {
    // Die Route ist ein zusaetzlicher, engerer Weg — keine Lockerung.
    // Wer die Policy auf `abrechnung.lesen` umstellte, gaebe der
    // Buchhaltung die ganze Zeile und machte die Projektion sinnlos.
    const v = RLS_LESEPOLICIES.find(p => p.tabelle === 'verordnungen')!
    expect(v.recht).toBe('pflege.lesen')
    expect(rollenMitLeserecht(v.recht)).not.toContain('buchhaltung')
  })
})
