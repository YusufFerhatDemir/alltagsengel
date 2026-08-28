// ═══════════════════════════════════════════════════════════════════════
// Abmelde-Token fuer den Newsletter (Track 13, Befund B3)
// ═══════════════════════════════════════════════════════════════════════
//
// WARUM ES DIESE DATEI GIBT
//
// `GET /api/newsletter/unsubscribe?email=<adresse>` hat bis Track 13 die
// Adresse aus der Query genommen und die Zeile abgemeldet. Ohne Token,
// ohne Signatur, ohne Ratenbegrenzung, mit dem Dienstschluessel. Daraus
// folgten drei verschiedene Dinge — sie werden hier getrennt benannt,
// weil sie getrennte Ursachen haben:
//
//   1) FREMDABMELDUNG. Wer eine Adresse kennt oder raet, meldet sie ab.
//      Der Verteiler ist aus der Ferne leerbar; der Betreiber merkt es
//      nicht, weil eine Abmeldung ein voellig normaler Vorgang ist.
//
//   2) DER AUTOMAT MELDET AB. Ein GET-Link in einer Mail wird nicht nur
//      von Menschen geoeffnet. Sicherheitsprodukte im Mailweg (Link-
//      Umschreibung, Vorab-Pruefung von Zielen, Bild-Proxys) rufen
//      Links beim Zustellen auf. Der Empfaenger ist dann abgemeldet,
//      ohne je geklickt zu haben. Genau deshalb verlangt RFC 8058 fuer
//      die Ein-Klick-Abmeldung ein POST und kein GET.
//
//   3) KEIN WIRKUNGSNACHWEIS. `.update()` ohne `.select()` meldet in
//      PostgREST keinen Fehler, wenn NULL Zeilen getroffen wurden. Die
//      Seite sagte „Sie wurden erfolgreich abgemeldet" auch dann, wenn
//      nichts geschehen ist. Dieselbe Klasse wie Track 11 B5.
//
// Dieses Modul beantwortet nur (1): es bindet die Abmeldung an einen
// Nachweis, dass der Link aus einer Mail an GENAU DIESE Adresse stammt.
// (2) loest die Route mit einer Bestaetigungsseite, (3) mit `.select()`.
//
// ─────────────────────────────────────────────────────────────────────
// WARUM HMAC UND KEINE TOKEN-TABELLE
//
// Die Widerrufs-Token der Kontoloeschung liegen in
// `account_deletion_tokens`, weil sie EINMAL verwendbar sein und
// ABLAUFEN muessen. Fuer eine Abmeldung gilt beides ausdruecklich nicht:
// ein Abmeldelink muss noch in einer zwei Jahre alten Mail funktionieren
// (Art. 21 DSGVO — der Widerspruch darf nicht erschwert werden), und er
// muss beliebig oft benutzbar sein. Ein Token ohne Ablauf und ohne
// Verbrauch braucht keinen Speicher: HMAC ueber die Adresse genuegt und
// ist aus der Adresse jederzeit nachrechenbar.
//
// ─────────────────────────────────────────────────────────────────────
// WOHER DER SCHLUESSEL KOMMT — UND WARUM NICHT FAIL-CLOSED
//
// Ein eigener Schluessel (`NEWSLETTER_ABMELDE_SECRET`) hat Vorrang. Fehlt
// er, wird einer aus `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY`
// ABGELEITET — nicht dieser Schluessel selbst, sondern ein HMAC ueber
// eine feste Kennung. Der Dienstschluessel verlaesst diesen Prozess also
// nicht, und der Ableitungsweg ist nicht umkehrbar.
//
// Das ist bewusst KEIN fail-closed. Ein fehlender Schluessel wuerde sonst
// jede Abmeldung unmoeglich machen — und ein Newsletter, von dem man sich
// nicht abmelden kann, ist das schlimmere Ergebnis als einer, dessen
// Token-Schluessel aus einer anderen Quelle kommt. Fail-closed ist die
// richtige Antwort auf „darf jemand mehr, als er soll", nicht auf „kann
// jemand ein Recht ausueben, das ihm zusteht".
//
// Steht KEINE der beiden Quellen zur Verfuegung, wirft `abmeldeSchluessel`
// — dann laeuft der Prozess ohnehin ohne Datenbank und kann keine
// Abmeldung ausfuehren.
// ═══════════════════════════════════════════════════════════════════════

