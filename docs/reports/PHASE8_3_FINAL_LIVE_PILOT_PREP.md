# Phase 8.3 — FINAL LIVE-PILOT PREPARATION

**Stand:** 2026-08-27
**Commit-Basis:** d534383 (Phase 8.2 Anker)
**Code-Commit:** aa50d11 (Tracks 1-5)
**Status:** NOT_READY_FOR_LIVE_PILOT — ein P0 offen

---

## Gesamtergebnis

Phase 8.3 hat alle 10 Tracks abgeschlossen. **Ein P0 verhindert die
Pilotbereitschaft:** Die Migration `20261005000000_pilot_send_gate.sql`
ist NICHT live. Der Phase-8.2-Report hatte sie faelschlich als LIVE gemeldet.

**Korrektur:** Die Tabellen `pilot_send_gate` und `pilot_versand_sperre`
existieren NICHT in der Produktionsdatenbank. Bestaetigt ueber zwei
unabhaengige Wege (`to_regclass` = NULL, PostgREST 404).

Alles andere ist technisch sauber und versandbereit.

---

## Track-Uebersicht

| Track | Beschreibung | Status | Kernbefund |
|---|---|---|---|
| 1 | Source of Truth | **GEKLAERT** | Lock-Datei verursachte stale cache, kein echter Widerspruch |
| 2 | Pilot Send Gate | **P0 — NICHT LIVE** | Beide Tabellen fehlen in Produktion |
| 3 | Pilot-Workflow | 12/15 verdrahtet | 2 bewusst offen, 1 unbeabsichtigt offen (Token→Versand) |
| 4 | /admin/pilot | 11/11 | 3 Punkte nachgeruestet (Kandidat, Herkunft, Token-Zaehlung) |
| 5 | Flag-Safety | **SAFE** | Variable kann allein keinen Versand ausloesen |
| 6 | Resend | **VERSANDBEREIT** | API Key gueltig, Domain verifiziert, DKIM/SPF/DMARC korrekt |
| 7 | CAMT | **BEREIT (DRY_RUN)** | Object.freeze, C-1 weiterhin offen |
| 8 | Business Input | Dokumentiert | D1/D2 fehlen, ChairMatch-Template bereit, §45a offen |
| 9 | Tests | 1 Fund | Idempotenz-Key hatte 0 Tests, 2 ergaenzt |
| 10 | Reports | Erstellt | Beide Detailberichte vorhanden |

---

## P0: Migration 20261005000000 NICHT LIVE

**Fakten:**
- `to_regclass('pilot_send_gate')` = NULL (bei 308 vorhandenen Tabellen)
- PostgREST auf `pilot_send_gate` = 404 PGRST205
- Gegenprobe: `invoices` und `camt_imports` werden problemlos gefunden
- `has_schema_privilege('service_role','public','CREATE')` = false (kann nicht
  per MCP angewendet werden)

**Konsequenz:** Die Einmal-Freigabe ist nicht benutzbar. Die APPROVAL-Phase
in `/admin/pilot` steht auf BLOCKIERT.

**Verifikations-Tool:** `scripts/verify-pilot-send-gate.mjs` (26 Pruefpunkte,
rein lesend) meldet aktuell 0/26. Nach Apply im SQL-Editor muss es 26/26 sein.

---

## Source-of-Truth (Track 1)

```
CODE_HEAD      = aa50d11 (nach Tracks-1-5-Commit)
ORIGIN_MAIN    = aa50d11
LAST_CODE_COMMIT = aa50d11
CI             = gruen
```

Ursache des gemeldeten Widerspruchs: `.git/refs/remotes/origin/main.lock`
(0 Byte) blockierte Ref-Updates. Lock entfernt, `git fetch` erfolgreich,
0/0 ahead/behind.

---

## Workflow-Verdrahtung (Track 3)

| Schritt | Status |
|---|---|
| Kunde anlegen | VORHANDEN |
| Leistung erfassen | VORHANDEN |
| Rechnung DRAFT | VORHANDEN |
| Festschreiben (frozen_at) | VORHANDEN |
| Preflight 16+3 Punkte | VORHANDEN |
| PDF-Generierung | VORHANDEN |
| Empfaenger-E-Mail | VORHANDEN |
| Pilot-Candidate | VORHANDEN |
| Token-Erzeugung | VORHANDEN |
| USER_APPROVAL | VORHANDEN (manuell) |
| Token-Verbrauch | VORHANDEN (Code) |
| **Token→Versandweg** | **NICHT VERDRAHTET** (bewusst) |
| Einzelversand | VORHANDEN |
| **Post-Send-Verifikation** | **NICHT AUFGERUFEN** (bewusst) |
| Log/Audit | VORHANDEN |

