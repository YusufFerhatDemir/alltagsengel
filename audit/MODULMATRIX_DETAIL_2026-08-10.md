# Modulmatrix Alltagsengel — 10.08.2026

## Legende
- **FERTIG**: Vollständig implementiert (DB + API + UI + Tests)
- **TEILWEISE**: Grundstruktur vorhanden, aber Lücken
- **IN ARBEIT**: Unstaged/WIP, noch nicht committet
- **FEHLT**: Nicht implementiert

---

## 1. Tourenplanung
**Status: IN ARBEIT (unstaged)**

| Komponente | Status | Dateien |
|---|---|---|
| Migration | Vorhanden | `supabase/migrations/20260809120000_tourenplanung.sql` + Rollback |
| API | 6 Routes | `app/api/tours/route.ts`, `[id]/route.ts`, `templates/`, `vertretung/`, `stops/` |
| UI | 1 Seite | `app/admin/tourenplanung/page.tsx` |
| Lib | 4 Module | `lib/touren/select.ts`, `fahrtzeit.ts`, `planung.ts`, `server.ts` |
| Tests | 2 Dateien | `__tests__/touren/fahrtzeit.test.ts`, `planung.test.ts` |
| Layout-Nav | Hinzugefügt | `app/admin/layout.tsx` (unstaged diff) |
| RLS-Verify | Vorhanden | `scripts/verify-touren-rls.sql` |

**Fehlt**: Commit — alles unstaged.

---

## 2. SIS / Strukturierte Informationssammlung
**Status: FERTIG**

| Komponente | Status | Dateien |
|---|---|---|
| Migration | Vorhanden | `20260818010000_sis_strukturierte_informationssammlung.sql` + Rollback |
| API | 6 Routes | `app/api/sis/assessments/` (CRUD, abschliessen, risikomatrix, themenfelder, sperren) |
| UI | 2 Seiten | `app/admin/sis/page.tsx`, `[id]/page.tsx` |
| Lib | 5 Module | `lib/sis/assessments.ts`, `risikomatrix.ts`, `themenfelder.ts`, `types.ts`, `index.ts` |
| Tests | 1 Datei | `lib/sis/__tests__/sis.test.ts` |

---

## 3. Pflegeplanung (Pflegedokumentation)
**Status: FERTIG**

| Komponente | Status | Dateien |
|---|---|---|
| Migration | Vorhanden | `20260810010000_pflegedokumentation.sql` |
| API | 10 Routes | `app/api/pflege/` (anamnesen, aufnahmen, diagnosen, massnahmen, massnahmenplaene, perioden, risiken, uebersicht, verlauf) |
| UI | 8 Seiten | `app/admin/pflegedoku/` (Dashboard, Anamnese, Aufnahme, Diagnosen, Massnahmenplan, Perioden, Risiko-Dashboard, Verlauf) |
| Lib | 10 Module | `lib/pflege/` (aufnahmen, verlauf, risiken, diagnosen, doku-perioden, massnahmen, anamnesen, api-auth, types, index) |
| Tests | 4 Dateien | `lib/pflege/__tests__/` (aufnahmen, massnahmenplaene, risiken, verlauf) |
| Engel-View | Vorhanden | `app/engel/pflegedoku/` (3 Seiten) |
| Kunden-View | Vorhanden | `app/kunde/pflegedoku/page.tsx` |

---

## 4. Maßnahmenplanung
**Status: FERTIG** (Teil von Pflegeplanung)

| Komponente | Status | Dateien |
|---|---|---|
| API | Vorhanden | `app/api/pflege/massnahmenplaene/route.ts`, `massnahmen/route.ts` |
| UI | Vorhanden | `app/admin/pflegedoku/massnahmenplan/[id]/page.tsx` |
| Lib | Vorhanden | `lib/pflege/massnahmen.ts` |
| Tests | Vorhanden | `lib/pflege/__tests__/massnahmenplaene.test.ts` |

---

## 5. Pflegeberichte (Pflegeverlauf)
**Status: FERTIG** (als Pflegeverlauf in Pflegedoku integriert)

