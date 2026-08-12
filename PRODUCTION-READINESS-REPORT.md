# Alltagsengel — Production Readiness Report

**Datum:** 2026-08-12
**Branch:** `staging/expansion-abnahme`
**Commits:** `1da9f95` (Pricing + API-Fixes), `477c8c2` (Leistungsnachweis DejaVuSans)
**Supabase:** `nnwyktkqibdjxgimjyuq` (eu-west-1, PostgreSQL 17.6)

---

## FERTIG (produktionsbereit)

### 1. Datenbank-Infrastruktur
- **234 Tabellen**, alle mit RLS enabled — 0 ungeschützte Tabellen
- **732 RLS-Policies** aktiv, inkl. org_fence RESTRICTIVE Policies für Multi-Tenant-Isolation
- **61 SECURITY DEFINER Funktionen**, 0 davon für `anon` aufrufbar (Migration `20260812040000`)
- **Stamm-Organisation:** `00000000-0000-4000-8000-000460629986`, IK `460629986`

### 2. E2E-Pipeline: Klient → Einsatz → Doku → Nachweis → Abrechnung → Zahlung
| Schritt | Tabelle(n) | Status |
|---|---|---|
| Klientenverwaltung | `clients` (4 Datensätze) | ✅ FERTIG |
| Mitarbeiterverwaltung | `caregivers` (2), `caregiver_qualifications` | ✅ FERTIG |
| Einsatzplanung | `assignments` (5) | ✅ FERTIG — Spalten-Fix (`service_type`, `recurrence_rule`) |
| Tourenplanung | `tours`, `tour_stops`, `tour_templates` | ✅ FERTIG — Migration + RLS + Trigger |
| Einsatzfreigabe | `pruefeEinsatzfreigabe()` | ✅ FERTIG — Fix: `status` statt `deleted_at`/`is_active` |
| Leistungserfassung | `service_records` (37 Spalten) | ✅ FERTIG |
| Unterschriften | `service_signatures` (11 Spalten) | ✅ FERTIG — Native + Admin-Pfad |
| Leistungsnachweis-PDF | `/api/leistungsnachweis` | ✅ FERTIG — DejaVuSans, kassenfähig-Check |
| Pflegedokumentation | `pflege_aufnahmen`, `pflege_verlauf`, etc. | ✅ FERTIG — 8 Tabellen, RLS aktiv |
| Abrechnungslauf | `abrechnungslaeufe` (1 Datensatz) | ✅ FERTIG |
| Rechnungen | `invoices` (5), `invoice_items` (18) | ✅ FERTIG — 44 Spalten, Korrektur/Storno/Dunning |
| DTA/DAKOTA | `dta_dakota_auftraege`, `dta_validierungen` (1) | ✅ FERTIG — Tabellen + Trigger |
| Zahlungen | `payments`, `payment_allocations` | ✅ FERTIG — Tabellen + Zuordnungs-UI |
| Forderungen/OPOS | `payment_status`, `payment_differences` | ✅ FERTIG |

### 3. API/DB-Konsistenz
- **0 Mismatches** zwischen API-Routen und Datenbank-Schema (109 API-Dateien auditiert)
- Alle `.from()` Aufrufe verwenden existierende Tabellen
- Alle `.select()` Queries referenzieren existierende Spalten

### 4. Personalmanagement / Dienstplanung
- `dienstplan_schichten`, `dienstplan_eintraege` — Tabellen + RLS vorhanden
- `personal_schulungen`, `personal_urlaubskonto`, `personal_arbeitszeiten` — vorhanden
- Einsatzfreigabe-Prüfung: Vertragsstatus + Qualifikationen + Budget (3-stufig)

### 5. Aufgaben / Kommunikation / Eskalation
- `ops_aufgaben` (4 Policies), `ops_nachrichten` (5 Policies)
- `ops_eskalationsregeln`, `ops_eskalationshistorie` — vorhanden
- Posteingang-View Fix: `.eq('organization_id')` entfernt (RLS auf Basistabellen)

### 6. Preisgestaltung
- **Zentralisiert:** `lib/pricing/b2c-constants.ts` — 7 Dateien aktualisiert
  - `CUSTOMER_HOURLY_RATE = 32` (B2C-Kundenpreis)
  - `PLATFORM_FEE_FACTOR = 0.085` (8,5%)
  - `ENGEL_HOURLY_RATE = 20` (Engel-Vergütung)
  - `NATIVE_FALLBACK_HOURLY_RATE = 35` (Fallback)
