# Briefing für externen Penetrationstest — Digitaler PflegeCoach

**Produkt:** Digitaler PflegeCoach
**Hersteller:** Alltagsengel UG (haftungsbeschränkt), Neue Mainzer Straße 66-68, 60311 Frankfurt am Main
**Produktversion:** 0.5.0 (`lib/coach/version.ts`)
**Stand dieses Briefings:** 2026-08-15
**Status:** Briefing für Auftragsvergabe — **noch nicht beauftragt**
**DiPA-Matrix-Kennung:** SEC-04 — Zeitklasse A (Durchführung; Vorlage nur auf Verlangen)

---

## Zweck und Leseanleitung

Dieses Dokument beschreibt den Scope und die Rahmenbedingungen für einen
externen Penetrationstest des Digitalen PflegeCoach. Es ergänzt das bestehende
Scope-Dokument `audit/dipa/pentest_beauftragung_scope.md`, das die
versandfertige Beauftragungsunterlage darstellt.

**Wichtige Abgrenzung zu SEC-01 (TR-03161):**

SEC-04 (Penetrationstest) ist laut interner Matrix **nicht separat zu beauftragen**,
sondern mit SEC-01 (TR-03161-Zertifizierung) zusammen zu vergeben. Der
BfArM-Leitfaden (Kap. 3.4.2, S. 51) empfiehlt eine BSI-Teststelle als
Durchführende, schreibt sie aber nicht zwingend vor.

**Dieses Briefing existiert als eigenständiges Dokument für den Fall, dass:**

1. Die TR-03161-Prüfstelle den Pentest **nicht** als Teilleistung anbietet
2. Ein separater Pentest **vor** der TR-03161-Zertifizierung gewünscht ist
   (z. B. als Vorbereitung, um Schwachstellen vorab zu finden und zu beheben)
3. Der BfArM in der Beratung eine separate Prüfung fordert

**Ausdrücklich:**

- Es liegt **keine DiPA-Zulassung** vor, keine ist beantragt.
- Der PflegeCoach ist für Endnutzer **dauerhaft kostenlos**.

---

## 1. Prüfgegenstand

### 1.1 Scope

Der Penetrationstest bezieht sich **ausschließlich auf den Digitalen PflegeCoach**,
nicht auf die übrige Alltagsengel-Plattform.

| Einschluss | Umfang |
|---|---|
| Oberfläche | `https://alltagsengel.care/pflegecoach/**` — alle Produktseiten |
| Schnittstellen | `https://alltagsengel.care/api/coach/**` — 17 Routen |
| Datenzugriff | Row Level Security auf allen `coach_*`-Tabellen (18 Tabellen) |
| Anmeldung | Passwortanmeldung und zweiter Faktor (TOTP) |
| Datenexport | JSON-Vollexport und FHIR-Bundle |

| Ausdrücklicher Ausschluss | Begründung |
|---|---|
| Betriebsbereich (`/mis`, `/admin`) | Eigener Vertrauensbereich, nicht Teil des DiPA-Produkts |
| Buchungs-/Abrechnungsstrecke | Nicht Teil des DiPA-Produkts |
| Mobile Anwendungen | Nicht Teil des DiPA-Produkts |
| Infrastruktur von Supabase/Vercel | Nicht im Verantwortungsbereich des Herstellers |

### 1.2 Prüfansatz

**Grey-Box-Test** (empfohlen): Die Prüfstelle erhält Zugangsdaten für
Testkonten und Architekturdokumentation, aber keinen Quellcode-Zugang.

Fünf Testkonten stehen bereit:
1. Zwei `pflegebeduerftig`-Konten (Prüfung der Datentrennung)
2. Ein `angehoerig`-Konto (Prüfung der Freigabegrenzen)
3. Ein Administrator-Konto (Prüfung der Produktgrenze)
4. Ein Konto mit aktiviertem TOTP-MFA

### 1.3 Prüfschwerpunkte

| Schwerpunkt | Konkretes Prüfziel |
|---|---|
| Datentrennung | Kein Nutzer kann Daten anderer Nutzer lesen/schreiben |
| Produktgrenze | Admin-Kontext gibt keinen Zugriff auf `coach_*`-Gesundheitsdaten |
| MFA-Durchsetzung | Eingerichteter TOTP kann nicht umgangen werden |
| Einwilligungswiderruf | Nach Widerruf kein schreibender Zugriff mehr |
| Pseudonymisierung | Nutzungsereignisse lassen sich nicht re-identifizieren |
| Session-Management | Kein Session-Hijacking, kein Session-Fixation |
| Eingabevalidierung | Kein SQL-Injection, kein XSS im Produktpfad |
| API-Sicherheit | Keine offenen Endpunkte, kein IDOR, kein Mass Assignment |

Vollständige Details: `audit/dipa/pentest_beauftragung_scope.md` (Abschnitte 2–4).

---

## 2. Anforderungen an den Prüfer

### 2.1 Qualifikation

| Anforderung | Verbindlichkeit |
|---|---|
| Erfahrung mit Webanwendungs-Penetrationstests | Zwingend |
| OWASP Testing Guide V4 / PTES als Methodik | Zwingend |
| Zertifizierung (OSCP, CREST, GPEN oder gleichwertig) | Empfohlen |
| Erfahrung mit Gesundheitswesen-/DiGA-/DiPA-Anwendungen | Empfohlen |
| BSI-akkreditierte Prüfstelle | SOLL (laut Leitfaden), kein MUSS |
| Unabhängigkeit vom Hersteller | Zwingend |
| Vertraulichkeitsvereinbarung (NDA) | Zwingend (Gesundheitsdaten im Scope) |

