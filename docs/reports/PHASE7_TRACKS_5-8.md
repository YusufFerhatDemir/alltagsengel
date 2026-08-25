# Phase 7 — Tracks 5 bis 8

**Zeitraum:** 25./26.08.2026
**Repositories:** Alltagsengel (`main`) · ChairMatch (`main`, `db50334`)
**Vorher-Stand:** `9a0a204` (nach Phase 6B)

Vier Tracks: DATEV-Reality-Check, ChairMatch-Preisschema, Pilot Control
Center, Chaos-Tests. **Kein Echtversand, keine Echtbuchung, kein Echtgeld** —
alles lief gegen In-Memory-Postgres bzw. lesend gegen Live-Schemata.

---

## 0. Überblick

| Track | Thema | Ergebnis |
|---|---|---|
| 5 | DATEV-Finanzexport Reality Check | Validator neu + fail-closed im Export-Service; 31 Tests |
| 6 | ChairMatch Pricing-Schema | live verifiziert; **Lücke gefunden**: keine Zeitversionierung. Migration vorbereitet, 33 Tests |
| 7 | Pilot Control Center | Money-Path-Betriebslage als 3. Abschnitt von `/admin/pilot`; 29 Tests |
| 8 | Chaos / Failure Tests | 33 Tests; **ein echter P1-Befund gefunden und gefixt** |

**Neue Tests gesamt:** 126 (93 Alltagsengel, 33 ChairMatch).

---

## 1. Track 5 — DATEV-Finanzexport, Reality Check

### 1.1 Was fehlte

Die Phase-6B-Suite prüft jede Buchungsart **einzeln**. Ungeprüft blieb die
Frage, die der Steuerberater als erste stellt: ergibt die **Datei als
Ganzes** einen einlesbaren, in sich stimmigen Stapel?

Das ist keine Wiederholung. Ein Stapel kann aus lauter korrekten Zeilen
bestehen und trotzdem unbrauchbar sein — eine Zeile mit 11 statt 12
Feldern, ein Konto außerhalb jedes definierten Bereichs, ein Belegdatum in
der falschen Periode.

### 1.2 Neu: `lib/billing/datev/datev-validator.ts`

Zwei Prüfebenen, weil beide etwas sehen, das die andere nicht sieht:

**`pruefeBuchungssaetze()`** — vor dem Formatieren. Sieht Dinge, die in der
fertigen Datei nicht mehr erkennbar sind, etwa dass ein Umsatz mehr als
zwei Nachkommastellen hatte und beim Formatieren gerundet **wurde** (der
formatierte Wert sieht danach korrekt aus, die Summe stimmt nicht mehr).

**`pruefeDatevCsv()`** — auf dem Artefakt, das ausgeliefert wird. Zerlegt
jede Zeile mit einem eigenen CSV-Parser nach DATEV-Regeln; genau der
Unterschied zwischen diesem Parser und `split(';')` ist der Fehler, den die
Prüfung finden soll.

Geprüfte Zusicherungen (Auszug): Feldanzahl 12 je Zeile · Betrag mit Komma
und genau zwei Nachkommastellen, immer positiv (das Vorzeichen gehört ins
S/H-Feld) · Konto und Gegenkonto stammen aus dem Kontenrahmen **oder** dem
Debitorenbereich 10000–69999 · Konto ≠ Gegenkonto · Belegdatum als
gültiges TTMM **innerhalb des Exportzeitraums** · kein Feld beginnt mit
`= + - @` · CRLF-Zeilenenden.

### 1.3 Fail-closed im Export-Service

`erstelleDatevExport()` prüft jetzt **vor** dem Storage-Upload. Bei
Befunden: kein CSV im Storage, kein `erstellt`-Datensatz, stattdessen ein
`fehler`-Lauf mit den Befundcodes in `fehler_details` — und
`DatevPruefungFehlgeschlagen` mit den Befunden am Fehlerobjekt. Die Route
antwortet mit **422** und gibt die Befunde unverändert aus; sonst müsste
man den Export ein zweites Mal erzeugen, um zu sehen, was ihn blockiert
hat, und genau das erzeugt er absichtlich nicht.

