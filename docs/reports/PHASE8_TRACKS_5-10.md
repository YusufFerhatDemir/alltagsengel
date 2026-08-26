# Phase 8 — Tracks 5–10: CAMT-Pilot, Zuordnungs-Gate, Mahn-Trockenlauf, Abstimmung, Geschäftsangaben, Control Center

**Stand:** 26.08.2026
**Vorgänger:** Phase 8 Tracks 1–4 (`f0d14c2`), Phase 7 (`5967009` / `a994885` / `0ed44c8`)
**Grundlage:** `docs/reports/MASTER_HANDOFF_LATEST.md`, `docs/reports/PHASE7_MONEY_PATH_PILOT.md`

> ## Stopp-Grenze eingehalten
>
> **Keine echte Zahlung verbucht. Keine Mahnung versendet. Keine Lastschrift
> ausgelöst. Kein Schalter umgelegt. Keine Migration angewendet.**
>
> Alle sechs Tracks sind Vorstufen und Anzeigen. Vier der sechs Module
> schreiben nachweislich **gar nichts** (Regressionstest je Modul); das fünfte
> (`allocation-gate`) schreibt ausschließlich zwei Zeilen in
> `billing_audit_trail` und ist genau deshalb prüfbar — der Doppelgänger
> protokolliert jede Operation. Das sechste (`pilot-phasen`) enthält kein
> einziges `.insert(`/`.update(`/`.delete(`, was ein Test durch Lesen der
> Quelldatei festhält.

---

## 0. Ergebnis in Zahlen

| Prüfschritt | Ergebnis |
|---|---|
| Typecheck (`tsc --noEmit`) | **Exit 0**, 0 Fehler |
| node:test (`npm run test:unit`) | **2.211 / 2.211 grün**, 0 rot |
| vitest (voller Lauf, danach — nicht gleichzeitig) | **6.017 grün**, 38 übersprungen, **0 rot** (268 Dateien) |
| Tests gesamt | **8.228** (vorher 7.838 → **+390**, davon **+225 aus diesen Tracks**) |
| `lint:forbidden` | **0 Treffer** (24.608 Dateien, FULL-Scan, Exit 0) |
| `check:schema-drift` | **0 Befunde** (1.305 Dateien gegen 331 Live-Tabellen, Exit 0) |
| Neue Module | 6 (`lib/pilot/`) |
| Neue Routen | 4, davon 3 `GET` und 1 `POST` **ohne Schreibwirkung** |
| Neue Migration | **keine** |

**Neue Tests je Track:** Track 5 = 31 · Track 6 = 57 · Track 7 = 39 ·
Track 8 = 39 (auf echtem Postgres) · Track 9 = 23 · Track 10 = 36.

---

## 1. Track 5 — Kontrollierter CAMT-Pilot

**`lib/pilot/camt-pilot.ts`** · **`POST /api/pilot/camt-dry-run`**

### Was neu ist gegenüber dem Phase-7-Preflight

Der Preflight liest seine Betriebsart aus der **Umgebung**. Steht dort
`CAMT_IMPORT_MODE=LIVE`, meldet sein Bericht in Zeile 1 `buchend: true` — im
Rahmen eines Pilotlaufs die falsche Aussage über den falschen Vorgang.

Der Pilotlauf ist deshalb **fest** auf `DRY_RUN`: `PILOT_QUELLE` ist ein
`Object.freeze`-Objekt, das anstelle von `process.env` in den Preflight geht.
Der echte Umgebungsstand wird nur noch **berichtet** — und wenn er auf LIVE
steht, als Warnung. Zusätzlich bricht der Lauf ab (statt auszuliefern), falls
der Preflight trotz fester Quelle `buchend` meldet.

### Befund: Dublette **innerhalb derselben Datei**

Weder der Preflight noch der scharfe Import sieht sie:

* Der Preflight entdoppelt die Hashliste **vor** der Datenbankabfrage
  (`[...new Set(...)]`) und vergleicht danach nur gegen `zahlungseingaenge`.
* Der scharfe Import tut dasselbe:
  `neueBuchungen = zuVerarbeiten.filter(b => !bekannt.has(b.buchungsHash))` —
  `bekannt` enthält ausschließlich Datenbankwerte.

