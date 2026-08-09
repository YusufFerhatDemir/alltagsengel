# DiPAV-Gap-Liste — „Digitaler PflegeCoach"

**Stand:** 2026-08-09, nach MVP-Bau des Moduls `/pflegecoach` (Tabellen `coach_*`,
API `/api/coach/*`, Migration `20260819010000`).
**Lesart:** Was fehlt noch bis (a) Pilotstart, (b) Antrag auf Aufnahme zur Erprobung
(§ 78a Abs. 6a SGB XI i. V. m. § 16 DiPAV). Regulatorische Referenz:
`audit/DIPA_REGULATORIK_2026-08-09.md` (Teil 3). Keine Gap = im MVP umgesetzt.

## Erledigt im MVP (2026-08-09)

| Anforderung | Umsetzung |
|---|---|
| Eigenständig identifizierbares Produktmodul, klare Produktgrenze | Eigener Pfad `/pflegecoach`, eigenes Layout, eigene Tabellen `coach_*` mit eigener RLS; kein Admin-/Betriebszugriff auf DiPA-Daten; kein `org_fence` (nutzer-eigene Daten) |
| Werbefreiheit / keine Tracker im Produkt | GTM/gtag, Meta-/TikTok-Pixel, VisitorTracker, Marketing-Widgets für `/pflegecoach` deaktiviert (`components/ClientSideProviders.tsx`, `GoogleTagManager.tsx`, `LayoutWrapper.tsx`) |
| Keine Nutzung von DiPA-Daten für Werbung/Cross-Selling | Technisch: keine Grants für `anon`, keine Admin-Policies, kein Zugriff aus Betriebs-Code auf `coach_*` |
| Serverseitiger, versionierter Einwilligungs-Record (Art. 9) | `coach_consents` (append-only, Widerruf protokolliert), Onboarding + Einstellungen |
| 3 Rollen + einwilligungsbasierte Interaktion | `coach_users.rolle`, `coach_shares` (widerrufliche Lesefreigabe) |
| 11 geforderte Produktfunktionen (Assessment … Reports) | Siehe Tabelle in `finale_zweckbestimmung.md` §2 |
| Self-Service-Datenexport (maschinenlesbar) | `/api/coach/export` — dokumentiertes JSON `de.alltagsengel.pflegecoach.export` v1.0 |
| Menschenlesbarer Bericht | `/pflegecoach/bericht` (unveränderliche Snapshots, Druck/PDF) |
| Barrierefreiheits-Grundausstattung | Schriftskalierung (3 Stufen, serverseitig gespeichert), Kontrastmodus, Fokus-Stile, Touch-Ziele ≥ 48 px, Skip-Link, ARIA-Landmarks, `prefers-reduced-motion`, helles UI ohne Dark-Zwang |
| MDR-Negativabgrenzung technisch verankert | Regelbasierte, rein organisatorische Empfehlungs-Engine mit Verbotsliste (`lib/coach/empfehlungen.ts`), statische Notfall-/Beratungshinweise |
| Unit-Tests der Produktlogik | 25 Tests (`lib/coach/*.test.ts`) |

## Offene Gaps

