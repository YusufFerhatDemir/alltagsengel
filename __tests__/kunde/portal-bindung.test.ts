/**
 * Block 31 — sieht die Kundin ihre Daten, und nur ihre?
 *
 * BEFUND (14.09.2026): `/kunde/pflegedoku` liest drei Tabellen. Zwei
 * tragen eine Kundenbindung, `pflege_massnahmen` nicht — dort gab es nur
 * `is_admin()` und die Engel-Policy. Die Seite holte den aktiven Plan
 * (kam durch) und dessen Maßnahmen (kamen nicht durch), und weil
 * PostgREST eine RLS-Verweigerung mit `200 []` beantwortet statt mit
 * einem Fehler, zeigte sie einen Pflegeplan ohne Inhalt.
 *
 * Eine stille Null über die Pflege eines Menschen.
 */
import { describe, it, expect } from 'vitest'
import {
  bindendePolicies,
  bewerteTabelle,
  tabellenAusQuelltext,
  OFFEN_BEABSICHTIGT,
  BEKANNTE_LUECKEN,
  type PolicyZeile,
} from '@/lib/kunde/portal-bindung'

const p = (teil: Partial<PolicyZeile>): PolicyZeile => ({
  name: 'x', permissive: 'PERMISSIVE', cmd: 'SELECT', qual: '', ...teil,
})

const KUNDENBINDUNG = "(client_id IN ( SELECT c.id FROM clients c WHERE (c.user_id = auth.uid())))"

describe('bindendePolicies', () => {
  it('erkennt die Bindung über clients.user_id = auth.uid()', () => {
    expect(bindendePolicies([p({ name: 'kunde_lesen', qual: KUNDENBINDUNG })])).toEqual(['kunde_lesen'])
  })

  it('erkennt eigene_client_ids() als Bindung', () => {
    const q = '(client_id IN ( SELECT eigene_client_ids() AS eigene_client_ids))'
    expect(bindendePolicies([p({ name: 'tour_lesen', qual: q })])).toEqual(['tour_lesen'])
  })

  it('zählt is_admin() NICHT als Kundenbindung', () => {
    expect(bindendePolicies([p({ name: 'admin_alles', cmd: 'ALL', qual: 'is_admin()' })])).toEqual([])
  })

  it('zählt eine Rollenrechte-Policy NICHT als Kundenbindung', () => {
    // `darf('pflege.lesen') AND organization_id = current_org_id()` bindet
    // an den MANDANTEN, nie an die Person — der org_fence trennt
    // Organisationen, niemals Rollen.
    const q = "(darf('pflege.lesen'::text) AND (organization_id = current_org_id()))"
    expect(bindendePolicies([p({ name: 'rk_lesen', qual: q })])).toEqual([])
  })

  it('ignoriert RESTRICTIVE-Policies — sie gewähren nichts', () => {
    // Eine restriktive Policy verengt nur. Ohne eine permissive daneben
    // ist die Tabelle fuer die Kundin zu.
    //
    // Der Ausdruck traegt hier ABSICHTLICH `auth.uid()`: mit einem
    // org-Fence-Ausdruck haette der Test auch dann gehalten, wenn die
    // Permissive-Pruefung ganz fehlt — er haette nichts geprueft.
    expect(bindendePolicies([
      p({ name: 'nur_eigene_zeilen', permissive: 'RESTRICTIVE', cmd: 'SELECT', qual: '(user_id = auth.uid())' }),
    ])).toEqual([])
  })

  it('eine restriktive Bindung macht eine fehlende permissive nicht wett', () => {
    // Der reale Fall: org_fence (restriktiv) + is_admin() (permissiv).
    // Fuer die Kundin bleibt nichts uebrig — das UND aus beiden ist leer.
    expect(bindendePolicies([
      p({ name: 'org_fence', permissive: 'RESTRICTIVE', cmd: 'ALL', qual: '(client_id IN (SELECT c.id FROM clients c WHERE c.user_id = auth.uid()))' }),
      p({ name: 'admin_alles', permissive: 'PERMISSIVE', cmd: 'ALL', qual: 'is_admin()' }),
    ])).toEqual([])
  })

  it('ignoriert eine bindende UPDATE-Policy — sie erlaubt kein Lesen', () => {
    // Der Unterschied entscheidet, ob die SEITE Daten sieht.
    expect(bindendePolicies([p({ name: 'eigenes_aendern', cmd: 'UPDATE', qual: '(user_id = auth.uid())' })])).toEqual([])
  })

  it('nimmt eine ALL-Policy mit Bindung an', () => {
    expect(bindendePolicies([p({ name: 'eigenes_alles', cmd: 'ALL', qual: '(user_id = auth.uid())' })])).toEqual(['eigenes_alles'])
  })

  it('liefert alle bindenden Policies, nicht nur die erste', () => {
    const r = bindendePolicies([
      p({ name: 'a', qual: '(user_id = auth.uid())' }),
      p({ name: 'b', qual: KUNDENBINDUNG }),
      p({ name: 'c', qual: 'is_admin()' }),
    ])
    expect(r).toEqual(['a', 'b'])
  })
})

