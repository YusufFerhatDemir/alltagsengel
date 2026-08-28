/**
 * DiPA / PflegeCoach — Datenfreigabe: die Regeln vor dem Empfänger-Lookup
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `lib/coach/freigabe.ts` hatte keinen Test. Die Datei ist klein und ohne
 * Datenbankzugriff — sie hält aber die Werte fest, die darüber entscheiden,
 * WEM Gesundheitsdaten freigegeben werden können, und die Eingabe, die
 * anschliessend an `coach_finde_nutzer_id()` geht.
 *
 * Diese Funktion ist ein Mitgliedschafts-Orakel: Zu jeder E-Mail-Adresse
 * liesse sich damit feststellen, ob ein PflegeCoach-Konto existiert.
 * `EXECUTE` ist deshalb auf `service_role` beschränkt, der Aufruf steht
 * hinter der Anmeldung, hinter der eigenen Einwilligung und hinter einem
 * Deckel von zehn Suchen je Nutzer und Stunde
 * (__tests__/security/coach-freigabe-lookup-deckel.test.ts).
 *
 * `normalisiereEmail()` ist die Stufe DAVOR. Sie entscheidet, was
 * überhaupt zu einer Suche wird. Zwei Dinge hängen daran:
 *
 *   1. Die Vereinheitlichung auf Kleinschreibung. Ohne sie zählten
 *      „Anna@example.org" und „anna@example.org" als zwei verschiedene
 *      Suchen — der Stundendeckel liesse sich durch blosses Variieren der
 *      Gross-/Kleinschreibung vervielfachen.
 *   2. Die Längengrenze. 254 Zeichen ist die Obergrenze einer
 *      zustellbaren Adresse (RFC 5321); alles darüber ist keine Adresse,
 *      die jemand hat, sondern Eingabe, die niemand prüfen wollte.
 *
 * Die Prüfung ist bewusst KEINE vollständige RFC-5322-Validierung — das
 * steht so im Dateikopf und ist richtig: Eine strengere Regel würde
 * gültige Adressen abweisen, und die Zustellbarkeit entscheidet ohnehin
 * erst der Lookup. Die Tests halten deshalb fest, was die Funktion
 * LEISTEN SOLL, nicht was eine perfekte Validierung leisten würde.
 */

import { describe, it, expect } from 'vitest'
import {
  BEREITS_FREIGEGEBEN_CODE,
  EIGENE_EMAIL_CODE,
  EMPFAENGER_ROLLEN,
  EMPFAENGER_ROLLE_LABELS,
  FREIGABE_CONSENT_FEHLT_CODE,
  KEIN_KONTO_CODE,
  istAktiveFreigabe,
  normalisiereEmail,
} from '@/lib/coach/freigabe'

describe('normalisiereEmail', () => {
  it('vereinheitlicht auf Kleinschreibung und schneidet Leerraum ab', () => {
    // Der Stundendeckel zählt je normalisierter Adresse. Bliebe die
    // Schreibweise erhalten, wäre er durch Gross-/Kleinschreibung
    // beliebig oft neu zu starten.
    expect(normalisiereEmail('  Anna.Beispiel@Example.ORG  ')).toBe('anna.beispiel@example.org')
  })

  it('weist alles ab, was keine Adresse ist', () => {
    for (const eingabe of ['', '   ', 'ohne-at', 'zwei@@example.org', 'a@b', 'a b@example.org', '@example.org', 'a@']) {
      expect(normalisiereEmail(eingabe), `„${eingabe}" hätte abgewiesen werden müssen.`).toBeNull()
    }
  })

  it('weist alles ab, was gar kein String ist', () => {
    // Der Wert kommt aus einem JSON-Body und ist damit beliebig. Ohne
    // diesen Riegel liefe `.trim()` auf einer Zahl oder einem Objekt in
    // einen Laufzeitfehler statt in eine 400.
    for (const eingabe of [null, undefined, 42, {}, [], true, { toString: () => 'a@b.de' }]) {
      expect(normalisiereEmail(eingabe)).toBeNull()
    }
  })

  it('lässt eine Adresse an der Längengrenze zu und eine darüber nicht', () => {
    const rest = '@example.org'
    const gerade = 'a'.repeat(254 - rest.length) + rest
    expect(gerade).toHaveLength(254)
    expect(normalisiereEmail(gerade)).toBe(gerade)
    expect(normalisiereEmail('a' + gerade)).toBeNull()
  })

  it('misst die Länge NACH dem Abschneiden von Leerraum', () => {
    // Sonst führte angehängter Leerraum zu einer Ablehnung, obwohl die
    // Adresse selbst kurz genug ist.
    const gerade = 'a'.repeat(242) + '@example.org'
    expect(normalisiereEmail(`   ${gerade}   `)).toBe(gerade)
  })
})

describe('Empfängerrollen', () => {
  it('sind genau die zwei vorgesehenen', () => {
    // Der Kreis ist eng gehalten: Freigegeben werden Gesundheitsdaten.
    // Käme eine dritte Rolle hinzu, ist das eine Produktentscheidung und
    // keine, die beim Umbauen einer Auswahlliste nebenbei fällt.
    expect(EMPFAENGER_ROLLEN).toEqual(['angehoerig', 'pflegedienst'])
  })

  it('jede Rolle hat eine Beschriftung', () => {
    for (const rolle of EMPFAENGER_ROLLEN) {
      expect(EMPFAENGER_ROLLE_LABELS[rolle]?.length).toBeGreaterThan(0)
    }
    // Und keine Beschriftung ohne Rolle — ein Rest aus einer entfernten
    // Rolle sähe in der Oberfläche wie eine wählbare Option aus.
    expect(Object.keys(EMPFAENGER_ROLLE_LABELS).sort()).toEqual([...EMPFAENGER_ROLLEN].sort())
  })
})

describe('istAktiveFreigabe', () => {
  it('gilt genau so lange, wie kein Widerruf gestempelt ist', () => {
    expect(istAktiveFreigabe({ widerrufen_am: null })).toBe(true)
    expect(istAktiveFreigabe({ widerrufen_am: '2026-08-01T10:00:00Z' })).toBe(false)
  })

  it('alles ausser NULL gilt als widerrufen — auch ein leerer Wert', () => {
    // Die Prüfung ist ein striktes `=== null`, nicht ein Wahrheitstest.
    // Das ist die sichere Richtung: Die Funktion beantwortet „darf diese
    // Freigabe noch gelten?", und ein Wert, den niemand deuten kann, darf
    // nicht als „gilt weiter" durchgehen. Fail-closed heisst hier: im
    // Zweifel KEINE Weitergabe von Gesundheitsdaten.
    //
    // Live kann der Fall nicht eintreten (`timestamptz` ist NULL oder eine
    // Zeit). Der Test hält die Richtung fest, damit ein späterer Umbau auf
    // `!zeile.widerrufen_am` nicht unbemerkt die Gegenrichtung wählt.
    expect(istAktiveFreigabe({ widerrufen_am: '' })).toBe(false)
    expect(istAktiveFreigabe({ widerrufen_am: null })).toBe(true)
  })
})

describe('Fehlercodes', () => {
  it('sind eindeutig — die Oberfläche unterscheidet daran die Fälle', () => {
    const codes = [
      EIGENE_EMAIL_CODE, KEIN_KONTO_CODE,
      BEREITS_FREIGEGEBEN_CODE, FREIGABE_CONSENT_FEHLT_CODE,
    ]
    expect(new Set(codes).size).toBe(codes.length)
    for (const c of codes) expect(c).toMatch(/^[A-Z_]+$/)
  })
})