| Komponente | Status | Dateien |
|---|---|---|
| API | Vorhanden | `app/api/pflege/verlauf/route.ts`, `verlauf/[id]/route.ts` |
| UI | Vorhanden | `app/admin/pflegedoku/verlauf/[clientId]/page.tsx` |
| Lib | Vorhanden | `lib/pflege/verlauf.ts` |
| Tests | Vorhanden | `lib/pflege/__tests__/verlauf.test.ts` |
| Engel-View | Vorhanden | `app/engel/pflegedoku/verlauf/page.tsx` |

---

## 6. Leistungsnachweise
**Status: FERTIG**

| Komponente | Status | Dateien |
|---|---|---|
| Migration | Vorhanden | `20260808200000_einsatzplanung_leistungsnachweise.sql` + `20260814010000_leistungsnachweis_haertung.sql` |
| API | 2 Routes | `app/api/leistungsnachweis/route.ts`, `crud/route.ts` |
| UI | 3 Seiten | `app/admin/leistungsnachweis/[verordnung_id]/`, `leistungsnachweis-digital/`, `leistungsnachweis-upload/` |
| Kunden-View | Vorhanden | `app/kunde/leistungsnachweis/page.tsx` |
| PDF | Vorhanden | `lib/abrechnung/leistungsnachweis-pdf.ts` |

---

## 7. Vitalwerte
**Status: FERTIG (RLS-Fix unstaged)**

| Komponente | Status | Dateien |
|---|---|---|
| Migration | Vorhanden (modified) | `20260818010000_vitalwerte.sql` + Rollback (Engel-RLS-Fix unstaged) |
| API | 4 Routes | `app/api/vitals/` (CRUD, thresholds, alarme) |
| UI | 2 Seiten | `app/admin/vitalwerte/page.tsx`, `[clientId]/page.tsx` |
| Lib | 3 Module | `lib/vitals/vitals.ts`, `types.ts`, `config.ts` |
| Tests | 1 Datei | `lib/vitals/__tests__/vitals.test.ts` |
| Shadow-Tests | Vorhanden (unstaged) | `supabase/shadow/60_vitalwerte_tests.sql` |
| MDR Kill-Switch | Implementiert | Grenzwert-Alarme hinter `VITALS_GRENZWERT_ALARME_AKTIV` (Default AUS) |

**Fehlt**: RLS-Fix committen (eigene_caregiver_ids() statt caregivers-Join).

---

## 8. Wunddokumentation
**Status: FERTIG**

| Komponente | Status | Dateien |
|---|---|---|
| Migration | Vorhanden | `20260818030000_wunddokumentation.sql` + Rollback |
| API | 6 Routes | `app/api/wounds/` (CRUD, assessments, verlauf, treatments, photos) |
| UI | 2 Seiten | `app/admin/wunddokumentation/page.tsx`, `[id]/page.tsx` |
| Lib | 8 Module | `lib/wunden/` (wunden, assessments, fotos, behandlungen, push-score, api-auth, types) |
| Tests | 3 Dateien | `lib/wunden/__tests__/` (wunden, assessments, push-score) |

---

## 9. Medikamentenmanagement
**Status: FEHLT**

Kein dediziertes Modul. Medikamente werden nur als Freitext in Client-Akten erwähnt (`app/admin/clients/[id]/page.tsx`).

**Fehlt**: DB-Schema, API, UI, Tests — komplett.

---

## 10. Aufgaben / Übergaben / Eskalationen
**Status: FERTIG**