Stehen zwei identische Buchungen in **einem** Auszug, legt der Import die
erste an und läuft bei der zweiten in den UNIQUE-Index aus Migration
`20261003000000`. Ergebnis: **Fehlercode 23505**, der Auszug landet im Status
`fehler`, und im Protokoll steht „duplicate key" statt „diese Buchung steht
zweimal in Ihrem Auszug".

**Keine Doppelbuchung** — der Index hält. Aber ein abgebrochener Import mit
einer Meldung, aus der niemand den Grund ablesen kann. Der Pilot stuft die
zweite Fundstelle jetzt vorher auf `DUPLICATE` herunter, nennt die Zeilennummer
der ersten und macht den Auszug als **Erstlauf** untauglich, ohne ihn als
importierbar zu bestreiten.

Die Rangfolge bleibt dabei die des Preflights: `INVALID` und
`CROSS_TENANT_BLOCKED` schlagen die Dateidublette — der ernstere Befund gewinnt.

### Bericht je Buchung

Betrag centgenau (vorzeichenbehaftet **und** absolut **und** als deutscher
Text), Soll/Haben, verkürzte Zahler-IBAN, Ergebnis der MOD-97-Prüfsumme,
EndToEndId, Mandatsreferenz, Verwendungszweck, **Rechnungsreferenz als eigenes
Feld** (aus dem Verwendungszweck extrahiert, mit der Angabe, ob es sie bei
diesem Mandanten gibt), Zahlername, Zahlungsdatum, Valuta, Confidence,
Kandidaten, Mehrdeutigkeiten, Dublettenschutz (verbucht / Datei bekannt /
Dublette von Zeile N / Buchungshash), Mandant, Rücklastschriftmerkmal und die
vollständige Feldprüfliste.

Dazu je Posten ein Feld **`gebucht: false`** — als Konstante im Typ. Es steht
da, damit `wuerdeBuchen` beim Überfliegen nicht als „hat gebucht" gelesen wird.

### Bewusste Abweichung vom Wortlaut des Auftrags: IBAN

Der Auftrag nennt „IBAN" im Report. Ausgegeben wird die **verkürzte** Form
(`DE89…3000`) plus das Prüfsummenergebnis — wie im Phase-7-Preflight, und aus
demselben Grund: ein Pilotbericht wird ausgedruckt, per Mail weitergereicht und
abgeheftet. Die vollständige Bankverbindung eines Zahlers steht in
`zahlungseingaenge` und ist dort für den berechtigten Admin einsehbar.

Ein Test prüft, dass **weder** der Textbericht **noch** die JSON-Antwort eine
vollständige IBAN enthält — und ebenso wenig die Kennung eines fremden
Mandanten.

### Piloturteil

`beurteilePilot()` ist bewusst **strenger** als `freigabefaehig`:

| Urteil | Bedeutung |
|---|---|
| `UNTAUGLICH` | Der scharfe Import würde die Datei abweisen. |
| `NICHT_ALS_ERSTLAUF` | Importierbar, aber als **erster** Lauf ungeeignet — Dublette in der Datei, mehr als die Hälfte Klärfälle, oder gar keine Buchung. |
| `PILOT_TAUGLICH` | Vollständig eingeordnet, kein Blocker, keine Dateidublette. |

Begründung: `freigabefaehig` fragt „nimmt der Import die Datei an" — Klärfälle
sind dort zu Recht kein Blocker. Das Piloturteil fragt „ist das der richtige
Auszug, um den Pfad **zum ersten Mal** scharf zu schalten": ein Auszug, von dem
zwanzig von dreißig Buchungen in der Klärliste landen, lässt sich hinterher
nicht mehr gegen einen Erwartungswert prüfen.

**Testdaten:** sämtliche CAMT-XML dieser Suite ist erfunden; die IBANs sind die
öffentlichen Beispielwerte aus der ISO-20022-Dokumentation.

---

## 2. Track 6 — Zuordnungs-Gate für **genau eine** Zahlung

**`lib/pilot/allocation-gate.ts`** · **`GET /api/pilot/zuordnung-pruefung`**

### Die zehn Punkte

