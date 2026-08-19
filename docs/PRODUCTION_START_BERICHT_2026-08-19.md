# Production-Start-Bericht

**Datum:** 19.08.2026
**Baseline:** `v6-baseline` (Tag gesetzt und gepusht)
**Grundlage:** V6 Technische Endabnahme -- TS:0 Fehler, Tests:3062, Build:579 Seiten, Client-Side Writes:0, Audit:100%, Silent Catches:0

---

## Kategorie A -- Sofort nutzbar

Diese Module funktionieren HEUTE fuer echte Kunden. Keine externen Abhaengigkeiten, keine fehlenden Vertraege, keine Zertifikate noetig.

### 1. Kundenverwaltung (Klienten)

- **Status:** Produktionsreif
- **Was funktioniert:** CRUD (Anlegen, Lesen, Bearbeiten), Pflegegrad-Verwaltung mit automatischer Budget-Anlage, Stammdaten, Gesundheitsdaten, Notfallkontakte, Versicherungsdaten, Pflegekasse/IK, Hausarzt, Notizen-Panel, Leistungshistorie
- **Server Actions:** Ja -- POST/PATCH ueber API-Routen (`/api/admin/clients`, `/api/admin/clients/[id]`, `/api/admin/clients/[id]/pflegegrad`)
- **Audit-Log:** Ja -- jede Aenderung wird protokolliert
- **Org-Fence:** Ja -- `getActiveOrgId()` in allen API-Routen, Quality-Actions mit explizitem `organization_id`-Check

### 2. Mitarbeiterverwaltung (Betreuungskraefte)

- **Status:** Produktionsreif
- **Was funktioniert:** Komplette digitale Mitarbeiterakte (Pflicht-Dokumente mit Ampel: vorhanden/laeuft ab/abgelaufen/fehlt), Qualifikations-Timeline mit 60/30/7-Tage-Erinnerungen, Handzeichen-Verwaltung mit Historie, Bonus-System (Punkte + Praemien), Registrierung/Abrechnungsdaten (Qualifikationsstufe, IK-Nummer, lebenslange Pflegekraft-Nr.), Notfall-Pool
- **Server Actions:** Ja -- `addCaregiverDocument`, `addCaregiverQualification`, `changeCaregiverInitials`, `addCaregiverBonus`, `updateCaregiverRegistration` (alle `'use server'`)
- **Audit-Log:** Ja -- jede Aktion wird protokolliert
- **Org-Fence:** Ja -- `requireAdmin()` + `getActiveOrgId()`

### 3. Einsatzplanung und Ausfallmanagement

- **Status:** Produktionsreif
- **Was funktioniert:** Wochenuebersicht (7-Tage-Board mit Einsaetzen), Einsatz-Anlage (Einzel + Serieneinsaetze), Ausfallmeldung (Krank, Urlaub, etc.), Vertretungssuche mit automatischem Scoring (Wunschvertretung, Ort, Notfall-Pool, Verfuegbarkeit, Fahrzeug), Eskalationsstufen (3 Level), Klient-Benachrichtigungs-Tracking, Notfall-Pool-Dashboard
- **Server Actions:** Ja -- `reportAbsence`, `createSubstitutionRequest`, `assignSubstitute`, `escalateRequest`, `markRequestFailed`, `toggleClientNotified`; Einsatz-Anlage ueber `/api/einsatzplanung` POST
- **Audit-Log:** Ja
- **Org-Fence:** Ja

### 4. Leistungsnachweise

- **Status:** Produktionsreif
- **Was funktioniert:** Leistungsnachweis-Erfassung (Klient, Betreuungskraft, Datum, Uhrzeit, Leistungsart, Budget-Typ, Handzeichen, Betrag, GPS, Klienten-Unterschrift, Vollstaendigkeitspruefung), Status-Workflow (Entwurf bis Abgeschlossen)
- **Server Actions:** Ja -- `createServiceRecordAction` ueber `saveServiceRecord`-Engine
- **Audit-Log:** Ja
- **Org-Fence:** Ja

