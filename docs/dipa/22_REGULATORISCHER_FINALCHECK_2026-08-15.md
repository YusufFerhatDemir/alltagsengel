# DiPA — Regulatorischer Final-Check der 15 offenen Punkte (15.08.2026)

**Gegenstand.** Die 13 Einträge mit Status `EXTERNAL_EVIDENCE_REQUIRED` und die
2 Einträge mit `PARTIAL` aus `docs/dipa/21_FINAL_MATRIX_2026-08-15.md` wurden
noch einmal vollständig gegen die Primärquellen geprüft. Keine der bisherigen
Einordnungen wurde ungeprüft übernommen.

**Gelesene Quellen, jeweils im Volltext am 15.08.2026:**

| Quelle | Fundort | Fassung |
|---|---|---|
| DiPAV inkl. Anlage 1 und Anlage 2 | `gesetze-im-internet.de/dipav/BJNR156800022.html` | Ausfertigung 29.09.2022, zuletzt geändert Art. 4a G. v. 22.03.2024 |
| SGB XI § 78a | `gesetze-im-internet.de/sgb_11/__78a.html` | aktuelle Fassung |
| SGB XI § 40a, § 40b, § 39a | `gesetze-im-internet.de/sgb_11/` | aktuelle Fassung |
| SGB V § 139e | `gesetze-im-internet.de/sgb_5/__139e.html` | aktuelle Fassung |
| DiGAV § 4 | `gesetze-im-internet.de/digav/__4.html` | aktuelle Fassung |
| **BfArM-DiPA-Leitfaden** | `bfarm.de/SharedDocs/Downloads/DE/Medizinprodukte/dipa_leitfaden.pdf` | **Version 1.3 vom 15.07.2026**, 138 Seiten |
| BSI TR-03161 Teile 1–3, BSI-FAQ zur TR-03161 | `bsi.bund.de` | aktuelle Fassung |

> **Korrektur zur Quellenangabe im Auftrag:** Die im Auftrag genannte URL
> `gesetze-im-internet.de/dipav/BJNR622800023.html` liefert HTTP 404. Die
> gültige Dokument-ID der DiPAV ist **`BJNR156800022`**. Die dort abgerufene
> Fassung wurde für diesen Bericht verwendet.

---

## 0. Zwei Vorbemerkungen, die alles Weitere tragen

### 0.1 Anlage 1 DiPAV, Anlage 2 DiPAV und Anlage 1 DiGAV sind drei verschiedene Dokumente

Das ist keine Spitzfindigkeit, sondern die häufigste Fehlerquelle in der
bisherigen Aktenlage:

| Anlage | Rechtsgrundlage | Inhalt | Nachweisform |
|---|---|---|---|
| **Anlage 1 DiPAV** | § 3 Abs. 2 DiPAV | Sicherheit und Funktionstauglichkeit, QMS, Risikomanagement | Fragebogen, Herstellererklärung |
| **Anlage 2 DiPAV** | §§ 6, 7 DiPAV, Erklärungspflicht in § 6 Abs. 11 | Interoperabilität, Robustheit, Verbraucherschutz, altersgerechte Nutzbarkeit/Barrierefreiheit, Unterstützung, Qualität der pflegebezogenen Inhalte, Patientensicherheit | Fragebogen, Herstellererklärung |
| **Anlage 1 DiGAV** | über **§ 8 Abs. 4 DiPAV** übergangsweise auf DiPA angewandt | **Datenschutz** (40 Aussagen) | Fragebogen, rechtsverbindliche Herstellererklärung |

Leitfaden v1.3, Kap. 3.3 (S. 37), wörtlich:

> „Bis zum Zeitpunkt des Nachweises durch ein Zertifikat greift das in § 8
> Absatz 4 der DiPAV genannte Verfahren, nach dem die
> Datenschutz-Anforderungen für DiGA aus der aktuellen Anlage 1 der DiGAV auch
> auf DiPA angewandt werden. Der DiPA-Hersteller muss die Einhaltung der
> Datenschutzanforderungen gemäß Anlage 1 DiGAV in Form eines Fragebogens durch
> rechtsverbindliche Erklärung gegenüber dem BfArM bestätigen."

Der Vorspann beider DiPAV-Anlagen lautet gleichlautend: „Mit dem nachfolgend
aufgeführten Fragebogen hat der Hersteller die Erfüllung der Anforderungen …
zu **erklären**. Der Hersteller bestätigt die Erfüllung der Anforderungen durch
Kennzeichnung in der Spalte ‚zutreffend'."

**Folge für die zeitliche Einordnung:** Alles, was über einen dieser drei
Fragebögen läuft, ist **Bestandteil des Antrags** (§ 3 Abs. 2 S. 1, § 6 Abs. 11
DiPAV) und damit Klasse **A** — auch dann, wenn keine externe Stelle beteiligt
ist. Eine Erklärung, deren Sachverhalt nicht vorliegt, ist keine zulässige
Erklärung.

### 0.2 Datensicherheit und Datenschutz stehen heute an genau entgegengesetzten Punkten

| | Datensicherheit (§ 5 Abs. 2 Nr. 1 DiPAV) | Datenschutz (§ 5 Abs. 2 Nr. 2 DiPAV) |
|---|---|---|
| Nachweisnorm | § 8 Abs. 3 DiPAV | § 8 Abs. 4 DiPAV |
| Zertifikat gefordert? | **JA, seit 01.01.2025** | **NEIN, noch nicht** |
| Erklärungs-Fallback (§ 4 Abs. 6 S. 2 DiGAV)? | **geschlossen** | **offen und einschlägig** |
| Belegstelle | Leitfaden Kap. 3.4 (S. 49) | Leitfaden Kap. 3.3 (S. 37) |

Diese Asymmetrie erklärt, warum SEC-01/SEC-05 harte Eingangsblocker sind und
DS-02/DS-04 es regulatorisch **nicht** sind.

---

## 1. SEC-01 — Datensicherheitszertifikat nach BSI TR-03161

**Interne ID:** `AK-SEC-01`
**Konkrete Anforderung:** Vorlage eines Zertifikats über die Erfüllung der vom
BSI festgelegten Datensicherheitsanforderungen (BSI TR-03161) für die
Produktversion, für die die Aufnahme beantragt wird.

**Exakte Fundstellen:**

- **DiPAV § 5 Abs. 2 Nr. 1** — DiPA müssen „die nach § 78a Absatz 7 des Elften
  Buches Sozialgesetzbuch vom Bundesamt für Sicherheit in der
  Informationstechnik festgelegten Anforderungen an die Datensicherheit
  erfüllen".
- **DiPAV § 8 Abs. 3 Satz 1** — „Der Hersteller weist die Erfüllung der
  Anforderungen an die Datensicherheit nach § 5 Absatz 2 Nummer 1 ab dem in
  § 139e Absatz 10 Satz 3 des Fünften Buches Sozialgesetzbuch genannten Datum
  durch Vorlage eines Zertifikates nach § 78a Absatz 7 des Elften Buches
  Sozialgesetzbuch nach."
- **SGB V § 139e Abs. 10 Satz 3** — „Der Nachweis der Erfüllung der
  Anforderungen an die Datensicherheit durch den Hersteller ist spätestens ab
  dem **1. Januar 2025** unter Vorlage eines Zertifikates nach Satz 2 zu
  führen."
- **SGB XI § 78a Abs. 7 Satz 2** — „§ 139e Absatz 10 Satz 2 bis 4 des Fünften
  Buches gilt entsprechend." (Damit gelten für DiPA: BSI-Prüf- und
  Zertifizierungsverfahren „ab dem 1. Juni 2024", Zertifikatspflicht ab
  01.01.2025, Absenkungsmöglichkeit beim Authentifizierungsverfahren.)

### Der Erklärungs-Fallback aus § 8 Abs. 3 — vollständig ausgelesen

Der Auftrag verlangt ausdrücklich, dies genau zu prüfen. Der Absatz hat fünf
Sätze; Satz 3 bis 5 lauten wörtlich:

> „Der Hersteller ist verpflichtet, das Zertifikat nach Satz 1 unverzüglich
> vorzulegen, wenn die Verfahren nach § 78a Absatz 7 des Elften Buches
> Sozialgesetzbuch zur Verfügung stehen. **Bis zum Vorliegen der Verfahren**
> weist der Hersteller abweichend von Satz 1 die Erfüllung der zu
> gewährleistenden Anforderungen an die Datensicherheit durch eine Erklärung
> nach § 4 Absatz 6 Satz 2 der Digitale Gesundheitsanwendungen-Verordnung nach.
> Erfolgt der Nachweis der Erfüllung der Anforderungen an die Datensicherheit
> abweichend von Satz 1 zunächst durch eine Erklärung nach Satz 4, kann das
> Bundesinstitut für Arzneimittel und Medizinprodukte ergänzend die Vorlage von
> Berichten über die Durchführung von Penetrationstests oder die Vorlage von
> Sicherheitsgutachten über die Komponenten und Dienste der digitalen
> Pflegeanwendung verlangen."