| ID | Gap | Kategorie | Schwere | Nächster Schritt |
|---|---|---|---|---|
| GAP-DB | Migration `20260819010000` ist NICHT auf Production angewendet (kein DDL-Weg aus der Agent-Umgebung: `_run_sql` läuft als `service_role` ohne CREATE auf `public`; kein Supabase-MCP/CLI-Token) | Betrieb | **Blocker für jede Nutzung** | Apply via Supabase SQL Editor oder MCP-Session; danach `node scripts/verify-pflegecoach-migration.mjs` |
| GAP-TR03161 | Kein BSI-TR-03161-Zertifikat, keine Prüfstellen-Beauftragung (Pflicht für Neuaufnahme seit 01.01.2025) | Datensicherheit | Kritisch (Monate Vorlauf) | Prüfstelle anfragen; Geltung für vorläufige Aufnahme klären (Frage 9) |
| GAP-ISMS | Kein ISO-27001-ISMS, kein dokumentierter Pentest | Datensicherheit | Hoch | ISMS-Beratung; Scope-Frage (Frage 11); ORF-2 |
| GAP-MFA | Kein zweiter Faktor in der Authentifizierung (TR-03161-relevant); Investor-Seite behauptet MFA — Widerspruch beseitigen | Datensicherheit | Hoch | MFA für PflegeCoach-Nutzer einplanen; `app/investor/en/product-technology/page.tsx:186` korrigieren |
| GAP-TRENNUNG | MVP nutzt Plattform-DB (nnwyktkqibdjxgimjyuq) mit Tabellen-/RLS-Trennung; Regulatorik-Analyse (Teil 4) empfiehlt eigenes Supabase-Projekt/Deployment mit eigener Versionsnummer. Restrisiken der In-App-Variante: gemeinsame Auth, gemeinsames Hosting, GTM lädt bei SPA-Navigation aus Marketing-Seiten bereits im Speicher (bei Direkteinstieg in `/pflegecoach` lädt nichts) | Architektur/Datenschutz | Mittel (vor Antrag klären) | BfArM-Frage 13 (Trennungstiefe); Migrationspfad zu separatem Projekt vorplanen |
| GAP-INTEROP | Kein FHIR/MIO-Mapping (nur PDF-Druck + dokumentiertes JSON); Verbindlichkeit unklar (ORF-9) | Interoperabilität | Mittel | BfArM-Frage 10; FHIR-Mapping (Questionnaire/QuestionnaireResponse, CarePlan) als Option vorbereitet |
| GAP-QS | Alle Inhaltsmodule (`lib/coach/inhalte.ts`) tragen `pruefstatus: 'entwurf'` — pflegefachliche Freigabe fehlt (DiPAV: qualitätsgesicherte Inhalte); UI zeigt Entwurfs-Badge | Qualität | Hoch (vor Pilot) | Pflegefachliche Prüfung beauftragen, Freigabe dokumentieren, Status umstellen |
| GAP-INSTRUMENTE | Validierte Instrumente (FES-I, HPS/BSFC-s, SUS) nicht lizenziert/integriert; produktinternes 7-Item-Kurzinstrument ist nicht validiert (transparent gekennzeichnet) | Evidenz | Hoch (vor Pilot) | Lizenzklärung; BfArM-Frage 16 |
| GAP-NUTZUNG | Kein dediziertes pseudonymisiertes Ereignis-Logging (Modul gestartet/abgeschlossen) für Pilot-Kennzahlen; kein Pseudonymisierungs-/Schlüsselkonzept implementiert | Evidenz | Mittel | Ereignistabelle + Trennungskonzept vor Pilotstart |
| GAP-DSFA | Keine Datenschutz-Folgenabschätzung (Art. 35), Datenschutzhinweise + Einwilligungstexte sind Entwurf ohne juristische Prüfung; AVV-Kette (Supabase/Vercel) nicht produktbezogen dokumentiert | Datenschutz | Hoch (vor Pilot) | DSFA erstellen; juristische Prüfung; AVV-Dossier |
| GAP-A11Y-AUDIT | Kein BITV-/WCAG-2.1-AA-Audit des neuen UI (Grundausstattung vorhanden, aber ungeprüft; Screenreader-Tests ausstehend) | Barrierefreiheit | Mittel (vor Pilot) | Selbsttest + externer BITV-Test; Nachweisform klären (Frage 12) |
| GAP-LOESCHUNG | Konto-Löschung läuft über den allgemeinen Alltagsengel-Flow (`app/api/user/delete`); ein produktspezifischer Lösch-/Exportnachweis-Flow nur für PflegeCoach-Daten fehlt | Datenschutz | Mittel | Produktbezogene Löschfunktion (nur `coach_*`-Daten via CASCADE auf `coach_users`) ergänzen |
| GAP-PUSH | Erinnerungen sind geplante Aktivitäten ohne Push-/Lokalbenachrichtigung | Produkt | Niedrig (Komfort) | Push-Integration nach Pilot-Feedback |
| GAP-SHARES-UI | Datenfreigabe (`coach_shares`) ist im Datenmodell + RLS + Consent-Typ vorhanden, aber ohne Verwaltungs-UI (Einladen/Widerrufen per Oberfläche) | Produkt | Mittel | Freigabe-UI in Einstellungen ergänzen |
| GAP-EVAL | Evaluationskonzept nicht einreichungsreif (kein Partner, kein Ethikvotum, ORF-10 offen) | Evidenz | Hoch (vor Antrag) | Siehe `evaluationskonzept.md` §6 |

## Referenz: offene regulatorische Fragen (ORF)

Unverändert aus der Regulatorik-Analyse: ORF-1 … ORF-11 (siehe
`audit/DIPA_REGULATORIK_2026-08-09.md`, Sammelliste). Für den Antrag maßgeblich:
ORF-2 (ISO-27001-Fristen), ORF-5 (Werbefreiheits-Details Anlage 2), ORF-9 (FHIR/MIO),
ORF-10 (Evidenz-Methodik), ORF-11 (Mehrkanal-Vertrieb).
