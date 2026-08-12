# RESTLISTE KATEGORIE B + C — Offene Punkte nach Betriebsabnahme

**Stand:** 2026-08-12 (aktualisiert: intern lösbare Punkte bearbeitet)  
**Quelle:** FINALE_BETRIEBSABNAHME.md, Commit `c1760e0`

---

## Legende

- **Kategorie B:** Technisch fertig implementiert, aber durch externe Abhängigkeiten blockiert
- **Kategorie C:** Technisch fertig implementiert, aber fachliche Abnahme durch Geschäftsführung/Fachleitung erforderlich
- **INTERN ERLEDIGT:** Punkte, die in dieser Session intern vorbereitet/abgeschlossen wurden

---

## Vollständige Restliste

| # | Kat. | Punkt | Was genau fehlt | Wer muss es erledigen | Für §45b-Produktivbetrieb erforderlich | Intern vorbereitet | Priorität |
|---|------|-------|----------------|----------------------|---------------------------------------|-------------------|-----------|
| B1 | B | ITSG-Zertifikat | ITSG-Zertifikat für DTA | ITSG GmbH | NEIN | Zertifizierungsleitfaden erstellt | Mittel |
| B2 | B | § 302 SGB V | TA1 + Schlüsselverzeichnisse | GKV-Spitzenverband | NEIN | Kein Handlungsbedarf (§302 ≠ §45b) | Niedrig |
| B3 | B | KIM/TI | gematik-Zulassung + Hardware | gematik, KIM-Provider | NEIN | Zertifizierungsleitfaden erstellt | Niedrig |
| B4 | B | FHIR/ISiP | ISiP-Konformitätsprüfung | gematik, KBV | NEIN | ISiP-Profile dokumentiert (öffentlich auf Simplifier) | Niedrig |
| B5 | B | DiPA BfArM | BSI TR-03161, ISMS, DSFA, Evaluation | BSI, BfArM, Gutachter | NEIN | Zertifizierungsleitfaden erstellt | Niedrig |
| B6 | B | Vitalwerte MDR | MDR-Klassifizierung | Benannte Stelle | NEIN | MDR-Analyse dokumentiert (Option A = kein MP) | Niedrig |
| B7 | B | BSI/Pentest/MFA | BSI-Zertifikat, externer Pentest | BSI, Pentester | NEIN | MFA machbar (Supabase TOTP nativ), Pentest-Scope dokumentiert | Mittel |
| B8 | B | SFTP-Zugänge | SFTP-Credentials der Datenannahmestellen | Kostenträger | NEIN | SFTP-Code produktionsreif, keine eigenen Tests (indirekt getestet) | Niedrig |
| B9 | B | Barrierefreiheit | BITV-Test, WCAG 2.1 AA | Externer Auditor | NEIN | Kein automatisierter Scan (kein axe/pa11y installiert) | Mittel |
| B10 | B | DSFA | Formale DSFA nach Art. 35 DSGVO | DSB / Datenschutz-Beratung | NEIN (aber DSGVO-Pflicht) | **DSFA_VORLAGE.md erstellt** (alle Pflichtabschnitte) | Hoch |
| B11 | B | QMS / AVV | QMS-Dokumente, AVV-Vorlagen | QM-Beauftragter, Rechtsberatung | NEIN | **QMS_GRUNDGERUEST.md + AVV_VORLAGE.md erstellt** | Mittel |
| C1 | C | Stammdaten | Tarife gegen Vergütungsvereinbarung prüfen | Fachliche Leitung | **JA** | Wird von Tarif-Recherche bearbeitet | **Kritisch** |
| C2 | C | PfluV-Obergrenzen | PfluV-Konformität prüfen | Pflegedienstleitung | NEIN | **Recherche: PfluV (Bund) gilt NICHT für ambulante §45b; Hessen-PfluV-Obergrenzen sind als unbestätigte Guard-Rails hinterlegt** | Mittel |
| C3 | C | Landesfeiertage | Korrektheit + Vollständigkeit | Fachliche Leitung | NEIN | **ERLEDIGT: Alle 16 Bundesländer implementiert + 66 Tests** | Niedrig |
| C4 | C | SEPA Creditor-ID | Echte Creditor-ID eintragen | Geschäftsführung / Bundesbank | **JA** | **ANLEITUNG_SEPA_CREDITOR_ID.md erstellt** | **Kritisch** |
| C5 | C | Organisation-IK | IK als Env konfigurieren | Geschäftsführung / ARGE-IK | NEIN | **IK 460629986 ist prüfziffer-valide; getOrgIK() lädt aus DB/Env ohne Fallback** | Mittel |
| C6 | C | Verordnungs-Check | Fachliche Entscheidung | Fachliche Leitung | NEIN | **Recherche: §45b braucht KEINE ärztliche Verordnung; Code unterscheidet korrekt (istVerordnungPflicht=false für entlastung_45b)** | Niedrig |

---

## Intern erstellte Dokumente

