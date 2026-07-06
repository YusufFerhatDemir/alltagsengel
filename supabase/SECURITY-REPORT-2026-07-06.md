# Security-Audit Bericht — 06.07.2026

## Alltagsengel (nnwyktkqibdjxgimjyuq)

| Metrik | Wert |
|--------|------|
| Tabellen gesamt | 110 |
| RLS aktiv | 110 (100%) |
| RLS fehlend | 0 |
| Policies gesamt | 302 |
| Offene USING(true) (nicht-service_role) | 9 (alle akzeptiert — öffentliche SELECTs + Analytics-INSERTs) |
| Public Storage-Buckets | 0 |
| Private Storage-Buckets | 2 (mis-documents, service-proofs) |
| SECURITY DEFINER Funktionen | alle mit search_path=public |
| Service-Role im Frontend | NEIN |

### Durchgeführte Fixes

1. **mis_crm_activities** — RLS + FORCE RLS aktiviert, 5 rollenbasierte Policies erstellt
2. **14 MIS-Tabellen** — Offene ALL-Policies mit USING(true) entfernt und durch rollenbasierte Policies ersetzt:
   - mis_applicants, mis_availability, mis_complaints, mis_contracts
   - mis_job_postings, mis_privacy_audit_log, mis_privacy_consents
   - mis_privacy_records, mis_privacy_requests, mis_shifts
   - mis_signature_requests, mis_training_catalog, mis_training_records, mis_vehicles
3. **Audit-Logs** — append-only Trigger (UPDATE/DELETE blockiert)
4. **Rechnungen** — Finalisierungsschutz (versendet/bezahlt/storniert nicht änderbar)
5. **Service Records** — Freigegebene nur über Korrektur änderbar
6. **Monatsabschluss** — Abgeschlossene nicht mehr änderbar

### Akzeptierte offene Policies (gewollt)

- angels, angel_reviews, reviews — öffentlich lesbar (Bewertungen)
- kf_feature_flags — Feature Flags lesbar
- lead_inquiries — anonymes Kontaktformular
- page_views, visitors, visitor_locations — anonyme Analytics

---

## efy care (nsfbwhpjesmathsrqkfi)

| Metrik | Wert |
|--------|------|
| Tabellen gesamt | 30 |
| RLS aktiv | 30 (100%) |
| RLS fehlend | 0 |
| Policies gesamt | 70 |
| Offene USING(true) (nicht-service_role) | 0 |
| Public Storage-Buckets | 0 |
| Private Storage-Buckets | 3 (leistungsnachweise, rechnungspakete, qualitaetsmanagement) |
| SECURITY DEFINER Funktionen | 9, alle mit search_path=public |
| Service-Role im Frontend | NEIN |

### Durchgeführte Fixes

1. **FORCE RLS** auf alle 27 kritischen Tabellen
2. **Audit-Logs** — append-only Trigger
3. **Rechnungen** — Finalisierungsschutz
4. **Service Records** — Freigegebene nur über Korrektur
5. **Monatsabschluss** — Abgeschlossene gesperrt

---

## Security-Tests: 7/7 bestanden (beide Projekte)

1. Alle Tabellen RLS aktiv ✅
2. Keine offenen ALL-Policies ✅
3. Alle Storage-Buckets privat ✅
4. Audit-Logs append-only ✅
5. Alle DEFINER mit search_path ✅
6. mis_crm_activities RLS + FORCE ✅
7. Rechnungs-Finalisierungsschutz ✅

## Nächste Schritte

- ANTHROPIC_API_KEY als Supabase Secret setzen (OCR Edge Function)
- Mandanten-Trennung (tenant_id) bei Multi-Tenant-Betrieb implementieren
- Regelmäßige Security-Audits einplanen
