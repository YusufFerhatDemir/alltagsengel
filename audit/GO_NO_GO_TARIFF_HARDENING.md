# GO/NO-GO-Bericht: Tarifmodell & Production-Readiness Hardening

**Datum:** 2026-08-07
**Branch:** `feature/tariff-hardening` (Commit `5ae8452`)
**Staging:** Supabase Branch `kauewzfsagglamvwmgeq` (getestet + geloescht)
**Autor:** Automatisierter Agent

---

## Verdikt: BEDINGTES GO

Die technische Implementierung ist vollstaendig und alle 9 E2E-Tests bestanden auf Supabase Staging.
**Production-Migration darf erst nach Lieferung der echten Tarifdaten erfolgen.**

---

## 1. Erledigte Punkte (10/10)

### Punkt 1: Kontrollierter Katalog (leistungsart + rechtsgrundlage)
**Status:** ERLEDIGT

- `billing_leistungsarten`: 12 Eintraege (alltagsbegleitung, betreuung_45a, verhinderungspflege, hauswirtschaft, einkaufsservice, begleitservice, nachtbetreuung, wochenendbetreuung, krankenfahrt, demenzbetreuung, wegepauschale, sonstige)
- `billing_rechtsgrundlagen`: 4 Eintraege (§45b SGB XI, §39 SGB XI, §36 SGB XI, privat)
- FK-Constraints `fk_tariff_leistungsart` und `fk_tariff_rechtsgrundlage` auf `billing_tariffs`
- API-Route `POST /api/billing/tariffs` validiert gegen Katalog vor INSERT
- Bestehende Daten: billing_tariffs ist auf Production leer → kein Risiko

### Punkt 2: IK-Validierung
**Status:** ERLEDIGT

- `validate_ik_nummer()` PL/pgSQL-Funktion: Stellen 3–8, Gewichte [2,1,2,1,2,1], Pruefziffer = Summe mod 10 (§293 SGB V)
- Identisch mit TypeScript-Implementierung in `lib/organizations/ik.ts`
- CHECK-Constraint `chk_client_ik_valid` auf `clients.pflegekasse_ik`
- CHECK-Constraint `chk_tariff_ik_valid` auf `billing_tariffs.kostentraeger_ik`
- NULL bleibt erlaubt (generische Tarife / Klienten ohne Kassenzuordnung)
- Verifiziert: AE-IK `460629986` = gueltig, `123456789` = ungueltig

### Punkt 3: Hessen-Hardcoding entfernt
**Status:** ERLEDIGT

- `create_invoice_draft_atomic` v3 liest `organizations.bundesland` dynamisch:
  ```sql
  SELECT LOWER(COALESCE(bundesland, '')) INTO v_org_bundesland
    FROM public.organizations WHERE id = p_org_id;
  ```
- Alle 3 Scoring-Bloecke verwenden `v_org_bundesland` statt `'hessen'`
- Test H6: Bayern-Tarif wird fuer Hessen-Org korrekt ausgeschlossen

### Punkt 4: Korrektur-Endpoint abgesichert
**Status:** ERLEDIGT

- `correctInvoice()` in `lib/billing/core/invoice-engine.ts`:
  - Tarif-Cross-Check fuer jede Korrekturposition
  - >10% Preisabweichung erfordert `korrekturgrundPreis` (min. 5 Zeichen)
  - Fehlermeldung mit exakter Abweichung in Prozent
  - `MAX_CORRECTION_DEVIATION_PERCENT = 10`
- Typ `CorrectionLineInput` erweitert um `korrekturgrundPreis?: string`

### Punkt 5: Zuschlagsmodell vorbereitet
**Status:** ERLEDIGT

- `billing_feiertage` Lookup-Tabelle (datum + bundesland + name)
- Zuschlag-Berechnung in RPC v3:
  - Wochenende: DOW 0 (So) oder 6 (Sa)
  - Feiertag: Lookup in `billing_feiertage`
  - Nacht: `start_time` vs. `nacht_von`/`nacht_bis` (Mitternachts-Wrap)
  - Prioritaet: Feiertag > Wochenende, Nacht kumulativ
  - **Default: 0** — keine automatische Aktivierung ohne explizite Tarifregeln