import { createHmac, timingSafeEqual } from 'node:crypto'

/** Feste Kennung der Ableitung. Aendern heisst: alle Altlinks brechen. */
const ABLEITUNGS_KENNUNG = 'alltagsengel:newsletter-abmeldung:v1'

/**
 * Adressen werden vor dem Signieren normalisiert — sonst erzeugen
 * `Max@Example.COM` und `max@example.com` verschiedene Token fuer
 * dieselbe Zeile (die Tabelle speichert kleingeschrieben, und
 * `newsletter_subscribers.email` traegt einen UNIQUE-Index).
 */
export function normalisiereAdresse(email: string): string {
  return String(email ?? '').trim().toLowerCase()
}

/**
 * Der Schluessel, mit dem signiert wird.
 *
 * @throws wenn weder ein eigener noch ein ableitbarer Schluessel da ist.
 */
export function abmeldeSchluessel(env: NodeJS.ProcessEnv = process.env): string {
  const eigener = env.NEWSLETTER_ABMELDE_SECRET
  if (eigener && eigener.length >= 16) return eigener

  const dienst = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  if (dienst && dienst.length >= 16) {
    // Ableitung statt Direktverwendung: der Dienstschluessel selbst wird
    // nie zum Signieren benutzt und ist aus dem Token nicht rekonstruierbar.
    return createHmac('sha256', dienst).update(ABLEITUNGS_KENNUNG).digest('hex')
  }

  throw new Error(
    'Kein Schluessel fuer Abmelde-Token: weder NEWSLETTER_ABMELDE_SECRET noch SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY gesetzt.',
  )
}

/** Token fuer eine Adresse. Stabil — derselbe Eingang ergibt denselben Wert. */
export function erzeugeAbmeldeToken(email: string, env?: NodeJS.ProcessEnv): string {
  return createHmac('sha256', abmeldeSchluessel(env))
    .update(normalisiereAdresse(email))
    .digest('hex')
}

/**
 * Prueft ein Token gegen eine Adresse.
 *
 * Fail-closed in jeder Richtung: leeres Token, falsche Laenge, fehlender
 * Schluessel und jede Ausnahme ergeben `false`. Der Vergleich laeuft in
 * konstanter Zeit — ein zeichenweise abbrechender Vergleich verriete
 * ueber die Antwortzeit, wie weit ein geratenes Token stimmt.
 */
export function pruefeAbmeldeToken(email: string, token: unknown, env?: NodeJS.ProcessEnv): boolean {
  if (typeof token !== 'string' || token.length === 0) return false
  try {
    const erwartet = Buffer.from(erzeugeAbmeldeToken(email, env), 'utf8')
    const erhalten = Buffer.from(token, 'utf8')
    // Laengenpruefung VOR timingSafeEqual — die Funktion wirft sonst.
    if (erwartet.length !== erhalten.length) return false
    return timingSafeEqual(erwartet, erhalten)
  } catch {
    return false
  }
}

/**
 * Der vollstaendige Abmeldelink fuer eine Mail.
 *
 * Bewusst mit Adresse UND Token: die Adresse macht den Link lesbar und
 * erlaubt der Route, die richtige Zeile zu finden, ohne einen Index ueber
 * Token zu brauchen; das Token macht ihn faelschungssicher.
 */
export function abmeldeLink(email: string, basisUrl: string, env?: NodeJS.ProcessEnv): string {
  const adresse = normalisiereAdresse(email)
  const token = erzeugeAbmeldeToken(adresse, env)
  const basis = basisUrl.replace(/\/+$/, '')
  return `${basis}/api/newsletter/unsubscribe?email=${encodeURIComponent(adresse)}&token=${token}`
}
