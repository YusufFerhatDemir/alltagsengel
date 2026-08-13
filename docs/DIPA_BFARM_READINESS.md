# DiPA-Readiness — Gap-Analyse für die BfArM-Listung

**Produkt:** Digitaler PflegeCoach (`lib/coach/version.ts`)
**Stand:** 2026-08-13
**Betrachteter Gegenstand:** ausschließlich der Quellcode dieses Repositories

---

## Wie dieses Dokument zu lesen ist

Diese Analyse beschreibt **was im Code vorhanden bzw. nicht vorhanden ist** — nicht,
was gesetzlich gefordert ist. Die verbindlichen Anforderungen stehen in den
Originaldokumenten und sind zum Zeitpunkt der Antragstellung in der dann gültigen
Fassung heranzuziehen. Es werden hier bewusst **keine** Zulassungsvoraussetzungen,
Fristen, Preise, Erstattungsbeträge oder Abrechnungswege behauptet.

Die zwölf Punkte unten sind die vom Auftrag vorgegebene Gliederung. Sie sind nicht
als amtliche Anforderungsliste zu verstehen.

**Statuswerte:**

| Status | Bedeutung |
|--------|-----------|
| **VORHANDEN** | Im Code oder in einem Repository-Dokument umgesetzt und nachprüfbar |
| **FEHLT** | Nicht vorhanden; Umsetzung erfordert Entscheidungen oder Arbeit, die über eine Ableitung aus dem Code hinausgeht |
| **EXTERN** | Kann nicht im Code entstehen — Prüfstelle, Gutachten, Zertifikat oder Erhebung außerhalb des Repositories |
| **KANN SOFORT GEBAUT WERDEN** | War ableitbar und wurde in diesem Durchgang gebaut (mit ✔ markiert) |

---

## Überblick

| # | Punkt | Status |
|---|-------|--------|
| 1 | Zweckbestimmung | **VORHANDEN** |
| 2 | Nutzergruppe | **VORHANDEN** |
| 3 | Pflegerischer Nutzen | **EXTERN** (Erhebungsseite im Code vorhanden) |
| 4 | Datenschutz | gemischt: Umsetzung **VORHANDEN**, DSFA **EXTERN**, Verarbeitungsverzeichnis **✔ gebaut** |
| 5 | Datensicherheit | gemischt: Zugriffsschutz **VORHANDEN**, MFA **FEHLT**, Penetrationstest **EXTERN** |
| 6 | Interoperabilität | **FEHLT** (Export vorhanden, aber kein verbindliches Austauschformat) |
| 7 | Barrierefreiheit | Grundausstattung **VORHANDEN**, automatisierte Prüfung **✔ gebaut**, externes Audit **EXTERN** |
| 8 | Evidenz/Studienkonzept | Konzept **VORHANDEN**, Durchführung **EXTERN** |
| 9 | Technische Dokumentation | **✔ gebaut** |
| 10 | Risikomanagement | Risikoregister **✔ gebaut**, Bewertung **FEHLT** |
| 11 | Qualitätsmanagementsystem | **FEHLT** für das Softwareprodukt |
| 12 | Zertifizierungen | **EXTERN** |

In diesem Durchgang neu entstanden:

* `audit/dipa/verarbeitungsverzeichnis_pflegecoach.md`
* `audit/dipa/technische_dokumentation_pflegecoach.md`
* `audit/dipa/risikoanalyse_pflegecoach.md`
* Barrierefreiheitsregeln als Lint-Fehler für `app/pflegecoach/**` (`eslint.config.mjs`)

---

## 1. Zweckbestimmung — VORHANDEN

**Vorhanden:**

* Ausformulierte Zweckbestimmung: `audit/dipa/finale_zweckbestimmung.md`
* Im Produkt sichtbar, für an- und abgemeldete Besucher: `app/pflegecoach/start/page.tsx`
  („Was dieser PflegeCoach ist" / „Was er nicht ist")
* In der Fußzeile jeder Produktseite verkürzt wiederholt: `app/pflegecoach/CoachShell.tsx`
* Negativabgrenzung zum Medizinprodukt schriftlich: `audit/dipa/mdr_negativabgrenzung.md`
* Änderungen an der Zweckbestimmung sind als MAJOR-Version definiert und damit
  immer regulatorisch zu bewerten: `lib/coach/version.ts`
* Katalogeintrag AK-PROD-01/02/03 in `lib/coach/anforderungskatalog.ts`

