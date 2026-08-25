# Phase 7 — Money Path Pilot

**Zeitraum:** 25./26.08.2026
**Repositories:** Alltagsengel (`main`) · ChairMatch (`main`)
**Vorgänger:** `docs/reports/PHASE6B_TECHNICAL_PROGRESS.md`
**Detailberichte:** `PHASE7_TRACKS_1-4.md` · `PHASE7_TRACKS_5-8.md`

Dieses Dokument fasst alle acht Tracks zusammen. Die beiden Detailberichte
bleiben bestehen; sie enthalten die Begründungen im Einzelnen. Wer nur eine
Datei liest, liest diese.

---

## 0. Der Satz, um den es in dieser Phase ging

Phase 6B endete mit: *„Was jetzt bleibt, ist kein Code mehr, sondern
Erstbetrieb."*

Das stimmte für die Frage, ob die Geldpfade **funktionieren**. Es stimmte nicht
für die Frage, ob man sie **gefahrlos scharf stellen kann**. Die drei Schalter,
die den Erstbetrieb auslösen, waren fail-closed und insoweit richtig — aber
niemand konnte vorher sehen, was beim Umlegen passieren würde. Der erste
Erkenntnisgewinn wäre die Wirkung selbst gewesen, und die ist bei Geld nicht
mit einem Knopf rückgängig zu machen.

Phase 7 baut für jeden Geldpfad eine Vorstufe, die das Ergebnis zeigt, **ohne
es auszulösen** — und prüft anschließend, was passiert, wenn mitten im Vorgang
etwas abbricht.

### Was ausdrücklich NICHT passiert ist

- **Kein Schalter umgelegt.** `RECHNUNGSVERSAND_AUTOMATISCH` und
  `MAHNVERSAND_AUTOMATISCH` sind weiterhin nicht gesetzt. `CAMT_IMPORT_MODE`
  ist neu und steht auf seinem fail-closed-Standard.
- **Keine echte Rechnung versendet, keine Mahnung verschickt, keine Bankdatei
  importiert, keine Zahlung gebucht.**
- **Keine Preise erfunden**, keine Freigabe, kein Zertifikat, keine
  Kanzlei-Vorgabe behauptet.
- **Keine Migration angewendet.** Die einzige neue Migration (ChairMatch,
  Preis-Gültigkeitszeiträume) ist vorbereitet und liegt bewusst still — ihre
  Anwendung ist eine Geschäftsentscheidung, keine technische.

---

## 1. Ergebnis in Zahlen

| Messung | Wert |
|---|---|
| Typecheck (`npx tsc --noEmit`) | **0 Fehler** |
| node:test (`npm run test:unit`) | **2.211 grün / 0 rot** |
| vitest (`npx vitest run`) | **5.627 grün / 38 übersprungen / 0 rot** |
| **Tests gesamt** | **7.838** (vorher 7.530 → **+308**) |
| `npm run lint:forbidden` (FULL) | **0 Treffer** |
| `npm run check:schema-drift` | **0 Befunde** (siehe §11) |
| ChairMatch `npm test` | **520 / 520 grün** (vorher 487) |
| Neue Module (Alltagsengel) | 12 |
| Neue Routen | 2 — **beide ausschließlich lesend** |
| Gefundene Produktionsbefunde | **7**, alle behoben (§10) |

Die Suiten liefen **nacheinander**, nie gleichzeitig und nie parallel zum
Typecheck.

---

## 2. Die acht Tracks auf einen Blick

| # | Track | Ergebnis | Commit |
|---|---|---|---|
| 1 | Versand-Schalter | Zentrale Auswertung, Umgebungstrennung, Audit bei Wechsel | `5967009` |
| 2 | CAMT-Preflight | Standard DRY_RUN, 6 Klassifikationen, Pilot-Bericht | `5967009` |
| 3 | Rechnungs-Preflight | 16 Punkte, drei Urteile, fail-closed verdrahtet | `5967009` |
| 4 | Mahn-Safety-Gate | 10 Sperren an einer Stelle, in `advanceDunning()` | `5967009` |
| 5 | DATEV Reality Check | Validator mit zwei Prüfebenen, fail-closed vor dem Upload | `a994885` |
| 6 | ChairMatch Pricing | Live verifiziert; Nachweislücke gefunden, Migration vorbereitet | `a994885` · `db50334` |
| 7 | Pilot Control Center | Money-Path-Betriebslage, rein lesend | `a994885` |
| 8 | Chaos / Failure Tests | 33 Tests, **ein P1-Befund** gefunden und gefixt | `a994885` |