**Warnungen** stehen auch im Erfolgsfall in der Antwort. Ohne das läge der
Hinweis „zwei betragsgleiche Vorgänge — prüfen" nur in der Protokolldatei
im Storage, die niemand öffnet, bevor er importiert.

### 1.4 Der repräsentative Monat

`__tests__/billing/datev-reality-check.test.ts` (31 Tests) baut **einen**
Stapel, in dem alle Vorfälle nebeneinander vorkommen: normale Rechnung ·
Korrekturrechnung · Gutschrift · Teilstorno · Rücklastschrift · zwei
Teilzahlungen · Überzahlung · Mahngebühr · zwei betragsgleiche Zahlungen am
selben Tag · ein zweiter Mandant, der in keiner Zeile auftauchen darf.

Bewusst **kein** Golden-File-Vergleich: der fällt bei jeder harmlosen
Formatierungsänderung um und sagt nichts über Richtigkeit. Stattdessen
läuft der echte Validator über Stapel und Datei — derselbe Code, der im
Export-Service fail-closed davorsteht.

Belegt unter anderem: die Überzahlung wird in **voller Höhe** gebucht (wer
auf den Rechnungsbetrag kürzt, lässt eingegangenes Geld verschwinden) ·
beide Teilzahlungsraten laufen auf **dasselbe** Debitorenkonto · die
Korrekturrechnung ist Forderung an Erlös und **keine** Gutschrift ·
Gutschrift und Teilstorno tragen die Generalumkehr bei positivem Betrag.

### 1.5 Eine bewusste Nicht-Entscheidung

Zwei betragsgleiche Teilzahlungen auf dieselbe Rechnung am selben Tag sind
von einer Doppelbuchung **in der Datei** nicht zu unterscheiden. Der Befund
ist deshalb eine **Warnung**, kein Fehler: ein Fehler würde hier einen
korrekten Export blockieren. Entschieden wird das von einem Menschen.

### 1.6 BUSINESS_INPUT_REQUIRED

Der Validator führt die Liste selbst (`BERATER_VORGABE_ERFORDERLICH`), damit
sie nicht in einem Bericht verschwindet:

| # | Vorgabe | Wer |
|---|---|---|
| D1 | Beraternummer | DATEV-Kanzlei |
| D2 | Mandantennummer | DATEV-Kanzlei |
| D3 | Kontenrahmen SKR03/SKR04 — **bestätigt** | Kanzlei |
| D4 | Erlöskonto für steuerfreie Pflege (§ 4 Nr. 16 UStG) | Kanzlei |
| D5 | Sachkontenlänge (4 oder 5) | Kanzlei |
| D6 | Wirtschaftsjahresbeginn | Kanzlei |

Ohne D1/D2 bricht der Export ab, bevor irgendetwas erzeugt wird — das ist
seit jeher so und bleibt so. D3–D6 tragen heute Standardwerte aus dem
SKR03/SKR04-Kontenrahmen; **erfunden ist keiner davon**, bestätigt aber
auch keiner.

> **Grenze, ausdrücklich benannt.** Ob die Kontonummern die *richtigen*
> sind, kann kein Code wissen. Geprüft wird, dass jedes Konto **aus** einem
> definierten Vorrat stammt — nicht, dass der Vorrat der richtige ist.

---

## 2. Track 6 — ChairMatch Pricing-Schema (Repo: ChairMatch, `db50334`)

Auftrag war ausdrücklich **prüfen**, keine Preise festlegen.

### 2.1 Live verifiziert

`scripts/verify-pricing-schema.mjs` (neu, **nur lesend**, `npm run
verify:pricing-schema`). Gegen die Produktionsinstanz ausgeführt:

