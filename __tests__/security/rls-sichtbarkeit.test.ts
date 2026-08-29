/**
 * Die Auswertung hinter `npm run lint:rls-sicht`.
 *
 * BEFUND (29.08.2026): `/admin/nachweise` steht in der Navigation, ist über
 * `BEREICHE` für `personal.lesen` freigegeben — also für `pdl` und `qm` —
 * und liest `caregiver_qualifications` mit dem BROWSER-Client. Auf dieser
 * Tabelle steht live genau eine verwaltende Policy: `is_admin()`. Für die
 * Pflegedienstleitung kommt damit eine LEERE Liste zurück: kein Fehler,
 * keine Meldung, „Keine Nachweise vorhanden".
 *
 * Der Live-Lauf des Skripts prüft 47 Seiten gegen 125 Policies. Diese
 * Suite prüft die AUSWERTUNG, die dahintersteht — sie braucht keine
 * Datenbank und läuft deshalb in jedem Testlauf mit. Eine Regel, die nur
 * gegen die Produktion läuft, wird sonst nie geprüft, und eine ungeprüfte
 * Prüfung ist eine Behauptung.
 *
 * Geprüft wird in beide Richtungen: dass ein blinder Fall gemeldet wird
 * UND dass ein sehender Fall schweigt. Ein Prüfer, der immer meldet, ist
 * so wertlos wie einer, der nie meldet.
 */
import { describe, it, expect } from 'vitest'
import {
  rollenDerPolicy, rollenDerTabelle, rollenDerSeite, werteAus,
  IS_ADMIN_ROLLEN, IS_STAFF_ROLLEN, type Policy,
} from '@/lib/auth/rls-sichtbarkeit'

/** Die drei Muster, wie sie live in `pg_policies` stehen. */
const NUR_ADMIN = 'is_admin()'
const STAFF = 'is_internal_staff()'
const ROLLENKONZEPT = "(darf('personal.lesen'::text) AND (organization_id = current_org_id()))"
const EIGENE_ZEILEN = '(caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids))'
const ANGEMELDET = '((auth.uid() IS NOT NULL) AND (aktiv = true))'

describe('rollenDerPolicy — die drei bekannten Muster', () => {
  it('is_admin() erreicht nur die Administration', () => {
    const r = rollenDerPolicy(NUR_ADMIN)
    expect([...r].sort()).toEqual([...IS_ADMIN_ROLLEN].sort())
  })

  it('is_internal_staff() erreicht zusätzlich pdl und buero', () => {
    const r = rollenDerPolicy(STAFF)
    expect([...r].sort()).toEqual([...IS_STAFF_ROLLEN].sort())
    // Ausdrücklich NICHT qm und buchhaltung — das ist der Punkt, an dem
    // die Funktion in der Produktion enger ist, als ihr Name vermuten lässt.
    expect(r.has('qm')).toBe(false)
    expect(r.has('buchhaltung')).toBe(false)
  })

  it("darf('personal.lesen') erreicht jede Rolle mit diesem Recht", () => {
    const r = rollenDerPolicy(ROLLENKONZEPT)
    expect(r.has('pdl')).toBe(true)
    expect(r.has('qm')).toBe(true)
    // buchhaltung hat personal.lesen ausdrücklich nicht.
    expect(r.has('buchhaltung')).toBe(false)
  })

  it('zählt einen Eigene-Zeilen-Pfad NICHT als Lesepfad für die Verwaltung', () => {
    // Die richtige Richtung des Zweifels: lieber eine Meldung zu viel als
    // eine übersehene leere Seite.
    expect(rollenDerPolicy(EIGENE_ZEILEN).size).toBe(0)
  })

  it('zählt eine offene Anmeldeprüfung für alle Verwaltungsrollen', () => {
    const r = rollenDerPolicy(ANGEMELDET)
    expect(r.has('pdl')).toBe(true)
    expect(r.has('buchhaltung')).toBe(true)
  })

  it('erkennt mehrere darf()-Aufrufe in einem Ausdruck', () => {
    const r = rollenDerPolicy("darf('personal.lesen') OR darf('abrechnung.lesen')")
    expect(r.has('pdl')).toBe(true)
    expect(r.has('buchhaltung')).toBe(true)
  })

  it('meldet für einen unbekannten Ausdruck niemanden', () => {
    expect(rollenDerPolicy('(some_unknown_function() AND true)').size).toBe(0)
  })
})

