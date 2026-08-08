# Abschlussbericht: Tabellen-Harmonisierung + Pflegedokumentation End-to-End

**Datum:** 2026-08-08
**Projekt:** Alltagsengel UG — Supabase Production (`nnwyktkqibdjxgimjyuq`)
**Branch:** `staging/expansion-abnahme`
**Auftrag:** Vollständiger Abgleich Code ↔ Production-DB für alle Pflege-Module, Harmonisierung, E2E-Funktionsfähigkeit herstellen.

---

## 1. Gefundene Schema-Abweichungen

### Ergebnis: KEINE Abweichungen

Ein vollständiger Scan aller Code-Referenzen (`app/`, `lib/`, `supabase/`, `scripts/`, `__tests__/`) gegen die 8 Pflege-Tabellen in Production ergab:

| Code-Referenz | Production-Tabelle | Status |
|---------------|-------------------|--------|
| `pflege_anamnesen` | `pflege_anamnesen` | ✅ identisch |
| `pflege_aufnahmen` | `pflege_aufnahmen` | ✅ identisch |
| `pflege_diagnosen` | `pflege_diagnosen` | ✅ identisch |
| `pflege_doku_perioden` | `pflege_doku_perioden` | ✅ identisch |
| `pflege_massnahmen` | `pflege_massnahmen` | ✅ identisch |
| `pflege_massnahmenplaene` | `pflege_massnahmenplaene` | ✅ identisch |
| `pflege_risiken` | `pflege_risiken` | ✅ identisch |
| `pflege_verlauf` | `pflege_verlauf` | ✅ identisch |

Alle Spalten in `lib/pflege/types.ts` stimmen 1:1 mit den Production-Spalten überein. Es gibt keine Ghost-Tabellen, keine falschen Tabellennamen im Code, keine fehlenden Tabellen.

> Die im vorherigen Abschlussbericht (Einsatzplanung) kurzzeitig gemeldeten Gaps (`pflege_assessments`, `personal_abwesenheiten`) waren ein Dokumentationsfehler — korrigiert am 08.08.2026.

---

## 2. Kanonische Struktur

Die kanonische Struktur war bereits vorhanden. Production-Daten haben Vorrang — es wurden keine Tabellen erstellt, umbenannt oder gelöscht.

### 8 Pflege-Tabellen (Production)

| Tabelle | Spalten | FK | Triggers | RLS Policies |
|---------|---------|-----|----------|-------------|
| `pflege_aufnahmen` | 40+ (Stammdaten, Pflegegrad, Kontakte, Vollmachten) | client_id → clients | updated_at | 3 (admin ALL, engel SELECT, org_fence) |
| `pflege_anamnesen` | 45+ (Biografie, Ernährung, Mobilität, Kognition, Schmerz) | client_id → clients | updated_at, locked | 4 (admin ALL, engel SELECT+INSERT, org_fence) |
| `pflege_diagnosen` | 18 (ICD-10, Typ, Schweregrad, betreuungsrelevant) | client_id → clients | updated_at | 3 (admin ALL, engel SELECT, org_fence) |
| `pflege_risiken` | 16 (Typ, Schweregrad, Maßnahmen, Bewertungsdatum) | client_id → clients | updated_at | 3 (admin ALL, engel SELECT, org_fence) |
| `pflege_massnahmenplaene` | 20 (Version, Gültigkeit, Ziele, Status, Freigabe) | client_id → clients, vorgaenger_id → self | updated_at, locked | 4 (admin ALL, engel SELECT, kunde SELECT, org_fence) |
| `pflege_massnahmen` | 20 (Kategorie, Titel, Häufigkeit, Verantwortlich) | plan_id → pflege_massnahmenplaene | updated_at | 3 (admin ALL, engel SELECT, org_fence) |
| `pflege_verlauf` | 23 (Typ, Kategorie, Sichtbarkeit, Vitalzeichen, Dringend) | client_id → clients, anamnese_id, massnahme_id, service_record_id | updated_at, locked | 5 (admin ALL, engel SELECT+INSERT, kunde SELECT, org_fence) |
| `pflege_doku_perioden` | 15 (Typ, Status, Von/Bis, Zusammenfassung, Abschluss) | client_id → clients | updated_at | 2 (admin ALL, org_fence) |

### 2 Pflege-Views

| View | Zweck |
|------|-------|
| `pflege_uebersicht` | Zusammenfassung pro Kunde (Aufnahme, letzte Anamnese, aktiver Plan, offene Risiken) |
| `pflege_risiko_dashboard` | Risiko-Ampel mit Schweregrad-Verteilung |

### Hilfsfunktionen

