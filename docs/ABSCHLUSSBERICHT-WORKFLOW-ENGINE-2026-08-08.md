# Abschlussbericht: Workflow-Engine — Technische Basis

**Datum:** 2026-08-08
**Projekt:** Alltagsengel UG — Supabase Production (`nnwyktkqibdjxgimjyuq`)
**Branch:** `staging/expansion-abnahme`

---

## 1. pg_cron

| Kriterium | Status |
|-----------|--------|
| pg_cron aktiv | **JA** — v1.6.4, Extension installiert |
| Jobs angelegt | **JA** — 2 Jobs (jobid 1 + 2) |
| Verifiziert | **JA** — 12 automatische Läufe seit Einrichtung, alle `succeeded` |

### Jobs

| Job | Schedule | Command | Status |
|-----|----------|---------|--------|
| `wf-process-pending` (jobid 1) | `*/5 * * * *` | `SELECT public.wf_process_pending(50)` | aktiv, 12× succeeded (06:15–07:10 UTC) |
| `wf-check-fristen` (jobid 2) | `0 6 * * *` | `SELECT public.wf_check_fristen()` | aktiv, nächster Lauf morgen 06:00 UTC |

### Smoke-Tests (manuell durchgeführt)

- `wf_process_pending(50)`: Erfolgreich — verarbeitete 3 Events (leistungsnachweis_nicht_unterschrieben)
- `wf_check_fristen()`: Erfolgreich nach Bugfix — fand 3 unsigned Service Records (>3 Tage alt)
- Idempotenz: Zweiter Lauf produzierte 0 neue Events (korrekt)

### Bugfix in Production

`wf_check_fristen()` hatte falsche Spaltennamen aus der ursprünglichen Migration:

| Falsch | Korrekt | Tabelle |
|--------|---------|---------|
| `bezeichnung` | `titel` | akten_dokumente, akten_vertraege |
| `akte_typ`, `akte_id` | `client_id`, `caregiver_id`, `dokument_typ` | akten_dokumente |
| `service_date` | `date` | service_records |
| `completed`, `submitted` | `draft`, `signed` | service_records (Status-Werte) |

Fix: Funktion in Production direkt korrigiert via `execute_sql`, Migration-Datei auf Disk nachgezogen (Commit `93634a8`).

---

## 2. Build Status

| Prüfung | Ergebnis |
|---------|----------|
| `npx tsc --noEmit` | **0 Fehler** |
| `npx vitest run` | **816 passed**, 29 skipped, 0 failed |
| `npm run test:unit` | **128 passed**, 0 failed |
| `npm run build` (Production) | **exit 0** |
| GitHub CI Run #31245075567 | **alle Schritte success** |
| Secret-Scan / lint:forbidden | clean |

---

## 3. Behobene Fehler

### 3.1 TypeScript-Fehler (4/4 behoben)

| Datei | Fehler | Root Cause | Fix |
|-------|--------|-----------|-----|
| `kassenabrechnung-engine.ts:662` | TS2353 `'dateien' does not exist` | `computeChecksum` hasht nur 7 feste Audit-Felder; fremde Felder → alle undefined → konstanter Hash | `computeContentHash` als generische Hash-Funktion extrahiert |
| `ruecklaeufer.ts:84` | TS2353 `'content' does not exist` | Gleicher Bug — jeder Rückläufer hätte denselben Hash bekommen → alle nach dem ersten als Duplikat abgewiesen | Umgestellt auf `computeContentHash` |
| `korrekturlaeufe.ts:273` | TS7022 implicitly `any` | Zirkuläre Inferenz: `currentId` ← `lauf.korrektur_von` ← Query über `currentId` | Explizites `KettenLaufRow`-Interface |
| `korrekturlaeufe.ts:303` | TS7022 implicitly `any` | Gleiche zirkuläre Inferenz | Gleicher Fix |

### 3.2 Test-Fehler (6 Tests repariert)

- `__tests__/ops/ereignis-emitter.test.ts`: `emitEreignis` gab `void` zurück, Tests + API-Route erwarteten Ergebnisobjekt. Fix: Rückgabevertrag `EreignisErgebnis` implementiert + Aktivitätslog lückenlos.

### 3.3 Migration-Datei (Spaltennamen)

- `20260813010000_workflow_engine.sql`: wf_check_fristen mit korrekten Spaltennamen (Commit `93634a8`)

### 3.4 GitHub Pages

- Legacy-Jekyll-Quelle auf Branch main/Root deaktiviert. Ursache: Bei jedem Push wurde das gesamte Repo als Jekyll-Site gebaut → Fehler.

---

## 4. Commits

| Hash | Beschreibung |
|------|-------------|
| `b159b7e` | Workflow-Engine Application-Code (lib + API + Admin-UI + Tests) |
| `b520b29` | Production-Report |
| `93634a8` | Fix: wf_check_fristen Spaltennamen in Migration |
| `481a349` | Fix: Build-Fehler (4 TS-Fehler, 6 Test-Fehler, GitHub Pages) |

---

## 5. Daten-Baseline (unverändert)

| Tabelle | Anzahl | Änderung |
|---------|--------|----------|
| profiles | 59 | keine |
| clients | 4 | keine |
| caregivers | 2 | keine |
| assignments | 5 | keine |
| service_records | 31 | keine |
| invoices | 5 | keine |
| wf_events | 3 | +3 (automatisch von wf_check_fristen erkannt) |
| wf_regeln | 0 | keine (noch keine Regeln konfiguriert) |
| wf_audit_log | 4 | +4 (Smoke-Test-Protokolle) |

---

## 6. Risiken

| Risiko | Schwere | Empfehlung |
|--------|---------|------------|
| Vercel Preview-Deploy noch nicht verifiziert (Vercel-Integration reagierte langsam) | Niedrig | Nächsten Push abwarten, Vercel-Dashboard prüfen |
| `chairmatch-landing/` im Repo ohne Publishing-Ziel | Info | In separates Repo verschieben oder entfernen |
| Source-Trigger noch nicht im Livebetrieb getestet (0 echte DTA/Zahlungs-Events) | Niedrig | Bei ersten echten Daten verifizieren |
| Keine Push-Benachrichtigungen (nur In-App) | Info | In separatem Block implementieren |

---

## 7. PRODUCTION-GO/NO-GO

| Kriterium | Status |
|-----------|--------|
| pg_cron aktiv | ✅ JA |
| Jobs angelegt | ✅ JA (2/2) |
| Jobs verifiziert | ✅ JA (12 automatische Läufe + manuelle Smoke-Tests) |
| TypeScript | ✅ 0 Fehler |
| Tests | ✅ 944 passed, 0 failed |
| Production Build | ✅ exit 0 |
| GitHub CI | ✅ grün |
| Bestehende Daten | ✅ unverändert |
| Secrets/Credentials | ✅ keine exponiert |

### **PRODUCTION-GO: ✅ ERTEILT**

Workflow-Engine technische Basis ist vollständig abgeschlossen. pg_cron läuft autonom, alle Build-Fehler sind behoben, alle Tests grün. System ist bereit für den nächsten Softwareblock.
