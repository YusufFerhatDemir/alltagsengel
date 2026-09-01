# Dienstschlüssel-Pass: Audit aller `admin.from()`-Aufrufe

**Stand:** 01.09.2026 · **Werkzeug:** `npx tsx scripts/audit-admin-from.ts`

Dieser Bericht schließt den Rest, den `scripts/lint-leerzustand.ts` im
Kopfkommentar selbst als offen benennt:

> `~120` findet ein weiter gefasster Scan zusätzlich: Abfragen über den
> Dienstschlüssel (`await admin.from(...)`) und Verwertung durch Iteration
> (`for (const x of liste)`) statt durch einen Setter.

---

## 1. Was gemessen wurde — und warum nicht per grep

`grep "admin.from("` findet **52** Stellen. Das ist keine Zahl über die App,
sondern über die Schreibgewohnheit der Autoren: der Dienstschlüssel-Client
heißt live unter **acht** Namen.

| Name | Bindungen |
|---|---|
| `admin` | 336 |
| `supabase` | 162 |
| `supabaseAdmin` | 8 |
| `adminSupabase` | 4 |
| `adminClient` | 3 |
| `dienst` / `db` / `client` | je 2 |

Ausgerechnet der häufigste Zweitname — `supabase` — ist derselbe, unter dem
anderswo der **RLS-gebundene** Client steht. Wer nach dem Namen sucht,
übersieht 162 Stellen und meldet dafür fremde mit.

`scripts/audit-admin-from.ts` bindet deshalb **pro Datei**: erst die Zuweisung
aus einer Dienstschlüssel-Fabrik, dann genau die so gebundenen Namen.

### Der Ausgangsbestand

| Art | Bedeutung | Anzahl |
|---|---|---:|
| `verworfen` | Nur `data` destrukturiert, Ergebnis unmittelbar verwertet | **56** |
| `mandant` | org-Tabelle ohne `organization_id`-Bedingung, kein vorgelagerter Zaun | **7** |
| **Gesamt** | | **63** |

---

## 2. Drei Messfehler, die der Bericht selbst hatte

Die erste Fassung meldete 100 Treffer. Drei davon waren Fehler **der Regel**,
nicht des Codes — sie sind hier benannt, weil eine Zahl ohne ihre
Fehlerquellen keine Zahl ist:

1. **Optionale Verkettung übersehen.** `clients?.map(…)` enthält hinter dem
   Namen ein `?.` und *keinen* weiteren Punkt. Die Verwertungsregel verlangte
   beides — und übersah damit gerade die vorsichtig geschriebenen Stellen.
   *(+7 Funde nach dem Fix.)*

2. **Leere Zeilen brachen die Kettenlesung.** `ohneKommentare()` ist
   längentreu und hinterlässt von einem Kommentar *innerhalb* einer Kette eine
   Zeile aus Leerzeichen. Die Regel las die Kette nur bis dahin — und meldete
   genau die Dateien als „ohne Mandantenzaun", die den Zaun sorgfältig genug
   gesetzt hatten, um ihn zu kommentieren. Der Dokument-Download
   (`app/api/akten/dokumente/[id]/download/route.ts`) war so ein Fehltreffer.

3. **Der vorgelagerte Zaun war unsichtbar.** Das übliche und *richtige* Muster
   ist zweistufig: erst eine Abfrage mit `.eq('organization_id', …)`, die die
   Kennung freigibt, danach Folgeabfragen über genau diese Kennung. Ohne diese
   Sicht meldete die Regel 45 statt 7 Mandanten-Treffer — der
   Rechnungs-PDF-Weg, der Statuswechsel und die Snapshot-Liste prüfen alle
   sauber eine Abfrage vorher.

Nach der dritten Korrektur meldete die Regel die **frisch abgesicherten**
Stellen als `ungeprueft`: zwischen Abfrage und `if (error)` steht jetzt die
Begründung, warum hier fail-closed geantwortet wird, und die schob die Prüfung
aus dem 900-Zeichen-Fenster. Fehlerprüfung und Verwertung haben deshalb
getrennte Fensterweiten (3000 / 900).

---

## 3. Ergebnis des Mandantenzauns: **kein einziges Leck**

Alle 7 verbliebenen `mandant`-Treffer sind von Hand geprüft. Keiner ist eine
Lücke:

| Stelle | Befund |
|---|---|
| `coach/freischaltung` (3×) | Der Code **ist** das Geheimnis; die Suche über `code_hash` ist global richtig. Die Einlösung bindet an `coach_user_id`, nicht an eine Organisation. |
| `marketing/abmeldung`, `newsletter/unsubscribe` | Abmeldung über die E-Mail-Adresse **soll** mandantenübergreifend wirken. Ein Widerspruch, der nur bei einem Mandanten gilt, wäre der Fehler. |
| `rechnungen/[id]/pdf` | Die Eigentümerprüfung steht unmittelbar **nach** der Ladung (Admin → Org-Abgleich, Kunde → `client.user_id`). Die Regel schaut nur davor. |
| `referral/complete` | Auf `customer_id = user_id` eingegrenzt — die eigenen Buchungen des angemeldeten Nutzers. |