| # | Prüfung |
|---|---|
| 1 | Zahlung vorhanden, nicht gelöscht, eigener Mandant |
| 2 | Rechnung vorhanden und nicht gelöscht |
| 3 | Zahlung und Rechnung gehören **demselben** Mandanten |
| 4 | Rechnung gehört dem erwarteten Kunden |
| 5 | Betrag ist positiv und ganzzahlig in Cent |
| 6 | Die Zahlung hat noch genug nicht zugeordneten Rest |
| 7 | Rechnung ist offen, nicht im Endstatus, keine Überzahlung — **Teil- oder Vollzahlung wird benannt** |
| 8 | Keine bestehende Zuordnung dieser Zahlung auf diese Rechnung |
| 9 | Idempotenzschlüssel `alloc_{payment}_{invoice}` noch nicht eingelöst |
| 10 | Audit-Trail lesbar und beschreibbar |

Punkt 2 liest die Rechnung **absichtlich ohne** `organization_id`-Filter und
wertet die Spalte stattdessen aus. Nur so ist „gehört einem anderen Mandanten"
(Punkt 3) von „existiert nicht" (Punkt 2) zu unterscheiden — mit Filter würde
aus beidem dieselbe Meldung, und die schickt jemanden an der falschen Stelle
suchen. Ein Test hält beides fest: kein org-Filter **und** `organization_id` in
der Spaltenliste.

Punkt 4 sperrt nur, wenn ein erwarteter Kunde übergeben wurde. Ohne ihn steht
im Befund ausdrücklich **„dieser Punkt wurde NICHT gegengeprüft"** — ein „frei"
ohne diesen Zusatz läse sich wie ein bestandener Abgleich.

### Token

`oeffneAllocationGate()` stellt bei zehn freien Punkten ein UUID-Token aus, das
**genau eine** Kombination aus Mandant + Zahlung + Rechnung + Betrag deckt und
nach `TOKEN_GUELTIG_MINUTEN` (15) verfällt.

`loeseAllocationGateEin()` prüft das Token und **wiederholt anschließend die
vollständige Prüfung** — nicht eine abgespeckte. Sechs unterscheidbare Befunde:
`EINGELOEST`, `UNBEKANNT`, `BEREITS_EINGELOEST`, `ABGELAUFEN`, `PASST_NICHT`,
`ZUSTAND_GEAENDERT`. `darfBuchen` ist bei **jedem** außer dem ersten `false`
(eigener Test über alle Fälle).

**Kein Batch.** Ein Token deckt eine Rechnung. `allocatePayment()` nimmt eine
Liste; das Gate nicht.

### Wo das Token liegt — und warum

In `billing_audit_trail` (`gate_geoeffnet` / `gate_eingeloest`), nicht in einer
eigenen Tabelle und nicht im Arbeitsspeicher.

* **Nicht im Arbeitsspeicher:** eine `Map` im Prozess ist auf Vercel
  instanz-lokal; ein Token daraus überlebt keinen zweiten Aufruf und wäre als
  Einmal-Sperre wertlos (dasselbe Muster wie die instanz-lokale Rate-Limit-Map).
* **Nicht in einer eigenen Tabelle:** das hieße eine weitere Migration, die auf
  den manuellen SQL-Editor wartet. Der Audit-Trail existiert live, ist
  mandantengezäunt und ist für einen Vorgang, den man später erklären muss,
  ohnehin die richtige Ablage.

### Ehrlich benannte Grenze

Zwei gleichzeitige Einlösungen desselben Tokens können **beide** durchkommen —
Lesen und Schreiben der Audit-Zeile sind nicht atomar. Das Gate ist eine
bewusste Schwelle, **nicht** der letzte Riegel. Der letzte Riegel bleibt
`UNIQUE(payment_id, invoice_id)` auf `payment_allocations`.

Das ist der Unterschied zum Send-Gate aus Track 3 (Parallelarbeit): dort liegt
das Token in `pilot_send_gate` mit zwei UNIQUE-Teilindizes — stärker, aber an
eine noch nicht angewendete Migration gebunden.

### Was **nicht** freigelegt wurde

`oeffneAllocationGate()` und `loeseAllocationGateEin()` sind gebaut und
geprüft, aber **bewusst nicht als Route veröffentlicht**. Der Weg vom
eingelösten Token zur echten Buchung ist genau der Schritt, den die Stopp-Grenze
dieser Phase ausschließt. Über HTTP erreichbar ist nur die **rein lesende**
`pruefeZuordnung()` — sie gibt nie ein Token aus.

---

## 3. Track 7 — Mahnwesen-Trockenlauf

**`lib/pilot/mahnwesen-dryrun.ts`** · **`GET /api/pilot/mahnwesen`**

### Vier Urteile statt zwei

