# Gesamtbericht — Block 1 bis 21

**Stand:** 2026-08-12
**Zweck:** Vollständige Statusübersicht aller Entwicklungsblöcke der Alltagsengel-Plattform, mit Fokus auf die in dieser Session neu umgesetzten Blöcke 18–21.

> Detaillierte Modul-/Dateilisten für jeden Block stehen in `docs/ROADMAP.md`. Dieser Bericht fasst zusammen und ergänzt Test-/Commit-/Migrationsangaben.

---

## Legende

| Symbol | Bedeutung |
|--------|-----------|
| ✅ | Fertig, deployed |
| 🔄 | Gerüst / Teilfertig (bewusst, dokumentiert) |
| ❌ | Extern blockiert |

---

## Übersichtstabelle

| Block | Name | Status | Fertiggestellte Funktionen (Kurzliste) | Tests | Commit | DB-Migration | Was der User extern erledigen muss |
|---|---|---|---|---|---|---|---|
| 1 | Plattform-Grundgerüst & Ausfallmanagement | ✅ | Auth (4-Layer), Kunden/Engel/Fahrer-Portale, Admin-Dashboard, Stammdaten, Buchungssystem, PWA/Capacitor, Landing/SEO, MIS, Verordnungen, WhatsApp-Bot, KI-Chat, Stripe-Billing | diverse | diverse Commits (Basis, März 2026) | ja (Baseline) | — |
| 2 | SEPA-Lastschrift & Mahnwesen | ✅ | PAIN.008-XML, Mandatsverwaltung, Rücklastschriften, 3-Stufen-Mahnwesen, Mahnung-PDF | diverse | c1e3a41 | ja (`20260812120000`) | — |
| 3 | Rückläufer-Parser & Kassenabrechnung | ✅ | EDIFACT-Generator/Validator (TA1 6.4.0), Kassenabrechnung-Engine, SLGA-Parser, Korrekturläufe, DTA-Dashboard, DAKOTA, SECON-Stub, Fristen-Manager, 4-Augen-Freigabe | diverse | baec854 | ja | — |
| 4 | Zahlungseingangs-Matching & OPOS (CAMT) | ✅ | CAMT.053-Parser, Matching-Engine, OPOS-Manager, Zahlungskontrolle, Klärfälle, Forderungen, Payments-API | diverse | 03ab944 | ja (`20260825010000`) | — |
| 5 | DATEV-Export | ✅ | DATEV-CSV-Format, Buchungssatz-Generator, SKR03/SKR04-Kontenrahmen, konfigurierbare Kontenzuordnung | diverse | 8a6b7e5 | ja (`20260812180000`) | — |
| 6 | Einsatzplanung, Tourenplanung & Leistungsnachweise | ✅ | Einsatzfreigabe-Workflow, Tourenplanung/-optimierung, digitale Leistungserfassung, OCR-Upload, Signaturen, Monatsabschluss | diverse | diverse Commits | ja (`20260808200000`, `20260809120000`) | — |
| 7 | Pflegedokumentation | ✅ | Anamnese/Aufnahme/Diagnosen/Maßnahmenpläne/Verlauf, SIS, Wunddokumentation (PUSH-Score), Vitalwerte + Grenzwert-Alarme, Medikamentenmanagement, Engel-/Kunden-Ansicht | diverse | diverse Commits | ja (`20260810010000` u.a.) | — |
| 8 | Personalmanagement | ✅ | Stammdaten/Qualifikationen, Mitarbeiterakte, Arbeitszeiterfassung, Dienstplanung, Urlaubsverwaltung, Einsatzfreigabe, Engel-Self-Service | diverse | 76472d0 | ja (`20260811010000`) | — |
| 9 | Aufgaben, Kommunikation & Workflow-Engine | ✅ | Aufgabenverwaltung, Benachrichtigungen, Wiedervorlagen, Eskalationen, event-basierte Workflow-Engine, Threaded Messaging | diverse | 4ae2c35 | ja (`20260812010000`, `20260813010000`) | — |
| 10 | Dokumentenmanagement & Aktenführung | ✅ | Upload/Versionierung/Sperrung, Kundenakte 360°, Verträge, Kontaktpersonen, Ablauf-Warnungen, Zugriffs-Log, Angehörigenzugang, digitale Signaturen | diverse | c4f5bfb | ja (3 Migrationen) | — |
| 11 | Kassenabrechnung-Engine Härtung 🔒 | ✅ | 4 Bugfix-Kategorien: Client-Spalten, Kostenträger-Architektur, Service-Records-Spalten, Abrechnungs-Queries | — | be341c3 | nein | — |
| 12 | Defense-in-Depth org_id-Guards 🔒 | ✅ | 9 Lib-Funktionen in 4 Dateien um `organization_id`-Filter ergänzt | — | b5b83e4 | nein | — |
| 13 | Expansion Multi-Tenant | ✅ | AOK-Routing bundesweit, Leistungsnachweis-PDF multi-tenant, EDIFACT-Absendername aus DB | — | 25c2009 | nein | — |
| 14 | Sicherheits-Sweep & RLS-Härtung 🔒 | ✅ | 15+ Security-Migrationen: RLS-Rekursion, SecDef-Härtung, Race-Condition-Fixes (P0), Unique-Constraints (P1), fehlende RLS (P1) | — | diverse Commits | ja (`20260814010000`–`20260824030000`) | — |
| 15 | Digitaler PflegeCoach (DiPA) | ✅ 15a–15d (v0.2.0) | Anspruchsprüfung, Freischaltcodes, pseudonymisierte Nachweise, Löschkonzept, Zulassungs-Anforderungskatalog, eUL-Brücke (einbahnig) | 48 | d4c5f18 | ja, **wartet auf Live-Apply** (`20260819010000`, `20260826010000`) | Live-Apply beider Migrationen; BSI-TR-03161-Zertifizierung; DSFA-Abschluss; pflegefachliche Freigabe; Evaluationspartner; externes Security-Review (volle Liste: `audit/dipa/dipav_gap_liste.md`) |
| 16 | Rechnungsmanagement & Gutschriften | ✅ | Rechnungs-Prüfen-Schritt, Gutschriften-Vollworkflow, PDF-Seitenumbruch-Fix, Korrektur-Freigabe/Verwerfen, Storno aus UI, Kunden-PDF frisch signiert | 16 | 6a7a616 | nein (bestehende Tabellen) | — |
| 17 | § 302 SGB V (Sonstige Leistungserbringer) | 🔄 Gerüst, Export gesperrt | Versionsengine (v21/v22), HKP-XML-Format registriert, Kostenträger-Routing (leer), Verordnungs-Integration/Positionsaufbereitung, Readiness-Ampel | 31 | 0962f05 | ja, **wartet auf Live-Apply** (`20260826020000`) | Live-Apply der Migration; Technische Anlage 1 + Schlüsselverzeichnisse beschaffen (gkv-datenaustausch.de); danach Segment-Builder + Validator implementieren |
| **18** | **KIM / TI-Anbindung** | **🔄 Gerüst, Versand gesperrt** | Postfach-Konfiguration, TA5-Versionsregister (`spec_bestaetigt=false`), eHBA/SMC-B-Verwaltungsschicht, Nachrichtenwarteschlange, Readiness-Ampel, doppelt gesperrter `versendeKimNachricht()` | 25 | 183f35d | ja, **wartet auf Live-Apply** (`20260830010000`) | Live-Apply der Migration; gematik-Zulassung als KIM-Nutzer; KIM-Provider-Vertrag; Konnektor-Anbindung (SMC-B/eHBA-Hardware); Technische Anlage 5 beschaffen; danach Versand-Client implementieren |
| **19** | **Erweiterte Analytics & Reporting** | **✅** | KPI-Dashboard (Umsatz/Auslastung/Ablehnungsquote/Pflegequalität), Ops-Audit (vereinheitlichter Audit-Trail), MDK-Prüfmappe, Quality-Dashboard (Wunden/Stürze/Vitalwerte-Alarme/offene Maßnahmen), Bonussystem (Regelwerk/Berechnungslauf/Freigabe) | 46 | 44f834a | ja, **wartet auf Live-Apply** (`20260827010000`, nur Bonussystem-Tabellen) | Live-Apply der Migration (sonst funktioniert Bonussystem-UI nicht); ggf. Kundenbewertung-pro-Kraft als weiteres Bonuskriterium ergänzen, sobald Datengrundlage existiert |
| **20** | **Offline-First & Native App** | **🔄** | Server-Sync-Endpunkt (`/api/sync`, idempotent), Offline-Queue auf alle Pflegedoku-Entitäten erweitert, bidirektionale Konfliktlösung (`last_write_wins`/`server_wins`/`manuell` + Admin-Auflösungs-UI), Sync-Status-Dashboard, Kamera-/GPS-Adapter (Web-API-Basis) | 36 | 11f11aa | ja, **wartet auf Live-Apply** (`20260828010000`) | Live-Apply der Migration; Entscheidung zu `@capacitor/camera`/`@capacitor/geolocation` (native Plugins, aktuell Web-API-Fallback); FCM-Konfiguration für Sync-Push prüfen; Engel-Schreibrecht auf Wunddoku-Fotos produktseitig entscheiden |
| **21** | **FHIR / ISiP Interoperabilität** | **🔄** | FHIR-R4-Endpunkte (Patient/Encounter/Observation/CarePlan, Base-R4-Profil), Bundle-Export pro Klient, Patient-Import mit Vorschau/Bestätigung, `fhir_audit_log`, Admin-UI | 56 | 201750e | ja, **wartet auf Live-Apply** (`20260829010000`) | Live-Apply der Migration (Audit-Log läuft bis dahin fail-soft ohne Persistenz); Entscheidung ob länderspezifisches ISiK/KBV-Profil künftig benötigt wird; Encounter-/Observation-Import bewusst nicht umgesetzt (Datenqualitätsrisiko) — bei Bedarf separat spezifizieren |

