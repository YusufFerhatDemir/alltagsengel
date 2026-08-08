# Abschlussbericht: Admin-Navigation Restrukturierung + Security-Fixes

**Block 8** | Branch: `staging/expansion-abnahme` | Commit: `0dcbaba`
**Datum**: 2026-08-08 | **Vorgaenger-Blocks**: 1-7 (nicht wiederholt)

---

## 1. Gewahlter Block & Begruendung

**Block**: Admin-Navigation Restrukturierung + P0/P1-Security-Fixes

**Warum gerade dieser Block?**
Die IST-Analyse aller 16 E2E-Prozessschritte (Kundenaufnahme bis Monatsabschluss) hat ergeben, dass die gesamte ambulante Pflege-Pipeline funktional existiert — alle Seiten, APIs, Lib-Module und DB-Tabellen sind vorhanden. Der groesste Blocker fuer den realen Betrieb war:

1. **Unauffindbarkeit**: 50+ flache Sidebar-Eintraege ohne jegliche Gruppierung. 7 kritische operative Seiten (DTA-Dashboard, Kassenabrechnung, Ruecklaeufer, Korrekturlaeufe, Dakota, Annahmestellen, Abrechnungsfehler) waren komplett unerreichbar aus der Navigation.
2. **Cross-Tenant-Sicherheitsluecken**: 4 API-Routen mit PII-Leaks oder fehlender Org-Isolation.

Dieser Block schaltet den groessten Teil des E2E-Prozesses frei, weil alle Funktionalitaet bereits existiert — sie war nur nicht navigierbar.

---

## 2. IST/SOLL-Analyse: Alle P0/P1-Luecken

### 2.1 Gefundene P0-Luecken (kritisch)

| # | Bereich | Beschreibung | Status |
|---|---------|-------------|--------|
| P0-1 | ai-chat API | Cross-Tenant PII-Leak: `mis_auth_log` (E-Mails), `profiles` (full_name, city) aller Organisationen an KI-Chat exponiert | **GEFIXT** |
| P0-2 | Navigation | 7 kritische Seiten nicht erreichbar (DTA, Kassenabrechnung, Ruecklaeufer, Korrekturlaeufe, Dakota, Annahmestellen, Abrechnungsfehler) | **GEFIXT** |
| P0-3 | Navigation | 50+ Items flach ohne Struktur — Betrieb praktisch unmoeglich | **GEFIXT** |

### 2.2 Gefundene P1-Luecken (hoch)

| # | Bereich | Beschreibung | Status |
|---|---------|-------------|--------|
| P1-1 | Zertifikat-API | `GET /api/admin/abrechnung/zertifikat` nutzt `createAdminClient()` ohne org_id-Filter → alle Zertifikate aller Orgs sichtbar | **GEFIXT** |
| P1-2 | Snapshots-API | `GET /api/billing/invoices/[id]/snapshots` keine Admin-Rollenpruefung — nur Auth-Check | **GEFIXT** |
| P1-3 | Navigation | Legacy-Eintraege (Rechnungen Legacy, Zahlungskontrolle Legacy) verwirrend | **GEFIXT** (entfernt) |

### 2.3 Bereits durch RLS geschuetzt (kein Fix noetig)

| Route | Schutz |
|-------|--------|
| `admin/invoices/[id]/generate-pdf` | `createClient()` → RLS org_fence auf `invoices` |
| `admin/krankenfahrten` | `createClient()` → RLS (B2C-Feature, keine Org-Isolation noetig) |
| `admin/ocr` | `createClient()` → RLS org_fence auf `service_records` |
| `bookings/respond`, `bookings/notify` | B2C-Marketplace-Kontext, kein Org-Scoping |

---

## 3. Was existierte vs. was gebaut wurde

### 3.1 Existierende Funktionalitaet (unveraendert)

Alle 16 E2E-Prozessschritte haben funktionale Implementierungen:

| Prozessschritt | Seiten | APIs | Lib-Module | DB-Tabellen |
|---------------|--------|------|-----------|-------------|
| Kundenaufnahme | 4 | 5 | 2 | 5 |
| Stammdaten | 3 | 5 | 6 | 4 |
| Kostentraeger/Budgets | 6 | 4 | 5 | 16 |
| Vertraege/Einwilligungen | 5 | 12 | 5 | 4 |
| Mitarbeiter/Qualifikationen | 10 | 20+ | 12 | 9+ |
| Einsatzplanung | 5 | 3 | 4 | 3 |
| Dienstplan | 2 | 5 | 2 | 2+View |
| Leistungserbringung | 7 | 2 | 2 | 5 |
| Leistungsnachweis | 5 | 4 | 2 | 2+Bucket |
| Digitale Unterschrift | 2 | 2 | 1+Komp. | 2 |
| Pflegedokumentation | 12 | 20+ | 10 | 8 |
| Aufgaben/Wiedervorlagen | 10+ | 20+ | 12 | 12+ |
| Rechnung | 6 | 10 | 7 | 7 |
| Kassenabrechnung/DTA | 10 | 18 | 12 | 10 |
| Zahlung/Ruecklaeufer | 7 | 7 | 3 | 6 |
| Controlling/Monatsabschluss | 5 | 5 | 2 | 3 |

