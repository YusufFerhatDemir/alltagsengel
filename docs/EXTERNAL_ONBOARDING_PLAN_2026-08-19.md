# External-Onboarding-Plan — Alltagsengel UG

**Stand:** 2026-08-19
**Codebase:** V6 (Next.js / Supabase / Vercel)
**IK-Nummer:** 460629986 (gueltig ab 16.07.2026)
**Buero:** Neue Mainzer Strasse 66-68, 60311 Frankfurt am Main

---

## Lesehinweise

Dieser Plan listet ausschliesslich **externe** Abhaengigkeiten: Zugangsmittel, Genehmigungen, Zertifikate und Vertraege, die von Dritten beschafft werden muessen, bevor ein Softwaremodul produktiv nutzbar ist. Interne Konfigurationsschritte (Stammdaten pflegen, Feature-Flags setzen) sind nur erwaehnt, wenn sie unmittelbar an ein externes Zugangsmittel gekoppelt sind.

**Bearbeitungsdauern** sind als UNVERIFIED gekennzeichnet, sofern sie nicht aus einer amtlichen Quelle stammen.

---

## Kategorie 1: Zwingend VOR dem ersten echten Paragraph-45a/Paragraph-45b-Kundenbetrieb

Alltagsengel erbringt Alltagsbegleitung nach Paragraph 45a SGB XI (NICHT Pflege nach Paragraph 36 SGB XI). Fuer den ersten echten Kundenbetrieb — ob Privatzahler oder Kostenerstattung — gelten die folgenden Pflichtpunkte.

| Punkt | Was genau benoetigt wird | Wer stellt es aus / erteilt es | Welcher Softwarebereich haengt davon ab | Blockiert Kernbetrieb? | Einzutragende Zugangsdaten / Dokumente |
|---|---|---|---|---|---|
| **EXT-01: Anerkennung nach Landesrecht (Hessen)** | Anerkennungsbescheid als Anbieter von Angeboten zur Unterstuetzung im Alltag nach Paragraph 45a Abs. 1 SGB XI i.V.m. der Hessischen Verordnung (HeBBAUAnVO). Ohne diesen Bescheid darf kein Entlastungsbetrag (Paragraph 45b) mit der Pflegekasse abgerechnet werden. | Regierungspraesidium Giessen (zustaendig fuer Hessen). Antrag ueber das HMSI / RP. | `state_settings.status` = 'ANERKANNT', `state_settings.approval_document` (Upload des Bescheids). Readiness-Check `lib/abrechnung/readiness.ts` prueft `anerkannt.some(b => b.approval_document)`. Admin-UI: Expansion Deutschland. | **JA** — ohne Anerkennung kein Paragraph-45b-Anspruch gegenueber Pflegekassen. Privatrechnung an Selbstzahler ist ohne Anerkennung moeglich, aber der Kunde erhaelt keine Erstattung. | Anerkennungsbescheid als PDF hochladen (Admin > Expansion Deutschland > Hessen > Bescheid). Bearbeitungsdauer: UNVERIFIED (mehrere Wochen bis Monate). |
| **EXT-02: IK-Nummer (ARGE-IK)** | Institutionskennzeichen fuer die Abrechnung mit Sozialversicherungstraegern. Bereits vorhanden: **460629986** (gueltig ab 16.07.2026). | ARGE-IK bei der DGUV (Arbeitsgemeinschaft Institutionskennzeichen). | `organizations.ik_nummer`. Readiness-Check `lib/abrechnung/readiness.ts` Punkt `ik_nummer`. EDIFACT-Generator adressiert UNB-Segment mit Absender-IK. | **JA** — ohne IK ist keine Kassenabrechnung adressierbar. | Bereits eingetragen. Kein weiterer Handlungsbedarf, solange die IK nicht geaendert wird. |
| **EXT-03: Erweitertes Fuehrungszeugnis** | Fuer Geschaeftsfuehrung und ggf. Einsatzleitung nach Paragraph 75 SGB XII i.V.m. Landesrecht. Voraussetzung fuer die Anerkennung (EXT-01). | Bundesamt fuer Justiz (Beantragung ueber das Buergeramt). | Kein direkter Softwarebereich — Voraussetzung fuer EXT-01. | **JA** (indirekt) — ohne FZ keine Anerkennung. | Beantragt am 20.07.2026. Erwartet ca. 03.08.2026. Das FZ selbst wird NICHT digitalisiert/hochgeladen — es wird dem RP physisch vorgelegt. |
| **EXT-04: Gewerbeanmeldung / Handelsregister** | Nachweis der Rechtsform und Geschaeftstaetigkeit. In der Regel bei der Anerkennung vorzulegen. | Gewerbeamt Frankfurt am Main / Amtsgericht Frankfurt (HRB). | Kein direkter Softwarebereich. | **JA** (indirekt) — Voraussetzung fuer EXT-01. | Bereits vorhanden (Alltagsengel UG ist eingetragen). D-U-N-S: 316856461. |
| **EXT-05: Qualifikationsnachweis Einsatzkraefte** | Paragraph-45a-Alltagsbegleiter muessen je nach Landesrecht eine Schulung nachweisen (in Hessen: Basisqualifizierung). Betrifft die Personalakte, nicht die Software. | Schulungsanbieter (z.B. Pflegestuetzpunkt, Wohlfahrtsverband). Pruefung durch das RP. | `lib/personal/qualifikationen` (Mitarbeiter-Qualifikationsregister, optional). | **JA** (indirekt) — ohne qualifiziertes Personal keine Leistungserbringung. | Schulungszertifikate in der Personalakte. Optional: Im Admin-System unter Personalverwaltung hinterlegen. |
| **EXT-06: Haftpflichtversicherung** | Betriebshaftpflicht fuer die Alltagsbegleitung. Wird typischerweise vom RP bei der Anerkennung gefordert. | Versicherungsgesellschaft. | Kein direkter Softwarebereich. | **JA** (indirekt) — Voraussetzung fuer EXT-01. | Police-Kopie in der Dokumentenverwaltung hinterlegen (optional). |
| **EXT-07: Verguerungsvereinbarungen mit Pflegekassen (fuer direkte Kassenabrechnung)** | Rahmenvertraege nach Paragraph 45c SGB XI / Landesrahmenvertrag Hessen. Ohne diese Vereinbarung rechnet der Kunde per Kostenerstattung ab (er zahlt und reicht die Rechnung bei der Pflegekasse ein). | Pflegekassen / Landesverbände der Pflegekassen in Hessen. | `billing_tariffs` (Tarife muessen den Landesrahmenvertrags-Saetzen entsprechen, `tarif_status = 'verified'`). | **NEIN** fuer Privatrechnung/Kostenerstattung. **JA** fuer direkte Kassenabrechnung per DTA. | Tarifwerte in Admin > Tarife eintragen und verifizieren. Ohne Verguerungsvereinbarung laeuft der Betrieb ueber Privatrechnung. |