describe('bewerteTabelle', () => {
  it('meldet eine gebundene Tabelle als gebunden', () => {
    const b = bewerteTabelle('invoices', [p({ name: 'invoices_client_read', qual: KUNDENBINDUNG })])
    expect(b.einordnung).toBe('gebunden')
    expect(b.policies).toEqual(['invoices_client_read'])
  })

  it('meldet pflege_massnahmen ohne Kundenpolicy als bekannte Lücke', () => {
    // Der Produktionsstand am 14.09.2026, wortgetreu.
    const b = bewerteTabelle('pflege_massnahmen', [
      p({ name: 'admin_pflege_massnahmen', cmd: 'ALL', qual: 'is_admin()' }),
      p({ name: 'engel_pflege_massnahmen_select', qual: '(plan_id IN ( SELECT mp.id FROM pflege_massnahmenplaene mp JOIN assignments a ...))' }),
      p({ name: 'org_fence_pflege_massnahmen', permissive: 'RESTRICTIVE', cmd: 'ALL', qual: '(organization_id = current_org_id())' }),
    ])
    expect(b.einordnung).toBe('bekannte_luecke')
    expect(b.begruendung).toMatch(/20261120000000/)
  })

  it('meldet eine unbekannte ungebundene Tabelle als Befund', () => {
    const b = bewerteTabelle('irgendwas_neues', [p({ name: 'admin', cmd: 'ALL', qual: 'is_admin()' })])
    expect(b.einordnung).toBe('befund')
    expect(b.begruendung).toMatch(/keine SELECT-Policy/)
    expect(b.begruendung).toMatch(/admin/)
  })

  it('meldet eine Tabelle ganz ohne Policy als Befund', () => {
    const b = bewerteTabelle('nackt', [])
    expect(b.einordnung).toBe('befund')
    expect(b.begruendung).toMatch(/ueberhaupt keine Policy/)
  })

  it('lässt den Marktplatz als bewusst offen durch', () => {
    const b = bewerteTabelle('angels', [p({ name: 'Herkes engelleri okuyabilir', qual: 'true' })])
    expect(b.einordnung).toBe('offen_beabsichtigt')
    expect(b.begruendung).toMatch(/Marktplatz/)
  })

  it('eine echte Bindung schlägt jeden Listeneintrag', () => {
    // Sonst verdeckt eine veraltete Ausnahme eine Policy, die laengst da
    // ist — und der Lauf behauptet eine Luecke, die niemand mehr hat.
    // Genau so soll pflege_massnahmen nach der Migration umschlagen.
    const b = bewerteTabelle('pflege_massnahmen', [
      p({ name: 'kunde_pflege_massnahmen_select', qual: KUNDENBINDUNG }),
    ])
    expect(b.einordnung).toBe('gebunden')
  })

  it('das gilt auch für den Marktplatz', () => {
    const b = bewerteTabelle('angels', [p({ name: 'eigenes', qual: '(auth.uid() = id)' })])
    expect(b.einordnung).toBe('gebunden')
  })
})

describe('Listen', () => {
  it('führen keine Klienten-, Abrechnungs- oder Pflegedaten als bewusst offen', () => {
    // Der Riegel gegen die bequeme Ausnahme: wer eine Tabelle hier
    // einträgt, behauptet, ALLE angemeldeten Nutzer dürften ihre Zeilen
    // sehen. Für diese Datenarten ist das nie die richtige Antwort.
    for (const tabelle of OFFEN_BEABSICHTIGT.keys()) {
      expect(tabelle, `${tabelle} gehört nicht auf die Ausnahmeliste`)
        .not.toMatch(/^(clients|client_|invoice|service_record|pflege_|akten_|care_)/)
    }
  })

  it('begründen jeden Eintrag im Klartext', () => {
    for (const [tabelle, grund] of [...OFFEN_BEABSICHTIGT, ...BEKANNTE_LUECKEN]) {
      expect(grund.length, `${tabelle} ohne Begründung`).toBeGreaterThan(30)
    }
  })

  it('nennen zu jeder bekannten Lücke die wartende Migration', () => {
    for (const [tabelle, grund] of BEKANNTE_LUECKEN) {
      expect(grund, `${tabelle} nennt keine Migration`).toMatch(/\d{14}_/)
    }
  })
})

describe('tabellenAusQuelltext', () => {
  it('findet jede .from()-Abfrage', () => {
    const quelle = `
      supabase.from('pflege_massnahmenplaene').select('*')
      await supabase.from('pflege_verlauf').select('*').limit(50)
      .from('pflege_massnahmen')
    `
    expect(tabellenAusQuelltext(quelle).sort())
      .toEqual(['pflege_massnahmen', 'pflege_massnahmenplaene', 'pflege_verlauf'])
  })

  it('liefert für eine Datei ohne Abfrage nichts', () => {
    expect(tabellenAusQuelltext('export default function Seite() { return null }')).toEqual([])
  })
})
