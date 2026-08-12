# Block 21 — FHIR / ISiP Interoperabilität

Stand: 2026-08-12. Neuaufbau — vor diesem Block gab es keinen FHIR- oder
ISiP-Code im Repo.

## Was das ist

Eine FHIR-R4-Schnittstelle für Systemintegration (B2B-Interop) und
Datenportabilität: andere Software (Kassen, Nachfolge-Anbieter,
Zuweiser-Systeme) kann Klientendaten in einem HL7-FHIR-Standardformat
lesen, und ein Klient kann bei einem Anbieterwechsel als FHIR-Bundle
exportiert/importiert werden.

## FHIR-Profil: Base R4, kein Länderprofil

Alle Ressourcen folgen **ausschließlich der FHIR-R4-Basisspezifikation**
(https://hl7.org/fhir/R4/). `meta.profile` verweist auf die offizielle
Basis-`StructureDefinition` (z. B.
`http://hl7.org/fhir/StructureDefinition/Patient`) — **nicht** auf ein
deutsches Profil wie ISiK oder ein KBV-Profil. Das ist bewusst: die
konkreten Constraints dieser nationalen Profile (Pflichtfelder,
Slicing, Extensions) sind nicht sicher genug bekannt, um sie korrekt
nachzubilden — eine falsch behauptete Profil-Konformität wäre
schlechter als gar keine.

Zwei Ausnahmen, die trotzdem Standard-Terminologie nutzen (kein
Länderprofil, aber öffentlich dokumentierte HL7-/LOINC-Codes):

- `Patient.identifier` nutzt für die Versichertennummer das offizielle
  FHIR-DE-Identifiersystem `http://fhir.de/sid/gkv/kvid-10` (nur die
  System-URL, kein Profil-Constraint).
- `Observation.code` nutzt LOINC-Codes für Vitalwerte mit gesichert
  bekanntem Code (Puls, Temperatur, Blutzucker, SpO2, Gewicht,
  Atemfrequenz, Schmerz-NRS, Blutdruck-Panel). Für `trinkmenge` und
  `ausscheidung` gibt es keinen sicher bekannten Standard-LOINC-Code —
  dort steht bewusst nur `code.text`, kein erfundener Code.
- Eine eigene, klar als eigen gekennzeichnete Extension
  `https://alltagsengel.care/fhir/StructureDefinition/pflegegrad`
  trägt den Pflegegrad (kein FHIR-R4-Kernfeld, kein KBV/ISiK-Constraint).

## Unterstützte Ressourcen & Endpunkte

| Ressource | Endpunkt | Quelle |
|---|---|---|
| `Patient` | `GET /api/fhir/Patient`, `GET /api/fhir/Patient/[id]` | `clients` |
| `Encounter` | `GET /api/fhir/Encounter?patient=`, `GET /api/fhir/Encounter/[id]` | `service_records` (tatsächliche Einsätze, nicht die wiederkehrende Schicht-Vorlage `assignments`) |
| `Observation` | `GET /api/fhir/Observation?patient=&category=vital-signs` | `vital_signs` |
| `CarePlan` | `GET /api/fhir/CarePlan?patient=`, `GET /api/fhir/CarePlan/[id]` | `pflege_massnahmenplaene` + `pflege_massnahmen` (als `activity`) |

Alle Endpunkte sind mit `requireOpsAdmin()` geschützt (Admin-Session,
org-gefenced über `organization_id`). Eine zusätzliche API-Key-Auth für
maschinelle FHIR-Clients wurde **bewusst nicht** gebaut: die Endpunkte
sind aktuell nur für interne/vertraglich vereinbarte Integrationen
gedacht, die über einen eingeloggten Admin-Account laufen — ein
zusätzliches Auth-System hätte hier ohne konkreten externen Abnehmer nur
Komplexität ohne Nutzen hinzugefügt. Sollte ein externer FHIR-Client
ohne Admin-Session benötigt werden, ist das ein separater Folge-Block
(API-Key-Tabelle + Middleware, analog zu einem OAuth2-Client-Credentials-
Flow).

Fehler werden als FHIR-`OperationOutcome`-Ressourcen zurückgegeben
(`lib/fhir/operation-outcome.ts`), nicht als generisches `{ error }`.

## Datenexport

`GET /api/fhir/export?patient=<Klienten-ID>` liefert ein
`Bundle` (`type: collection`) mit `Patient` + allen zugehörigen
`Encounter`/`Observation`/`CarePlan`-Ressourcen dieses Klienten, als
Datei-Download (`Content-Disposition: attachment`). Admin-UI:
`/admin/fhir` → Tab „Export".

## Datenimport — nur Patient

`POST /api/fhir/import` importiert **ausschließlich `Patient`-Ressourcen**
aus einem hochgeladenen Bundle. Andere Ressourcentypen im Bundle werden
beim Parsen stillschweigend ignoriert (kein Fehler).

**Bewusste Einschränkung:** Encounter-, Observation- und CarePlan-Import
sind **nicht umgesetzt**. Gründe:

- `Encounter` (→ `service_records`) hat Pflichtfelder mit Fremdschlüssel-
  Bezug (`caregiver_id`) und eine Statusmaschine, die an Abrechnung
  gekoppelt ist (`billing_status`, `proof_status`) — ein blinder Import
  könnte falsche Betreuungskraft-Zuordnungen oder Abrechnungsdaten
  erzeugen.
- `Observation` (→ `vital_signs`) hat Plausibilitäts- und
  Grenzwert-Alarmlogik (`lib/vitals/vitals.ts`); ein Import ohne diese
  Validierung könnte unplausible oder medizinisch falsche Werte in einen
  aktiven Alarmpfad einspeisen.
- `CarePlan`-Import bräuchte eine Zusammenführungslogik mit der
  bestehenden Versionierung/Freigabe-Statusmaschine
  (`lib/pflege/massnahmenplaene.ts`) — Blind-Import würde diese Regeln
  umgehen.

Diese drei sind komplexer und für Datenqualität riskanter als der
Patient-Import; sie sind ein möglicher Folge-Block, kein technisches
Totschlagargument.

### Ablauf (kein Blind-Write)

1. **Vorschau** (`mode: "preview"`): Bundle wird strukturell validiert
   (`lib/fhir/import.ts::parseImportBundle`) und gegen bestehende
   Klienten abgeglichen (`buildImportPreview`) — Match nur über
   `identifier` (eigene Kundennummer oder KVID-10-Versichertennummer,
   **nicht** über Name/Geburtsdatum, zu verwechslungsgefährdet). Es wird
   nichts geschrieben.
2. **Bestätigung im Admin-UI**: pro Zeile eine Entscheidung — neu
   anlegen / bestehenden Klienten aktualisieren / überspringen.
3. **Commit** (`mode: "commit"`, `decisions`-Array): schreibt nur die
   bestätigten Zeilen. Bei „aktualisieren" werden **nur die im Bundle
   tatsächlich gesetzten Felder** übernommen — ein unvollständiges
   FHIR-Bundle überschreibt niemals vorhandene Daten mit `NULL`
   (`candidateToClientUpdate`).

## ISiP-Konformität — Interpretation

**„ISiP" (Informationssicherheit in der Pflege) hat keine öffentlich
einheitliche, sicher bekannte technische Spezifikation zum 1:1
Nachbauen.** Dieser Block behauptet **keine Zertifizierung**. Stattdessen
wird „ISiP-konform" hier pragmatisch als Bündel von
Informationssicherheits-**Maßnahmen** für den FHIR-Datenexport/-import
verstanden:

- **Audit-Trail**: jeder Export, jede Import-Vorschau und jeder
  Import-Commit wird in `fhir_audit_log` protokolliert (wer, wann,
  welcher Klient, welche Ressourcentypen, wie viele Datensätze) —
  einsehbar unter `/admin/fhir` → Tab „Audit-Log".
- **Zugriffskontrolle**: `requireOpsAdmin()` + `organization_id`-Fence
  auf jeder Query; RLS auf `fhir_audit_log` selbst (`is_admin()` +
  `org_fence`, Migration `20260829010000_fhir_isip_audit_log.sql`).
- **Verschlüsselung**: TLS in Transit (Vercel/Next.js-Standard),
  Supabase-Verschlüsselung at rest (Plattform-Standard, nicht
  block-spezifisch).
- **Datensparsamkeit**: Export enthält nur Felder, die tatsächlich in
  den Quelltabellen existieren (keine erfundenen/leeren FHIR-Felder),
  und ist strikt auf die aktive Organisation begrenzt.

## Nicht umgesetzt (bewusste Auslassungen)

- Encounter-/Observation-/CarePlan-**Import** (siehe oben).
- `Practitioner`-Ressource/-Endpunkt — `Encounter.participant` und
  `Observation.performer` referenzieren `Practitioner/<caregiver_id>`
  syntaktisch korrekt, die Referenz ist aber serverseitig **nicht
  auflösbar** (kein `GET /api/fhir/Practitioner/[id]`).
- `AllergyIntolerance`, `MedicationStatement` — `clients.allergies` und
  `clients.medications` sind Freitextfelder ohne Kodierung; eine
  korrekte FHIR-Abbildung bräuchte strukturierte Daten, die es in der
  Quelltabelle nicht gibt.
- Länderspezifisches Profil (ISiK/KBV) — siehe Abschnitt oben.
- API-Key-Authentifizierung für externe (nicht-Admin-)FHIR-Clients —
  siehe Begründung im Abschnitt „Unterstützte Ressourcen & Endpunkte".

## Migration

`supabase/migrations/20260829010000_fhir_isip_audit_log.sql` (+ Rollback
`...0001`) legt `fhir_audit_log` an. **Noch nicht live angewendet** —
kein DB-Write-Zugriff aus dieser Session heraus. Muss manuell im
Supabase-SQL-Editor oder per Supabase-MCP ausgeführt werden, bevor
`/admin/fhir` → Tab „Audit-Log" Daten anzeigt (Export/Import
funktionieren technisch auch vorher, aber `logFhirAuditEvent` schlägt
dann fail-soft fehl und loggt nur in die Server-Konsole).
