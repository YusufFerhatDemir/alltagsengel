# Phase 8 — Erster kontrollierter Pilotlauf (konsolidiert)

**Stand:** 26.08.2026
**Commits:** `f0d14c2` (Tracks 1--4), `f4ded2a` (Tracks 5--10)
**HEAD = ORIGIN_MAIN =** `f4ded2a`
**Vorgaenger:** Phase 7 (`5967009` / `a994885` / `0ed44c8`)

> ## Gesamtstatus: `READY_FOR_USER_APPROVED_LIVE_PILOT`
>
> Technisch ist alles vorbereitet. **Nichts Echtes wurde ausgeloest.**
> Kein Schalter umgelegt, keine Rechnung versendet, keine Mahnung verschickt,
> keine Bankdatei importiert, keine Zahlung verbucht, keine Migration
> angewendet, kein Preis gesetzt, keine Beraternummer erfunden.
>
> `payments` = 0, `camt_imports` = 0, `invoice_email_log` = 0.
>
> **Was diesen Status von Phase 7 unterscheidet:** Phase 7 baute Vorstufen
> (Preflight, Trockenlauf, Safety-Gate). Phase 8 baut die Werkzeuge fuer den
> **begleiteten Erstbetrieb** -- Snapshot, Pilotpruefung, Einmal-Freigabe,
> Nachpruefung, Zuordnungs-Gate, Mahn-Trockenlauf, Abstimmung,
> Geschaeftsangaben-Uebersicht und Phasenkette. Jedes davon ist gebaut,
> getestet, CI-gruen und **wartet auf die Freigabe durch den
> Geschaeftsfuehrer**.

---

## Stopp-Grenze

`FIRST_REAL_INVOICE_APPROVED = false` (Konstante im Quelltext).
`PILOT_ERSTVERSAND_FREIGEGEBEN` ist nicht gesetzt. Beide Versand-Flags sind
ungesetzt. `CAMT_IMPORT_MODE` steht auf DRY_RUN. Ein Test haelt jede dieser
Zusicherungen einzeln fest.

Vier der sechs neuen Module aus Tracks 5--10 schreiben nachweislich **gar
nichts** (Regressionstest je Modul). Das fuenfte (`allocation-gate`) schreibt
ausschliesslich in `billing_audit_trail`. Das sechste (`pilot-phasen`)
enthaelt kein `.insert(`/`.update(`/`.delete(`.

---

## Prueflauf-Ergebnisse

| Pruefschritt | Ergebnis |
|---|---|
| Typecheck (`tsc --noEmit`) | **0 Fehler**, Exit 0 |
| node:test | **2.211 gruen / 0 rot** |
| vitest | **6.017 gruen / 38 uebersprungen / 0 rot** (268 Dateien) |
| Tests gesamt | **8.228** (vorher 7.838, **+390**) |
| `lint:forbidden` | **0 Treffer** (24.608 Dateien, FULL-Scan) |
| `check:schema-drift` | **0 Befunde** (1.305 Dateien gegen 331 Live-Tabellen) |
| CI | **GRUEN** auf `f4ded2a` |

**Neue Tests:** 384 (159 aus Tracks 1--4, 225 aus Tracks 5--10).

| Suite | Tests |
|---|---|
| `pre-pilot-snapshot.test.ts` | 31 |
| `rechnung-pilot.test.ts` | 33 |
| `send-gate.test.ts` | 52 |
| `post-send-verification.test.ts` | 43 |
| `camt-pilot.test.ts` | 31 |
| `allocation-gate.test.ts` | 57 |
| `mahnwesen-dryrun.test.ts` | 39 |
| `reconciliation.test.ts` | 39 (auf echtem Postgres) |
| `business-inputs.test.ts` | 23 |
| `pilot-phasen.test.ts` | 36 |

---

## Track-Uebersicht

### Track 1 -- Pre-Pilot-Snapshot

`lib/pilot/pre-pilot-snapshot.ts` -- Route `GET /api/pilot/snapshot`

Sieben Abschnitte (Code, Deployment, Datenbank, Migrationen, Sicherheit,
Zustellung, Schalter), jeder Punkt mit seiner Herkunft: `gemessen`,
`gemeldet`, `dokumentiert` oder `nicht_messbar`. Zwei Tests halten fest, dass
kein `dokumentiert`- oder `nicht_messbar`-Punkt gruen erscheinen darf.

Der wertvollste Punkt ist der Commit-Abgleich: weichen `CODE_HEAD`,
`ORIGIN_MAIN` und `VERCEL_GIT_COMMIT_SHA` ab, ist jede folgende Aussage
ueber einen anderen Stand als den, der gerade Post verschicken wuerde.