**Einschränkung:** Der Katalogeintrag trägt `anforderungstextGeprueft: false` — die
Zweckbestimmung wurde noch nicht gegen den maßgeblichen Originaltext geprüft.
Das ist Absicht und wird in `katalogFortschritt()` nicht als erfüllt gezählt.

---

## 2. Nutzergruppe — VORHANDEN

**Vorhanden:**

* Zielgruppenbeschreibung: `audit/dipa/zielgruppendefinition.md`
* Im Datenmodell erzwungen: `coach_users.rolle` kennt genau drei Werte —
  `pflegebeduerftig`, `angehoerig`, `pflegedienst` (CHECK-Constraint,
  Migration `20260819010000`)
* Die Rolle wird im Onboarding aktiv abgefragt (`app/pflegecoach/start/page.tsx`)
  und steuert Inhalte und Empfehlungen (`lib/coach/inhalte.ts` über `zielgruppe`,
  `lib/coach/empfehlungen.ts`)
* Eigener Bereich für pflegende Angehörige inkl. Belastungs-Selbsteinschätzung

**Offen:** keine Alters- oder Pflegegradgrenze im Code. `pflegegrad` ist ein
freiwilliges Feld und wirkt nicht als Zugangsvoraussetzung. Ob das so bleiben
soll, ist eine fachliche Entscheidung, keine technische.

---

## 3. Pflegerischer Nutzen — EXTERN

Ein Nutzennachweis kann nicht aus Code entstehen. Was im Code vorhanden ist, ist
die **Erhebungsseite**:

**Vorhanden:**

* Messinstrumente im Datenmodell hinterlegt (`coach_measurements.instrument`):
  FES-I Kurzform, BSFC-s, SUS, Selbsteinschätzung Selbständigkeit,
  Sturzereignis (Selbstbericht), Befinden
* Messzeitpunkte `t0`–`t3` und `laufend` — Baseline-/Outcome-Design ist im
  Schema abbildbar
* Verlaufsassessment über fünf Bereiche mit Zeitreihe (`coach_assessments`)
* Zielverfolgung mit Messgröße, Start-, Ziel- und Ist-Wert (`coach_goals`)
* Pseudonymisierte Nutzungserfassung mit Unterdrückung kleiner Fallzahlen
  (`coach_nutzungsereignisse`, `lib/coach/nachweise.ts`)
* Evaluationskonzept: `audit/dipa/evaluationskonzept.md`
* Pilotdesign: `audit/dipa/pilotdesign.md`
* Bewusst **keine** automatische klinische Interpretation der Messwerte
  (MDR-Negativabgrenzung)

**Extern zu beschaffen:**

* Durchführung der Erprobung mit realen Teilnehmenden
* Wissenschaftliche Auswertung und Bewertung durch eine geeignete Stelle
* Votum einer Ethikkommission, sofern für das gewählte Design erforderlich

**Zu beachten:** Die Erfassung ist im Auslieferungszustand **abgeschaltet**
(`COACH_NUTZUNGSNACHWEIS_AKTIV`, Default aus) und zusätzlich von der individuellen
Einwilligung abhängig. Vor Beginn einer Erprobung ist beides scharf zu schalten.

---

## 4. Datenschutz — gemischt

### 4.1 Umsetzung im Produkt — VORHANDEN

* Ausdrückliche, versionierte Einwilligung für Gesundheitsdaten (`coach_consents`
  mit `text_version`, `erteilt_am`, `widerrufen_am`); ohne sie kein Onboarding
* Widerruf jederzeit über `/pflegecoach/einstellungen`
* Getrennte, freiwillige Einwilligung für die wissenschaftliche Auswertung
* Datenexport nach Art. 20 in dokumentiertem Format (`lib/coach/export.schema.json`)
* Produktbezogene Löschung ohne Verlust des Plattformkontos
  (`app/api/coach/loeschung`), mit Vorschau der betroffenen Datenmengen
* Datenminimierung an zwei kritischen Stellen: Audit-Log ohne Werte,
  Nutzungsereignisse ohne Fremdschlüssel auf die Person
* Werbe- und Trackerfreiheit im gesamten Produktbereich
* Datenschutzhinweise produktbezogen: `app/pflegecoach/datenschutz/page.tsx`

### 4.2 Verarbeitungsverzeichnis — ✔ KANN SOFORT GEBAUT WERDEN → gebaut