> **Zur Commit-Reihenfolge.** `a994885` (Tracks 5–8) liegt **vor** `5967009`
> (Tracks 1–4). Track 7 importiert ein Modul aus Track 1 — `a994885` ist
> deshalb **allein nicht baubar** (CI-Lauf 32906028213: *„Module not found:
> `@/lib/config/versand-flags`"*). Ab `5967009` ist der Baum wieder
> geschlossen. **Folge für Rollback:** ein Revert bis einschließlich `5967009`
> ist zulässig, ein Stehenbleiben auf `a994885` nicht.

---

## 3. Track 1 — Die zwei Versand-Schalter

**Vorher:** `process.env.X === '1'` an drei Stellen. Fail-closed und insoweit
richtig; drei Dinge fehlten.

**Umgebungstrennung — der schwerste Punkt.** Eine Vercel-Variable, die für
*„All Environments"* angelegt wird — die Vorauswahl im Dialog — steht auch in
jedem Preview-Deployment und in jedem lokalen `vercel env pull`. Beim Umlegen
für die Produktion hätte **jeder Branch-Preview** angefangen, echte Rechnungen
und Mahnungen zu verschicken: gegen dieselbe Produktionsdatenbank, mit
demselben Resend-Schlüssel. Der Schalter wirkt jetzt nur im Produktionslauf
(`istProduktionslauf()` aus `lib/env/pruefung.ts` — dieselbe Definition wie die
bestehende ENV-Prüfung, keine zweite). Für einen bewussten Test außerhalb:
zusätzlich `VERSAND_NICHT_PRODUKTION_ERLAUBT=1`.

**Ungültige Werte sind sichtbar.** `true`, `yes`, `ja`, `' 1'` bedeuteten AUS —
richtig, aber niemand erfuhr davon. Jetzt fünf unterscheidbare Befunde:
`aus_fehlt`, `aus_explizit`, `aus_ungueltig`, `aus_umgebung`, `an`. Leerraum
bleibt **bewusst ungültig statt getrimmt**: `vercel env add` über stdin nimmt
gern ein Newline mit, und ein Wert, bei dem unklar ist, ob er so gemeint war,
darf keine Post auslösen.

**Audit bei Wechsel.** Eine Zeile im `billing_audit_trail`
(`entity_type='abrechnung_betriebsmodus'`), je Mandant und **nur bei Wechsel** —
ein Eintrag je Aufruf wäre eine Zeile pro festgeschriebener Rechnung. Geschrieben
wird an der Verbrauchsstelle, nicht beim Start: zwischen Prozessstart und Versand
kann ein Redeploy liegen; festgehalten wird der Zustand, der beim Versand
**tatsächlich galt**.

**Beide Flags bleiben ungesetzt.** Track 1 ändert nicht, *ob* verschickt wird —
nur, dass die Antwort auf „verschickt das System gerade?" eindeutig und
nachlesbar ist.

---

## 4. Track 2 — CAMT-Preflight

Ein Kontoauszugsimport ist der einzige Vorgang im System, der aus einer
hochgeladenen Datei **unmittelbar Geld bewegt**: jede Zeile wird ein
Zahlungseingang, läuft ins Matching, setzt `invoices.paid_amount` und kann als
Rücklastschrift eine Rechnung wieder öffnen, eine Gebühr buchen und ein
SEPA-Mandat sperren. Bis hierher gab es nur „importieren".

**`CAMT_IMPORT_MODE=LIVE` bucht; alles andere, auch das Fehlen, ist ein
Trockenlauf.** Der Standard kostet nichts — `camt_imports` steht live auf 0.

**Eine Bewertung, nicht zwei.** Der Preflight rechnet nicht selbst. Die
Bewertung wurde aus `matchBuchung()` herausgelöst (`bewerteBuchung()`, rein
lesend) und wird von beiden Wegen benutzt. Zwei Bewertungen wären zwei
Wahrheiten: der Trockenlauf sähe eine Zuordnung, die der scharfe Lauf nicht
macht — oder umgekehrt, was schlimmer wäre.

**Sechs Klassifikationen, mit Rangfolge:**

`INVALID` › `CROSS_TENANT_BLOCKED` › `DUPLICATE` › `AMBIGUOUS` › `UNMATCHED` ›
`MATCHED`

Eine Zeile, die zugleich Dublette und mehrdeutig ist, gilt als Dublette: der
ernstere Befund gewinnt, weil er derjenige ist, der eine Buchung verhindern
muss. **Gebucht würde ausschließlich `MATCHED`** — das ist keine eigene Regel
des Preflights, sondern dieselbe, die der scharfe Import anwendet.

Geprüft je Buchung: IBAN (MOD 97), Betrag, Vorzeichen gegen die Richtung,
Währung, EndToEndId, Mandatsreferenz, Gläubiger-ID, Verwendungszweck,
debtorName, Buchungsstatus (BOOK), Dublette, Mandantengrenze.

**Die Mandantengrenze mit Sorgfalt gegen Fehlalarm.** Drei Abfragen suchen
absichtlich **ohne** `organization_id`-Filter — anders ließe sich „gehört jemand
anderem" nicht feststellen. Sie lesen deshalb ausschließlich `organization_id`:
keinen Namen, keinen Betrag, keine Rechnungsnummer. Der Bericht sagt „gehört zu
einem anderen Mandanten" und nie, zu welchem. Rechnungsnummern sind je Mandant
fortlaufend — blockiert wird nur, wenn die Referenz **ausschließlich** anderswo
existiert.

**Der Nachweis, dass nichts geschrieben wird — zwei Ebenen:**

1. **Modultest:** der protokollierende Doppelgänger belegt, dass über den
   gesamten Lauf **kein einziger** `insert`/`update`/`delete` vorkommt.
2. **Gegen echtes Postgres** (PGlite): die Zeilenzahlen von sechs Tabellen vor
   und nach dem Aufruf sind identisch — **plus eine Gegenprobe**, dass derselbe
   Aufruf mit `LIVE` sehr wohl anlegt. Ohne die Gegenprobe wäre der Test auch
   dann grün, wenn der Import generell nichts mehr schriebe.

`POST /api/billing/camt/preflight?format=text` liefert einen Bericht zum
Ausdrucken. Die eine Frage — *„darf ich diese Datei scharf importieren?"* —
steht in der ersten Zeile, vor allen Zahlen. Keine vollständige IBAN
(`DE89…3000`), keine fremde Mandantenkennung.

---

## 5. Track 3 — Rechnungsversand-Preflight

**Vorher** prüfte `versendeRechnungPerEmail()` fünf Dinge: gelöscht, Status,
festgeschrieben, schon versendet, E-Mail vorhanden. Das sind die Bedingungen,
unter denen der **Versand** technisch scheitert — nicht die, unter denen die
**Rechnung** falsch ist. Eine Rechnung ohne Positionen, mit doppelt vergebener
Nummer, über 0,00 € ohne Storno-Kennzeichen, an einen Testmandanten, mit einer
IBAN ohne gültige Prüfsumme: jede einzelne lief durch.

**16 Punkte, drei Urteile:** `READY_FOR_SEND` / `NEEDS_REVIEW` / `BLOCKED`.

**Die Unterscheidung zwischen NEEDS_REVIEW und BLOCKED ist der Kern.** Ohne sie
müsste jede Unsicherheit entweder durchgehen (dann nützt der Preflight nichts)
oder blockieren (dann ist er im Weg und wird abgeschaltet). Eine unvollständige
Postanschrift ist kein Grund, einen **Menschen** am Versand zu hindern — aber
sehr wohl einer, einen **Automaten** daran zu hindern, der nachts läuft und
niemanden fragt.

Punkt 12 erzeugt das CII-XML tatsächlich (rein lesend) und sieht die
Pflichtangaben nach; eine Behauptung „wäre valide" ohne Erzeugung wäre wertlos.

**Zwei Grenzen ausdrücklich benannt statt behauptet:**

- **Punkt 11 (PDF):** Die Erzeugung lädt in den Storage und schreibt
  `invoice_packages`. Der Preflight schreibt nichts und kann sie nicht
  auslösen. Was er prüft, steht im Befund; was er nicht ausschließen kann, auch.
- **Punkt 16 (Audit):** Ob ein INSERT gelingt, lässt sich ohne INSERT nicht
  beweisen. Geprüft wird die **Erreichbarkeit** des Trails.

**Fail-closed ohne stillen Standard.** `versendeRechnungPerEmail()` verlangt
eine **ausdrückliche** Entscheidung über die Strenge — es gibt keinen
Standardwert, den ein neuer Aufrufer unbemerkt erbt:

| Aufrufer | Strenge |
|---|---|
| Festschreibung mit `autoVersand` (`invoice-engine.ts`) | `automatisch` |
| Sammelrechnungslauf — über die Festschreibung | `automatisch` |
| Wiederholungslauf der Zustellspur (`vorgaenge/rechnung.ts`) | `automatisch` |
| `POST /api/billing/invoices/[id]/versenden` | `manuell` |

Der Fluchtweg `'uebersprungen'` existiert für Tests der Versandlogik selbst.
`rechnung-preflight-pflicht.test.ts` scannt `app/` und `lib/` und schlägt fehl,
sobald er dort auftaucht — dasselbe Muster wie bei den ungeprüften
Resend-Aufrufern. **Eine Regel, die nur im Kommentar steht, ist keine.**

---

## 6. Track 4 — Mahn-Safety-Gate

**Vorher** lagen die Mahnsperren an drei Orten: `NICHT_MAHNFAEHIG` und die
Betragsprüfung im Massenlauf, `checkDunningBlocks()` in der Eskalation,
`ermittleStoppgrund()` im Versand-Consumer. Jede Stelle prüfte etwas anderes,
keine prüfte alles, und keine konnte sagen, **warum** eine bestimmte Rechnung
heute nicht gemahnt wurde.

**`pruefeMahnbarkeit()` prüft zehn Sperren an einer Stelle:** Rechnung/Mandant,
Löschung, Status, offener Betrag (inkl. Teilzahlung und Überzahlung),
Fälligkeit, Gutschrift, Beanstandung, manuelle Sperre, Stufenabstand,
Warteschlange. Drei Zustände: `MAHNBAR` / `GESPERRT` / `NOCH_NICHT_FAELLIG`.

**`advanceDunning()` ruft es** — das ist der einzige Ort, an dem eine Mahnstufe
steigt. Damit kann kein Aufrufer, auch kein künftiger, daran vorbei eskalieren.

Ein Punkt ist bewusst **nicht** fail-closed: eine unlesbare Warteschlange hält
den Lauf nicht an. Der Consumer prüft unmittelbar vor jedem Versand erneut; den
ganzen Mahnlauf wegen einer Leseabweichung anzuhalten wäre der größere Schaden.
Die Entscheidung steht im Befundtext und im Test, nicht nur im Kommentar.

**Kein Eingriff in die Mahnfristen.** 14/28/42/56/70 Tage unverändert; das Gate
macht das Mahnwesen ausschließlich **zurückhaltender**, nie aggressiver.

---

## 7. Track 5 — DATEV-Finanzexport, Reality Check

Die Phase-6B-Suite prüft jede Buchungsart **einzeln**. Ungeprüft blieb die
Frage, die der Steuerberater als erste stellt: ergibt die **Datei als Ganzes**
einen einlesbaren, in sich stimmigen Stapel? Ein Stapel kann aus lauter
korrekten Zeilen bestehen und trotzdem unbrauchbar sein — eine Zeile mit 11
statt 12 Feldern, ein Konto außerhalb jedes definierten Bereichs, ein
Belegdatum in der falschen Periode.

**`lib/billing/datev/datev-validator.ts` — zwei Prüfebenen**, weil jede etwas
sieht, das die andere nicht sieht:

- **`pruefeBuchungssaetze()`** vor dem Formatieren. Sieht Dinge, die in der
  fertigen Datei nicht mehr erkennbar sind — etwa dass ein Umsatz mehr als zwei
  Nachkommastellen hatte und beim Formatieren gerundet **wurde**: der
  formatierte Wert sieht danach korrekt aus, die Summe stimmt nicht mehr.
- **`pruefeDatevCsv()`** auf dem Artefakt, das ausgeliefert wird. Zerlegt jede
  Zeile mit einem eigenen CSV-Parser nach DATEV-Regeln; **genau der Unterschied
  zwischen diesem Parser und `split(';')` ist der Fehler, den die Prüfung finden
  soll.**

Geprüfte Zusicherungen (Auszug): 12 Felder je Zeile · Betrag mit Komma und
genau zwei Nachkommastellen, immer positiv (das Vorzeichen gehört ins S/H-Feld)
· Konto und Gegenkonto aus dem Kontenrahmen **oder** dem Debitorenbereich
10000–69999 · Konto ≠ Gegenkonto · Belegdatum als gültiges TTMM **innerhalb des
Exportzeitraums** · kein Feld beginnt mit `= + - @` · CRLF-Zeilenenden.

**Fail-closed vor dem Upload.** `erstelleDatevExport()` prüft **vor** dem
Storage-Upload. Bei Befunden: kein CSV im Storage, kein `erstellt`-Datensatz,
stattdessen ein `fehler`-Lauf mit Befundcodes in `fehler_details`; die Route
antwortet **422** und gibt die Befunde unverändert aus — sonst müsste man den
Export ein zweites Mal erzeugen, um zu sehen, was ihn blockiert hat, und genau
das erzeugt er absichtlich nicht. **Warnungen** stehen auch im Erfolgsfall in
der Antwort; sonst läge der Hinweis nur in einer Protokolldatei im Storage, die
niemand öffnet, bevor er importiert.

**Der repräsentative Monat** (31 Tests): **ein** Stapel, in dem alle Vorfälle
nebeneinander vorkommen — normale Rechnung · Korrekturrechnung · Gutschrift ·
Teilstorno · Rücklastschrift · zwei Teilzahlungen · Überzahlung · Mahngebühr ·
zwei betragsgleiche Zahlungen am selben Tag · ein zweiter Mandant, der in
keiner Zeile auftauchen darf. **Bewusst kein Golden-File-Vergleich:** der fällt
bei jeder harmlosen Formatierungsänderung um und sagt nichts über Richtigkeit.

Belegt unter anderem: die Überzahlung wird in **voller Höhe** gebucht (wer auf
den Rechnungsbetrag kürzt, lässt eingegangenes Geld verschwinden) · beide
Teilzahlungsraten laufen auf **dasselbe** Debitorenkonto · die
Korrekturrechnung ist Forderung an Erlös und **keine** Gutschrift · Gutschrift
und Teilstorno tragen die Generalumkehr bei positivem Betrag.

**Eine bewusste Nicht-Entscheidung:** Zwei betragsgleiche Teilzahlungen auf
dieselbe Rechnung am selben Tag sind von einer Doppelbuchung *in der Datei*
nicht zu unterscheiden. Der Befund ist deshalb eine **Warnung**, kein Fehler —
ein Fehler würde hier einen korrekten Export blockieren. Das entscheidet ein
Mensch.

> **Grenze, ausdrücklich benannt.** Ob die Kontonummern die *richtigen* sind,
> kann kein Code wissen. Geprüft wird, dass jedes Konto **aus** einem
> definierten Vorrat stammt — nicht, dass der Vorrat der richtige ist. Deshalb
> §12/D1–D6.

---

## 8. Track 6 — ChairMatch Pricing-Schema

Auftrag war ausdrücklich **prüfen**, keine Preise festlegen.

**Live verifiziert** mit `scripts/verify-pricing-schema.mjs` (neu, **nur
lesend**, `npm run verify:pricing-schema`), gegen die Produktionsinstanz:

```
OK    protect_pricing.{id,risk_level,day/month/year_price_cents,currency,active,updated_at}
OK    compliance_plans.{id,plan_type,price_cents,included_submissions,
                        min_term_months,extra_submission_price_cents,currency,active,updated_at}
OK    protect_pricing:  anon abgewiesen (HTTP 401) — RLS greift
OK    compliance_plans: anon abgewiesen (HTTP 401) — RLS greift
INFO  effective_from / effective_to fehlen auf beiden Tabellen
```

Methode: PostgREST beantwortet eine unbekannte Spalte mit `42703`, **bevor** es
Rechte prüft — Spaltenexistenz und RLS-Lage kommen damit aus derselben Antwort.
Ohne Keys endet das Skript mit **Exit 2** („nicht geprüft"), ausdrücklich nicht
mit 0: sonst sähe ein übersprungener Lauf in CI aus wie ein bestandener.

**Strukturell verifiziert — 33 Tests**, die die Migration als Quelle der
Wahrheit lesen: alle fünf Geldspalten sind `integer` (keine
Gleitkomma-Geldwerte) · `risk_level` kennt genau vier Stufen, **gegengeprüft
gegen `src/components/RiskBadge.tsx`**, damit die Taxonomie nicht an zwei Orten
auseinanderläuft · `currency ~ '^[A-Z]{3}$'` auf beiden Tabellen · Preise ≥ 0,
**nie `> 0`** (0 heißt „gratis", nicht „gibt es nicht") · RLS an, keine Policy
(= deny), **plus** `REVOKE ALL … FROM anon, authenticated` — RLS allein reicht
nicht, ein GRANT bleibt bestehen und wirkt, sobald irgendwann eine permissive
Policy dazukommt · **kein einziges `INSERT`** in der Migration.

### Der Befund: keine Zeitversionierung

`effective_from` / `effective_to` existieren **nicht**. Eindeutigkeit entsteht
heute dadurch, dass es überhaupt nur **eine** Zeile je Stufe gibt
(UNIQUE-Index). Das ist gegen konkurrierende aktive Preise wirksam — hat aber
eine Kehrseite:

> Der Seed schreibt per `ON CONFLICT … DO UPDATE` über den alten Wert. Zu einem
> Vertrag von gestern lässt sich danach nicht mehr feststellen, welcher Preis
> damals galt.

Solange beide Tabellen leer sind, ist der Schaden **null**. Mit dem ersten
verkauften Vertrag ist es eine Nachweislücke — gegenüber Kunde und Finanzamt.

**Vorbereitet, NICHT angewendet:**
`supabase/migrations/20260826_pricing_gueltigkeit.sql` (+ Rollback) —
`effective_from`/`effective_to`, `CHECK (effective_to > effective_from)`, und an
Stelle des UNIQUE-Index ein `EXCLUDE USING gist (risk_level WITH =,
daterange(effective_from, effective_to, '[)') WITH &&) WHERE (active)`.

Halboffener Bereich mit Absicht: ein Preis, der am 01.03. endet, und einer, der
am 01.03. beginnt, überlappen **nicht**. `WHERE (active)` ebenso — sonst müsste
man Historie löschen, um einen Preis korrigieren zu können.

**Folge für den Seed:** Nach der Migration gibt es den UNIQUE-Index nicht mehr,
`ON CONFLICT (risk_level)` scheitert mit `42P10`. Deshalb neu:
`supabase/seed/pricing.seed.versioniert.template.sql` — schließt den laufenden
Preis ab und legt den neuen als eigene Zeile an, statt zu überschreiben. Das
alte Template trägt jetzt einen Warnblock.

---

## 9. Track 7 — Pilot Control Center

**Additiv, nicht ersetzend.** `/admin/pilot` beantwortete zwei Fragen: **darf**
heute ein echter Kunde abgerechnet werden (Betriebs-Checkliste) und **wie weit**
ist jeder Kunde gekommen (Kundenketten). Der Money Path ist die **dritte** Frage
— *was ist gerade liegen geblieben?* — und hängt als Abschnitt 3 an derselben
Seite und derselben Route. Eine zweite Route hätte zwei Guards, zwei
Caching-Regeln und zwei Stellen zum Vergessen bedeutet. Dasselbe
Ampel-Vokabular (`gruen`/`gelb`/`rot` aus `lib/pilot/types.ts`), erweitert um
genau einen vierten Wert: **`ungeprueft`**.

| Bereich | Kennzahlen |
|---|---|
| **CAMT** | Importe · mit Fehler · Buchungen · automatisch zugeordnet · ungeklärt · offene Klärfälle · Rücklastschriften · **Hash-Dubletten** |
| **Rechnung** | gesamt · versandbereit · prüfen: kein Empfänger · blockiert: nicht festgeschrieben · blockiert: Status · versendet · Protokollzeilen |
| **Mahnung** | mahnfähig · gesperrt · Warteschlange wartend/versendet/fehlgeschlagen · **Dead Letter** |
| **DATEV** | Exporte · Prüfung nicht bestanden · erstellt, nicht abgeholt · heruntergeladen · Debitorenzuordnungen · Konfiguration |
| **System** | fehlende Pflicht-Variablen · scharfe Versandschalter · Schalter-Warnungen · Audit-Einträge (gesamt/heute) · Zustellprotokoll |

**Hash-Dubletten** ist die interessanteste Zahl: der Index auf
`zahlungseingaenge.quelldatei_hash` ist bewusst **nicht** unique — die Sperre
sitzt in der Import-Route. Diese Zählung ist damit die einzige Möglichkeit, ihr
Versagen überhaupt zu bemerken.

**Drei getestete Eigenschaften:**

- **Fail-closed.** Eine gescheiterte Messung ergibt `null`, nie `0`, und
  erscheint unter `hinweise`. Ein Bereich mit einem `null`-Wert ist **nie**
  grün. Die Oberfläche zeigt `—`, nicht `0`: *„keine Klärfälle"* und
  *„Klärfälle nicht zählbar"* sind zwei verschiedene Aussagen, und nur eine
  davon ist beruhigend.
- **Mandantenzaun.** Ein Test prüft, dass **jede einzelne** der über zehn
  Abfragen auf `organization_id` filtert. Der Dienst läuft mit `service_role`
  (BYPASSRLS); vergisst eine Abfrage den Filter, zeigt das Dashboard fremde
  Zahlen — und niemand merkt es, weil eine Zahl immer plausibel aussieht.
- **Keine Schreiboperation.** Getestet, dass das Modul kein `insert`, `update`
  oder `delete` ausführt, dass der Money-Path-Abschnitt der Seite kein `<form>`,
  kein `<button>` und kein `onClick` enthält, und dass die Route weiter kein
  `POST`/`PUT`/`PATCH`/`DELETE` anbietet. Ebenfalls getestet: **kein
  Variablenwert** taucht in der Ausgabe auf — geprüft wird die *Existenz* von
  Env-Variablen, nie der Wert.

**Die Regel aus dem Auftrag** — *„Keine kritische Geldaktion darf NUR anhand
eines UI-Buttons ohne Backend-Prüfung freigegeben werden"* — ist als
**strukturelle** Eigenschaft umgesetzt, nicht als Absichtserklärung: das Modul
kennt keine Aktion, die Route kein schreibendes Verb, die Seite keinen Knopf.
Der Satz steht zusätzlich im **Datenmodell** (`freigabeHinweis`), nicht nur im
Seitentext — sonst liest ihn niemand, der die Zahlen weiterverarbeitet.

Die tatsächlichen Riegel bleiben, wo sie sind: Versandgate und Festschreibung in
`rechnung-versand.ts`, Dublettensperre in der CAMT-Import-Route, Stapelprüfung
in `export-service.ts`, `requireOpsAdmin()` plus RESTRICTIVE `org_fence`.

---

## 10. Track 8 — Chaos / Failure Tests

### Der P1-Befund: der halb gebuchte Zahlungseingang

**Wo:** `lib/billing/core/payments.ts`, `allocatePayment()`.

`payment_allocations` trägt `UNIQUE(payment_id, invoice_id)` — der Riegel gegen
die Doppelbuchung, wirksam, aber mit einer teuren Nebenwirkung. Bricht ein Lauf
**nach** dem Insert ab (Verbindungsabbruch, Audit-Fehler, Prozessende), steht
die Zuordnungszeile in der Datenbank, während `invoices.paid_amount` und
`payments.allocated_cents` den alten Stand tragen.

Gemessener Zustand nach einem `08006` auf dem `invoices`-Update:

```
payment_allocations : 1 Zeile, 5000 Cent
payments            : allocated_cents = 0, matching_status = 'nicht_zugeordnet'
invoices            : paid_amount = NULL, status = 'sent'
Wiederholungslauf   : "duplicate key value violates unique constraint" (23505)
```

**Wirkung — drei Dinge gleichzeitig, keines davon sichtbar:**

1. Der **DATEV-Export bucht die Zahlung** — er liest genau diese Tabelle
   (`generiereZahlungsBuchungen`).
2. Die Rechnung gilt weiter als **offen** und wird **gemahnt**.
3. Kein Wiederholungslauf kommt je durch; die Meldung `duplicate key` sagt
   niemandem, dass Geld bereits verbucht ist.

**Ein Kunde, der bezahlt hat, bekommt eine Mahnung.**

**Fix — der abgebrochene Vorlauf wird zu Ende geführt statt abgewiesen:**

- Bei `23505` wird die bestehende Zeile gelesen. **Anderer Betrag** → klarer
  Abbruch mit Klartext („existiert bereits eine Zuordnung über X Cent"); ein
  Widerspruch darf niemand automatisch auflösen.
- **Gleicher Betrag** → der Lauf setzt fort. Ob die Rechnung schon
  fortgeschrieben wurde, wird **festgestellt, nicht geraten**: `paid_amount`
  wird gegen die Summe **aller** Zuordnungszeilen der Rechnung gehalten. Deckt
  sie die bestehende Zeile bereits ab, wird der Rechnungs-Update übersprungen —
  sonst zählte dieselbe Zahlung zweimal.

**Bewusst nicht gefixt:** dass `logBillingAction()` wirft. Das ist fail-closed
und richtig (GoBD — ein unprotokollierter Geldvorgang darf nicht still
durchgehen). Es zur Warnung abzustufen hätte einen **wiederholbaren Abbruch
gegen eine dauerhafte Protokolllücke** getauscht. Mit dem idempotenten
Wiederholungslauf ist der Abbruch jetzt folgenlos.

### Die Szenarien

`__tests__/chaos/geldweg-chaos.test.ts` (16 Tests, auf echtem Postgres):
Verbindungsabbruch nach dem Insert · Wiederholungslauf führt zu Ende, **eine**
Zeile, `paid_amount` genau einmal · Audit-Fehler nach der Buchung · bestehende
Zuordnung mit **anderem** Betrag → Abbruch mit Klartext · zwei parallele Läufe
auf dieselbe Zahlung · Zahlung A → Rechnung B (fremder Mandant) · Sammelzuordnung
mit **einer** fremden Rechnung · Betrag 0 / negativ / über Zahlbetrag (abgewiesen,
**bevor** etwas geschrieben wird) · krummer Cent-Betrag · CHECK-Verletzung wird
gemeldet, nicht verschluckt · zwei gleiche Beträge am selben Tag ·
`createPayment` scheitert am Insert → keine halbe Zahlung.

`__tests__/chaos/export-und-eingabe-chaos.test.ts` (17 Tests): Lesefehler auf
`invoices` / `payment_allocations` → **Abbruch statt leerem Stapel** (eine Datei
mit null Zahlungseingängen sieht aus wie ein Monat, in dem niemand bezahlt hat;
jeder Debitorensaldo wäre falsch) · Deadlock bei der Debitorenvergabe ·
unbekanntes Konto besteht die Prüfung nicht · Trennzeichen in Stammdaten
verschieben keine Spalte · IBAN-Prüfsumme, Längen, Kleinschreibung ·
Betragsparser · symmetrische Cent-Rundung · Debitorennummer mit CSV-Trennzeichen
oder Formelzeichen.

Neu als Werkzeug: `__tests__/chaos/helpers/chaos-client.ts` — legt sich über
einen echten Client und lässt **einen gezielt gewählten** Aufruf scheitern, so
wie er live scheitern würde (PostgREST-Fehlerobjekt, keine Ausnahme). **Die
interessanten Geldfehler entstehen nicht, wenn eine Abfrage scheitert, sondern
wenn die dritte von vier scheitert** — die ersten zwei haben dann schon
geschrieben.

### Bereits abgedeckt — benannt statt doppelt geprüft

| Szenario | Wo |
|---|---|
| Resend: Zeitüberschreitung, 401, 422, 429, 5xx, Antwort ohne Nachrichten-ID, fehlender Schlüssel, Idempotenz, Wiederholung ohne Doppelprotokoll | `__tests__/notifications/resend-fehlerpfade.test.ts` |
| CAMT: Datei zweimal, überlappende Auszüge, zwei gleiche Beträge, fremder Mandant, unlesbare Beträge/Daten, PDNG, DBIT | `__tests__/e2e/camt-pipeline-pglite.test.ts` |
| Doppelversand derselben Rechnung (`sent_at`) | `__tests__/billing/rechnung-versand.test.ts` |

### Ergebnis gegen das Ziel

| Ziel | Stand |
|---|---|
| Keine Doppelbuchung | ✅ DB-`UNIQUE` + idempotenter Wiederholungslauf, beides getestet |
| Kein Doppelversand | ✅ `sent_at` + Idempotenzschlüssel an Resend |
| Keine fremden Mandantendaten | ✅ Org-Fence im Kern von `allocatePayment`, getestet auch für den Sammelfall |
| Kein stiller Geldfehler | ✅ der eine gefundene ist gefixt; Lesefehler brechen ab statt leer zu liefern |

---

## 11. Die sieben Produktionsbefunde

Alle sieben sind behoben. Sortiert nach Schwere.

| # | Track | Befund | Wirkung | Schwere |
|---|---|---|---|---|
| **C-1** | 8 | **Halb gebuchter Zahlungseingang.** Bricht `allocatePayment()` nach dem Insert ab, bleibt eine verwaiste Zuordnungszeile; jeder Wiederholungslauf scheitert an `23505`. | DATEV bucht die Zahlung, die Rechnung gilt als offen — **ein Kunde, der bezahlt hat, bekommt eine Mahnung.** Kein Wiederholungslauf kommt je durch. | 🔴 **P1 Geld** |
| **M-4** | 4 | **Über `POST /api/billing/dunning/advance` liefen alle Mahnstufen unmittelbar hintereinander durch.** `advanceDunning()` prüfte den Stufenabstand nicht — nur der Massenlauf tat das. | Eine Rechnung ließ sich in Sekunden von „offen" bis „Inkasso-Vorbereitung" treiben, **samt aller vier Mahngebühren** (2,50 + 5,00 + 7,50 + 10,00 €). Vier Mahnungen in einer Zustellung. | 🔴 **P1 Geld** |
| **P-1** | 3 | **Schema-Drift im neuen Preflight:** `clients.deleted_at` selektiert — die Spalte existiert nicht (Soft-Delete liegt auf `profiles`). | PostgREST hätte mit `42703` geantwortet; weil nur `data` ausgewertet wurde, wäre daraus **„Klient existiert nicht mehr"** geworden — eine falsche, aber plausible Sperre auf **jeder** Rechnung. | 🔴 **P1 Funktion** |
| **P-2** | 3 | **Punkt 11 hätte jeden automatischen Erstversand blockiert.** Erste Fassung stellte ein fehlendes Belegpaket zur Sichtung — beim Erstversand existiert nie eines, es entsteht *im* Versand. | Der Automat hätte dauerhaft geschwiegen, mit der plausibel klingenden Begründung „PDF noch nicht erzeugt". Genau die Sorte Fehler, die der Preflight verhindern soll. | 🟠 **P2 Funktion** |
| **M-1** | 4 | `checkDunningBlocks()` filterte Gutschriften nicht auf `deleted_at IS NULL`; `verwerfeGutschrift()` setzt beim Verwerfen nur `deleted_at`. | Eine **verworfene** Gutschrift blockierte die Mahnung dieser Rechnung **für immer**. Fail-closed, deshalb ohne Geldschaden — aber eine berechtigte Forderung lief still aus dem Mahnwesen heraus. | 🟠 **P2 Geld** |
| **F-1** | 1 | `letzterFlagZustand()` fing nur das `error`-Feld, nicht die geworfene Ausnahme. Der PostgREST-Client meldet einen Verbindungsabbruch als Ausnahme. | Ein Netzwerkfehler beim **Lesen** des Audit-Trails hätte die gesamte Festschreibung mitgerissen: eine korrekt erzeugte Rechnung wäre wegen eines Protokolleintrags nicht zustande gekommen. | 🟠 **P2 Funktion** |
| **M-3** | 4 | `dunning_entries.amount_paid_cents` wurde einmal bei der Anlage geschrieben und danach nie wieder; `getDunningOverview()` rechnet den offenen Betrag aber aus dem **Mahneintrag**. | Die Mahnübersicht wies dauerhaft den vollen Rechnungsbetrag als offen aus, auch bei längst bezahlten Posten. Der Mahnlauf selbst war nie betroffen (er liest die Rechnung) — falsch war die **Anzeige** des Forderungsbestands. | 🟡 **P3 Anzeige** |

**Zusätzlich als Härtung, kein Befund:** `ensureDunningEntry()`,
`checkDunningBlocks()`, `advanceDunning()` und `ermittleStoppgrund()` lasen ohne
`organization_id` bei service-role (BYPASSRLS). Kein Leck — alle Routen fencen
davor. Aber eine Funktion, die eine Mahngebühr bucht, darf sich darauf nicht
verlassen; `advanceDunning()` verlangt den Mandanten jetzt als Pflichtparameter.

> **Zwei der sieben Befunde stammen aus dem in dieser Phase neu gebauten Code**
> (P-1, P-2) — beide vor dem ersten Einsatz gefunden. Nicht durch Nachdenken,
> sondern weil die bestehenden E2E-Ketten den neuen Code sofort mitgefahren
> haben. **Eine Absicherung, die man nur gegen ihre eigenen Tests baut, prüft
> sich selbst.**

### Nachgetragen: der Schema-Drift-Check

`npm run check:schema-drift` meldete zunächst **8 Befunde**. Der erste Entwurf
des Tracks-1–4-Berichts nannte sie „vorbestehende 42703-Defekte, zwei davon auf
Geldpfaden". **Das war falsch, und die Nachprüfung hat es widerlegt:** alle acht
sind Fehlalarme derselben Klasse — der Prüfer nimmt die Tabelle aus dem
nächstgelegenen `.from(...)` im Dateitext, und die Treffer stehen entweder in
**Kommentaren** (die begründen, warum dort *kein* Filter steht) oder die
Abfragen entstehen in Hilfsfunktionen, deren Filter am Aufrufort steht. Alle
acht stehen jetzt begründet in `AUSNAHMEN` (`scripts/schema-drift-check.mjs`) —
danach **0 Befunde**, 1.288 Dateien gegen 331 Live-Tabellen.

> **Warum das hier steht statt stillschweigend korrigiert:** Die ursprüngliche
> Aussage hätte jemanden auf die Suche nach zwei Geldweg-Defekten geschickt, die
> es nicht gibt. Ein Bericht, der einen Fehlalarm als Befund führt, ist
> schlechter als keiner.

**Wirklich offen:** `check:schema-drift` ist **weder in CI noch im
Precommit-Guard verdrahtet**. Ein Prüfschritt, den niemand ausführt, ist keiner
— und die Klasse, die er fängt, ist in diesem Repo mehrfach aufgetreten.

---

## 12. BUSINESS_INPUT_REQUIRED

Nichts davon lässt sich im Code entscheiden.

### DATEV (Kanzlei-Vorgaben)

Der Validator führt die Liste selbst (`BERATER_VORGABE_ERFORDERLICH`), damit sie
nicht in einem Bericht verschwindet.

| # | Vorgabe | Wirkung, solange offen |
|---|---|---|
| **D1** | **Beraternummer** | Export **bricht ab**, bevor irgendetwas erzeugt wird |
| **D2** | **Mandantennummer** | dito |
| D3 | Kontenrahmen SKR03/SKR04 — *bestätigt* | Standardwert wird benutzt, ist aber unbestätigt |
| D4 | Erlöskonto steuerfreie Pflege (§ 4 Nr. 16 UStG) | dito |
| D5 | Sachkontenlänge (4 oder 5) | dito |
| D6 | Wirtschaftsjahresbeginn | dito |

D3–D6 tragen heute Standardwerte aus dem SKR03/SKR04-Kontenrahmen; **erfunden
ist keiner davon, bestätigt aber auch keiner.**

### ChairMatch (Preise)

| # | Frage |
|---|---|
| **C1** | **Welche Beträge?** Beide Tabellen sind leer. Die Werte aus `20260310` sind Entwurf und gelten NICHT. |
| C2 | Wird Protect für alle vier Risikostufen verkauft oder nur HIGH/VERY_HIGH? Nicht verkaufte Stufen: Zeile **streichen**, nicht mit 0 befüllen. |
| C3 | Netto oder brutto? Die Spalten heißen `*_cents` ohne Steuerkennzeichen. |
| C4 | Bleibt es bei `one_time` / `yearly` / `monthly`? |
| **C5** | **Soll `20260826_pricing_gueltigkeit.sql` laufen?** Sie ändert die Seed-Semantik. **Vor dem ersten verkauften Vertrag ist sie billig, danach teuer.** |

### Alltagsengel (Betrieb)

| # | Punkt |
|---|---|
| B2 | **Geldpfade Erstbetrieb.** `payments` = 0, `camt_imports` = 0 — gebaut und getestet, nie mit echtem Geld gelaufen. |
| B3 | 3× Signaturlaufzeit 7 Tage entscheiden (Re-Signier-Route bauen oder Restrisiko tragen). |
| B4 | `getOposListe()` zeigt Entwürfe im Forderungsbestand. Der Mahnlauf ist **nicht** betroffen. |

---

## 13. Was bleibt offen

| # | Punkt | Art |
|---|---|---|
| **O-1** | `check:schema-drift` ist weder in CI noch im Precommit-Guard verdrahtet. Zusätzlich: brächte man dem Zuordner bei, Kommentare zu überspringen, wären fünf der acht Ausnahmen überflüssig. | **echte Lücke** |
| **O-2** | DATEV-**Storage**-Schicht ungeprüft (PGlite bildet Storage nicht ab). Die neue Prüfung sitzt davor und verhindert, dass eine fehlerhafte Datei überhaupt hochgeladen wird. | benannte Grenze |
| **O-3** | Die erste echte DATEV-CSV sollte jemand **öffnen und die Spaltenausrichtung ansehen**, bevor sie importiert wird. Grund: Befund D-1 aus Phase 6B (CSV-Injection über die Debitorennummer). | Erstbetrieb |
| **O-4** | `no_overlapping_tariffs` bleibt unter PGlite unbeweisbar (kein `btree_gist`). Nur gegen echtes Postgres prüfbar. | benannte Grenze |
| **O-5** | 30 der 36 ungetesteten `lib/`-Module (P2/P3) stehen noch aus. Drei Phasen in Folge haben gezeigt, was dort liegt. | P2 |
| **O-6** | ChairMatch: `20260826_pricing_gueltigkeit.sql` anwenden — **oder bewusst nicht** (C5). | Entscheidung |

**Geschlossen im Verlauf dieser Phase:** Der Punkt P-5 aus dem
Tracks-5–8-Bericht („`sammelrechnung-lauf.ts` muss den neuen
`preflight`-Parameter durchreichen") hat sich mit dem Landen von `5967009`
erledigt. Nachgeprüft: der Sammelrechnungslauf verschickt über die
Festschreibung (`invoice-engine.ts`), und die reicht `preflight: 'automatisch'`
durch. Alle vier Aufrufer von `versendeRechnungPerEmail()` setzen den Parameter
ausdrücklich; die sechs roten Tests aus dem Zwischenstand sind grün.

---

## 14. Neue Dateien

### Alltagsengel — Module

| Zweck | Pfad |
|---|---|
| Versand-Schalter (rein, testbar) | `lib/config/versand-flags.ts` |
| Audit dazu | `lib/config/versand-flags-audit.ts` |
| CAMT-Betriebsart | `lib/billing/camt/camt-modus.ts` |
| CAMT-Preflight | `lib/billing/camt/camt-preflight.ts` |
| CAMT-Pilot-Bericht | `lib/billing/camt/camt-preflight-bericht.ts` |
| Rechnungs-Preflight (16 Punkte) | `lib/billing/preflight/rechnung-preflight.ts` |
| Mahn-Safety-Gate (10 Sperren) | `lib/billing/dunning/mahn-safety-gate.ts` |
| DATEV-Validator (2 Prüfebenen) | `lib/billing/datev/datev-validator.ts` |
| Pilot Control Center | `lib/pilot/control-center.ts`, `lib/pilot/index.ts` |

### Alltagsengel — Routen (beide **nur lesend**)

| Zweck | Pfad |
|---|---|
| CAMT-Trockenlauf | `app/api/billing/camt/preflight/route.ts` |
| Rechnungs-Preflight | `app/api/billing/invoices/[id]/preflight/route.ts` |

### Alltagsengel — Tests

`__tests__/config/versand-flags.test.ts` · `…/versand-flags-audit.test.ts` ·
`__tests__/billing/camt-preflight.test.ts` · `…/rechnung-preflight.test.ts` ·
`…/rechnung-preflight-pflicht.test.ts` · `…/mahn-safety-gate.test.ts` ·
`…/datev-reality-check.test.ts` · `__tests__/pilot/control-center.test.ts` ·
`__tests__/chaos/geldweg-chaos.test.ts` ·
`__tests__/chaos/export-und-eingabe-chaos.test.ts` ·
`__tests__/chaos/helpers/chaos-client.ts`

### ChairMatch

| Zweck | Pfad |
|---|---|
| Live-Prüfskript (nur lesend) | `scripts/verify-pricing-schema.mjs` |
| Strukturtests (33) | `src/__tests__/pricing-schema.test.ts` |
| Migration — **vorbereitet, nicht angewendet** | `supabase/migrations/20260826_pricing_gueltigkeit.sql` (+ Rollback) |
| Seed-Template versioniert | `supabase/seed/pricing.seed.versioniert.template.sql` |

---

## 15. Nächster sinnvoller Schritt

Unverändert **Erstbetrieb** — aber jetzt mit Vorstufen, die vorher fehlten. In
dieser Reihenfolge:

1. **Eine echte Bankdatei durch `POST /api/billing/camt/preflight?format=text`.**
   Kostet nichts, bucht nichts, beantwortet vorab, was der scharfe Import täte.
2. **Eine echte Rechnung durch `GET /api/billing/invoices/<id>/preflight`.**
   Steht dort nicht `READY_FOR_SEND`, verschickt der Automat auch mit gesetztem
   Schalter nichts — der Preflight nennt den Grund.
3. **`/admin/pilot` Abschnitt 3 ansehen**, bevor irgendein Schalter fällt. Ein
   `—` statt einer Zahl heißt „nicht messbar", nicht „nichts da".
4. Erst danach die Schalter in der Reihenfolge aus `docs/ENV_KONFIGURATION.md` §1
   — beginnend mit `RECHNUNGSVERSAND_AUTOMATISCH`, danach `invoice_email_log`
   gegenprüfen.
5. **Erste DATEV-Ausleitung**: D1/D2 von der Kanzlei holen, dann eine CSV
   erzeugen und **öffnen**, bevor sie importiert wird (O-3).

**Parallel, ohne externe Abhängigkeit:** O-1 (`check:schema-drift` verdrahten)
und O-5 (die verbleibenden 30 `lib/`-Module).

---

*Erstellt 26.08.2026 — Phase 7, Money Path Pilot · Alltagsengel*
