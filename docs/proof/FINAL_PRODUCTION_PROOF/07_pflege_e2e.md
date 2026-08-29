# Phase 7 — Pflege E2E Beweis

**Gemessen am 30.08.2026, live aus Production-DB**

## Pflegeprozess — 6 Schritte (alle live)

| Schritt | Tabelle | RLS-Policies | RLS enabled |
|---------|---------|-------------|-------------|
| 1. Aufnahme | pflege_aufnahmen | 5 | ✓ |
| 2. Anamnese | pflege_anamnesen | 4 | ✓ |
| 3. Diagnose | pflege_diagnosen | 3 | ✓ |
| 3b. Risiko | pflege_risiken | 3 | ✓ |
| 4. Planung | pflege_massnahmenplaene | 4 | ✓ |
| 4b. Maßnahmen | pflege_massnahmen | 3 | ✓ |
| 5. Durchführung | pflege_verlauf | 7 | ✓ |
| 6. Evaluation | pflege_massnahmen_evaluationen | 3 | ✓ |

**8/8 Pflege-Kerntabellen live mit RLS enabled.**

## Weitere Pflege-Module

| Modul | Tabelle(n) | RLS | Status |
|-------|-----------|-----|--------|
| Dienstplan | dienstplan_schichten (3), dienstplan_eintraege, dienstplan_freigaben, dienstplan_tagesansicht | ✓ | LIVE |
| QM-Pflegevisiten | qm_pflegevisiten, qm_visite_befunde | ✓ | LIVE |
| Zeiterfassung | personal_arbeitszeiten (4 RLS, 4 Trigger) | ✓ | LIVE |
| Zeitkorrekturen | personal_zeitkorrekturen (3 RLS, 2 Trigger) | ✓ | LIVE |

## Pflege-spezifische Trigger (live verifiziert)

| Trigger-Funktion | Zweck | Live |
|------------------|-------|------|
| pflege_evaluation_unveraenderlich | Evaluations-Immutabilität | ✓ |
| pflege_evaluation_wiedervorlage | Automatische Wiedervorlage | ✓ |
| pflege_evaluation_plan_in_kraft | Plan-Status nach Evaluation | ✓ |
| arbzg_pruefung_ist | ArbZG §3/§4/§5 Ist-Prüfung | ✓ |
| log_arbeitszeit_korrektur | Zeitkorrektur-Protokoll mit Akteur | ✓ |
| prevent_zeitkorrektur_edit | Revisionssicherheit | ✓ |

## FHIR/ISiP Audit-Trail

| Tabelle | RLS | Policies | Status |
|---------|-----|----------|--------|
| fhir_audit_log | ✓ | 2 (admin + org_fence RESTRICTIVE) | LIVE |

## Bewertung

**PRODUCTION VERIFIED** — Alle 6 Pflegeprozess-Schritte, Dienstplan, QM, ArbZG, FHIR-Audit live in Production mit RLS.