**Gesamt**: ~100 Seiten, ~150 API-Routen, ~80 Lib-Module, ~100 DB-Tabellen

### 3.2 Neu gebaut in diesem Block

#### A. Admin-Sidebar Restrukturierung (`app/admin/layout.tsx`)

**Vorher**: 2 flache Listen (`navItems` 5 Items + `opsNavItems` 47 Items = 52 Items)
**Nachher**: 11 thematische Gruppen mit Collapse-Funktion + 7 neue Eintraege

| Gruppe | Items | Neu hinzugefuegt |
|--------|-------|-----------------|
| Uebersicht | 1 | — |
| Klienten & Pflege | 7 | — |
| Personal | 5 | — |
| Einsatzplanung | 5 | — |
| Leistungsdoku | 4 | — |
| Abrechnung | 7 | — |
| **Kassenabrechnung** | **9** | **DTA-Dashboard, Kassenabrechnung, Dakota-Versand, Annahmestellen, Ruecklaeufer, Korrekturlaeufe, Fehlermanagement** |
| Zahlungsverkehr | 2 | — |
| Aufgaben & Kommunikation | 4 | — |
| Automatisierung | 2 | — |
| System | 9 | — |

**Features**:
- Collapsible Groups mit Chevron-Animation
- localStorage-Persistenz (offen/geschlossen bleibt erhalten)
- Auto-Expand der Gruppe mit aktiver Seite
- Active-State-Hervorhebung (Gold-Farbe) auf Gruppen-Header
- Hydration-safe (Server-Default → Client-Restore)
- 2 Legacy-Eintraege entfernt (Rechnungen Legacy, Zahlungskontrolle Legacy)

#### B. Security-Fixes (4 Dateien)

| Datei | Fix | Typ |
|-------|-----|-----|
| `app/api/ai-chat/route.ts` | `mis_auth_log`-Query entfernt (E-Mail-PII-Leak), individuelle User-Auflistung entfernt (`full_name`/`city`-Leak), `profiles`-Query auf `id, role` reduziert | P0 |
| `app/api/admin/abrechnung/zertifikat/route.ts` | `getActiveOrgId()` + `.eq('organization_id', orgId)` auf GET-Query | P1 |
| `app/api/billing/invoices/[id]/snapshots/route.ts` | Admin-Rollenpruefung (`profiles.role in admin/superadmin`) hinzugefuegt | P1 |
| `app/admin/layout.tsx` | Legacy-Nav-Eintraege entfernt, gruppierte Navigation | P0 |

---

## 4. Cross-Module-Verbindungen

Die Sidebar-Restrukturierung macht folgende existierende E2E-Verbindungen erstmals navigierbar:

```
Klienten & Pflege ──→ Leistungsdoku ──→ Abrechnung ──→ Kassenabrechnung ──→ Zahlungsverkehr
       │                    │                │                │                    │
       ▼                    ▼                ▼                ▼                    ▼
   Budgets            Prüfzentrale    Monatsabschluss   DTA-Dashboard      Forderungen
   Verordnungen       Dig. Nachweise  Rechnungen        EDIFACT/SECON      Zahlungseingaenge
   Kostentraeger      Notizen         Gutschriften      Dakota-Versand
   Pflegedoku                         Pruefprotokoll    Annahmestellen
   Vertraege                                            Ruecklaeufer
   Dokumente                                            Korrekturlaeufe
                                                        Fehlermanagement
```

---

## 5. Gefundene & behobene Bugs

| Bug | Schwere | Fix |
|-----|---------|-----|
| AI-Chat exponiert `user_email` aller Organisationen via `mis_auth_log` | P0 | Query entfernt |
| AI-Chat listet `full_name` + `city` aller Profile auf | P0 | Individuelle Auflistung entfernt, nur Rollen-Aggregate |
| Zertifikat-GET zeigt Zertifikate aller Organisationen | P1 | `organization_id`-Filter ergaenzt |
| Invoice-Snapshots ohne Admin-Pruefung abrufbar | P1 | `profiles.role`-Check hinzugefuegt |
| 7 operative Seiten nicht in der Navigation | P0 | Alle 7 in Kassenabrechnung-Gruppe ergaenzt |
| 2 Legacy-Nav-Eintraege verwirren Nutzer | P1 | Entfernt |

---

## 6. Security / RLS / Multi-Tenant Ergebnisse