**Neu:** `audit/dipa/verarbeitungsverzeichnis_pflegecoach.md` — vollständig aus
Migrationen und Routen abgeleitet: Zwecke, betroffene Personen, Datenkategorien
je Tabelle, Empfänger, abgeschaltete Verarbeitungen, Löschwege, TOM.
Als Entwurf gekennzeichnet; die juristische Freigabe steht aus.

### 4.3 Datenschutz-Folgenabschätzung — EXTERN

* Vorarbeit vorhanden: `audit/dipa/dsfa_pflegecoach.md`, Vorlage in `docs/DSFA_VORLAGE.md`
* Extern nötig: juristische Prüfung und Freigabe (GAP-DSFA / AK-DS-02)

### 4.4 Auftragsverarbeitung — FEHLT

Die Auftragsverarbeiter-Kette (Hosting, Datenbank, E-Mail) ist **produktbezogen
nicht dokumentiert** (AK-DS-04). Vorlage vorhanden: `docs/AVV_VORLAGE.md`.
Nötig sind: Auflistung der eingesetzten Dienste, abgeschlossene Verträge,
Aussage zum Verarbeitungsort. Das lässt sich aus dem Code nicht ableiten und
wird hier deshalb nicht vermutet.

### 4.5 Aufbewahrungsfristen — FEHLT

Im Code ist **keine** automatische Frist hinterlegt. Löschung erfolgt
ausschließlich auf Veranlassung der betroffenen Person oder bei Kontolöschung.
Regelfristen sind in `audit/dipa/loeschkonzept.md` festzulegen (GAP-LOESCHUNG).

---

## 5. Datensicherheit — gemischt

### 5.1 Zugangs- und Zugriffskontrolle — VORHANDEN

* Row Level Security auf allen `coach_*`-Tabellen
* Alle Produktrouten arbeiten mit dem Session-Client, **nie** mit `service_role`
  (`lib/coach/api-auth.ts`) — RLS bleibt die einzige Zugriffswahrheit
* **Kein** administrativer Lesezugriff auf Gesundheitsdaten (bewusst keine
  Admin-Policy); die einzige Systemkontext-Abfrage aggregiert sofort und gibt
  weder Einzelzeilen noch Pseudonyme heraus (`app/api/dipa/nachweise/route.ts`)
* Append-only-Audit über Datenbank-Trigger (`coach_audit_trigger()`,
  `SECURITY DEFINER` mit gesetztem `search_path`)
* Freischaltcodes nur als SHA-256-Hash mit Pfeffer, Klartext genau einmal sichtbar
* Datenbanktests: `supabase/shadow/50_pflegecoach_tests.sql`

### 5.2 Verschlüsselung — teilweise VORHANDEN

* Konzept vorhanden: `audit/dipa/verschluesselungskonzept.md`
* Transportverschlüsselung über die Hosting-Plattform, HTTP wird umgeleitet
* **Einschränkung, die im Konzept selbst steht:** Alle Angaben zu
  Plattformleistungen (Hosting, Datenbank, Verschlüsselung im Ruhezustand) sind
  vor einer Antragstellung zu verifizieren. Sie werden hier nicht als gesichert
  dargestellt.

### 5.3 Zweiter Faktor — FEHLT

Im gesamten Repository existiert keine MFA-/TOTP-Implementierung. Die Anmeldung
läuft über die Plattform-Authentifizierung mit einem Faktor (AK-SEC-03 / GAP-MFA).
Umsetzbar, aber eine Entscheidung mit Auswirkung auf alle Nutzenden der
Plattform — nicht nur auf den PflegeCoach.

### 5.4 Penetrationstest — EXTERN

* Interne Sicherheitsprüfung vorhanden: `audit/dipa/security_review_pflegecoach.md`
* Extern nötig: Penetrationstest durch einen unabhängigen Dienstleister mit
  Bericht und Nachtest (AK-SEC-04 / GAP-EXT-REVIEW)

### 5.5 Sicherheitszertifikat — EXTERN

Selbsteinschätzung vorhanden (`audit/dipa/tr03161_checkliste.md`), Zertifikat einer
akkreditierten Prüfstelle nicht (AK-SEC-01 / GAP-TR03161). Siehe auch Punkt 12.

---

## 6. Interoperabilität — FEHLT

**Vorhanden:**

* Maschinenlesbarer Datenexport mit eigenem, dokumentiertem Schema:
  `lib/coach/export.schema.json` (`de.alltagsengel.pflegecoach.export`, Version 1.0),
  inklusive Konformanztest (`lib/coach/export.test.ts`)
