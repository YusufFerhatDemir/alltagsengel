# P0-Fix-Report: `/api/billing/auto-invoice` Cross-Client-Leak (B-1)

**Datum:** 2026-08-03 · **Branch:** `audit/phase3-production-readiness` (PR #22) · **Bezug:** `audit/GO_NO_GO_REPORT.md` (B-1/M-1), `audit/TENANT_ROUTE_COVERAGE.md` (P0)

## Befund (vorher)

Der Caregiver-Pfad von `POST /api/billing/auto-invoice` prüfte nur, DASS der Aufrufer eine Betreuungskraft ist (`requireCaregiverSession`) — nicht, ob der per Body gelieferte `client_id`/`service_record_id` ihr zugeordnet ist. Danach lief alles über `service_role` (RLS + org_fence umgangen): Einsatzdaten, Versicherungsdaten des Klienten (`clients.insurance_*`, `versichertennummer`) und der Rechnungs-Insert. Zusätzlich wurden `invoices`/`invoice_items` ohne `organization_id` angelegt → Spalten-Default `current_org_id()` evaluiert unter `service_role` zur Stamm-Org (Datenvermischung bei Mandanten-Klienten).

**Wirkung:** Jede Betreuungskraft konnte für JEDEN Klienten Rechnungen erzeugen und dabei Versicherungsdaten sowie Einsatz-Metadaten (`pending`-Liste mit Record-IDs/Daten/Status) beliebiger Klienten einsehen. Cross-Client heute, Cross-Tenant sobald Mandanten-Betreuungskräfte existieren.

## Geänderte Dateien

| Datei | Änderung |
|---|---|
| `app/api/billing/auto-invoice/route.ts` | Fix (Details unten) |
| `__tests__/security/p0-auto-invoice-cross-client.test.ts` | **NEU** — 7 Vitest-Tests für den Fix |
| `audit/P0_FIX_REPORT_ALLTAGSENGEL.md` | dieser Report |

## Was genau gefixt wurde

1. **Auth-Kontext typisiert:** `authorize()` liefert jetzt `role: 'admin'` oder `role: 'caregiver'` inkl. `caregiverId` — vorher ging die Rolleninformation nach der Auth verloren, sodass der Handler gar nicht unterscheiden KONNTE.
2. **`service_record_id`-Variante:** Der Record wird inkl. `caregiver_id` geladen; für Betreuungskräfte wird `rec.caregiver_id === auth.caregiverId` erzwungen (403 „Kein Zugriff auf diesen Leistungsnachweis") — identisches Muster wie `native/geo-events`, `native/signatures`, `native/leistungsnachweis-upload`.
3. **`client_id`+`month`-Variante:** Zuordnungs-Check VOR jedem Datenzugriff: es muss eine `assignments`-Zeile (caregiver↔client) ODER mindestens ein eigener `service_record` beim Klienten im angefragten Monat existieren, sonst 403 „Kein Zugriff auf diesen Klienten". Der Check läuft auch bei unbekannter `client_id` in den 403 — **kein Existenz-Orakel** (vorher unterschied die Route 404/„Keine Einsätze" und verriet damit gültige Client-UUIDs).
4. **Reihenfolge gehärtet:** Klienten-Load (Versicherungsdaten!) und Monats-Records werden erst NACH bestandenem Zuordnungs-Check geladen; die `pending`-Liste (Record-IDs/Daten/Status) ist damit nur noch für zugeordnete Betreuungskräfte bzw. Admins erreichbar.
5. **`organization_id` explizit gesetzt:** `invoices`- und `invoice_items`-Inserts übernehmen `clients.organization_id` (Vorgabe aus M-1: „organization_id des Klienten auf die Rechnung übernehmen"). Kein Stamm-Org-Default-Fallback mehr über `service_role`. Fehlt der Klient, bricht die Route jetzt mit 404 ab statt eine Rechnung mit `insurance_* = null` zu erzeugen.
6. **`service_role`-Verwendung geprüft:** bleibt notwendig (Betreuungskräfte dürfen laut RLS keine `invoices` anlegen — die „alles unterschrieben"-Prüfung ersetzt die manuelle Freigabe), ist aber jetzt vollständig hinter Ownership-/Zuordnungs-Checks gekapselt. Admin-Cookie-Pfad unverändert (`profiles.role in ('admin','superadmin')` via Anon-Client).

## Testergebnisse

**Neue Suite `__tests__/security/p0-auto-invoice-cross-client.test.ts` (7/7 PASS):**

1. Ohne Auth → 401, keine DB-Schreibzugriffe
2. Caregiver + fremder `service_record` → 403, kein `invoices`/`invoice_items`-Insert
3. Caregiver + fremde `client_id`/`month` ohne Zuordnung → 403, `clients`-Tabelle wird gar nicht erst abgefragt (Versicherungsdaten unerreichbar)
4. Caregiver + unbekannte `client_id` → 403 (kein Existenz-Orakel)
5. Caregiver + eigener Record → 201, `invoices.organization_id` = Org des Klienten, ALLE `invoice_items` tragen `organization_id`
6. Caregiver + `client_id`/`month` mit `assignments`-Zuordnung → 201 (Positivfall bleibt funktional)
7. Admin-Pfad → 201 mit `organization_id`, ohne Zuordnungs-Check

**Gesamtläufe (lokal, 2026-08-03):**

| Lauf | Ergebnis |
|---|---|
| `npx vitest run` (gesamte `__tests__/`-Suite) | ✅ 43 passed, 5 skipped (die 5 Skips sind die dynamischen Shadow-DB-RLS-Tests, die nur mit laufender Shadow-DB via `scripts/shadow-db.sh` scharf sind — unverändert zum Branch-Stand) |
| `npm run test:unit` (node:test, `lib/**`) | ✅ 29/29 pass |
| `npx tsc --noEmit` | ✅ 0 Fehler |

## Weitere Routen mit ähnlichem Pattern?

Systematisch geprüft (alle `requireCaregiverSession`-Nutzer + Abgleich mit `audit/TENANT_ROUTE_COVERAGE.md`):

- **Kein weiterer P0.** Die drei übrigen Caregiver-Bearer-Routen (`native/geo-events`, `native/signatures`, `native/leistungsnachweis-upload`) prüfen `record.caregiver_id === auth.caregiverId` bereits korrekt — `auto-invoice` war die einzige Route ohne Zuordnungs-Check bei Body-IDs.
- **Bekannte P1 bleiben offen** (unverändert, dokumentiert in `TENANT_ROUTE_COVERAGE.md` / Maßnahme M-3): Service-Role-Inserts ohne `organization_id` in `native/geo-events` (`geo_events`, `review_errors`), `native/leistungsnachweis-upload` (`ocr_results`), `native/signatures` (`service_signatures`) — dort ist Ownership geprüft, nur das Org-Feld fehlt (Stamm-Org-Default); dazu die org-blinden SR-Admin-Reads (`admin/abrechnung/zertifikat`, `leistungsnachweis`, `pricing`, `cron/review-request`, `admin/manage-role`, `admin/reset-password`). Diese sind KEINE Cross-Client-Ownership-Lecks nach dem B-1-Muster und gehören zu M-3, nicht zu diesem P0-Fix.

## Stoppregeln eingehalten

Kein Merge · kein Prod-Deploy (nur automatischer Vercel-Preview-Build des Branch-Pushs) · kein Push auf `main` (nur `audit/phase3-production-readiness`) · keine Änderung an der Produktiv-DB · DSGVO-Löschroute (P1/M-2) bewusst NICHT angefasst.
