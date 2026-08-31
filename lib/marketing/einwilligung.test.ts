// Einwilligung und Sperrliste — node:test
// Ausführen: npx tsx --test lib/marketing/einwilligung.test.ts
//
// Der Kern dieses Moduls ist FAIL-CLOSED. Die Tests prüfen deshalb vor
// allem die Nein-Fälle: eine leere Einwilligungstabelle und eine
// unerreichbare sehen in einer fehlertoleranten Umsetzung gleich aus — und
// im zweiten Fall gingen Mails an Menschen, die widersprochen haben.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  erteileEinwilligung,
  istPlausibleAdresse, ladeEinwilligungsLage, normalisiereAdresse, pruefeEmpfaenger,
  type EinwilligungsLage,
} from './einwilligung'
import type { MarketingKontakt } from './typen'

function kontakt(ueber: Partial<MarketingKontakt> = {}): MarketingKontakt {
  return {
    userId: 'u1', email: 'a@example.com', anzeigename: 'A', rolle: 'kunde',
    plz: null, bundesland: null, istTestkonto: false, istGeloescht: false, istDipaNutzer: false,
    registrierungVollstaendig: true, registriertAm: null, letzteAktivitaet: null,
    letzteBuchung: null, anzahlBuchungen: 0, verfuegbarkeitsFenster: 0,
    qualifiziert: false, einsatzfreigabe: false, fuehrungszeugnisGueltigBis: null,
    ...ueber,
  }
}

const lage = (ueber: Partial<EinwilligungsLage> = {}): EinwilligungsLage => ({
  eingewilligt: new Set(), widerrufen: new Set(), gesperrt: new Set(), ...ueber,
})

// ── Normalisierung ────────────────────────────────────────────────────────

test('Adressen werden kleingeschrieben und getrimmt', () => {
  assert.equal(normalisiereAdresse('  Max@Example.COM '), 'max@example.com')
  assert.equal(normalisiereAdresse(null), '')
  assert.equal(normalisiereAdresse(undefined), '')
})

test('unbrauchbare Adressen fallen durch die Formprüfung', () => {
  for (const unsinn of ['', 'ohne-at', 'a@b', 'a@ b.de', '@example.com', 'a@@b.de']) {
    assert.equal(istPlausibleAdresse(unsinn), false, `„${unsinn}" gilt fälschlich als brauchbar`)
  }
  assert.equal(istPlausibleAdresse('max@example.com'), true)
})

// ── Der Riegel ────────────────────────────────────────────────────────────

test('OHNE Einwilligung wird NICHT versendet — das ist der Normalfall', () => {
  const [e] = pruefeEmpfaenger([kontakt()], lage())
  assert.equal(e.versandfaehig, false)
  assert.equal(e.versandfaehig === false && e.grund, 'keine_einwilligung')
})

test('mit Einwilligung wird versendet', () => {
  const [e] = pruefeEmpfaenger([kontakt()], lage({ eingewilligt: new Set(['a@example.com']) }))
  assert.equal(e.versandfaehig, true)
})

test('die Sperrliste schlägt eine vorhandene Einwilligung', () => {
  // Beides gleichzeitig kommt vor: eingewilligt, abgemeldet, später über
  // ein anderes Formular erneut eingewilligt. Der Widerspruch wiegt
  // schwerer.
  const [e] = pruefeEmpfaenger(
    [kontakt()],
    lage({ eingewilligt: new Set(['a@example.com']), gesperrt: new Set(['a@example.com']) }),
  )
  assert.equal(e.versandfaehig, false)
  assert.equal(e.versandfaehig === false && e.grund, 'gesperrt')
})

test('ein Widerruf schlägt eine Einwilligung', () => {
  const [e] = pruefeEmpfaenger(
    [kontakt()],
    lage({ eingewilligt: new Set(['a@example.com']), widerrufen: new Set(['a@example.com']) }),
  )
  assert.equal(e.versandfaehig, false)
  assert.equal(e.versandfaehig === false && e.grund, 'einwilligung_widerrufen')
})

test('Testkonto und gelöschtes Konto schlagen ALLES', () => {
  const voll = lage({ eingewilligt: new Set(['a@example.com']) })
  const [t] = pruefeEmpfaenger([kontakt({ istTestkonto: true })], voll)
  assert.equal(t.versandfaehig === false && t.grund, 'testkonto')
  const [g] = pruefeEmpfaenger([kontakt({ istGeloescht: true })], voll)
  assert.equal(g.versandfaehig === false && g.grund, 'konto_geloescht')
})