| Funktion | Zweck |
|----------|-------|
| `current_org_id()` | Liest `app.current_organization_id` aus JWT-Claims — Basis aller org_fence-Policies |

---

## 3. Geänderte Tabellen, Spalten und Routen

### Keine Tabellen- oder Spaltenänderungen

Es wurden keine DB-Migrationen durchgeführt. Production-Schema war bereits korrekt.

### Geänderte Dateien (Commit `38ef665`)

| Datei | Änderung |
|-------|---------|
| `app/api/pflege/anamnesen/route.ts` | **Mandanten-Isolation Fix:** `organizationId` und `erstelltVon` werden aus dem Body herausdestrukturiert; `...felder`-Spread steht VOR Auth-Werten |
| `lib/pflege/api-auth.ts` | **Auth-Guard Fix:** `requirePflegeUser()` gibt 403 bei fehlendem Profil statt stilles Fallback auf `role: 'engel'` |
| `app/engel/pflegedoku/[clientId]/page.tsx` | **Filter Fix:** `.eq('aktiv', true)` auf pflege_diagnosen und pflege_risiken; `.eq('status', 'aktiv')` auf pflege_massnahmenplaene |
| `app/kunde/pflegedoku/page.tsx` | **Filter Fix:** `.eq('status', 'aktiv')` auf pflege_massnahmenplaene |
| `__tests__/security/p0-pflege-mandanten-isolation.test.ts` | **Neu:** 10 statische Security-Regressionstests |

---

## 4. Gefundene Bugs

### 4 kritische Bugs (P0) — alle gefixt

| # | Bug | Schwere | Root Cause | Fix |
|---|-----|---------|-----------|-----|
| 1 | **Mandanten-Leak in anamnesen POST** | P0 | `...felder`-Spread enthielt `organizationId`/`erstelltVon` aus dem Body, da diese Keys nicht herausdestrukturiert wurden. Mit `createAdminClient()` (Service-Role, BYPASSRLS) konnte ein Admin von Org A in Org B schreiben. | Keys aus Body destrukturiert, Spread VOR Auth-Werten |
| 2 | **Auth-Guard: profilloser User = Engel** | P0 | `requirePflegeUser()` fiel bei fehlendem Profil still auf `role: 'engel'` zurück. Ein profilloser Account bekam Engel-Schreibrechte (Verlauf INSERT). | Expliziter `!profile`-Check → 403 |
| 3 | **Engel sieht deaktivierte Diagnosen/Risiken** | P1 | Queries auf pflege_diagnosen/pflege_risiken hatten keinen `aktiv`-Filter. Veraltete/deaktivierte Einträge erschienen als aktuell. | `.eq('aktiv', true)` hinzugefügt |
| 4 | **Kunde sieht Entwurfs-Pläne** | P1 | Query auf pflege_massnahmenplaene (Kunde-Seite) hatte keinen `status`-Filter. Entwürfe oder abgelaufene Pläne konnten als „Ihr Versorgungsplan" angezeigt werden. | `.eq('status', 'aktiv')` hinzugefügt |

### 2 mittlere Bugs (P2) — dokumentiert, nicht gefixt

| # | Bug | Schwere | Beschreibung |
|---|-----|---------|-------------|
| 5 | **Race Condition in freigebenPlan** | P2 | `massnahmenplaene.ts`: Zwei separate DB-Calls (alte Version deaktivieren + neue aktivieren) ohne Transaktion. Bei gleichzeitigem Aufruf könnten zwei Pläne als „aktiv" markiert sein. |
| 6 | **Race Condition in Doku-Perioden** | P2 | `doku-perioden.ts`: `abschliessenPeriode` und `wiedereroeffnenPeriode` nutzen jeweils zwei DB-Calls ohne Transaktion. |

### 2 niedrige Befunde (P3) — dokumentiert, nicht gefixt

| # | Befund | Schwere | Beschreibung |
|---|--------|---------|-------------|
| 7 | **Audit-Trail lückenhaft bei Updates** | P3 | Update-Funktionen (updateDiagnose, updateRisiko etc.) setzen `updated_at` (via Trigger), aber nicht wer die Änderung gemacht hat. Create-Funktionen haben korrekt `erstellt_von`/`autor_id`. |
| 8 | **Keine Defense-in-Depth für Reads** | P3 | Engel/Kunde-Seiten lesen direkt via Supabase Client (nicht über API-Routen). Sicherheit hängt ausschließlich von RLS-Korrektheit ab. |

---

## 5. Security-Ergebnis

### RLS + Mandanten-Isolation

