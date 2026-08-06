# PR #35 – Billing Core: Rechnungsfestschreibung & Korrekturprozess

**Branch:** `feature/billing-core-corrections`
**Datum:** 2026-08-06
**Status:** GO

---

## 1. Datenmodell (6 neue Tabellen + 1 erweiterte)

| Tabelle | Zweck |
|---|---|
| `billing_tariffs` | Tarif- und Vertragsversionierung mit Zuschlagsregeln |
| `invoice_snapshots` | Unveraenderliche Rechnungs-Snapshots mit Checksumme |
| `invoice_corrections` | Korrekturen, Storno, Gutschriften |
| `invoice_line_snapshots` | Positions-Snapshots mit eingefrorenen Preisen |
| `billing_number_sequences` | Fortlaufende Rechnungsnummern (RE/ST/KR/GS) |
| `billing_audit_trail` | Revisionssichere Aenderungshistorie mit SHA-256 |
| `invoices` (erweitert) | +8 Spalten: frozen_at, version, correction_of, transmission_status, etc. |

## 2. Migrationen

| Datei | Beschreibung |
|---|---|
| `supabase/migrations/20260806200000_billing_core_corrections.sql` | Forward-Migration (6 Tabellen, RLS, Trigger, Funktion) |
| `supabase/migrations/20260806200001_rollback_billing_core_corrections.sql` | Rollback-Migration (vollstaendige Umkehr) |

## 3. Geaenderte/Neue Dateien

### Lib-Module (`lib/billing/core/`)
| Datei | Inhalt |
|---|---|
| `status-machine.ts` | 13 Status, Uebergaenge, Labels, Validierung |
| `audit.ts` | Audit-Trail + SHA-256 Checksummen |
| `idempotency.ts` | Idempotenz-Keys + Duplikatpruefung |
| `price-resolver.ts` | Tarifaufloesung (Spezifitaets-Score) + Preisberechnung |
| `invoice-engine.ts` | createDraft, freeze, cancel, correct, creditNote |
| `index.ts` | Barrel-Export |

### API-Routen (`app/api/billing/`)
| Route | Methode | Beschreibung |
|---|---|---|
| `/tariffs` | GET/POST | Tarife listen / anlegen (Admin) |
| `/invoices/[id]/freeze` | POST | Festschreibung (Admin) |
| `/invoices/[id]/cancel` | POST | Storno (Admin) |
| `/invoices/[id]/correct` | POST | Korrekturrechnung (Admin) |
| `/invoices/[id]/credit` | POST | Gutschrift (Admin) |
| `/invoices/[id]/snapshots` | GET | Versionshistorie (Auth) |
| `/audit` | GET | Audit-Trail (Admin) |

### Tests (`__tests__/billing/`)
| Datei | Tests |
|---|---|
| `status-machine.test.ts` | 25 Tests |
| `price-resolver.test.ts` | 9 Tests |
| `invoice-engine.test.ts` | 18 Tests |

## 4. Statusmaschine

```
entwurf → geprueft → freigegeben → uebermittelt → quittiert → bezahlt ■
    ↓         ↓           ↓              ↓             ↓
 storniert storniert   storniert      storniert     storniert ■
                                     abgelehnt   teilweise_bezahlt → bezahlt ■
                                        ↓              ↓
                                   erneut_eingereicht  korrektur_erforderlich → entwurf
                                        ↓                                        ↑
                                     uebermittelt      gekuerzt → akzeptiert ■
                                                          ↓
                                                    korrektur_erforderlich
```

Terminal-Status (kein Weg zurueck): `bezahlt`, `storniert`, `akzeptiert`

## 5. Berechtigungskonzept

| Tabelle | RLS | Org-Fence | Lesen | Schreiben |
|---|---|---|---|---|
| billing_tariffs | RESTRICTIVE | organization_id = current_org_id() | authenticated | admin only |
| invoice_snapshots | RESTRICTIVE | organization_id = current_org_id() | authenticated | admin only, kein UPDATE/DELETE |
| invoice_corrections | RESTRICTIVE | organization_id = current_org_id() | authenticated | admin only |
| invoice_line_snapshots | RESTRICTIVE | organization_id = current_org_id() | authenticated | admin only, kein UPDATE/DELETE |
| billing_number_sequences | RESTRICTIVE | organization_id = current_org_id() | authenticated | admin only |
| billing_audit_trail | RESTRICTIVE | organization_id = current_org_id() | authenticated | INSERT all, kein UPDATE/DELETE |

## 6. Testzahlen

- **52 Tests bestanden** (0 fehlgeschlagen)
- 3 Test-Suiten: Status-Machine (25), Price-Resolver (9), Invoice-Engine (18)
- TypeCheck: 0 Fehler in Lib/API (Test-Dateien: erwartete vitest-global Warnungen)

## 7. Sicherheit

- Kein Push auf main (eigener Feature-Branch)
- Keine echten Patienten-/Gesundheitsdaten
- Keine Tokens/Secrets im Code
- service_role nur in API-Routen nach Admin-Auth-Check
- RLS + Org-Fence auf allen neuen Tabellen
- Audit-Trail: INSERT only, kein UPDATE/DELETE (Manipulationsschutz)
- SHA-256 Checksummen auf Snapshots und Audit-Eintraegen
- Idempotenz-Keys gegen Doppelabrechnung
- Statusmaschine verhindert unerlaubte Uebergaenge (DB-Trigger + TS-Modul)
- Festschreibungsschutz: frozen_at blockiert Inhaltsaenderungen

## 8. Bekannte Risiken / Offene Punkte

1. **Admin-UI fehlt** — `/admin/tarife` wurde noch nicht implementiert (optional laut Anforderung)
2. **EDIFACT-Integration** — Invoice-Engine erzeugt noch keine EDIFACT-Nachrichten (muss mit bestehendem edifact-generator verbunden werden)
3. **Legacy-Status** — Bestehende Rechnungen mit `status='draft'` sind abwaertskompatibel (Trigger laesst sie durch), muessen aber manuell migriert werden
4. **Vercel Preview** — Deploy auf Feature-Branch laeuft, Staging-Supabase hat die Migration noch nicht

## 9. Bewertung

**GO** — Der Abrechnungskern ist vollstaendig implementiert und getestet. Die Architektur ist modular und kann spaeter fuer efy care wiederverwendet werden.