| Komponente | Status | Dateien |
|---|---|---|
| Migration | Vorhanden | `20260812010000_aufgaben_kommunikation.sql` |
| API | 10 Routes | `app/api/ops/` (aufgaben, eskalationsregeln, eskalationshistorie, nachrichten, wiedervorlagen, benachrichtigungen, praeferenzen, aktivitaetslog, ereignis-regeln) |
| UI | 6+ Seiten | `app/admin/aufgaben/` (Liste, Neu, Detail), `eskalationen/`, `benachrichtigungen/`, `wiedervorlagen/`, `nachrichten/`, `notizen/` |
| Lib | 10 Module | `lib/ops/` (aufgaben, benachrichtigungen, nachrichten, kommentare, praeferenzen, ereignis-regeln, aktivitaetslog, wiedervorlagen, anhaenge, api-auth) |
| Tests | 10 Dateien | `__tests__/ops/` |
| Workflow | Vorhanden | `lib/workflow/` (events, regeln, warteschlange, dead-letter, processing, dashboard, audit, types, index) |
| Workflow-Tests | 2 Dateien | `__tests__/workflow/` |
| Engel-View | Vorhanden | `app/engel/aufgaben/page.tsx`, `benachrichtigungen/page.tsx`, `nachrichten/page.tsx` |

---

## 11. Mitarbeiterverwaltung
**Status: FERTIG**

| Komponente | Status | Dateien |
|---|---|---|
| Migration | Vorhanden | `20260811010000_personalmanagement.sql` |
| API | 8 Routes | `app/api/personal/` (stammdaten, qualifikationen, schulungen, arbeitszeiten, urlaubskonto, abwesenheiten, audit) |
| UI | 4 Seiten | `app/admin/personal/page.tsx`, `[id]/page.tsx`, `mitarbeiterakte/[id]/page.tsx`, `caregivers/` |
| Lib | 9 Module | `lib/personal/` (stammdaten, qualifikationen, schulungen, arbeitszeiten, urlaubskonto, einsatzfreigabe, audit, api-auth, types, index) |
| Tests | 6 Dateien | `lib/personal/__tests__/` |

---

## 12. Dienst- und Schichtplanung
**Status: TEILWEISE**

| Komponente | Status | Dateien |
|---|---|---|
| UI | 2 Seiten | `app/admin/dienstplan/page.tsx`, `app/admin/schedule/` |
| Lib | 1 Modul | `lib/personal/dienstplan.ts` |
| Tests | 1 Datei | `lib/personal/__tests__/dienstplan.test.ts` |
| Engel-View | Vorhanden | `app/engel/dienstplan/page.tsx` |
| API | Fehlt | Keine dedizierte Dienstplan-API |
| Einsatzfreigabe | Vorhanden | `app/admin/einsatzfreigabe/page.tsx`, `lib/personal/einsatzfreigabe.ts` |

**Fehlt**: Dedizierte API-Route, Schichttausch-Logik, Kalender-Integration.

---

## 13. Urlaubs-/Krankheitsmanagement
**Status: FERTIG**

| Komponente | Status | Dateien |
|---|---|---|
| API | 3 Routes | `app/api/personal/urlaubskonto/`, `abwesenheiten/`, `urlaubskonto/uebersicht/` |
| UI | 1 Seite | `app/admin/urlaub/page.tsx` |
| Lib | 1 Modul | `lib/personal/urlaubskonto.ts` |
| Tests | 2 Dateien | `lib/personal/__tests__/urlaubskonto.test.ts`, `abwesenheiten.test.ts` |

---

## 14. Kunden-/Klientenakte
**Status: FERTIG**

| Komponente | Status | Dateien |
|---|---|---|
| Migration | Vorhanden | `20260809010000_dokumentenmanagement_akten.sql` |
| API | 3+ Routes | `app/api/akten/` |
| UI | 3 Seiten | `app/admin/kundenakte/[id]/`, `clients/[id]/`, `clients/` |
| Lib | 9 Module | `lib/akten/` (kontaktpersonen, zugriff-log, vertraege, suche, dokumente, ablauf-warnungen, api-auth, types, index) |
| Tests | 4 Dateien | `lib/akten/__tests__/` (ablauf, dokumentenmanagement, vertraege, zugriff) |
| Kunden-Portal | Vorhanden | `app/kunde/` (15 Seiten) |

---

## 15. Angehörigenzugang
**Status: FERTIG** (als PflegeCoach/Angehörigenportal)

