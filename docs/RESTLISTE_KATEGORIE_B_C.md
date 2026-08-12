# RESTLISTE KATEGORIE B + C — Offene Punkte nach Betriebsabnahme

**Stand:** 2026-08-12  
**Quelle:** FINALE_BETRIEBSABNAHME.md, Commit `755eda2`

---

## Legende

- **Kategorie B:** Technisch fertig implementiert, aber durch externe Abhängigkeiten blockiert
- **Kategorie C:** Technisch fertig implementiert, aber fachliche Abnahme durch Geschäftsführung/Fachleitung erforderlich

---

## Vollständige Restliste

| # | Kat. | Punkt | Was genau fehlt | Wer muss es erledigen | Benötigte Unterlagen / Zertifikate / Zugänge | Für §45b-Produktivbetrieb erforderlich | Kann später nachgerüstet werden | Priorität |
|---|------|-------|----------------|----------------------|---------------------------------------------|---------------------------------------|-------------------------------|-----------|
| B1 | B | ITSG-Zertifikat (DTA/EDIFACT) | Zertifikat für elektronische Datenübermittlung an Kostenträger. Generator/Validator/SECON-Stub sind fertig. | ITSG GmbH (Trust-Center der GKV) | ITSG-Antrag, Organisationsdaten, technische Anbindungsdoku | NEIN — Rechnungen können manuell (Papier/PDF) an Kassen gesendet werden | JA | Mittel |
| B2 | B | § 302 SGB V Export | Technische Anlage 1 (TA1) und Schlüsselverzeichnisse fehlen. Generator ist bewusst fail-closed. | GKV-Spitzenverband / vdek | Rahmenvertrag nach § 302 SGB V, TA1-Dokument, Schlüsselverzeichnisse | NEIN — §302 betrifft HKP-/Behandlungspflege, nicht §45b-Entlastungsleistungen | JA | Niedrig |
| B3 | B | KIM/TI-Anbindung | gematik-Zulassung, KIM-Provider-Vertrag, Konnektor-Hardware (SMC-B/eHBA). Verwaltungsschicht ist fertig, `versendeKimNachricht()` wirft absichtlich. | gematik GmbH, KIM-Provider (z.B. T-Systems, CGM) | gematik-Zulassungsantrag, SMC-B-Karte, eHBA, Konnektor-Hardware, KIM-Provider-Vertrag | NEIN — KIM ist für Kommunikation im Gesundheitswesen, nicht für §45b-Abrechnung | JA | Niedrig |
| B4 | B | FHIR/ISiP-Zertifizierung | ISiK/KBV-Länderprofil und ISiP-Konformitätsprüfung fehlen. FHIR-R4-Endpunkte sind gebaut (56 Tests). | gematik (ISiK-Spezifikation), KBV (Profile) | ISiK-Konformitätstest-Ergebnisse, KBV-Profil-Mapping | NEIN — FHIR/ISiP ist für Interoperabilität mit Krankenhaus-/Praxissystemen | JA | Niedrig |
| B5 | B | DiPA/PflegeCoach — BfArM-Listung | BSI TR-03161-Zertifikat, ISO-27001-ISMS, DSFA, pflegefachliche Freigabe, wiss. Evaluationspartner, externes Security-Review | BSI (TR-03161), BfArM (Listungsantrag), externe Gutachter | BSI-Zertifikat, ISMS-Dokumentation, DSFA-Bericht, Evaluationsvertrag | NEIN — DiPA ist ein eigenständiges Modul, unabhängig vom §45b-Kernbetrieb | JA | Niedrig |
| B6 | B | Vitalwerte-Grenzwertalarme | MDR/CE-Klärung für potenzielle Medizinprodukt-Funktion. Dokumentationsfunktion ist freigegeben, Alarme hinter Feature-Flag. | Benannte Stelle (CE-Konformitätsbewertung), Rechtsberatung Medizinprodukterecht | MDR-Klassifizierungsgutachten, ggf. CE-Konformitätserklärung | NEIN — Dokumentation funktioniert, nur die Alarmfunktion ist betroffen | JA | Niedrig |
| B7 | B | BSI TR-03161 / Pentest / MFA | Externer Penetrationstest, BSI-Zertifizierung, MFA-Implementierung. Basis-Security (RLS, Org-Fences, Auth) ist vorhanden. | BSI, externer Pentester, Auth-Provider-Konfiguration | Pentest-Bericht, BSI-Zertifizierungsantrag | NEIN — BSI TR-03161 ist Voraussetzung für DiPA-Listung, nicht für §45b-Betrieb | JA | Mittel |
| B8 | B | SFTP-Zugänge (Kostenträger) | Produktive SFTP-Zugangsdaten der Datenannahmestellen. SFTP-Client-Code ist vorhanden. | Jeweilige Kostenträger / Datenannahmestellen | SFTP-Zugangsdaten, Host-Keys, ggf. Zertifikate | NEIN — erst relevant wenn DTA-Übermittlung (B1) aktiv ist | JA | Niedrig |
| B9 | B | Barrierefreiheit (BITV 2.0 / WCAG) | BITV-Test und WCAG-2.1-AA-Konformitätsprüfung. Standard-Next.js-Rendering ohne dedizierte Prüfung. | Externer Auditor (BITV-Prüfstelle) | BITV-Prüfbericht | NEIN — keine gesetzliche Voraussetzung für §45b-Leistungserbringung; wird ab 2025 durch BFSG stufenweise relevant | JA | Mittel |
| B10 | B | Datenschutz-Folgenabschätzung (DSFA) | Formale DSFA gemäß Art. 35 DSGVO. Noch nicht durchgeführt. | DSB / externe Datenschutz-Beratung | DSFA-Template, Verarbeitungsverzeichnis, TOM-Dokumentation | NEIN — DSGVO-Pflicht unabhängig von §45b, aber kein technischer Blocker für den Betriebsstart; sollte zeitnah erfolgen | JA — sollte aber nicht lange aufgeschoben werden | Hoch |
| B11 | B | QMS / AVV | Qualitätsmanagementsystem-Dokumente und Auftragsverarbeitungsverträge fehlen. | QM-Beauftragter, Rechtsberatung | QMS-Handbuch, AVV-Vorlagen, Verarbeitungsverzeichnis | NEIN — organisatorische Anforderung, kein technischer Blocker | JA | Mittel |
| C1 | C | Kassenabrechnungs-Stammdaten | Fachliche Prüfung ob die 23 Tarife / 24 Leistungspreise echte Vergütungssätze oder Testdaten sind. Abgleich mit Landesrahmenvertrag Hessen. | Fachliche Leitung / Abrechnungsexperte | Aktuelle Vergütungsvereinbarung Hessen, Versorgungsverträge nach §§ 72, 75 SGB XI | **JA** — vor jeder Kassenabrechnung müssen die Tarife stimmen | NEIN — muss vor Start geprüft sein | **Kritisch** |
| C2 | C | PfluV-Obergrenzen | Prüfung ob die hinterlegten Preisobergrenzen (30 €/Std. Betreuung, 25 €/Std. Entlastung) den aktuellen PfluV-Vorgaben Hessen entsprechen. | Pflegedienstleitung / Fachliche Leitung | Aktuelle PfluV Hessen (inkl. Novellierungsstand) | NEIN — Obergrenzen sind Guard-Rails, der Trigger ist auf `bestaetigt=FALSE` (inaktiv) | JA — vor Scharfschaltung des Triggers prüfen | Mittel |
| C3 | C | Landesfeiertage | Korrektheit der vorhandenen Feiertagsdaten für Hessen (+ 4 weitere Bundesländer). Vollständigkeit bei Expansion. | Fachliche Leitung | Offizielle Feiertagskalender der Bundesländer | NEIN — betrifft nur Zuschlagsberechnung; ohne Feiertags-Zuschlag wird der Basistarif berechnet | JA | Niedrig |
| C4 | C | SEPA Creditor-ID | Echte Creditor-ID der Alltagsengel-Organisation eintragen (aktuell: Platzhalter `DE98ZZZ09999999999`). | Geschäftsführung / Hausbank | SEPA Creditor-ID von der Deutschen Bundesbank (Gläubiger-Identifikationsnummer) | **JA** — ohne echte Creditor-ID kein Lastschrifteinzug möglich | NEIN — muss vor erstem Lastschrifteinzug konfiguriert sein | **Kritisch** |
| C5 | C | Organisation-IK | Korrekte IK-Nummer (mit gültiger Prüfziffer) als Env-Variable `ALLTAGSENGEL_IK` konfigurieren. | Geschäftsführung / IK-Vergabestelle (ARGE-IK) | IK-Bescheid der ARGE-IK | NEIN — IK ist für DTA-Übermittlung relevant, nicht für §45b-Direktabrechnung mit Kunden | JA | Mittel |
| C6 | C | Verordnungs-Check | Fachliche Entscheidung ob automatische Prüfung auf ärztliche Verordnung implementiert oder organisatorisch gelöst wird. | Fachliche Leitung / Rechtsberatung | Ggf. Auszug aus Versorgungsvertrag bzgl. Verordnungspflicht | NEIN — §45b-Entlastungsleistungen erfordern keine ärztliche Verordnung (Pflegegrad genügt) | JA | Niedrig |

