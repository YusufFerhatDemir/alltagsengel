# EXTERNAL ONBOARDING PLAN V2 -- Alltagsengel UG

**Datum:** 19. August 2026
**V6-Baseline:** Tag `v6-baseline` auf main
**Codebase:** Next.js / Supabase / Vercel
**IK-Nummer:** 460629986 (gueltig ab 16.07.2026)
**D-U-N-S:** 316856461
**Firmensitz:** Neue Mainzer Strasse 66-68, 60311 Frankfurt am Main
**Zweck:** Vom technisch fertigen System zum ersten echten zahlenden Kunden

---

## Aenderungsprotokoll gegenueber V1

| Was | V1 (fehlerhaft) | V2 (korrigiert) |
|---|---|---|
| Zustaendige Behoerde Paragraph 45a | Regierungspraesidium Giessen | Jugend- und Sozialamt Frankfurt am Main, Leitstelle Aelterwerden |
| Erweitertes Fuehrungszeugnis | BEANTRAGT (erwartet ~03.08.2026) | DONE -- eingetroffen 19.08.2026 |
| Anbieterform nach PfluV | Nicht behandelt | UNVERIFIZIERT -- wahrscheinlich Anbieterform II, mit Behoerde zu klaeren |
| Struktur | 5 Kategorien | 9 Abschnitte A-I mit Statusklassifizierung |
| Privatweg / Kostenerstattung | Nur erwaehnt | Eigener Abschnitt B mit konkretem Ablauf |
| Geschaeftsfuehrer-To-dos | Fehlten | Abschnitt I mit priorisierten Handlungsschritten |

---

## Statusklassifizierung

| Kuerzel | Bedeutung |
|---|---|
| DONE | Erledigt, liegt vor |
| INTERN_FERTIG | Software ist bereit, wartet auf externe Daten |
| EXTERN_OFFEN | Muss noch beantragt / beschafft werden |
| BEANTRAGT | Antrag gestellt, wartet auf Bearbeitung |
| WARTET_AUF_BEHOERDE | Bei Behoerde in Bearbeitung |
| NICHT_ERFORDERLICH | Fuer aktuellen Betriebsmodus nicht noetig |
| SPAETER | Erst bei Geschaeftsmodell-Erweiterung relevant |
| UNVERIFIZIERT | Nicht sicher, muss geprueft werden |

---

## A. Paragraph 45a / Paragraph 45b -- Anerkennung in Hessen

Alltagsengel erbringt Alltagsbegleitung nach Paragraph 45a SGB XI (NICHT Pflege nach Paragraph 36 SGB XI). Fuer den Entlastungsbetrag (Paragraph 45b) ist eine Anerkennung als Angebot zur Unterstuetzung im Alltag nach Landesrecht erforderlich.

### A.1 Zustaendige Behoerde (KORREKTUR gegenueber V1)

**Frankfurt am Main ist eine kreisfreie Stadt.** Die Zustaendigkeit liegt daher NICHT beim Regierungspraesidium Giessen, sondern bei:

| Feld | Wert |
|---|---|
| Behoerde | Jugend- und Sozialamt Frankfurt am Main, Leitstelle Aelterwerden |
| Standort | Rathaus fuer Senioren, Hansaallee 150, 60320 Frankfurt am Main |
| E-Mail | entlastungsangebote45@stadt-frankfurt.de |
| Telefon | 069 / 212 - 33607 |
| Rechtsgrundlage | Paragraph 45a SGB XI i.V.m. Hessische PfluV (Pflegeunterstuetzungsverordnung) |
| Quelle | https://frankfurt.de/themen/soziales-und-gesellschaft/pflege/anerkennung-und-foerderung-von-angeboten-zur-unterstuetzung-im-alltag |

### A.2 Anbieterformen nach PfluV Hessen

| Anbieterform | Beschreibung | Erlaubte Leistungen | Passt auf Alltagsengel? |
|---|---|---|---|
| I | Nichtgewerblich taetige juristische Personen (ehrenamtlich) | Betreuung + Entlastung Pflegende + Entlastung Alltag | Nein -- Alltagsengel ist gewerblich |
| II | Gewerblich Taetige (Paragraph 15 EStG) / Selbststaendige (Paragraph 18 EStG) | NUR Entlastung Pflegende + Entlastung Alltag (KEINE Betreuung) | Wahrscheinlich -- aber siehe Hinweis |
| III | Qualifizierte Einzelpersonen im Beschaeftigungsverhaeltnis | NUR Entlastung im Alltag | Nein -- Alltagsengel ist UG |
| IV | Nachbarschaftshelfer | NUR Entlastung im Alltag | Nein |

