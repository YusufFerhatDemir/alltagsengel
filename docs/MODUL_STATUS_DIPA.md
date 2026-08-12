# Modul-Status: DiPA / Digitaler PflegeCoach

**Stand:** 2026-08-12
**Produktversion:** v0.2.0
**Prüfer:** Automatische Code-Analyse
**Tests:** 75/75 bestanden (node:test, lib/coach/*.test.ts)

---

## Zusammenfassung

| Teilbereich | Status | Details |
|---|---|---|
| Technische Implementierung | PRODUKTIONSREIF (MVP) | Alle Kernfunktionen gebaut, 23 API-Routen, 18 Frontend-Seiten |
| Datenmodell & RLS | PRODUKTIONSREIF | 2 Migrationen (noch nicht live), vollständige RLS-Policies |
| HMAC-Pseudonymisierung | PRODUKTIONSREIF | Zwei-Welten-Modell, SECURITY DEFINER-Funktionen |
| Freischaltcode-System | PRODUKTIONSREIF | CSPRNG, SHA-256+Pepper, fail-closed |
| Einwilligungsmanagement | PRODUKTIONSREIF | Art. 9 DSGVO, append-only, versioniert |
| Datenexport (Art. 20 DSGVO) | PRODUKTIONSREIF | JSON-Export mit Schema, Download-Funktion |
| Löschkonzept (Art. 17 DSGVO) | PRODUKTIONSREIF | Cascade-Delete, Pseudonym-Cleanup, Bestätigungswort |
| Empfehlungs-Engine | PRODUKTIONSREIF | 6 Regeltypen, MDR-Negativabgrenzung eingehalten |
| eUL-Verwaltung | PRODUKTIONSREIF | 5 Leistungsarten, Qualifikationsprüfung, Nachweisführung |
| Admin-Bereich (DiPA) | PRODUKTIONSREIF | 4 Tabs, kein Gesundheitsdaten-Zugriff |
| Nutzungsnachweise | PRODUKTIONSREIF | Pseudonymisiert, Min-Gruppen-Schutz (k=5), doppelt abgesichert |
| Abrechnung | GERÜST (fail-closed) | Struktur gebaut, alle Wege `verguetung_geklaert: false` |
| Pflegefachliche Inhalte | GERÜST (entwurf) | 4 Übungen, 5 Wissensmodule — alle `pruefstatus: 'entwurf'` |
| DSFA | TEILWEISE | Vorlage vorhanden, juristische Durchführung offen |
| BSI TR-03161 | NICHT VORHANDEN | Selbsteinschätzung vorhanden, Zertifikat fehlt |
| ISO 27001 ISMS | NICHT VORHANDEN | Weder dokumentiert noch zertifiziert |
| Barrierefreiheit (WCAG 2.1 AA) | TEILWEISE | Grundausstattung (Schriftgröße, Kontrast), formaler Audit fehlt |
| Evaluationsstudie | NICHT VORHANDEN | Konzept vorhanden, kein Studienpartner |
| MFA | NICHT VORHANDEN | GAP-MFA offen |
| Externer Pentest | NICHT VORHANDEN | GAP-EXT-REVIEW offen |
| FHIR-Interoperabilität (DiPA) | NICHT VORHANDEN | FHIR nur im Betriebssystem (Block 21), ob für DiPA gefordert: offen (ORF-9) |

---

## 1. Technischer Stand (Block 15a-15d)

### Block 15a: DiPA-Kernmodul

**Status: PRODUKTIONSREIF (MVP)**

**Was existiert:**
- 16 API-Routen unter `/api/coach/` (profil, consents, assessments, ziele, aktivitaeten, aktivitaeten/log, messungen, empfehlungen, berichte, anspruch, export, freischaltung, loeschung, nutzung)
- 4 API-Routen unter `/api/dipa/` (codes, codes/[id], nachweise, abrechnungswege)
- 3 API-Routen unter `/api/eul/` (erbringungen, erbringungen/[id], qualifikationen)
- 18 Frontend-Seiten unter `/pflegecoach/`
- 2 Admin-Seiten (`/admin/dipa`, `/admin/eul`)
- 15 Business-Logic-Dateien unter `lib/coach/` (~3.266 Zeilen)
- 9 Test-Dateien (75 Tests, alle bestanden)

**Datenbank-Tabellen (2 Migrationen):**
- `20260819010000_pflegecoach_dipa_modul.sql` — coach_users, coach_consents, coach_shares, coach_assessments, coach_goals, coach_activities, coach_activity_log, coach_measurements, coach_reports
- `20260826010000_dipa_freischaltung_nachweise_eul.sql` — coach_pseudonym_key, coach_freischaltcodes, coach_freischaltungen, coach_anspruchspruefungen, coach_nutzungsereignisse, coach_abrechnungswege, eul_erbringungen, eul_qualifikationen

**MIGRATION-STATUS: WARTET AUF LIVE-APPLY.** Beide Migrationen sind committet, aber noch nicht auf die Produktions-Datenbank angewendet.

### Block 15b: Datenschutz & Löschkonzept

**Status: PRODUKTIONSREIF (technisch) / TEILWEISE (regulatorisch)**

| Mechanismus | Implementiert | Bemerkung |
|---|---|---|
| Art. 9 DSGVO Einwilligung | JA | Append-only, versioniert, getrennt widerruflich |
| Art. 17 DSGVO Löschung | JA | `/api/coach/loeschung`, Cascade-Delete, Bestätigungswort |
| Art. 20 DSGVO Datenportabilität | JA | `/api/coach/export`, dokumentiertes JSON-Schema |
| HMAC-Pseudonymisierung | JA | SHA-256 mit stored key, SECURITY DEFINER-Funktionen |
| Zwei-Welten-Modell | JA | coach_*-Daten ↔ Betriebsdaten strikt getrennt |
| Werbefreiheit | JA | GTM/Meta/TikTok unter /pflegecoach deaktiviert |
| DSFA | TEILWEISE | `audit/dipa/dsfa_pflegecoach.md` als Vorlage, juristische Durchführung offen (GAP-DSFA) |
| AV-Kette dokumentiert | NEIN | GAP-DSFA, Verantwortung: Geschäftsführung |

### Block 15c: Anforderungskatalog

**Status: PRODUKTIONSREIF (Tracking-Struktur)**

20 Anforderungen in 9 Kategorien, maschinenlesbar in `lib/coach/anforderungskatalog.ts`, visualisiert im Admin-Bereich.

**Fortschritt (Stand 2026-08-12):**
- Einträge mit `stand: 'erfuellt'`: 6
- Einträge mit `stand: 'in_arbeit'`: 5
- Einträge mit `stand: 'offen'`: 9
- Einträge mit `anforderungstextGeprueft: true`: 3 von 20
- **Belastbar erfüllte Quote: 5 %** (nur geprüfte + erfüllte Einträge)

### Block 15d: Ergänzende Unterstützungsleistungen (eUL)

**Status: PRODUKTIONSREIF**

- 5 Leistungsarten definiert (Einweisung, Technische Unterstützung, Begleitete Nutzung, Schulung Angehöriger, Auswertungsgespräch)
- 3 Durchführungsformen (vor Ort, telefonisch, Video)
- 5 Qualitätskriterien mit Wiederholungsintervallen
- Vollständigkeitsprüfung für Nachweise
- Abgrenzungsregeln digital ↔ persönlich ↔ weder-noch
- Admin-Seite `/admin/eul` mit Erfassung, Bestätigung, Qualifikations-Check

---

## 2. Nutzerflow

### Vollständiger Flow implementiert:

1. **Anspruchsprüfung** (`/pflegecoach/anspruch`) — Selbsteinschätzung, ob DiPA über Pflegekasse möglich. Ergebnis: `anspruch_moeglich` / `anspruch_unklar` / `kein_anspruch`. Fail-to-unklar bei unsicheren Kriterien.
2. **Onboarding** (`/pflegecoach/start`) — Rollenwahl, Art. 9 Einwilligung (Pflicht), wissenschaftliche Auswertung (freiwillig)
3. **Freischaltung** (`/pflegecoach/freischaltung`) — Code-Eingabe, Hash-Abgleich, Pseudonym-Einlösung. Feature-Flag `COACH_FREISCHALTUNG_PFLICHT` (Default: AUS)
4. **Nutzung** — Dashboard, Assessment, Ziele, Wochenplan, Mobilität, Alltag, Angehörige, Belastungsskala, Verlauf
5. **Nachweise** — Pseudonymisierte Nutzungsereignisse, doppelt abgesichert (Deployment-Flag + Einwilligung)
6. **Berichte & Export** (`/pflegecoach/bericht`) — Verlaufsberichte, DSGVO-Export

### Freischaltung:
- Feature-Flag steht auf AUS (Default) → Zugang aktuell ohne Code möglich
- Mechanismus ist vollständig gebaut und sofort aktivierbar
- Ob ein Code-Verfahren regulatorisch vorgesehen ist: EXTERN ZU VERIFIZIEREN

### Fortschritt-Tracking:
- Assessments (Erst- + Verlauf) mit Bereichsvergleich
- Ziele mit Status-Tracking (aktiv → erreicht/angepasst/pausiert/beendet)
- Aktivitäten-Log (erledigt/teilweise/ausgelassen)
- Messungen (Belastungsskala, Sturzereignisse, weitere Instrumente)
- Verlaufsberichte als unveränderliche Snapshots

---

## 3. Datenschutz & Compliance

### HMAC-Pseudonymisierung (Zwei-Welten-Modell)

**Status: IMPLEMENTIERT**

- `coach_pseudonym_key` Tabelle (gespeicherter HMAC-Schlüssel)
- `coach_pseudonym()` SECURITY DEFINER-Funktion (Admin-Kontext)
- `coach_mein_pseudonym()` SECURITY DEFINER-Funktion (Nutzer-Kontext)
- Brücke DiPA ↔ Betrieb: nur über nicht-auflösbares HMAC-Pseudonym
- Kein Admin-Zugriff auf coach_*-Gesundheitsdaten (RLS-erzwungen)

### Löschkonzept

**Status: IMPLEMENTIERT**

- `/api/coach/loeschung` (DELETE) löscht alle coach_*-Daten des Nutzers
- Cascade-Delete über ON DELETE CASCADE
- Pseudonyme Nutzungsereignisse werden separat gelöscht (hängen nicht an coach_users)
- Bestätigungswort "LOESCHEN" erforderlich
- Alltagsengel-Konto bleibt bestehen (Produkttrennung)
- Was bleibt: Audit-Log-Eintrag (nur Metadaten), Freischaltcode-Status (kein Personenbezug)
- Dokumentation: `audit/dipa/loeschkonzept.md`

### DSFA-Vorlage

**Status: VORHANDEN (Entwurf)**

- `audit/dipa/dsfa_pflegecoach.md` — produktspezifischer Entwurf
- `docs/DSFA_VORLAGE.md` — allgemeine Plattform-Vorlage
- **Offen:** Juristische Durchführung und Prüfung (GAP-DSFA)

### Einwilligungsmanagement

**Status: IMPLEMENTIERT**

- 3 Consent-Typen: `gesundheitsdaten_art9` (Pflicht), `wissenschaftliche_auswertung` (freiwillig), `datenfreigabe` (für Sharing)
- Append-only (keine Updates, nur neue Zeilen)
- Versioniert (`text_version`)
- Getrennt widerruflich (`widerrufen_am`)

---

## 4. Nutzungsnachweise & eUL

### Elektronische Nutzungsnachweise

**Status: IMPLEMENTIERT (fail-closed)**

- 10 Ereignisarten (sitzung_gestartet, modul_geoeffnet, modul_abgeschlossen, aktivitaet_erledigt, assessment_erfasst, ziel_angelegt, ziel_erreicht, messung_erfasst, bericht_erstellt, export_erstellt)
- Pseudonymisiert (HMAC, kein Personenbezug)
- Auswertungswoche statt exaktem Zeitstempel
- Min-Gruppen-Schutz (k=5, unterdrückt bei < 5 Teilnehmenden)
- Doppelte Absicherung: Deployment-Flag `COACH_NUTZUNGSNACHWEIS_AKTIV` + individuelle Einwilligung
- Beide Flags Default AUS → derzeit keine Erfassung aktiv

### Exportfunktion

**Status: IMPLEMENTIERT**

- JSON-Export mit dokumentiertem Schema (`lib/coach/export.schema.json`)
- Format: `de.alltagsengel.pflegecoach.export/1.0`
- Enthält alle Nutzerdaten, keine internen IDs
- Konformanztest im Test-Suite enthalten
- Download als Datei mit Datumsstempel

---

## 5. Admin-Bereich

### DiPA-Verwaltung (`/admin/dipa`)

**Status: IMPLEMENTIERT**

4 Tabs:
1. **Freischaltcodes** — Ausstellen, Stornieren, Statusübersicht, Pepper-Warnung
2. **Nutzungsnachweise** — Aggregierte pseudonymisierte Kennzahlen, Zeitraumfilter
3. **Abrechnungswege** — Vorlagen anlegen, Schalter aktiv/verguetung_geklaert
4. **Anforderungskatalog** — Fortschrittsanzeige, Kategorien, Gap-Verweise

**Trennungsgebot eingehalten:** Kein Zugriff auf Gesundheitsdaten, Banner weist darauf hin.

### eUL-Verwaltung (`/admin/eul`)

**Status: IMPLEMENTIERT**

- Erbringungen erfassen und bestätigen
- Qualifikationsnachweise verwalten
- Freigabeprüfung (fail-closed)

### Reporting

**Status: TEILWEISE**

- Aggregierte Nutzungskennzahlen vorhanden (Admin-Tab "Nachweise")
- Kein dediziertes Reporting-Dashboard
- Verlauf je Woche sichtbar

---

## 6. Abrechnungs-/Vergütungslogik

### Status: GERÜST (fail-closed)

**Was existiert:**
- 3 Abrechnungsweg-Vorlagen (Direktabrechnung, Kostenerstattung, Pilotphase)
- Admin-UI zum Anlegen und Konfigurieren
- `istAbrechnungsbereit()` Prüffunktion: blockiert bei `verguetung_geklaert: false`

**Was BEWUSST NICHT existiert:**
- KEINE Preise, KEINE Vergütungshöhen, KEINE Erstattungsbeträge im Code
- KEIN eigener Rechnungslauf (Übergabe an bestehende Abrechnung geplant)
- KEINE automatische Aktivierung von Abrechnungswegen

**Warum fail-closed:**
Preise und Vergütungswege ergeben sich erst aus der Vergütungsvereinbarung nach BfArM-Listung. Bis dahin ist jeder Weg `verguetung_geklaert: false` und damit gesperrt.

**NICHT VERIFIZIERTE ANGABEN:**
- Die Regulatorik-Analyse nennt 53 €/Monat (§ 40b SGB XI, seit 01/2025) als Gesamtbudget, davon DiPA-Anteil bis 40 €/Monat. Diese Werte stammen aus der Analyse (audit/DIPA_REGULATORIK_2026-08-09.md) und sind EXTERN ZU VERIFIZIEREN anhand der zum Antragszeitpunkt gültigen Fassung.

---

## 7. Zulassungsanforderungen

### Was technisch für eine BfArM-Listung fehlt:

| Lücke | Verantwortung | Einschätzung |
|---|---|---|
| BSI TR-03161 Zertifikat | Extern (Prüflabor) | Blockierend für Antrag |
| ISO 27001 ISMS | Geschäftsführung + Extern | Blockierend für Antrag |
| DSFA durchgeführt (juristisch) | Extern (DSB/Kanzlei) | Blockierend für Antrag |
| MFA/Zweiter Faktor | Technik | GAP-MFA, blockierend |
| Externer Pentest | Extern (Pentest-Firma) | GAP-EXT-REVIEW, blockierend |
| Barrierefreiheits-Audit (WCAG 2.1 AA) | Extern (Prüfstelle) | GAP-A11Y-AUDIT, blockierend |
| Pflegefachliche Freigabe aller Inhalte | Fachlich (Pflegewissenschaft) | GAP-QS, blockierend |
| Evaluationsstudie (Nutzennachweis) | Extern (Universität/Institut) | 6-12 Monate, blockierend |
| QMS & Risikomanagement | Geschäftsführung | GAP-QMS, blockierend |
| AV-Kette dokumentiert | Geschäftsführung | GAP-DSFA |
| Belastungsskala validiert/lizenziert | Fachlich/Extern | Aktuell eigene Kurz-Skala |

### Was extern ist (nicht im Code lösbar):

- **Evidenznachweis / Evaluationsstudie:** Prospektive Studie mit Kontrollgruppe, Ethikvotum, wissenschaftlicher Partner. Geschätzte Dauer: 6-12 Monate.
- **BfArM-Beratung:** 25+ vorbereitete Fragen (`audit/dipa/bfarm_fragenkatalog.md`), Beratung noch nicht beantragt.
- **BSI TR-03161 Prüfung:** Durch akkreditiertes Prüflabor.
- **ISO 27001:** Aufbau ISMS + Zertifizierung.
- **Validierte Instrumente:** BSFC-s/Zarit Burden Interview lizenzpflichtig; aktuell eigene nicht-validierte Kurzskala im Einsatz.

### Dokumentation:

| Dokument | Status |
|---|---|
| `docs/ZERTIFIZIERUNGSLEITFADEN_DIPA_BFARM.md` | Vorhanden (Fehler am 2026-08-12 korrigiert) |
| `audit/dipa/` (18 Dateien) | Vorhanden |
| `audit/DIPA_REGULATORIK_2026-08-09.md` | Vorhanden |

---

## 8. Gefundene und korrigierte Fehler (2026-08-12)

### Zertifizierungsleitfaden (`docs/ZERTIFIZIERUNGSLEITFADEN_DIPA_BFARM.md`)

1. **CE-Kennzeichnung falsch behauptet:** DiPA sind keine Medizinprodukte und tragen keine CE-Kennzeichnung (audit/dipa/mdr_negativabgrenzung.md). → Korrigiert.
2. **FHIR-Funktionalität falsch behauptet:** "R4-Endpunkte, 56 Tests" und "FHIR-Export mit Vorschau" existieren nur im Betriebssystem (Block 21), NICHT im DiPA-Modul. Der PflegeCoach exportiert JSON, kein FHIR. → Korrigiert.
3. **Vergütungsangabe veraltet:** "bis zu 50 €/Monat" ist seit 01/2025 falsch (53 € gesamt, DiPA-Anteil bis 40 €). → Korrigiert mit "EXTERN ZU VERIFIZIEREN"-Vermerk.

### Code-Qualität

- **Keine Code-Bugs gefunden.** Alle 75 Unit-Tests bestanden.
- Alle API-Routen haben korrekte Auth-Guards.
- Alle Feature-Flags sind fail-safe (Default AUS).
- MDR-Negativabgrenzung wird konsistent eingehalten (keine Risiko-Scores, keine Diagnostik).
- Freischaltcode-Sicherheit: CSPRNG, SHA-256+Pepper, konfusionsfreies Alphabet.

---

## 9. Fazit

### Kann DiPA/PflegeCoach praktisch genutzt werden? NEIN (für BfArM-Listung) / JA (als Pilot)

**Für eine BfArM-Listung: NEIN.**
9 blockierende Lücken (BSI TR-03161, ISO 27001, DSFA, MFA, Pentest, Barrierefreiheit, pflegefachliche Freigabe, Evaluationsstudie, QMS). Geschätzter Zeitrahmen: 13-24 Monate. Geschätzte Kosten: 110.000-285.000 € (EXTERN ZU VERIFIZIEREN).

**Als interner Pilot (ohne Abrechnung mit Pflegekassen): JA.**
Die technische Implementierung ist vollständig und funktional:
- Vollständiger Nutzerflow von Registrierung bis Export
- Robuste Sicherheitsarchitektur (Zwei-Welten-Modell, HMAC, RLS)
- Datenschutzkonformität technisch gegeben (Einwilligung, Löschung, Export)
- Feature-Flags ermöglichen schrittweise Aktivierung
- Abrechnung ist fail-closed (kein Risiko unbeabsichtigter Vergütungsansprüche)

**Voraussetzung für Pilotbetrieb:**
1. Migrationen auf Live-DB anwenden (2 Migrationen warten)
2. `COACH_CODE_PEPPER` setzen (Umgebungsvariable)
3. Pflegefachliche Prüfung der Inhalte (pruefstatus → fachlich_freigegeben)
4. Teilnehmerinformation und Einwilligung für Pilotteilnehmende

**Empfehlung:** Pilotbetrieb starten, um Nutzungsdaten für die Evaluationsstudie zu sammeln. Parallel die regulatorischen Lücken schließen.