Von Geheimnissen (`RESEND_API_KEY`, `CRON_SECRET`) steht im Snapshot
ausschliesslich, **ob** sie gesetzt sind -- nie der Wert. Ein Test prueft das
ausdruecklich.

### Track 2 -- Rechnungs-Pilot

`lib/pilot/rechnung-pilot.ts` -- Route `GET /api/billing/invoices/[id]/pilot`

Fuehrt den bestehenden 16-Punkte-Preflight **vollstaendig** aus und legt drei
Pilot-Pruefungen darueber: zwei zusaetzliche Doppelversand-Beine
(`invoice_email_log` und `notification_delivery_log`) und die offene
Versandsperre aus Track 4.

Der Auftragskatalog (17 Gegenstaende) wurde auf die bestehenden 16 Punkte
abgebildet -- nicht daneben gebaut. Zwei Tests pruefen beide Richtungen.

Fail-closed und strenger als im Regelbetrieb: eine unlesbare Quelle ergibt
`BLOCKED`, nicht „vermutlich in Ordnung". Beim allerersten Versand geht
durch Warten nichts verloren, durch eine zweite Mail an einen echten Kunden
sehr wohl.

### Track 3 -- Einmal-Freigabe (Send Gate)

`lib/pilot/send-gate.ts` -- Migration `20261005000000_pilot_send_gate.sql`

Drei Riegel, zwei davon in der Datenbank (UNIQUE-Teilindizes fuer hoechstens
ein offenes und hoechstens ein verbrauchtes Token je Rechnung). Der Verbrauch
ist ein bedingtes UPDATE, kein Lesen-dann-Schreiben -- bei zwei gleichzeitigen
Laeufen bekommt der Verlierer null Zeilen zurueck statt einer zweiten
Erlaubnis.

Reihenfolge: erst verbrauchen, dann senden. Ein verbranntes Token kostet eine
Minute; eine zweite Rechnung beim Kunden kostet Vertrauen.

Die Verdrahtung in den Versandweg wurde **bewusst nicht gebaut** -- sie
gehoert an den Punkt, an dem der Erstversand tatsaechlich ansteht.

**Migration `20261005000000` wartet auf den Supabase-SQL-Editor** (DDL).
Ohne sie ist die Einmal-Freigabe nicht benutzbar und die `APPROVAL`-Phase
in `/admin/pilot` steht auf BLOCKIERT.

### Track 4 -- Nachpruefung nach dem Versand

`lib/pilot/post-send-verification.ts`

Acht Pruefpunkte gegen einen erfolgten Versand: Resend-Annahme,
Provider-Kennung, genau eine Erfolgszeile, keine Retry-Dublette,
Empfaenger/Betreff/Betrag, Audit-Eintrag, `sent_at` gesetzt, keine
fremde Organisation betroffen.

Bei jeder Abweichung: P0-Sperre in `pilot_versand_sperre`, Entwertung aller
offenen Einmal-Freigaben, Audit-Eintrag (fail-soft). Ein nicht pruefbarer
Punkt zaehlt wie eine Abweichung. Die Nachpruefung heilt nichts -- sie setzt
kein `sent_at` nach, legt keine fehlende Zeile an und loescht keine doppelte.

### Track 5 -- Kontrollierter CAMT-Pilot

`lib/pilot/camt-pilot.ts` -- Route `POST /api/pilot/camt-dry-run`

Fest auf `DRY_RUN` (`PILOT_QUELLE` ist `Object.freeze`), unabhaengig von der
Umgebung. Bricht ab, falls der Preflight trotz fester Quelle `buchend` meldet.

**Befund F-1:** Datei-interne Dublettenerkennung fehlt im Preflight und im
scharfen Import. Der UNIQUE-Index aus Migration `20261003000000` faengt sie,
aber mit kryptischem Fehlercode `23505` statt einer klaren Meldung. Der Pilot
stuft die zweite Fundstelle jetzt vorher auf `DUPLICATE` herunter.

Piloturteil `PILOT_TAUGLICH` / `NICHT_ALS_ERSTLAUF` / `UNTAUGLICH` --
strenger als `freigabefaehig`, weil der erste scharfe Import kein Klärfall-
Friedhof sein sollte.

### Track 6 -- Zuordnungs-Gate

`lib/pilot/allocation-gate.ts` -- Route `GET /api/pilot/zuordnung-pruefung`