**Das ist ein Ergebnis, kein Nullbefund:** die früheren Härtungen
(`clientGehoertZuOrg`, `org_fence`, `lint-org-id-inserts`) tragen an den
Dienstschlüssel-Wegen.

---

## 4. Behobene Befunde (verworfene Abfragefehler)

**56 → 12.** Die verbleibenden 12 sind geprüft und absichtlich so (Abschnitt 5).

### KRITISCH — Geld und ausgehende Post

| Datei | Was das leere Ergebnis behauptete |
|---|---|
| `billing/auto-invoice/route.ts:244` | **Doppelabrechnung.** `invoice_items` ist die einzige Auskunft, welche Nachweise schon an einer Rechnung hängen. Bei Ausfall galt *jeder* unterschriebene Einsatz als offen — ein Netzaussetzer genügte, um denselben Monat ein zweites Mal zu berechnen. |
| `lib/stripe/helpers.ts:33` | **Zweiter Stripe-Kunde.** Aus „nicht nachsehen können" wurde „gibt es noch nicht": ein neuer Customer entstand, der Upsert überschrieb die alte Kennung. Der alte Customer behielt Zahlungsmittel und Abos — nicht durch eine Gutschrift heilbar. |
| `drip/route.ts:170` | **Sperrliste des Werbeversands.** Leer = niemand hat gebucht → Bestandskundschaft bekommt „Sie haben noch nie gebucht". Post, die draußen ist. |
| `cron/review-request/route.ts:63` | **Sperrliste der Bewertungsanfrage.** Leer = niemand hat bewertet → zweite Anfrage an dieselben Leute. Der Kommentar darüber dokumentiert denselben Schaden schon einmal aus anderer Ursache. |
| `leistungsnachweis/route.ts:223` | Der Nachweis für die Kasse fiel still auf den Text-Rückfall zurück und ging notfalls **ohne Handzeichen** hinaus — gegenüber der Kasse keine Anzeigeschwäche, sondern eine falsche Angabe im Beleg. |
| `billing/invoices/route.ts:69` | Ohne Gutschriften ist der **Offenbetrag zu hoch**. Genau diese Liste ist die Grundlage fürs Anmahnen — eine längst gutgeschriebene Forderung wäre angemahnt worden. |

### HOCH — Entscheidungsgrundlagen

| Datei | Wirkung |
|---|---|
| `billing/dta/[id]` (5 Abfragen) | „Kein Fehlerprotokoll", „keine Rückläufer" heißt hier „der Lauf ist sauber". Ein abgewiesener Lauf sah aus wie ein beanstandungsfreier. |
| `billing/dta/dry-run` (5 Abfragen) | Der Probelauf **vor** dem Versand an die Kasse gab bei Störung Entwarnung: „keine fehlenden Unterschriften" aus einem Monat, aus dem er keine Zeile gesehen hatte. |
| `billing/dunning`, `dta/korrektur`, `dta/fehlercodes` | Leere Arbeitsvorräte als Aussage „nichts offen". |
| `admin/zustellspur` (2×) | Die **Aufsicht über die Zustellung** meldete Ruhe, weil sie blind war. |
| `tours/[id]`, `tours/[id]/vertretung`, `tours/route.ts`, `tours/[id]/stops`, `tours/templates/[id]/anwenden` (9 Stellen) | Tour storniert, Einsätze nicht → der Engel fährt zu einem Termin, den es nicht mehr gibt. Datum verschoben, Einsätze nicht. Wochenkapazität = 0 → Arbeitszeitgrenze ungeprüft. Fahrzeit = 0 → ein Plan, den niemand fahren kann. |
| `engel/match` (3×) | **„Keine Engel in Ihrer Nähe"** an jemanden, der Hilfe sucht — obwohl die Engel da sind. |
| `cron/konto-loeschung:80` | Das DSGVO-Löschprotokoll wäre über `current_org_id()` beim **falschen Mandanten** gelandet — genau das, was der Kommentar darüber verhindern soll. |
| `expansion/switch`, `admin/clients/[id]/status`, `pflege/sturzprotokoll`, `notify-admin-registration`, `ai-chat`, `visitor-alert`, `referral`, `tariffs/uebersicht`, `tarif-verifizierung-service` | Falsche Zustandsbilder, ausbleibende Warnungen, an ein Sprachmodell gereichte Falschaussagen. |

---

## 5. Bewusst **nicht** geändert — mit Begründung im Code

