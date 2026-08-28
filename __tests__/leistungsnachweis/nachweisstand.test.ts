// ═══════════════════════════════════════════════════════════════════
// Wirksamer Nachweisstand — status UND proof_status zusammen
// ═══════════════════════════════════════════════════════════════════
//
// BEFUND (28.08.2026): der DB-Trigger sync_service_record_status laeuft nur
// in EINE Richtung (proof_status -> status). Live tragen 28 von 30
// Nachweisen proof_status='ENTWURF', 15 davon bei status='invoiced' — also
// laengst abgerechnet. Wer allein proof_status liest, haelt einen bezahlten
// Einsatz fuer einen nie eingereichten Nachweis.
//
// Die Gegenproben in dieser Datei fuehren die ALTE Regel noch einmal aus
// und zeigen, was sie an genau diesen Zeilen ergeben haette.

import { describe, it, expect } from 'vitest'
import {
  nachweisRang,
  nachweisOffen,
  hatUnterschrift,
} from '@/lib/leistungsnachweis/status-sync'

/** Die live vorgefundene Zeile: abgerechnet, proof_status nie nachgezogen. */
const ABGERECHNET_MIT_ENTWURF = {
  status: 'invoiced',
  proof_status: 'ENTWURF',
  billing_status: 'OFFEN',
}

describe('nachweisRang — der hoehere der beiden Staende zaehlt', () => {
  it('abgerechnete Zeile mit proof_status=ENTWURF hat Rang 4, nicht 0', () => {
    expect(nachweisRang(ABGERECHNET_MIT_ENTWURF)).toBe(4)
  })

  it('GEGENPROBE: die alte Regel las nur proof_status und haette 0 gesagt', () => {
    const alteRegel = (r: { proof_status?: string | null }) =>
      r.proof_status === 'ENTWURF' ? 0 : 4
    expect(alteRegel(ABGERECHNET_MIT_ENTWURF)).toBe(0)
    expect(nachweisRang(ABGERECHNET_MIT_ENTWURF)).not.toBe(alteRegel(ABGERECHNET_MIT_ENTWURF))
  })

  it('proof_status hebt den Rang, wenn status hinterherhinkt', () => {
    expect(nachweisRang({ status: 'draft', proof_status: 'UNTERSCHRIEBEN' })).toBe(3)
  })

  it('unbekannte Werte senken den Rang nie', () => {
    expect(nachweisRang({ status: 'signed', proof_status: 'PHANTASIE' })).toBe(3)
    expect(nachweisRang({ status: 'kaputt', proof_status: 'ABGESCHLOSSEN' })).toBe(2)
  })

  it('leere Zeile ergibt -1', () => {
    expect(nachweisRang({})).toBe(-1)
    expect(nachweisRang(null)).toBe(-1)
  })
})

describe('nachweisOffen — die Frage der Erinnerungsketten', () => {
  it('der abgerechnete Nachweis ist NICHT offen', () => {
    expect(nachweisOffen(ABGERECHNET_MIT_ENTWURF)).toBe(false)
  })

  it('GEGENPROBE: nach der alten Regel war er offen — 2 Aufgaben je Zeile', () => {
    const alteRegel = (r: { proof_status?: string | null }) => r.proof_status === 'ENTWURF'
    expect(alteRegel(ABGERECHNET_MIT_ENTWURF)).toBe(true)
  })

  it('ein echter Entwurf bleibt offen', () => {
    expect(nachweisOffen({ status: 'draft', proof_status: 'ENTWURF', billing_status: 'OFFEN' })).toBe(true)
  })

  it('incomplete zaehlt weiterhin als offen', () => {
    expect(nachweisOffen({ status: 'incomplete', proof_status: 'ENTWURF' })).toBe(true)
  })

  it('storniert ist entschieden und damit nicht offen', () => {
    expect(nachweisOffen({ status: 'draft', proof_status: 'STORNIERT' })).toBe(false)
    expect(nachweisOffen({ status: 'draft', proof_status: 'ENTWURF', billing_status: 'STORNIERT' })).toBe(false)
  })

  it('abgeschlossen ist nicht mehr offen', () => {
    expect(nachweisOffen({ status: 'complete', proof_status: 'ABGESCHLOSSEN' })).toBe(false)
  })
})

describe('hatUnterschrift — nach dem Beleg fragen, nicht nach der Statusspalte', () => {
  it('proof_status=UNTERSCHRIEBEN ist ein Beleg', () => {
    expect(hatUnterschrift({ proof_status: 'UNTERSCHRIEBEN' })).toBe(true)
  })

  it('proof_status=ABGERECHNET ist ein Beleg', () => {
    expect(hatUnterschrift({ proof_status: 'ABGERECHNET' })).toBe(true)
  })

  it('ein signature_hash ist ein Beleg (der DB-Trigger vergibt ihn)', () => {
    expect(hatUnterschrift({ proof_status: 'ENTWURF', signature_hash: 'ab12' })).toBe(true)
  })

  it('eine client_signature ist ein Beleg — das ist der Verwaltungsweg', () => {
    expect(hatUnterschrift({ proof_status: 'ENTWURF', client_signature: 'Frau Meier' })).toBe(true)
  })

  it('status=signed ALLEIN ist KEIN Beleg — genau dieser Fall soll sichtbar bleiben', () => {
    // Absicht: 'signed' kann aus einem direkten Verwaltungsschreibvorgang
    // stammen, ohne dass je jemand unterschrieben haette. Wuerde
    // hatUnterschrift() den status mitzaehlen, verschwaende genau der Fall,
    // fuer den die DTA-Vorpruefung da ist.
    expect(hatUnterschrift({ proof_status: 'ENTWURF', signature_hash: null, client_signature: null })).toBe(false)
  })

  it('leere bzw. "false"-Signatur zaehlt nicht', () => {
    expect(hatUnterschrift({ client_signature: '' })).toBe(false)
    expect(hatUnterschrift({ client_signature: 'false' })).toBe(false)
    expect(hatUnterschrift({ client_signature: '   ' })).toBe(false)
  })

  it('leere Zeile hat keine Unterschrift', () => {
    expect(hatUnterschrift(null)).toBe(false)
    expect(hatUnterschrift({})).toBe(false)
  })

  it('GEGENPROBE: die alte Regel (proof_status===UNTERSCHRIEBEN) haette die '
    + 'live vorgefundene, unterschriebene Zeile als unsigniert gemeldet', () => {
    const zeile = { proof_status: 'ENTWURF', client_signature: 'Frau Meier', signature_hash: null }
    const alteRegel = (r: { proof_status?: string | null }) => r.proof_status !== 'UNTERSCHRIEBEN'
    expect(alteRegel(zeile)).toBe(true)      // alte Regel: „nicht unterschrieben"
    expect(hatUnterschrift(zeile)).toBe(true) // neue Regel: Beleg liegt vor
  })
})