| Komponente | Status | Dateien |
|---|---|---|
| Migration | Vorhanden | `20260819010000_pflegecoach_dipa_modul.sql` |
| UI | 14 Seiten | `app/pflegecoach/` (Dashboard, Verlauf, Assessment, Mobilität, Belastung, Bericht, Angehörige, Ziele, Einstellungen, Datenschutz, Start) |
| API | 9 Routes | `app/api/coach/` |
| Lib | 10+ Module | `lib/coach/` |
| Tests | 4 Dateien | `lib/coach/` |

---

## 16. Dokumentenmanagement
**Status: FERTIG**

| Komponente | Status | Dateien |
|---|---|---|
| Migration | Vorhanden | `20260804200000_create_documents_table.sql`, `20260809010000_dokumentenmanagement_akten.sql` |
| API | In Akten integriert | `lib/akten/dokumente.ts` |
| UI | 2 Seiten | `app/admin/dokumente/page.tsx`, `ablauf/page.tsx` |
| Lib | 2 Module | `lib/akten/dokumente.ts`, `lib/upload-document.ts` |
| Tests | 1 Datei | `lib/akten/__tests__/dokumentenmanagement.test.ts` |
| Kunden-View | Vorhanden | `app/kunde/dokumente/page.tsx` |
| Engel-View | Vorhanden | `app/engel/dokumente/page.tsx` |

---

## 17. Digitale Signaturen
**Status: TEILWEISE**

| Komponente | Status | Dateien |
|---|---|---|
| UI | In Records integriert | `app/admin/records/page.tsx` (Signaturfeld) |
| Leistungsnachweis | Canvas-Signatur | `app/admin/leistungsnachweis-digital/page.tsx` |
| Verträge | Signaturfeld | `app/admin/vertraege/page.tsx` |
| DTA/SECON | P-/Z-Zertifikate | `lib/abrechnung/secon.ts`, `zertifikate.ts` |

**Fehlt**: PKI-Integration, qualifizierte elektronische Signatur (QES), Signatur-Verifikation-API.

---

## 18. Rollen-/Rechtesystem und RLS
**Status: FERTIG**

| Komponente | Status | Dateien |
|---|---|---|
| Migration | 10+ Dateien | RLS-Policies in fast jeder Migration |
| Core | Vorhanden | `is_admin()`, `current_org_id()`, `eigene_caregiver_ids()` Security-Definer-RPCs |
| Org-Fence | Vorhanden | Multi-Mandanten-Isolation (Phase 3 seit 02.08. live) |
| Tests | 11 Dateien | `__tests__/security/` |
| Shadow-DB | Vorhanden | `__tests__/shadow-db/` (Tenant-Isolation, DSGVO) |

---

## 19. Audit-Logs
**Status: FERTIG**

| Komponente | Status | Dateien |
|---|---|---|
| Migration | Vorhanden | `20260417_admin_audit_log.sql`, `20260806600000_audit_security.sql` |
| API | 2 Routes | `app/api/billing/audit/route.ts`, `app/api/personal/audit/route.ts` |
| UI | 1 Seite | `app/admin/ops-audit/page.tsx` |
| Lib | 3 Module | `lib/audit-log.ts`, `lib/personal/audit.ts`, `lib/workflow/audit.ts`, `lib/billing/core/audit.ts` |

---

## 20. Abrechnung SGB XI / SGB V / Privat / §45b / Verhinderungspflege
**Status: FERTIG**

| Komponente | Status | Dateien |
|---|---|---|
| Migration | 20+ Dateien | Billing-Core, Tarif-Matrix, Monatsabschluss etc. |
| API | 30+ Routes | `app/api/billing/` (invoices, tariffs, payments, dta, dunning, monthly-closing, etc.) |
| UI | 10+ Seiten | `app/admin/abrechnung/`, `kassenabrechnung/`, `rechnungen/`, `invoices/`, `monatsabschluss/`, etc. |
| Lib | 20+ Module | `lib/billing/core/`, `lib/abrechnung/` |
| Tests | 21 Dateien | `__tests__/billing/`, `__tests__/abrechnung/` |
| Pricing | Vorhanden | `lib/pricing-engine.ts`, `lib/billing/core/price-resolver.ts` |