test('wer die Kampagne schon hat, bekommt sie nicht zweimal', () => {
  const [e] = pruefeEmpfaenger(
    [kontakt()],
    lage({ eingewilligt: new Set(['a@example.com']) }),
    new Set(['a@example.com']),
  )
  assert.equal(e.versandfaehig === false && e.grund, 'bereits_erhalten')
})

test('Groß-/Kleinschreibung hebelt die Sperrliste nicht aus', () => {
  const [e] = pruefeEmpfaenger(
    [kontakt({ email: 'MAX@Example.COM' })],
    lage({ eingewilligt: new Set(['max@example.com']), gesperrt: new Set(['max@example.com']) }),
  )
  assert.equal(e.versandfaehig, false)
  assert.equal(e.versandfaehig === false && e.grund, 'gesperrt')
})

test('die versandfähige Zeile trägt die normalisierte Adresse', () => {
  const [e] = pruefeEmpfaenger(
    [kontakt({ email: '  MAX@Example.COM ' })],
    lage({ eingewilligt: new Set(['max@example.com']) }),
  )
  assert.equal(e.versandfaehig, true)
  assert.equal(e.versandfaehig === true && e.kontakt.email, 'max@example.com')
})

// ── Laden ist fail-closed ─────────────────────────────────────────────────

/** Minimaler Doppelgänger, der einen Abfragefehler meldet. */
function supabaseMitFehler(fehlerBei: string) {
  return {
    from(tabelle: string) {
      const antwort = tabelle === fehlerBei
        ? { data: null, error: { message: 'Verbindung weg' } }
        : { data: [], error: null }
      const kette = {
        select: () => kette, eq: () => kette,
        in: () => Promise.resolve(antwort),
      }
      return kette
    },
  }
}

test('ein Fehler beim Lesen der Einwilligungen WIRFT — er liefert keine leere Menge', () => {
  // Das ist der ganze Punkt: eine leere Menge hieße „niemand hat
  // eingewilligt" und wäre harmlos. Ein Fehler beim LESEN heißt aber
  // „wir wissen es nicht" — und daraus darf nie ein Versand entstehen,
  // der die Sperrliste übergeht.
  return assert.rejects(
    () => ladeEinwilligungsLage(
      supabaseMitFehler('marketing_consents') as never, 'org', ['a@example.com'], 'newsletter',
    ),
    /Einwilligungen nicht lesbar/,
  )
})

test('ein Fehler beim Lesen der Sperrliste WIRFT ebenfalls', () => {
  return assert.rejects(
    () => ladeEinwilligungsLage(
      supabaseMitFehler('email_suppression_list') as never, 'org', ['a@example.com'], 'newsletter',
    ),
    /Sperrliste nicht lesbar/,
  )
})

test('ohne Adressen wird gar nicht erst abgefragt', async () => {
  let aufrufe = 0
  const zaehler = {
    from() {
      aufrufe += 1
      const kette = { select: () => kette, eq: () => kette, in: () => Promise.resolve({ data: [], error: null }) }
      return kette
    },
  }
  const l = await ladeEinwilligungsLage(zaehler as never, 'org', [], 'newsletter')
  assert.equal(aufrufe, 0)
  assert.equal(l.eingewilligt.size, 0)
})

// ── DiPA-Werbefreiheit (Befund 31.08.2026) ────────────────────────────────
//
// Der PflegeCoach ist die DiPA. DiPAV §6 Abs. 4 verlangt Werbefreiheit,
// §5 Abs. 5 bindet die Datenverarbeitung an den Versorgungszweck und
// schließt Werbung ausdrücklich aus. Ein Coach-Nutzer mit Kundenkonto war
// bis hierher über die Kundenliste erreichbar — genau das Cross-Selling,
// das AK-VS-01 verbietet.

test('ein PflegeCoach-Nutzer wird nie angeschrieben', () => {
  const [e] = pruefeEmpfaenger(
    [kontakt({ email: 'a@example.com', istDipaNutzer: true })],
    lage({ eingewilligt: new Set(['a@example.com']) }),
  )
  assert.equal(e.versandfaehig, false)
  assert.equal(e.grund, 'dipa_nutzer')
})

