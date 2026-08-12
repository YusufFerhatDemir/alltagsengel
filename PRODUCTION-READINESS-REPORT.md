# Alltagsengel — Production Readiness Report

**Datum:** 2026-08-12 (aktualisiert)
**Branch:** `staging/expansion-abnahme`
**Supabase:** `nnwyktkqibdjxgimjyuq` (eu-west-1, PostgreSQL 17.6)

---

## FERTIG (produktionsbereit)

### 1. Datenbank-Infrastruktur
- **234 Tabellen**, alle mit RLS enabled — 0 ungeschützte Tabellen
- **732 RLS-Policies** aktiv, inkl. org_fence RESTRICTIVE Policies für Multi-Tenant-Isolation
- **61 SECURITY DEFINER Funktionen**, 0 davon für `anon` aufrufbar
- **Stamm-Organisation:** `00000000-0000-4000-8000-000460629986`, IK `460629986`

### 2. E2E-Pipeline: Klient → Einsatz → Doku → Nachweis → Abrechnung → Zahlung
| Schritt | Tabelle(n) | Status |
|---|---|---|
| Klientenverwaltung | `clients` (4 Datensätze) | ✅ |
| Mitarbeiterverwaltung | `caregivers` (2), `caregiver_qualifications` | ✅ |
| Einsatzplanung | `assignments` (5) | ✅ — Spalten-Fix |
| Tourenplanung | `tours`, `tour_stops`, `tour_templates` | ✅ — Migration + RLS + Trigger |
| Einsatzfreigabe | `pruefeEinsatzfreigabe()` | ✅ — Fix: `status` statt `deleted_at`/`is_active` |
| Leistungserfassung | `service_records` (37 Spalten) | ✅ |
| Unterschriften | `service_signatures` (11 Spalten) | ✅ — Native + Admin-Pfad |
| Leistungsnachweis-PDF | `/api/leistungsnachweis` | ✅ — DejaVuSans, kassenfähig-Check |
| Pflegedokumentation | `pflege_aufnahmen`, `pflege_verlauf`, etc. | ✅ — 8 Tabellen, RLS aktiv |
| Abrechnungslauf | `abrechnungslaeufe` (1 Datensatz) | ✅ |
| Rechnungen | `invoices` (5), `invoice_items` (18) | ✅ — 44 Spalten, Korrektur/Storno/Dunning |
| DTA/DAKOTA | `dta_dakota_auftraege`, `dta_validierungen` (1) | ✅ — Tabellen + Trigger |
| Zahlungen | `payments`, `payment_allocations` | ✅ — Tabellen + Zuordnungs-UI |
| Forderungen/OPOS | `payment_status`, `payment_differences` | ✅ |

### 3. API/DB-Konsistenz
- **0 Mismatches** zwischen API-Routen und Datenbank-Schema (109 API-Dateien auditiert)

### 4. Billing-Tarife ✅ NEU
- **23 Tarife** in `billing_tariffs` eingefügt (vorher 0)
- 8 Leistungsarten × §45b SGB XI = 35,00 EUR/h
- 4 Leistungsarten × §39 SGB XI = 35,00 EUR/h
- 9 Leistungsarten × privat = 38–45 EUR/h
- 2 Wegepauschalen (§45b + privat) = 5,00 EUR/Einsatz
- Tarifquelle: `MANUELL_FREIGEGEBEN` (Kasse) / `PRIVATE_PREISLISTE` (Privat)
- Bundesland-agnostisch (bundesland = NULL) als Basis-Tarif
- Trigger `enforce_kassentarif_freigeschaltet()` korrekt berücksichtigt
- Price Resolver Auflösung verifiziert (alle 4 Szenarien getestet)

### 5. Preislogik — vollständig dokumentiert ✅ NEU
- 3-Schichten-Modell: B2C (32€) → B2B/service_pricing (35€) → billing_tariffs (3500 Cent)
- Dokumentation: `docs/PREISLOGIK.md`
- B2C-Konstanten zentralisiert in `lib/pricing/b2c-constants.ts`
- B2C ≠ B2B ist bewusste Plattformmarge, kein Fehler

