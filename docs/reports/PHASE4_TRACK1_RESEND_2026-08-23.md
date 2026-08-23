# Phase 4, Track 1 — Resend-Live-Verifikation

**Datum:** 23.08.2026
**Vorgeschichte:** In Phase 3 war dieser Track als `EXTERN_BLOCKIERT` markiert —
Begründung damals: „Gültigkeit des in Vercel hinterlegten Schlüssels nicht prüfbar."
**Ergebnis:** Der Punkt ist aufgelöst. Der Schlüssel ist gültig, nachweisbar,
ohne dass eine einzige Mail verschickt wurde.

---

## 1. Live-Verifikation — Status: `LIVE_VERIFIZIERT`

Neues Werkzeug: `node scripts/verify-resend.mjs`. Es fragt ausschließlich
lesend `GET https://api.resend.com/domains` ab, verschickt nichts, ändert
nichts und gibt den Schlüssel nirgends aus.

| Prüfung | Ergebnis |
|---|---|
| `RESEND_API_KEY` in Vercel vorhanden | ja — Development, Preview, **Production** (angelegt vor 157 Tagen) |
| Produktions-Schlüssel gültig | **ja** — `HTTP 200` auf `GET /domains` |
| `alltagsengel.care` im Resend-Konto | ja, `status=verified`, Region `eu-west-1` |
| DKIM/SPF/DMARC | durch `status=verified` belegt — Resend verifiziert erst, wenn die DNS-Einträge stehen |
| Lokaler Schlüssel (`.env.local`) | ebenfalls gültig, aber **ein anderer** als der in Produktion |

Absenderadresse im Code: `Alltagsengel <info@alltagsengel.care>`
(`ALLTAGSENGEL_ABSENDER` in `lib/notifications.ts`) — Domain deckungsgleich
mit der verifizierten Domain, nie ein persönlicher Name.

## 2. Live-Datenlage — Status: `LIVE_VERIFIZIERT`, und sie ist ernüchternd

Per PostgREST mit `service_role` gegen die Produktionsdatenbank
(Gegenprobe auf eine erfundene Spalte lieferte `42703` — die 200er sind
also belastbar):

| Tabelle | Zeilen |
|---|---|
| `invoice_email_log` | **0** |
| `notification_delivery_log` | **0** |
| `zustellung_retry_laeufe` | 0 |

**Der Versandweg ist in Produktion noch nie gelaufen.** Alles unten
Beschriebene ist damit `GETESTET`, nicht `LIVE_VERIFIZIERT`.

Nebenbefund, der nicht zu diesem Track gehört, aber auffiel:
`invoices` enthält 3 Zeilen, **alle drei mit gesetztem `sent_at`** — bei
**0 festgeschriebenen Rechnungen** (`frozen_at IS NULL`) und 0 Zeilen in
`invoice_email_log`. `versendeRechnungPerEmail()` verlangt `frozen_at`
und schreibt immer ein Protokoll; diese `sent_at`-Werte können also nicht
von diesem Pfad stammen. Vermutlich Altdaten aus einem Testlauf. Wer sie
für „Rechnung wurde zugestellt" hält, irrt.

Ebenfalls verifiziert: Migration `20260927000000` (Vorgangsspalten) **ist
live eingespielt** — der Wiederholungslauf ist damit nicht mehr
fail-closed abgeschaltet. Die RPCs `zustellung_retry_beanspruchen` /
`_abschliessen` antworten. (Die Existenzprobe hat die Laufsperre kurz
gezogen und sofort wieder freigegeben; der Lauf steht als
`abgebrochen / existenzprobe_verifikation` im Register.)

---

## 3. Befunde und Behebung — Status: `IMPLEMENTIERT` + `GETESTET`

### B1 — Eine gescheiterte Rechnungsmail ging NIE raus (schwerwiegend)

`versendeRechnungPerEmail()` schrieb zwar in die Zustellspur, aber ohne
`vorgang_art`/`vorgang_ref`. Der Wiederholungslauf findet ohne diese
Angaben keinen Wiederhersteller, lässt die Zeile 24 Stunden liegen und
schiebt sie dann als **„nicht wiederherstellbar"** ins Dead Letter. Eine
an einer Resend-Störung gescheiterte Rechnung wurde also nie erneut
versucht — genau das, was der gesamte Versandpfad verhindern soll.

**Behoben:** neuer Vorgang `rechnung-versand`
(`lib/notifications/vorgaenge/rechnung.ts`), registriert für den Kanal
`email`; `versendeRechnungPerEmail()` gibt den Vorgangsbezug mit. Damit
der Lauf nicht doppelt protokolliert (was die Versuchsobergrenze
halbieren würde), gibt es den Schalter `ohneZustellspur`.

### B2 — Kein Zeitlimit um den Provider-Aufruf

Das Resend-SDK setzt kein eigenes Zeitlimit. Antwortete Resend nicht,
hing der Aufruf, bis die Serverless-Funktion von der Plattform
abgeräumt wurde: **keine Protokollzeile, kein `invoice_email_log`,
kein `sent_at`** — die Rechnung stand ohne jede Spur da.

**Behoben:** 20 Sekunden Obergrenze. Eine Zeitüberschreitung wird als
`statusCode 408` gemeldet, also als vorübergehend eingestuft und
wiederholt.

### B3 — Der Provider-Statuscode wurde weggeworfen