Das Mahn-Safety-Gate aus Phase 7 antwortet binär, weil es das muss — seine
Antwort steht unmittelbar vor einer Gebührenbuchung. Für den Erstbetrieb ist das
zu grob: „diese Rechnung ist bezahlt" und „hier steht eine Gutschrift offen"
sind beide `GESPERRT`, aber die eine ist der Normalfall und die andere ein
liegen gebliebener Vorgang.

| Urteil | Bedeutung |
|---|---|
| `NOT_ELIGIBLE` | Gehört heute nicht ins Mahnwesen (bezahlt, storniert, abgeschrieben, Entwurf, nichts offen, noch nicht fällig, Ende der Mahnleiter). Kein Handlungsbedarf. |
| `ELIGIBLE` | Würde heute gemahnt, nichts spricht dagegen. |
| `NEEDS_REVIEW` | Technisch mahnbar, aber ein Umstand verlangt einen Blick, **bevor** ein Automat eine Gebühr bucht. |
| `BLOCKED` | Gehörte ins Mahnwesen, aber eine Sperre verbietet die Mahnung — und die ist erklärungsbedürftig. |

Rangfolge `BLOCKED › NOT_ELIGIBLE › NEEDS_REVIEW › ELIGIBLE`. `NOT_ELIGIBLE`
steht vor `NEEDS_REVIEW`, weil bei einer bezahlten Rechnung niemand mehr etwas
sichten muss.

**Es rechnet nicht selbst.** Das Modul ruft `pruefeMahnbarkeit()` — dieselbe
Prüfung, die `advanceDunning()` vor jeder Eskalation fährt — und übersetzt deren
zehn Punkte. Ein Test stellt beide Ergebnisse nebeneinander.

### Befund: die Rücklastschrift sieht das Gate nicht

`verarbeiteRuecklastschrift()` setzt die Mahnstufe **unmittelbar** hoch
(mindestens auf `mahnung_1`) — ohne `advanceDunning()`, also ohne das Gate, und
**ohne `next_dunning_at` zu setzen**. Eine Rechnung nach Rücklastschrift steht
damit auf einer Stufe, die kein Mahnlauf erzeugt hat, und die nächste Eskalation
kann ohne den üblichen Stufenabstand kommen.

Das ist **kein Fehler** — bei einer geplatzten Lastschrift ist Eskalation
gewollt. Aber es ist genau der Vorgang, den ein Mensch beim ersten scharfen
Mahnlauf gesehen haben sollte. Der Trockenlauf erkennt ihn über **zwei** Wege
(`sepa_batch_items.status = 'ruecklastschrift'` **und** die Gebührenzeile in
`payment_differences`) und stuft ihn auf `NEEDS_REVIEW`.

Nebenbei bestätigt: die Rücklastschriftgebühr (`widerspruch_status = 'offen'`)
blockiert die Mahnung **nicht** — sonst bliebe jede geplatzte Lastschrift für
immer ungemahnt. Eigener Test.

### Weitere Beobachtungen (nichts davon verbietet etwas)

`teilzahlung` (Mahnung darf nur über den Rest lauten), `gebuehr_ueber_forderung`
(die Mahngebühr der nächsten Stufe erreicht oder übersteigt den offenen Betrag),
`kleinbetrag` (unter 5,00 €), `hoechste_stufe` (Ende der Mahnleiter).

Beobachtungen werden **nur** ausgewertet, wenn das Gate sonst frei ist — ein
`NEEDS_REVIEW` auf einer bezahlten Rechnung wäre reiner Lärm.

Der Bericht nennt zusätzlich die **Summe der Mahngebühren, die heute gebucht
würden** — die Zahl, die vor dem Umlegen von `MAHNVERSAND_AUTOMATISCH` auf dem
Tisch liegen sollte.

---

## 4. Track 8 — Money-Path-Abstimmung

**`lib/pilot/reconciliation.ts`** · **`GET /api/pilot/abstimmung`**

Neun Stufen: Leistung → Rechnung → Versand → Zahlung → Zuordnung →
Rechnungsstatus → Buchhaltung → DATEV → Audit.

### Warum die Naht und nicht die Stufe

Jede Stufe hat ihre eigene Prüfung, und jede prüft sich selbst. Die schwersten
Befunde dieses Repos saßen aber dazwischen — **jede einzelne Tabelle sah für
sich genommen plausibel aus**:

