/**
 * Leistungsnachweis: die drei Statusspalten je Stufe.
 * @see lib/abrechnung/nachweis-stufen.ts
 *
 * ── DIE LÜCKE, DIE DIESER TEST SCHLIESST ──────────────────────────────
 * `scripts/verify-geldweg-live.mjs` fährt die Kette über zwölf Stationen
 * gegen die echte Datenbank — Nachweis, Unterschrift, Sperre, Rechnung,
 * Abrechnungsvermerk, Versand, Zahlung. An Station 5 LIEST sie
 * `proof_status` und schreibt ihn in die Ausgabe, **fordert aber nichts**
 * von ihm. Die Kette konnte also durchlaufen, während die zweite
 * Statusspalte beliebig danebenlag.
 *
 * Genau das ist live der Fall: 28 von 30 Zeilen stehen auf
 * `proof_status='ENTWURF'`, obwohl sie signiert oder abgerechnet sind.
 * Der Trigger aus Migration `20260901010000` läuft nur in eine Richtung
 * (`proof_status` → `status`) und holt nichts nach.
 *
 * Die Altbestände bleiben unangetastet — das ist eine fachliche
 * Entscheidung. Geprüft wird hier die LOGIK: was wäre stimmig, und
 * erkennt der Code die Drift, wenn sie auftritt.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PROOF_STATUS, BILLING_STATUS, PROOF_ZU_STATUS, STATUS_RANG, GELDWEG_STATIONEN,
  istProofStatus, istBillingStatus, statusRang, statusNachTrigger, pruefeStimmigkeit,
  istAbrechnungsvermerk, PROOF_ENDSTAND_UNTER_SPERRE, PROOF_UNERREICHBAR,
} from '@/lib/abrechnung/nachweis-stufen'

const MIG = join(process.cwd(), 'supabase/migrations')

// ═══════════════════════════════════════════════════════════════════════
describe('Werte stammen aus den Migrationen, nicht aus dem Code', () => {
  const schema = readFileSync(join(MIG, '20260808200000_einsatzplanung_leistungsnachweise.sql'), 'utf8')

  function checkWerte(spalte: string): string[] {
    const m = schema.match(new RegExp(`${spalte} text DEFAULT[^)]*?CHECK \\(\\s*${spalte} IN \\(([^)]+)\\)`, 's'))
    if (!m) throw new Error(`CHECK für ${spalte} nicht gefunden`)
    return m[1].split(',').map(t => t.trim().replace(/^'|'$/g, '')).filter(Boolean)
  }

  it('proof_status deckt sich mit dem CHECK', () => {
    expect([...PROOF_STATUS].sort()).toEqual(checkWerte('proof_status').sort())
  })

  it('billing_status deckt sich mit dem CHECK', () => {
    expect([...BILLING_STATUS].sort()).toEqual(checkWerte('billing_status').sort())
  })

  it('die Abbildung deckt sich mit dem Trigger', () => {
    // Der Trigger ist die Wahrheit. Diese Tabelle ist nur seine Kopie im
    // Anwendungscode — laufen sie auseinander, prueft der Test hier etwas,
    // das die Datenbank nicht tut.
    const trig = readFileSync(join(MIG, '20260901010000_service_record_status_sync.sql'), 'utf8')
    for (const [proof, status] of Object.entries(PROOF_ZU_STATUS)) {
      if (status === null) continue
      expect(trig, `${proof} → ${status}`).toMatch(
        new RegExp(`WHEN '${proof}'\\s+THEN '${status}'`),
      )
    }
    // STORNIERT hat bewusst kein Gegenstueck.
    expect(trig).toMatch(/'STORNIERT'.*status unver/is)
  })

  it('die Rangfolge deckt sich mit dem Trigger', () => {
    const trig = readFileSync(join(MIG, '20260901010000_service_record_status_sync.sql'), 'utf8')
    for (const [status, rang] of Object.entries(STATUS_RANG)) {
      expect(trig, `${status}=${rang}`).toMatch(new RegExp(`WHEN '${status}' THEN ${rang}`))
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('statusNachTrigger — nur vorwärts', () => {
  it.each([
    ['ENTWURF', null, 'draft'],
    ['ABGESCHLOSSEN', 'draft', 'complete'],
    ['UNTERSCHRIEBEN', 'complete', 'signed'],
    ['ABGERECHNET', 'signed', 'invoiced'],
  ])('%s auf %s ergibt %s', (proof, bisher, erwartet) => {
    expect(statusNachTrigger(proof, bisher)).toBe(erwartet)
  })

  it('setzt NIE zurück', () => {
    // „Nur echt vorwaerts. Nie zurueck." — der Trigger selbst.
    expect(statusNachTrigger('ENTWURF', 'invoiced')).toBe('invoiced')
    expect(statusNachTrigger('UNTERSCHRIEBEN', 'invoiced')).toBe('invoiced')
  })

  it('lässt STORNIERT den status unberührt', () => {
    // Ein Widerruf laeuft ueber billing_status, nicht ueber status.
    expect(statusNachTrigger('STORNIERT', 'signed')).toBe('signed')
  })

  it('lässt einen unbekannten proof_status unberührt', () => {
    expect(statusNachTrigger('IRGENDWAS', 'complete')).toBe('complete')
    expect(statusNachTrigger(null, 'complete')).toBe('complete')
  })

  it('setzt einen Nachweis ohne status immer vor', () => {
    // Rang -1 fuer NULL: der Trigger setzt dann in jedem Fall.
    expect(statusRang(null)).toBe(-1)
    expect(statusNachTrigger('ABGESCHLOSSEN', null)).toBe('complete')
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('pruefeStimmigkeit', () => {
  it('die zwölf Stationen sind in sich stimmig', () => {
    for (const s of GELDWEG_STATIONEN) {
      const r = pruefeStimmigkeit(s)
      expect(r.abweichungen, s.station).toEqual([])
      expect(r.stimmig, s.station).toBe(true)
    }
  })

  it('lässt den Abrechnungsvermerk durch: invoiced bei UNTERSCHRIEBEN', () => {
    // Der Endstand eines sauber durchlaufenen NEUEN Nachweises. Die Sperre
    // laesst beim Abrechnen NUR `status` zu; `proof_status` kann dabei gar
    // nicht mitgezogen werden. Am 14.09.2026 gegen die Produktionsdatenbank
    // belegt: drei Schreibversuche auf die zweite Spalte, dreimal P0001.
    // Wer das als Abweichung meldet, alarmiert bei jedem korrekten Fall.
    const r = pruefeStimmigkeit({ status: 'invoiced', proof_status: 'UNTERSCHRIEBEN', billing_status: 'OFFEN' })
    expect(r.abweichungen).toEqual([])
    expect(r.stimmig).toBe(true)
  })

  it('meldet einen GRÖSSEREN Vorsprung als Drift', () => {
    // Hier waere ein Nachweis abgerechnet worden, der nie unterschrieben
    // war — das ist der Live-Bestand aus der Zeit vor der Sperre.
    for (const proof of ['ENTWURF', 'ABGESCHLOSSEN']) {
      const r = pruefeStimmigkeit({ status: 'invoiced', proof_status: proof })
      expect(r.stimmig, proof).toBe(false)
      expect(r.abweichungen.join(' '), proof).toMatch(/hinkt/)
    }
  })

  it('beanstandet billing_status OFFEN bei invoiced NICHT', () => {
    // Auch diese Spalte ist nach der Unterschrift gesperrt. OFFEN ist dort
    // der vorgesehene Endstand, kein vergessener Eintrag.
    expect(pruefeStimmigkeit({ status: 'invoiced', proof_status: 'UNTERSCHRIEBEN', billing_status: 'OFFEN' }).stimmig).toBe(true)
    // Fuer einen Kassen-Nachweis setzt der Gate-Trigger schon beim INSERT
    // einen anderen Wert — auch der bleibt einfach stehen.
    expect(pruefeStimmigkeit({
      status: 'invoiced', proof_status: 'UNTERSCHRIEBEN',
      billing_status: 'KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET',
    }).stimmig).toBe(true)
  })

  it('erkennt einen status, der HINTER dem proof_status liegt', () => {
    // Die andere Richtung — die duerfte der Trigger gar nicht zulassen.
    const r = pruefeStimmigkeit({ status: 'draft', proof_status: 'UNTERSCHRIEBEN' })
    expect(r.abweichungen.join(' ')).toMatch(/liegt hinter/)
  })

  it('erkennt ein halbes Storno', () => {
    // Steht der Widerruf nur in einer Spalte, gilt er halb: die eine
    // Auswertung sieht ihn, die andere nicht.
    expect(pruefeStimmigkeit({ proof_status: 'STORNIERT', billing_status: 'OFFEN' }).stimmig).toBe(false)
    expect(pruefeStimmigkeit({ proof_status: 'UNTERSCHRIEBEN', billing_status: 'STORNIERT' }).stimmig).toBe(false)
    expect(pruefeStimmigkeit({ proof_status: 'STORNIERT', billing_status: 'STORNIERT' }).stimmig).toBe(true)
  })

  it('weist unbekannte Werte ab, statt sie durchzuwinken', () => {
    for (const z of [
      { status: 'fertig' },
      { proof_status: 'unterschrieben' },      // Kleinschreibung ist ein anderer Wert
      { billing_status: 'BEZAHLT' },
    ]) {
      expect(pruefeStimmigkeit(z).stimmig, JSON.stringify(z)).toBe(false)
    }
  })

  it('ein leerer Zustand ist keine Abweichung', () => {
    // Ein frisch gelesener Datensatz ohne die beiden Zusatzspalten soll
    // nicht als kaputt gelten — nur als unbestimmt.
    expect(pruefeStimmigkeit({}).stimmig).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Erlaubnislisten sind fail-closed', () => {
  it.each([[''], ['toString'], ['__proto__'], [null], [42], [{}]])('weist %s ab', (w) => {
    expect(istProofStatus(w)).toBe(false)
    expect(istBillingStatus(w)).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('der Endstand unter der Sperre', () => {
  it('ist UNTERSCHRIEBEN — ABGERECHNET ist unerreichbar', () => {
    expect(PROOF_ENDSTAND_UNTER_SPERRE).toBe('UNTERSCHRIEBEN')
    expect(PROOF_UNERREICHBAR).toContain('ABGERECHNET')
  })

  it('die Sperre lässt genau einen Weg neben dem Storno offen', () => {
    // Der Test haelt die Fassung aus 20260829200000 gegen: `status` von
    // signed/complete auf invoiced, bei sonst unveraenderter Zeile.
    // Aendert jemand die Sperre, faellt dieser Test auf — und mit ihm die
    // Begruendung fuer PROOF_ENDSTAND_UNTER_SPERRE.
    const sperre = readFileSync(join(MIG, '20260829200000_sperre_generierte_spalten.sql'), 'utf8')
    expect(sperre).toMatch(/NEW\.proof_status = 'STORNIERT'/)
    expect(sperre).toMatch(/NEW\.status = 'invoiced' AND OLD\.status IN \('signed', 'complete'\)/)
    // Nur status und updated_at bleiben aus dem Vergleich — proof_status
    // und billing_status NICHT. Genau daran scheitert die zweite Spalte.
    expect(sperre).toMatch(/to_jsonb\(OLD\) - 'status' - 'updated_at'/)
    expect(sperre).not.toMatch(/- 'proof_status'/)
    expect(sperre).not.toMatch(/- 'billing_status'/)
  })

  it('istAbrechnungsvermerk trifft nur diesen einen Fall', () => {
    expect(istAbrechnungsvermerk('invoiced', 'UNTERSCHRIEBEN')).toBe(true)
    expect(istAbrechnungsvermerk('invoiced', 'ENTWURF')).toBe(false)
    expect(istAbrechnungsvermerk('signed', 'UNTERSCHRIEBEN')).toBe(false)
    expect(istAbrechnungsvermerk(null, null)).toBe(false)
  })
})