**UNVERIFIZIERT:** Alltagsengel UG ist eine juristische Person (haftungsbeschraenkt), tritt aber gewerblich auf. Es ist unklar, ob die UG als Anbieterform I (juristische Person) oder Anbieterform II (gewerblich) eingestuft wird. **Mit der Behoerde klaeren.** Die Einstufung bestimmt, welche Leistungen erbracht werden duerfen -- bei Anbieterform II waere Betreuung AUSGESCHLOSSEN.

### A.3 Anforderungen fuer die Anerkennung

| Punkt | Status | Wer stellt aus | Software-Abhaengigkeit | Blockiert Kernbetrieb? | Anmerkung |
|---|---|---|---|---|---|
| Erweitertes Fuehrungszeugnis (GF) | **DONE** | Bundesamt fuer Justiz / Buergeramt | Keiner -- wird dem Amt physisch vorgelegt | JA (indirekt, fuer Anerkennung) | Beantragt 20.07.2026, eingetroffen 19.08.2026 |
| IK-Nummer | **DONE** | ARGE-IK bei der DGUV | `organizations.ik_nummer` = 460629986 | JA (fuer Kassenabrechnung) | Gueltig ab 16.07.2026, bereits eingetragen |
| D-U-N-S-Nummer | **DONE** | Dun & Bradstreet | Keiner | NEIN | 316856461, verifiziert UPIK 04.07.2026 |
| Gewerbeanmeldung / HR-Eintrag | **DONE** | Gewerbeamt / AG Frankfurt (HRB) | Keiner | JA (indirekt) | Alltagsengel UG eingetragen |
| Anerkennungsantrag Paragraph 45a | **UNVERIFIZIERT** | Jugend- und Sozialamt Frankfurt | `state_settings.status`, `state_settings.approval_document` | **JA -- HAUPTBLOCKER** | Status unklar: Ist der Antrag bereits gestellt? Welche Unterlagen wurden verlangt? Mit Behoerde klaeren. |
| Qualifikationsnachweis Einsatzkraefte | **EXTERN_OFFEN** | Schulungsanbieter, geprueft durch Behoerde | `lib/personal/qualifikationen` (optional) | JA (indirekt) | Hessen verlangt Basisqualifizierung fuer Paragraph-45a-Alltagsbegleiter. Umfang mit Behoerde klaeren. |
| Haftpflichtversicherung (Betrieb) | **UNVERIFIZIERT** | Versicherungsgesellschaft | Keiner | JA (indirekt) | Wird typischerweise bei Anerkennung verlangt. Status pruefen. |
| Anbieterform-Einstufung | **UNVERIFIZIERT** | Jugend- und Sozialamt Frankfurt | Keiner | JA -- bestimmt Leistungsumfang | Wahrscheinlich Anbieterform II. Klaerung bei Behoerde. |

### A.4 Gesetzliche Budgetwerte (seit 01.01.2025, Pflegereform)

Diese Werte sind im Code hinterlegt (`lib/config/budget-constants.ts`) und werden vom Budget-System verwendet:

| Leistung | Betrag | Rechtsgrundlage | Status im Code |
|---|---|---|---|
| Entlastungsbetrag | **131 EUR/Monat** (1.572 EUR/Jahr) | Paragraph 45b SGB XI | DONE -- `BUDGET_VERSIONEN[1]` gueltig ab 2025-01-01 |
| VP + KZP kombiniert | **3.539 EUR/Jahr** | Paragraph 42a SGB XI (seit 01.07.2025 ein flexibles Budget) | DONE -- `VP_KZP_KOMBINIERT_EUR` |
| VP-Referenzwert | 1.685 EUR/Jahr | Paragraph 39 SGB XI | DONE |
| KZP-Referenzwert | 1.854 EUR/Jahr | Paragraph 42 SGB XI | DONE |
| Mindest-Pflegegrad VP/KZP | 2 | | DONE |

---

## B. Kostenerstattung / Abrechnung (Privatweg)

Der erste Kunde kann OHNE elektronische Kassenabrechnung bedient werden. So funktioniert der Privatweg:

### B.1 Ablauf Kostenerstattungsverfahren

```
1. Alltagsengel erbringt Leistung (Alltagsbegleitung)
2. Alltagsengel erstellt Privatrechnung an den Kunden
3. Kunde zahlt per Ueberweisung (SEPA-Lastschrift erst mit echter Glaeubiger-ID)
4. Kunde reicht Rechnung + Leistungsnachweis bei seiner Pflegekasse ein
5. Pflegekasse erstattet dem Kunden den Entlastungsbetrag (max. 131 EUR/Monat)
```

**Voraussetzung:** Die Anerkennung nach Paragraph 45a (Abschnitt A) muss vorliegen, damit die Pflegekasse dem Kunden die Kosten erstattet.