* **C-1:** Zuordnungszeile vorhanden, `invoices.paid_amount` nicht
  fortgeschrieben → die Rechnung galt weiter als offen und wurde gemahnt,
  während DATEV die Zahlung längst buchte.
* **M-3:** `dunning_entries.amount_paid_cents` lief gegen die Rechnung
  auseinander.

Beide Fehlerbilder haben in dieser Abstimmung einen eigenen Befundcode und einen
eigenen Test, der sie auf echtem Postgres **herstellt**.

### Zwei Befundarten, nicht eine

| Art | Bedeutung | Was zu tun ist |
|---|---|---|
| `ORPHAN_FOUND` | Ein Datensatz hängt an nichts (Zuordnung ohne Zahlung, Position ohne Nachweis, Mahnkonto ohne Rechnung). | Meist ein abgebrochener Lauf, oft löschbar. |
| `MISMATCH` | Beide Seiten existieren, sagen aber Verschiedenes. | Ein Buchungsfehler, der ausgeglichen werden muss. |

Wer beides „Fehler" nennt, schickt jemanden mit der falschen Erwartung in die
Prüfung. Dazu ein vierter Stufenwert `UNGEPRUEFT` für eine Abfrage, die
scheiterte — eine Stufe, deren Messung fehlschlug, darf nie `CONSISTENT`
aussehen.

**Jeder Befund trägt die vollständige Rückverfolgung** — Mandant, Kunde,
Rechnung (Nummer und Id), Zahlung, Bankreferenz, Datensatz-Id — und bei
`MISMATCH` zusätzlich `erwartetCent` / `gefundenCent`.

### Die 14 Befundcodes

`position_ohne_rechnung` · `position_ohne_nachweis` · `rechnung_ohne_kunde` ·
`rechnung_ohne_positionen` · `protokoll_ohne_rechnung` ·
`versendet_ohne_protokoll` · `protokoll_ohne_versanddatum` ·
`zahlung_allocated_abweichung` · `zahlung_ueberzugeordnet` ·
`zuordnung_ohne_zahlung` · `zuordnung_ohne_rechnung` · `zuordnung_doppelt` ·
`zuordnung_ohne_betrag` · `paid_amount_abweichung` ·
`status_bezahlt_ohne_deckung` · `status_offen_trotz_deckung` ·
`mahnkonto_ohne_rechnung` · `mahnkonto_bezahlt_abweichung` ·
`mahnkonto_offen_trotz_bezahlt` · `zuordnung_nicht_exportiert` ·
`rechnung_nicht_exportiert` · `rechnung_ohne_audit` · `zuordnung_ohne_audit`

### Benannte Grenze: DATEV

**Es gibt keine Tabelle `datev_buchungen`.** Der Export erzeugt eine CSV in
Storage und **eine** Zeile in `datev_exports` mit Zeitraum und Status.
Abstimmbar ist deshalb nur die **Abdeckung** — ob ein erfolgreicher Lauf
existiert, der den Zeitpunkt eines Geschäftsvorfalls umfasst —, nicht der
Inhalt der Datei. Der Inhalt ist Gegenstand des DATEV-Validators aus Phase 7.

Die Prüfung greift ausdrücklich **nur** für Vorgänge **vor** dem letzten
Exportende. Alles danach ist schlicht noch dran und keine Meldung wert. Ein
Export im Status `fehler` zählt nicht als Abdeckung.

### Tests auf echtem Postgres

39 Tests auf PGlite, mit echten CHECK-Constraints, Fremdschlüsseln und Typen.
Die Fehlerbilder werden **hergestellt** (Zeile löschen, Zähler verstellen), und
zu jedem gibt es eine Gegenprobe, dass die saubere Lage `CONSISTENT` ergibt.
Dazu: ein Test, dass die Abstimmung **keine einzige Zeile verändert**, und zwei,
dass sie über die Mandantengrenze weder liest noch meldet.

**Nebenbefund aus der Gegenprobe:** `zuordnung_ohne_betrag` ist live ein
**toter Zweig** — `payment_allocations.amount_cents` trägt
`CHECK (amount_cents > 0)` (Migration `20260808210000`). Der Test hält das
ausdrücklich fest: die Datenbank ist der Riegel, nicht die Abstimmung. Der
Zweig bleibt trotzdem stehen, weil die Anwendung auch gegen Schemata ohne den
Constraint laufen kann (Shadow-Instanz, Rollback) — dieselbe Begründung wie
beim Rückfall in `ruecklastschrift.ts:185`.

