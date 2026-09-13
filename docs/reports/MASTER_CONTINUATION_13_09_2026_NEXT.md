# MASTER-FORTSETZUNG — Abschlussreport

**Datum:** 13. September 2026
**Erstellt von:** Alltagsengel — Automatisierter Agenten-Report
**Umfang:** 10 Phasen (Phase 0–9), parallel abgearbeitet

---

## Inhaltsverzeichnis

- [A. Zusammenfassung](#a-zusammenfassung)
- [B. Phase 0 — Security P0](#b-phase-0--security-p0)
- [C. Phase 1 — Preis-SOT 2026](#c-phase-1--preis-sot-2026)
- [D. Phase 2 — Telefonleitfaden](#d-phase-2--telefonleitfaden)
- [E. Phase 3 — Anerkennungsmappe](#e-phase-3--anerkennungsmappe)
- [F. Phase 4 — ATS Produktionsreife](#f-phase-4--ats-produktionsreife)
- [G. Phase 5 — Customer Priority Engine](#g-phase-5--customer-priority-engine)
- [H. Phase 6 — ChairmatchBooking](#h-phase-6--chairmatch-booking)
- [I. Phase 7 — Efy Care](#i-phase-7--efy-care)
- [J. Phase 8 — CM Key Rotation](#j-phase-8--cm-key-rotation)
- [K. Phase 9 — CI/Security/Observability](#k-phase-9--cisecurityobservability)
- [L. Offene Punkte (Blocking)](#l-offene-punkte-blocking)
- [M. Offene Punkte (Non-Blocking)](#m-offene-punkte-non-blocking)
- [N. Nächste Schritte](#n-nächste-schritte)

---

## A. Zusammenfassung

Alle 10 Phasen der MASTER-FORTSETZUNG vom 13.09.2026 wurden parallel abgearbeitet. Dieser Report dokumentiert den Abschlussstatus jeder Phase, identifiziert blockierende und nicht-blockierende offene Punkte und definiert die nächsten Schritte.

---

## B. Phase 0 — Security P0

| Punkt | Status |
|---|---|
| PII aus Git-Index entfernt | ✅ Commit `90cebb74` |
| 12 sensible PDFs per `git rm --cached` entfernt | ✅ |
| `.gitignore` erweitert | ✅ |
| raw.githubusercontent.com URLs auf `main` | → 404 (alte SHAs → weiter 200, History-Rewrite offen) |
| `HISTORY_CLEANUP_PLAN.md` erstellt | ✅ |
| Force Push durchgeführt | ❌ NEIN (wie beauftragt) |

**Bewertung:** Index bereinigt, aber alte Commits enthalten weiterhin PII. Ein vollständiger History-Cleanup (BFG/git filter-repo) steht aus und erfordert Yusufs Freigabe.

---

## C. Phase 1 — Preis-SOT 2026

| Parameter | Wert | Quelle |
|---|---|---|
| PfluV Hessen — Betreuung | **30 €/Std** | GVBl. 2025 Nr. 95 Art. 5 |
| PfluV Hessen — Hauswirtschaft | **25 €/Std** | GVBl. 2025 Nr. 95 Art. 5 |
| Entlastungsbetrag | **131 €/Monat** | SGB XI |

- GVBl. 2025 Nr. 95 Artikel 5 verlängert NUR die Geltungsdauer (§ 14 Satz 2, 2025→2026) — KEINE Satzänderung.
- pflege-in-hessen.de (offizielles Portal, Copyright 2018–2026) bestätigt dieselben Sätze.
- **Status: `DOCUMENT_VERIFIED_CURRENT`**

---

## D. Phase 2 — Telefonleitfaden

- `GENEHMIGUNG_CALL_PACKAGE_13_09_2026.md` erstellt
- 5-Fragen-Leitfaden für Telefonat mit Frau Krause
- Notizfelder und Checkliste enthalten
- **Status:** Bereit für Yusufs Anruf

---

## E. Phase 3 — Anerkennungsmappe

- `ANERKENNUNGSMAPPE_MATRIX_13_09_2026.md` erstellt
- **27 Dokumente erfasst:**

| Status | Anzahl |
|---|---|
| ✅ COMPLETE | 6 |
| 🔄 UPDATE | 8 |
| ⚠️ REVIEW | 3 |
| ❌ MISSING | 1 (Gewerbeanmeldung) |
| ❓ UNKNOWN | 9 |

- **5 kritische Blockierer identifiziert**

---

## F. Phase 4 — ATS Produktionsreife

- 15 optionale Felder in `bewerbung_daten.ats` (jsonb)
- 4 Felder referenzieren bestehende Formularwerte statt zu duplizieren
- Migration `20261106000000` geschrieben, **NICHT angewendet**
- 36 Tests grün
- `darfAlsVerifiziertGelten()` = IMMER `false` bestätigt
- ⚠️ Commit unter falscher Nachricht (`4df676cf`) wegen parallelem `deploy.sh`-Race

---

## G. Phase 5 — Customer Priority Engine

- `lib/leads/alterung.ts`: Kontaktalter in Tagen berechnet
- **Eskalationsstufen:** >7d erhöht, >14d hoch, >30d kritisch
- Manuelles Überstimmen möglich, aber nicht verbergend
- In `/admin/posteingang` verdrahtet (kein toter Code)
- **Tests:** 227 Leads-Tests, Gesamt 10.547 vitest + 2.770 node:test
- Commit `fcfde9df`

---

## H. Phase 6 — Chairmatch Booking

- `docs/BOOKING_FUNNEL.md` erstellt:
  - 9 API-Routen, 8 Module, 10 Oberflächen, 11 Tabellen
  - Flow Suche→Zahlung dokumentiert mit 4 Riegeln
- `/api/availability` degradiert sauber (200 mit benanntem Grund)
- **7 unangewandte Migrationen identifiziert** (nicht 6)
- `CHAIRMATCH_MIGRATION_APPLY_GUIDE.md` erstellt

---

## I. Phase 7 — Efy Care

- 53 Migrationen inventarisiert, 52 mit Vorbedingungen gemessen
- `LEISTUNGSNACHWEIS_OPTIONEN.md`: Option A teilweise **SCHON GEBAUT**
  - `features/abrechnung/leistungsnachweis.ts` (17 KB)
- 30 €/25 € als Höchstsätze bereits im Schema, `billing_rates` separat
- 131 € korrekt als 13100 Cent im Schema
- Build grün, 1 TODO im Repo
- Commit `7f7430c`

---

## J. Phase 8 — CM Key Rotation

- `CHAIRMATCH_KEY_ROTATION_RUNBOOK.md`: 9-Schritte-Verfahren erstellt

### ⚠️ KRITISCHE KORREKTUR

Der fremde Key (`vlrviyrgggzhayepfmop`) ist **NICHT rotiert!**

| Test | Ergebnis |
|---|---|
| `/auth/v1/health` | 200 ← Key noch gültig |
| `/rest/v1/` | 401 auch für gültige Keys → taugt NICHT als Test |

**`KEY_ROTATION_REQUIRED` bleibt offen.**

Weitere Befunde:
- Noch im Code: `index_legacy.html`, `next.config.ts` remotePatterns
- Inventur: 40 Variablen gelesen, `.env.example` getrackt
- `NEXTAUTH_SECRET`-Rotation meldet alle Nutzer ab (Warnung)
- `CONSENT_IP_SALT` darf nicht ohne Not rotiert werden
- Keine Schlüsselwerte in Dokumenten

---

## K. Phase 9 — CI/Security/Observability

- `CI_SECURITY_OBSERVABILITY_PLAN_13_09_2026.md` erstellt (Commit `4df676cf`)
- **AE:** Starke Guards (`precommit-guard`, `deploy.sh` 7-Stufen), 5 GitHub Actions
- **CM + EC:** CI fehlt komplett → Vorlagen im Dokument
- 8 Security-Prüfpunkte inkl. OWASP-Mapping
- **20 priorisierte Empfehlungen** (P0→P3)
- **P0:** Repos → PRIVATE, fremden Key entfernen

---

## L. Offene Punkte (Blocking)

| # | Punkt | Verantwortlich |
|---|---|---|
| 1 | **KEY_ROTATION_REQUIRED:** Fremder CM-Key noch gültig | Yusuf — neuen Key im Supabase Dashboard generieren |
| 2 | **REPOS → PRIVATE:** AE + CM sind PUBLIC | Yusuf — GitHub Settings umstellen |
| 3 | **HISTORY CLEANUP:** Alte Commits enthalten noch PII | Yusuf — git filter-repo/BFG mit Backup (Freigabe nötig) |
| 4 | **MIGRATIONEN:** AE (1), CM (7), EC (0 neue) | REPORT_ONLY — nicht angewendet |

---

## M. Offene Punkte (Non-Blocking)

1. Phase 4 Commit-Nachricht falsch (parallel race, History-Rewrite gesperrt)
2. Gewerbeanmeldung fehlt in Anerkennungsmappe
3. Betriebshaftpflicht-Ablaufdatum prüfen
4. Erhebungsbogen-Ausfüllstatus UNKNOWN

---

## N. Nächste Schritte

| # | Aktion | Wer |
|---|---|---|
| 1 | Frau Krause anrufen (Leitfaden bereit) | Yusuf |
| 2 | GitHub → Settings → Visibility → **PRIVATE** für beide Repos | Yusuf |
| 3 | CM Supabase Dashboard → neuen Key generieren | Yusuf |
| 4 | Entscheidung: History Cleanup (BFG) durchführen? (Backup zuerst) | Yusuf |
| 5 | Entscheidung: Migrationen anwenden? (Reihenfolge dokumentiert) | Yusuf |
| 6 | Entscheidung: Leistungsnachweis Option A/B/C (A teilweise schon gebaut) | Yusuf |

---

*Erstellt am 13.09.2026 — Alltagsengel UG — Automatisierter Agenten-Report*