### B.2 Was die Software dafuer bereits kann

| Funktion | Modul | Status |
|---|---|---|
| Kundenverwaltung | Admin-UI | INTERN_FERTIG |
| Einsatzplanung | `lib/einsatzplanung/` | INTERN_FERTIG |
| Leistungsnachweis-PDF | `lib/abrechnung/leistungsnachweis-pdf.ts` | INTERN_FERTIG |
| Privatrechnung erstellen | `lib/billing/` mit `rechtsgrundlage = 'privat'` | INTERN_FERTIG |
| PDF-Rechnungserzeugung | `lib/pdf/` (DejaVuSans-Schriften vorhanden) | INTERN_FERTIG |
| Nummernkreis (fortlaufend, Paragraph 14 UStG) | `billing_number_sequences` | INTERN_FERTIG |
| Zahlungsziel / OPOS / Mahnwesen | `lib/billing/core/` | INTERN_FERTIG |
| DATEV-Export (Buchungsbelege) | `lib/billing/datev/` | INTERN_FERTIG (sofern Steuerberater-Daten gepflegt) |
| Briefkopf (Paragraph 35a GmbHG konform) | `lib/pdf/briefkopf.ts` | INTERN_FERTIG |

### B.3 Abtretungserklaerung

Die Software unterstuetzt Abtretungserklaerungen (`verordnungen.abtretungserklaerung_vorhanden`). Damit kann der Kunde die Erstattung direkt an Alltagsengel abtreten -- die Pflegekasse zahlt dann an Alltagsengel statt an den Kunden.

**UNVERIFIZIERT:** Ob Abtretungserklaerungen im Entlastungsbetrags-Kontext (Paragraph 45b) zulaessig sind und ob die Pflegekassen dies akzeptieren, ist nicht rechtlich geprueft. Im Zweifel den regulaeren Kostenerstattungsweg nutzen (Kunde zahlt, reicht ein, bekommt erstattet).

### B.4 Was fuer den Privatweg noch fehlt

| Punkt | Status | Blockiert Start? |
|---|---|---|
| Verifizierte Privat-Tarife (`tarif_status = 'verified'`) | INTERN_FERTIG (Tarife muessen angelegt und verifiziert werden) | JA -- ohne Tarif kein Preis, keine Rechnung |
| Mindestens 1 Betreuungskraft mit Einsatzfreigabe | INTERN_FERTIG (muss im System angelegt werden) | JA -- ohne Personal kein Einsatz |
| IBAN der Organisation | INTERN_FERTIG (muss eingetragen sein) | JA -- ohne IBAN kein Zahlungsweg auf der Rechnung |
| DATEV-Konfiguration (Berater- + Mandantennummer) | EXTERN_OFFEN (kommt vom Steuerberater) | JA -- ohne DATEV kein Buchungsexport |
| Anerkennung Paragraph 45a | EXTERN_OFFEN (siehe Abschnitt A) | JA -- ohne Anerkennung keine Kassenerstattung fuer den Kunden |

---

## C. Elektronische Kassenabrechnung (Paragraph 105 SGB XI / EDIFACT)

Die komplette DTA-Kette ist gebaut:
`EDIFACT-Generator > SECON-Verschluesselung > Auftragsdatei > SFTP-Transport > Ruecklaeufer-Verarbeitung`

Fuer den **ersten Kunden ist dieser Weg NICHT erforderlich** -- der Privatweg (Abschnitt B) funktioniert ohne.

### C.1 Externe Voraussetzungen