---

## 5. Track 9 — Business Inputs

**`lib/pilot/business-inputs.ts`**

### Die Kernaussage, und wie sie geprüft wird

> **Rechnungspilot blockiert: NEIN.**

Keine offene Geschäftsangabe liegt auf dem Rechnungsweg. Das ist keine Meinung,
sondern eine Eigenschaft des Codes — und sie wird als solche geprüft:
`__tests__/pilot/business-inputs.test.ts` **liest die fünf Dateien des
Rechnungswegs** und stellt fest, dass keine davon DATEV oder ChairMatch
importiert und keine eine ihrer Tabellen liest. Baut jemand morgen eine
Kontenprüfung in die Festschreibung ein, wird dieser Test rot — **bevor** die
falsche Aussage im nächsten Handoff steht.

### Was fehlt

| # | Angabe | Quelle | Schwere | Stand |
|---|---|---|---|---|
| **D1** | Beraternummer | Steuerkanzlei | **blockierend** | offen |
| **D2** | Mandantennummer | Steuerkanzlei | **blockierend** | offen |
| D3 | Kontenrahmen SKR03/SKR04 — bestätigt | Steuerkanzlei | unbestätigter Standard | offen |
| D4 | Erlöskonto steuerfreie Pflege (§ 4 Nr. 16 UStG) | Steuerkanzlei | unbestätigter Standard | offen |
| D5 | Sachkontenlänge (4 oder 5) | Steuerkanzlei | unbestätigter Standard | offen |
| D6 | Wirtschaftsjahresbeginn | Steuerkanzlei | unbestätigter Standard | offen |
| **C1** | ChairMatch: welche Beträge? | Geschäftsführung | Entscheidung | **nicht prüfbar** |
| C2 | Alle vier Risikostufen oder nur HIGH/VERY_HIGH? | Geschäftsführung | Entscheidung | nicht prüfbar |
| C3 | Netto oder brutto? | Geschäftsführung / Steuerkanzlei | Entscheidung | nicht prüfbar |
| C4 | Bleibt es bei one_time / yearly / monthly? | Geschäftsführung | Entscheidung | nicht prüfbar |
| **C5** | `20260826_pricing_gueltigkeit.sql` anwenden? | Geschäftsführung | Entscheidung | nicht prüfbar |

**D3–D6 stehen auf „offen", obwohl Werte gesetzt sind.** Ein Standardwert aus
dem veröffentlichten Kontenrahmen ist kein **bestätigter** Wert. „gesetzt" wäre
hier eine Falschaussage.

**ChairMatch steht auf „nicht prüfbar", nicht auf „offen".** Anderes Repo
(`/Users/work/chairmatch`), anderes Supabase-Projekt; dieser Prozess hat keine
Verbindung dorthin und behauptet deshalb keinen Stand. Ein Test prüft, dass
keine ChairMatch-Tabelle abgefragt wird.

### Was ohne jede dieser Angaben vollständig läuft

Kunde anlegen · Leistung erfassen · Nachweis unterschreiben · Rechnung erzeugen,
prüfen, festschreiben · 16-Punkte-Preflight und Pilot-Prüfung · PDF erzeugen und
per Resend versenden · `invoice_email_log` · CAMT-Trockenlauf ·
Zahlungszuordnungs-Gate · Mahn-Trockenlauf und Mahn-Safety-Gate ·
Money-Path-Abstimmung über alle neun Stufen.

### Was ohne D1/D2 **nicht** läuft

DATEV-Buchungsstapel erzeugen (`erstelleDatevExport()` bricht vorher ab) ·
Übergabe an die Steuerkanzlei · Stufe 8 der Abstimmung (sie hat nichts
abzustimmen, solange kein Export existiert).

### Nichts wird erfunden

Das Modul enthält **keine** Beraternummer, **keine** Mandantennummer und
**keinen** Preis. Drei Tests halten das fest — einer scannt die Quelldatei auf
Zahlenliterale, zwei stellen sicher, dass ein **gesetzter** DATEV-Wert weder im
Textbericht noch in der JSON-Antwort auftaucht (geprüft wird die Existenz, nie
der Wert).

