# Zertifizierungsleitfaden: DiPA-Listung beim BfArM

**Stand:** 2026-08-12  
**Betrifft:** B5 — DiPA/PflegeCoach BfArM-Listung  
**Grundlage:** § 39a SGB XI, DiPAV (Digitale Pflegeanwendungenverordnung)

---

## Was ist eine DiPA?

Eine **Digitale Pflegeanwendung (DiPA)** ist eine CE-gekennzeichnete Software, die von Pflegebedürftigen oder pflegenden Angehörigen genutzt wird. DiPA werden vom BfArM (Bundesinstitut für Arzneimittel und Medizinprodukte) in das DiPA-Verzeichnis aufgenommen und von Pflegekassen erstattet (bis zu 50 €/Monat).

---

## Ist-Zustand: PflegeCoach-Modul

- [x] PflegeCoach v0.2.0 technisch gebaut
- [x] 48 Tests grün
- [x] HMAC-Pseudonymisierung funktioniert
- [x] Zwei-Welten-Modell (DiPA-Daten getrennt von Betriebsdaten)
- [x] Block 15a-15d implementiert
- [ ] BSI TR-03161 Zertifizierung
- [ ] ISO 27001 ISMS
- [ ] DSFA abgeschlossen
- [ ] Pflegefachliche Freigabe
- [ ] Wissenschaftlicher Evaluationspartner
- [ ] Externes Security-Review

---

## DiPAV-Anforderungen (Digitale Pflegeanwendungenverordnung)

Die DiPAV (§ 3 ff.) definiert folgende Anforderungsgruppen:

### 1. Sicherheit und Datenschutz (§ 4 DiPAV)

| Anforderung | Status | Nachweis |
|------------|--------|---------|
| Datenschutz nach DSGVO | Teilweise | DSFA-Vorlage erstellt, Durchführung offen |
| Informationssicherheit | Teilweise | RLS/Org-Fences vorhanden, BSI TR-03161 fehlt |
| BSI TR-03161 Zertifikat | FEHLT | Prüfung durch anerkanntes Labor erforderlich |
| Verschlüsselung at-rest und in-transit | OK | Supabase + HTTPS |
| Pseudonymisierung | OK | HMAC-basiert implementiert |

### 2. Qualität und Interoperabilität (§ 5 DiPAV)

| Anforderung | Status | Nachweis |
|------------|--------|---------|
| FHIR-Schnittstelle | Vorhanden | R4-Endpunkte, 56 Tests |
| Datenexport für Nutzer | Vorhanden | FHIR-Export mit Vorschau |
| Barrierefreiheit (WCAG 2.1 AA) | Offen | Keine dedizierte Prüfung |
| Nutzerfreundlichkeit | Offen | Keine formale Usability-Studie |

### 3. Positive Versorgungseffekte (§ 6 DiPAV)

| Anforderung | Status | Nachweis |
|------------|--------|---------|
| Pflegefachlicher Nutzen | NACHZUWEISEN | Evaluationsstudie erforderlich |
| Entlastung pflegender Angehöriger | NACHZUWEISEN | Evaluationsstudie erforderlich |
| Verbesserung der Pflegesituation | NACHZUWEISEN | Evaluationsstudie erforderlich |

---

## Schritt-für-Schritt: Listungsantrag

### Phase 1: Vorbereitung (3-6 Monate)

1. **ISO 27001 ISMS aufbauen**
   - Informationssicherheits-Managementsystem dokumentieren
   - Risikobewertung durchführen
   - Technische und organisatorische Maßnahmen dokumentieren
   - Zertifizierung durch akkreditierte Stelle

2. **BSI TR-03161 Prüfung**
   - Prüflabor beauftragen (TR-03161 Teil 2: Web-Anwendungen)
   - Prüfung durchführen lassen
   - Feststellungen beheben
   - Zertifikat erhalten

3. **DSFA abschließen**
   - Vorlage: `docs/DSFA_VORLAGE.md`
   - Mit DSB durchführen und dokumentieren

4. **Barrierefreiheit herstellen**
   - WCAG 2.1 Level AA
   - BITV 2.0 Prüfung

### Phase 2: Evaluation (6-12 Monate)

5. **Wissenschaftlichen Partner finden**
   - Universität oder Forschungsinstitut mit Pflegewissenschafts-Lehrstuhl
   - Studienprotokoll erstellen
   - Ethik-Votum einholen

6. **Evaluationsstudie durchführen**
   - Prospektive Studie mit Kontrollgruppe
   - Primärer Endpunkt: Verbesserung der Pflegesituation
   - Mindestens 3 Monate Beobachtungszeitraum
   - Mindestens 50 Teilnehmer (Empfehlung)

### Phase 3: Antragstellung (1-3 Monate)

7. **BfArM-Antrag vorbereiten**
   - Online-Antrag über DiPA-Verzeichnis-Plattform
   - Alle Nachweise zusammenstellen
   - Herstellererklärung ausfüllen

8. **Antrag einreichen**
   - Digitaler Antrag beim BfArM
   - Gebühr entrichten

9. **BfArM-Prüfung abwarten**
   - Prüfungsdauer: ca. 3 Monate
   - Ggf. Nachforderungen beantworten

10. **Listung und Vergütung**
    - Aufnahme ins DiPA-Verzeichnis
    - Vergütung: bis zu 50 €/Monat pro Nutzer (Pflegekasse zahlt)

---

## Zeitrahmen gesamt

| Phase | Dauer |
|-------|-------|
| Phase 1: Vorbereitung | 3-6 Monate |
| Phase 2: Evaluation | 6-12 Monate |
| Phase 3: Antrag | 1-3 Monate |
| BfArM-Prüfung | ca. 3 Monate |
| **Gesamt** | **13-24 Monate** |

---

## Kosten (Schätzung)

| Posten | Kosten |
|--------|--------|
| ISO 27001 Zertifizierung | 15.000-30.000 € |
| BSI TR-03161 Prüfung | 20.000-50.000 € |
| Externer Pentest | 10.000-25.000 € |
| DSFA (extern) | 5.000-15.000 € |
| Evaluationsstudie | 50.000-150.000 € |
| BfArM-Gebühren | ca. 5.000 € |
| Barrierefreiheits-Audit | 5.000-10.000 € |
| **Gesamt** | **110.000-285.000 €** |

---

## Relevanz für §45b-Betrieb

**NICHT ERFORDERLICH.** Die DiPA-Listung ist ein eigenständiges Geschäftsmodell und blockiert den §45b-Entlastungsleistungs-Betrieb nicht. Der PflegeCoach läuft als separates Modul.

---

## Kontakt

- **BfArM DiPA-Verzeichnis:** https://dipa.bfarm.de/
- **BfArM Kontakt:** dipa@bfarm.de
- **gematik (ISiP):** https://fachportal.gematik.de/
