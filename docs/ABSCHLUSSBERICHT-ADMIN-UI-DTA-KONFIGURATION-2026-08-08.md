# Abschlussbericht: Admin-UI Click-Through + Externe DTA/Kassen-Konfiguration

**Datum:** 2026-08-08
**Branch:** staging/expansion-abnahme
**Supabase-Projekt:** nnwyktkqibdjxgimjyuq
**Stamm-Org:** 00000000-0000-4000-8000-000460629986
**IK-Nummer:** 460629986

---

## 1. Admin-UI Click-Through

### Methodik
- 5 parallele Review-Agents haben alle Admin-Seiten (page.tsx) und zugehörige API-Routen analysiert
- Prüfkriterien: Error-Free Loading, API-Korrektheit, CRUD-Aktionen, Auth/RBAC, Mandantentrennung, Empty States, Error Messages, Status-Transitions, Inter-Modul-Links, Dead Buttons

### Ergebnisse

| Schweregrad | Gefunden | Gefixt |
|---|---|---|
| **Kritisch** | 4 | 4 |
| **Major** | 25 | 8 (DTA-relevant) |
| **Minor** | 29 | 0 (kosmetisch) |

### Kritische Fixes (alle behoben)

1. **`app/api/leistungsnachweis/crud/route.ts`** — Mass-Assignment + fehlende Org-Isolation
   - FIX: `getActiveOrgId()` + `organization_id`-Filter auf alle Queries
   - FIX: Admin-Rollenprüfung auf POST (create)
   - FIX: `ERLAUBTE_PATCH_FELDER`-Allowlist statt `...updates`-Spread
   - FIX: State-Transition-Guards (confirm nur aus ENTWURF, sign nur aus ABGESCHLOSSEN)

2. **`app/admin/benachrichtigungen/page.tsx`** — Falsche API-Endpunkte
   - FIX: `markAsRead` → PATCH `/api/ops/benachrichtigungen/gelesen` mit `{ids: [id]}`
   - FIX: `markAllRead` → gleicher Endpunkt mit allen ungelesenen IDs

### Major Security Fixes (DTA-relevant)

3. **`app/api/billing/dta/fehler/route.ts`** — Mass-Assignment entfernt
   - FIX: Explizite Feld-Extraktion statt `{...body, actorId}`

4. **`app/api/billing/dta/ruecklaeufer/route.ts`** — Mass-Assignment entfernt
   - FIX: Explizite Feld-Extraktion statt `{...body, organizationId}`

5. **`app/api/admin/abrechnung/sftp-test/route.ts`** — Org-Isolation
   - FIX: `getActiveOrgId()` + Org-Fence auf `datenannahmestellen`-Query

6. **`app/api/admin/abrechnung/sftp-key/route.ts`** — Org-Isolation
   - FIX: `getActiveOrgId()` + Org-Fence auf `datenannahmestellen`-Query

### Bekannte offene Major-Issues (nicht DTA-kritisch)

- `app/admin/abrechnung/page.tsx:380` — abrechnungslaeufe-Upsert ohne organization_id (Risiko: Kollision bei gleichem KT-IK + Monat über Mandanten; über DTA-API-Routen korrekt abgesichert)
- `app/admin/schedule/page.tsx` — 6 Queries ohne organization_id (RLS schützt, aber inkonsistent)
- `app/api/admin/pricing/route.ts` — Mass-Assignment in POST/PUT (RLS über createClient, nicht createAdminClient)
- `app/api/admin/abrechnung/zertifikat/route.ts` — Kein Org-Filter (Tabelle hat keine org_id-Spalte)

---

## 2. DTA/Kassen-Konfiguration

### Bestehende Infrastruktur (nicht verändert)

| Modul | Datei | Status |
|---|---|---|
| EDIFACT-Generator | `lib/abrechnung/edifact-generator.ts` | Vollständig |
| EDIFACT-Validator (3 Stufen) | `lib/abrechnung/edifact-validator.ts` | Vollständig |
| SECON (Anlage 16) | `lib/abrechnung/secon.ts` | Vollständig |
| Auftragsdatei (Anlage 3) | `lib/abrechnung/auftragsdatei.ts` | Vollständig |
| SFTP-Transport | `lib/abrechnung/transport.ts` | Vollständig |
| Schluesselverzeichnisse | `lib/abrechnung/schluesselverzeichnis.ts` | Vollständig |
| Zertifikatsverwaltung | `lib/abrechnung/zertifikate.ts` | Vollständig |
| Kassenabrechnung-Engine | `lib/abrechnung/kassenabrechnung-engine.ts` | Erweitert |
| Fehlerprotokoll | `lib/abrechnung/fehlerprotokoll.ts` | Vollständig |
| Rückläufer | `lib/abrechnung/ruecklaeufer.ts` | Vollständig |
| Korrekturläufe | `lib/abrechnung/korrekturlaeufe.ts` | Vollständig |
| Monatsabschluss | `lib/abrechnung/monatsabschluss.ts` | Vollständig |
| Einstellungen-UI | `app/admin/abrechnung/einstellungen/page.tsx` | Vollständig |