Zehn Punkte fuer genau eine Zahlung-Rechnung-Kombination. UUID-Token mit
15-Minuten-Ablauf, vollstaendige Wiederholungspruefung bei Einloesung.

Token liegt in `billing_audit_trail` statt in einer eigenen Tabelle (keine
weitere wartende Migration noetig). Ehrlich benannte Grenze: zwei gleichzeitige
Einloesungen desselben Tokens koennen beide durchkommen -- der letzte Riegel
bleibt `UNIQUE(payment_id, invoice_id)` auf `payment_allocations`.

Die Token-Ausstellung ist **bewusst nicht als Route veroeffentlicht** -- die
Stopp-Grenze schliesst den Schritt zur echten Buchung aus.

### Track 7 -- Mahnwesen-Trockenlauf

`lib/pilot/mahnwesen-dryrun.ts` -- Route `GET /api/pilot/mahnwesen`

Vier Urteile statt zwei: `NOT_ELIGIBLE`, `ELIGIBLE`, `NEEDS_REVIEW`,
`BLOCKED`. Ruft `pruefeMahnbarkeit()` -- dieselbe Pruefung wie
`advanceDunning()` -- und uebersetzt deren zehn Punkte.

**Befund F-2:** `verarbeiteRuecklastschrift()` setzt die Mahnstufe
**unmittelbar** hoch, ohne `advanceDunning()`, ohne Gate und ohne
`next_dunning_at`. Kein Fehler -- bei einer geplatzten Lastschrift ist
Eskalation gewollt -- aber ein Vorgang, den ein Mensch beim ersten scharfen
Mahnlauf gesehen haben sollte. Der Trockenlauf erkennt ihn und stuft auf
`NEEDS_REVIEW`.

Der Bericht nennt die **Summe der Mahngebuehren, die heute gebucht wuerden**.

### Track 8 -- Money-Path-Abstimmung

`lib/pilot/reconciliation.ts` -- Route `GET /api/pilot/abstimmung`

Neun Stufen: Leistung, Rechnung, Versand, Zahlung, Zuordnung,
Rechnungsstatus, Buchhaltung, DATEV, Audit. Prueft die **Naehte** zwischen
den Stufen, nicht die Stufen selbst -- genau dort sassen die schwersten
Befunde dieses Repos (C-1, M-3 aus Phase 7).

39 Tests auf echtem Postgres (PGlite). Die Fehlerbilder werden hergestellt
und jedes hat eine Gegenprobe auf `CONSISTENT`.

**Befund F-3:** `zuordnung_ohne_betrag` ist ein toter Zweig --
`payment_allocations.amount_cents` traegt `CHECK (amount_cents > 0)`.
Bewusst stehen gelassen (Shadow-Instanzen, Rollback).

Benannte Grenze: DATEV-Stufe prueft nur **Abdeckung**, nicht Inhalt.

### Track 9 -- Business Inputs

`lib/pilot/business-inputs.ts`

Kernaussage: **Rechnungspilot blockiert: NEIN.** Keine offene
Geschaeftsangabe liegt auf dem Rechnungsweg. Ein Test liest die fuenf
Dateien des Rechnungswegs und stellt fest, dass keine davon DATEV oder
ChairMatch importiert.

Offene Angaben: D1/D2 (Berater-/Mandantennummer, blockieren den
DATEV-Export), D3--D6 (unbestaetigte Standardwerte), C1--C5 (ChairMatch-
Entscheidungen, nicht pruefbar).

### Track 10 -- Pilot Control Center (Phasenkette)

`lib/pilot/pilot-phasen.ts` -- `/admin/pilot` Abschnitte 4 und 5

Neun Phasen: `PRE-FLIGHT` bis `AUDIT`. Jede Phase traegt Status, Begruendung,
naechsten Schritt und das Backend-Modul, das die Aktion tatsaechlich freigibt
(`gate`).

Fuenf Tests auf verschiedenen Ebenen, dass keine kritische Aktion ohne
Backend-Gate moeglich ist. `RECONCILIATION` ist niemals `VERIFIED` --
die Abstimmung wird eigens ueber `GET /api/pilot/abstimmung` gerechnet.

`APPROVAL` steht auf `BLOCKED`, solange Migration `20261005000000` nicht
angewendet ist -- mit korrekter Begruendung und Migrationsnummer.

---

## Befunde (3 neue + 2 Selbstkorrekturen)

### Neue Befunde

