# Phase 8.1 -- Live Pilot Preflight (Source-of-Truth Reconciliation)

**Stand:** 26.08.2026
**Erstellt:** Phase 8.1, autonome Session
**HEAD:** `ae080be` (docs-only; letzter Code-Commit: `f4ded2a`)

---

## 1. SOURCE OF TRUTH RECONCILIATION

### Commit-Anker

| Anker | Wert | Quelle |
|---|---|---|
| **HEAD (lokal)** | `ae080be7eeb4...` | `git rev-parse HEAD` |
| **origin/main** | `ae080be7eeb4...` | `git rev-parse origin/main` nach `git fetch` |
| **GitHub main** | `ae080be7eeb4...` | `gh api repos/.../commits/main` |
| **Vercel Production** | `ae080be7eeb4...` | `gh api repos/.../deployments` (Production, 2026-08-26T01:27:52Z) |
| **MASTER_HANDOFF CODE_HEAD** | `f4ded2a` | Dokumentiert als letzter Code-Commit |

**Ergebnis: KEIN DRIFT.**

Die Differenz zwischen `f4ded2a` (MASTER_HANDOFF) und `ae080be` (HEAD) ist ein
einzelner docs-only Commit (`docs: Phase 8 Handoff`), der ausschliesslich
`MASTER_HANDOFF_LATEST.md` und `PHASE8_FIRST_REAL_PILOT.md` aendert. Kein
Anwendungscode betroffen. Das Handoff-Dokument beschreibt dieses Muster
ausdruecklich in Abschnitt 0 ("Ein Dokument kann den Hash des Commits, der es
selbst enthaelt, nicht im Voraus nennen").

```
git diff f4ded2a..ae080be --stat:
  docs/reports/MASTER_HANDOFF_LATEST.md   | 726 (nur Dokumentaenderungen)
  docs/reports/PHASE8_FIRST_REAL_PILOT.md | 362 (neues Dokument)
```

### CI-Status

| Check | Ergebnis |
|---|---|
| Typecheck, Lint, Tests, Build | **success** |
| E2E -- PflegeCoach (DiPA QS-05) + Barrierefreiheit (BITV B-13) | **success** |
| Health Check | **success** |
| Wiederholungslauf | **success** |

**CI: GRUEN auf `ae080be`.**

### Vercel

- Production Deployment auf `ae080be` (2026-08-26T01:27:52Z)
- Environment: Production
- SHA identisch mit HEAD

---

## 2. PILOT_SEND_GATE MIGRATION

**Status: EXTERN_BLOCKIERT (DDL nicht anwendbar)**

Die Tabelle `pilot_send_gate` existiert **nicht** in der Produktionsdatenbank.
Die Migration `20261005000000_pilot_send_gate.sql` liegt lokal vor (96 Zeilen)
und definiert:

- `pilot_send_gate` mit UUID-Token, organization_id, invoice_id, Empfaenger, Betrag
- `pilot_versand_sperre` fuer P0-Sperren nach Nachpruefung
- Zwei UNIQUE-Teilindizes:
  - `pilot_send_gate_offen_je_rechnung` (hoechstens 1 offenes Token je Rechnung)
  - `pilot_send_gate_einmal_verbraucht` (hoechstens 1 verbrauchtes Token je Rechnung)
- CHECK auf `preflight_status = 'READY_FOR_SEND'`
- RLS-Policies

**Versuch ueber PostgREST/MCP:** DDL (CREATE TABLE) ist ueber PostgREST nicht
ausfuehrbar. `_run_sql` RPC existiert nicht auf diesem Projekt. Die Migration
muss im **Supabase SQL-Editor** manuell eingespielt werden.

**Auswirkung:** Ohne die Tabelle ist die `APPROVAL`-Phase in `/admin/pilot`
blockiert. Die Einmal-Freigabe ist nicht benutzbar.

---

## 3. SICHERHEITSSCHALTER

### Versand-Flags (`lib/config/versand-flags.ts`)

- `RECHNUNGSVERSAND_AUTOMATISCH`: Default AUS (fail-closed, nur exakter Wert `'1'` schaltet ein)
- `MAHNVERSAND_AUTOMATISCH`: Default AUS (identisches Muster)
- Umgebungstrennung: Schalter wirkt NUR im Produktionslauf
- Ungueltiger Wert: eigener Befund mit Protokolleintrag

### CAMT-Modus (`lib/billing/camt/camt-modus.ts`)

- `CAMT_IMPORT_MODE`: Default `DRY_RUN`
- Nur exakter Wert `'LIVE'` schaltet buchen ein
- Unbekannter Wert: DRY_RUN (fail-closed)

### Erstversand-Freigabe (`lib/pilot/send-gate.ts`)

- `FIRST_REAL_INVOICE_APPROVED = false` (Zeile 70, Konstante im Quelltext)
- `PILOT_ERSTVERSAND_FREIGEGEBEN`: Umgebungsvariable, nicht gesetzt
- Nur exakter Wert `'1'` gibt frei (nicht getrimmt)

### Pilot-Send-Gate Tokens

- Tabelle existiert nicht (Migration wartet) -- keine offenen Tokens moeglich

**Alle Schalter stehen auf AUS. Fail-closed bestaetigt.**

---

## 4. /admin/pilot VERIFIZIERUNG

### Dateien

| Datei | HTTP-Methode | Schreiboperationen |
|---|---|---|
| `app/api/admin/pilot/route.ts` | **GET only** | Keine (explizit dokumentiert: "kein POST/PUT/PATCH/DELETE") |
| `app/api/admin/pilot/[clientId]/route.ts` | **GET only** | Keine |
| `app/api/pilot/snapshot/route.ts` | **GET only** | Keine |
| `app/api/pilot/zuordnung-pruefung/route.ts` | **GET only** | Keine |
| `app/api/pilot/mahnwesen/route.ts` | **GET only** | Keine |
| `app/api/pilot/abstimmung/route.ts` | **GET only** | Keine |
| `app/api/billing/invoices/[id]/pilot/route.ts` | **GET only** | Keine |
| `app/api/pilot/camt-dry-run/route.ts` | POST (Datei-Upload) | Keine (parst die Datei, schreibt nichts) |

### Tenant-Isolation

- `app/api/admin/pilot/route.ts:46`: `.eq('organization_id', auth.organizationId)` -- korrekt

### Fail-Closed

- `APPROVAL`-Phase blockiert, solange Migration nicht angewendet
- Kein versteckter Default gefunden

**Ergebnis: Read-only, tenant-isoliert, fail-closed. OK.**

---

## 5. PRE-PILOT SNAPSHOT

### Zaehler (Supabase, 26.08.2026)

| Tabelle | Anzahl |
|---|---|
| `payments` | **0** |
| `camt_imports` | **0** |
| `invoice_email_log` | **0** |
| `payment_allocations` | **0** |

### Migrationen

Schema-Migrations-Tabelle (`supabase_migrations.schema_migrations`) ist ueber
PostgREST nicht abfragbar. Lokale Migrationsdateien: 226+ vorhanden.
Letzte: `20261005000000_pilot_send_gate.sql` (WARTET).

### RLS

`pg_tables` ist ueber PostgREST nicht abfragbar. Laut MASTER_HANDOFF: 308/308
Tabellen mit RLS (100%). Keine Moeglichkeit, dies in dieser Session unabhaengig
zu verifizieren.

---

## 6. PILOT-RECHNUNGSKANDIDATEN

**Status: NO_ELIGIBLE_PILOT_INVOICE**

In der Datenbank existieren **3 Rechnungen**, alle bereits versendet:

| Rechnung | Status | Betrag (EUR) | Gesendet |
|---|---|---|---|
| RE-2026-0003 | paid | 650 | 2026-04-02 |
| RE-2026-0002 | disputed | 1.064 | 2026-05-05 |
| RE-2026-0001 | sent | 187 | 2026-07-01 |

Keine Rechnung erfuellt die Pilotkriterien:
- Status `erstellt`/`freigegeben`/`offen`: **0**
- Unversendet: **0**
- Nicht-Storno mit Empfaenger und Betrag > 0: **0**

**Fuer den Pilot-Erstversand muss erst eine neue Rechnung erstellt werden.**

---

## 7. CAMT

| Tabelle | Anzahl |
|---|---|
| `camt_imports` | **0** |
| `zahlungseingaenge` | **0** |

- Keine echte Bankdatei importiert
- `CAMT_IMPORT_MODE` steht auf `DRY_RUN`
- Trockenlauf-Route vorhanden: `POST /api/pilot/camt-dry-run`

**Status: REAL_BANK_FILE_REQUIRED. CAMT bleibt DRY_RUN.**

---

## 8. SAFETY MECHANISMS CODE REVIEW

### send-gate.ts (606 Zeilen)

- UUID-Token: `gen_random_uuid()` als Primaerschluessel, kein zweites Geheimnis-Feld
- Atomaritaet: bedingtes UPDATE (`verbraucht_am IS NULL AND entwertet_am IS NULL`), kein Lesen-dann-Schreiben
- UNIQUE-Teilindizes: `pilot_send_gate_offen_je_rechnung` + `pilot_send_gate_einmal_verbraucht`
- Reihenfolge: erst verbrauchen, dann senden (Zeile 36-43 Kommentar)
- Fail-closed: jeder Lesefehler fuehrt zur Ablehnung (Zeile 46-47)
- `FIRST_REAL_INVOICE_APPROVED = false` als Konstante

### post-send-verification.ts (537 Zeilen)

- Fail-closed: jede Abweichung setzt P0-Sperre in `pilot_versand_sperre`
- Sperre-Schreiben fehlgeschlagen: wird separat gemeldet (`sperreFehlgeschlagen`)
- Entwertung offener Tokens bei Abweichung
- Heilt nichts, setzt nichts nach, loescht nichts

### allocation-gate.ts (798 Zeilen)

- Cross-Tenant-Check: Zeile 398 (`rechnung.organization_id !== organizationId`)
- Duplikat-Schutz: Pruefung 10 mit Verweis auf `UNIQUE(payment_id, invoice_id)` und 23505
- org_id durchgaengig in allen Abfragen (`.eq('organization_id', organizationId)`)
- Zehn Pruefpunkte fuer genau eine Zahlung-Rechnung-Kombination

### reconciliation.ts (944 Zeilen)

- 9 Stufen: Leistung, Rechnung, Versand, Zahlung, Zuordnung, Rechnungsstatus, Buchhaltung, DATEV, Audit
- org_id in jeder Stufe durchgezogen
- Befund-Hierarchie: MISMATCH > ORPHAN_FOUND > UNGEPRUEFT > CONSISTENT
- Abfragefehler fuehren zu UNGEPRUEFT (nicht CONSISTENT)

**Alle vier Module: fail-closed, tenant-isoliert, korrekt.**

---

## 9. ALTE OFFENE PUNKTE

| Punkt | Befund |
|---|---|
| `invoice_email_log` = 0 | Bestaetigt. Kein Versand je erfolgt. |
| `payments` = 0 | Bestaetigt. Keine Zahlung je gebucht. |
| `camt_imports` = 0 | Bestaetigt. Keine Bankdatei je importiert. |
| DATEV D1/D2 | **FEHLT.** `beraternummer: ''`, `mandantennummer: ''` (Default in `lib/billing/datev/datev-config.ts:34-35`). Export bricht ab. |
| ChairMatch Preise | Nicht pruefbar (kein MCP-Zugang zu pwdbjqfpgumyfktbfswg). Laut MASTER_HANDOFF: Tabellen leer, Entscheidung C1-C5 offen. |
| efy care P1 | Laut Memory: T-6 (Buchung schreibt nicht in DB), T-7 (Prod-Migrationsstand unverifiziert). Fremdrepo, nicht Teil dieses Repos. |

---

## 10. ZUSAMMENFASSUNG

### Ampel

| Bereich | Status |
|---|---|
| SOURCE_OF_TRUTH | **GRUEN** -- kein Drift, alle Anker identisch |
| CODE_HEAD | `ae080be` (docs) / `f4ded2a` (Code) |
| ORIGIN_MAIN | `ae080be` -- identisch |
| VERCEL | `ae080be` -- Production, identisch |
| CI | **GRUEN** (4/4 Checks bestanden) |
| SUPABASE | ACTIVE_HEALTHY, 308 Tabellen |
| PILOT_SEND_GATE_MIGRATION | **EXTERN_BLOCKIERT** (DDL, SQL-Editor) |
| ADMIN_PILOT | **OK** (read-only, tenant-isoliert, fail-closed) |
| PRE_PILOT_SNAPSHOT | payments=0, camt=0, email_log=0, allocations=0 |
| INVOICE_CANDIDATES | **NO_ELIGIBLE_PILOT_INVOICE** (3 existieren, alle versendet) |
| CAMT | **REAL_BANK_FILE_REQUIRED** (0 Imports, DRY_RUN) |

### Blocker

| Typ | Anzahl | Details |
|---|---|---|
| **P0** | 0 | -- |
| **P1** | 0 | (im Alltagsengel-Repo) |
| **TECHNICAL_BLOCKERS** | 0 | -- |
| **EXTERN_BLOCKIERT** | 1 | Migration `20261005000000` (SQL-Editor) |
| **BUSINESS_INPUT_REQUIRED** | 3 | D1/D2 (DATEV), C1-C5 (ChairMatch), neue Rechnung erstellen |

### Massnahmen

| # | Was | Wer |
|---|---|---|
| 1 | Migration `20261005000000_pilot_send_gate.sql` im SQL-Editor einspielen | GF / Admin |
| 2 | Neue Rechnung fuer Pilotkunden erstellen (Status `erstellt`) | GF / Sachbearbeitung |
| 3 | DATEV Beraternummer + Mandantennummer eintragen | GF / Steuerberater |
| 4 | Echte CAMT-Bankdatei beschaffen | GF / Bank |

### Schalter-Lage (unveraendert)

- `RECHNUNGSVERSAND_AUTOMATISCH`: **AUS**
- `MAHNVERSAND_AUTOMATISCH`: **AUS**
- `CAMT_IMPORT_MODE`: **DRY_RUN**
- `FIRST_REAL_INVOICE_APPROVED`: **false**
- `PILOT_ERSTVERSAND_FREIGEGEBEN`: **nicht gesetzt**

### REAL_ACTIONS_EXECUTED: NONE

Kein Schalter umgelegt, keine Rechnung versendet, keine Mahnung verschickt,
keine Bankdatei importiert, keine Zahlung verbucht, keine Migration angewendet.

### FINAL_STATUS: READY_FOR_USER_APPROVED_LIVE_PILOT (bestaetigt)

Der Status aus Phase 8 ist korrekt und durch unabhaengige Pruefung bestaetigt.
Kein Code-Drift, alle Sicherheitsschalter auf AUS, alle Safety-Mechanismen
fail-closed. Der naechste Schritt ist die Migration im SQL-Editor, dann eine
neue Rechnung erstellen.