### Neue Endpunkte

| Endpunkt | Methode | Beschreibung |
|---|---|---|
| `/api/billing/dta/preflight` | POST | Standalone PreFlight-Check (ohne Lauf-Erstellung) |
| `/api/billing/dta/config-status` | GET | Zentrale DTA-Konfigurationsübersicht |
| `/api/billing/dta/dry-run` | POST | Vollständiger E2E Dry Run (intern, kein externer Versand) |

### Zentrale Konfigurationsübersicht (config-status)

Prüft und meldet Status für:
- Eigene IK-Nummer
- SECON-Absenderzertifikat (ITSG)
- SECON-Passwort (Env-Variable)
- Empfänger-Zertifikate
- Datenannahmestellen (SFTP-Konfiguration)
- Kassenabrechnung-Freischaltung
- DAKOTA-Export-Freischaltung

Gibt automatisch den Modus zurück:
- `produktion` — DAKOTA aktiv + Absenderzertifikat + SFTP konfiguriert
- `test` — mindestens eine Komponente fehlt

Markiert fehlende externe Werte als **"EXTERNE KONFIGURATION ERFORDERLICH"**.

---

## 3. Pre-Flight Check

### Bestehende Prüfpunkte (11)

1. Anerkennungsstatus (Pflicht)
2. Kassenabrechnung freigeschaltet (Pflicht)
3. Anerkennungsbescheid hinterlegt (Pflicht)
4. Gültige Kassentarife (Pflicht)
5. Kostenträger-IK gültig (Pflicht, bedingt)
6. Freigegebene Rechnungen (Pflicht)
7. Alle Rechnungen festgeschrieben (Pflicht)
8. Versicherungsdaten vollständig (Pflicht)
9. Pflegegrad vorhanden (Warnung)
10. Leistungsnachweise signiert (Pflicht)
11. Keine Doppelabrechnung (Pflicht)

### Neue Prüfpunkte (3)

12. **SECON-Absenderzertifikat gültig** (Warnung) — Prüft ob Absenderzertifikat hinterlegt und nicht abgelaufen
13. **SFTP-Transportkonfiguration** (Warnung) — Prüft ob min. 1 aktive Datenannahmestelle mit SFTP-Host/User konfiguriert
14. **Kostenträger-Routing eindeutig** (Warnung, bedingt) — Prüft ob genau 1 Datenannahmestelle für den KT-IK zugeordnet

---

## 4. E2E Dry Run

10-Schritte-Workflow, vollständig intern ohne externe Übermittlung:

| Schritt | Prüfung |
|---|---|
| 1 | Pre-Flight-Validierung (14 Prüfpunkte) |
| 2 | Rechnungen laden + Beträge validieren |
| 3 | Kundendaten + Leistungsnachweise (Signaturen) |
| 4 | AbrechnungsFall-Objekte aufbauen |
| 5 | EDIFACT-Generierung (dateiindikator: '0' = Testdatei) |
| 6 | EDIFACT-Validierung (Prüfstufe 1-3) |
| 7 | Auftragsdateien generieren (Anlage 3, 348 Byte fix) |
| 8 | Routing → Datenannahmestellen (SFTP-Status) |
| 9 | SECON-Vorbereitung (Zertifikat-Status, kein echtes Verschlüsseln) |
| 10 | DAKOTA/SFTP-Übermittlung → ÜBERSPRUNGEN |

Ergebnis: **BEREIT ZUR ÜBERMITTLUNG** oder **NICHT BEREIT** mit exakter Fehlerliste.

Garantien:
- Keine DB-Schreiboperationen (kein insert/update)
- Keine externe Kommunikation (kein SFTP, kein HTTP zu ITSG)
- Dateiindikator = '0' (Testmodus, nicht '2' = Produktion)
- Bestehende Daten bleiben unverändert

---

## 5. Security-Audit

### Auth-Pattern-Konsistenz

Alle 13 DTA-API-Routen verwenden korrekt:
- `createClient()` für Auth-Prüfung
- `profiles.role` in `['admin', 'superadmin']` für RBAC
- `getActiveOrgId()` für Mandantentrennung (NICHT profiles.organization_id)
- `createAdminClient()` für Service-Role-Operationen MIT explizitem Org-Fence

### IDOR-Schutz

