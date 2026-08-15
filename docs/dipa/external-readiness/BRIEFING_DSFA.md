# Briefing — Datenschutz-Folgenabschätzung (DSFA) für den Digitalen PflegeCoach

**Produkt:** Digitaler PflegeCoach
**Hersteller:** Alltagsengel UG (haftungsbeschränkt), Neue Mainzer Straße 66-68, 60311 Frankfurt am Main
**Produktversion:** 0.5.0 (`lib/coach/version.ts`)
**Stand dieses Briefings:** 2026-08-15
**Status:** Briefing für Mandatsvergabe — **noch nicht beauftragt**
**DiPA-Matrix-Kennung:** DS-02 — EXTERNAL_EVIDENCE_REQUIRED

---

## Zweck und Einordnung

Dieses Briefing beschreibt den Stand der DSFA-Vorbereitung und was eine
Kanzlei benötigt, um die DSFA abzuschließen. Es ist ein **Teildokument** des
umfassenderen Datenschutzpakets (→ `BRIEFING_DATENSCHUTZ_KANZLEI.md`,
Arbeitspaket 1 von 4). Es wird hier separat dokumentiert, da die DSFA
auch **unabhängig** vom Rest des Datenschutzpakets beauftragt werden kann.

**Rechtsgrundlage:** DSGVO Art. 35 (Pflicht zur DSFA bei hohem Risiko für
die Rechte und Freiheiten natürlicher Personen). Art. 9 Abs. 1 DSGVO
(besondere Kategorien personenbezogener Daten — Gesundheitsdaten).

**Ausdrücklich:**

- Es liegt **keine DiPA-Zulassung** vor, keine ist beantragt.
- Der PflegeCoach ist für Endnutzer **dauerhaft kostenlos**.
- Das bestehende Vorbereitungsdokument ist **keine DSFA**, sondern ein
  Entwurf — es darf nicht als abgeschlossene DSFA gegenüber dem BfArM
  verwendet werden.

---

## 1. Warum eine DSFA erforderlich ist

Die DSFA-Pflicht nach Art. 35 Abs. 3 lit. b DSGVO ist einschlägig:

- **Umfangreiche Verarbeitung besonderer Kategorien** (Art. 9): Der PflegeCoach
  verarbeitet Gesundheitsdaten (Pflegebedarf, Selbsteinschätzungen, Ziele,
  Aktivitäten, Messungen)
- **Vulnerable Betroffene:** Pflegebedürftige sind eine schutzbedürftige Gruppe
- **Systematische Verarbeitung:** Wiederkehrende Erhebung über den gesamten
  Nutzungszeitraum

Diese Einschätzung ist intern als Entwurf dokumentiert, **aber noch nicht
juristisch bestätigt** — genau das ist die erste Aufgabe der Kanzlei.

---

## 2. Ist-Zustand der Vorbereitung

### 2.1 Was bereits intern erstellt ist

| Dokument | Pfad | Inhalt | Status |
|---|---|---|---|
| DSFA-Vorbereitung | `audit/dipa/dsfa_pflegecoach.md` | Verarbeitungsbeschreibung, Datenkategorien, 9 Risiken (R1–R9) mit Maßnahmen und Restrisiken | **Entwurf** |
| Verarbeitungsverzeichnis | `audit/dipa/verarbeitungsverzeichnis_pflegecoach.md` | Art. 30 DSGVO, Verarbeitungstätigkeiten | **Entwurf** |
| Datenflüsse | `audit/dipa/datenfluesse_pflegecoach.md` | 10 dokumentierte Flüsse (F1–F10) | **Entwurf** |
| Einwilligungslogik | `audit/dipa/einwilligungslogik.md` | 3 Einwilligungstypen, technische Durchsetzung | **Entwurf** |
| Datenschutzarchitektur | `audit/dipa/datenschutzarchitektur_pflegecoach.md` | 7 Entwurfsentscheidungen, Grenzen | **Entwurf** |
| Löschkonzept | `audit/dipa/loeschkonzept.md` | Löschfristen, Betroffenenrechte | **Entwurf** |
| Verschlüsselungskonzept | `audit/dipa/verschluesselungskonzept.md` | Transport/Ruhezustand, Begründung gegen E2E | **Entwurf** |

### 2.2 Identifizierte Risiken (aus der Vorbereitung)

| ID | Risiko | Maßnahme vorhanden | Restrisiko | Bewertung (juristisch) |
|---|---|---|---|---|
| R1 | Unbefugter Zugriff auf Gesundheitsdaten | RLS, 68 Shadow-Tests | Abweichung Repo↔Produktion | **offen** |
| R2 | Datenverlust | Supabase-Backups | Rücksicherung nie getestet | **offen** |
| R3 | Fehlgebrauch als medizinischer Rat | Warnhinweise, Disclaimers | Inhalt nicht fachlich freigegeben | **offen** |
| R4 | Kompromittierte Zugangsdaten | MFA (TOTP) implementiert | Einrichtung freiwillig | **hoch** |
| R5 | Zweckentfremdung durch Hersteller | Technische Zweckbindung | Vertraglich nicht abgesichert | **offen** |
| R6 | Re-Identifizierung pseudonymisierter Daten | HMAC-SHA256 | Theoretisches Restrisiko | **offen** |
| R7 | Unbemerkte Datenänderung | Append-only Audit-Log | Kein externer Log-Server | **offen** |
| R8 | Unzulängliche Löschung | Löschrouten implementiert | Backup-Aufbewahrung unklar | **offen** |
| R9 | Gemeinsame Infrastruktur | Produkttrennung, eigene Tabellen | Gemeinsame Anmeldung | **mittel** |