### 5. Budget-Uebersicht

- **Status:** Produktionsreif
- **Was funktioniert:** Entlastungsbetrag nach Paragraph 45b (131 Euro/Monat), Ampel-System (gruen/gelb/rot nach Auslastung), Vorjahresuebertrag mit Verfallswarnung (30. Juni), Budget-Balken je Klient, automatische Budget-Anlage bei Pflegegrad-Aenderung (Paragraph 45b ab PG 1, VP/KZP ab PG 2)
- **Anmerkung:** Reine Dashboard-Ansicht, Budgets werden automatisch durch Pflegegrad-Aenderung und Leistungsnachweis-Buchung aktualisiert

### 6. Rechnungsverwaltung (Privatrechnung / Kostenerstattung)

- **Status:** Produktionsreif
- **Was funktioniert:** Rechnung aus Leistungsnachweisen erstellen (ueber Billing-Engine `/api/billing/invoices/create`), vollstaendiger Status-Workflow (Entwurf -> Geprueft -> Freigegeben -> Uebermittelt -> Quittiert -> Bezahlt), Teilzahlung, Kuerzung mit Dokumentation, Streitfaelle (invoice_disputes), fortlaufende Rechnungsnummern
- **Server Actions:** Ja -- `advanceInvoiceSimple`, `recordInvoicePayment`, `recordInvoiceDispute`, `decideInvoiceKuerzung`
- **Audit-Log:** Ja
- **Org-Fence:** Ja
- **Wichtig:** Fuer den Start als Alltagsbegleitung nach Paragraph 45a genuegt die Privatrechnung oder das Kostenerstattungsverfahren. Die direkte Kassenabrechnung (EDIFACT) ist dafuer NICHT erforderlich.

### 7. Rollen und Rechte

- **Status:** Produktionsreif
- **Was funktioniert:** Rollenbasierter Zugriff (Admin, Superadmin, Engel/Caregiver), jede Server Action prueft Auth + Rolle + Organisation, Multi-Mandanten-Faehigkeit ueber `getActiveOrgId()` mit Cookie-basiertem Org-Switcher, RLS auf Supabase-Ebene, UUID-Validierung (`isValidUUID`) gegen Injection
- **Schutz:** `requireAdmin()` / `requireEngel()` als Gate in jeder Server Action, Cross-Tenant-Schutz (z. B. Quality-Modul prueft `organization_id` explizit)

### 8. Audit-Logs

- **Status:** Produktionsreif
- **Was funktioniert:** Zentraler `logAuditEvent()` in `lib/audit-log.ts`, schreibt in `mis_audit_log` via Service-Role (RLS-Bypass fuer Insert), erfasst Actor (ID, Name, Rolle), Aktion, Entity (Typ + ID), IP-Adresse, User-Agent, Details-JSON, Fail-Soft-Design (Audit-Fehler blockiert nie die Hauptaktion)
- **Abdeckung:** 100% -- alle Server Actions in allen Modulen loggen

### 9. Qualitaetsmanagement

- **Status:** Produktionsreif
- **Was funktioniert:** Zufriedenheitsanrufe mit fester Kadenz (7/30/90 Tage, danach halbjaehrlich), Dokumentation (Zufriedenheit 1-5 Sterne, Puenktlichkeit, Wohlbefinden, Kraft-Beibehaltung, Verbesserungsvorschlaege), Dashboard mit Durchschnittswerten, Pflegequalitaets-Tab (Wunddokumentation, Sturzereignisse, Vitalalarme, Massnahmenplan), ueberfaellige Anrufe automatisch hervorgehoben
- **Server Actions:** Ja -- `saveSatisfactionCall`, `loadQualityData` (mit Cross-Tenant-Pruefung)
- **Audit-Log:** Ja
- **Org-Fence:** Ja -- explizite `organization_id`-Filterung