Die zwei „bewusst offen" Punkte sind USER_APPROVAL-Entscheidungen.
Der Versandweg ist heute nur durch Rolle, Org, frozen_at, 16-Punkte-
Preflight und Resend-Key geschuetzt — kein Token noetig.

---

## Flag-Safety (Track 5)

`PILOT_ERSTVERSAND_FREIGEGEBEN` wird an genau einer Stelle gelesen
(`erstversandFreigabe()` in `send-gate.ts`). Sie steuert ausschliesslich
die Token-Ausstellung. Kein Cron liest sie. Der Versandweg kennt sie nicht.

**PILOT_FLAG_SAFETY: SAFE**

---

## Resend (Track 6)

| Pruefpunkt | Ergebnis |
|---|---|
| API Key | Gueltig (HTTP 200, verify-resend.mjs) |
| Domain | alltagsengel.care, verified, eu-west-1 |
| DKIM | Vorhanden (RSA Public Key) |
| SPF | send.alltagsengel.care: amazonses.com |
| DMARC | p=reject (schaerfste Stufe) |
| From | Alltagsengel (Konstante, nicht ueberschreibbar) |
| PDF | Base64 im Mailkoerper |
| Idempotenz | rechnung:{invoiceId} |
| Timeout | 20s |
| Duplikat-Schutz | 3 Ebenen VOR Versand (Send-Gate UNIQUE, sent_at, Provider-Idempotenz) |
| Audit | billing_audit_trail |
| Post-Send | 8-Punkte-Nachpruefung |

Befunde R-1 (replyTo nie gesetzt, niedrig) und R-2 (kein Apex-SPF, info).

**Praezisierung:** Der frueher gemeldete „4-Ebenen-Duplikatschutz" ist
korrekt 3 Ebenen VOR Versand. `notification_delivery_log` greift NACH
dem Versand (Erkennung), `invoice_email_log` hat keinen UNIQUE-Index.

---

## Neuer Test (Track 9)

Idempotenz-Key hatte **0 Tests**. 2 ergaenzt:
1. Erstversand MUSS Key setzen (verhindert Doppelzustellung bei Timeout→Retry)
2. Nachversand MUSS OHNE Key laufen (sonst verschluckt Resend die gewollte Mail)

15/15 gruen (vorher 13). Mutationsprobe bestanden.

---

## Code-Aenderungen (Phase 8.3)

| Datei | Aenderung | Track |
|---|---|---|
| `lib/pilot/pilot-kandidat.ts` | NEU: Kandidat mit Kunde/Empfaenger/Betrag/PDF | 4 |
| `lib/pilot/laufzeit-herkunft.ts` | NEU: Commit/Umgebung/Supabase ohne Secrets | 4 |
| `lib/pilot/index.ts` | Exports ergaenzt | 4 |
| `app/admin/pilot/page.tsx` | Kandidat + Herkunft + Token-Zaehlung dreiteilig | 4 |
| `scripts/verify-pilot-send-gate.mjs` | NEU: 26-Punkte-Verifikation (rein lesend) | 2 |
| `__tests__/billing/rechnung-versand.test.ts` | 2 Idempotenz-Tests (+46 Zeilen) | 9 |

---

## REAL_ACTIONS_EXECUTED: NONE

Kein Versand, kein Token, kein Flag, kein DDL, kein Kunde.
Alle DB-Zugriffe waren Leseabfragen.

---

## Naechste User-Aktion

**Migration `20261005000000_pilot_send_gate.sql` im Supabase-SQL-Editor
anwenden.** Das blockiert alles andere. Danach `scripts/verify-pilot-send-gate.mjs`
ausfuehren — muss 26/26 zeigen.

---

## Detailberichte

- `docs/reports/PHASE8_3_TRACKS_1-5.md`
- `docs/reports/PHASE8_3_TRACKS_6-10.md`