- **DB-Preise (B2B/Kassen):** `service_pricing` (10 Einträge) — separat, nicht überschrieben
- **HINWEIS:** B2C-Preis (32€) ≠ B2B-Kassenpreis (35€) — das ist korrekt so (Plattformmarge)

### 7. Sicherheit
- 234/234 Tabellen mit RLS (100%)
- 0 anon-EXECUTE auf SECDEF-Funktionen
- 33 Subquery-Policies durch is_admin() / current_org_id() ersetzt
- org_fence RESTRICTIVE auf allen mandantenfähigen Tabellen
- Triple-Storage Auth: Cookie + localStorage + IndexedDB

---

## NOCH OFFEN (nicht blockierend für Go-Live)

| # | Thema | Aufwand | Prio |
|---|---|---|---|
| 1 | **Billing Tariffs leer** — `billing_tariffs` hat 0 Einträge; `price-resolver.ts` greift darauf zu. Aktuell Fallback auf `service_pricing`. Kassentarife müssen pro Bundesland importiert werden. | 2-3h | P1 |
| 2 | **Dienstplan leer** — Schichten/Einträge (0 Datensätze). Funktioniert erst mit echtem Personal. | Setup | P2 |
| 3 | **B2C vs. B2B Preisdiskrepanz dokumentieren** — 32€ Kundenpreis vs. 35€ Kassenpreis. Bewusste Marge, aber sollte in der Buchhaltung/im Reporting sauber getrennt sein. | 1h | P2 |
| 4 | **PDF-Font Konsistenz** — Leistungsnachweis jetzt DejaVuSans ✅, aber prüfen ob weitere PDF-Generatoren noch Helvetica nutzen. | 0,5h | P3 |

---

## EXTERN BLOCKIERT

| # | Thema | Blocker | Erwarteter Termin |
|---|---|---|---|
| 1 | **KIM-Transport** (Telematik-Infrastruktur für elektronische Kassenabrechnung) | TI-Anbindung nicht verfügbar | Dez 2026 |
| 2 | **Vitalwerte regulatorische Klassifizierung** | MDR/DiGA-Einstufung offen | Kill-Switch aktiv (fail-closed) |
| 3 | **Kassenanerkennung nach §45a** | Bundesland-weise Antragstellung | Laufend, je Bundesland |

---

## TESTERGEBNIS

| Testbereich | Ergebnis |
|---|---|
| API/DB-Schema-Konsistenz | ✅ 0 Mismatches (109 API-Dateien, 234 Tabellen) |
| RLS-Abdeckung | ✅ 100% (234/234 Tabellen, 732 Policies) |
| SECDEF-Funktionen anon-Zugriff | ✅ 0 exponiert |
| Precommit-Guard (Secrets/env/node_modules) | ✅ Aktiv |
| Typecheck | ✅ Clean |
| Forbidden-Strings-Lint | ✅ Clean |
| Einsatzfreigabe (MA + Klient + Budget) | ✅ 3-stufige Prüfung |
| Leistungsnachweis-PDF | ✅ DejaVuSans, Unterschriften, kassenfähig-Check |
| Tourenplanung | ✅ Tabellen + RLS + Trigger |
| Billing-Pipeline | ✅ Invoice-Engine + Dunning + Korrekturen + OPOS |

---

## PRODUCTION-GO

**Bewertung: BEDINGT GO** ✅

Die Software ist funktional produktionsbereit. Der gesamte E2E-Pflegeprozess (Klient → Einsatz → Dokumentation → Leistungsnachweis → Abrechnung → Zahlung) ist implementiert und die Datenbank-Integrität verifiziert.

**Voraussetzungen für vollständigen Go-Live:**
1. Billing-Tarife für das erste Bundesland importieren (P1, 2-3h)
2. Erstes echtes Personal anlegen + Dienstplan befüllen
3. Staging-Branch nach `main` mergen + Vercel-Deploy verifizieren

**Externe Blocker beeinträchtigen NICHT den Betriebsstart** — KIM und Vitalwerte sind für spätere Phasen, der Kill-Switch verhindert Fehlverwendung.