describe('rollenDerTabelle — mehrere Policies auf derselben Tabelle', () => {
  const policies: Policy[] = [
    { tabelle: 'caregiver_qualifications', name: 'admin_all', qual: NUR_ADMIN },
    { tabelle: 'caregiver_qualifications', name: 'engel_own', qual: EIGENE_ZEILEN },
    { tabelle: 'caregivers', name: 'admin_all', qual: NUR_ADMIN },
    { tabelle: 'caregivers', name: 'rk_lesen', qual: ROLLENKONZEPT },
  ]

  it('vereinigt die Rollen aller Policies — permissive Policies sind ODER-verknüpft', () => {
    expect([...rollenDerTabelle(policies, 'caregivers')].sort())
      .toEqual(['admin', 'pdl', 'qm', 'superadmin'])
  })

  it('lässt caregiver_qualifications für pdl und qm verschlossen', () => {
    const r = rollenDerTabelle(policies, 'caregiver_qualifications')
    expect(r.has('pdl')).toBe(false)
    expect(r.has('qm')).toBe(false)
    expect(r.has('admin')).toBe(true)
  })

  it('gibt für eine Tabelle ohne Policy eine leere Menge', () => {
    expect(rollenDerTabelle(policies, 'gibt_es_nicht').size).toBe(0)
  })
})

describe('rollenDerSeite — was der Guard durchlässt', () => {
  it('lässt pdl und qm auf eine Personal-Seite', () => {
    const r = rollenDerSeite('/admin/nachweise')
    expect(r).toContain('pdl')
    expect(r).toContain('qm')
  })

  it('lässt buchhaltung NICHT auf eine Personal-Seite', () => {
    expect(rollenDerSeite('/admin/nachweise')).not.toContain('buchhaltung')
  })

  it('erbt die Regel eines dynamischen Segments vom Präfix', () => {
    // `/admin/caregivers/[id]` hat keinen eigenen Eintrag; die Regel kommt
    // von `/admin/caregivers`. Ohne diese Rückführung bliebe jede
    // Detailseite unbewertet — also gerade die, auf denen die Daten stehen.
    expect(rollenDerSeite('/admin/caregivers/[id]').length).toBeGreaterThan(0)
    expect(rollenDerSeite('/admin/caregivers/[id]')).toEqual(rollenDerSeite('/admin/caregivers'))
  })

  it('gibt für einen unbekannten Pfad niemanden zurück', () => {
    expect(rollenDerSeite('/admin/gibt-es-nicht-und-hat-keinen-praefix-xyz')).toEqual([])
  })
})

describe('werteAus — der eigentliche Befund', () => {
  const policies: Policy[] = [
    { tabelle: 'caregiver_qualifications', name: 'admin_all', qual: NUR_ADMIN },
    { tabelle: 'caregivers', name: 'rk_lesen', qual: ROLLENKONZEPT },
  ]

  it('meldet die Seite, die für pdl freigegeben und blind ist', () => {
    const { befunde } = werteAus(
      new Map([['/admin/nachweise', ['caregiver_qualifications', 'caregivers']]]),
      policies,
    )
    const pdl = befunde.find(b => b.rolle === 'pdl')
    expect(pdl).toBeDefined()
    // Nur die blinde Tabelle, nicht die sehende.
    expect(pdl!.tabellen).toEqual(['caregiver_qualifications'])
  })

  it('meldet die Administration NICHT — sie sieht per Definition alles', () => {
    const { befunde } = werteAus(
      new Map([['/admin/nachweise', ['caregiver_qualifications']]]),
      policies,
    )
    expect(befunde.some(b => b.rolle === 'admin' || b.rolle === 'superadmin')).toBe(false)
  })

  it('schweigt, wenn jede gelesene Tabelle einen Lesepfad hat', () => {
    const { befunde } = werteAus(new Map([['/admin/nachweise', ['caregivers']]]), policies)
    expect(befunde).toEqual([])
  })

  it('schweigt für eine Seite, die der Guard gar nicht freigibt', () => {
    // buchhaltung kommt auf `/admin/nachweise` nicht hinein; ein Befund
    // über sie wäre keiner.
    const { befunde } = werteAus(
      new Map([['/admin/nachweise', ['caregiver_qualifications']]]),
      policies,
    )
    expect(befunde.some(b => b.rolle === 'buchhaltung')).toBe(false)
  })

  it('bewertet eine Tabelle ohne jede Policy nicht, sondern meldet sie getrennt', () => {
    // Ohne Policy sieht auch die Administration nichts — die Ursache liegt
    // dann woanders, und ein Rollenbefund wäre die falsche Auskunft.
    const { befunde, ohnePolicy } = werteAus(
      new Map([['/admin/nachweise', ['gibt_es_nicht']]]),
      policies,
    )
    expect(befunde).toEqual([])
    expect(ohnePolicy).toEqual(['/admin/nachweise → gibt_es_nicht'])
  })

  it('sortiert stabil nach Seite und Rolle', () => {
    const { befunde } = werteAus(
      new Map([
        ['/admin/mitarbeiterakte', ['caregiver_qualifications']],
        ['/admin/nachweise', ['caregiver_qualifications']],
      ]),
      policies,
    )
    const schluessel = befunde.map(b => `${b.seite}/${b.rolle}`)
    expect(schluessel).toEqual([...schluessel].sort())
  })
})