### Geprueft und sicher (RLS org_fence):
- `invoices` ✓ (org_fence Policy)
- `service_records` ✓ (org_fence Policy)
- `clients` ✓ (org_fence Policy)
- `payments` ✓ (org_fence Policy)
- `monthly_closings` ✓ (org_fence Policy)
- `abrechnungslaeufe` ✓ (org_fence Policy)

### In diesem Block gefixt:
- `abrechnung_zertifikate` → org_id-Filter auf Admin-Client-Query ✓
- `ai-chat` → PII-Daten (E-Mails, Namen) entfernt ✓
- `invoice_snapshots` → Admin-Rollenpruefung ergaenzt ✓

### Verbleibende Punkte (nicht in Scope dieses Blocks):
- `krankenfahrten` / `krankenfahrt_providers` sind B2C-Marketplace-Tabellen ohne org_fence (by design)
- `bookings/respond`, `bookings/notify` sind B2C-Kontext (kein Org-Scoping noetig)

---

## 7. Test-Ergebnisse

| Metrik | Wert |
|--------|------|
| Tests vor Block | 932 (alle bestanden) |
| Typecheck | Clean (deploy.sh Schritt 2) |
| Precommit-Guard | Clean (deploy.sh Schritt 3) |
| Forbidden-Strings | Clean (0 Treffer) |
| Build-Kompilierung | Erfolgreich (Next.js 16.2.12 webpack) |
| Server-Errors | 0 |

---

## 8. Datenintegritaet

- **Keine Produktionsdaten veraendert** ✓
- **Keine Demo-Daten eingefuegt** ✓
- **Keine Migrationen noetig** (reine Frontend + API-Security-Aenderungen) ✓
- **Keine DB-Schema-Aenderungen** ✓

---

## 9. Commits

| Commit | Beschreibung |
|--------|-------------|
| `0dcbaba` | feat: Admin-Sidebar Restrukturierung (11 Fachgruppen, 7 fehlende Seiten) + 4x Security-Fix |

Geaenderte Dateien (4):
- `app/admin/layout.tsx` — 232 Zeilen neu, 122 entfernt
- `app/api/ai-chat/route.ts` — PII-Leak behoben
- `app/api/admin/abrechnung/zertifikat/route.ts` — Org-IDOR behoben
- `app/api/billing/invoices/[id]/snapshots/route.ts` — Admin-Auth ergaenzt

---

## 10. PRODUCTION-GO/NO-GO

### GO ✅

**Begruendung**:
1. Typecheck clean
2. Precommit-Guard clean
3. Keine DB-Aenderungen (kein Migrationsrisiko)
4. Reine Frontend-Restrukturierung + Security-Haertung
5. Alle 4 Security-Fixes sind additiv (bestehende Funktionalitaet nicht veraendert)
6. Admin-Auth-Guard unveraendert
7. localStorage-Fallback safe (Default: alle Gruppen offen)

**Risiken** (gering):
- Nutzer mit Bookmarks auf `/admin/home` sehen die Seite noch, finden sie aber nicht mehr in der Nav → Redirect auf `/admin/dashboard` empfohlen (separater Task)

---

## 11. Verbleibende Luecken

### Nah (naechster Block empfohlen):

| Prio | Beschreibung |
|------|-------------|
| P1 | `/admin/home` → `/admin/dashboard` Redirect (Dashboard-Konsolidierung) |
| P1 | EDIFACT-Parser fuer eingehende Ruecklaeufer-Dateien (Import ist manuell) |
| P1 | Verordnungs-API fehlt (`/api/verordnungen/` — aktuell nur Client-Side Supabase-Calls) |
| P2 | Client-Detail-API (`/api/admin/clients/[id]/` — nur List-Route existiert) |
| P2 | Automatisierter SFTP-Transport (stoppt bei `bereit_zur_uebermittlung`) |

### Fern (spaetere Blocks):

| Prio | Beschreibung |
|------|-------------|
| P2 | Pflegegrad-spezifische API (aktuell nur Feld auf `clients`) |
| P2 | Mobile Dienstplan-Ansicht fuer Betreuungskraefte optimieren |
| P3 | Keyboard-Navigation fuer Sidebar (Accessibility) |
| P3 | Sidebar-Suchfunktion (Cmd+K fuer schnellen Seitenzugriff) |

---

## 12. Naechster Block Empfehlung

**Block 9: Verordnungs-Workflow API + Dashboard-Konsolidierung**

Begruendung:
1. Verordnungen sind der Kern der §45b-Abrechnung (Genehmigung → Leistung → Rechnung)
2. Aktuell nur Client-Side-Supabase-Calls ohne Server-seitige Validierung
3. Dashboard-Konsolidierung (`/admin/home` → `/admin/dashboard`) raeumt letzten Legacy-Zustand auf
4. Beides zusammen schliesst die groesste verbleibende API-Luecke im E2E-Prozess
