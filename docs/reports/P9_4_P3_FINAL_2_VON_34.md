# P9.4 — P3 Security Audit: Letzte 2/34 Punkte

**Datum:** 2026-09-05
**Auditor:** Claude (P9.4)
**Ergebnis:** 34/34 bewertet — keine offenen Punkte

---

## P3-33: storage_mimetype_ok bei leerem MIME-Type

| Feld | Inhalt |
|---|---|
| **Punkt** | `storage_mimetype_ok()` gibt `true` zurück bei fehlendem/leerem MIME-Type |
| **Projekt** | efy (nsfbwhpjesmathsrqkfi) — AE und CM haben diese Funktion nicht |
| **Analyse** | Die Funktion ist SECURITY DEFINER und wird in 6 RLS-Policies verwendet (leistungsnachweise, rechnungspakete, qualitaetsmanagement — je INSERT und UPDATE). Bei `p_metadata IS NULL`, fehlendem `mimetype`-Key, leerem String oder `null`-Wert gab sie `true` zurück — fail-open. |
| **Risikobewertung** | **Praktisch niedrig, architektonisch relevant.** Supabase Storage setzt bei jedem Upload automatisch einen MIME-Type (Fallback: `application/octet-stream`). Zusätzlich haben alle 3 betroffenen Buckets `allowed_mime_types` gesetzt, die VOR der RLS-Policy greifen. Die Funktion ist Defense-in-Depth — aber Defense-in-Depth muss fail-closed sein, sonst ist sie wirkungslos. |
| **Entscheidung** | **FIX: Fail-Closed implementiert.** `true` → `false` bei leerem/fehlendem MIME-Type. |
| **Test (VOR Fix)** | SQL-Beweis auf Produktion (efy): |

```
null metadata     → true  (BYPASS)
empty mimetype    → true  (BYPASS)
missing key       → true  (BYPASS)
null value        → true  (BYPASS)
valid pdf         → true  (korrekt)
invalid exe       → false (korrekt)
```

| **Test (NACH Fix)** | SQL-Beweis auf Produktion (efy): |

```
null metadata     → false (BLOCKIERT ✅)
empty mimetype    → false (BLOCKIERT ✅)
missing key       → false (BLOCKIERT ✅)
null value        → false (BLOCKIERT ✅)
valid pdf         → true  (korrekt ✅)
invalid exe       → false (korrekt ✅)
valid jpeg        → true  (korrekt ✅)
```

| **Bestandsdaten** | Keine Objekte in den 3 betroffenen Buckets ohne MIME-Type → kein Bruchrisiko |
| **Beweis** | Migration `20261029000000_storage_mimetype_fail_closed.sql` + Rollback. Direkt auf efy-Produktion angewendet und verifiziert. Commit `974ac74c`. |
| **Status** | ✅ VERIFIZIERT — gefixt und getestet |

---

## P3-34: FIRST_REAL_INVOICE_APPROVED Hardcoded-Flag

| Feld | Inhalt |
|---|---|
| **Punkt** | `FIRST_REAL_INVOICE_APPROVED = false` ist hardcoded in `send-gate.ts:138`, kein DB-/Konfigurations-Flag |
| **Analyse** | Die Konstante ist **bewusst** hardcoded. Sie steuert die Einmal-Freigabe für den ersten echten Rechnungsversand. Die Architektur hat drei Schichten: (1) Kompilier-Konstante `FIRST_REAL_INVOICE_APPROVED` — Änderung erfordert Commit + Code-Review, (2) Umgebungsvariable `PILOT_ERSTVERSAND_FREIGEGEBEN` — Runtime-Toggle ohne Deployment, streng: nur exakter Wert `"1"` gibt frei, (3) DB-Tabelle `pilot_send_gate` — Einmal-Token mit UNIQUE-Constraints gegen Doppelversand. |
| **Warum KEIN DB-Flag** | Ein DB-Flag wäre **schwächer**: änderbar von jedem mit DB-Zugang, ohne Diff im Code-Review, ohne Audit-Trail im Git-Log. Die Konstante erzwingt einen Commit — das ist die stärkste Form der Nachvollziehbarkeit. Die Env-Variable deckt den Runtime-Fall ab. |
| **Tests** | `erstversand-flag-safety.test.ts` (179 Zeilen) sichert ab: Konstante = false, nur `"1"` gibt frei (nicht "true"/"yes"/"on"), nur eine Auswertungsstelle im Code, kein Cron liest die Variable, Versandweg fragt `pilotGatePflicht()` statt direkt die Env-Variable, keine Vermischung mit den Versand-Schaltern `RECHNUNGSVERSAND_AUTOMATISCH` / `MAHNVERSAND_AUTOMATISCH`. |
| **Entscheidung** | **Bewusst akzeptiert — kein Fix nötig.** Hardcoded ist hier stärker als ein DB-Flag. Die Env-Variable bietet Runtime-Flexibilität. Die Test-Suite verhindert architektonische Erosion. |
| **Beweis** | Code-Review von `send-gate.ts` (778 Zeilen), `erstversand-flag-safety.test.ts` (179 Zeilen), Env-Registrierung in `register.ts`. Drei Sicherheitsschichten verifiziert. |
| **Status** | ✅ VERIFIZIERT — bewusst akzeptiert mit technischer Begründung |

---

## Zusammenfassung

| # | Punkt | Entscheidung | Status |
|---|---|---|---|
| P3-33 | storage_mimetype_ok fail-open | **Gefixt** → fail-closed | ✅ VERIFIZIERT |
| P3-34 | FIRST_REAL_INVOICE_APPROVED hardcoded | **Bewusst akzeptiert** — stärker als DB-Flag | ✅ VERIFIZIERT |

**P3 Security Audit: 34/34 bewertet. Keine unbekannten Punkte.**