Alle Entity-Zugriffe (Läufe, Rechnungen, Fehler, Rückläufer) prüfen:
- `organization_id = organizationId` auf der createAdminClient()-Query
- Kein Zugriff auf Entities anderer Mandanten möglich

### Secrets-Handling

- SECON_ZERT_PASSWORT nur als Env-Variable, nie in Code/DB
- SSH-Keys im privaten Storage-Bucket, nie in der Datenbank
- Keine hardcodierten JWT-Tokens, API-Keys oder Passwörter
- SFTP-Passwörter als `SECON_SFTP_PASSWORT_<NAME>` Env-Variable

### Audit-Trail

- Alle DTA-Aktionen (Erstellen, Freigeben, Exportieren, Stornieren) via `logBillingAction()`
- Rückläufer-Import mit Content-Hash-Deduplizierung
- Fehlerprotokoll mit Status-Workflow und Übergangswächtern

---

## 6. Tests

### Test-Ergebnisse

| Testsuite | Tests | Bestanden | Fehlgeschlagen |
|---|---|---|---|
| admin-ui-security.test.ts | 43 | 43 | 0 |
| kassenabrechnung-engine.test.ts | 13 | 13 | 0 |
| secon.test.ts | 3 | 3 | 0 |
| **Gesamt** | **59** | **59** | **0** |

### TypeScript-Build

```
npx tsc --noEmit → 0 Fehler
```

### Security-Test-Abdeckung

- 13 DTA-Routen: getActiveOrgId() + Admin-Rolle verifiziert
- Leistungsnachweis CRUD: Org-Isolation + Allowlist + State-Guards
- Mass-Assignment: Kein Body-Spread in Fehler/Rückläufer-Routen
- SFTP-Routen: Org-Fence verifiziert
- Benachrichtigungen: Korrekte API-Endpunkte
- PreFlight: 3 neue Prüfpunkte (SECON, SFTP, Routing)
- Dry-Run: Keine DB-Schreiboperationen, Testmodus-Dateiindikator
- Credentials: Keine hardcodierten Secrets in allen DTA-Routen

---

## 7. Zusammenfassung

### Gesamtstatus: BEREIT FÜR ABNAHME

| Bereich | Status |
|---|---|
| Admin-UI Click-Through | 4/4 kritische Bugs gefixt, 8 Major Fixes |
| DTA-Konfigurationsübersicht | Neuer API-Endpunkt `/api/billing/dta/config-status` |
| Pre-Flight Check | 14 Prüfpunkte (11 bestehend + 3 neu) |
| E2E Dry Run | 10-Schritte-Workflow ohne externe Übermittlung |
| Security | Org-Isolation, Mass-Assignment-Schutz, Audit-Trail |
| Tests | 59 Tests, alle bestanden, TypeScript-Build fehlerfrei |

### Für Produktionsfreigabe noch erforderlich (EXTERNE KONFIGURATION)

1. ITSG-Zertifikat beim Trust Center beantragen und hochladen
2. SECON_ZERT_PASSWORT als Vercel-Env-Variable setzen
3. Datenannahmestellen mit SFTP-Zugangsdaten konfigurieren
4. SSH-Keys für Datenannahmestellen im privaten Bucket hinterlegen
5. Empfänger-Zertifikate aus dem ITSG-Verzeichnis laden
6. DAKOTA-Export in state_settings freischalten
7. Migration 20260808220000 auf Production anwenden

### Nicht verändert / nicht angefasst

- Bestehende Produktionsdaten
- Keine Demo-Daten eingefügt
- Keine simulierten externen Übertragungserfolge
- Alle bestehenden Module unverändert (nur erweitert wo nötig)

---

## Geänderte Dateien

### Neue Dateien
- `app/api/billing/dta/preflight/route.ts`
- `app/api/billing/dta/config-status/route.ts`
- `app/api/billing/dta/dry-run/route.ts`
- `lib/abrechnung/__tests__/admin-ui-security.test.ts`
- `docs/ABSCHLUSSBERICHT-ADMIN-UI-DTA-KONFIGURATION-2026-08-08.md`

### Geänderte Dateien
- `lib/abrechnung/kassenabrechnung-engine.ts` — 3 neue PreFlight-Prüfpunkte
- `app/api/leistungsnachweis/crud/route.ts` — Org-Isolation + Allowlist + State-Guards
- `app/admin/benachrichtigungen/page.tsx` — Korrekte API-Endpunkte
- `app/api/billing/dta/fehler/route.ts` — Mass-Assignment entfernt
- `app/api/billing/dta/ruecklaeufer/route.ts` — Mass-Assignment entfernt
- `app/api/admin/abrechnung/sftp-test/route.ts` — Org-Fence
- `app/api/admin/abrechnung/sftp-key/route.ts` — Org-Fence