**Es gibt also einen Erklärungs-Fallback im Verordnungstext.** Er ist an genau
eine Bedingung geknüpft: dass die Prüfverfahren noch nicht zur Verfügung
stehen. Diese Bedingung ist heute **nicht mehr erfüllt**. Beleg — BfArM-DiPA-
Leitfaden v1.3 vom 15.07.2026, Kap. 3.4 (S. 49), wörtlich:

> „Gemäß § 78a Absatz 7 SGB XI müssen Hersteller von DiPA die Erfüllung der
> Anforderungen an die Datensicherheit anhand der Technischen Richtlinien
> („BSI TR-03161 Anforderungen an Anwendungen im Gesundheitswesen") seit dem
> **01.01.2025** unter Vorlage eines entsprechenden Zertifikats nachweisen.
> **Seit dem 01.07.2025 ist die Vorlage eines entsprechenden Zertifikats
> Voraussetzung für die formale Vollständigkeit des Antrags** auf Aufnahme in
> das DiPA-Verzeichnis. **Eine Aufnahme einer DiPA in das DiPA-Verzeichnis ohne
> Vorlage des Zertifikats ist nicht möglich.**"

Ergänzend Leitfaden Kap. 3.4.2, FAQ (S. 52):

> „Nein, zum Nachweis der Erfüllung der Anforderungen an die Datensicherheit
> muss ein Datensicherheitszertifikat gemäß der Technischen Richtlinien … bei
> Antragstellung vorgelegt werden."

Der Leitfaden verlinkt für die Durchführung die BSI-Liste prüfberechtigter
Stellen — die Verfahren stehen also nachweislich zur Verfügung.

**Neu gegenüber dem bisherigen Bericht:** Bislang wurde die Schließung des
Erklärungswegs aus Marktbeobachtung (tätige Prüfstellen) und einer BfArM-
Webseite abgeleitet. Sie steht jetzt **wörtlich im aktuellen Leitfaden**, mit
einem zweiten, bisher nicht erfassten Datum: **01.07.2025** — dem Stichtag, ab
dem das Fehlen des Zertifikats den Antrag **formal unvollständig** macht.

| Prüffrage | Antwort |
|---|---|
| Für unsere Zweckbestimmung anwendbar | **JA** — anwendbar TR-03161-2 (Webanwendung) und -3 (Hintergrundsystem) |
| Antragseinreichung ohne Nachweis möglich | **NEIN** (formale Vollständigkeit seit 01.07.2025) |
| Aufnahme ohne Nachweis möglich | **NEIN** (wörtlich ausgeschlossen) |
| Externe Prüfstelle zwingend | **JA** — BSI-anerkannte Prüfstelle, Bestätigung durch das BSI |
| Hersteller-Selbsterklärung ausreichend | **NEIN** |
| Im Verfahren nachreichbar | **NEIN** |
| Erst nach Aufnahme relevant | **NEIN** |

**Status:** `EXTERNAL_EVIDENCE_REQUIRED` — bestätigt.
**Zeitliche Klassifizierung: A — MUSS VOR ANTRAGSTELLUNG VORLIEGEN.**

---

## 2. SEC-04 — Penetrationstest

**Interne ID:** `AK-SEC-04`

**Exakte Fundstelle:** BfArM-DiPA-Leitfaden v1.3, Kap. 3.4.2 (S. 51), wörtlich:

> „Für die Produktversion, für die eine Aufnahme in das DiPA-Verzeichnis
> beantragt wird, **muss für alle Komponenten (einschließlich aller
> Backend-Komponenten) ein Penetrationstest durchgeführt worden sein**. Der Test
> **soll** vorrangig von BSI zertifizierten Teststellen durchgeführt werden. …
> Verpflichtende Bestandteile der Penetrationstests sind manuelle Code Reviews
> und ein Whitebox-Test. Dem BfArM muss auf Verlangen ein Nachweis über die
> Durchführung der entsprechenden Tests und die Behebung der dabei gefundenen
> Schwachstellen vorgelegt werden."

Und, entlastend, unmittelbar darunter:

> „Hinweis: In der Regel wird das Datensicherheitszertifikat die Anforderungen
> an die Datensicherheit vollständig abdecken, sodass das BfArM zusätzlich zur
> Einreichung des Zertifikats keinen weiteren Nachweis in Form eines
> Penetrationstests einfordern wird. Dieser ist nur erforderlich, wenn es
> spezielle Gründe hierfür gibt."

**Korrektur gegenüber dem bisherigen Bericht.** Die Matrix führte als
Primärquelle „DiPAV § 8 Abs. 3 S. 5". Dieser Satz ist **nicht einschlägig**: er
gibt dem BfArM die Pentest-Nachforderung nur für den Fall, dass der Nachweis
„zunächst durch eine Erklärung nach Satz 4" erfolgt — also genau auf dem Weg,
der seit 01.07.2025 geschlossen ist. Die tragende Fundstelle ist der Leitfaden
Kap. 3.4.2 (nicht Kap. 3.4) in Verbindung mit der TR-03161-Prüfung selbst.

Zweite Präzisierung: „**soll** vorrangig von BSI zertifizierten Teststellen" —
das ist ein Soll, kein Muss. Eine BSI-zertifizierte Teststelle ist für den
Pentest als solchen **nicht zwingend**; zwingend ist sie für das Zertifikat aus
SEC-01, in dessen Prüfung der Pentest ohnehin aufgeht.

| Prüffrage | Antwort |
|---|---|
| Für unsere Zweckbestimmung anwendbar | **JA** |
| Antragseinreichung ohne Nachweis möglich | **NEIN** — der Test muss für die beantragte Produktversion durchgeführt *worden sein*; die *Vorlage* erfolgt nur auf Verlangen |
| Aufnahme ohne Nachweis möglich | **NEIN** |
| Externe Prüfstelle zwingend | **NEIN** für den Pentest selbst (SOLL); **JA** faktisch, weil er Teil der TR-03161-Prüfung ist |
| Hersteller-Selbsterklärung ausreichend | **NEIN** |
| Im Verfahren nachreichbar | Nur die *Vorlage* des Berichts; nicht die *Durchführung* |
| Erst nach Aufnahme relevant | **NEIN** |

**Status:** `EXTERNAL_EVIDENCE_REQUIRED` — bestätigt.
**Zeitliche Klassifizierung: A.** Weiterhin gilt: **eine** Beauftragung
gemeinsam mit SEC-01, nicht zwei.

---

## 3. SEC-05 — ISMS / ISO 27001

**Interne ID:** `AK-SEC-05`
Der Auftrag fragt: steht ISO 27001 wirklich in der DiPAV oder nur im Leitfaden,
und ist es über TR-03161 verbindlich? Antwort: **beides trägt, und der Leitfaden
ist strenger als der Verordnungstext.**

**Fundstelle 1 — Verordnung, DiPAV § 8 Abs. 3 Satz 2**, wörtlich:

> „Das Bundesinstitut für Arzneimittel und Medizinprodukte **kann** zum Nachweis
> der Erfüllung der Anforderungen an die Datensicherheit zudem ergänzend die
> Vorlage eines geeigneten Zertifikates oder Nachweises über ein
> Informationssicherheitsmanagementsystem verlangen."

Das ist eine **Kann-Vorschrift**. „ISO 27001" wird im Verordnungstext **nicht**
namentlich genannt.

**Fundstelle 2 — technische Richtlinie, BSI TR-03161-3, O.Org_1**, verbindlich
über DiPAV § 5 Abs. 2 Nr. 1 → § 78a Abs. 7 SGB XI:

> „Der Betreiber der Hintergrundsysteme MUSS eine Zertifizierung nach
> [ISO27001], auf der Basis von IT-Grundschutz [BSI27001] oder einem
> vergleichbaren Standard nachweisen."

**Fundstelle 3 — BfArM-DiPA-Leitfaden v1.3, Kap. 3.4.1 (S. 50)**, wörtlich:

> „Der Hersteller einer DiPA **muss bei der Antragstellung** ein Zertifikat über
> die Umsetzung eines ISMS nach ISO 27001 bzw. ISO 27001 auf Basis IT-Grundschutz
> **vorweisen**. Die zertifizierende Stelle muss durch die DAkkS oder eine
> entsprechende ausländische Stelle für die Durchführung einer ISO 27001
> Zertifizierung akkreditiert sein. … Wesentlich in allen geschilderten
> Nachweismöglichkeiten ist, dass das Zertifikat auf den Hersteller der DiPA
> ausgestellt sein muss."

**Ergebnis:** Der Verordnungstext allein würde ein „kann" hergeben. Die
TR-03161 macht daraus ein MUSS für den Betreiber, und der Leitfaden bindet den
Zeitpunkt ausdrücklich an die **Antragstellung**. Die im Katalogeintrag bereits
zurückgenommene Abschwächung bleibt zurückgenommen — sie war falsch.

Mitzubeschaffen aus demselben Prüfaspekt (bereits erfasst, hier bestätigt):
O.Org_2 (C5-Typ-2-Testat der Cloud-Dienstleister), O.Org_3/_4 (Monitoring und
Alarmprozesse), O.Org_5 (Notfallvorsorgekonzept).

| Prüffrage | Antwort |
|---|---|
| Für unsere Zweckbestimmung anwendbar | **JA** (eigenes Hintergrundsystem, Cloud-Betrieb) |
| Antragseinreichung ohne Nachweis möglich | **NEIN** (Leitfaden: „bei der Antragstellung … vorweisen") |
| Aufnahme ohne Nachweis möglich | **NEIN** |
| Externe Prüfstelle zwingend | **JA** — DAkkS-akkreditierte Zertifizierungsstelle |
| Hersteller-Selbsterklärung ausreichend | **NEIN** |
| Im Verfahren nachreichbar | **NEIN** |
| Erst nach Aufnahme relevant | **NEIN** |

**Status:** `EXTERNAL_EVIDENCE_REQUIRED` — bestätigt.
**Zeitliche Klassifizierung: A.** *(Damit ist SEC-05 ein dritter Eingangsblocker
neben SEC-01 und NN-01 — bisher stand er nicht auf dem kritischen Pfad.)*

---

## 4. DS-02 — Datenschutz-Folgenabschätzung

**Interne ID:** `AK-DS-02`

**Fundstellen:** DSGVO Art. 35 Abs. 1 (Pflicht bei voraussichtlich hohem
Risiko; hier einschlägig wegen Art.-9-Daten), Art. 35 Abs. 2 (Rat des
Datenschutzbeauftragten, soweit benannt). Verfahrensseitig: **DiPAV § 8 Abs. 4
Satz 4** — bis zum Vorliegen der Zertifizierungsverfahren Nachweis „durch eine
Erklärung nach § 4 Absatz 6 Satz 2 der Digitale Gesundheitsanwendungen-
Verordnung", konkretisiert über **Anlage 1 DiGAV**. Der Leitfaden führt die DSFA
als Themenblock 11 der künftigen Prüfkriterien (Kap. 3.3, S. 48) und sagt dazu
ausdrücklich, es handele sich um die „zukünftig verpflichtende Zertifizierung".

**Korrektur gegenüber dem bisherigen Bericht.** Die Matrix führte als Blocker
„Juristische Schlussbewertung fehlt" und den Punkt unter externem Nachweis. Das
ist regulatorisch nicht haltbar: Es ist **keine externe Stelle vorgeschrieben**.
Die DSFA ist vom Verantwortlichen selbst durchzuführen; eine anwaltliche oder
gutachterliche Schlussbewertung ist ein selbst gesetzter Qualitätsmaßstab, keine
Rechtspflicht. Was Pflicht ist: dass die DSFA **vorliegt**, bevor die
Anlage-1-DiGAV-Erklärung abgegeben wird.

| Prüffrage | Antwort |
|---|---|
| Für unsere Zweckbestimmung anwendbar | **JA** |
| Antragseinreichung ohne Nachweis möglich | **NEIN** — die Erklärung nach Anlage 1 DiGAV ist Antragsbestandteil |
| Aufnahme ohne Nachweis möglich | **NEIN** |
| Externe Prüfstelle zwingend | **NEIN** — Datenschutz-Zertifizierung nach § 8 Abs. 4 S. 1 DiPAV ist noch nicht eingefordert |
| Hersteller-Selbsterklärung ausreichend | **JA** — rechtsverbindliche Erklärung nach Anlage 1 DiGAV |
| Im Verfahren nachreichbar | **NEIN** (nur ergänzende Plausibilisierungsunterlagen, § 8 Abs. 4 S. 5) |
| Erst nach Aufnahme relevant | **NEIN** |

**Status:** `EXTERNAL_EVIDENCE_REQUIRED` — **nur noch im Sinne „außerhalb der
Technik"**, nicht im Sinne „externe Prüfstelle". Kein Statuswechsel, aber der
Blocker ist milder als bisher beschrieben.
**Zeitliche Klassifizierung: A.**

---

## 5. DS-04 — AVV-Kette

**Interne ID:** `AK-DS-04`

**Fundstellen:** DSGVO Art. 28 Abs. 3 (Vertrag oder anderes Rechtsinstrument).
Verfahrensseitig über **Anlage 1 DiGAV**, Themenblock „Auftragsverarbeitung und
Datenübermittlung" — Leitfaden Kap. 3.3 (S. 37): der Fragebogen berücksichtigt
ausdrücklich „Sicherstellen einer datenschutzkonformen Zusammenarbeit mit
externen Dienstleistern durch Auftragsverarbeitungsverträge".

Materielle Zusatzschranke, die hier häufig übersehen wird — **DiPAV § 5 Abs. 4**:
Verarbeitung, auch im Auftrag, nur „im Inland, in einem Mitgliedstaat der
Europäischen Union oder in einem diesem nach § 35 Absatz 7 des Ersten Buches
Sozialgesetzbuch gleichgestellten Staat oder, sofern ein Angemessenheitsbeschluss
gemäß Artikel 45 der Datenschutz-Grundverordnung vorliegt, in einem Drittstaat".
Der Leitfaden schärft nach (S. 71 der Ausgangspaginierung / Kap. 3.3.3):
**Standardvertragsklauseln nach Art. 46 DSGVO sind für DiPA nicht zulässig.**
Eine AVV-Kette, die einen Dienstleister über SCC in einem Drittstaat einbindet,
ist damit nicht heilbar — sie muss ersetzt werden.

| Prüffrage | Antwort |
|---|---|
| Für unsere Zweckbestimmung anwendbar | **JA** |
| Antragseinreichung ohne Nachweis möglich | **NEIN** |
| Aufnahme ohne Nachweis möglich | **NEIN** |
| Externe Prüfstelle zwingend | **NEIN** — es braucht Vertragsunterschriften, keine Prüfstelle |
| Hersteller-Selbsterklärung ausreichend | **JA** (die Erklärung; die Verträge müssen tatsächlich bestehen) |
| Im Verfahren nachreichbar | **NEIN** |
| Erst nach Aufnahme relevant | **NEIN** |

**Status:** `EXTERNAL_EVIDENCE_REQUIRED` — bestätigt (Gegenzeichnung Dritter).
**Zeitliche Klassifizierung: A.**

---

## 6. QI-01 — Pflegefachliche Freigabe

**Interne ID:** `AK-QI-01`
Der Auftrag fragt: muss die Freigabe von einer externen Person kommen? **Nein.**

**Fundstelle 1 — DiPAV § 6 Abs. 8**, wörtlich:

> „Die von einer digitalen Pflegeanwendung verwendeten pflegebezogenen Inhalte
> müssen qualitätsgesichert sein und dem allgemein anerkannten Stand der
> pflegerisch-medizinischen Erkenntnisse entsprechen. Sofern die digitale
> Pflegeanwendung die Pflegebedürftigen, pflegenden Angehörigen oder sonstigen
> ehrenamtlich Pflegenden mit Gesundheitsinformationen unterstützt, müssen die
> Gesundheitsinformationen ebenfalls dem allgemein anerkannten fachlichen Stand
> entsprechen und zielgruppengerecht aufbereitet sein."

**Fundstelle 2 — Anlage 2 DiPAV, Themenfeld VI**, 19 Punkte. Tragend:
Nr. 1 („beruhen auf dem allgemein anerkannten fachlichen Standard"), Nr. 2
(„geeignete Prozesse etabliert, um … auf aktuellem Stand zu halten"), Nr. 3
(Quellen veröffentlicht und in der Anwendung benannt), Nr. 5
(Interessenkonflikte der Verfasser benannt).
**Fundstelle 3 — DiPAV § 2 Abs. 1 Nr. 9** — im Antrag Angaben zu „den Quellen
für die pflegebezogenen Inhalte und Verfahren, … insbesondere zu den
pflegerisch-medizinischen Leitlinien und Expertenstandards, Lehrwerken und
Studien".

Nichts davon verlangt eine externe, akkreditierte oder herstellerunabhängige
Person. Themenfeld VI ist Teil des Selbsterklärungs-Fragebogens. Gebraucht wird
eine **pflegefachlich qualifizierte Person, die die Freigabe verantwortet** —
eine Fachkraft aus dem eigenen Netz genügt.

| Prüffrage | Antwort |
|---|---|
| Für unsere Zweckbestimmung anwendbar | **JA** (12 Inhaltsmodule) |
| Antragseinreichung ohne Nachweis möglich | **NEIN** — Erklärung nach § 6 Abs. 11 |
| Aufnahme ohne Nachweis möglich | **NEIN** |
| Externe Prüfstelle zwingend | **NEIN** |
| Hersteller-Selbsterklärung ausreichend | **JA** |
| Im Verfahren nachreichbar | **NEIN** |
| Erst nach Aufnahme relevant | **NEIN** |

**Status:** `EXTERNAL_EVIDENCE_REQUIRED` — bestätigt (Person außerhalb der
Technik). **Zeitliche Klassifizierung: A.**

---

## 7. QI-02 — Erhebungsinstrumente (FES-I / BSFC-s / SUS)

**Interne ID:** `AK-QI-02`

**Fundstelle — BfArM-DiPA-Leitfaden v1.3, Kap. 4.3.2**, wörtlich:

> „Der Nachweis des pflegerischen Nutzens einer DiPA muss grundsätzlich auf
> einem validierten Messinstrument (z. B. ein validierter Fragebogen) basieren.
> Sofern kein geeignetes validiertes Messinstrument vorhanden ist, muss der
> Hersteller dies zunächst im Rahmen eines strukturierten und dokumentieren
> Literatur-Reviews nachweisen. Der Hersteller kann in diesem Fall grundsätzlich
> ein eigenes Messinstrument erstellen. Jedoch ist in diesem Fall die Validität
> des Messinstruments … nachzuweisen. … Eine vollständige Validierungsstudie ist
> in beiden Kontexten nicht zwingend erforderlich."

**Korrektur gegenüber dem bisherigen Bericht.** Die Matrix führte die Fundstelle
als „Kap. 4.5.1" — richtig ist **Kap. 4.3.2**. Wichtiger inhaltlich: Die
Anforderung betrifft das **Messinstrument des Nutzennachweises**, nicht die
Instrumente als Produktfunktion. Die offene Lizenzfrage zu FES-I, BSFC-s und SUS
ist **Urheber- und Lizenzrecht, keine DiPAV-Anforderung** — sie steht in keinem
der drei Fragebögen. Regulatorisch bindend ist nur: das Instrument, auf dem der
Nutzennachweis beruht, muss validiert sein oder eigenständig validiert werden,
und der Weg dorthin gehört in das Evaluationskonzept (NN-01).

Der Leitfaden nennt außerdem einen **gangbaren Ausweg**, den die bisherige
Matrix nicht abbildete: dokumentierter Literatur-Review + eigenes Instrument +
Pretest an einer kleinen Gruppe — ohne vollständige Validierungsstudie.

| Prüffrage | Antwort |
|---|---|
| Für unsere Zweckbestimmung anwendbar | **JA**, aber nur über den Nutzennachweis |
| Antragseinreichung ohne Nachweis möglich | **NEIN**, soweit Bestandteil des Evaluationskonzepts |
| Aufnahme ohne Nachweis möglich | **NEIN** |
| Externe Prüfstelle zwingend | **NEIN** — aber das Evaluationskonzept, in dem es steht, muss herstellerunabhängig erstellt sein |
| Hersteller-Selbsterklärung ausreichend | **NEIN** — Validität ist nachzuweisen, nicht zu erklären |
| Im Verfahren nachreichbar | **NEIN** |
| Erst nach Aufnahme relevant | **NEIN** |

**Status:** `EXTERNAL_EVIDENCE_REQUIRED` — bestätigt.
**Zeitliche Klassifizierung: A** (über NN-01).

---

## 8. NN-01 — Wissenschaftliches Evaluationskonzept

**Interne ID:** `AK-NN-01`
Der Auftrag fragt: vor dem Antrag oder Teil der Erprobung? **Vor dem Antrag.**

**Fundstelle 1 — SGB XI § 78a Abs. 6a Satz 2**, wörtlich:

> „Der Hersteller hat dem Antrag folgende Unterlagen beizufügen: 1. Nachweise
> nach Absatz 4 Satz 3 Nummer 1 und 2, 2. eine plausible Begründung für den
> pflegerischen Nutzen und 3. **ein von einer herstellerunabhängigen Institution
> erstelltes wissenschaftliches Evaluationskonzept zum Nachweis des
> pflegerischen Nutzens.**"

**Fundstelle 2 — DiPAV § 14**: „Der Hersteller legt **im Rahmen eines Antrags**
auf Aufnahme zur Erprobung … ein nach allgemein anerkannten wissenschaftlichen
Standards erstelltes Evaluationskonzept vor …"

**Fundstelle 3 — Leitfaden v1.3, Kap. 4.5.2 (S. 103)**:

> „Der Hersteller legt darüber hinaus **mit dem Antrag** … ein … Evaluationskonzept
> vor … Das Evaluationskonzept **muss von einem herstellerunabhängigen
> wissenschaftlichen Institut erstellt** worden sein. ‚Herstellerunabhängig'
> bedeutet, dass es sich um eine Institution handelt, die nicht in besonderem
> Maße finanziell, organisatorisch oder disziplinarisch mit dem Hersteller
> verbunden ist. Denkbar sind hier beispielsweise Auftragsforschungsinstitute
> bzw. Clinical Research Organisations (CRO). … Eine marktübliche Vergütung der
> Aufwände der herstellerunabhängigen Institution ist natürlich zulässig."

Das Evaluationskonzept ist damit **eindeutig nicht Teil der Erprobung**, sondern
ihre Eintrittskarte. Der Weg über die vorläufige Aufnahme umgeht es nicht.

**Präzisierung:** Verlangt ist ein *herstellerunabhängiges wissenschaftliches
Institut* — **keine akkreditierte Prüfstelle**. Und: der Leitfaden stellt
ausdrücklich klar, dass die Beauftragung bezahlt werden darf, ohne die
Unabhängigkeit zu zerstören.

**Gegenprobe zum anderen Antragsweg:** Bei einem Antrag auf **dauerhafte**
Aufnahme (§ 78a Abs. 4 SGB XI) entfällt das Evaluationskonzept — dann greifen
aber §§ 10, 11 DiPAV mit **vergleichenden Studien**, Registrierung in einem
öffentlichen Studienregister und Veröffentlichung. Das ist die deutlich höhere
Hürde. Für PflegeCoach bleibt der Erprobungsweg der realistische.

| Prüffrage | Antwort |
|---|---|
| Für unsere Zweckbestimmung anwendbar | **JA** (Erprobungsweg) |
| Antragseinreichung ohne Nachweis möglich | **NEIN** — Pflichtunterlage nach § 78a Abs. 6a S. 2 Nr. 3 |
| Aufnahme ohne Nachweis möglich | **NEIN** |
| Externe Institution zwingend | **JA** — herstellerunabhängiges wissenschaftliches Institut / CRO |
| Hersteller-Selbsterklärung ausreichend | **NEIN** |
| Im Verfahren nachreichbar | **NEIN** |
| Erst nach Aufnahme relevant | **NEIN** |

**Status:** `EXTERNAL_EVIDENCE_REQUIRED` — bestätigt.
**Zeitliche Klassifizierung: A.**

---

## 9. BF-02 — Usability-Test mit der Zielgruppe

**Interne ID:** `AK-BF-02`
Der Auftrag fragt: was verlangt Anlage 2 genau, und geht ein Hersteller-Test?
**Ja, ein Hersteller-Test genügt — durchgeführt werden muss er trotzdem.**

**Fundstellen — Anlage 2 DiPAV, Themenfeld IV**, wörtlich:

- **Nr. 2** (§ 6 Abs. 5): „eine **formative Evaluation** wurde mindestens einmal
  in der Entwicklungsphase … in einer simulierten oder tatsächlichen
  Anwenderumgebung durchgeführt, z. B. als Cognitive Walkthrough, also als
  analytisches Durchdenken, Evaluation und Inspektion eines Problems im Gegensatz
  zu einem empirischen Testverfahren."
- **Nr. 3** (§ 6 Abs. 5): „eine **summative Validierung** wurde mit einer
  ausreichenden Anzahl von repräsentativen Vertretern der vorgesehenen
  Nutzergruppe(n) … durchgeführt. Die Wahl der Anzahl der Vertreter ist
  nachvollziehbar begründet, die Validierung **sollte** mit jeweils mindestens
  fünf repräsentativen Vertretern durchgeführt werden."
- **Nr. 10**: „die zufriedenstellende Nutzbarkeit … wurde im Rahmen einer
  (Online-)Befragung von repräsentativen Vertretern … bestätigt."
- **Nr. 12**: „die leichte und intuitive Nutzbarkeit … wurde im Rahmen von Tests
  mit die Zielgruppe repräsentierenden Fokusgruppen bestätigt."

Leitfaden v1.3, Kap. 3.6.3 (S. 70): „Eine entwicklungsbegleitende (formative)
Evaluation sowie eine abschließende (summative) Validierung **müssen** dies
belegen."

Zwei Präzisierungen: Die Fünf-Personen-Zahl in Nr. 3 ist ein **„sollte"**, das
mit einer nachvollziehbaren Begründung anders gefüllt werden kann. Nr. 2 lässt
für die formative Runde ausdrücklich ein **analytisches** Verfahren (Cognitive
Walkthrough) zu — **ohne Testpersonen**. Nur Nr. 3, 10 und 12 brauchen echte
Vertreter der Zielgruppe. Keiner der vier Punkte verlangt ein externes Institut.

| Prüffrage | Antwort |
|---|---|
| Für unsere Zweckbestimmung anwendbar | **JA** |
| Antragseinreichung ohne Nachweis möglich | **NEIN** — Erklärung nach § 6 Abs. 11 |
| Aufnahme ohne Nachweis möglich | **NEIN** |
| Externe Prüfstelle zwingend | **NEIN** |
| Hersteller-Selbsterklärung ausreichend | **JA** — die Erklärung; die Durchführung muss stattgefunden haben |
| Im Verfahren nachreichbar | **NEIN** |
| Erst nach Aufnahme relevant | **NEIN** |

**Status:** `EXTERNAL_EVIDENCE_REQUIRED` — bestätigt im Sinne „außerhalb der
Technik" (Testpersonen), **nicht** im Sinne „externes Institut".
**Zeitliche Klassifizierung: A.**

---

## 10. VS-02 — Anwenderbetreuung / 24-Stunden-Frist

**Interne ID:** `AK-VS-02`
Der Auftrag fragt: steht „24 Stunden" in der DiPAV oder nur im Leitfaden?
**In der DiPAV — Verordnungsrang.**

**Fundstelle — Anlage 2 DiPAV, Themenfeld III Nr. 8** (zu § 6 Abs. 5), wörtlich:

> „Ja, der Hersteller stellt zur Unterstützung der Pflegebedürftigen und der
> weiteren Nutzer eine kostenlose deutschsprachige Anwenderbetreuung • bei der
> Bedienung der digitalen Pflegeanwendung und • zur Beantwortung von Anfragen
> **spätestens innerhalb von 24 Stunden** zur Verfügung."

Die Spalte „zulässige Begründung für ‚nicht zutreffend'" ist bei Nr. 8 **leer**
— es gibt keinen vorgesehenen Ausweg über ein „nicht zutreffend". Verbleibt nur
§ 6 Abs. 10 S. 2/3 (gleichwertige abweichende Umsetzung mit Begründung), was für
eine reine Fristangabe praktisch kein Weg ist.

**Neue Entlastung aus dem Leitfaden v1.3, Kap. 3.6.2 (S. 69f.)** — bisher nicht
erfasst:

> „Die DiPAV fordert, dass der Hersteller innerhalb von 24 Stunden auf Anfragen
> **reagiert** und der anfragenden Person eine auf die Frage zugeschnittene
> **Rückmeldung** (und idealerweise auch schon eine Antwort) zu der Anfrage gibt."

und, auf die ausdrücklich gestellte FAQ nach Wochenenden und Feiertagen:

> „Es muss innerhalb von 24 Stunden eine **Rückmeldung** auf die Anfrage der
> Nutzenden erfolgen. In welchem Format ist prinzipiell nicht vorgegeben, jedoch
> sollte das Format dem Inhalt der Anfrage, der Funktion der DiPA sowie der
> Nutzendengruppe angemessen sein."

**Korrektur gegenüber dem bisherigen Bericht:** Geschuldet ist eine
**zugeschnittene Rückmeldung**, nicht zwingend die fertige Antwort. Kein
Telefon-Bereitschaftsdienst gefordert, kein Format vorgeschrieben. Das senkt die
zu treffende Personalentscheidung erheblich — sie bleibt eine Entscheidung der
Geschäftsführung, aber eine kleinere als bisher dargestellt.

| Prüffrage | Antwort |
|---|---|
| Für unsere Zweckbestimmung anwendbar | **JA** |
| Antragseinreichung ohne Nachweis möglich | **NEIN** — Erklärung nach § 6 Abs. 11 |
| Aufnahme ohne Nachweis möglich | **NEIN** |
| Externe Prüfstelle zwingend | **NEIN** |
| Hersteller-Selbsterklärung ausreichend | **JA** |
| Im Verfahren nachreichbar | **NEIN** |
| Erst nach Aufnahme relevant | **NEIN** |

**Status:** `EXTERNAL_EVIDENCE_REQUIRED` — bestätigt (Entscheidung der
Geschäftsführung, kein Dienstleister).
**Zeitliche Klassifizierung: A.**

---

## 11. VS-04 — Nutzungsbedingungen / AGB-Rechtsprüfung

**Interne ID:** `AK-VS-04`

**Zu trennen sind zwei Dinge:**

**(a) Vertragsbedingungen als DiPA-Anforderung — DiPAV § 6 Abs. 3 Satz 2**,
wörtlich: DiPA müssen vor Beginn der Nutzung Zugang geben „zur
Gebrauchsanweisung und zu kurzen, einfachen sowie allgemeinverständlichen
Informationen zu Funktionsumfang und Zweckbestimmung …, zu Einweisungen,
Anleitungen und Schulungen sowie **zu den vertraglichen Bedingungen der
Zurverfügungstellung und Nutzung**". Konkretisiert in Anlage 2, Themenfeld III
Nr. 1, 2, 6, 7. Das ist Klasse **A** und intern erfüllbar.

**(b) Anwaltliche Prüfung der Selbstzahler-AGB** — dafür gibt es **keine
Fundstelle** in DiPAV, SGB XI oder Leitfaden. Es ist reines Zivil- und
AGB-Recht und betrifft ohnehin Produkt A (Selbstzahler), nicht die DiPA-Aufnahme;
DiPAV § 2 Abs. 4 verlangt für die DiPA selbst gerade einen **kostenfreien**
Zugang für das BfArM, und PflegeCoach ist für Endnutzer kostenlos.

| Prüffrage | Antwort |
|---|---|
| Für unsere Zweckbestimmung anwendbar | **(a) JA / (b) NEIN** |
| Antragseinreichung ohne Nachweis möglich | (a) **NEIN** / (b) **JA** |
| Aufnahme ohne Nachweis möglich | (a) **NEIN** / (b) **JA** |
| Externe Prüfstelle zwingend | **NEIN** |
| Hersteller-Selbsterklärung ausreichend | (a) **JA** |
| Im Verfahren nachreichbar | **NEIN** (a) |
| Erst nach Aufnahme relevant | (b) — erst wenn der Selbstzahler-Weg geöffnet wird |

**Status:** `EXTERNAL_EVIDENCE_REQUIRED` — bestätigt für (b).
**Zeitliche Klassifizierung: E — EMPFOHLEN, ABER KEINE ZWINGENDE
VORAUSSETZUNG** für den DiPA-Antrag. *(Der Teilaspekt (a) ist bereits über
VS-01/VS-03 und die Anlage-2-Erklärung abgedeckt.)*

---

## 12. REG-04 — Vergütung und Abrechnungsweg

**Interne ID:** `AK-REG-04`
Hier liegen die deutlichsten Sachfehler des bisherigen Berichts.

**Fundstelle 1 — SGB XI § 40b Abs. 1**, wörtlich:

> „Bewilligt die Pflegekasse die Versorgung mit einer oder mehreren digitalen
> Pflegeanwendungen, so hat die pflegebedürftige Person Anspruch auf 1. die
> Erstattung von Aufwendungen für digitale Pflegeanwendungen nach § 40a bis zur
> Höhe von insgesamt **40 Euro** im Kalendermonat und 2. ergänzende
> Unterstützungsleistungen durch ambulante Pflegeeinrichtungen nach § 39a bis
> zur Höhe von insgesamt **30 Euro** im Kalendermonat."

**Korrektur 1:** Die Matrix zitierte „§ 40a Abs. 1a SGB XI (70-€-Deckel
gesetzlich)". Das ist **die falsche Norm**. Richtig ist § 40b Abs. 1 SGB XI, und
es sind **zwei getrennte Beträge** — 40 € für die DiPA, 30 € für die ergänzenden
Unterstützungsleistungen. Es gibt keinen einheitlichen 70-€-Topf, aus dem sich
beides frei bedienen ließe.

**Fundstelle 2 — SGB XI § 78a Abs. 1 Satz 1:** Der GKV-Spitzenverband
**vereinbart mit dem Hersteller innerhalb von drei Monaten nach Aufnahme einen
Vergütungsbetrag**; bei Uneinigkeit entscheidet eine Schiedsstelle.

**Korrektur 2:** Die Katalognotiz, es gebe „KEINE individuell verhandelte
Herstellervergütung", ist falsch. § 78a Abs. 1 SGB XI sieht genau eine solche
Verhandlung vor. Die 40 €/30 € sind der **Leistungsanspruch der versicherten
Person**, nicht ein Ersatz für die Verhandlung.

**Fundstelle 3 — Leitfaden v1.3, Kap. 5.3.1 (S. 112)**, neu und praktisch
wichtig:

> „Durch das am **01.01.2026 in Kraft getretene BEEP** können
> Vergütungsverhandlungen zwischen DiPA-Herstellern und Kostenträgern durch die
> Neuregelung des § 78 Absatz 1 Satz 2 SGB XI in Verbindung mit der Änderung des
> § 40a Absatz 2 Satz 1 SGB XI **bereits vor und während des Antragsverfahrens**
> auf Aufnahme ins DiPA-Verzeichnis geführt werden. Durch die Änderung kann der
> Prozess der Vergütungsverhandlung und der DiPA-Antragsstellung parallelisiert
> werden, indem die Vertragspartner den Zeitpunkt des Wirksamwerdens der
> Vergütungsvereinbarung selbst festlegen."

**Korrektur 3:** Die Aussage „erst nach Aufnahme verhandelbar" ist seit dem
01.01.2026 überholt. Die Verhandlung **darf** vorgezogen werden — sie **muss**
es nicht, und sie ist keine Antragsvoraussetzung.

| Prüffrage | Antwort |
|---|---|
| Für unsere Zweckbestimmung anwendbar | **JA**, aber erst im Erstattungsweg |
| Antragseinreichung ohne Nachweis möglich | **JA** |
| Aufnahme ohne Nachweis möglich | **JA** |
| Externe Stelle zwingend | **JA** — GKV-SV im Einvernehmen mit der BaGüS |
| Hersteller-Selbsterklärung ausreichend | entfällt |
| Im Verfahren nachreichbar | entfällt |
| Erst nach Aufnahme relevant | **JA** — mit der neuen Option, vorzuziehen |

**Status:** `EXTERNAL_EVIDENCE_REQUIRED` — bestätigt.
**Zeitliche Klassifizierung: D — ERST NACH AUFNAHME / FÜR VERGÜTUNG RELEVANT.**

*Keine Preise erfunden: 40 € und 30 € sind gesetzliche Höchstbeträge des
Leistungsanspruchs, keine von uns festgelegten Zahlen. Ein Vergütungsbetrag für
PflegeCoach existiert nicht und wird hier nicht behauptet.*

---

## 13. REG-05 — BfArM-Beratung

**Interne ID:** `AK-REG-05`
Der Auftrag fragt: ist die Beratung wirklich nur empfohlen? **Ja.**

**Fundstelle 1 — DiPAV § 22 Abs. 1**, wörtlich: „Das Bundesinstitut … berät
Hersteller digitaler Pflegeanwendungen **auf deren Anfrage** vor Einreichung des
Antrags … insbesondere zum Verfahrensablauf sowie zu den mit dem Antrag
vorzulegenden Angaben und Nachweisen."

**Fundstelle 2 — Leitfaden v1.3, Kap. 5.5.1 (S. 117)**:

> „**Aus der Beratung ergibt sich keine rechtliche Bindung des BfArM** an die
> geäußerten Hinweise und Rechtsauffassungen … Antragsstellenden steht es frei,
> ein schriftliches Protokoll … der Beratung zu erstellen. … Sofern ein Protokoll
> erstellt wurde, **sollte dies bei einem späteren Antrag … beigelegt werden**."

**Fundstelle 3 — Leitfaden Kap. 5.5.3 / DiPAV § 26 Abs. 1**: „Die Beratung kann
je nach Art und Umfang der Fragestellung mit **Gebühren in Höhe von 250 bis
5.000 Euro** verbunden sein." Bei geringfügigen Auskünften wird nach § 26 Abs. 2
DiPAV in der Regel von einer Gebühr abgesehen.

Zwei Punkte, die die Matrix nicht enthielt: die **Gebührenspanne** (Gesetzestext,
keine erfundene Zahl) und die Möglichkeit, ein **Beratungsprotokoll dem Antrag
beizulegen**. Ausdrücklich als Beratungsgegenstand genannt (Kap. 5.5.1): ob
zunächst die vorläufige Aufnahme empfohlen wird, und Fragen des
Evaluationskonzepts — also genau NN-01.

| Prüffrage | Antwort |
|---|---|
| Für unsere Zweckbestimmung anwendbar | **JA** |
| Antragseinreichung ohne Nachweis möglich | **JA** |
| Aufnahme ohne Nachweis möglich | **JA** |
| Externe Stelle zwingend | **NEIN** (freiwillig) |
| Hersteller-Selbsterklärung ausreichend | entfällt |
| Im Verfahren nachreichbar | entfällt |
| Erst nach Aufnahme relevant | **NEIN** — der Nutzen liegt gerade davor |

**Status:** `EXTERNAL_EVIDENCE_REQUIRED` — bestätigt (Behördentermin).
**Zeitliche Klassifizierung: E.** Weiterhin der Punkt mit der höchsten
Hebelwirkung pro Aufwand.

---

## 14. BF-01 — Barrierefreiheit (Selbsterklärung)

**Interne ID:** `AK-BF-01`

**Fundstelle 1 — DiPAV § 6 Abs. 6**: „Digitale Pflegeanwendungen setzen die
Anforderungen an die Barrierefreiheit um." Näheres nach § 6 Abs. 10 in Anlage 2.

**Fundstelle 2 — Anlage 2 DiPAV, Themenfeld IV**:

- **Nr. 13** (§ 6 Abs. 6): „die digitale Pflegeanwendung bietet Bedienhilfen für
  pflegebedürftige Menschen mit Einschränkungen oder unterstützt die durch die
  Plattform angebotenen Bedienhilfen. **Insbesondere werden die aktuellsten
  Empfehlungen der DIN EN ISO 9241-171-Normenfamilie berücksichtigt.**"
- **Nr. 14**: „bietet allen Nutzern **auf mehr als eine Art** die Möglichkeit,
  auf der Benutzeroberfläche visuelle und die Interaktionsmöglichkeiten
  betreffende Anpassungen vorzunehmen."
- **Nr. 15**: „bietet Informationen **auf mehr als eine Art der Interaktion** an."

**Fundstelle 3 — Leitfaden v1.3, Kap. 3.6.3.2 (S. 73)**:

> „DiPA müssen daher wenigstens die Anforderungen an Barrierefreiheit nach
> Maßgabe der Anlage 2 DiPAV erfüllen … **Der Hersteller hat dies zu
> bestätigen.** … Hier **bietet** die DIN EN ISO 9241-171 … – vor allem der
> Anhang D und die Checkliste in Anhang C – dem Hersteller **Unterstützung**."

**Bestätigt:** Es ist eine Selbsterklärung, keine Prüfstelle. Die Klasse-D→C-
Korrektur des Vorgängerdurchgangs war richtig.

**Präzisierung gegenüber dem bisherigen Bericht:** Die Matrix führte als
„echten Rest", der Normtext der DIN EN ISO 9241-171 sei kostenpflichtig und ohne
ihn sei keine belastbare Abgleichdokumentation möglich. Regulatorisch ist das zu
streng formuliert: Anlage 2 Nr. 13 verlangt, dass die Empfehlungen
„berücksichtigt" werden, und der Leitfaden bezeichnet die Norm als
**Unterstützung**, nicht als Prüfmaßstab. Der Normkauf bleibt eine sinnvolle
Qualitätsmaßnahme, ist aber **keine Rechtspflicht**. Die tatsächlich zu
erklärenden Sachverhalte sind Nr. 13, 14 und 15 — und Nr. 15 („Informationen auf
mehr als eine Art der Interaktion") ist ein Produktmerkmal, das unabhängig vom
Normtext nachzuweisen ist.

| Prüffrage | Antwort |
|---|---|
| Für unsere Zweckbestimmung anwendbar | **JA** |
| Antragseinreichung ohne Nachweis möglich | **NEIN** — Erklärung nach § 6 Abs. 11 |
| Aufnahme ohne Nachweis möglich | **NEIN** |
| Externe Prüfstelle zwingend | **NEIN** |
| Hersteller-Selbsterklärung ausreichend | **JA** |
| Im Verfahren nachreichbar | **NEIN** |
| Erst nach Aufnahme relevant | **NEIN** |

**Status:** `PARTIAL` — bestätigt.
**Zeitliche Klassifizierung: A.**

---

## 15. BF-03 — Screenreader-Durchgang

**Interne ID:** `AK-BF-03`

**Fundstellensuche, Ergebnis:** In DiPAV, Anlage 1 DiPAV, Anlage 2 DiPAV,
SGB XI § 78a und dem DiPA-Leitfaden v1.3 kommt der Begriff **Screenreader nicht
vor**. Es gibt keine Norm, die einen Screenreader-Durchgang als eigenständigen
Nachweis verlangt. Der nächstliegende Anknüpfungspunkt ist Anlage 2 IV Nr. 15
(Informationen auf mehr als eine Art der Interaktion) und die Erläuterung im
Leitfaden Kap. 3.6.3.2 (S. 73), wonach der Hersteller Vorkehrungen treffen
sollte, „die eine alternative Rezeption ausgegebener Informationen, der
Navigation, der Identifikation von Benutzungsschnittstellenelementen … und die
Steuerung auf auditivem oder taktilem Weg ermöglichen".

Ein manueller VoiceOver/NVDA-Durchgang ist die naheliegende **Prüfmethode** für
BF-01/Nr. 15 — er ist **nicht selbst die Anforderung**. Damit ist BF-03 ein
eigener QS-Standard, kein Regulierungspunkt.

| Prüffrage | Antwort |
|---|---|
| Für unsere Zweckbestimmung anwendbar | **JA** als Prüfmethode, **NEIN** als eigenständige Rechtspflicht |
| Antragseinreichung ohne Nachweis möglich | **JA** |
| Aufnahme ohne Nachweis möglich | **JA** |
| Externe Prüfstelle zwingend | **NEIN** |
| Hersteller-Selbsterklärung ausreichend | **JA** |
| Im Verfahren nachreichbar | **JA** |
| Erst nach Aufnahme relevant | **NEIN** |

**Status:** `PARTIAL` — bestätigt.
**Zeitliche Klassifizierung: E.** *(Bisher implizit wie ein Pflichtnachweis
behandelt — das war zu streng.)*

---

## Zusammenfassung der zeitlichen Klassifizierung

| # | ID | Status | Zeitklasse | Externe Stelle zwingend |
|---|---|---|---|---|
| 1 | SEC-01 | EXTERNAL_EVIDENCE_REQUIRED | **A** | JA — BSI-Prüfstelle |
| 2 | SEC-04 | EXTERNAL_EVIDENCE_REQUIRED | **A** | faktisch (Teil von SEC-01) |
| 3 | SEC-05 | EXTERNAL_EVIDENCE_REQUIRED | **A** | JA — DAkkS-akkreditiert |
| 4 | DS-02 | EXTERNAL_EVIDENCE_REQUIRED | **A** | NEIN |
| 5 | DS-04 | EXTERNAL_EVIDENCE_REQUIRED | **A** | NEIN (Vertragspartner) |
| 6 | QI-01 | EXTERNAL_EVIDENCE_REQUIRED | **A** | NEIN |
| 7 | QI-02 | EXTERNAL_EVIDENCE_REQUIRED | **A** (über NN-01) | NEIN |
| 8 | NN-01 | EXTERNAL_EVIDENCE_REQUIRED | **A** | JA — CRO/Institut |
| 9 | BF-02 | EXTERNAL_EVIDENCE_REQUIRED | **A** | NEIN |
| 10 | VS-02 | EXTERNAL_EVIDENCE_REQUIRED | **A** | NEIN |
| 11 | BF-01 | PARTIAL | **A** | NEIN |
| 12 | REG-04 | EXTERNAL_EVIDENCE_REQUIRED | **D** | JA — GKV-SV |
| 13 | REG-05 | EXTERNAL_EVIDENCE_REQUIRED | **E** | NEIN (freiwillig) |
| 14 | VS-04 | EXTERNAL_EVIDENCE_REQUIRED | **E** | NEIN |
| 15 | BF-03 | PARTIAL | **E** | NEIN |

**Klasse B (vor Aufnahme, nicht vor Antrag) und Klasse C (im Verfahren
nachreichbar) sind unter den 15 Punkten nicht belegt.** Das ist das zentrale
Ergebnis dieses Durchgangs: Es gibt keine Zwischenstufe. Die DiPAV kennt für
Antragsunterlagen nur die Ergänzungsfrist aus § 78a Abs. 5 S. 2 SGB XI (drei
Monate nach Aufforderung durch das BfArM), und § 15 Satz 2 DiPAV verschließt
sogar die freiwillige Nachbesserung: „Eine Änderung oder Ergänzung der
Antragsangaben ist nach Antragstellung **nur noch auf Anforderung** des
Bundesinstituts … möglich."

---

## Was der Katalog weiterhin nicht abdeckt

Unverändert gegenüber der Matrix vom 15.08.2026: die Prüfkriterien für den
**Datenschutz** nach DiPAV § 5 Abs. 2 Nr. 2 → § 78a Abs. 8 SGB XI, nachzuweisen
nach § 8 Abs. 4 DiPAV. Der Erklärungs-Fallback ist hier **offen** (§ 8 Abs. 4
S. 4 DiPAV; Leitfaden Kap. 3.3: Zertifikatspflicht wird „mit hinreichendem
zeitlichem Vorlauf eingefordert werden, wenn dies technisch und organisatorisch
möglich ist"). Heute kein Blocker. Bei der nächsten Katalogpflege als
**AK-DS-08** aufzunehmen; die 48er-Zählung bleibt in diesem Durchgang bewusst
unverändert.

---

## Ergebnis

### 1.–5. Zählstand (unverändert — kein Punkt wechselte den Status)

```
PASS_INTERNAL                     33 / 48
EXTERNAL_EVIDENCE_REQUIRED        13 / 48
PARTIAL                            2 / 48
FAIL                               0 / 48
UNVERIFIED                         0 / 48
```

Die Prüfung hat **Fundstellen, Zuständigkeiten und Zeitpunkte** korrigiert, nicht
den Erfüllungsstand. Das ist das ehrliche Ergebnis: Wo eine Anforderung schärfer
oder milder ist als gedacht, ändert das den Weg dorthin — nicht die Tatsache,
dass wir sie noch nicht erfüllt haben.

### 6. Antrag HEUTE technisch einreichbar: **JA**

Das elektronische Antragsverfahren nach § 78a Abs. 4 S. 1 SGB XI / § 1 Abs. 1
DiPAV steht offen; ein Antrag könnte gestellt werden.

### 7. Antrag HEUTE formal einreichbar: **NEIN**

Es fehlen elf Pflichtbestandteile der Klasse A. Insbesondere macht das fehlende
TR-03161-Zertifikat den Antrag seit dem 01.07.2025 **formal unvollständig**
(Leitfaden Kap. 3.4). Rechtsfolge: § 78a Abs. 5 S. 2/3 SGB XI — Ergänzungsfrist
von drei Monaten, danach Ablehnung. Gebühren nach §§ 24 ff. DiPAV fallen an.

### 8. Aufnahme HEUTE möglich: **NEIN**

Leitfaden Kap. 3.4, wörtlich: „Eine Aufnahme einer DiPA in das DiPA-Verzeichnis
ohne Vorlage des Zertifikats ist nicht möglich."

### 9. Echte Pflichtunterlagen VOR Antrag (Klasse A) — 11 Punkte

| Punkt | Was konkret fehlt | Beschaffbar durch |
|---|---|---|
| **SEC-01** | TR-03161-Zertifikat (Teile 2 und 3) | BSI-anerkannte Prüfstelle |
| **SEC-04** | Penetrationstest der beantragten Produktversion, inkl. Code-Review und Whitebox | im Rahmen von SEC-01 |
| **SEC-05** | ISO-27001-Zertifikat auf den Hersteller, DAkkS-akkreditiert | Zertifizierungsstelle |
| **NN-01** | Evaluationskonzept | herstellerunabhängiges wissenschaftliches Institut / CRO |
| **QI-02** | validiertes Messinstrument bzw. Literatur-Review + Eigenvalidierung | im Rahmen von NN-01 |
| **QI-01** | pflegefachliche Freigabe der 12 Module | eigene Pflegefachkraft |
| **BF-02** | formative Evaluation (analytisch möglich) + summative Validierung + Befragung + Fokusgruppe | intern, mit Testpersonen |
| **BF-01** | Bestätigung Anlage 2 IV Nr. 13/14/15 | intern |
| **VS-02** | Betriebszusage 24-Stunden-Rückmeldung | Geschäftsführung |
| **DS-02** | abgeschlossene DSFA | intern |
| **DS-04** | gegengezeichnete AVV-Kette, ohne SCC-Drittstaatenkonstruktion | Vertragspartner |

### 10. Unterlagen, die nachgereicht werden können (Klasse C): **keine**

Unter den 15 geprüften Punkten gibt es keine. Die einzige Nachreichmöglichkeit
ist die Ergänzungsfrist auf **Aufforderung** des BfArM (§ 78a Abs. 5 S. 2
SGB XI); § 15 S. 2 DiPAV schließt die eigeninitiative Ergänzung aus. Auf diesen
Weg zu planen wäre fahrlässig — er ist die Reaktion auf einen bereits
unvollständigen Antrag.

### 11. Unterlagen erst vor Aufnahme (Klasse B): **keine**

Kein geprüfter Punkt fällt in dieses Fenster. Bei der DiPA fallen
Antragsvollständigkeit und Aufnahmevoraussetzung praktisch zusammen.

### 12. Unterlagen erst nach Aufnahme / für Vergütung (Klasse D): **1 Punkt**

- **REG-04** — Vergütungsverhandlung mit dem GKV-SV, § 78a Abs. 1 S. 1 SGB XI,
  innerhalb von drei Monaten nach Aufnahme. Seit dem 01.01.2026 (BEEP) auch vor
  und während des Antragsverfahrens führbar — als Option, nicht als Pflicht.

### 13. Nur empfohlene Punkte (Klasse E): **3 Punkte**

- **REG-05** — BfArM-Beratung (§ 22 DiPAV, „auf Anfrage", 250–5.000 €). Klärt
  SEC-01-Scope, NN-01-Design, QI-02-Instrument, INT-02-MIO-Frage und REG-04 in
  einem Termin; Protokoll kann dem Antrag beigelegt werden.
- **VS-04** — anwaltliche AGB-Prüfung des Selbstzahler-Wegs. Kein DiPA-Bezug.
- **BF-03** — manueller Screenreader-Durchgang. Prüfmethode zu BF-01, kein
  eigenständiger Rechtsnachweis.

### 14. Korrigierte Fehlannahmen gegenüber dem bisherigen Bericht

| # | Punkt | Bisher | Richtig | Wirkung |
|---|---|---|---|---|
| 1 | Quelle | DiPAV unter `BJNR622800023` | **`BJNR156800022`** | die zitierte URL lieferte 404 |
| 2 | **SEC-01** | Erklärungsweg geschlossen, hergeleitet aus Marktlage und BfArM-Webseite | wörtlich im Leitfaden v1.3 Kap. 3.4, mit **zweitem Datum 01.07.2025** (formale Antragsvollständigkeit) | Beleg statt Herleitung; ein Stichtag mehr |
| 3 | **SEC-04** | Primärquelle „DiPAV § 8 Abs. 3 S. 5" | Satz 5 ist **nicht einschlägig** (gilt nur auf dem geschlossenen Erklärungsweg); tragend ist Leitfaden **Kap. 3.4.2** | Fundstelle korrigiert |
| 4 | **SEC-04** | Prüfstelle zwingend | „**soll** vorrangig von BSI zertifizierten Teststellen" — SOLL | Anforderung milder als notiert |
| 5 | **SEC-05** | „verbindlicher als bisher notiert", ohne Zeitpunkt | Leitfaden Kap. 3.4.1: „**muss bei der Antragstellung** … vorweisen" | **dritter Eingangsblocker**, bisher nicht auf dem kritischen Pfad |
| 6 | **DS-02** | Blocker „juristische Schlussbewertung" | keine externe Stelle gefordert; Erklärung nach Anlage 1 **DiGAV** genügt (§ 8 Abs. 4 DiPAV) | Blocker milder; intern lösbar |
| 7 | **DS-04** | Anlage-Zuordnung offen | läuft über **Anlage 1 DiGAV**, nicht Anlage 1 DiPAV; zusätzlich: **SCC nach Art. 46 DSGVO für DiPA unzulässig** | neue harte Schranke für die Dienstleisterwahl |
| 8 | **QI-02** | Fundstelle „Leitfaden Kap. 4.5.1" | richtig **Kap. 4.3.2**; Lizenzfrage FES-I/BSFC-s/SUS ist **Urheberrecht, keine DiPAV-Anforderung** | Punkt entschärft, Ausweg über Literatur-Review + Pretest dokumentiert |
| 9 | **NN-01** | „Gesetzesrang, Erprobungsweg umgeht es nicht" | bestätigt, ergänzt: **kein akkreditierter Prüfer nötig**, CRO genügt, marktübliche Vergütung ausdrücklich zulässig | Beschaffung einfacher als gedacht |
| 10 | **BF-02** | „Testpersonen fehlen", alle vier Punkte empirisch | **Nr. 2 lässt Cognitive Walkthrough ohne Testpersonen zu**; die Fünf-Personen-Zahl in Nr. 3 ist ein „sollte" mit Begründungsoption | ein Viertel des Aufwands entfällt |
| 11 | **VS-02** | „Antwort binnen 24 h", Wochenend-/Feiertagsbereitschaft | Leitfaden Kap. 3.6.2: geschuldet ist eine **zugeschnittene Rückmeldung**, Format frei | Personalentscheidung deutlich kleiner |
| 12 | **BF-01** | „ohne gekauften DIN-Normtext keine belastbare Dokumentation" | Anlage 2 Nr. 13 verlangt „berücksichtigt"; Leitfaden nennt die Norm **Unterstützung** | Normkauf sinnvoll, aber **keine Rechtspflicht** |
| 13 | **BF-03** | implizit als Pflichtnachweis geführt | **Screenreader kommt in keiner Rechtsquelle vor** — reine Prüfmethode | Klasse E |
| 14 | **REG-04** | „§ 40a Abs. 1a SGB XI, 70-€-Deckel" | **§ 40b Abs. 1 SGB XI: 40 € DiPA + 30 € eUL**, zwei getrennte Beträge | falsche Norm, falsche Struktur |
| 15 | **REG-04** | „KEINE individuell verhandelte Herstellervergütung" | **§ 78a Abs. 1 S. 1 SGB XI sieht genau diese Verhandlung vor**, mit Schiedsstelle | Sachfehler |
| 16 | **REG-04** | „erst nach Aufnahme verhandelbar" | seit **BEEP, 01.01.2026** vor und während des Antragsverfahrens möglich | neue Option |
| 17 | **REG-05** | „freiwillig, gebührenpflichtig" | ergänzt: **250–5.000 €** (§ 26 Abs. 1 DiPAV), Protokoll dem Antrag beilegbar | konkret planbar |
| 18 | Systematik | Anlagen unscharf geführt | **drei verschiedene Anlagen**: Anlage 1 DiPAV (Sicherheit/QMS), Anlage 2 DiPAV (Qualität), Anlage 1 DiGAV (Datenschutz) | häufigste Fehlerquelle der Aktenlage |

---

## Keine Aussage über Zulassung

PflegeCoach ist **nicht** in das DiPA-Verzeichnis aufgenommen und hat **keine**
DiPA-Zulassung. Es besteht **kein** Vergütungsanspruch gegenüber Pflegekassen.
Das Produkt ist für Endnutzer **kostenlos**. `COACH_DIPA_MODUS` bleibt per
Default `false`. Dieser Bericht dokumentiert ausschließlich den Abstand zu den
Voraussetzungen, nicht deren Erfüllung.

---

*Erstellt 15.08.2026. Alle Zitate stammen aus den oben genannten Fassungen und
gelten nur gegen diese. Bei jeder neuen Fassung von DiPAV, SGB XI, SGB V,
TR-03161 oder DiPA-Leitfaden ist dieser Bericht erneut vorzulegen (AK-REG-01).*