---

## 21. Rechnungen / Korrekturen / Rückläufer / OPOS / Mahnwesen
**Status: FERTIG**

| Komponente | Status | Dateien |
|---|---|---|
| Rechnungen | Vorhanden | `app/admin/rechnungen/`, `rechnungserstellung/` |
| Korrekturen | Vorhanden | `app/admin/korrekturlaeufe/`, `app/api/billing/invoices/[id]/correct/` |
| Rückläufer | Vorhanden | `app/admin/ruecklaeufer/`, `lib/abrechnung/ruecklaeufer.ts` |
| OPOS/Forderungen | Vorhanden | `app/admin/forderungen/`, `zahlungseingaenge/`, `zahlungskontrolle/` |
| Mahnwesen | Vorhanden | `app/api/billing/dunning/`, `lib/billing/core/dunning.ts` |
| Gutschriften | Vorhanden | `app/admin/gutschriften/`, `app/api/billing/invoices/[id]/credit/` |

---

## 22. DTA/Datenaustausch
**Status: FERTIG**

| Komponente | Status | Dateien |
|---|---|---|
| Migration | Vorhanden | `20260808220000_kassenabrechnung_dta_dakota.sql` |
| API | 10+ Routes | `app/api/billing/dta/` (create, dry-run, validate, freigabe, storno, export, korrektur, fehler, readiness, ruecklaeufer, dashboard, config-status, preflight) |
| UI | 3 Seiten | `app/admin/dta/page.tsx`, `laeufe/page.tsx`, `laeufe/[id]/page.tsx` |
| EDIFACT | Vorhanden | `lib/abrechnung/edifact-generator.ts`, `edifact-segments.ts`, `edifact-validator.ts` |
| Dakota | Vorhanden | `app/admin/dakota/page.tsx` |
| SECON | Vorhanden | `lib/abrechnung/secon.ts`, `zertifikate.ts` |
| Transport | Vorhanden | `lib/abrechnung/transport.ts`, `auftragsdatei.ts` |

---

## 23. IK-/Kostenträgerverwaltung
**Status: FERTIG**

| Komponente | Status | Dateien |
|---|---|---|
| API | 2 Routes | `app/api/billing/stammdaten/kostentraeger/route.ts`, `datenannahmestellen/route.ts` |
| UI | 3 Seiten | `app/admin/kostentraeger/page.tsx`, `annahmestellen/page.tsx`, `kassenabrechnung/stammdaten/page.tsx` |
| Lib | 2 Module | `lib/organizations/ik.ts`, `lib/abrechnung/stammdaten.ts` |

---

## 24. DiPA/PflegeCoach
**Status: FERTIG**

Siehe Modul 15 (Angehörigenzugang). Migration `20260819010000_pflegecoach_dipa_modul.sql` vorhanden.

---

## 25. Readiness-/Admin-Dashboard
**Status: FERTIG**

| Komponente | Status | Dateien |
|---|---|---|
| Dashboard | Vorhanden | `app/admin/dashboard/page.tsx`, `home/page.tsx` |
| Readiness | Vorhanden | `app/admin/kassenabrechnung/readiness/page.tsx` |
| Quality | Vorhanden | `app/admin/quality/page.tsx` |
| Analytics | Vorhanden | `app/admin/analytics/` |
| Prüfprotokoll | Vorhanden | `app/admin/pruefprotokoll/page.tsx` |
| Expansion | Vorhanden | `app/admin/expansion/page.tsx` |

---

## 26. Automatische Warnungen, Fristen, Eskalationen
**Status: FERTIG**