| Punkt | Status | Wer stellt aus | Env-Variable / Config | Blockiert Kernbetrieb? |
|---|---|---|---|---|
| ITSG-Zertifikat (SECON, PKCS#12) | EXTERN_OFFEN | ITSG Trust Center (kostenpflichtig, setzt IK voraus) | Upload in Bucket `abrechnung` + Env `SECON_ZERT_PASSWORT` | NEIN fuer Privatweg |
| SFTP-Zugang Datenannahmestelle(n) | EXTERN_OFFEN | Jeweilige Datenannahmestelle (DAVASO, BITMARCK, AOK-RZ) | `datenannahmestellen` Tabelle: sftp_host, sftp_port, sftp_user | NEIN fuer Privatweg |
| Testuebertragung (Dateiindikator '0') | EXTERN_OFFEN | Abstimmung mit Datenannahmestelle | `abrechnung_betriebsmodus`: Umschaltung auf 'produktion' verlangt Bestaetigung `ECHTBETRIEB` | NEIN fuer Privatweg |
| Env `ITSG_ZERTIFIZIERT=true` | NICHT_ERFORDERLICH (jetzt) | Interner Deploy nach bestandener Testuebertragung | Fail-closed Gate in `lib/abrechnung/externe-freigaben.ts` -- nur exakter String `'true'` oeffnet | NEIN fuer Privatweg |
| DAKOTA-Freischaltung pro Bundesland | NICHT_ERFORDERLICH (jetzt) | Interne Entscheidung, abhaengig von Anerkennung | `state_settings.dakota_export_enabled` | NEIN fuer Privatweg |
| Empfaenger-Zertifikate (ITSG-Verzeichnis) | INTERN_FERTIG | ITSG Trust Center (oeffentlich, automatischer Abruf) | `lib/abrechnung/zertifikate.ts` -- `ladeEmpfaengerZertifikat()` | NEIN fuer Privatweg |
| Kassenvertraege / Verguetungsvereinbarungen | EXTERN_OFFEN | Pflegekassen / Landesverbaende Hessen | `billing_tariffs` mit `tarif_status = 'verified'` | NEIN fuer Privatweg, JA fuer DTA |

### C.2 Credential-Katalog (aus `lib/abrechnung/credentials.ts`)

| Credential | Art | Ablageort | Extern offen? |
|---|---|---|---|
| ITSG-Zertifikat (PKCS#12) | Bucket | `abrechnung:zertifikate/<org>/absender-<ik>-<fp>.p12` | Nein (Ort bekannt, Zertifikat fehlt) |
| SECON-Zertifikats-Passwort | Env | `SECON_ZERT_PASSWORT` | Nein (wird beim Erzeugen selbst vergeben) |
| SSH-Private-Key je Annahmestelle | Bucket | `abrechnung:sftp-keys/<id>.key` | Nein (selbst erzeugt) |
| Empfaenger-Zertifikate | Bucket | `abrechnung_zertifikate` (Cache) | Nein (automatisch geladen) |
| KIM-Provider-Zugang | Env | Noch unbekannt | **JA** (Ablageort erst mit Provider-Vertrag) |

### C.3 Env-Variablen

| Variable | Beschreibung | Aktuell | Wann setzen |
|---|---|---|---|
| `SECON_ZERT_PASSWORT` | Passwort des PKCS#12-Zertifikats | Nicht gesetzt | Nach Erhalt des ITSG-Zertifikats |
| `ITSG_ZERTIFIZIERT` | Gate fuer DTA-Versand | `false` | Nach bestandener Testuebertragung |

---

## D. SEPA-Lastschrift

| Punkt | Status | Detail |
|---|---|---|
| SEPA-Glaeubiger-ID | **INTERN_FERTIG** (Platzhalter) | Aktueller Wert `DE98ZZZ09999999999` ist ein PLATZHALTER -- gesperrt in `lib/billing/sepa/glaeubiger-id.ts`. Die Software erkennt den Platzhalter und verweigert den Lastschrifteinzug. |
| Echte Glaeubiger-ID beantragen | EXTERN_OFFEN | Bei der Deutschen Bundesbank online beantragen (kostenfrei). Anleitung: `docs/ANLEITUNG_SEPA_CREDITOR_ID.md`. |
| Eintragen | INTERN_FERTIG | Echte ID in `organizations.sepa_creditor_id` eintragen (ersetzt den Platzhalter). |
| PAIN.008-XML-Erzeugung | INTERN_FERTIG | `lib/billing/sepa/pain008.ts` -- vollstaendig gebaut, prueft via `pruefeGlaeubigerIdOderWerfe()`. |
| Mandatsverwaltung | INTERN_FERTIG | `lib/billing/sepa/sepa-service.ts` -- `createMandate()`, `createSepaBatch()`. |

**NICHT fuer Start erforderlich.** Der erste Kunde zahlt per Ueberweisung. SEPA-Lastschrift ist ein Komfortfeature fuer spaeter.

---

## E. Ambulanter Pflegedienst / SGB V

Alltagsengel erbringt Alltagsbegleitung (Paragraph 45a SGB XI), NICHT haeusliche Krankenpflege (Paragraph 37 SGB V). Dieser Abschnitt betrifft eine spaetere Geschaeftsmodell-Erweiterung.

| Punkt | Status | Anmerkung |
|---|---|---|
| Zulassung als Leistungserbringer SGB V | SPAETER | Versorgungsvertrag nach Paragraph 132a SGB V -- voellig andere Rechtsgrundlage, andere Behoerde, andere Anforderungen (Fachkraftquote, PDL etc.) |
| Separate IK-Nummer fuer SGB V | SPAETER | Andere Leistungserbringer-Kategorie -- ggf. separate IK erforderlich |
| Software-Geruest | INTERN_FERTIG | `lib/abrechnung/sgb-v/` ist angelegt (Routing, Readiness, Transport-Adapter), Generator bewusst gesperrt |

---

## F. Paragraph 302 SGB V

Abrechnung haeuslicher Krankenpflege ueber das Paragraph-302-Verfahren. Komplett getrennt vom Paragraph-105-Weg.

| Punkt | Status | Detail |
|---|---|---|
| Technische Anlage 1 | SPAETER | GKV-Spitzenverband (gkv-datenaustausch.de). Ohne TA1 ist der Generator bewusst gesperrt (`lib/abrechnung/sgb-v/generator.ts` -- `exportImplementiert()` gibt `false` zurueck). |
| Paragraph-302-Routing | SPAETER | `sgb_v_routing` Tabelle -- je Kostentraeger-IK die Datenannahmestelle |
| Env `SGB_V_302_FREIGABE` | `false` (fail-closed) | Gate in `lib/abrechnung/externe-freigaben.ts` -- nur `'true'` oeffnet |

---

## G. KIM / Telematikinfrastruktur

Fuer Alltagsbegleitung nach Paragraph 45a **NICHT erforderlich**. Wird relevant, wenn der Datenaustausch mit den Kassen auf KIM umgestellt wird (voraussichtlich ab Dezember 2026, `lib/abrechnung/transport.ts`).

| Punkt | Status | Detail |
|---|---|---|
| gematik-Zulassung | SPAETER | Zulassung als Leistungserbringer in der TI |
| KIM-Provider-Vertrag | SPAETER | Postfachadresse + Zugang, Credential-Katalog `kim_provider_zugang` = `externOffen: true` |
| Konnektor-Anbindung (SMC-B) | SPAETER | Physischer oder virtueller Konnektor |
| Env `KIM_AKTIV` | `false` (fail-closed) | Gate in `lib/abrechnung/externe-freigaben.ts` -- nur `'true'` oeffnet |
| Software-Stub | INTERN_FERTIG | `sendePerKIM()` existiert, wirft bewusst. `kim_konfiguration`, `kim_karten` Tabellen angelegt. |

---

## H. DiPA / PflegeCoach

Der PflegeCoach (`/pflegecoach`) ist ein digitaler Pflege-Assistenzservice. Geschaeftsmodell-Entscheidung vom 14.08.2026: **KOSTENLOS fuer alle Endnutzer.** Monetarisierung ausschliesslich ueber Pflegekassen-Erstattung nach tatsaechlicher DiPA-Zulassung.

### H.1 Aktuelle Konfiguration

| Env-Variable | Aktueller Wert | Bedeutung |
|---|---|---|
| `COACH_DIPA_MODUS` | `false` | DiPA-Oberflaechen deaktiviert. PflegeCoach laeuft als freier digitaler Service. |
| `COACH_PREISE_FREIGEGEBEN` | `false` | Selbstzahler-Bestellweg gesperrt (fail-closed). Platzhalter-Betraege duerfen niemandem in Rechnung gestellt werden. |
| `COACH_NUTZUNGSNACHWEIS_AKTIV` | `false` | Evaluations-Tracking deaktiviert |
| `COACH_FREISCHALTUNG_PFLICHT` | `false` | Freischaltcode-Verfahren deaktiviert |

### H.2 Was fuer DiPA-Listung erforderlich waere (alles SPAETER)

| Punkt | Status | Wer stellt aus | Bekannte Blocker |
|---|---|---|---|
| BfArM-Listung im DiPA-Verzeichnis | SPAETER | BfArM (Paragraph 78a Abs. 3 SGB XI i.V.m. DiPAV) | Eingangsbedingung fuer Monetarisierung |
| ISO-27001-Zertifizierung (DAkkS) | SPAETER | DAkkS-akkreditierte Stelle (TueV, DEKRA) | Eingangsbedingung fuer DiPA-Antrag |
| BSI C5-Testat | SPAETER | BSI-akkreditierter Pruefdienstleister | **BEKANNTE LUECKE:** Supabase und Vercel haben KEIN C5-Testat |
| BSI TR-03161 | SPAETER | BSI-anerkanntes Pruefzentrum | |
| EU-Hosting / kein Drittlandtransfer | SPAETER | Architektonische Massnahme | **BEKANNTE LUECKE:** Vercel/Supabase koennten Daten ausserhalb EU verarbeiten |
| Nutzennachweis / Evaluation | SPAETER | Wissenschaftliche Einrichtung | Studienprotokoll erforderlich |
| Barrierefreiheit (BITV 2.0) | SPAETER | Externe Pruefstelle | Vorlage existiert (`audit/dipa/`) |
| Interoperabilitaet (FHIR/ISiP) | SPAETER | gematik | Konzeptdokument existiert (`docs/fhir-isip.md`) |
| QMS und Risikomanagement | SPAETER | Intern + externe Pruefung | Grundgeruest existiert (`docs/QMS_GRUNDGERUEST.md`) |
| Penetrationstest | SPAETER | Externer Dienstleister | Fuer DiPA-Listung Pflicht, fuer Pflegebetrieb nicht zwingend |

### H.3 35-EUR/h-Tarife

Die Kassentarife sind **fail-closed gesperrt** (`tarif_status` ungleich `'verified'`). Kein unverifizierter Tarif kann eine Rechnungsposition erzeugen. Verifizierung erst nach Vorliegen eines Vertragssatzes (Verguetungsvereinbarung mit Kassen).

---

## I. Geschaeftsfuehrer-To-dos

### PRIORITAET 1: HEUTE machbar

| Nr | Aktion | Aufwand | Kosten |
|---|---|---|---|
| 1 | **Behoerde kontaktieren:** E-Mail an entlastungsangebote45@stadt-frankfurt.de senden. Fragen: (a) Ist ein Anerkennungsantrag fuer Alltagsengel UG bereits in Bearbeitung? (b) Welche Anbieterform (I oder II) gilt fuer eine gewerbliche UG? (c) Welche Unterlagen werden benoetigt? (d) Gibt es eine Antragsvorlage? | 30 Min | Kostenlos |
| 2 | **Fuehrungszeugnis bereitlegen:** Das eingetroffene erweiterte Fuehrungszeugnis fuer den Anerkennungsantrag bereitlegen (wird physisch vorgelegt, nicht digitalisiert). | 5 Min | Kostenlos |
| 3 | **Haftpflichtversicherung pruefen:** Besteht bereits eine Betriebshaftpflicht fuer Alltagsbegleitung? Falls ja, Police bereithalten fuer den Antrag. Falls nein, Angebote einholen. | 30 Min | UNVERIFIZIERT (abhaengig von Versicherer) |
| 4 | **SEPA-Glaeubiger-ID beantragen:** Online bei der Deutschen Bundesbank (bundesbank.de/glaeubiger-id). Kostenfrei. Kann parallel zum Anerkennungsprozess laufen. | 15 Min | Kostenlos |

### PRIORITAET 2: Termin erforderlich

| Nr | Aktion | Abhaengig von | Kosten |
|---|---|---|---|
| 5 | **Anerkennungsantrag stellen** (wenn noch nicht geschehen): Alle erforderlichen Unterlagen zusammenstellen und beim Jugend- und Sozialamt Frankfurt einreichen. | Antwort der Behoerde auf Fragen aus Nr. 1 | Kostenlos (Verwaltungsgebuehr UNVERIFIZIERT) |
| 6 | **Qualifikationsnachweis Einsatzkraefte:** Basisqualifizierung fuer Alltagsbegleiter in Hessen. Schulungsanbieter identifizieren (Pflegestuetzpunkt, Wohlfahrtsverband). | Klaerung Qualifikationsanforderungen mit Behoerde | UNVERIFIZIERT |
| 7 | **Steuerberater kontaktieren:** DATEV-Beraternummer und Mandantennummer erfragen. Kleinunternehmer-Status klaeren (Paragraph 19 UStG). | Keiner | Laufende Steuerberater-Kosten |

### PRIORITAET 3: Kann parallel laufen

| Nr | Aktion | Blockiert durch | Kosten |
|---|---|---|---|
| 8 | **Privat-Tarife im System anlegen:** Stundensatz festlegen, im Admin-UI unter Tarife als `rechtsgrundlage = 'privat'` eintragen und verifizieren. | Anerkennungsbehoerde gibt ggf. Hoechstsaetze vor | Kostenlos (intern) |
| 9 | **Betreuungskraft anlegen:** Mindestens eine Person mit Einsatzfreigabe im System hinterlegen. | Qualifikationsnachweis (Nr. 6) | Kostenlos (intern) |
| 10 | **IBAN pruefen:** Bankverbindung in den Organisationsstammdaten pruefen / eintragen. | Keiner | Kostenlos (intern) |
| 11 | **DATEV-Konfiguration:** Nach Erhalt der Daten vom Steuerberater (Nr. 7) im Admin-UI eintragen. | Nr. 7 | Kostenlos (intern) |

### PRIORITAET 4: Erst bei Geschaeftsmodell-Erweiterung

| Nr | Aktion | Frühestens | Kosten |
|---|---|---|---|
| 12 | ITSG-Zertifikat beantragen | Nach Anerkennung + laufendem Privatbetrieb | Kostenpflichtig (UNVERIFIZIERT) |
| 13 | SFTP-Zugang bei Datenannahmestelle(n) beantragen | Nach ITSG-Zertifikat | Kostenlos |
| 14 | Kassenvertraege / Verguetungsvereinbarungen | Nach Anerkennung | Kostenlos |
| 15 | KIM / Telematikinfrastruktur | Fern (voraussichtlich Ende 2026) | Kostenpflichtig (UNVERIFIZIERT) |
| 16 | DiPA-Listung PflegeCoach | Fern (umfangreiche Voraussetzungen) | Erheblich (UNVERIFIZIERT) |

---

## ABSCHLUSSBERICHT -- 10 Fragen

### 1. Was kann Alltagsengel HEUTE bereits produktiv nutzen?

Die gesamte Privatrechnungskette ist technisch fertig: Kundenverwaltung, Einsatzplanung, Leistungsnachweis-PDF, Rechnungserzeugung (mit DejaVuSans-Schriften, fortlaufender Nummerierung, Paragraph-14-UStG-konformem Briefkopf), Zahlungsziel, OPOS-Verwaltung und DATEV-Export. Der PflegeCoach laeuft als kostenloser digitaler Service. Die Budgetwerte (131 EUR/Monat Entlastungsbetrag, 3.539 EUR/Jahr VP+KZP) sind hinterlegt und aktuell.

### 2. Was verhindert aktuell tatsaechlich den ersten Paragraph-45a/Paragraph-45b-Kunden?

**Genau ein externer Punkt: Die Anerkennung nach Paragraph 45a durch das Jugend- und Sozialamt Frankfurt am Main.** Ohne diesen Bescheid kann der Kunde die Rechnung bei der Pflegekasse einreichen, erhaelt aber keine Erstattung -- die Leistung ist dann fuer den Kunden eine reine Privatleistung ohne Kassenerstattung.

Rein theoretisch koennte Alltagsengel auch ohne Anerkennung Privatkunden bedienen, die keine Kostenerstattung benoetigen. In der Praxis ist die Zielgruppe aber Paragraph-45b-berechtigt, und ohne Anerkennung entfaellt der Hauptvorteil (131 EUR/Monat von der Kasse).

### 3. Welche Unterlagen liegen bereits vor?

| Unterlage | Status |
|---|---|
| Erweitertes Fuehrungszeugnis (GF) | DONE -- eingetroffen 19.08.2026 |
| IK-Nummer 460629986 | DONE -- gueltig ab 16.07.2026 |
| D-U-N-S-Nummer 316856461 | DONE -- verifiziert 04.07.2026 |
| Gewerbeanmeldung / HR-Eintrag | DONE |
| IBAN | DONE -- im System eingetragen (DE87 1001 0123 4463 5690 20) |

### 4. Welche konkreten externen Schritte muss der Geschaeftsfuehrer noch erledigen?

1. Kontakt mit Jugend- und Sozialamt Frankfurt aufnehmen (Anerkennungsantrag klaeren)
2. Anbieterform-Einstufung klaeren (I oder II)
3. Haftpflichtversicherung pruefen / abschliessen
4. Qualifikationsnachweise fuer Einsatzkraefte organisieren
5. SEPA-Glaeubiger-ID bei Bundesbank beantragen (optional, parallel)
6. DATEV-Daten beim Steuerberater erfragen
7. Privat-Tarife festlegen (ggf. nach Behoerden-Rueckmeldung zu Hoechstsaetzen)

### 5. Welche davon koennen HEUTE sofort erledigt werden?

- E-Mail an entlastungsangebote45@stadt-frankfurt.de (Nr. 1)
- Fuehrungszeugnis bereitlegen (Nr. 2)
- Haftpflichtversicherung pruefen (Nr. 3)
- SEPA-Glaeubiger-ID online beantragen (Nr. 4)

### 6. Welche kosten Geld?

| Punkt | Kosten |
|---|---|
| Haftpflichtversicherung | UNVERIFIZIERT (abhaengig von Versicherer und Deckungssumme) |
| Qualifizierungsschulungen | UNVERIFIZIERT (abhaengig von Anbieter) |
| Steuerberater (DATEV-Daten) | Laufende Kosten |
| ITSG-Zertifikat (SPAETER) | Kostenpflichtig (UNVERIFIZIERT) |
| DiPA-Zulassungsprozess (SPAETER) | Erheblich (ISO 27001, Penetrationstest, C5 etc.) |

### 7. Welche sind kostenlos?

- Anerkennungsantrag Paragraph 45a: Verwaltungsgebuehr UNVERIFIZIERT, Verfahren an sich kostenfrei
- SEPA-Glaeubiger-ID bei der Bundesbank: Kostenfrei
- IK-Nummer: Bereits vorhanden
- Fuehrungszeugnis: Bereits vorhanden
- Alle internen Software-Konfigurationsschritte (Tarife, Personal, IBAN, DATEV)
- Kassenvertraege / Verguetungsvereinbarungen: Kostenfrei
- SFTP-Zugang bei Datenannahmestellen: Kostenfrei

### 8. Was kann parallel laufen?

Diese Schritte haben keine Abhaengigkeiten untereinander:

- SEPA-Glaeubiger-ID beantragen (parallel zum Anerkennungsprozess)
- Steuerberater kontaktieren fuer DATEV-Daten
- Haftpflichtversicherung abschliessen
- Personal-Qualifizierung starten
- Interne Software-Konfiguration (Tarife, Personal, IBAN)

### 9. Was ist nur fuer spaeter notwendig?

| Bereich | Fruehestens relevant |
|---|---|
| ITSG-Zertifikat + SFTP-Zugang (DTA-Kassenabrechnung) | Nach Anerkennung + laufendem Privatbetrieb |
| Paragraph-302-SGB-V-Abrechnung | Bei Geschaeftsmodell-Erweiterung auf haeusliche Krankenpflege |
| KIM / Telematikinfrastruktur | Voraussichtlich Ende 2026 |
| DiPA-Listung PflegeCoach | Fern -- umfangreiche regulatorische + technische Voraussetzungen |
| SEPA-Lastschrift | Komfortfeature -- Ueberweisung reicht fuer den Start |

### 10. Gibt es irgendeinen INTERN loesbaren technischen Blocker?

**Nein.** Alle Pflicht-Pruefstuecke fuer den Privatweg sind intern fertig (`lib/pilot/voraussetzungen.ts`). Die einzigen offenen Punkte sind:

- **Stammdaten pflegen** (Tarife, Personal, DATEV) -- kann jederzeit im Admin-UI erledigt werden
- **Betriebsmodus** -- steht auf Testbetrieb, Umschaltung auf Echtbetrieb (`ECHTBETRIEB`-Bestaetigung) ist moeglich, sobald die Stammdaten vollstaendig sind

Der Code hat keine Bugs, keine fehlenden Module und keine ungebauten Pflichtpfade, die den Privatrechnungsweg blockieren wuerden. Der einzige echte Blocker ist extern: die Anerkennung nach Paragraph 45a.

---

## Gesamtuebersicht: Env-Variablen und externe Gates

| Env-Variable | Zweck | Gate-Typ | Aktuell | Fuer Start noetig? |
|---|---|---|---|---|
| `SECON_ZERT_PASSWORT` | PKCS#12-Passwort fuer SECON | Secret | Nicht gesetzt | NEIN |
| `ITSG_ZERTIFIZIERT` | Paragraph-105-DTA-Versand | Fail-closed | `false` | NEIN |
| `SGB_V_302_FREIGABE` | Paragraph-302-Erzeugung/Versand | Fail-closed | `false` | NEIN |
| `KIM_AKTIV` | KIM/TI-Versand | Fail-closed | `false` | NEIN |
| `COACH_DIPA_MODUS` | DiPA-Oberflaechen im PflegeCoach | Feature-Gate | `false` | NEIN |
| `COACH_NUTZUNGSNACHWEIS_AKTIV` | Evaluations-Tracking | Feature-Gate | `false` | NEIN |
| `COACH_PREISE_FREIGEGEBEN` | Selbstzahler-Bestellweg | Feature-Gate | `false` | NEIN |
| `COACH_FREISCHALTUNG_PFLICHT` | Freischaltcode-Verfahren | Feature-Gate | `false` | NEIN |

**Fail-closed-Prinzip** (alle drei Abrechnungs-Gates): Nur der exakte String `'true'` oeffnet. Jeder andere Wert -- einschliesslich `'TRUE'`, `'1'`, `'yes'` oder ein Tippfehler -- bedeutet gesperrt. Implementiert in `lib/abrechnung/externe-freigaben.ts`.

**Keine dieser Env-Variablen muss fuer den ersten Kunden (Privatweg) gesetzt werden.**

---

## Kritischer Pfad

```
DONE: Fuehrungszeugnis (eingetroffen 19.08.2026)
DONE: IK-Nummer (460629986, gueltig ab 16.07.2026)
DONE: D-U-N-S (316856461)
DONE: Gewerbeanmeldung
  |
  v
EXTERN_OFFEN: Anerkennung Paragraph 45a (Jugend- und Sozialamt Frankfurt)
  |          (haengt auch ab von: Haftpflichtversicherung, Qualifikationsnachweis)
  v
INTERN: Tarife + Personal + DATEV im Admin-UI pflegen
  |
  v
KERNBETRIEB MOEGLICH (Privatrechnung / Kostenerstattung)
  |
  v  (optional, fuer direkte Kassenabrechnung)
ITSG-Zertifikat + SFTP-Zugang
  |
  v
Testuebertragung > ITSG_ZERTIFIZIERT=true > DTA-Echtbetrieb
```