* Menschenlesbare Druckansicht: `/pflegecoach/bericht`
* Plattformseitig existiert ein FHIR-Modul (`lib/fhir/`) und ein KIM-Modul
  (`lib/kim/`)

**Fehlt:**

* Das FHIR-Modul hat **keinen Bezug zu den Coach-Daten** — im gesamten Verzeichnis
  `lib/fhir/` kommt kein `coach_*`-Bezug vor. Ein Mapping der Coach-Daten auf
  Austauschprofile (naheliegend: Questionnaire/QuestionnaireResponse für
  Assessments und Messungen, CarePlan für Ziele und Wochenplan) ist als
  Architektur-Option im Code vermerkt, aber nicht gebaut.
* Keine Schnittstelle zu Pflegesoftware Dritter.

**Warum hier nichts gebaut wurde:** Welches Austauschformat, welche Profile und
welche Version verbindlich sind, ist eine offene regulatorische Frage
(ORF-9 / GAP-INTEROP). Ein Mapping ohne festgelegtes Zielprofil wäre eine
Erfindung, die später ohnehin verworfen würde. Sobald das Zielprofil feststeht,
ist die Umsetzung überschaubar: `lib/coach/export.ts` ist eine reine Funktion
über einem vollständigen Datensatz und lässt sich um einen zweiten Serialisierer
ergänzen.

---

## 7. Barrierefreiheit — gemischt

### 7.1 Umsetzung im Produkt — VORHANDEN

* Drei Schriftgrößen und ein Kontrastmodus, sofort wirksam und gerätübergreifend
  gespeichert (`app/pflegecoach/CoachShell.tsx`, `coach_users.a11y_*`)
* Skip-Link zum Inhalt, `aria-current` in der Navigation, `aria-label` für
  Bedienelemente, Statusmeldungen mit `role="status"` / `role="alert"`
* Semantische Auszeichnung: `fieldset`/`legend` für Formulargruppen,
  `aria-labelledby` je Abschnitt, `scope` in Tabellenköpfen
* Verzicht auf reine Farbcodierung bei Statusangaben
* Produktbereich ohne Werbung, ohne bewegte Inhalte, ohne Tracker

### 7.2 Automatisierte Prüfung — ✔ KANN SOFORT GEBAUT WERDEN → gebaut

**Neu:** `eslint.config.mjs` erzwingt den vollständigen `jsx-a11y`-Regelsatz als
**Fehler** für `app/pflegecoach/**`. Bewusst nur dort: Der übrige Bestand ist
nicht auditiert, ein globaler Schalter wäre nur Rauschen.
`npx eslint app/pflegecoach` läuft ohne Befund durch.

### 7.3 Externe Prüfung — EXTERN

* Screenreader-Test mit realen Hilfsmitteln
* Konformitätsbewertung gegen den maßgeblichen Standard durch eine geeignete
  Stelle (AK-BF-01 / GAP-A11Y-AUDIT)
* Gebrauchstauglichkeitstest mit der Zielgruppe — Protokollvorlage vorhanden
  (`audit/dipa/gebrauchstauglichkeit_testprotokoll.md`), Durchführung offen
  (AK-BF-02)

Ein Lint-Lauf ersetzt keinen dieser Punkte. Er verhindert Rückschritte, mehr nicht.

---

## 8. Evidenz / Studienkonzept — Konzept VORHANDEN, Durchführung EXTERN

**Vorhanden:**

* Evaluationskonzept: `audit/dipa/evaluationskonzept.md`
* Pilotdesign: `audit/dipa/pilotdesign.md`
* Technische Voraussetzungen vollständig gebaut (siehe Punkt 3): Instrumente,
  Messzeitpunkte, pseudonyme Erfassung, aggregierte Auswertung mit Schutz kleiner
  Fallzahlen
* Freischaltcodes mit Quelle `pilot` als Zugangssteuerung für eine Erprobung
  (`lib/coach/freischaltung.ts`)

**Extern zu beschaffen:** Studienleitung, Teilnehmendengewinnung, Auswertung,
ggf. Ethikvotum, ggf. Registrierung des Vorhabens (AK-NN-01 / GAP-EVAL).

**Voraussetzung im Betrieb:** vor Pilotstart `COACH_NUTZUNGSNACHWEIS_AKTIV=true`
setzen und die Einwilligung `wissenschaftliche_auswertung` einholen — ohne beides
wird nichts erfasst.

