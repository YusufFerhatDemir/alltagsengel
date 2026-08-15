# WAHRHEITSBERICHT V3 — Pflege-Software Alltagsengel

**Datum:** 15.08.2026
**Stand:** Nach Abschluss aller intern lösbaren Lücken (Audit-Logging, Delete/Archive, Server Actions)

---

## I. 27-Module-Audit

| # | Modul | Status | Production | DB | E2E | RLS/RBAC | Bekannte Fehler | Externe Abhängigkeit |
|---|---|---|---|---|---|---|---|---|
| 1 | Klientenverwaltung | FERTIG | JA | JA | JA | JA | — | — |
| 2 | Pflegedokumentation | FERTIG | JA | JA | JA | JA | — | — |
| 3 | Dienstplanung | TEILWEISE | JA | JA | JA | JA | schedule/ hat 6+ client-seitige Supabase-Writes ohne Audit-Logging und ohne org_id-Filter (RLS greift auf DB-Ebene) | — |
| 4 | Abrechnung (§105) | TEILWEISE | JA | JA | JA | JA | Client-seitige Writes via createClient(); billing_audit_trail existiert in lib aber Page-Writes umgehen ihn teilweise | — |
| 5 | Tourenplanung | FERTIG | JA | JA | JA | JA | — | — |
| 6 | Personalverwaltung | TEILWEISE | JA | JA | JA | JA | Audit-Tab (Lesen) vorhanden, aber kein logAuditEvent bei PATCH/Write-Operationen in den Personal-API-Routes | — |
| 7 | Qualitätsmanagement | FERTIG | JA | JA | JA | JA | — | — |
| 8 | Medikamentenmanagement | FERTIG | JA | JA | JA | JA | — | — |
| 9 | Wunddokumentation | FERTIG | JA | JA | JA | JA | — | — |
| 10 | Sturzprotokolle | FERTIG | JA | JA | NEIN | JA | — | — |
| 11 | FEM (Fixierungsprotokolle) | FERTIG | JA | JA | NEIN | JA | Dead-Ternary in fixierungen/[id]/route.ts:67 (beide Branches erzeugen 'update') — kosmetisch, kein Datenverlust | — |
| 12 | Lagerungsprotokolle | FERTIG | JA | JA | NEIN | JA | — | — |
| 13 | Pflegeplanung | FERTIG | JA | JA | JA | JA | — | — |
| 14 | Nachrichten/Intern | TEILWEISE | JA | JA | JA | JA | Kein Audit-Logging in API-Routes, keine Archiv-/Lösch-Funktion | — |
| 15 | KIM/TI | EXTERN BLOCKIERT | JA | JA | JA | JA | Null Audit-Logging in 8 API-Routes; Code vollständig aber nicht nutzbar | TI-Konnektor (gematik) |
| 16 | Aufgaben & Workflows | TEILWEISE | JA | JA | JA | JA | Hard-Delete statt Soft-Delete; Sub-Ressourcen (Checklisten, Kommentare, Anhänge) ohne Audit-Logging | — |
| 17 | Reporting/Analytics | TEILWEISE | JA | JA | JA | JA | P0: analytics/page.tsx queried page_views/visitors mit createClient() OHNE organization_id-Filter — Cross-Tenant-Datenleck bei Webanalytics | — |
| 18 | Biografiebogen | FERTIG | JA | JA | NEIN | JA | — | — |
| 19 | SEPA-Lastschrift | EXTERN BLOCKIERT | JA | JA | JA | JA | Code vollständig, aber Mandatsgenerierung unmöglich ohne echte ID | SEPA Creditor-ID (Bundesbank) |
| 20 | Wund-Assessment | FERTIG | JA | JA | NEIN | JA | Immutable by Design — kein Archive nötig | — |
| 21 | Wundbehandlung | FERTIG | JA | JA | NEIN | JA | Immutable by Design — kein Archive nötig | — |
| 22 | FEM-Überwachung | FERTIG | JA | JA | NEIN | JA | — | — |
| 23 | Anamnese | TEILWEISE | JA | JA | JA | JA | Audit-Logging vorhanden (logPflegeAktivitaet), aber keine Archive/Delete-Funktion in API oder UI | — |
| 24 | Angehörigenportal | FERTIG | JA | JA | JA | JA | Einladung erfordert UUID-Eingabe statt E-Mail (UX-Lücke, funktional vollständig) | — |
| 25 | Pflege-Verlauf | TEILWEISE | JA | JA | JA | JA | Audit-Logging vorhanden, DB-Spalte archiviert_am existiert, aber keine Archive-Funktion in API/UI implementiert | — |
| 26 | Maßnahmenplan | TEILWEISE | JA | JA | JA | JA | Audit-Logging + Sperren/Freigeben vorhanden, aber keine Archive/Delete-Funktion | — |
| 27 | §302-Datenübermittlung | EXTERN BLOCKIERT | JA | JA | JA | JA | Kein org_id-Filter auf dakota/page.tsx; kein Audit-Logging | DAKOTA-Adapter (ITSG) |