Ein vierter Test hält das Register mit `BERATER_VORGABE_ERFORDERLICH` aus dem
DATEV-Validator im Gleichschritt — sonst laufen die beiden Listen still
auseinander, dasselbe Muster wie `NICHT_MAHNFAEHIG` / `GESPERRTE_STATUS`.

---

## 6. Track 10 — Pilot Control Center

**`lib/pilot/pilot-phasen.ts`** · `/admin/pilot` Abschnitt 4 und 5 ·
`GET /api/admin/pilot`

### Die neun Phasen

`PRE-FLIGHT` → `APPROVAL` → `SEND` → `DELIVERY` → `CAMT` → `MATCH` →
`ALLOCATION` → `RECONCILIATION` → `AUDIT`

Je Phase: Status aus `NOT_STARTED` / `READY` / `APPROVED` / `EXECUTING` /
`VERIFIED` / `FAILED` / `BLOCKED`, eine Begründung aus **gemessenen** Werten,
der nächste konkrete Schritt — und **das Modul, das die Aktion tatsächlich
freigibt** (`gate`).

Das `gate`-Feld steht im **Datenmodell**, nicht nur im Seitentext. Jede
Oberfläche, die eine Phase anzeigt, muss den Riegel mitnennen. Ein Test prüft,
dass kein `gate` auf diese Seite selbst zeigt.

### Keine kritische Aktion ohne Backend-Gate

Fünf Tests, jeder auf einer anderen Ebene:

1. Kein `insert`/`update`/`delete` über den ganzen Lauf (Doppelgänger-Protokoll).
2. Die Quelldatei enthält keinen dieser Kettenaufrufe (Lesen der Datei).
3. `app/api/admin/pilot/route.ts` hat weiterhin **kein** `POST`/`PUT`/`PATCH`/`DELETE`.
4. `app/admin/pilot/page.tsx` enthält **kein** `<form`, **kein** `<button`, **kein** `onClick`.
5. Jede der über zwölf Abfragen filtert auf `organization_id` — der Dienst
   läuft mit service_role (BYPASSRLS), und eine Zahl sieht immer plausibel aus.

### Fail-closed

Eine gescheiterte Messung ergibt `null`, nie `0`, und die Phase wird `BLOCKED`
mit dem Grund. Ein Test stellt sicher, dass bei durchgehendem Lesefehler
**keine** Phase `VERIFIED` ist.

Besonders benannt: die `APPROVAL`-Phase liest `pilot_send_gate` (Migration
`20261005000000`, aus Track 3 — **nicht angewendet**). Fehlt die Tabelle,
antwortet PostgREST mit einem Fehler; die Phase wird dann `BLOCKED` **und nennt
die Migrationsnummer und den SQL-Editor als nächsten Schritt** — nicht
`NOT_STARTED`. Der Unterschied zählt: „noch niemand hat freigegeben" und „die
Tabelle gibt es nicht" führen zu völlig verschiedenen nächsten Schritten.

### `RECONCILIATION` ist niemals `VERIFIED`

Die Übersicht rechnet die Abstimmung **nicht** mit — sie wäre die teuerste
Messung der Seite und ihr Ergebnis kommt eigens über
`GET /api/pilot/abstimmung`. Eine Phase, die „geht auf" behauptet, ohne die
Abstimmung gerechnet zu haben, wäre die gefährlichste Anzeige auf dieser Seite.
Sie steht deshalb höchstens auf `READY`, mit genau diesem Satz in der
Begründung — und ein Test hält das fest, indem er alle acht anderen Phasen auf
grün stellt und prüft, dass diese trotzdem `READY` bleibt.

Ebenso `AUDIT`: `VERIFIED` belegt nur, **dass** protokolliert wird — ob **jeder**
Vorgang seinen Eintrag hat, prüft Stufe 9 der Abstimmung. Auch das steht in der
Begründung.

---

## 7. Neue Routen

| Route | Methode | Schreibt | Zweck |
|---|---|---|---|
| `/api/pilot/camt-dry-run` | POST | **nein** | CAMT-Datei im festen Trockenlauf. POST nur, weil die Datei in den Rumpf gehört — ein Kontoauszug hat in keiner URL und keinem Server-Log etwas zu suchen. |
| `/api/pilot/mahnwesen` | GET | nein | Mahn-Trockenlauf, optional `?ids=` und `?limit=` |
| `/api/pilot/abstimmung` | GET | nein | Neun-Stufen-Abstimmung |
| `/api/pilot/zuordnung-pruefung` | GET | nein | Die zehn Punkte des Gates — **ohne Token** |