### 10. Personalmanagement

- **Status:** Produktionsreif
- **Was funktioniert:** Personaluebersicht mit Vertragsstatus und Qualifikation, Detailseite mit 6 Tabs (Stammdaten, Qualifikationen, Schulungen, Arbeitszeiten, Urlaub, Audit), Stammdaten-Bearbeitung (Notfallkontakt, Einsatzgebiet, Wochenstunden-Soll, Probezeitende, Fahrzeug/Fuehrerschein), Einsatzfreigabe-System (erst nach Pruefung von Fuehrungszeugnis, Erste-Hilfe, Qualifikation), Qualifikationen mit Pflicht/Einsatzrelevant-Flags, Schulungsverwaltung, Arbeitszeitkonto (Ist/Soll/Ueberstunden je Monat), Urlaubskonto (Anspruch/Genommen/Geplant/Rest), Abwesenheiten
- **API-Routen:** `/api/personal/stammdaten`, `/api/personal/qualifikationen`, `/api/personal/schulungen`, `/api/personal/arbeitszeiten`, `/api/personal/urlaubskonto`, `/api/personal/abwesenheiten`, `/api/personal/audit`

### 11. Engel-Portal (Betreuungskraft-App)

- **Status:** Produktionsreif
- **Was funktioniert:** Eigene Einsaetze, Dienstplan, Kalender, Verfuegbarkeit, Urlaubsantrag (Server Action `requestAbsence` mit Audit-Log), Arbeitszeiten, Qualifikationen, Dokumente, Profil, Chat, Benachrichtigungen, Aufgaben, Registrierung/Onboarding
- **Org-Fence:** Ja -- `requireEngel()` + `getActiveOrgId()`

### 12. Beschwerdemanagement (MIS)

- **Status:** Produktionsreif
- **Was funktioniert:** Beschwerde-Erfassung (Titel, Beschreibung, Kategorie, Prioritaet, Klient, Engel), Status-Workflow (Eingegangen -> In Bearbeitung -> Massnahme eingeleitet -> Geloest -> Geschlossen), CAPA-Dokumentation (Korrektur- und Vorbeugungsmassnahmen)
- **Server Actions:** Ja -- `createComplaint`, `updateComplaintStatus`, `saveComplaintCapa`, `deleteComplaint`
- **Audit-Log:** Ja
- **Org-Fence:** Ja

---

## Kategorie B -- Technisch fertig, benoetigt echte externe Zugangsdaten/Vertraege

### 1. EDIFACT-Kassenabrechnung (Paragraph 105 SGB XI)

