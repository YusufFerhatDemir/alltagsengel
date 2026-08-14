# FHIR-Export-Dokumentation — Digitaler PflegeCoach

**Stand:** 2026-08-14
**Zweck:** Beschreibung der FHIR-R4-Bundle-Struktur und des Export-Endpunkts — deckt DiPA-Matrix INT-02 ab (technisch erledigt, Verbindlichkeit extern offen).

---

## 1. Status

DiPA-Matrix INT-02, Klasse **B**: **„TECHNISCH ERLEDIGT — Verbindlichkeit
EXTERN"**. Umsetzung: `lib/coach/fhir.ts` + 13 Tests (`lib/coach/fhir.test.ts`),
Endpoint `GET /api/coach/export?format=fhir`, Konzeptdokument
`audit/dipa/interoperabilitaet_fhir.md`.

## 2. Endpunkt

`GET /api/coach/export?format=fhir` liefert `application/fhir+json` (FHIR
R4, Fassung 4.0.1). Läuft wie alle Coach-Routen über die Session des Nutzers
— kein `service_role`, RLS bleibt die einzige Zugriffswahrheit. Liefert
ausschließlich die eigenen Daten der angemeldeten Person. Ohne Anmeldung
antwortet die Route mit 401 (bestätigt in `e2e/pflegecoach.spec.ts`, Test
„FHIR-Export ist ohne Anmeldung ebenfalls gesperrt").

Ergänzt den hauseigenen JSON-Export (`lib/coach/export.ts`,
`de.alltagsengel.pflegecoach.export`), ersetzt ihn nicht.

## 3. Bundle-Struktur

| Quelle | FHIR-Ressource | Bemerkung |
|---|---|---|
| Selbsteinschätzung (5 Bereiche, 0–4) | `Questionnaire` + `QuestionnaireResponse` | Fragebogen liegt dem Bundle bei |
| Belastungs-Kurzform (7 Items, 0–3) | `Questionnaire` + `QuestionnaireResponse` | nur wenn eine solche Messung existiert |
| Lizenzpflichtige Instrumente (FES-I, BSFC-s, SUS) | `QuestionnaireResponse` **nur mit Summenwert** | kein Fragetext, siehe §5 |
| Ziele | `Goal` | `lifecycleStatus` und `achievementStatus` getrennt gemeldet |
| Aktivitäten (Wochenplan) | `CarePlan` mit `activity.detail.scheduledTiming` | verweist auf die `Goal`-Ressourcen |

Bundle-Typ: `collection` — bewusst **kein** `document` (das würde eine
Composition mit Autor und Beglaubigung voraussetzen; Autor der Daten ist der
Nutzer selbst, eine fachliche Bestätigung liegt nicht vor).

Datensparsamkeit: Das Bundle enthält **keine `Patient`-Ressource und keinen
`subject`-Verweis**. Ressourcen-IDs sind laufende Nummern (`assessment-1`,
`ziel-1`), keine Datenbankschlüssel. Konsequenz: Ein Empfängersystem kann das
Bundle nicht automatisch einem Patientendatensatz zuordnen — bewusste
Abwägung für den vorgesehenen Weg (Nutzer gibt die Datei selbst weiter).

## 4. Was ausdrücklich NICHT behauptet wird

Dies ist der zentrale Punkt des Moduls, wörtlich aus dem Quelltext-Kommentar
(`lib/coach/fhir.ts`) übernommen:

1. **Keine Profilkonformität.** Es wird kein `meta.profile` gesetzt. Weder ein
   MIO, noch ein KBV-Profil, noch eine gematik-Spezifikation wird beansprucht.
   Ein Profilverweis ohne bestandene Profilvalidierung wäre eine
   Falschangabe.
2. **Keine fremden Terminologien.** Keine LOINC-, SNOMED-CT- oder ICF-Codes.
   Eine fachlich richtige Zuordnung müsste pflegefachlich geprüft (QI-01) und
   lizenzrechtlich geklärt sein (LOINC-Lizenz, SNOMED-Affiliate-Vereinbarung).
   Bis dahin gilt ausschließlich das eigene Codesystem unter
   `https://alltagsengel.care/fhir/CodeSystem/…`.
3. **Keine Verbindlichkeitsaussage.** Ob DiPA ein bestimmtes Austauschformat
   verlangt, ist offen (BfArM-Frage 10, REG-05). Die Abbildung ist die
   vorbereitete Antwort auf ein „ja" — **kein Beleg dafür, dass die
   Anforderung erfüllt ist**.

Zwei Tests in `lib/coach/fhir.test.ts` halten das aktiv fest: „keine internen
Datenbank-IDs und keine Patient-Ressource im Bundle" und „keine
Profil-Behauptung und keine fremden Terminologien" — schlagen fehl, sobald ein
`profile`-Feld oder ein LOINC-/SNOMED-/MIO-Verweis im erzeugten Bundle
auftaucht.

**Dies ist eine bewusste technische Grenze, kein Fehler.** Die Verbindlichkeit
des Formats (ob FHIR überhaupt gefordert wird, und ob ein Profilanspruch
nötig wäre) ist eine externe/regulatorische Frage, die nur das BfArM
beantworten kann.

## 5. Lizenzgrenze bei fremden Instrumenten

FES-I, BSFC-s und SUS sind lizenzpflichtig bzw. urheberrechtlich geschützt
(QI-02, offen). Ihre Fragetexte in ein Austauschformat zu schreiben wäre eine
Weiterverbreitung. Für diese Instrumente überträgt das Bundle deshalb nur den
Summenwert unter der Kennung `instrument/<name>` und **keinen** Fragetext.

## 6. Testabdeckung (`lib/coach/fhir.test.ts`, 13 Tests)

Leeres Bundle bei leerem Bestand · Assessment → QuestionnaireResponse
(unbeantwortete Bereiche fehlen) · Fragebogen liegt dem Bundle bei ·
Belastungs-Fragebogen nur bei vorhandener Messung · lizenzpflichtige
Instrumente nur mit Summenwert · erreichtes Ziel bekommt Erreichungsstatus ·
Ziel ohne Messgröße bekommt kein `target` · Wochentage → FHIR-Codes ·
CarePlan verweist korrekt auf Ziel-Ressourcen · Aktivität ohne bekanntes Ziel
erzeugt keinen ins Leere zeigenden Verweis · keine internen IDs/keine
Patient-Ressource · keine Profil-Behauptung/keine fremden Terminologien ·
Fragebogen weist ausdrücklich aus, dass er nicht validiert ist.

## 7. Wie ein Empfänger das Bundle prüft

Validierbar gegen die Basis-Spezifikation FHIR R4 (4.0.1), z. B. mit dem
HL7-Validator. Eine Profilvalidierung entfällt mangels Profilanspruch. Diese
Prüfung ist **noch nicht extern durchgeführt worden** — sie gehört zur
Vorbereitung des BfArM-Antrags, sobald die Verbindlichkeitsfrage geklärt ist.

## 8. Offene Punkte

| Punkt | Art | Nächste Aktion |
|---|---|---|
| Verbindlichkeit eines Austauschformats für DiPA | extern (regulatorisch) | BfArM-Beratung (REG-05, Frage 10) |
| Profilvalidierung gegen ein MIO/KBV-Profil | extern, hängt an der Verbindlichkeit | erst nach Klärung beauftragen |
| LOINC-/SNOMED-Zuordnung | extern (Lizenz) + fachlich (QI-01) | nur zusammen mit der Inhaltsfreigabe |
| Automatische Patientenzuordnung beim Empfänger | intern, bewusst offen | nur auf konkrete Anforderung, mit neuer Datenschutz-Bewertung |

---

## Quellen

* `lib/coach/fhir.ts`
* `lib/coach/fhir.test.ts`
* `audit/dipa/interoperabilitaet_fhir.md`
* `app/api/coach/export/route.ts`
* `docs/DIPA_MATRIX_FINAL.md` (INT-01 bis INT-03)