- Test H7: Werktag+Tag → 40.00 EUR (kein Zuschlag)
- Test H8: Samstag+25% WE → 50.00 EUR

### Punkt 6: Endgueltiges billing_tariffs Schema
**Status:** ERLEDIGT

Spalten:
- `id` (UUID PK), `organization_id` (FK organizations)
- `leistungsart` (FK billing_leistungsarten), `rechtsgrundlage` (FK billing_rechtsgrundlagen)
- `verguetungsart` (CHECK: zeit_stunde/zeit_minute/leistungskomplex/pauschale/wegepauschale/zuschlag)
- `preis_cent` (INTEGER, >= 0), `einheit` (TEXT)
- `kostentraeger_ik` (TEXT, CHECK Luhn, NULL = generisch)
- `bundesland` (TEXT)
- `gueltig_ab` (DATE, NOT NULL), `gueltig_bis` (DATE, NULL = unbefristet)
- `zuschlag_wochenende_prozent`, `zuschlag_feiertag_prozent`, `zuschlag_nacht_prozent` (NUMERIC(5,2), Default 0)
- `nacht_von`, `nacht_bis` (TIME, Default 20:00/06:00)
- `ist_aktiv` (BOOLEAN, Default TRUE)
- `created_at`, `updated_at`, `deleted_at`, `created_by`
- EXCLUDE Constraint `no_overlapping_tariffs` (org + leistungsart + rechtsgrundlage + kostentraeger_ik + bundesland + validity_range) WHERE (deleted_at IS NULL AND ist_aktiv = TRUE)

### Punkt 7: Keine erfundenen Preise
**Status:** ERLEDIGT

- `billing/tariff-import-template.sql`: Alle Preisfelder = `0` mit Kommentar `FACHLICH_ZU_LIEFERN`
- Checkliste vor Import integriert (10 Pruefpunkte)
- Keine echten Euro-Betraege im Repo

### Punkt 8: E2E-Tests (9 Szenarien)
**Status:** ERLEDIGT — ALLE 9 BESTANDEN

| Test | Beschreibung | Ergebnis |
|------|-------------|----------|
| H1a  | Client MIT IK → IK-spezifischer Tarif (38.00 EUR) | PASS |
| H1b  | Client OHNE IK → generischer Tarif (35.00 EUR) | PASS |
| H2a  | Ungueltige Client-IK (123456789) → CHECK violation | PASS |
| H2b  | Ungueltige Tarif-IK (999999999) → CHECK violation | PASS |
| H3   | Unbekannte Leistungsart → FK violation | PASS |
| H4   | Unbekannte Rechtsgrundlage → FK violation | PASS |
| H5   | Abgelaufener Tarif → MISSING_VALID_TARIFF | PASS |
| H6   | Bayern-Tarif fuer Hessen-Org → MISSING_VALID_TARIFF | PASS |
| H7   | Werktag+Tag, 25% WE-Tarif → 40.00 EUR (kein Zuschlag) | PASS |
| H8   | Samstag+Tag, 25% WE-Tarif → 50.00 EUR | PASS |
| H9a  | 12 aktive Leistungsarten im Katalog | PASS |
| H9b  | 4 aktive Rechtsgrundlagen im Katalog | PASS |
| H9c  | validate_ik_nummer('460629986') = TRUE | PASS |
| H9d  | validate_ik_nummer('123456789') = FALSE | PASS |
| H9e  | validate_ik_nummer(NULL) = TRUE | PASS |

### Punkt 9: Separater Branch + Staging-Tests
**Status:** ERLEDIGT

- Branch: `feature/tariff-hardening` (Commit `5ae8452`)
- Staging-Branch: `kauewzfsagglamvwmgeq` (Supabase Preview, getestet, geloescht)
- Staging-Testlauf: Schema manuell aufgebaut (organizations, billing_tariffs, Kataloge, RPC v3), alle 9 Tests bestanden
- Keine Production-Aenderungen

### Punkt 10: GO/NO-GO-Bericht
**Status:** Dieses Dokument

---

## 2. Offene Blocker (vor Production-Migration)

### B1: Echte Tarifdaten fehlen
`billing_tariffs` ist auf Production leer. Ohne echte Preise keine Rechnungserstellung.