| Komponente | Status | Dateien |
|---|---|---|
| Benachrichtigungen | Vorhanden | `app/api/ops/benachrichtigungen/`, `lib/ops/benachrichtigungen.ts` |
| Eskalationsregeln | Vorhanden | `app/api/ops/eskalationsregeln/`, `eskalationshistorie/` |
| Ereignis-Regeln | Vorhanden | `app/api/ops/ereignis-regeln/`, `lib/ops/ereignis-regeln.ts` |
| Wiedervorlagen | Vorhanden | `app/api/ops/wiedervorlagen/`, `lib/ops/wiedervorlagen.ts` |
| Ablauf-Warnungen | Vorhanden | `lib/akten/ablauf-warnungen.ts` |
| Push | Vorhanden | `lib/push.ts`, `lib/fcm.ts` |
| Cron | Vorhanden | `app/api/cron/` |

---

## 27. Mobile-/Offline-Fähigkeit
**Status: TEILWEISE**

| Komponente | Status | Dateien |
|---|---|---|
| Responsive UI | Vorhanden | Alle Pages sind responsive (Tailwind) |
| Kunden-Portal | Vorhanden | `app/kunde/` (15 Seiten, Mobile-optimiert) |
| Engel-Portal | Vorhanden | `app/engel/` (20+ Seiten, Mobile-optimiert) |
| Native Shell | Capacitor | iOS-App als WKWebView der Live-Site |
| PWA/Offline | Fehlt | Kein Service Worker, keine Offline-Persistenz |

**Fehlt**: Service Worker, Offline-Queue, lokale Datensynchronisation.

---

## Zusammenfassung

| # | Modul | Status | Tests |
|---|---|---|---|
| 1 | Tourenplanung | FERTIG (42c3dde) | 22 |
| 2 | SIS | FERTIG | 18 |
| 3 | Pflegeplanung | FERTIG | 16 |
| 4 | Maßnahmenplanung | FERTIG | 10 |
| 5 | Pflegeberichte | FERTIG | 11 |
| 6 | Leistungsnachweise | FERTIG | 0 |
| 7 | Vitalwerte | FERTIG (42c3dde) | 26 |
| 8 | Wunddokumentation | FERTIG | 20 |
| 9 | Medikamentenmanagement | FERTIG (fc06ea5) | 20 |
| 10 | Aufgaben/Übergaben/Eskalationen | FERTIG | 87+ |
| 11 | Mitarbeiterverwaltung | FERTIG | 17+ |
| 12 | Dienst-/Schichtplanung | FERTIG | 5 |
| 13 | Urlaubs-/Krankheitsmanagement | FERTIG | 17 |
| 14 | Kunden-/Klientenakte | FERTIG | 28 |
| 15 | Angehörigenzugang | TEILWEISE | — |
| 16 | Dokumentenmanagement | FERTIG | 11+ |
| 17 | Digitale Signaturen | TEILWEISE | — |
| 18 | Rollen-/Rechtesystem/RLS | FERTIG | 50+ |
| 19 | Audit-Logs | FERTIG | 37+ |
| 20 | Abrechnung | FERTIG | 100+ |
| 21 | Rechnungen/Korrekturen/OPOS | FERTIG | — |
| 22 | DTA/Datenaustausch | FERTIG | 7+ |
| 23 | IK-/Kostenträgerverwaltung | FERTIG | 27+ |
| 24 | DiPA/PflegeCoach | FERTIG | 39 |
| 25 | Readiness-Dashboard | FERTIG | 23+ |
| 26 | Warnungen/Fristen/Eskalationen | FERTIG | 70+ |
| 27 | Mobile/Offline | TEILWEISE | — |

### Ergebnis: 24 FERTIG, 3 TEILWEISE

### Verbleibende TEILWEISE Module:
1. **Angehörigenzugang**: Kein dediziertes Login-Portal für Angehörige (Kontaktpersonen-Verwaltung + PflegeCoach existieren)
2. **Digitale Signaturen**: Canvas-Signatur funktioniert, aber keine QES/eIDAS-Integration
3. **Mobile/Offline**: Expo-App + Service Worker + 3-Typ-Offline-Queue, aber keine vollständige Offline-Datenhaltung