---

## 9. Technische Dokumentation — ✔ KANN SOFORT GEBAUT WERDEN → gebaut

**Neu:** `audit/dipa/technische_dokumentation_pflegecoach.md` mit
Produktidentität und Abgrenzung, Systemarchitektur, fachlichen Modulen,
Datenmodell, Produktschaltern, Systemanforderungen (nutzer- und serverseitig),
Betriebsabläufen (Ausbringen, Migration, Rollback, Versionierung,
Code-Ausgabe, Kennzahlen), Qualitätssicherung im Code und einer ausdrücklichen
Liste bekannter Grenzen.

**Bereits zuvor vorhanden:** Änderungshistorie
(`audit/dipa/CHANGELOG_pflegecoach.md`), Rollback-Skript zu jeder Migration,
maschinenlesbarer Anforderungskatalog (`lib/coach/anforderungskatalog.ts`).

**Weiterhin offen:** ein produktbezogenes Wiederanlaufkonzept mit tatsächlich
geprüfter Rücksicherung. Das setzt Kenntnis der Sicherungsverfahren der
Plattform voraus und wird deshalb nicht aus dem Code abgeleitet.

---

## 10. Risikomanagement — Register ✔ gebaut, Bewertung FEHLT

**Neu:** `audit/dipa/risikoanalyse_pflegecoach.md` mit 24 Risiken in vier
Gruppen — Nutzung, Datenschutz, technische Sicherheit, Regulatorik — jeweils mit
der im Code tatsächlich vorhandenen Maßnahme.

**Bewusst nicht gebaut: die Bewertung.** Eintrittswahrscheinlichkeit,
Schadensausmaß und Akzeptanzschwelle sind Entscheidungen des Unternehmens; eine
aus dem Code erzeugte Risikomatrix wäre eine erfundene Zahl mit dem Anschein von
Methodik. Die Spalte bleibt leer, bis sie fachlich gefüllt wird.

**Fehlt darüber hinaus:**

* Festlegung des Bewertungsverfahrens (Skala, Akzeptanzkriterien, Zuständigkeit)
* Maßnahmenplan mit Terminen und Verantwortlichen für nicht akzeptierte Risiken
* Verfahren zur Marktbeobachtung und zum Umgang mit gemeldeten Vorkommnissen

---

## 11. Qualitätsmanagementsystem — FEHLT (für das Softwareprodukt)

**Vorhanden, aber für einen anderen Gegenstand:** `docs/QMS_GRUNDGERUEST.md` ist
ein QM-Grundgerüst für den **Pflegedienst** (Grundlage § 113 SGB XI, ISO 9001,
Status Entwurf). Es deckt Einsatzerfüllung, Kundenzufriedenheit und
Dokumentationsqualität ab — nicht die Entwicklung und Pflege einer Software.

**Vorhandene Bausteine eines Software-QM im Code:**

* Versionierung mit definierten Änderungskategorien (`lib/coach/version.ts`)
* Änderungshistorie je Produktversion
* Automatisierte Prüfungen vor jedem Ausbringen (Typecheck, Secret-Guard,
  Broken-Link-Gate, Unit-Tests je Fachmodul, Datenbanktests, a11y-Lint)
* Nachvollziehbarer Ausbring- und Rückrollweg
* Maschinenlesbarer Anforderungskatalog mit Zuständigkeiten und Nachweisen

**Fehlt:**

* Ein dokumentiertes QM-System für den Softwarelebenszyklus: Verantwortlichkeiten,
  Entwicklungs- und Freigabeprozess, Konfigurations- und Änderungslenkung,
  Fehler- und Beschwerdemanagement, Lenkung der Dokumente, interne Audits
* Verknüpfung zwischen QM und dem Risikomanagement aus Punkt 10

**EXTERN, falls eine Zertifizierung angestrebt wird:** Zertifizierungsaudit nach
der gewählten Norm (etwa ISO 13485 oder ISO 9001) durch eine akkreditierte
Zertifizierungsstelle. Ob eine Zertifizierung für die Listung erforderlich ist,
wird hier nicht behauptet — das ist dem Originaltext zu entnehmen (AK-QMS-01 / GAP-QMS).

---

## 12. Zertifizierungen — EXTERN