| Dokument | Beschreibung | Betrifft |
|----------|-------------|---------|
| `docs/DSFA_VORLAGE.md` | Vollständiges DSFA-Grundgerüst nach Art. 35 DSGVO mit allen Pflichtabschnitten, Risiko-Matrix, TOM-Übersicht | B10 |
| `docs/AVV_VORLAGE.md` | AVV-Vorlage nach Art. 28 DSGVO mit Dienstleister-Übersicht (Supabase, Vercel, Stripe) | B11 |
| `docs/QMS_GRUNDGERUEST.md` | QMS-Grundgerüst orientiert an ISO 9001:2015 mit Prozesslandkarte, Qualifikationsanforderungen, Beschwerdemanagement, KVP | B11 |
| `docs/ANLEITUNG_SEPA_CREDITOR_ID.md` | Schritt-für-Schritt-Anleitung Creditor-ID beantragen + im System konfigurieren | C4 |
| `docs/ZERTIFIZIERUNGSLEITFADEN_ITSG.md` | ITSG Trust-Center Zertifizierungsprozess, technische Integration, Zeitrahmen | B1 |
| `docs/ZERTIFIZIERUNGSLEITFADEN_GEMATIK_KIM.md` | KIM/TI-Anbindung, FHIR/ISiP, BSI TR-03161, Pentest-Scope, MFA-Roadmap | B3, B4, B7 |
| `docs/ZERTIFIZIERUNGSLEITFADEN_DIPA_BFARM.md` | DiPA-Listungsprozess beim BfArM, DiPAV-Anforderungen, Kostenübersicht | B5 |
| `docs/VITALWERTE_MDR_KLASSIFIZIERUNG.md` | MDR-Analyse für Grenzwertalarme: Doku = kein MP, Alarme = wahrscheinlich IIa | B6 |

## Intern abgeschlossene Prüfungen

| Punkt | Ergebnis |
|-------|---------|
| **C2: PfluV** | PfluV (Bundesverordnung) gilt für Krankenhäuser, NICHT für ambulante §45b-Dienste. Die hessische PfluV-Preisobergrenze (30/25 €/h) ist als unbestätigter Guard-Rail hinterlegt (`bestaetigt=false`). |
| **C3: Feiertage** | Von 5 auf 16 Bundesländer erweitert. Buß- und Bettag (Sachsen), Frauentag (Berlin, MV), Weltkindertag (Thüringen) ergänzt. 66 Tests grün. |
| **C5: IK-Nummer** | IK `460629986` ist prüfziffer-valide (Algorithmus: Quersumme mod 10 = 6, korrekt). Zwei Validierungsimplementierungen vorhanden (edifact-validator.ts, organizations/ik.ts). Kein Startup-Check (lazy Validation). |
| **C6: Verordnungs-Check** | §45b SGB XI braucht KEINE ärztliche Verordnung, nur Pflegegrad 1-5. Code korrekt: `istVerordnungPflicht('entlastung_45b')` → false. |
| **B7: MFA** | Supabase Auth v2.97.0 unterstützt TOTP nativ (enroll/challenge/verify/AAL). Implementierung ~4-6 Tage. Aktuell keine MFA-Code im Projekt. |
| **B8: SFTP** | `lib/abrechnung/transport.ts` ist strukturell vollständig (sendePerSFTP, pruefeAntworten, testeVerbindung). Keine Unit-Tests, aber indirekt durch Stammdaten- und Readiness-Tests abgedeckt. |

---

## Zusammenfassung: Was muss VOR §45b-Produktivstart erledigt sein?

Nur **2 Punkte** sind zwingend vor dem Start mit §45b-Entlastungsleistungen erforderlich:

1. **C1 — Stammdaten-Prüfung:** Die hinterlegten Tarife/Leistungspreise müssen gegen die geltende Vergütungsvereinbarung geprüft werden.
2. **C4 — SEPA Creditor-ID:** Die echte Gläubiger-Identifikationsnummer muss konfiguriert werden. → **Anleitung erstellt** (`docs/ANLEITUNG_SEPA_CREDITOR_ID.md`)

Alle anderen Punkte (B1–B11, C2, C3, C5, C6) können im laufenden Betrieb nachgerüstet werden.

**Empfehlung zusätzlich zeitnah:**
- **B10 (DSFA):** DSFA-Vorlage ist erstellt → mit DSB durchführen (DSGVO-Pflicht)
- **B7 (MFA):** Technisch sofort machbar, ~4-6 Tage Aufwand → nach §45b-Start implementieren
- **C5 (IK-Nummer):** IK ist valide, aber Startup-Validierung fehlt → bei DTA-Aktivierung nachrüsten

---

## Was in dieser Session NICHT intern lösbar war

| Punkt | Grund |
|-------|-------|
| B1 ITSG | Externes Zertifikat von ITSG GmbH |
| B2 § 302 | TA1-Dokument nur über GKV-Spitzenverband |
| B3 KIM/TI | Hardware (SMC-B, Konnektor) + gematik-Zulassung |
| B4 FHIR/ISiP | ISiP-Konformitätstest braucht gematik-Tooling |
| B5 DiPA | BSI-Zertifikat + Evaluationsstudie + BfArM-Antrag |
| B6 MDR/CE | Benannte Stelle für CE-Bewertung |
| B7 BSI/Pentest | Externer Pentester + BSI-Zertifizierung |
| B7 MFA | Implementierung möglich, aber ~4-6 Tage (zu groß für diese Session) |
| B8 SFTP | Echte Zugangsdaten von Datenannahmestellen |
| B9 Barrierefreiheit | Externer BITV-Auditor; kein axe/pa11y im Projekt |
| B10 DSFA | Vorlage erstellt, Durchführung braucht DSB |
| B11 QMS/AVV | Gerüste erstellt, Fertigstellung braucht QM-Beauftragten + Rechtsberatung |
| C1 Stammdaten | Fachliche Prüfung gegen Vergütungsvereinbarung |
| C4 Creditor-ID | Beantragung bei Bundesbank durch Geschäftsführung |
