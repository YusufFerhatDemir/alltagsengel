# Phase 8.2 — LIVE PILOT FINAL READINESS

**Stand:** 2026-08-26
**Commit-Basis:** 5019ac4
**Status:** READY_FOR_EXPLICIT_USER_APPROVAL

---

## Gesamtergebnis

Phase 8.2 hat alle 12 Tracks abgeschlossen. **Technisch ist alles synchron
und sauber.** Kein P0 und kein P1 im Alltagsengel-Repo offen.

**Kritische Statusaenderung:** Migration `20261005000000_pilot_send_gate.sql`
ist jetzt **LIVE**. Tabellen `pilot_send_gate` und `pilot_versand_sperre`
existieren in der Produktionsdatenbank (0 Zeilen, RLS aktiv, Constraints korrekt).
Damit ist der letzte technische Blocker fuer die Einmal-Freigabe entfallen.

**Invoice-Log-Widerspruch aufgeklaert:** Die 3 existierenden Rechnungen haben
`sent_at`-Werte aus dem Seed-Script, nicht aus echtem Versand. Alle drei
Protokollquellen (`invoice_email_log`, `notification_delivery_log`,
`billing_audit_trail`) sind leer. Es wurde nie eine echte Rechnung per E-Mail
versendet.

**Alle Sicherheitsschalter sind AUS.** Kein Flag gesetzt, kein automatischer
Versand moeglich, Pilot nur nach expliziter ENV-Freigabe.

---

## Track-Uebersicht

| Track | Beschreibung | Status | Kernbefund |
|---|---|---|---|
| 1 | Source of Truth | **SYNCHRON** | HEAD=Origin=GitHub=Vercel=5019ac4, CI gruen |
| 2 | Pilot Send Gate | **LIVE + VERIFIZIERT** | Tabellen existieren, Constraints korrekt, 0 Zeilen |
| 3 | Invoice Log | **KEIN WIDERSPRUCH** | 3 Seed-Rechnungen, nie echt versendet |
| 4 | Pilot Candidate | **BUSINESS_INPUT_REQUIRED** | 0 unversendete Rechnungen, neuer Klient + Rechnung noetig |
| 5 | Resend Preflight | **VERSANDKETTE KOMPLETT** | 4 Duplikat-Sperren, 14 Pruefpunkte, fail-closed |
| 6 | Versand-Flags | **FAIL-CLOSED** | Alle Flags AUS, Code-Default AUS |
| 7 | CAMT Preparation | **BEREIT (DRY_RUN)** | Object.freeze, Post-Assertion, kein ENV gesetzt |
| 8 | Control Center | **14/14 ABGEDECKT** | Alle Kategorien, P0-Detailliste ergaenzt |
| 9 | Chaos Check | **10/10 ABGEDECKT** | Alle Szenarien fail-closed, UNIQUE-Riegel |
| 10 | Mac Storage | ABGESCHLOSSEN | Bereinigung durchgefuehrt |
| 11 | ChairMatch | BUSINESS_INPUT_REQUIRED | Template erstellt, blockiert Alltagsengel NICHT |
| 12 | DATEV | BUSINESS_INPUT_REQUIRED_DATEV | Format-Validierung gefixt, D1/D2 fehlen |

---

## Neue Befunde (Phase 8.2)

| # | Track | Befund | Schwere | Status |
|---|---|---|---|---|
| C-1 | 7 | Cross-Tenant-Check fehlt im Live-Import-Route (nicht im Pilot/Preflight) | MITTEL | Beobachtung |
| D-3 | 12 | Format-Validierung Beraternummer/Mandantennummer fehlte | MITTEL | **GEFIXT** |
| C-2 | 7 | CdtDbtInd-Fallback auf CRDT bei fehlendem Tag | GERING | Beobachtung |
| C-3 | 7 | Sts-Fallback auf BOOK bei fehlendem Tag | GERING | Beobachtung |
| C-4 | 7 | CAMT-Freigabe ist global (env), nicht pro Datei | GERING | Beobachtung |
| D-1 | 12 | Windows-1252 Header deklariert, UTF-8 tatsaechlich erzeugt | GERING | Offen |
| D-2 | 12 | Kein Audit-Trail bei DATEV-Config-Aenderungen | GERING | Offen |

**Kein P0, kein P1.** C-1 ist MITTEL, wird durch Org-Filter beim Matching mitigiert.

---

## Code-Aenderungen (Phase 8.2)

| Datei | Aenderung |
|---|---|
| `lib/billing/datev/datev-config.ts` | Format-Validierung Beraternummer (1-7 Ziffern) und Mandantennummer (1-5 Ziffern) |
| `lib/pilot/pilot-phasen.ts` | `VersandSperreDetail`-Interface + Detailabfrage fuer P0-Sperren |
| `app/admin/pilot/page.tsx` | P0-Detailtabelle (Schwere, Grund, Rechnung, Zeitstempel) |
| `docs/chairmatch-pricing-template.md` | Validiertes Pricing-Template mit offenen Geschaeftsfragen (C1-C5) |

---

## Sicherheitsstand

| Schalter | Wert | Kommentar |
|---|---|---|
| RECHNUNGSVERSAND_AUTOMATISCH | **NICHT GESETZT** | fail-closed |
| MAHNVERSAND_AUTOMATISCH | **NICHT GESETZT** | fail-closed |
| CAMT_IMPORT_MODE | **NICHT GESETZT** (= DRY_RUN) | fail-closed |
| PILOT_ERSTVERSAND_FREIGEGEBEN | **NICHT GESETZT** | fail-closed |
| FIRST_REAL_INVOICE_APPROVED | **false** (Konstante) | fail-closed |

---

## REAL_ACTIONS_EXECUTED: NONE

Keine echte Rechnung versendet. Keine echte Mahnung gesendet. Keine Bankdatei
importiert. Keine Zahlung gebucht. Keine Lastschrift ausgeloest. Keine Preise
festgelegt. Keine Beraternummer erfunden. Kein Flag aktiviert.

---

## Was sich seit Phase 8.1 geaendert hat

| Aspekt | Phase 8.1 | Phase 8.2 |
|---|---|---|
| Migration 20261005000000 | EXTERN_BLOCKIERT | **LIVE** |
| Invoice-Log-Widerspruch | Ungeklaert | **Aufgeklaert (Seed-Daten)** |
| DATEV Format-Validierung | Fehlte | **Implementiert** |
| Pilot-UI P0-Details | Nur Zaehlung | **Detailtabelle** |
| Chaos-Tests | Nicht unabhaengig geprueft | **10/10 verifiziert** |
| CAMT Live-Route | Nicht geprueft | **C-1 Beobachtung dokumentiert** |

---

## Naechste User-Aktionen

1. **Pilotrechnung erzeugen:** Neuen Klienten mit E-Mail anlegen, Leistung
   erfassen, Rechnung erzeugen und festschreiben.
2. **PILOT_ERSTVERSAND_FREIGEGEBEN=1** in Vercel Production setzen.
3. **Begleiteten Erstversand** ueber `/admin/pilot` durchfuehren.
4. **CAMT:** Echte Bankdatei durch DRY_RUN, bei PILOT_TAUGLICH auf LIVE stellen.
5. **DATEV:** D1/D2 von der Kanzlei holen, im Admin-Panel eintragen.

---

## Detailberichte

- `docs/reports/PHASE8_2_TRACKS_1-6.md` — Source-of-Truth, Migration, Invoice Log, Pilot Candidate, Resend, Versand-Flags
- `docs/reports/PHASE8_2_TRACKS_7-12.md` — CAMT, Control Center, Chaos Check, ChairMatch, DATEV