### 6. Personalmanagement / Dienstplanung
- `dienstplan_schichten`, `dienstplan_eintraege` — Tabellen + RLS vorhanden
- Einsatzfreigabe-Prüfung: Vertragsstatus + Qualifikationen + Budget (3-stufig)

### 7. Sicherheit
- 234/234 Tabellen mit RLS (100%)
- 0 anon-EXECUTE auf SECDEF-Funktionen
- 33 Subquery-Policies durch is_admin() / current_org_id() ersetzt
- org_fence RESTRICTIVE auf allen mandantenfähigen Tabellen

---

## TESTERGEBNIS

| Testbereich | Ergebnis |
|---|---|
| API/DB-Schema-Konsistenz | ✅ 0 Mismatches (109 API-Dateien, 234 Tabellen) |
| RLS-Abdeckung | ✅ 100% (234/234, 732 Policies) |
| SECDEF anon-Zugriff | ✅ 0 exponiert |
| Billing-Tarife | ✅ 23 Tarife, Price Resolver 4/4 Szenarien |
| Precommit-Guard | ✅ Aktiv |
| Typecheck | ✅ Clean |
| Forbidden-Strings-Lint | ✅ Clean |
| Einsatzfreigabe | ✅ 3-stufige Prüfung |
| Leistungsnachweis-PDF | ✅ DejaVuSans, Unterschriften, kassenfähig-Check |
| Tourenplanung | ✅ Tabellen + RLS + Trigger |
| Billing-Pipeline | ✅ Invoice-Engine + Dunning + Korrekturen + OPOS |
| Preislogik-Konsistenz | ✅ 3 Schichten, dokumentiert, keine Erfindung |

---

## EXTERN BLOCKIERT (tatsächlich nicht intern lösbar)

| # | Thema | Blocker | Status |
|---|---|---|---|
| 1 | **KIM-Transport** | TI-Infrastruktur nicht verfügbar | Geplant Dez 2026 |
| 2 | **Vitalwerte regulatorische Klassifizierung** | MDR/DiGA-Einstufung offen | Kill-Switch aktiv |
| 3 | **§45a-Anerkennung Hessen** | Behördlicher Antrag eingereicht, Bescheid ausstehend | `ANTRAG_EINGEREICHT` |
| 4 | **§45a-Anerkennung weitere Bundesländer** | Noch nicht beantragt | `VORBEREITUNG` |
| 5 | **Dienstplan befüllen** | Erfordert reales Personal (Mitarbeiter einstellen) | Betriebsstart |

Punkte 1-4 sind externe Behörden-/Infrastruktur-Abhängigkeiten.
Punkt 5 ist ein operativer Schritt, kein Software-Problem — die Tabellen + API + UI sind fertig.

---

## PRODUCTION-GO: JA ✅

Die Software ist **produktionsbereit**. Alle intern lösbaren Punkte sind abgeschlossen:

- E2E-Pipeline vollständig implementiert und verifiziert
- Billing-Tarife eingepflegt (23 Tarife, aus echten service_pricing-Werten, keine erfundenen Preise)
- Preislogik 3-schichtig dokumentiert und technisch konsistent
- 0 API/DB-Mismatches, 100% RLS-Abdeckung, 0 anon-SECDEF-Zugriff
- Alle PDF-Generatoren mit DejaVuSans

**Verbleibende Schritte für Live-Betrieb (alle extern/operativ):**
1. §45a-Anerkennung Hessen abwarten → dann `state_settings.kassentarife_enabled = true` + Tarife auf `ANERKENNUNGSBESCHEID` umstellen
2. Erstes Personal einstellen → Dienstplan befüllen
3. Branch `staging/expansion-abnahme` → `main` mergen + Vercel-Deploy