Fail-closed ist nicht überall die sichere Richtung. Diese Stellen tragen jetzt
einen `GEPRUEFT 01.09.2026`-Vermerk, damit sie nicht als übersehen gelten:

| Stelle | Warum so richtig |
|---|---|
| `auto-invoice:362` (`invoice_items`, Anzeige) | Läuft **nach** `createInvoiceDraft` — die Rechnung steht schon. Ein 500 wäre hier die gefährlichere Antwort: der Aufrufer läse „fehlgeschlagen", versuchte es erneut und träfe auf die existierende Rechnung. |
| `lib/organizations/server.ts` (2×), `lib/security/audit.ts` (4×) | Enden bei Fehler in `return null` — und `null` heißt „keine Organisation", also 403. Das ist die fail-closed-Zusage im Kopf beider Funktionen. Preis: eine Sicherheitsmeldung verliert bei Störung ihren Zustellkontext. Benannt, hinnehmbar. |
| `lib/reviews.ts:246` (`istAdminUser`) | `data` null → `data?.role` undefined → `false`. „Im Zweifel kein Administrator". |
| `billing/payments/allocate:61` | `invoices` null → Anzahlvergleich schlägt fehl → 404. Kein Geld bewegt sich auf einer nicht lesbaren Rechnung. |
| `dta/dry-run:517` (Empfängerzertifikate) | Ohne lesbare Zertifikate gilt jedes IK als „fehlt", der Schritt fällt auf `fehler` — der Probelauf sagt im Zweifel **nicht bereit**. |
| `expansion/…/notify-waitlist:78` | `null` = „nicht freigeschaltet" → die Rundmail an die Warteliste geht **nicht** hinaus. Eine falsch angekündigte Freischaltung ließe sich nicht zurückholen. |
| `lib/reviews.ts` (`ladeVerfasser`) | Nur Vorname und Farbe fehlen, die Bewertung bleibt richtig. Eine Bewertungsliste dafür ganz zu verweigern wäre unverhältnismäßig — der Fehler geht jetzt ins Protokoll. |

## 6. Als TODO markiert (MITTEL, Produktentscheidung)

`/api/drip` und `/api/cron/review-request` laufen **ohne Mandantenfilter** über
alle Organisationen. Solange Alltagsengel der einzige Betrieb mit
Endkundengeschäft ist, trifft das denselben Personenkreis; sobald ein zweiter
Mandant Privatkundschaft führt, verschickt der Lauf Alltagsengel-Werbung an
dessen Kundschaft. Der Fix verlangt eine Festlegung, welcher Mandant die
Strecke fahren darf — das ist keine Codefrage und wurde deshalb vermerkt statt
still geändert.

---

## 7. Prüfstand

| Prüfung | Ergebnis |
|---|---|
| `npx tsc --noEmit` | **Exit 0** |
| `npx vitest run` | **9570 bestanden**, 38 übersprungen, 0 rot |
| `npm run test:unit` (node:test) | **2740 bestanden**, 0 rot |
| Neue Tests | `__tests__/security/admin-from-fail-closed.test.ts` — **9 Fälle** |
| Regel-Nachlauf | **63 → 22** (12 `verworfen` + 10 `mandant`, alle in Abschnitt 3/5/6 begründet) |

**Gegenprobe der neuen Tests.** Ein grüner Lauf beweist wenig, wenn er auch
ohne den Riegel grün wäre. Mit auf `if (false)` entschärften Guards:

```
Tests  3 failed | 6 passed (9)
```

Rot werden **genau** die drei Fail-closed-Fälle (Doppelabrechnung, Werbe-
Sperrliste, Bewertungs-Sperrliste); die sechs Gegenproben — die belegen, dass
der Test überhaupt bis zur Entscheidung vordringt — bleiben grün.

Keine Testabdeckung entfernt: 12.310 → 12.319 Fälle.

---

## 8. Grenzen dieser Prüfung

Ehrlich benannt statt stillschweigend:

- Ein Client, der über **mehrere Module** als Parameter gereicht wird, ist
  statisch nicht als Dienstschlüssel erkennbar — dafür bräuchte es einen
  Aufrufgraphen. Dieselbe Grenze hat `lint-org-id-inserts.ts`.
- Die Fehlerprüfung wird im Fenster hinter der Abfrage gesucht. Wird `error`
  erst weit entfernt gelesen, meldet die Regel falsch.
- Ein Treffer ist ein **Verdacht, kein Urteil**. Alle 63 Ausgangstreffer sind
  von Hand beurteilt; die Regel selbst ist ein Türsteher, kein Beweis.
- Geprüft wurde der **Quelltext**, nicht die laufende Produktion. Dass ein
  fail-closed-Pfad live auch greift, belegt erst ein Lauf gegen die echte
  Datenbank.