`sendRawEmail()` gab bei Fehlschlag nur den Meldungstext zurück. Der
Wiederholungslauf konnte deshalb einen `422` („Adresse dauerhaft
unzustellbar") nicht von einer kurzen Störung unterscheiden —
`DAUERHAFT_CODES` lief für den E-Mail-Kanal komplett ins Leere. Eine
kaputte Adresse verbrannte fünf Versuche über gut fünf Stunden, statt
sofort ins Dead Letter zu gehen.

**Behoben:** `RawEmailErgebnis` trägt bei Fehlschlag `statusCode` und das
rohe Provider-Ergebnis; `vorgaenge/buchung.ts` reicht es weiter.

### B4 — „versendet" ohne Beleg des Providers

Der Erfolgspfad prüfte nur `error == null`. Kam eine Antwort ohne
Nachrichten-ID, galt der Versand trotzdem als erfolgreich: `sent_at`
wurde gesetzt, `invoice_email_log` schrieb `versendet` mit
`provider_message_id = NULL`, und die Rechnung wurde nie wieder
angefasst — ohne dass irgendjemand wusste, ob sie rausging.

**Behoben:** Erfolg gilt erst mit Nachrichten-ID. Fehlt sie, ist es ein
Fehlschlag, und zwar ein **dauerhafter**: der Provider hat mit 2xx
geantwortet, die Mail ist womöglich raus, eine Wiederholung könnte eine
zweite erzeugen. Der Vorgang geht sofort in die Betriebsansicht, wo ein
Mensch entscheidet.

### B5 — Folgefix: Doppelversand durch das neue Zeitlimit

Ein Zeitlimit sagt nichts darüber aus, ob der Provider den Auftrag
angenommen hat. Ohne Gegenmaßnahme hätte B2 Doppelversand ermöglicht.

**Behoben:** Idempotenzschlüssel an Resend (`Idempotency-Key`, Fenster 24
Stunden). Rechnung: `rechnung:<invoiceId>`, Mahnung: `mahnung:<queueId>`.
Ein **ausdrücklicher** Nachversand (`erneutSenden`) lässt den Schlüssel
bewusst weg — dort sind zwei Mails die Absicht.

---

## 4. Fehlerpfad-Tests — Status: `GETESTET`

`__tests__/notifications/resend-fehlerpfade.test.ts`, 27 Tests, grün.
Die Kette läuft echt durch (`sendRawEmail` → Zustellspur →
Fehlerklassifizierung → `versendeRechnungPerEmail`); ersetzt ist nur, was
außen liegt: das `resend`-Paket, der Admin-Client, die PDF-Erzeugung.

| Szenario | Erwartung | Status |
|---|---|---|
| a) Schlüssel abgelehnt (401) | Fehlschlag, `failed`, **kein** `sent_at`, **kein** `versendet`; vorübergehend ⇒ Nachversand nach Schlüsseltausch | grün |
| b) Zeitüberschreitung | Abbruch nach 20 s, `statusCode 408`, vorübergehend, Idempotenzschlüssel gesetzt | grün |
| c) 4xx (422) | dauerhaft ⇒ Dead Letter; 429 bleibt vorübergehend | grün |
| d) 5xx / Netzausfall | vorübergehend, Wartestaffel 1/5/15/60/240 min | grün |
| e) Erfolg | `versendet` erst mit Provider-ID; Antwort ohne ID ⇒ Fehlschlag | grün |
| Kein Schlüssel | `uebersprungen`, zählt **nicht** gegen die Versuchsobergrenze | grün |
| Wiederherstellbarkeit | `rechnung-versand` im Register, Vorgangsbezug in der Protokollzeile | grün |

Zusätzlich: Sanitisierung — ein Schlüssel im Fehlertext des Providers
landet nicht in der Zustellspur.

Regressionslage: `npx tsc --noEmit` grün über das gesamte Projekt.
`__tests__/notifications/` (13 Dateien) und `__tests__/billing/`
vollständig grün bis auf zwei Tests in
`__tests__/billing/mahn-versand.test.ts`, die **nicht** zu diesem Track
gehören (siehe unten).

---

## 5. Was NICHT erledigt ist

**Parallele Session in `lib/billing/dunning/mahn-versand.ts`.**
Während dieses Tracks hat eine zweite Session die Mahn-Queue um Retry und
Dead Letter erweitert (rund 300 Zeilen, plus Migration
`20261001000000`). Zwei ihrer eigenen Tests sind derzeit rot
(`fehler_details` trägt neuerdings „— Versuch 1 von 5", der Test erwartet
den alten Text). Das ist ihre laufende Arbeit, nicht diese.

Folge für diesen Track: der Commit ist **scoped** (`DEPLOY_PATHS`) und
lässt diese Datei aus. Die eine Zeile aus B5 —
`idempotenzSchluessel: \`mahnung:${zeile.id}\`` — liegt deshalb
**uncommitted** im Arbeitsverzeichnis und geht mit dem Commit der anderen
Session raus. Sie ist notwendig: deren neuer Auto-Retry würde sonst nach
einer Zeitüberschreitung eine zweite Mahnung erzeugen.

**Kein echter Versand geprüft.** Es wurde bewusst keine Mail verschickt.
Dass Resend eine Rechnungsmail mit PDF-Anhang tatsächlich annimmt und
zustellt, ist damit weiterhin `IMPLEMENTIERT`/`GETESTET`, nicht
`LIVE_VERIFIZIERT`. Der belastbare nächste Schritt wäre ein Versand an
eine eigene Adresse mit einer echten, festgeschriebenen Testrechnung.

**Supabase-MCP war entgegen der Auftragsangabe nicht verfügbar.** In
dieser Sitzung existierten keine `supabase`-Werkzeuge. Ersatz war
PostgREST mit `service_role` aus `.env.local`, jeweils mit Gegenprobe.
DDL war damit nicht möglich — war für diesen Track aber auch nicht nötig.