| Prüfpunkt | Ergebnis |
|-----------|----------|
| org_fence (RESTRICTIVE) auf allen 8 Pflege-Tabellen | ✅ `organization_id = current_org_id()` |
| Admin-Policy auf allen 8 Tabellen | ✅ `profiles.role = 'admin'` via `auth.uid()` |
| Engel-SELECT auf 7/8 Tabellen (nicht doku_perioden) | ✅ über aktive `assignments` + `caregivers` |
| Engel-INSERT auf anamnesen + verlauf | ✅ mit WITH CHECK über aktive assignments |
| Kunde-SELECT auf massnahmenplaene + verlauf | ✅ über `clients.user_id = auth.uid()` |
| Diagnosen: Engel sieht nur betreuungsrelevante + aktive | ✅ RLS-Policy filtert |
| Risiken: Engel sieht nur aktive | ✅ RLS-Policy filtert |
| Verlauf: Kunde sieht nur `sichtbarkeit IN ('kunde','alle')` + nicht gesperrt | ✅ |
| Massnahmenplaene: Kunde sieht nur `status = 'aktiv'` | ✅ |
| `organizationId` kommt aus Auth (nicht Client) | ✅ Gefixt in diesem Block |
| `erstelltVon` kommt aus Auth (nicht Client) | ✅ Gefixt in diesem Block |
| Profilloser User wird abgelehnt (nicht als Engel behandelt) | ✅ Gefixt in diesem Block |

### Lock-Triggers

| Tabelle | Trigger | Schutz |
|---------|---------|--------|
| pflege_anamnesen | `trg_locked_anamnese` | Gesperrte Anamnesen nicht editierbar |
| pflege_massnahmenplaene | `trg_locked_plan` | Aktive/abgelaufene Pläne nicht editierbar |
| pflege_verlauf | `trg_locked_verlauf` | Gesperrte Verlaufseinträge nicht editierbar |

---

## 6. E2E-Ergebnis (Pflege-Flow)

Der vollständige Pflege-Dokumentations-Flow ist strukturell funktionsfähig:

| Schritt | Tabelle/Route | API | UI (Admin) | UI (Engel) | UI (Kunde) |
|---------|--------------|-----|-----------|-----------|-----------|
| Aufnahme | pflege_aufnahmen | ✅ | ✅ `/admin/pflege` | — | — |
| Stammdaten | clients | ✅ | ✅ `/admin/kunden` | — | — |
| Anamnese | pflege_anamnesen | ✅ | ✅ | ✅ (readonly) | — |
| Diagnosen | pflege_diagnosen | ✅ | ✅ | ✅ (nur aktiv+betreuungsrelevant) | — |
| Risiken | pflege_risiken | ✅ | ✅ | ✅ (nur aktiv) | — |
| Maßnahmenplan | pflege_massnahmenplaene | ✅ | ✅ | ✅ (nur aktiv/abgelaufen) | ✅ (nur aktiv) |
| Maßnahmen | pflege_massnahmen | ✅ | ✅ | ✅ (nur des aktiven Plans) | ✅ |
| Verlauf | pflege_verlauf | ✅ | ✅ | ✅ (INSERT + SELECT) | ✅ (nur sichtbar+nicht gesperrt) |
| Doku-Perioden | pflege_doku_perioden | ✅ | ✅ | — | — |

**Einschränkung:** Kein Click-Through-Test gegen Vercel-Preview durchgeführt (erfordert manuellen Browser-Test). Die E2E-Validierung basiert auf: Schema-Abgleich, Code-Review, RLS-Policy-Analyse, statischen Security-Tests und Production-Smoke-Tests.

---

## 7. Test-Zahlen

| Kategorie | Ergebnis |
|-----------|----------|
| TypeScript (`tsc --noEmit`) | **0 Fehler** |
| Vitest gesamt | **832 passed**, 0 failed |
| Security-Regressionstests (Pflege P0) | **10 passed**, 0 failed |
| Security-Regressionstests (Personal P0) | **6 passed**, 0 failed |
| Production Smoke-Tests (SQL) | **7/7 bestanden** |
| Secret-Scan (`lint:forbidden`) | clean |

### Production Smoke-Test Details

| Smoke-Test | Ergebnis |
|------------|----------|
| 8/8 Pflege-Tabellen existieren + RLS aktiv | ✅ (2-5 Policies je Tabelle) |
| 27 RLS-Policies korrekt (org_fence RESTRICTIVE auf allen) | ✅ |
| Alle 8 Pflege-Tabellen = 0 Zeilen (Baseline clean) | ✅ |
| 12 Foreign Keys korrekt | ✅ |
| 2 Pflege-Views existieren | ✅ |
| `current_org_id()` Funktion existiert | ✅ |
| 11 Triggers aktiv (8× updated_at + 3× lock) | ✅ |
| Stammdaten-Baseline | ✅ profiles=59, clients=4, caregivers=2, organizations=3 |