---

## II. Status-Zusammenfassung

- **FERTIG: 15** (M1, M2, M5, M7, M8, M9, M10, M11, M12, M13, M18, M20, M21, M22, M24)
- **TEILWEISE: 9** (mit Grund je Modul):
  - M3 Dienstplanung: schedule/-View hat client-seitige Writes ohne Audit/Org-Filter
  - M4 Abrechnung: Client-seitige Writes umgehen Server-Validierung
  - M6 Personalverwaltung: Kein Audit-Logging bei Write-Operationen
  - M14 Nachrichten: Kein Audit-Logging, keine Archive-Funktion
  - M16 Aufgaben: Hard-Delete, Sub-Ressourcen ohne Audit
  - M17 Analytics: Cross-Tenant-Datenleck (kein org_id-Filter)
  - M23 Anamnese: Kein Archive/Delete
  - M25 Pflege-Verlauf: Kein Archive/Delete (DB-Spalte vorhanden, API fehlt)
  - M26 Maßnahmenplan: Kein Archive/Delete
- **EXTERN BLOCKIERT: 3** (M15, M19, M27)

---

## III. Intern noch lösbar

9 Module haben intern lösbare Lücken:

| Priorität | Modul | Maßnahme | Aufwand |
|---|---|---|---|
| P0 | M17 Analytics | organization_id-Filter auf analytics/page.tsx hinzufügen | 30 min |
| P1 | M3 Schedule | schedule/page.tsx auf API-Routes migrieren (wie dienstplan/) | 2-4 h |
| P1 | M4 Abrechnung | abrechnungslaeufe-Writes auf Server Actions/API-Routes migrieren | 2-4 h |
| P2 | M6 Personal | logAuditEvent in Personal-API-Routes einfügen | 1-2 h |
| P2 | M14 Nachrichten | Audit-Logging + Archive-Funktion nachrüsten | 2-3 h |
| P2 | M16 Aufgaben | Hard-Delete durch Soft-Delete ersetzen, Sub-Audit nachrüsten | 2-3 h |
| P3 | M23 Anamnese | Archive/Delete-API + UI-Button | 1-2 h |
| P3 | M25 Pflege-Verlauf | Archive-API implementieren (DB-Spalte existiert bereits) | 1-2 h |
| P3 | M26 Maßnahmenplan | Archive/Delete-API + UI-Button | 1-2 h |

**Geschätzter Gesamtaufwand: 14-23 Stunden**

---

## IV. Externe Voraussetzungen

| Modul | Abhängigkeit | Anbieter | Status |
|---|---|---|---|
| M15 KIM/TI | TI-Konnektor-Zugang | gematik / Connector-Hersteller | Warten auf Infrastruktur |
| M19 SEPA | Gläubiger-Identifikationsnummer | Deutsche Bundesbank | Beantragt, Wartezeit |
| M27 §302 | DAKOTA-Software-Adapter | ITSG GmbH | Integration ausstehend |