---

## Zusammenfassung: Was muss VOR §45b-Produktivstart erledigt sein?

Nur **2 Punkte** sind zwingend vor dem Start mit §45b-Entlastungsleistungen erforderlich:

1. **C1 — Stammdaten-Prüfung:** Die hinterlegten Tarife/Leistungspreise müssen gegen die geltende Vergütungsvereinbarung geprüft werden.
2. **C4 — SEPA Creditor-ID:** Die echte Gläubiger-Identifikationsnummer muss konfiguriert werden.

Alle anderen Punkte (B1–B11, C2, C3, C5, C6) können im laufenden Betrieb nachgerüstet werden.

**Empfehlung zusätzlich zeitnah:**
- **B10 (DSFA):** Datenschutz-Folgenabschätzung sollte bald nach Betriebsstart durchgeführt werden (DSGVO-Pflicht bei Verarbeitung besonderer Kategorien personenbezogener Daten).
- **C5 (IK-Nummer):** Wird benötigt sobald DTA-Übermittlung (B1) aktiviert wird.

---

## Hinweis zu regulatorischen Anforderungen

Die Punkte B1 (ITSG), B2 (§302), B3 (KIM/TI), B4 (FHIR/ISiP), B5 (DiPA/BfArM), B7 (BSI) sind Anforderungen für:
- **DTA/Kassenabrechnung** (elektronische Datenübermittlung nach §105 SGB XI)
- **DiPA-Listung** (Digitale Pflegeanwendung nach §39a SGB XI)
- **Telematikinfrastruktur-Anbindung**

Diese sind für den **§45b-Entlastungsleistungs-Betrieb NICHT erforderlich.** §45b-Leistungen werden direkt mit der Pflegekasse des Versicherten abgerechnet, üblicherweise per Rechnung (Papier oder PDF). Die elektronische Datenübermittlung ist eine Optimierung, keine Voraussetzung.