test('auch eine ausdrückliche Einwilligung hebt die Werbefreiheit nicht auf', () => {
  // Der einzige Ausschlussgrund, über den die betroffene Person NICHT
  // verfügen kann: die Werbefreiheit ist eine Eigenschaft des Produkts,
  // keine Frage des Willens.
  const [e] = pruefeEmpfaenger(
    [kontakt({ email: 'a@example.com', istDipaNutzer: true, rolle: 'kunde' })],
    lage({ eingewilligt: new Set(['a@example.com']) }),
  )
  assert.equal(e.versandfaehig, false)
  assert.equal(e.grund, 'dipa_nutzer')
})

test('der DiPA-Grund schlägt jeden anderen Ausschlussgrund', () => {
  // Er steht ganz oben in der Reihenfolge — die Aufschlüsselung im
  // Trockenlauf soll den Grund nennen, der sich nicht ändern lässt.
  const [e] = pruefeEmpfaenger(
    [kontakt({ email: 'a@example.com', istDipaNutzer: true, istTestkonto: true })],
    lage({ gesperrt: new Set(['a@example.com']) }),
  )
  assert.equal(e.grund, 'dipa_nutzer')
})

test('ein gewöhnliches Konto bleibt versandfähig', () => {
  // Gegenprobe: ohne sie wäre der Riegel auch dann grün, wenn er alles
  // abwiese.
  const [e] = pruefeEmpfaenger(
    [kontakt({ email: 'a@example.com', istDipaNutzer: false })],
    lage({ eingewilligt: new Set(['a@example.com']) }),
  )
  assert.equal(e.versandfaehig, true)
})

// ── erteileEinwilligung: der ON-CONFLICT-Befund (31.08.2026) ──────────────
//
// Der Aufruf endete zuvor IMMER mit „there is no unique or exclusion
// constraint matching the ON CONFLICT specification": das Upsert zielte auf
// marketing_consents_offen_je_adresse, und der Index ist PARTIELL
// (WHERE revoked_at IS NULL). Postgres waehlt einen partiellen Index für
// ON CONFLICT nur mit derselben WHERE-Bedingung, die PostgREST nicht
// mitgeben kann. Folge: es liess sich überhaupt keine Einwilligung
// eintragen — weder über das Doppel-Opt-in noch von Hand.
//
// Diese Tests prüfen den Ersatz: schlichtes INSERT, und 23505 gilt als
// Erfolg (es steht bereits eine offene Einwilligung).

/** Ein Doppelgänger, der protokolliert, WELCHE Operation aufgerufen wurde. */
function fakeClient(insertAntwort: { data?: unknown; error?: unknown }) {
  const aufrufe: string[] = []
  const client = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        maybeSingle: async () => ({ data: null, error: null }),
        insert() {
          aufrufe.push('insert')
          return {
            select: () => ({ maybeSingle: async () => insertAntwort }),
          }
        },
        upsert() {
          aufrufe.push('upsert')
          return { select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }
        },
      }
    },
  }
  return { client, aufrufe }
}

test('erteileEinwilligung nutzt INSERT, kein Upsert auf den partiellen Index', async () => {
  const { client, aufrufe } = fakeClient({ data: { id: 'neu-1' }, error: null })
  const e = await erteileEinwilligung(client as never, {
    organizationId: 'org', email: 'a@example.com', consentTyp: 'newsletter',
    quelle: 'doppel_opt_in',
  })
  assert.equal(e.ok, true)
  assert.ok(aufrufe.includes('insert'), 'kein INSERT abgesetzt')
  assert.ok(!aufrufe.includes('upsert'), 'es wird wieder geupsertet — der Index ist partiell')
})

test('eine bereits offene Einwilligung (23505) gilt als Erfolg', async () => {
  const { client } = fakeClient({ data: null, error: { code: '23505', message: 'duplicate key' } })
  const e = await erteileEinwilligung(client as never, {
    organizationId: 'org', email: 'a@example.com', consentTyp: 'newsletter',
    quelle: 'doppel_opt_in',
  })
  assert.equal(e.ok, true, 'ein Doppel ist kein Fehler — es ist schon eingewilligt')
})

test('ein anderer Datenbankfehler bleibt ein Fehler', async () => {
  // Gegenprobe: ohne sie schluckte die 23505-Behandlung womöglich alles.
  const { client } = fakeClient({ data: null, error: { code: '23502', message: 'null value' } })
  const e = await erteileEinwilligung(client as never, {
    organizationId: 'org', email: 'a@example.com', consentTyp: 'newsletter',
    quelle: 'doppel_opt_in',
  })
  assert.equal(e.ok, false)
})