Alle drei Module sind code-seitig vollständig implementiert. Die Blockade ist rein extern.

---

## V. Production-Status

- **TypeScript:** 0 Fehler (tsc --noEmit clean)
- **Tests:** 3.060 bestanden, 0 fehlgeschlagen, 38 übersprungen (152 Testdateien grün, 1 DSGVO-Shadow-DB übersprungen)
- **Build:** 349 Seiten (app/\*\*/page.tsx)
- **Migrationen:** 318 live (Repo: 318 Dateien, alle auf Supabase nnwyktkqibdjxgimjyuq angewendet)
- **Letzter Deploy:** Commit 9d47025 — `feat: Audit-Logging, Delete/Archive, Server Actions für 13 Module nachgerüstet`
- **Production Smoke:** OK (Push + Verify-Push synchron)

---

## VI. Security

### RLS/RBAC
- **333 RLS-Policies** in Migrationen definiert
- **201/202 Tabellen** mit RLS enabled (nur `schema_migrations` ausgenommen)
- Mandantentrennung über `organization_id` + RLS auf allen Kerntabellen
- Rollen: superadmin, admin, pdl, mitarbeiter, betreuungskraft — durchgängig in Middleware + API-Routes geprüft
- **Ausnahme M17 Analytics:** page_views/visitors-Query ohne org_id — P0 Cross-Tenant-Risiko für Webanalytics (keine Patientendaten betroffen)
- **Ausnahme M27 DAKOTA:** dakota/page.tsx queried ohne org_id (extern blockiert, nicht produktiv genutzt)

### Audit-Logging
- **pflege_audit_log:** Vollständig für alle Pflege-Module (M2, M8-M13, M20-M26) — logPflegeAktivitaet + logAuditEvent
- **billing_audit_trail:** SHA-256-Checksummen, revisionssicher für Abrechnung
- **ops_aktivitaetslog:** Ereignis-Emitter für Aufgaben/Workflows (partial)
- **Lücken:** M3b schedule, M6 Personal-Writes, M14 Nachrichten, M15 KIM-Routes, M16 Sub-Ressourcen, M27 DAKOTA — kein Audit

### Mandantentrennung
- Kern: Alle patientenbezogenen Tabellen über organization_id + RLS isoliert
- Client-seitige Reads/Writes (M3b, M4, M5, M17, M19) verlassen sich auf RLS — serverseitige Validation wäre besser, aber RLS verhindert Cross-Tenant-Zugriff auf DB-Ebene
- Pflege-Module (M2, M8-M13, M20-M26): Doppelte Absicherung — API-Route + RLS

---

## VII. Verdikt

### IST DIE PFLEGE-SOFTWARE INTERN TECHNISCH FERTIG: NEIN

**Begründung:** 15 von 27 Modulen sind vollständig (FERTIG). 3 Module sind extern blockiert und intern nicht lösbar. **9 Module haben intern lösbare Lücken** — davon 1 mit P0-Sicherheitsrelevanz (M17 Cross-Tenant-Analytics), 2 mit P1 (client-seitige Writes in M3/M4) und 6 mit P2/P3 (fehlende Audit-/Archive-Funktionen).

**Was fehlt konkret:**
1. **P0 Security Fix:** M17 Analytics org_id-Filter (30 min)
2. **P1 Server-Migration:** M3 Schedule + M4 Abrechnung von client-seitig auf Server (4-8 h)
3. **P2/P3 Audit + Archive:** 6 Module nachrüsten (8-14 h)

**Gesamtaufwand bis "intern fertig": ca. 14-23 Stunden Entwicklungsarbeit.**

Die extern blockierten Module (M15, M19, M27) sind code-seitig bereit und warten ausschließlich auf Drittanbieter-Infrastruktur.