### Zusammenfassung Kategorie 1

Fuer den **Mindest-Start** (Privatrechnung / Kostenerstattung) sind EXT-01 bis EXT-06 zwingend. EXT-07 (Kassenvertraege) wird erst benoetigt, wenn die direkte Kassenabrechnung angestrebt wird. Die IK-Nummer (EXT-02) liegt bereits vor. Das erweiterte Fuehrungszeugnis (EXT-03) ist beantragt.

---

## Kategorie 2: Erforderlich fuer direkte elektronische Kassenabrechnung (Paragraph 105 SGB XI)

Diese Punkte werden benoetigt, um den DTA-Weg (EDIFACT-Dateien per SFTP an die Datenannahmestellen der Pflegekassen) produktiv zu nutzen. Ohne sie laeuft der Betrieb ueber Privatrechnung / manuelle Kostenerstattung weiter.

| Punkt | Was genau benoetigt wird | Wer stellt es aus / erteilt es | Welcher Softwarebereich haengt davon ab | Blockiert Kernbetrieb? | Einzutragende Zugangsdaten / Dokumente |
|---|---|---|---|---|---|
| **EXT-10: ITSG-Zertifikat (SECON, PKCS#12)** | Eigenes X.509-Zertifikat fuer die SECON-Verschluesselung der EDIFACT-Dateien (Signieren + Verschluesseln nach Anlage 16 der Technischen Anlagen). Ohne dieses Zertifikat kann keine Datei verschluesselt werden — und ohne Verschluesselung verlaesst keine Datei das Haus. | ITSG Trust Center (kostenpflichtig). Setzt vorherigen Nachweis der IK-Nummer voraus. Bearbeitungsdauer: UNVERIFIED (laut Codebase: "mehrere Tage Vorlauf"). | `lib/abrechnung/zertifikate.ts` — Upload in Storage-Bucket `abrechnung`. `lib/abrechnung/secon.ts` — Signierung und Verschluesselung. Readiness-Punkt `secon_absender`. Credential-Katalog-ID `secon_absender_zertifikat`. | **NEIN** (Privatrechnung laeuft ohne) — **JA** fuer DTA-Kassenabrechnung. | 1. PKCS#12-Datei hochladen: Admin > Abrechnung > Einstellungen (landet im Bucket `abrechnung`, Pfad: `zertifikate/<org>/absender-<ik>-<fp>.p12`). 2. Env-Variable `SECON_ZERT_PASSWORT` in Vercel setzen (Passwort des PKCS#12). |
| **EXT-11: SFTP-Zugang bei Datenannahmestelle(n)** | Zugangsdaten fuer den Datentransport zu DAVASO, BITMARCK, AOK-RZ o.ae. SSH-Schluesselpaar selbst erzeugen, oeffentlichen Teil bei der Datenannahmestelle registrieren. | Jeweilige Datenannahmestelle (nach Vertragsschluss / Registrierung). | `lib/abrechnung/transport.ts` — `TransportConfig` (sftp_host, sftp_port, sftp_user, sftp_key). Credential-Katalog-ID `sftp_ssh_key`. Readiness-Punkt `uebertragungszugang`. DB-Tabelle `datenannahmestellen`. | **NEIN** fuer Privatrechnung — **JA** fuer DTA. | 1. SSH-Key erzeugen. 2. Oeffentlichen Key bei der Annahmestelle registrieren. 3. Privaten Key hochladen: Admin > Annahmestellen (POST /api/admin/abrechnung/sftp-key, landet im Bucket). 4. In `datenannahmestellen`: sftp_host, sftp_port, sftp_user, sftp_verzeichnis, antwort_verzeichnis pflegen. |
| **EXT-12: Testübertragung mit Datenannahmestelle** | Eine Datei mit Dateiindikator '0' (Test) muss von der Annahmestelle angenommen und bestaetigt werden, BEVOR der Echtbetrieb aktiviert werden kann. Der Betriebsmodus-Umschalter (`lib/abrechnung/betriebsmodus.ts`) verlangt als Pflicht: Datum der Testuebertragung + Beleg/Referenz der Annahmestelle. | Abstimmung mit der jeweiligen Datenannahmestelle. | `abrechnung_betriebsmodus` — Umschaltung auf 'produktion' erfordert `testuebertragungAm`, `testuebertragungReferenz` und Bestaetigungswort `ECHTBETRIEB`. Erst danach Env-Variable `ITSG_ZERTIFIZIERT=true` setzen. | **NEIN** fuer Privatrechnung — **JA** fuer DTA-Echtbetrieb. | Testuebertragungsdatum und -referenz im Admin-UI eingeben. Dann: Env-Variable `ITSG_ZERTIFIZIERT=true` in Vercel setzen. |
| **EXT-13: DAKOTA-Freischaltung pro Bundesland** | Pro Bundesland muss `state_settings.dakota_export_enabled` aktiviert werden. Der Transport (`transport.ts`) prueft via `pruefeDakotaFreigabe()` — ohne Freischaltung wird die Uebermittlung abgebrochen ("es entsteht keine Forderung"). | Interne Entscheidung, aber abhaengig von EXT-01 (Anerkennung im jeweiligen Bundesland). | `state_settings.dakota_export_enabled`, `lib/abrechnung/transport.ts` Zeile 68-77. | **NEIN** fuer Privatrechnung — **JA** fuer DTA im jeweiligen Bundesland. | In Admin > Expansion Deutschland: dakota_export_enabled fuer das Bundesland aktivieren. |
| **EXT-14: Empfaenger-Zertifikate (ITSG-Verzeichnis)** | Oeffentliche X.509-Zertifikate der Datenannahmestellen, benoetigt fuer die SECON-Verschluesselung an den Empfaenger. | ITSG Trust Center — oeffentlich abrufbar unter trustcenter-data.itsg.de (annahme-rsa4096.key / annahme-sha256.key). | `lib/abrechnung/zertifikate.ts` — `ladeEmpfaengerZertifikat()` laedt automatisch und cached in DB. Credential-Katalog-ID `empfaenger_zertifikate`. | **NEIN** fuer Privatrechnung — bedingt fuer DTA (werden automatisch geladen). | Automatischer Abruf — kein manueller Schritt noetig. Erstmaliges Laden via Admin > Abrechnung > Einstellungen > Empfaenger-Zertifikate. |
| **EXT-15: SEPA-Glaeubiger-Identifikationsnummer** | Fuer den optionalen SEPA-Lastschrifteinzug. Der aktuelle Wert `DE98ZZZ09999999999` ist ein PLATZHALTER (gesperrt in `lib/billing/sepa/glaeubiger-id.ts`). Ohne echte Glaeubiger-ID: Zahlung per Ueberweisung. | Deutsche Bundesbank (Beantragung online ueber das Glaeubiger-ID-Portal). Bearbeitungsdauer: UNVERIFIED. | `organizations.sepa_creditor_id`. `lib/billing/sepa/sepa-service.ts` — `createMandate()` und `createSepaBatch()` pruefen via `pruefeGlaeubigerIdOderWerfe()`. `lib/billing/sepa/pain008.ts` — PAIN.008-XML-Erzeugung. | **NEIN** — SEPA-Lastschrift ist optional. Ueberweisung funktioniert ohne. | Echte Glaeubiger-ID in `organizations.sepa_creditor_id` eintragen (ersetzt den Platzhalter). Anleitung: `docs/ANLEITUNG_SEPA_CREDITOR_ID.md`. |
| **EXT-16: Kassenvertraege / Verguerungsvereinbarungen** | Vertragliche Grundlage fuer die direkte Kassenabrechnung. Erst mit Vertrag akzeptiert die Kasse die EDIFACT-Dateien als Forderung. | Pflegekassen / Landesverbaende der Pflegekassen. | `billing_tariffs` — Tarife muessen `tarif_status = 'verified'` haben. `dta_kostentraeger` — Kostentraeger-Stammdaten mit IK der jeweiligen Kasse. Readiness-Punkt `tarife` und `kostentraeger`. | **NEIN** fuer Privatrechnung — **JA** fuer DTA. | Kassentarife in Admin > Tarife eintragen und verifizieren. Kostentraeger in Admin > Kassenabrechnung > Stammdaten anlegen oder importieren. |

### Zusammenfassung Kategorie 2

Die komplette DTA-Kette ist gebaut (`EDIFACT-Generator > SECON-Verschluesselung > Auftragsdatei > SFTP-Transport > Ruecklaeufer-Verarbeitung`). Es fehlen ausschliesslich externe Zugangsmittel: ITSG-Zertifikat, SFTP-Zugang bei den Annahmestellen und die bestandene Testuebertragung. Bis dahin laueft der Betrieb ueber Privatrechnung / Kostenerstattung.

**Env-Variablen fuer diesen Block:**

| Variable | Beschreibung | Wann setzen |
|---|---|---|
| `SECON_ZERT_PASSWORT` | Passwort des PKCS#12-Zertifikats | Nach Erhalt des ITSG-Zertifikats |
| `ITSG_ZERTIFIZIERT` | Gate fuer den DTA-Versand (nur `'true'` oeffnet) | Nach bestandener Testuebertragung |

---

## Kategorie 3: Erforderlich fuer spaeteren ambulanten Pflegedienst / SGB V (Paragraph 302)

Diese Punkte betreffen die Abrechnung haeuslicher Krankenpflege (Paragraph 37 SGB V) ueber das Paragraph-302-Verfahren. Alltagsengel erbringt heute KEINE haeusliche Krankenpflege — diese Kategorie ist daher reine Zukunftsplanung.

| Punkt | Was genau benoetigt wird | Wer stellt es aus / erteilt es | Welcher Softwarebereich haengt davon ab | Blockiert Kernbetrieb? | Einzutragende Zugangsdaten / Dokumente |
|---|---|---|---|---|---|
| **EXT-20: Zulassung als sonstiger Leistungserbringer (SGB V)** | Versorgungsvertrag nach Paragraph 132a SGB V fuer haeusliche Krankenpflege. Voellig getrennt von der Paragraph-45a-Anerkennung — andere Rechtsgrundlage, andere Behoerde, andere Anforderungen (Fachkraftquote, PDL etc.). | Landesverbaende der Krankenkassen. | `state_settings` — separater Anerkennungsstatus fuer SGB V. | **NEIN** — betrifft aktuellen Betrieb nicht. | Versorgungsvertrag als Dokument hinterlegen. |
| **EXT-21: IK-Nummer fuer SGB-V-Leistungen** | Je nach Konstellation kann eine separate IK-Nummer fuer die Krankenkassen-Abrechnung erforderlich sein (andere Leistungserbringer-Kategorie). | ARGE-IK. | `organizations.ik_nummer` oder zusaetzliche IK fuer das SGB-V-Verfahren. | **NEIN** — betrifft aktuellen Betrieb nicht. | Falls separate IK erforderlich: in den SGB-V-Stammdaten eintragen. |
| **EXT-22: Technische Anlage 1 zur Paragraph-302-Vereinbarung** | Die amtliche Spezifikation (Segmentstrukturen SLGA/SLLA, Schluesselverzeichnisse) fuer die EDIFACT-Erzeugung. Der Generator (`lib/abrechnung/sgb-v/generator.ts`) ist bewusst gesperrt, solange `spec_bestaetigt = false`. | GKV-Spitzenverband — Bezug ueber gkv-datenaustausch.de. | `lib/abrechnung/sgb-v/generator.ts` — `exportImplementiert()` gibt `false` zurueck. `sgb_v_formatversionen.spec_bestaetigt` und `spec_quelle`. Readiness: `lib/abrechnung/sgb-v/readiness.ts` Punkt `spezifikation`. | **NEIN** — betrifft aktuellen Betrieb nicht. | In `sgb_v_formatversionen`: `ta_version`, `gueltig_von`, `spec_bestaetigt = true`, `spec_quelle` eintragen. |
| **EXT-23: Paragraph-302-Routing (Krankenkassen-Datenannahmestellen)** | Zuordnung jeder Krankenkassen-IK zur zustaendigen Datenannahmestelle (kann von den Paragraph-105-Stellen abweichen). | Kassenverzeichnisse / Technische Anlage. | `lib/abrechnung/sgb-v/routing.ts` — `ladeRouting()`. `sgb_v_routing` Tabelle. Readiness-Punkt `routing`. | **NEIN** — betrifft aktuellen Betrieb nicht. | In `sgb_v_routing`: je Kostentraeger-IK die zustaendige Datenannahmestelle und das Annahmeformat eintragen. |
| **EXT-24: Paragraph-302-Testuebertragung** | Wie EXT-12, aber fuer den SGB-V-Kanal. Betriebsmodus `sftp_302` muss auf 'produktion' umgeschaltet werden. | Abstimmung mit der Datenannahmestelle. | `abrechnung_betriebsmodus` Kanal `sftp_302`. Env-Variable `SGB_V_302_FREIGABE`. | **NEIN** — betrifft aktuellen Betrieb nicht. | Testuebertragungsdatum + Referenz eingeben, dann `SGB_V_302_FREIGABE=true` in Vercel. |

### Zusammenfassung Kategorie 3

Der SGB-V-Bereich (`lib/abrechnung/sgb-v/`) ist als Geruest angelegt (Routing, Readiness, Transport-Adapter, Versionsaufloesung), aber der eigentliche EDIFACT-Generator ist **bewusst gesperrt**, weil die amtliche Spezifikation (Technische Anlage 1) fehlt. Erst mit dieser Anlage koennen die Segmentstrukturen korrekt implementiert werden. Dies ist ein komplett separater Geschaeftsbereich von der aktuellen Alltagsbegleitung.

**Env-Variablen fuer diesen Block:**

| Variable | Beschreibung | Wann setzen |
|---|---|---|
| `SGB_V_302_FREIGABE` | Gate fuer Paragraph-302-Erzeugung und -Versand (nur `'true'` oeffnet) | Nach TA1-Implementierung + bestandener Testuebertragung |

---

## Kategorie 4: Erforderlich ausschliesslich fuer DiPA / PflegeCoach

Der PflegeCoach (`/pflegecoach`) ist als digitaler Pflege-Assistenzservice gebaut und laeuft heute als **Selbstzahler-Produkt** (Env `COACH_DIPA_MODUS=false`). Eine DiPA-Listung (Digitale Pflegeanwendung nach Paragraph 40a SGB XI) wuerde den PflegeCoach zur erstattungsfaehigen Anwendung machen. Bis dahin: **KOSTENLOS** oder Selbstzahler-Verkauf ueber Stripe.

| Punkt | Was genau benoetigt wird | Wer stellt es aus / erteilt es | Welcher Softwarebereich haengt davon ab | Blockiert Kernbetrieb? | Einzutragende Zugangsdaten / Dokumente |
|---|---|---|---|---|---|
| **EXT-30: BfArM-Listung im DiPA-Verzeichnis** | Antrag auf Aufnahme in das Verzeichnis fuer digitale Pflegeanwendungen nach Paragraph 78a Abs. 3 SGB XI i.V.m. DiPAV (BJNR156800022). Erst nach positiver Pruefung und Aufnahme kann der DiPA-Modus aktiviert werden. | Bundesinstitut fuer Arzneimittel und Medizinprodukte (BfArM). | `COACH_DIPA_MODUS` Env-Variable. `app/pflegecoach/_lib/Modus.tsx` — `DipaModusProvider`. Wenn true: Anspruchspruefung, Kassenreferenzen und Abrechnungswege werden sichtbar (`/pflegecoach/anspruch`, `/api/coach/anspruch`). | **NEIN** — PflegeCoach laeuft ohne DiPA-Listung als Selbstzahler-Produkt. | Env `COACH_DIPA_MODUS=true` erst setzen, wenn die BfArM-Listung erteilt ist. |
| **EXT-31: ISO-27001-Zertifizierung (DAkkS-akkreditiert)** | Informationssicherheits-Managementsystem. Laut DiPAV Paragraph 4 Abs. 2 Nr. 1 eine EINGANGSBEDINGUNG fuer den DiPA-Antrag. Ohne ISO-27001 wird der Antrag nicht angenommen. | DAkkS-akkreditierte Zertifizierungsstelle (z.B. TueV, DEKRA). | Kein direkter Softwarebereich — organisatorische Voraussetzung. Anforderungskatalog: `lib/coach/anforderungskatalog.ts` Kategorie `datensicherheit`. | **NEIN** — PflegeCoach laeuft ohne. **JA** als Eingangsblocker fuer den DiPA-Antrag. | ISO-27001-Zertifikat als Antragsanlage. |
| **EXT-32: BSI C5-Testat (Cloud-Hosting)** | Cloud-Anbieter muessen ein C5-Testat (Cloud Computing Compliance Criteria Catalogue) vorweisen. BEKANNTE LUECKE: Supabase und Vercel haben aktuell KEIN BSI-C5-Testat. Dies macht einen Hosting-Wechsel oder eine C5-Ausnahme erforderlich. | BSI-akkreditierter Pruefdienstleister fuer den Cloud-Anbieter ODER Migration auf einen C5-zertifizierten Anbieter. | Gesamte Infrastruktur (Supabase, Vercel). | **NEIN** — PflegeCoach laeuft ohne. **JA** als Blocker fuer DiPA. | Nachweis des C5-Testats vom Cloud-Anbieter, oder Migrationsplan auf C5-konformen Anbieter. |
| **EXT-33: BSI TR-03161 (Sicherheitsanforderungen an Gesundheits-Apps)** | Technische Richtlinie des BSI fuer Sicherheitsanforderungen an digitale Gesundheitsanwendungen. Nachweis der Umsetzung ist Teil des DiPA-Antrags. | Pruefung durch ein BSI-anerkanntes Pruefzentrum. | Anforderungskatalog: `lib/coach/anforderungskatalog.ts` Kategorie `datensicherheit`. | **NEIN** — PflegeCoach laeuft ohne. **JA** als Blocker fuer DiPA. | Pruefbericht / Testat als Antragsanlage. |
| **EXT-34: Datenschutz — Serverstandort EU / kein Drittlandtransfer** | Fuer DiPA sind Standardvertragsklauseln (SCC) fuer Drittlandtransfers UNZULAESSIG (DiPAV). Alle personenbezogenen Daten muessen in der EU/EWR verarbeitet werden. BEKANNTE LUECKE: Vercel-Edge-Funktionen und Supabase Auth koennten Daten ausserhalb der EU verarbeiten. | Kein einzelner Aussteller — erfordert architektonische Massnahmen (EU-Region-Pinning oder Anbieterwechsel). | Gesamte Infrastruktur. Anforderungskatalog: `lib/coach/anforderungskatalog.ts` Kategorie `datenschutz`. | **NEIN** — PflegeCoach laeuft ohne. **JA** als Blocker fuer DiPA. | Nachweis des EU-Hosting-Standorts aller Komponenten. |
| **EXT-35: Nutzennachweis / Evaluation** | DiPAV verlangt den Nachweis eines pflegerischen Nutzens (ggf. ueber eine Erprobungsphase). Der PflegeCoach hat ein Evaluationsmodul (`COACH_NUTZUNGSNACHWEIS_AKTIV`), aber die wissenschaftliche Studie muss extern durchgefuehrt werden. | Unabhaengige wissenschaftliche Einrichtung (Pflegewissenschaft / Versorgungsforschung). | Env `COACH_NUTZUNGSNACHWEIS_AKTIV` — Erfassung pseudonymisierter Nutzungsereignisse (abhaengig von Nutzer-Einwilligung `wissenschaftliche_auswertung`). | **NEIN** — PflegeCoach laeuft ohne. **JA** fuer DiPA-Listung. | Studienprotokoll und -ergebnisse als Antragsanlage. |
| **EXT-36: Barrierefreiheit (BITV 2.0 / WCAG 2.1 AA)** | DiPA muessen barrierefrei sein. Ein Screenreader-Ergebnisprotokoll-Vorlage liegt vor (`audit/dipa/screenreader_ergebnisprotokoll_vorlage.md`), die vollstaendige Pruefung steht noch aus. | Externe Pruefstelle fuer Barrierefreiheit ODER Selbst-Audit nach BITV 2.0 Anlage 2 Tabelle B. | Anforderungskatalog: `lib/coach/anforderungskatalog.ts` Kategorie `barrierefreiheit`. | **NEIN** — PflegeCoach laeuft ohne. **JA** fuer DiPA. | Pruefbericht als Antragsanlage. |
| **EXT-37: Interoperabilitaet (FHIR / ISiP)** | DiPA muessen Interoperabilitaetsanforderungen erfuellen (Paragraph 6 DiPAV). Ein FHIR/ISiP-Konzeptdokument existiert (`docs/fhir-isip.md`). | Gematik (ISiP-Spezifikation). Pruefung im Rahmen des BfArM-Antrags. | `/pflegecoach/interoperabilitaet` — Seite existiert. Anforderungskatalog: Kategorie `interoperabilitaet`. | **NEIN** — PflegeCoach laeuft ohne. **JA** fuer DiPA. | ISiP-Konformitaetsnachweis. |
| **EXT-38: QMS und Risikomanagement** | Qualitaetsmanagementsystem und Risikoanalyse fuer den PflegeCoach als DiPA. Eine QMS-Grundgeruest-Vorlage existiert (`docs/QMS_GRUNDGERUEST.md`). | Internes QMS, externe Pruefung ggf. im Rahmen von ISO 27001 (EXT-31). | Anforderungskatalog: `lib/coach/anforderungskatalog.ts` Kategorie `qms_risikomanagement`. | **NEIN** — PflegeCoach laeuft ohne. **JA** fuer DiPA. | QMS-Dokumentation, Risikoanalyse als Antragsanlage. |

### Zusammenfassung Kategorie 4

Der PflegeCoach laeuft heute als **Selbstzahler-Produkt** ohne regulatorische Abhaengigkeiten. Eine DiPA-Listung erfordert umfangreiche externe Massnahmen, darunter zwei **bekannte Infrastruktur-Blocker**:
- **C5-Luecke**: Supabase und Vercel haben kein BSI-C5-Testat.
- **Drittland-Luecke**: Standardvertragsklauseln sind fuer DiPA unzulaessig.

Beide erfordern entweder eine Migration auf C5-zertifizierte / EU-only-Infrastruktur oder eine regulatorische Ausnahme.

**Env-Variablen fuer diesen Block:**

| Variable | Beschreibung | Wann setzen |
|---|---|---|
| `COACH_DIPA_MODUS` | DiPA-Modus aktivieren (nur `'true'`) | Nach BfArM-Listung |
| `COACH_NUTZUNGSNACHWEIS_AKTIV` | Evaluations-Tracking (abhaengig von Nutzer-Einwilligung) | Vor Pilotstart der Evaluation |

---

## Kategorie 5 (Zukunft): KIM / Telematikinfrastruktur

Die Telematikinfrastruktur ist fuer die aktuelle Alltagsbegleitung NICHT erforderlich. Sie wird relevant, wenn der Datenaustausch mit den Kassen ab voraussichtlich Dezember 2026 auf KIM umgestellt wird (siehe `lib/abrechnung/transport.ts` Zeile 232-243). Ein Stub existiert (`sendePerKIM()`), der bewusst wirft.

| Punkt | Was genau benoetigt wird | Wer stellt es aus / erteilt es | Welcher Softwarebereich haengt davon ab | Blockiert Kernbetrieb? | Einzutragende Zugangsdaten / Dokumente |
|---|---|---|---|---|---|
| **EXT-40: gematik-Zulassung** | Zulassung als Leistungserbringer in der TI. | gematik. | Env-Variable `KIM_AKTIV`. `lib/abrechnung/externe-freigaben.ts` — Gate `kim_aktiv`. | **NEIN** — aktuell laeuft alles ueber SFTP. | Kim-Zulassungsdokument. |
| **EXT-41: KIM-Provider-Vertrag** | Postfachadresse und Zugang beim KIM-Provider. Credential-Katalog-ID `kim_provider_zugang` ist bewusst als `externOffen: true` modelliert — Ablageort und Format der Zugangsdaten stehen erst mit dem Provider-Vertrag fest. | KIM-Provider (z.B. CGM, x.tekhealth, akquinet). | `kim_konfiguration` Tabelle, `lib/kim/adapter.ts`. Credential-Katalog in `lib/abrechnung/credentials.ts`. | **NEIN** — aktuell laeuft alles ueber SFTP. | Postfachadresse, Provider-Name, Zugangsdaten (Format providerabhaengig). |
| **EXT-42: Konnektor-Anbindung (SMC-B/eHBA)** | Physischer oder virtueller Konnektor fuer den TI-Zugang. SMC-B (Institutskarte) und ggf. eHBA (Heilberufsausweis, falls Pflege). | Konnektor-Anbieter + Kartenterminal-Anbieter. | `kim_karten` Tabelle. | **NEIN** — aktuell laeuft alles ueber SFTP. | SMC-B/eHBA-Zuordnung in `kim_karten`. |

**Env-Variablen fuer diesen Block:**

| Variable | Beschreibung | Wann setzen |
|---|---|---|
| `KIM_AKTIV` | Gate fuer KIM-Versand (nur `'true'` oeffnet) | Nach gematik-Zulassung + Provider-Vertrag + Konnektor + bestandener Testnachricht |

---

## Gesamtuebersicht: Env-Variablen und externe Gates

| Env-Variable | Zweck | Gate-Typ | Aktueller Stand |
|---|---|---|---|
| `SECON_ZERT_PASSWORT` | PKCS#12-Passwort fuer SECON | Secret | Nicht gesetzt |
| `ITSG_ZERTIFIZIERT` | Paragraph-105-DTA-Versand | Fail-closed Gate | `false` |
| `SGB_V_302_FREIGABE` | Paragraph-302-Erzeugung/Versand | Fail-closed Gate | `false` |
| `KIM_AKTIV` | KIM/TI-Versand | Fail-closed Gate | `false` |
| `COACH_DIPA_MODUS` | DiPA-Oberflächen im PflegeCoach | Feature-Gate | `false` |
| `COACH_NUTZUNGSNACHWEIS_AKTIV` | Evaluations-Tracking | Feature-Gate | `false` |
| `COACH_PREISE_FREIGEGEBEN` | Selbstzahler-Bestellweg | Feature-Gate | `false` |

**Fail-closed-Prinzip**: Bei allen drei Abrechnungs-Gates (`ITSG_ZERTIFIZIERT`, `SGB_V_302_FREIGABE`, `KIM_AKTIV`) oeffnet ausschliesslich der exakte String `'true'`. Jeder andere Wert — einschliesslich `'TRUE'`, `'1'`, `'yes'` oder ein Tippfehler — bedeutet gesperrt. Dies ist in `lib/abrechnung/externe-freigaben.ts` Zeile 160-162 implementiert.

---

## Kritischer Pfad fuer den Kernbetrieb (Alltagsbegleitung)

```
EXT-03 (Fuehrungszeugnis, beantragt)
  |
  v
EXT-01 (Anerkennung RP Giessen) ← haengt auch von EXT-04, EXT-05, EXT-06 ab
  |
  v
Kernbetrieb moeglich (Privatrechnung / Kostenerstattung)
  |
  v  (optional, fuer direkte Kassenabrechnung)
EXT-10 (ITSG-Zertifikat) + EXT-11 (SFTP-Zugang)
  |
  v
EXT-12 (Testuebertragung)
  |
  v
DTA-Echtbetrieb (ITSG_ZERTIFIZIERT=true)
```

**Ergebnis:** Der erste echte Kunde kann bedient werden, sobald die Anerkennung (EXT-01) vorliegt. Die elektronische Kassenabrechnung ist ein separater Meilenstein.