---

## 8. Datenintegrität vorher/nachher

| Prüfpunkt | Vorher | Nachher |
|-----------|--------|---------|
| profiles | 59 | 59 |
| clients | 4 | 4 |
| caregivers | 2 | 2 |
| organizations | 3 | 3 |
| organization_members | 3 | 3 |
| pflege_* (alle 8 Tabellen) | 0 | 0 |
| Demo-/Testdaten eingefügt? | Nein | Nein |
| Tabellen erstellt/gelöscht/umbenannt? | — | Nein |
| Spalten hinzugefügt/entfernt? | — | Nein |
| RLS-Policies geändert? | — | Nein |

---

## 9. Commits

| Hash | Beschreibung |
|------|-------------|
| `38ef665` | fix: Pflege Mandanten-Isolation + Auth-Guard + Filter + Security-Tests |

Vorherige Commits auf diesem Branch (bereits abgeschlossen, nicht wiederholt):

| Hash | Beschreibung |
|------|-------------|
| `8c7ee94` | docs: Abschlussbericht Einsatzplanung + Personal Sicherheitsaudit |
| `2a6703c` | fix: Einsatzplanung + Personal: P0 Auth-Blocker + Mandanten-Isolation |
| `1547188` | fix: P0 Auth-Bug in ops + akten |

---

## 10. PRODUCTION-GO / NO-GO

| Kriterium | Status |
|-----------|--------|
| Schema-Abgleich Code ↔ DB: 0 Abweichungen | ✅ |
| Kanonische Struktur: keine Doppelstrukturen | ✅ |
| Mandanten-Isolation: organizationId aus Auth | ✅ |
| Auth-Guard: profilloser User → 403 | ✅ |
| Sichtbarkeitsfilter: aktiv-Filter auf Engel+Kunde | ✅ |
| RLS org_fence: RESTRICTIVE auf allen 8 Tabellen | ✅ |
| Foreign Keys: 12/12 korrekt | ✅ |
| Lock-Triggers: 3/3 aktiv | ✅ |
| TypeScript: 0 Fehler | ✅ |
| Tests: 832 + 16 Security = 0 failed | ✅ |
| Production Smoke-Tests: 7/7 bestanden | ✅ |
| Datenintegrität: unverändert | ✅ |
| Keine Demo-Daten eingefügt | ✅ |
| Keine Tabellen erstellt/gelöscht | ✅ |

### **PRODUCTION-GO: ✅ ERTEILT**

Die Pflegedokumentation ist schema-konsistent, sicherheitsgehärtet und strukturell Ende-zu-Ende funktionsfähig. Die 4 kritischen Bugs (Mandanten-Leak, Auth-Guard-Bypass, fehlende Sichtbarkeitsfilter) sind behoben und durch 10 statische Regressionstests abgesichert. Es wurden keine Tabellen erstellt, umbenannt oder gelöscht — die bestehende Production-Struktur war bereits korrekt.

**Offene Punkte (kein Blocker):**
- P2: Race Conditions in freigebenPlan und Doku-Perioden (Transaktionen fehlen)
- P3: Audit-Trail bei Updates (wer hat geändert?)
- P3: Defense-in-Depth für Reads (Engel/Kunde-Seiten → nur RLS, keine API-Layer-Prüfung)
- Manueller Click-Through-Test der Admin/Engel/Kunde-UIs im Browser

---

## 11. Empfehlung für den nächsten Softwareblock

### Empfehlung: **DTA/Datenaustausch + Abrechnung operativ testen**

**Begründung:**
1. Pflegedokumentation ist jetzt das am besten abgesicherte Modul — Schema korrekt, Auth gefixt, Sichtbarkeitsfilter aktiv, 16 Security-Tests, Production verifiziert.
2. Der nächste geschäftskritische Schritt ist die Kassenabrechnung: ohne funktionierenden Datenaustausch (§302 SGB V) keine Vergütung.
3. DTA-Modul und Abrechnungs-Code existieren bereits, wurden aber noch nie mit echten Kassen-Daten getestet.
4. IK-Nummer (460629986) ist seit 16.07.2026 gültig — die technische Voraussetzung für echte Kassenkommunikation ist gegeben.

**Scope:**
- DTA-Tabellen + Code Schema-Abgleich (analog zu diesem Block)
- DAKOTA-Adapter verifizieren
- Abrechnungsmodul E2E mit Test-Datensatz
- §302-Nachrichtenformat validieren
- Security-Audit für Abrechnungsdaten (besonders sensitiv)

---

*Erstellt: 2026-08-08 — Alltagsengel Softwareentwicklung*