| # | Track | Befund | Wirkung | Schwere |
|---|---|---|---|---|
| **F-1** | 5 | **CAMT: Datei-interne Dublette nicht erkannt.** Weder Preflight noch scharfer Import sehen zwei identische Buchungen in einem Auszug. Der UNIQUE-Index faengt sie, aber mit `23505` statt einer klaren Meldung. | Import bricht ab, Auszug landet im Status `fehler`, Bediener sieht „duplicate key" statt einer erklaerbaren Ursache. **Keine Doppelbuchung** -- der Index haelt. | Beobachtung |
| **F-2** | 7 | **Ruecklastschrift umgeht das Mahn-Gate.** `verarbeiteRuecklastschrift()` setzt die Mahnstufe direkt hoch, ohne `advanceDunning()`, ohne Gate, ohne `next_dunning_at`. | Die naechste Eskalation kann ohne den ueblichen Stufenabstand kommen. Bei einer geplatzten Lastschrift gewollt, aber beim ersten scharfen Mahnlauf muss ein Mensch den Vorgang gesehen haben. | Beobachtung |
| **F-3** | 8 | **`zuordnung_ohne_betrag` ist toter Zweig.** `payment_allocations.amount_cents` traegt `CHECK (amount_cents > 0)` (Migration `20260808210000`). Der Abstimmungszweig kann nie greifen. | Kein Fehlverhalten. Bewusst stehen gelassen -- Shadow-Instanz, Rollback. | Beobachtung |

### Selbstkorrekturen am eigenen neuen Code (Tracks 1--4)

| # | Befund | Wirkung | Schwere |
|---|---|---|---|
| **A-1** | `pruefeVersandsperre()` las `gesetzt_am.slice(0, 10)` unbedingt. Bei fehlendem Feld wirft der Zugriff; der `catch` machte daraus `quelle_unlesbar`. | Eine **echte** Sperre haette als „Quelle unlesbar" gegolten -- richtige Blockierung, falsche Begruendung. Gefixt (defensives Lesen). | P3 Diagnose |
| **A-2** | Regressionstest „importiert den Versandweg nicht" scannte den **Volltext** statt der Import-Zeilen. Der Modulkopf nennt den Versandweg in Prosa. | Test war ab der ersten Zeile rot, haette die Erklaerung entfernt statt die Regel geprueft. Umgestellt auf Import-Zeilen. | Test |

---

## EXTERN_BLOCKIERT

| # | Was | Wer/Wo |
|---|---|---|
| E1 | `RECHNUNGSVERSAND_AUTOMATISCH` nicht gesetzt | Vercel Environment Variables -- nur `Production`, nicht „All Environments" |
| E2 | `MAHNVERSAND_AUTOMATISCH` nicht gesetzt | dito; erst sinnvoll nach einem belegten Rechnungsversand |
| E2b | `CAMT_IMPORT_MODE` nicht auf `LIVE` | fail-closed: ohne die Variable liest der Import die Datei, prueft sie, bucht nichts |
| E3 | Erster CAMT-Import nie produktiv gelaufen | Braucht echte Bankdatei. **Vorstufe: `POST /api/pilot/camt-dry-run?format=text`** |
| E4 | Erster Rechnungsversand nie produktiv | `invoice_email_log` = 0. **Vorstufe: `GET /api/billing/invoices/<id>/pilot?format=text`** |
| E5 | Paragraph 45a Bayern Antrag unvollstaendig | Landesamt fuer Pflege |
| **E6** | **Migration `20261005000000_pilot_send_gate.sql` nicht angewendet** | Supabase SQL-Editor (DDL). Ohne sie: `APPROVAL`-Phase blockiert, Einmal-Freigabe nicht benutzbar. |

## BUSINESS_INPUT_REQUIRED

### DATEV -- Kanzlei-Vorgaben

| # | Vorgabe | Wirkung, solange offen |
|---|---|---|
| **D1** | **Beraternummer** | Export bricht ab |
| **D2** | **Mandantennummer** | dito |
| D3 | Kontenrahmen SKR03/SKR04 -- bestaetigt | unbestaetigter Standard |
| D4 | Erloeskonto steuerfreie Pflege | unbestaetigter Standard |
| D5 | Sachkontenlaenge | unbestaetigter Standard |
| D6 | Wirtschaftsjahresbeginn | unbestaetigter Standard |

### ChairMatch -- Preise

| # | Frage |
|---|---|
| **C1** | Welche Betraege? Tabellen strukturell fertig und leer. |
| C2 | Alle vier Risikostufen oder nur HIGH/VERY_HIGH? |
| C3 | Netto oder brutto? |
| C4 | Bleibt es bei one_time / yearly / monthly? |
| **C5** | `20260826_pricing_gueltigkeit.sql` anwenden? Vor dem ersten Vertrag billig, danach teuer. |