```
OK    protect_pricing.{id,risk_level,day/month/year_price_cents,currency,active,updated_at}
OK    compliance_plans.{id,plan_type,price_cents,included_submissions,
                        min_term_months,extra_submission_price_cents,currency,active,updated_at}
OK    protect_pricing:  anon abgewiesen (HTTP 401) — RLS greift
OK    compliance_plans: anon abgewiesen (HTTP 401) — RLS greift
INFO  effective_from / effective_to fehlen auf beiden Tabellen
```

Methode: PostgREST beantwortet eine unbekannte Spalte mit `42703`, **bevor**
es Rechte prüft. Spaltenexistenz und RLS-Lage kommen damit aus derselben
Antwort. Ohne Keys endet das Skript mit **Exit 2** („nicht geprüft") —
ausdrücklich nicht mit 0, sonst sähe ein übersprungener Lauf in CI aus wie
ein bestandener.

### 2.2 Strukturell verifiziert — 33 Tests

`src/__tests__/pricing-schema.test.ts` liest die Migration als Quelle der
Wahrheit und hält jede Zusicherung fest:

- **Cent-genau, keine Gleitkomma-Geldwerte.** Alle fünf Geldspalten sind
  `integer`; keine ist `numeric`, `decimal`, `real` oder `double precision`.
- **Wertebereiche.** `risk_level` kennt genau die vier Stufen — gegengeprüft
  gegen `src/components/RiskBadge.tsx`, damit die Taxonomie nicht an zwei
  Orten auseinanderläuft. `plan_type` genau drei. `currency ~ '^[A-Z]{3}$'`
  auf **beiden** Tabellen.
- **Preise ≥ 0, nie `> 0`** — 0 heißt „gratis", nicht „gibt es nicht".
- **RLS an, keine Policy** (= deny), plus `REVOKE ALL … FROM anon,
  authenticated`. RLS allein reicht nicht: ein GRANT bleibt bestehen und
  wirkt, sobald irgendwann eine permissive Policy dazukommt.
- **Kein einziges `INSERT`** in der Migration. Das Seed-Template ist ohne
  Ausfüllen SQL-**ungültig**, und keiner der sechs Entwurfsbeträge aus
  `20260310` steht mehr darin.

### 2.3 Der Befund: keine Zeitversionierung

`effective_from` / `effective_to` existieren **nicht**. Eindeutigkeit wird
heute dadurch erreicht, dass es überhaupt nur **eine** Zeile je Stufe gibt
(UNIQUE-Index). Das ist gegen konkurrierende aktive Preise wirksam — hat
aber eine Kehrseite:

> Der Seed schreibt per `ON CONFLICT … DO UPDATE` über den alten Wert.
> Zu einem Vertrag von gestern lässt sich danach nicht mehr feststellen,
> welcher Preis damals galt.

Solange beide Tabellen leer sind, ist der Schaden **null**. Mit dem ersten
verkauften Vertrag ist es eine Nachweislücke — gegenüber Kunde und
Finanzamt.

**Vorbereitet, NICHT angewendet:**
`supabase/migrations/20260826_pricing_gueltigkeit.sql` (+ Rollback) —
`effective_from`/`effective_to`, `CHECK (effective_to > effective_from)`,
und an Stelle des UNIQUE-Index ein `EXCLUDE USING gist (risk_level WITH =,
daterange(effective_from, effective_to, '[)') WITH &&) WHERE (active)`.

Halboffener Bereich mit Absicht: ein Preis, der am 01.03. endet, und einer,
der am 01.03. beginnt, überlappen **nicht**. `WHERE (active)` ebenso — sonst
müsste man Historie löschen, um einen Preis korrigieren zu können.

**Folge für den Seed:** Nach der Migration gibt es den UNIQUE-Index nicht
mehr, `ON CONFLICT (risk_level)` scheitert mit `42P10`. Deshalb neu:
`supabase/seed/pricing.seed.versioniert.template.sql` — schließt den
laufenden Preis ab und legt den neuen als eigene Zeile an, statt zu
überschreiben. Das alte Template trägt jetzt einen Warnblock.

### 2.4 BUSINESS_INPUT_REQUIRED (unverändert offen)

| # | Frage |
|---|---|
| C1 | **Welche Beträge?** Beide Tabellen sind leer. Die Werte aus `20260310` sind Entwurf und gelten NICHT. |
| C2 | Wird Protect für alle vier Risikostufen verkauft oder nur HIGH/VERY_HIGH? Nicht verkaufte Stufen: Zeile **streichen**, nicht mit 0 befüllen. |
| C3 | Netto oder brutto? Die Spalten heißen `*_cents` ohne Steuerkennzeichen. |
| C4 | Bleibt es bei `one_time` / `yearly` / `monthly`? |
| C5 | **Soll die Gültigkeitsmigration laufen?** Sie ändert die Seed-Semantik. Vor dem ersten verkauften Vertrag ist sie billig, danach teuer. |

---

## 3. Track 7 — Pilot Control Center

### 3.1 Additiv, nicht ersetzend

`/admin/pilot` gab es bereits und beantwortet zwei Fragen: **darf** heute
ein echter Kunde abgerechnet werden (Betriebs-Checkliste) und **wie weit**
ist jeder Kunde gekommen (Kundenketten). Der Money Path ist die **dritte**
Frage — *was ist gerade liegen geblieben?* — und hängt als Abschnitt 3 an
derselben Seite und derselben Route.

Eine zweite Route hätte zwei Guards, zwei Caching-Regeln und zwei Stellen
zum Vergessen bedeutet. Das Ampel-Vokabular ist deshalb auch dasselbe
(`gruen`/`gelb`/`rot` aus `lib/pilot/types.ts`), erweitert um genau einen
vierten Wert: **`ungeprueft`**.

### 3.2 Was gemessen wird

| Bereich | Kennzahlen |
|---|---|
| **CAMT** | Importe · Importe mit Fehler · Buchungen · automatisch zugeordnet · ungeklärt · offene Klärfälle · Rücklastschriften · **Hash-Dubletten** |
| **Rechnung** | gesamt · versandbereit · prüfen: kein Empfänger · blockiert: nicht festgeschrieben · blockiert: Status · versendet · Protokollzeilen |
| **Mahnung** | mahnfähig · gesperrt · Warteschlange wartend/versendet/fehlgeschlagen · **Dead Letter** |
| **DATEV** | Exporte · Prüfung nicht bestanden · erstellt, nicht abgeholt · heruntergeladen · Debitorenzuordnungen · Konfiguration |
| **System** | fehlende Pflicht-Variablen · scharfe Versandschalter · Schalter-Warnungen · Audit-Einträge (gesamt/heute) · Zustellprotokoll |

**Hash-Dubletten** ist die interessanteste: der Index auf
`zahlungseingaenge.quelldatei_hash` ist bewusst **nicht** unique — die
Sperre sitzt in der Import-Route. Diese Zählung ist damit die einzige
Möglichkeit, ihr Versagen überhaupt zu bemerken.

### 3.3 Drei Eigenschaften, die getestet sind

**Fail-closed.** Eine gescheiterte Messung ergibt `null`, nie `0`, und
erscheint unter `hinweise`. Ein Bereich mit einem `null`-Wert ist **nie**
grün. Die Oberfläche zeigt `—`, nicht `0`: *„keine Klärfälle"* und
*„Klärfälle nicht zählbar"* sind zwei verschiedene Aussagen, und nur eine
davon ist beruhigend.

**Mandantenzaun.** Ein Test prüft, dass **jede einzelne** der über zehn
Abfragen auf `organization_id` filtert. Der Dienst läuft mit `service_role`
(BYPASSRLS); vergisst eine Abfrage den Filter, zeigt das Dashboard fremde
Zahlen und niemand merkt es, weil eine Zahl immer plausibel aussieht.

**Keine Schreiboperation.** Getestet, dass das Modul kein `insert`,
`update` oder `delete` ausführt, dass der Money-Path-Abschnitt der Seite
kein `<form>`, kein `<button>` und kein `onClick` enthält, und dass die
Route weiter kein `POST`/`PUT`/`PATCH`/`DELETE` anbietet.

Ebenfalls getestet: **kein Variablenwert** taucht in der Ausgabe auf. Geprüft
wird die *Existenz* von Env-Variablen, nie der Wert.

### 3.4 Die Regel aus dem Auftrag

> *„Keine kritische Geldaktion darf NUR anhand eines UI-Buttons ohne
> Backend-Prüfung freigegeben werden."*

Umgesetzt als **strukturelle** Eigenschaft, nicht als Absichtserklärung: das
Modul kennt keine Aktion, die Route kennt kein schreibendes Verb, die Seite
keinen Knopf. Der Satz steht zusätzlich im **Datenmodell**
(`freigabeHinweis`), nicht nur im Seitentext — sonst liest ihn niemand, der
die Zahlen weiterverarbeitet.

Die tatsächlichen Riegel bleiben, wo sie sind: Versandgate und
Festschreibung in `rechnung-versand.ts`, Dublettensperre in der
CAMT-Import-Route, Stapelprüfung in `export-service.ts`, `requireOpsAdmin()`
plus RESTRICTIVE `org_fence`.

---

## 4. Track 8 — Chaos / Failure Tests

### 4.1 🔴 P1-Befund: der halb gebuchte Zahlungseingang

**Wo:** `lib/billing/core/payments.ts`, `allocatePayment()`.

**Wie er entsteht.** `payment_allocations` trägt `UNIQUE(payment_id,
invoice_id)`. Das ist der Riegel gegen die Doppelbuchung und war wirksam —
er hatte aber eine teure Nebenwirkung. Bricht ein Lauf **nach** dem Insert
ab (Verbindungsabbruch, Audit-Fehler, Prozessende), steht die
Zuordnungszeile in der Datenbank, während `invoices.paid_amount` und
`payments.allocated_cents` den alten Stand tragen.

Gemessener Zustand nach einem `08006` auf dem `invoices`-Update:

```
payment_allocations : 1 Zeile, 5000 Cent
payments            : allocated_cents = 0, matching_status = 'nicht_zugeordnet'
invoices            : paid_amount = NULL, status = 'sent'
Wiederholungslauf   : "duplicate key value violates unique constraint" (23505)
```

**Wirkung.** Drei Dinge gleichzeitig, keines davon sichtbar:

1. Der **DATEV-Export bucht die Zahlung** — er liest genau diese Tabelle
   (`generiereZahlungsBuchungen`).
2. Die Rechnung gilt weiter als **offen** und wird **gemahnt**.
3. Kein Wiederholungslauf kommt je durch; die Meldung `duplicate key` sagt
   niemandem, dass Geld bereits verbucht ist.

**Ein Kunde, der bezahlt hat, bekommt eine Mahnung.**

**Fix.** Der abgebrochene Vorlauf wird zu Ende geführt statt abgewiesen:

- Bei `23505` wird die bestehende Zeile gelesen. **Anderer Betrag** →
  klarer Abbruch mit Klartext („existiert bereits eine Zuordnung über X
  Cent"); ein Widerspruch darf niemand automatisch auflösen.
- **Gleicher Betrag** → der Lauf setzt fort. Ob die Rechnung schon
  fortgeschrieben wurde, wird **festgestellt, nicht geraten**:
  `paid_amount` wird gegen die Summe **aller** Zuordnungszeilen der
  Rechnung gehalten. Deckt sie die bestehende Zeile bereits ab, wird der
  Rechnungs-Update übersprungen — sonst zählte dieselbe Zahlung zweimal.

**Bewusst nicht gefixt:** dass `logBillingAction()` wirft. Das ist
fail-closed und richtig (GoBD — ein unprotokollierter Geldvorgang darf nicht
still durchgehen). Es zur Warnung abzustufen hätte einen **wiederholbaren
Abbruch gegen eine dauerhafte Protokolllücke** getauscht. Mit dem
idempotenten Wiederholungslauf ist der Abbruch jetzt folgenlos.

### 4.2 Die Szenarien

`__tests__/chaos/geldweg-chaos.test.ts` (16) — auf echtem Postgres:

| Szenario | Zusicherung |
|---|---|
| Verbindungsabbruch nach dem Insert | Rechnung unberührt, Zuordnung sichtbar |
| Wiederholungslauf | führt zu Ende, **eine** Zeile, `paid_amount` genau einmal |
| Audit-Fehler nach der Buchung | wiederholbar, ohne doppelt zu buchen |
| bestehende Zuordnung, **anderer** Betrag | Abbruch mit Klartext |
| zwei parallele Läufe auf dieselbe Zahlung | mindestens einer scheitert, Summe ≤ Zahlbetrag |
| Zahlung A → Rechnung B (fremder Mandant) | abgewiesen, fremde Rechnung unberührt |
| Sammelzuordnung mit **einer** fremden Rechnung | fremde Rechnung in keinem Fall gebucht |
| Betrag 0 / negativ / über Zahlbetrag | abgewiesen, **bevor** etwas geschrieben wird |
| krummer Cent-Betrag | keine Zeile mit Bruchteil-Cent |
| CHECK-Verletzung | gemeldet, nicht verschluckt; Rechnung bleibt `sent` |
| zwei gleiche Beträge am selben Tag | zwei getrennte Vorgänge, Summe stimmt |
| `createPayment` scheitert am Insert | keine halbe Zahlung |

`__tests__/chaos/export-und-eingabe-chaos.test.ts` (17):

Lesefehler auf `invoices` / `payment_allocations` → **Abbruch statt leerem
Stapel** (eine Datei mit null Zahlungseingängen sieht aus wie ein Monat, in
dem niemand bezahlt hat; jeder Debitorensaldo wäre falsch) · Deadlock bei
der Debitorenvergabe · unbekanntes Konto besteht die Prüfung nicht ·
Trennzeichen in Stammdaten verschieben keine Spalte · IBAN-Prüfsumme,
Längen, Kleinschreibung · Betragsparser (`12€34`, englische Schreibweise,
Müll → NaN, 0 bleibt gültig) · symmetrische Cent-Rundung · Debitorennummer
mit CSV-Trennzeichen oder Formelzeichen.

Neu als Werkzeug: `__tests__/chaos/helpers/chaos-client.ts` — legt sich über
einen echten Client und lässt **einen gezielt gewählten** Aufruf scheitern,
so wie er live scheitern würde (PostgREST-Fehlerobjekt, keine Ausnahme). Die
interessanten Geldfehler entstehen nicht, wenn eine Abfrage scheitert,
sondern wenn die **dritte von vier** scheitert — die ersten zwei haben dann
schon geschrieben.

### 4.3 Bereits abgedeckt — hier benannt statt doppelt geprüft

| Szenario | Wo |
|---|---|
| Resend Zeitüberschreitung, 401, 422, **429**, 5xx, Antwort ohne Nachrichten-ID, fehlender `RESEND_API_KEY`, Idempotenzschlüssel, Wiederholung ohne Doppelprotokoll | `__tests__/notifications/resend-fehlerpfade.test.ts` |
| CAMT-Datei zweimal, überlappende Auszüge, zwei gleiche Beträge, fremder Mandant, unlesbare Beträge/Daten, PDNG, DBIT | `__tests__/e2e/camt-pipeline-pglite.test.ts` |
| Doppelversand derselben Rechnung (`sent_at`) | `__tests__/billing/rechnung-versand.test.ts` |

### 4.4 Ergebnis gegen das Ziel

| Ziel | Stand |
|---|---|
| Keine Doppelbuchung | ✅ DB-`UNIQUE` + idempotenter Wiederholungslauf, beides getestet |
| Kein Doppelversand | ✅ `sent_at` + Idempotenzschlüssel an Resend |
| Keine fremden Mandantendaten | ✅ Org-Fence im Kern von `allocatePayment`, getestet auch für den Sammelfall |
| Kein stiller Geldfehler | ✅ der eine gefundene ist gefixt; Lesefehler brechen ab statt leer zu liefern |

---

## 5. Quality Gate

| Prüfung | Ergebnis |
|---|---|
| `npx tsc --noEmit` | **0 Fehler** |
| `npm run test:unit` (node:test) | **2.211 / 2.211 grün** |
| `npx vitest run` | **5.620 grün**, 38 übersprungen, **6 rot** — siehe unten |
| `npm run lint:forbidden` (FULL) | **0 Treffer**, 24.575 Dateien |
| ChairMatch `npm run typecheck` | 0 Fehler |
| ChairMatch `npm test` | **520 / 520 grün** (vorher 487) |

Die Suiten liefen **nacheinander**, nicht gleichzeitig.

### Die 6 roten Tests

Alle in **einer** Datei: `__tests__/billing/sammelrechnung-e2e-phase4-pglite.test.ts`.

**Sie gehören nicht zu dieser Arbeit.** Eine parallel laufende Session hat
`lib/billing/versand/rechnung-versand.ts` um einen neuen Pflicht-Parameter
`preflight` erweitert (`lib/billing/preflight/rechnung-preflight.ts`, im
Arbeitsverzeichnis noch uncommitted). `sammelrechnung-lauf.ts` reicht ihn
noch nicht durch, weshalb der Versand mit `uebersprungen` endet statt mit
`versendet`.

Nachgeprüft: die Datei berührt weder `allocatePayment` noch
`payment_allocations`, DATEV oder Pilot — also keine der hier geänderten
Stellen. Gegenprobe: `rechnung-versand.test.ts`,
`resend-fehlerpfade.test.ts`, `abrechnungskette-pglite`, `mahnkette-pglite`
und `mahnversand-route-pglite` laufen grün.

> **Deploy-Hinweis.** Wegen der parallelen Session wurde mit
> `DEPLOY_PATHS=…` gestaged — die in-flight-Dateien der anderen Session sind
> **nicht** mitcommittet.

---

## 6. Offen / nächster Schritt

| # | Punkt | Art |
|---|---|---|
| **P-1** | DATEV-**Storage**-Schicht bleibt ungeprüft (PGlite bildet Storage nicht ab). Die neue Prüfung sitzt davor — sie verhindert, dass eine fehlerhafte Datei überhaupt hochgeladen wird. | benannte Grenze |
| **P-2** | Die erste echte DATEV-CSV sollte jemand **öffnen und die Spaltenausrichtung ansehen**, bevor sie importiert wird. | Erstbetrieb |
| **P-3** | D1–D6 (Kanzlei-Vorgaben) und C1–C5 (ChairMatch-Preise). | BUSINESS_INPUT_REQUIRED |
| **P-4** | ChairMatch-Gültigkeitsmigration `20260826_pricing_gueltigkeit.sql` anwenden — **oder bewusst nicht**. Vor dem ersten Vertrag billig, danach teuer. | Entscheidung |
| **P-5** | `sammelrechnung-lauf.ts` muss den neuen `preflight`-Parameter durchreichen. | **andere Session** |