Alle vier: `requireOpsAdmin('abrechnung.lesen')`, `?format=text` für den
Bericht zum Gegenlesen, `Cache-Control: no-store`.

`GET /api/admin/pilot` liefert zusätzlich `phasen` und `businessInputs`.

---

## 8. Was diese Tracks **nicht** getan haben

* **Keine echte Zahlung verbucht.** `payments` unverändert.
* **Keine Mahnung versendet**, keine Mahnstufe erhöht, keine Gebühr gebucht.
* **Keine Lastschrift ausgelöst.**
* **Keine Bankdatei importiert.** `camt_imports` unverändert.
* **Kein Schalter umgelegt.** `RECHNUNGSVERSAND_AUTOMATISCH`,
  `MAHNVERSAND_AUTOMATISCH` und `CAMT_IMPORT_MODE` bleiben ungesetzt.
* **Keine Migration angewendet** und keine neue geschrieben.
* **Kein Preis, keine Beraternummer, keine Mandantennummer erfunden.**
* **Die Token-Ausstellung des Zuordnungs-Gates ist nicht über HTTP erreichbar** —
  bewusst, siehe Track 6.

---

## 9. Offene Punkte nach diesen Tracks

| # | Punkt | Priorität |
|---|---|---|
| **P8-1** | Migration `20261005000000_pilot_send_gate.sql` (aus Track 3) wartet auf den SQL-Editor. Bis dahin steht die `APPROVAL`-Phase auf `BLOCKED` — mit korrekter Begründung, aber die Einmal-Freigabe für den Erstversand ist ohne sie nicht benutzbar. | **P1 — DDL, extern** |
| P8-2 | `oeffneAllocationGate()` / `loeseAllocationGateEin()` haben keine Route. Bewusst — freizulegen mit dem begleiteten Erstlauf, nicht vorher. | Erstbetrieb |
| P8-3 | Das Zuordnungs-Token ist gegen zwei **gleichzeitige** Einlösungen nicht atomar. Der Riegel bleibt `UNIQUE(payment_id, invoice_id)`. Eine eigene Tabelle mit Teilindex wäre stärker — und eine weitere wartende Migration. | benannte Grenze |
| P8-4 | Stufe 8 der Abstimmung prüft **Abdeckung**, nicht Inhalt — es gibt keine Tabelle `datev_buchungen`. Der Inhalt bleibt Sache des DATEV-Validators. | benannte Grenze |
| P8-5 | `check:schema-drift` ist weiterhin **nicht** in CI oder Precommit-Guard verdrahtet (T-0 aus Phase 7, unverändert). | P2 |

---

## 10. Nächster sinnvoller Schritt

1. **`/admin/pilot` Abschnitt 4 öffnen.** Die Phasenkette sagt, wo der
   Erstbetrieb steht und was als Nächstes ansteht. Ein `—` statt einer Zahl
   heißt „nicht messbar", nicht „nichts da".
2. **Migration `20261005000000` anwenden** (P8-1) — sonst bleibt `APPROVAL`
   blockiert.
3. **Echte Bankdatei durch `POST /api/pilot/camt-dry-run?format=text`.**
   Kostet nichts, bucht nichts, beantwortet vorab, was der scharfe Import täte.
   Erst bei `PILOT_TAUGLICH` in Zeile „URTEIL" den nächsten Schritt erwägen.
4. **`GET /api/pilot/mahnwesen?format=text`** lesen, **bevor**
   `MAHNVERSAND_AUTOMATISCH` überhaupt zur Debatte steht. Die Zeile
   „Mahngebühren, die heute gebucht würden" ist die Zahl, um die es geht.
5. **`GET /api/pilot/abstimmung?format=text`** als Ausgangsaufnahme — jetzt,
   solange die Kette noch leer ist. Ein `CONSISTENT` auf leerem Bestand ist der
   Vergleichswert, gegen den der erste echte Vorgang geprüft wird.
6. **D1/D2 von der Kanzlei holen.** Sie halten den Rechnungspilot nicht auf
   (Track 9), aber ohne sie gibt es keinen DATEV-Export und damit keine
   Stufe 8.

---

*Erstellt 26.08.2026 — Phase 8, Tracks 5–10, Alltagsengel.*