### Alltagsengel -- Betrieb

| # | Was |
|---|---|
| B2 | Geldpfade Erstbetrieb: System gebaut, getestet, gegen Abbruch gehaertet -- nie mit echtem Geld gelaufen |
| B3 | 3x Signaturlaufzeit 7 Tage entscheiden |
| B4 | `getOposListe()` zeigt Entwuerfe im Forderungsbestand |

---

## Naechste Schritte (Freigabe durch Geschaeftsfuehrer)

1. **Migration `20261005000000` im Supabase-SQL-Editor anwenden.** Erst
   danach ist der Rechnungs-Pilot aussagekraeftig und die Phasenkette
   nutzbar.
2. **`/admin/pilot` Abschnitt 4 oeffnen.** Die Phasenkette zeigt, wo der
   Erstbetrieb steht. Ein `--` statt einer Zahl heisst „nicht messbar".
3. **`GET /api/pilot/snapshot?format=text`** einmal ansehen -- Zeile 1 muss
   `RUHEND` sagen.
4. **`GET /api/billing/invoices/<id>/pilot?format=text`** auf eine echte
   Rechnung. Steht dort `READY_FOR_SEND`, ist der Beleg ein Kandidat.
5. **Echte Bankdatei durch `POST /api/pilot/camt-dry-run?format=text`.**
   Erst bei `PILOT_TAUGLICH` den naechsten Schritt erwaegen.
6. **`GET /api/pilot/mahnwesen?format=text`** vor jeder Diskussion ueber
   `MAHNVERSAND_AUTOMATISCH`. Die Zeile „Mahngebuehren, die heute gebucht
   wuerden" ist die Zahl, um die es geht.
7. **`GET /api/pilot/abstimmung?format=text`** als Ausgangsaufnahme.
8. **D1/D2 von der Kanzlei holen.** Ohne sie kein DATEV-Export.
9. **Entscheidung ueber ChairMatch C5** -- jetzt billig, nach dem ersten
   Vertrag teuer.

> **Jeder Schritt einzeln, mit Gegenpruefung danach.** Der Sinn der
> Vorstufen ist, dass ein Fehler beim ersten Vorgang auffaellt und nicht
> beim fuenfzigsten.

---

## Neue Module (14 Dateien in `lib/pilot/`)

| Datei | Track | Zweck |
|---|---|---|
| `pre-pilot-snapshot.ts` | 1 | Umgebungs-Snapshot mit Herkunftsangabe |
| `rechnung-pilot.ts` | 2 | Pilot-Pruefung ueber den 16-Punkte-Preflight |
| `send-gate.ts` | 3 | Einmal-Freigabe mit DB-Riegeln |
| `post-send-verification.ts` | 4 | 8-Punkte-Nachpruefung |
| `camt-pilot.ts` | 5 | CAMT-Trockenlauf fest auf DRY_RUN |
| `allocation-gate.ts` | 6 | 10-Punkte-Zuordnungs-Gate |
| `mahnwesen-dryrun.ts` | 7 | 4-Urteile-Mahn-Trockenlauf |
| `reconciliation.ts` | 8 | 9-Stufen-Abstimmung |
| `business-inputs.ts` | 9 | Geschaeftsangaben-Status |
| `pilot-phasen.ts` | 10 | Phasenkette fuer `/admin/pilot` |
| `control-center.ts` | -- | erweitert um Phasen und Inputs |
| `types.ts` | -- | Typen fuer alle Module |
| `index.ts` | -- | Sammeldatei |
| `schritte.ts` / `voraussetzungen.ts` / `kundenkette.ts` | -- | Hilfsfunktionen |

## Neue Testdateien (11)

Alle unter `__tests__/pilot/`. Details siehe Detailberichte:
`PHASE8_TRACKS_1-4.md` und `PHASE8_TRACKS_5-10.md`.

---

## Detailberichte

| Bericht | Inhalt | Commit |
|---|---|---|
| `docs/reports/PHASE8_TRACKS_1-4.md` | Snapshot, Rechnungs-Pilot, Send Gate, Nachpruefung | `f0d14c2` |
| `docs/reports/PHASE8_TRACKS_5-10.md` | CAMT-Pilot, Zuordnungs-Gate, Mahn-Trockenlauf, Abstimmung, Business Inputs, Phasenkette | `f4ded2a` |

---

*Erstellt 26.08.2026 -- Phase 8, alle 10 Tracks, Alltagsengel.*