- **Status:** Technisch vollstaendig, EXTERNAL_REQUIRED
- **Was gebaut ist:** Kompletter EDIFACT-Generator (PLGA/PLAA-Nutzdatendateien + Auftragsdatei), Prueflauf mit Validierung, Export je Kostentraeger, Abrechnungslauf-Tracking mit Status-Workflow, Schluesselverzeichnis (Leistungsarten -> EDIFACT-Codes), Datenannahmestellen-Routing, IK-Pruefziffern-Validierung
- **Betriebsmodus:** Default = Test (sicher). Drei Sperren vor Echtbetrieb: Env-Gate + Testuebertragung belegt + Bestaetigungswort "ECHTBETRIEB"
- **Was fehlt (extern):**
  1. **ITSG-Zertifikat** -- fuer SECON-Verschluesselung (PKCS#7) der Nutzdatendateien. Antrag beim ITSG Trust Center.
  2. **Kassenvertraege** -- Versorgungsvertraege mit den einzelnen Pflegekassen (oder deren Landesverbaenden)
  3. **DTA-Verbindung** -- Zugang zur Datenannahmestelle (z. B. DASI, ITSG) fuer elektronische Uebermittlung
  4. **Testuebertragung** -- mindestens eine erfolgreiche Testuebertragung (Dateiindikator '0') bei der Annahmestelle
- **IK-Nummer:** Vorhanden (460629986), gueltig ab 16.07.2026
- **Wichtig:** Fuer den Betriebsstart als Alltagsbegleitung NICHT zwingend erforderlich. Paragraph-45a-Leistungen koennen auch ueber Privatrechnung oder Kostenerstattung abgerechnet werden. Die direkte Kassenabrechnung ist eine Optimierung, kein Startkriterium.

### 2. SEPA-Lastschrifteinzug

- **Status:** DISABLED
- **Was fehlt:** SEPA Creditor-ID (Glaeubigeridentifikationsnummer) bei der Bundesbank beantragen
- **Wichtig:** NICHT fuer den Start erforderlich. Rechnungen koennen per Ueberweisung bezahlt werden.

---

## Kategorie C -- Spaetere Erweiterungen / DiPA / Pflegedienst

### 1. DiPA / Pflegecoach

- **Status:** Gebaut, COACH_DIPA_MODUS = false (korrekt)
- **Was es ist:** Digitale Pflegeanwendung (DiPA) nach Paragraph 39a SGB XI
- **Warum nicht jetzt:** Erfordert BfArM-Listung (Bundesinstitut fuer Arzneimittel und Medizinprodukte), die nicht vorliegt. Ohne Listung darf das Produkt keine Aussagen zur Kostenerstattung machen.
- **Risikoeinstufung:** Separat geregelt, DiPA-Modus bleibt deaktiviert bis zur Zulassung

### 2. SGB-V-Abrechnung (Paragraph 302)

- **Status:** Gebaut (`lib/abrechnung/sgb-v/`), DISABLED
- **Was es ist:** Abrechnung fuer Pflegedienste nach Paragraph 302 SGB V (Heilmittel/Haeusliche Krankenpflege)
- **Warum nicht jetzt:** Alltagsengel ist ein Alltagsbegleitungsdienst nach Paragraph 45a SGB XI, kein zugelassener Pflegedienst. Diese Abrechnungsart ist fuer eine spaetere Erweiterung des Geschaeftsmodells vorgesehen.

### 3. Vitalwerte-Grenzwertalarme

- **Status:** Gebaut, regulatorisch deaktiviert (VITALS_GRENZWERT_ALARME_AKTIV = false)
- **Warum nicht jetzt:** Automatische Grenzwertbewertung hat regulatorische Implikationen (Medizinprodukt-Klassifizierung). Vitalwerte koennen manuell dokumentiert werden, aber die automatische Alarmierung bleibt deaktiviert.

### 4. KIM-Messenger (Kommunikation im Medizinwesen)

- **Status:** UNVERIFIED
- **Warum nicht jetzt:** Erfordert gematik-Zertifizierung und Anbindung an die Telematikinfrastruktur. Fuer Alltagsbegleitung nicht erforderlich.

---

## Zusammenfassung

**Du kannst sofort starten**, sobald folgende Voraussetzungen erfuellt sind:

1. **Anerkennung nach Landesrecht** als Angebot zur Unterstuetzung im Alltag (Paragraph 45a SGB XI) -- das ist die einzige zwingende Voraussetzung fuer den Betriebsstart
2. **Echte Mitarbeiter** im System anlegen (Personal-Modul ist bereit)
3. **Echte Klienten** aufnehmen (Klienten-Modul ist bereit)
4. **Einsaetze planen** und **Leistungsnachweise erfassen**
5. **Rechnungen erstellen** -- als Privatrechnung oder zur Kostenerstattung bei der Pflegekasse

Die gesamte Kategorie A (12 Module) ist produktionsreif: Server Actions statt Client-Side Writes, lueckenlose Audit-Logs, Multi-Mandanten-Isolation, Rollen-/Rechtepruefung.

Die direkte Kassenabrechnung (Kategorie B) ist eine spaetere Optimierung -- sie beschleunigt den Zahlungsfluss, ist aber keine Voraussetzung fuer den Betrieb als Alltagsbegleitungsdienst.
