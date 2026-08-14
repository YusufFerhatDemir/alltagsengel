# Interoperabilität — Schnittstellen und FHIR-Abbildung

**Produkt:** Digitaler PflegeCoach · **Version:** 0.5.0 · **Stand:** 2026-08-14
**Deckt ab:** DiPA-Matrix INT-01, INT-02, INT-03
**Umsetzung:** `lib/coach/export.ts`, `lib/coach/export.schema.json`, `lib/coach/fhir.ts`,
`app/api/coach/export/route.ts`, `/pflegecoach/bericht`

---

## 1. Wozu dieses Dokument

Es beschreibt jede Schnittstelle, über die Daten das Produkt verlassen — und
zwar so, dass ein Prüfer sie ohne Rückfrage nachvollziehen kann: welches
Format, welcher Inhalt, welche Auslassungen, welche Zusicherung.

Es gibt **keine eingehende Schnittstelle**. Der PflegeCoach nimmt keine Daten
aus Fremdsystemen entgegen — weder aus Praxissystemen noch aus der
Betriebsplattform von Alltagsengel. Jeder Datensatz entsteht durch eine
Eingabe des Nutzers selbst. Das ist eine bewusste Festlegung der
Produktgrenze (`audit/dipa/technische_dokumentation_pflegecoach.md`) und
zugleich die einfachste Antwort auf die Frage nach der Datenherkunft.

## 2. Die drei Ausgabewege

| Weg | Format | Empfänger | Auslöser |
|---|---|---|---|
| Vollexport | JSON nach eigenem Schema | Nutzer selbst (Art. 20 DSGVO) | `GET /api/coach/export` |
| FHIR-Bundle | `application/fhir+json` (FHIR R4) | Praxis, Pflegedienst, Klinik | `GET /api/coach/export?format=fhir` |
| Bericht | HTML, druckbar (PDF über den Browserdruck) | Mensch | `/pflegecoach/bericht` |

Alle drei laufen über die Sitzung des Nutzers und liefern ausschließlich
dessen eigene Daten; die Zeilenfilter der Datenbank sind dabei die einzige
Zugriffswahrheit (kein `service_role` in `app/api/coach/**`).

## 3. Vollexport (INT-01)

Schema: `lib/coach/export.schema.json`, Format-Kennung
`de.alltagsengel.pflegecoach.export`, Version 1.0. Ein Konformanz-Test
(`lib/coach/export.test.ts`) prüft bei jedem Testlauf, dass die erzeugte
Datei zum veröffentlichten Schema passt — das Schema kann also nicht
unbemerkt von der Wirklichkeit abweichen.

Enthalten: Profil (Rolle, Anzeigename, Pflegegrad, Geburtsjahr),
Einwilligungen mit Textversion und Widerrufsdatum, Assessments, Ziele,
Aktivitäten, Erledigungen, Messungen, Berichte.
Nicht enthalten: die interne Nutzerkennung der Anmeldung.

Die Feldbedeutungen (Skalen, Wochentagszählung) stehen als Klartext-Hinweis
**im Export selbst**. Begründung: Eine Datei, die ohne ihre Dokumentation
verschickt wird, ist für den Empfänger wertlos; die Bedeutung muss mitreisen.

## 4. FHIR-Bundle (INT-02)

### 4.1 Was abgebildet wird

| Quelle | FHIR-Ressource | Bemerkung |
|---|---|---|
| Selbsteinschätzung (5 Bereiche, 0–4) | `Questionnaire` + `QuestionnaireResponse` | Fragebogen liegt dem Bundle bei |
| Belastungs-Kurzform (7 Items, 0–3) | `Questionnaire` + `QuestionnaireResponse` | nur wenn eine solche Messung existiert |
| Lizenzpflichtige Instrumente (FES-I, BSFC-s, SUS) | `QuestionnaireResponse` **nur mit Summenwert** | siehe 4.4 |
| Ziele | `Goal` | `lifecycleStatus` + `achievementStatus` getrennt |
| Aktivitäten (Wochenplan) | `CarePlan` mit `activity.detail.scheduledTiming` | verweist auf die `Goal`-Ressourcen |

Bundle-Typ ist `collection`. Ein `document` wäre die stärkere Aussage
(Composition, Autor, Beglaubigung) — sie wird nicht erhoben, weil Autor
dieser Daten der Nutzer selbst ist und keine fachliche Bestätigung vorliegt.

### 4.2 Was ausdrücklich NICHT behauptet wird

Diese Liste ist der eigentliche Kern des Kapitels — sie schützt vor einer
Konformitätsaussage, die niemand geprüft hat:

1. **Keine Profilkonformität.** Es wird kein `meta.profile` gesetzt. Weder
   ein MIO, noch ein KBV-Profil, noch eine gematik-Spezifikation wird
   beansprucht. Ein Profilverweis ohne bestandene Profilvalidierung wäre
   eine Falschangabe.
2. **Keine fremden Terminologien.** Keine LOINC-, SNOMED-CT- oder
   ICF-Codes. Eine fachlich richtige Zuordnung müsste pflegefachlich
   geprüft (QI-01) und lizenzrechtlich geklärt sein (LOINC-Lizenz,
   SNOMED-Affiliate-Vereinbarung). Bis dahin gilt ausschließlich das eigene
   Codesystem unter `https://alltagsengel.care/fhir/CodeSystem/…`.
3. **Keine Verbindlichkeitsaussage.** Ob DiPA ein bestimmtes
   Austauschformat verlangt, ist offen (ORF-9, BfArM-Frage 10). Diese
   Abbildung ist die vorbereitete Antwort auf ein „ja" — kein Beleg dafür,
   dass die Anforderung erfüllt ist.

Zwei Tests halten das fest: `lib/coach/fhir.test.ts` schlägt fehl, sobald
ein `profile`-Feld, ein LOINC-, SNOMED- oder MIO-Verweis im erzeugten
Bundle auftaucht.

### 4.3 Datensparsamkeit

Das Bundle enthält **keine `Patient`-Ressource und keinen `subject`-Verweis**.
Wer die Datei bekommt, weiß aus dem Übergabekontext, um wen es geht; eine
Identität im Dokument würde beim Weiterreichen ein zusätzliches
Streuungsrisiko schaffen. Ressourcen-IDs sind laufende Nummern
(`assessment-1`, `ziel-1`), keine Datenbankschlüssel — auch das ist
getestet.

Der Preis dieser Entscheidung ist bekannt: Ein Empfängersystem kann das
Bundle nicht automatisch einem Patientendatensatz zuordnen, sondern braucht
einen manuellen Zuordnungsschritt. Für den beabsichtigten Weg — der Nutzer
gibt die Datei selbst weiter — ist das die richtige Abwägung. Sollte später
ein automatisierter Weg gefordert werden, ist die Ergänzung um eine
`Patient`-Ressource ein bewusster, dann neu zu bewertender Schritt.

### 4.4 Lizenzgrenze bei fremden Instrumenten

FES-I, BSFC-s und SUS sind lizenzpflichtig bzw. urheberrechtlich geschützt
(QI-02). Ihre Fragetexte in ein Austauschformat zu schreiben, wäre eine
Weiterverbreitung. Für diese Instrumente überträgt das Bundle deshalb nur
den Summenwert unter der Kennung `instrument/<name>` und keinen Fragetext.
Bis zur Lizenzklärung ist das die einzige zulässige Form.

### 4.5 Wie ein Empfänger das Bundle prüft

Das Bundle ist gegen die Basis-Spezifikation FHIR R4 (4.0.1) validierbar,
z. B. mit dem HL7-Validator. Eine Profilvalidierung entfällt mangels
Profilanspruch (4.2). Diese Prüfung ist noch nicht extern durchgeführt
worden — sie gehört zur Vorbereitung des BfArM-Antrags, sobald die
Verbindlichkeitsfrage geklärt ist.

## 5. Menschenlesbarer Bericht (INT-03)

`/pflegecoach/bericht` erzeugt unveränderliche Snapshots eines Zeitraums
(`coach_reports`, kein UPDATE/DELETE per Zeilenfilter). Der Bericht ist über
den Browserdruck als PDF speicherbar; es wird bewusst keine eigene
PDF-Erzeugung betrieben, die eine zusätzliche Abhängigkeit und einen
zusätzlichen Verarbeitungsschritt bedeuten würde.

## 6. Offene Punkte

| Punkt | Art | Nächste Aktion |
|---|---|---|
| Verbindlichkeit eines Austauschformats für DiPA | extern | BfArM-Beratung (REG-05, Frage 10) |
| Profilvalidierung gegen ein MIO/KBV-Profil | extern, hängt an der Verbindlichkeit | Erst nach Klärung beauftragen |
| LOINC-/SNOMED-Zuordnung | extern (Lizenz) + fachlich (QI-01) | Nur zusammen mit der Inhaltsfreigabe |
| Automatische Patientenzuordnung beim Empfänger | intern, bewusst offen | Nur auf konkrete Anforderung, mit neuer Datenschutz-Bewertung |