| Gegenstand | Stand im Repository | Was extern nötig wäre |
|------------|--------------------|-----------------------|
| CE-Kennzeichnung | Es liegt eine schriftliche Begründung vor, warum **kein** Medizinprodukt vorliegt (`audit/dipa/mdr_negativabgrenzung.md`). Der Code stützt das: keine automatische Interpretation von Messwerten, keine Diagnostik, keine Therapieentscheidung. | Bestätigung der Abgrenzung durch eine fachkundige Stelle. Sollte die Abgrenzung nicht tragen, wäre ein vollständig anderer Weg zu gehen — dieser ist hier nicht beschrieben. |
| Sicherheitszertifikat nach der einschlägigen technischen Richtlinie | Selbsteinschätzung: `audit/dipa/tr03161_checkliste.md`. Kein Zertifikat. | Prüfung und Zertifikat durch eine akkreditierte Prüfstelle (GAP-TR03161) |
| ISO 27001 | Kein Managementsystem für Informationssicherheit im Repository | Aufbau des Systems und Zertifizierungsaudit |
| ISO 13485 / ISO 9001 (Produkt) | Siehe Punkt 11 — kein Software-QM vorhanden | Aufbau und Zertifizierungsaudit |
| Barrierefreiheitsbewertung | Umsetzung vorhanden, Bewertung nicht | Konformitätsbewertung durch eine geeignete Stelle (GAP-A11Y-AUDIT) |

**Nicht in diesem Dokument enthalten:** welche dieser Nachweise für eine Listung
verlangt werden, in welcher Reihenfolge und mit welchem Vorlauf. Das steht in den
Originaldokumenten und wird hier nicht rekonstruiert.

---

## Was der aktuelle Auslieferungszustand ist

Damit kein Missverständnis entsteht: Der PflegeCoach läuft heute als **normaler
digitaler Pflege- und Assistenzservice**, nicht als gelistete DiPA.

* `COACH_DIPA_MODUS` ist Default aus — Anspruchsprüfung und Kostenträgerbezug
  sind weder in der Oberfläche noch über die API erreichbar.
* Im gesamten Produktbereich existiert **keine** Aussage zu Kostenübernahme,
  Erstattung oder Preisen.
* `istAbrechnungsbereit()` ist fail-closed: ohne hinterlegte Vergütungsvereinbarung
  gibt es keinen abrechnungsbereiten Weg.
* Der Freischaltcode ist **keine** Zugangsvoraussetzung; die zugehörige Seite ist
  ohne aktiven Schalter gar nicht erreichbar.
* Nutzungsereignisse werden **nicht** erfasst.

Der Service ist in diesem Zustand vollständig nutzbar. Eine Listung ist für den
Betrieb nicht erforderlich — sie ist die Voraussetzung dafür, den DiPA-Modus
einzuschalten.

---

## Verweise

| Thema | Datei |
|-------|-------|
| Bestehende Gap-Liste (führendes Dokument) | `audit/dipa/dipav_gap_liste.md` |
| Maschinenlesbarer Anforderungskatalog | `lib/coach/anforderungskatalog.ts` |
| Zweckbestimmung | `audit/dipa/finale_zweckbestimmung.md` |
| Abgrenzung zum Medizinprodukt | `audit/dipa/mdr_negativabgrenzung.md` |
| Zielgruppe | `audit/dipa/zielgruppendefinition.md` |
| Verarbeitungsverzeichnis (neu) | `audit/dipa/verarbeitungsverzeichnis_pflegecoach.md` |
| Technische Dokumentation (neu) | `audit/dipa/technische_dokumentation_pflegecoach.md` |
| Risikoanalyse (neu) | `audit/dipa/risikoanalyse_pflegecoach.md` |
| Datenschutz-Folgenabschätzung | `audit/dipa/dsfa_pflegecoach.md` |
| Löschkonzept | `audit/dipa/loeschkonzept.md` |
| Verschlüsselungskonzept | `audit/dipa/verschluesselungskonzept.md` |
| Sicherheitsprüfung | `audit/dipa/security_review_pflegecoach.md` |
| Sicherheits-Checkliste | `audit/dipa/tr03161_checkliste.md` |
| Evaluationskonzept | `audit/dipa/evaluationskonzept.md` |
| Pilotdesign | `audit/dipa/pilotdesign.md` |
| Gebrauchstauglichkeit | `audit/dipa/gebrauchstauglichkeit_testprotokoll.md` |
| Änderungshistorie | `audit/dipa/CHANGELOG_pflegecoach.md` |
| Offene Fragen an das BfArM | `audit/dipa/bfarm_fragenkatalog.md` |