---

## Sammel-Punkt: Ausstehende Live-Migrationen (Supabase SQL-Editor / MCP)

Alle folgenden Migrationsdateien sind committet, aber **nicht auf der Production-Datenbank angewendet** — keine dieser Sessions hatte DB-Schreibzugriff:

| Block | Migration | Rollback vorhanden |
|---|---|---|
| 15 | `20260819010000_pflegecoach_dipa_modul.sql` | ja |
| 15 | `20260826010000_dipa_freischaltung_nachweise_eul.sql` | ja |
| 17 | `20260826020000_sgb_v_302_geruest.sql` | ja |
| 19 | `20260827010000_analytics_bonussystem.sql` | ja |
| 20 | `20260828010000_sync_offline.sql` | ja |
| 21 | `20260829010000_fhir_isip_audit_log.sql` | ja |
| 18 | `20260830010000_kim_ti_geruest.sql` | ja |

**Empfehlung:** In dieser Reihenfolge (chronologisch nach Zeitstempel) im Supabase SQL-Editor ausführen, jeweils Rollback bereithalten. Keine der Migrationen ist voneinander abhängig außer in der angegebenen Reihenfolge.

---

## Sammel-Punkt: Was Yusuf über die Tabelle hinaus wissen sollte

1. **`middleware.ts` vs. `proxy.ts`:** Eine lokale, gitignorte `middleware.ts` kollidierte mit `proxy.ts` und ließ `next build` lokal fehlschlagen. Da die Datei nie committet war, war die Production/Vercel-Build davon nicht betroffen. Sie wurde in dieser Session nach `middleware.ts.bak` verschoben (lokal, nicht committet) — falls dort eigener In-Progress-Code stand, bitte vor dem Löschen prüfen.
2. **Kein Block dieser Session hat Preise/Beträge erfunden** — Bonussystem-Kriterien, KIM/TI-Konfiguration und FHIR-Mappings nutzen ausschließlich real vorhandene Spalten/konfigurierbare Felder.
3. **Block 18 (KIM/TI) und Block 17 (§302 SGB V) bleiben bewusst fail-closed** — beide Versandpfade werfen unconditional einen spezifischen Fehler (`KimSpecFehltError` / `SgbVSpecFehltError`), bis die jeweilige offizielle technische Anlage vorliegt und im Code hinterlegt wird.
4. **Block 21 FHIR-Profil:** Es wird bewusst Base-FHIR-R4 ohne länderspezifisches ISiK/KBV-Profil ausgeliefert — Details in `docs/fhir-isip.md`.

---

## Testzahlen dieser Session (Block 18–21)

| Block | Neue Tests |
|---|---|
| 19 | 46 |
| 20 | 36 |
| 21 | 56 |
| 18 | 25 |
| **Summe** | **163** |

Gesamte Testsuite nach allen vier Blöcken: grün (zuletzt bestätigt 1786 passed / 29 skipped, 0 failed). `npm run typecheck` nach jedem Block grün gehalten.