**Alle juristischen Bewertungen (Eintrittswahrscheinlichkeit × Schwere) stehen
aus — das ist Kernaufgabe der Kanzlei.**

---

## 3. Aufgaben der Kanzlei

### 3.1 Was die Kanzlei übernimmt

1. **Erforderlichkeit** nach Art. 35 Abs. 3 lit. b förmlich feststellen
2. **Juristische Risikobewertung** aller 9 Risiken (Eintrittswahrscheinlichkeit × Schwere)
3. **Bewertung offener Felder** (alle mit „[zu bewerten]" im Entwurf):
   - Drittlandtransfer (abhängig vom AVV-Ergebnis)
   - Kopplungsverbot bei Pflicht-Einwilligung
   - Restrisiko Datenbank-Administratorzugriffe
4. **Einwilligungstexte und Datenschutzhinweise** juristisch prüfen
5. **DSFA als Dokument abschließen**: datieren, unterschreiben,
   Überprüfungsintervall festlegen
6. Optional: **Stellungnahme der Aufsichtsbehörde** einholen (falls Risiken
   nach Abhilfemaßnahmen weiterhin hoch)

### 3.2 Was NICHT Aufgabe der Kanzlei ist

- Technische Maßnahmen implementieren (liegt bei der Entwicklung)
- Geschäftsentscheidungen treffen (MFA-Pflicht, Preise, Betriebsmodell)
- AVVs abschließen (eigenes Arbeitspaket, kann parallel laufen)

---

## 4. Anforderungen an die Kanzlei / den DSB

### 4.1 Qualifikation

| Anforderung | Verbindlichkeit |
|---|---|
| Fachanwalt für IT-Recht oder Datenschutzrecht | Empfohlen |
| Erfahrung mit DSFA nach Art. 35 DSGVO | Zwingend |
| Erfahrung mit Gesundheitswesen / DiGA / DiPA | Stark empfohlen |
| Erfahrung mit Art.-9-Daten (besondere Kategorien) | Zwingend |
| Kenntnis der DSK-Muss-Liste (DSFA-Blacklist) | Zwingend |

### 4.2 Geeignete Kanzleien / Berater

| Anbieter | Standort | Profil |
|---|---|---|
| **Spirit Legal LLP** | Leipzig | DiGA-/Gesundheitswesen-Datenschutz; DSFA-Erfahrung publiziert |
| **Ehlers, Ehlers & Partner** | München | Medizinrecht + Datenschutz; Healthcare-IT-Mandanten |
| **Schürmann Rosenthal Dreyer** | Berlin, Hamburg | Health-Tech, DiGA-Begleitung, DSGVO-Spezialisten |
| **Vogel & Partner** | Karlsruhe | IT-Recht, Datenschutz; mittelstandsorientiert |
| **Althammer & Kill GmbH & Co. KG** | Hannover | Datenschutz im Gesundheitswesen; ext. DSB-Dienst |

**Hinweis:** Die DSFA kann auch durch einen externen Datenschutzbeauftragten
(DSB) erstellt werden. Die Bestellung eines DSB ist für Alltagsengel
(< 20 Personen regelmäßig mit Datenverarbeitung) nicht verpflichtend,
aber im DiPA-Kontext empfohlen.

---

## 5. Realistischer Kostenrahmen

| Leistung | Kostenrahmen | Dauer |
|---|---|---|
| DSFA erstellen/abschließen (auf Basis des Entwurfs) | 5.000–12.000 € | 4–8 Wochen |
| DSFA + Einwilligungstexte prüfen | 7.000–15.000 € | 5–10 Wochen |
| DSFA als Teil des Gesamtpakets (BRIEFING_DATENSCHUTZ_KANZLEI.md) | Im Gesamtpaket 15.000–30.000 € | 8–16 Wochen |
| Laufende Überprüfung (jährlich) | 2.000–4.000 € | 1–2 Tage |

**Empfehlung:** DSFA **im Gesamtpaket** mit AVV und MDR-Abgrenzung beauftragen
(→ `BRIEFING_DATENSCHUTZ_KANZLEI.md`). Die Themen greifen inhaltlich
ineinander (gleiche Datenkategorien, gleiche Rechtsgrundlage, gleiche
Auftragsverarbeiter).

---

## 6. Intern vorbereitbare Evidenz

Diese Dokumente kann Alltagsengel **vor** der Mandatsvergabe fertigstellen,
um Kosten zu senken:

| Dokument | Status | Aktion |
|---|---|---|
| Verarbeitungsverzeichnis aktualisieren | Entwurf vorhanden | Gegen Live-Schema prüfen |
| Datenflussdiagramme | 10 Flüsse dokumentiert | Auf Vollständigkeit prüfen |
| Einwilligungstexte (aktueller Stand) | Im Code | Exportieren für Kanzlei-Review |
| Technische Maßnahmen-Übersicht | In mehreren Dokumenten | Konsolidieren |
| Backup-Aufbewahrungsfristen | Unbekannt | Bei Supabase anfragen |
| Löschprotokolle (technischer Nachweis) | Löschrouten implementiert | Testprotokolle erstellen |

---

## 7. Klassifizierung

| Kriterium | Bewertung |
|---|---|
| MUSS EXTERN | **Ja** — juristische Bewertung intern nicht leistbar |
| KANN INTERN vorbereitet werden | **Ja** — Verarbeitungsbeschreibung, Risiken, Maßnahmen (alles bereits vorhanden) |
| Zusammenlegbar mit | DS-04 (AVV), PROD-02 (MDR-Abgrenzung), VS-04 (Nutzungsbedingungen) → BRIEFING_DATENSCHUTZ_KANZLEI.md |
| Zeitklasse | Vor Antrag (Teil des Antragspakets) |
| Priorität | P0 |