### 2.2 Geeignete Prüfstellen / Anbieter

**BSI-akkreditierte IT-Sicherheitsprüfstellen** (können TR-03161 + Pentest):

| Anbieter | Standort | Profil |
|---|---|---|
| **TÜV Informationstechnik GmbH (TÜViT)** | Essen | BSI-akkreditiert; DiGA/DiPA-Erfahrung; TR-03161 + Pentest aus einer Hand |
| **SRC Security Research & Consulting GmbH** | Bonn | BSI-akkreditiert; Schwerpunkt Finanz-/Gesundheitssektor |
| **atsec information security GmbH** | München | BSI-akkreditiert; internationale Kunden |
| **datenschutz cert GmbH** | Bremen | BSI-akkreditiert; Schwerpunkt Datenschutz + IT-Sicherheit |

**Spezialisierte Pentest-Anbieter** (falls separater Pentest gewünscht):

| Anbieter | Standort | Profil |
|---|---|---|
| **SySS GmbH** | Tübingen | Deutschlands bekanntester reiner Pentest-Anbieter; umfangreiche Webapp-Erfahrung |
| **Cure53** | Berlin | Internationaler Ruf, spezialisiert auf Web-/App-Security; Open-Source-Audits |
| **SEC Consult** | Frankfurt, Wien | Webapp-/API-Pentests; Healthcare-Erfahrung |
| **cirosec GmbH** | Heilbronn | Mittelstands-fokussiert, OWASP-Methodik |
| **NSIDE ATTACK LOGIC GmbH** | München | Red Teaming, Webapp-Pentests |

---

## 3. Realistischer Kostenrahmen

| Szenario | Kostenrahmen | Dauer |
|---|---|---|
| Webapp-Pentest (Grey-Box, 17 API-Routen + UI) | 8.000–15.000 € | 5–10 Personentage |
| Erweiterter Pentest (+ Datenbankebene, RLS-Prüfung) | 12.000–22.000 € | 8–15 Personentage |
| Pentest als Teil der TR-03161-Zertifizierung | Im TR-03161-Gesamtpreis enthalten | Im TR-03161-Zeitplan |
| Vorbereitender Pentest (vor TR-03161, optional) | 5.000–10.000 € | 3–5 Personentage |

**Empfehlung:** Pentest **nicht** separat beauftragen, sondern als Teilleistung
der TR-03161-Zertifizierung vergeben. Falls die Prüfstelle das nicht anbietet
oder ein vorbereitender Test gewünscht ist, separates Angebot bei SySS oder
Cure53 einholen.

---

## 4. Erwartete Deliverables

| Deliverable | Inhalt |
|---|---|
| Pentest-Bericht | Alle gefundenen Schwachstellen mit CVSS-Bewertung |
| Executive Summary | Management-taugliche Zusammenfassung |
| Retest-Empfehlung | Nach Behebung der Findings |
| Optional: Retest | Nachprüfung der behobenen Schwachstellen |

### 4.1 Anforderungen an den Bericht

- CVSS 3.1 oder CVSS 4.0 Bewertung für jede Schwachstelle
- Reproduzierbare Proof-of-Concepts
- Empfehlungen zur Behebung
- Keine Schwärzung von Testdaten (Testsystem, keine realen Nutzerdaten)
- Format: PDF, maschinenlesbar (CSV/JSON für Schwachstellenliste)

---

## 5. Bereitzustellende Unterlagen

| Dokument | Inhalt |
|---|---|
| `audit/dipa/pentest_beauftragung_scope.md` | **Versandfertige Beauftragungsunterlage** — Scope, Testkonten, Schwerpunkte, Durchführungsregeln |
| `audit/dipa/sicherheitsarchitektur_pflegecoach.md` | Architektur, Vertrauensgrenzen, bekannte Schwächen |
| `audit/dipa/technische_dokumentation_pflegecoach.md` | Systembeschreibung |
| `audit/dipa/rollen_rechtekonzept.md` | Rollen und Rechte |
| `audit/dipa/datenfluesse_pflegecoach.md` | Datenflüsse |
| dieses Dokument | Gesamtkontext und Anbieterrecherche |

---

## 6. Zeitrahmen

| Phase | Dauer |
|---|---|
| Angebotseinholung | 2–4 Wochen |
| Vorbereitung / Testumgebung aufsetzen | 1–2 Wochen |
| Durchführung Pentest | 1–3 Wochen |
| Berichterstellung | 1–2 Wochen |
| Behebung der Findings | 2–6 Wochen (je nach Schwere) |
| Optional: Retest | 1 Woche |
| **Gesamt** | **8–18 Wochen** |

---

## 7. Klassifizierung

| Kriterium | Bewertung |
|---|---|
| MUSS EXTERN | **Ja** — unabhängige Prüfung zwingend (laut BfArM SOLL BSI-akkreditiert) |
| Intern vorbereitbar | Ja — Scope-Dokument, Testkonten, Testumgebung |
| Zusammenlegbar mit | SEC-01 (TR-03161) — **empfohlene Zusammenlegung** |
| Zeitklasse | **A** — Durchführung vor Antrag; Vorlage auf Verlangen |
| Priorität | P0 (gemeinsam mit SEC-01) |