**Benoetigte Daten:**
- Stundensatz Alltagsbegleitung (§45b SGB XI) fuer Hessen
- Stundensatz Hauswirtschaft (§45b)
- Wegepauschale (§45b)
- Stundensatz Verhinderungspflege (§39)
- Optional: IK-spezifische Tarife fuer bestimmte Pflegekassen
- Optional: Zuschlagsprozentsaetze (WE/Feiertag/Nacht) — Default 0 ist sicher

**Vorlage:** `billing/tariff-import-template.sql`

### B2: Voraussetzungsmigration auf Production
Die Hardening-Migration (`20260807120000`) setzt folgende Migrationen voraus, die noch NICHT auf Production angewendet sind:
- `20260801_phase3_multi_mandant_saas.sql` (organizations-Tabelle)
- `20260806200000_billing_core_corrections.sql` (billing_tariffs, billing_audit_trail)
- `20260807110000_tariff_based_invoice_creation.sql` (RPC v2, Overlap-Constraint)
- Diverse Zwischenmigrationen (RLS, Backfill, etc.)

**Reihenfolge:** Alle Migrationen muessen in chronologischer Reihenfolge auf Production angewendet werden, bevor die Hardening-Migration angewendet werden kann.

---

## 3. Bekannte Einschraenkungen

| Nr | Einschraenkung | Risiko | Massnahme |
|----|---------------|--------|-----------|
| E1 | billing_feiertage ist leer | Niedrig | Feiertagszuschlag = 0 ohne Eintraege (sicherer Default) |
| E2 | Zuschlag nur auf Basis von start_time (nicht anteilig) | Niedrig | Fuer Alltagsbegleitung ausreichend, Split-Einsaetze selten |
| E3 | Nacht-Zuschlag: nur Startzeitpunkt geprueft | Niedrig | Einsaetze, die um Mitternacht starten und enden, werden korrekt behandelt |
| E4 | Kein automatisches Tarif-Versioning (nur gueltig_ab/gueltig_bis) | Niedrig | Fuer aktuellen Betrieb ausreichend, Versionierung ueber neue Zeilen |
| E5 | service_records.service_type ist noch Freitext | Mittel | Sollte spaeter ebenfalls an billing_leistungsarten-Katalog angebunden werden |

---

## 4. Geaenderte Dateien

| Datei | Aenderung |
|-------|-----------|
| `supabase/migrations/20260807120000_tariff_model_hardening.sql` | NEU: Hardening-Migration (711 Zeilen) |
| `lib/billing/core/invoice-engine.ts` | GEAENDERT: korrekturgrundPreis, Tarif-Cross-Check |
| `app/api/billing/tariffs/route.ts` | GEAENDERT: Katalog-Validierung vor INSERT |
| `billing/tariff-import-template.sql` | NEU: Import-Vorlage fuer echte Tarifdaten |
| `tests/e2e-tariff-hardening.sql` | NEU: 9 E2E-Test-Szenarien |
| `audit/PRODUCTION_READINESS_BERICHT.md` | NEU: 7-Punkte-Analyse |

---

## 5. Merge-Empfehlung

**BEDINGTES GO — Merge nach main ist technisch sicher, aber:**

1. Merge nach main: JA, sicher — keine Production-Datenbankeffekte, da Production nur 4 Baseline-Migrationen hat
2. Production-Migration: NEIN — erst nach Lieferung der Tarifdaten und Anwendung ALLER Voraussetzungsmigrationen
3. Empfohlene Reihenfolge:
   a. Feature-Branch nach main mergen (kein DB-Effekt)
   b. Voraussetzungsmigrationen auf Production planen und anwenden
   c. Echte Tarifdaten beschaffen und in Import-Template eintragen
   d. Hardening-Migration auf Production anwenden
   e. Tarifdaten importieren
   f. Smoke-Test auf Production

---

## 6. Naechste Schritte

1. **Yusufs Freigabe** fuer Merge nach main
2. **Echte Tarifdaten** liefern (Stundensaetze, Wegepauschale, ggf. IK-spezifisch)
3. **Voraussetzungsmigrationen** auf Production planen
4. **Feiertage 2026/2027** in billing_feiertage importieren (optional, Default = kein Zuschlag)
5. **service_records.service_type** an Katalog anbinden (E5, spaetere Phase)
