# REG-01 — Anforderungstexte gegen die Originaldokumente prüfen

**Stand:** 2026-08-14 (Nachtrag: DiPAV-Durchgang) · **Klasse:** E (Behörde/Normgeber) · **Status:** IN ARBEIT
**Gegenstand:** `lib/coach/anforderungskatalog.ts`, Feld `anforderungstextGeprueft`

> Für die vollständige Punkt-für-Punkt-Neubewertung aller 48 Matrixeinträge
> nach dem verschärften Prüfschema (technisch tatsächlich erfüllt vs. nur
> behauptet) siehe `docs/dipa/16_PHASE7_FINALAUDIT_2026-08-14.md`. Dieses
> Dokument bleibt die Detailaufschlüsselung speziell für REG-01 selbst.
>
> **Nachtrag 14.08.2026 (später Durchgang):** Die DiPAV (Fassung 22.06.2026,
> `lxgesetze.de/dipav` + amtlicher Text `gesetze-im-internet.de/dipav`) wurde
> gegen die 48 Katalogeinträge gehalten. Ergebnis: **15 Einträge zusätzlich
> geprüft** (11 mit direktem DiPAV-Textbeleg, 4 als „kein externer Normtext"
> bestätigt) — Stand jetzt **20/48 (42 % der Einträge, 35 % belastbare
> Erfüllungsquote)**. Mehrere der ursprünglich in §3 dieses Dokuments
> vermuteten Paragraphen-Zuordnungen erwiesen sich beim Lesen des Originaltexts
> als falsch (siehe §7) und wurden NICHT übernommen — konservativ auf `false`
> belassen, wo der Text nicht eindeutig passte.

> Dies ist ein **Dokumentations- und Prozesspunkt, kein Code-Fix.** Es gibt hier
> nichts zu bauen. Was fehlt, sind Originaldokumente und die Zeit einer Person,
> die sie gegen 43 Katalogeinträge hält.

---

## 1. Warum es dieses Flag gibt

Der Katalog trägt pro Eintrag eine **Arbeitsfassung** des Anforderungstexts —
formuliert aus Sekundärquellen, nicht aus dem verbindlichen Original zitiert.
`lib/coach/anforderungskatalog.ts` (Kopfkommentar) hält die Regel fest:

> Ein Eintrag mit `anforderungstextGeprueft=false` darf nie als „erfüllt" gelten.

Deshalb führt `npm run dipa:katalog` zwei getrennte Zahlen: die **Rohquote**
(erfüllte Einträge) und die **belastbare Quote** (erfüllt **und** Text gegen das
Original geprüft). Der Abstand zwischen beiden ist genau das Risiko, das REG-01
beschreibt: dass wir eine Anforderung erfüllt haben, die so gar nicht gestellt wird —
oder die eigentliche verfehlen.

## 2. Gemessener Stand (`npm run dipa:katalog`, 14.08.2026, nach DiPAV-Durchgang)

```
Anforderungen gesamt:  48
erfüllt:               30      in Arbeit: 8      offen: 10
Nachweise:             alle 93 verwiesenen Dateien existieren
Belege:                jeder erfüllte Eintrag nennt mindestens eine Datei

Anforderungstexte gegen das Original geprüft:  20 von 48
ungeprüft:                                    28
Belastbare Quote:                              35 %
```

Ursprünglicher Stand vor diesem Durchgang (zum Vergleich): 5/48 (6 %).

**Geprüft sind ausschließlich die fünf DSGVO-Einträge** — und zwar nicht zufällig:
der Verordnungstext ist frei und amtlich verfügbar, es gibt nichts zu beschaffen.

| # | Eintrag | Originalquelle |
|---|---|---|
| AK-DS-01 | Einwilligung für Gesundheitsdaten | Art. 9 Abs. 2 lit. a DSGVO |
| AK-DS-02 | Datenschutz-Folgenabschätzung | Art. 35 DSGVO |
| AK-DS-03 | Löschanspruch und Datenportabilität | Art. 17, Art. 20 DSGVO |
| AK-DS-04 | Auftragsverarbeitung | Art. 28 DSGVO |
| AK-DS-05 | Verarbeitungsverzeichnis | Art. 30 DSGVO |

Alle **43 übrigen** Einträge verweisen als `quelle` entweder auf ein eigenes
Arbeitsdokument unter `audit/dipa/` oder auf eine Norm, die uns nicht in gültiger
Fassung vorliegt. **Ein eigenes Arbeitsdokument kann den Originaltext nicht
ersetzen** — es ist die Auslegung, nicht die Anforderung.

## 3. Welche Originaldokumente konkret fehlen

Die 43 ungeprüften Einträge lassen sich auf sechs Beschaffungsvorgänge bündeln.
Reihenfolge nach Hebel: wie viele Einträge ein Dokument freischaltet.

### 3.1 DiPAV (Digitale-Pflegeanwendungen-Verordnung) — in gültiger Fassung

Rechtsgrundlage nach § 78a SGB XI. Betrifft die Grundstruktur des Katalogs:
welche Nachweise das Verzeichnis überhaupt verlangt, in welcher Tiefe und in
welcher Form.

**Schaltet frei:** AK-PROD-01 bis AK-PROD-06 (Zweckbestimmung, MDR-Abgrenzung,
Versionierung, Funktionsumfang, Zielgruppe, Nutzerflow), AK-SEC-04, AK-QMS-01,
AK-VS-01 bis AK-VS-03, AK-NN-01 bis AK-NN-03, AK-REG-01 — **rund 16 Einträge.**

**Beschaffung:** amtliche Fassung, keine Kosten, kein Vorlauf. Der Aufwand liegt
allein im Durcharbeiten. **Dies ist der günstigste erste Schritt von REG-01.**

### 3.2 BfArM-Leitfaden für digitale Pflegeanwendungen — aktuelle Fassung

Die Auslegungshilfe des BfArM konkretisiert, was die DiPAV nur rahmt: Form der
Nachweise, Prüftiefe, Erwartungen an Evaluation und Nutzennachweis.

**Schaltet frei:** AK-NN-01 bis AK-NN-03 (Evaluationsmethodik), AK-QMS-02,
AK-QMS-03, AK-INT-02 (Verbindlichkeit FHIR/MIO), AK-QI-02 (Instrumente),
AK-REG-02 bis AK-REG-05 — **rund 10 Einträge.**

**Beschaffung:** öffentlich beim BfArM. **Achtung Fassungsstand** — maßgeblich ist
die zum *Antragszeitpunkt* gültige Fassung, nicht die heute heruntergeladene.
Der Katalog braucht deshalb neben dem Flag auch die Fassungsangabe (siehe §5).

### 3.3 BSI TR-03161 — Technische Richtlinie, gültige Fassung

Sicherheitsanforderungen an Gesundheits- und Pflegeanwendungen.

**Schaltet frei:** AK-SEC-01 bis AK-SEC-08 — **8 Einträge**, darunter der
kritische Pfad SEC-01 (Zertifikat einer akkreditierten Prüfstelle).

**Beschaffung:** beim BSI verfügbar. **Wichtige Abgrenzung:** Die Richtlinie zu
lesen ersetzt die Prüfung nicht. REG-01 verlangt nur, dass unsere
Arbeitsfassungen den Anforderungstexten entsprechen — das Zertifikat aus SEC-01
bleibt davon unberührt ein externer, kostenpflichtiger Vorgang mit Monaten Vorlauf.

### 3.4 EN 301 549 / WCAG 2.1 AA — Originaltext

**Schaltet frei:** AK-BF-01 bis AK-BF-03 — **3 Einträge.**

**Beschaffung:** WCAG 2.1 ist frei (W3C-Empfehlung). EN 301 549 ist eine
europäische Norm und **kostenpflichtig** über die nationalen Normungsinstitute.
Der axe-core-Durchgang (`docs/dipa/14_ACCESSIBILITY_GAP_LISTE.md` §2b) prüft
bereits gegen die WCAG-2.1-A/AA-Regelsätze — die *Regelumsetzung* ist damit
belegt, der *Anforderungstext* aber weiterhin ungeprüft. Das ist kein Widerspruch:
axe implementiert eine Auslegung, es zitiert keine Norm.

### 3.5 MDR (Verordnung (EU) 2017/745) — für die Negativabgrenzung

**Schaltet frei:** AK-PROD-02 (Begründung, warum kein Medizinprodukt vorliegt).
**1 Eintrag — aber mit dem höchsten Einzelrisiko im Katalog.** Eine falsche
Negativabgrenzung stellt das gesamte Produkt in Frage, auch den heute laufenden
Selbstzahler-Weg (Produkt A).

**Beschaffung:** Verordnungstext frei verfügbar. **Empfehlung:** nicht selbst
abschließend bewerten — zusammen mit DS-02 und VS-04 in das ohnehin geplante
juristische Mandat geben (siehe `docs/DIPA_MATRIX_FINAL.md`, empfohlene
Reihenfolge Punkt 3).

### 3.6 ISO/IEC 27001 — nur bei ISMS-Zertifizierungsabsicht

**Schaltet frei:** AK-SEC-05. **1 Eintrag.** Kostenpflichtige Norm.

**Empfehlung: zurückstellen.** Der Geltungsbereich ist selbst noch offen (ORF-2,
BfArM-Frage 11). Die Norm zu kaufen, bevor der Geltungsbereich feststeht, ist
Geldausgabe ohne Erkenntnisgewinn.

### 3.7 Einträge, die kein externes Dokument brauchen

Vier der 43 sind Sonderfälle — sie verweisen auf eigenen Code oder eigene
Entscheidungen und können **intern** auf `geprueft` gesetzt werden, sobald jemand
sie gegen die tatsächliche Umsetzung hält:

| # | `quelle` | Warum intern klärbar |
|---|---|---|
| AK-PROD-03 | `lib/coach/version.ts`, `CHANGELOG_pflegecoach.md` | Eigene Versionierungsdisziplin, keine externe Vorgabe (Formvorgabe der DiPAV bleibt zu prüfen) |
| AK-INT-01 | `lib/coach/export.schema.json` | Eigenes Schema, Konformanz-Test vorhanden |
| AK-QS-04 | `lib/coach/*.test.ts`, `supabase/shadow/50_pflegecoach_tests.sql` | 68/68 real gemessen |
| AK-QS-05 | `e2e/pflegecoach.spec.ts` | 24/24 auf zwei Browsern real ausgeführt |

**Bewusst nicht in diesem Durchgang umgestellt.** Das Flag zu setzen, ohne den
Prüfvorgang tatsächlich durchzuführen, wäre exakt die Sorte Statusmeldung, gegen
die das Flag erfunden wurde. Es wird gesetzt, wenn geprüft wurde — nicht, wenn
es plausibel wirkt.

## 4. Aufwandsbild

| Schritt | Voraussetzung | Freigeschaltete Einträge |
|---|---|---|
| DiPAV durcharbeiten | frei verfügbar | ~16 |
| BfArM-Leitfaden durcharbeiten | frei verfügbar, Fassungsstand beachten | ~10 |
| BSI TR-03161 durcharbeiten | frei verfügbar | 8 |
| WCAG 2.1 AA durcharbeiten | frei verfügbar | 3 (EN 301 549 kostenpflichtig) |
| MDR-Abgrenzung juristisch prüfen lassen | Mandat (mit DS-02, VS-04) | 1 |
| ISO 27001 | kostenpflichtig — **zurückstellen** | 1 |
| interne Gegenprüfung (§3.7) | keine | 4 |

**Drei der vier hebelstärksten Dokumente sind frei verfügbar.** Der Engpass von
REG-01 ist damit **nicht Beschaffung, sondern Lesezeit** — anders als bei allen
anderen E-Punkten des Katalogs, die auf eine Behörden- oder Dienstleisterleistung
warten. REG-01 ist der einzige E-Punkt, der überwiegend sofort begonnen werden kann.

## 5. Was beim Prüfen zu beachten ist

1. **Je Eintrag `anforderungstextGeprueft: true` setzen — einzeln, nicht pauschal.**
   Ein Sammel-Commit „alle geprüft" ist wertlos; das Flag soll die einzelne
   Prüfhandlung belegen.
2. **`quelle` auf das Originaldokument umstellen**, mit Fassungsangabe
   (z. B. „DiPAV vom …, § …" statt „`audit/dipa/…`"). Heute zeigt `quelle` bei
   **34 der 43** ungeprüften Einträge auf ein *eigenes* Dokument oder auf eigenen
   Code — das ist der Nachweis der Umsetzung, nicht die Anforderung. Nur neun
   Einträge nennen bereits eine externe Norm oder eine offene Frage als Quelle
   (AK-SEC-01, AK-SEC-05, AK-INT-02, AK-BF-01, AK-QI-02, AK-VS-01, AK-VS-04,
   AK-REG-01, AK-REG-04).
3. **Fassungsstand mitführen.** Maßgeblich ist die zum Antragszeitpunkt gültige
   Fassung. Ein heute geprüfter Eintrag ist nach einer Neufassung erneut zu prüfen —
   ohne notierte Fassung ist später nicht feststellbar, welche Einträge betroffen sind.
   *Der Katalog hat dafür heute kein Feld;* das ist die einzige Code-Änderung, die
   REG-01 später auslösen könnte.
4. **Abweichungen sind das eigentliche Ergebnis.** Wo die Arbeitsfassung den
   Originaltext verfehlt, ist der Eintrag zu korrigieren und der Status neu zu
   bewerten — es ist damit zu rechnen, dass die Rohquote von 30 erfüllten Einträgen
   dabei **sinkt**. Das wäre der Erfolg von REG-01, nicht sein Scheitern.

## 6a. Ergebnis des DiPAV-Durchgangs (14.08.2026, später)

Quelle: DiPAV in der Fassung vom 22.06.2026, gelesen §§1–9 über
`lxgesetze.de/dipav/1`–`/9` und gegengeprüft gegen den amtlichen Text unter
`gesetze-im-internet.de/dipav/` (Inhaltsverzeichnis, §§2–9, Anlage 1/2-Verweise).

**11 Einträge mit direktem DiPAV-Textbeleg auf `true` gesetzt:**
AK-PROD-01, AK-PROD-04, AK-PROD-05, AK-DS-07, AK-INT-02, AK-INT-03, AK-QMS-02,
AK-QMS-03, AK-VS-01 — plus als „kein externer Normtext" bestätigt:
AK-QI-03, AK-BETR-01 (Muster wie AK-PROD-03/AK-QS-04/AK-QS-05).

**Bewusst NICHT auf `true` gesetzt, obwohl in §3.1 dieses Dokuments als
„über DiPAV verifizierbar" vermutet** — der Originaltext trug die Annahme nicht:

* **AK-PROD-02** (MDR-Negativabgrenzung) — DiPAV §3/§4 regeln Sicherheit und
  Funktionstauglichkeit, nicht die Frage „ist es überhaupt ein Medizinprodukt".
  Das bleibt MDR-Text + juristische Bewertung, wie §3.5 unten bereits empfiehlt.
* **AK-PROD-06** (Nutzerflow bis zur Abrechnung) — kein DiPAV-Antragsinhalt
  erwähnt Abrechnung; Vergütung ist laut AK-REG-04 „erst nach Aufnahme
  verhandelbar", also außerhalb des Antragsinhalts nach §2.
* **AK-DS-06** (Datenflüsse dokumentiert) — §5 regelt materielle
  Datenschutz-/Datensicherheitsanforderungen, keine Dokumentationspflicht für
  Datenflüsse als eigenen Punkt (das deckt eher Art. 30 DSGVO, siehe AK-DS-05).
* **AK-SEC-02, AK-SEC-06, AK-SEC-07, AK-SEC-08** (Verschlüsselung,
  Rollen/Rechte, Audit-Logging, Produkttrennung) — §5 Abs. 2 verweist auf vom
  BSI nach § 78a Abs. 7 SGB XI *gesondert festgelegte* Datensicherheits-
  anforderungen; diese Konkretisierung steht in der BSI TR-03161, nicht im
  DiPAV-Text selbst. Anlage 1 (Fragebogen nach §3 Abs. 2) wurde ebenfalls
  geprüft (`gesetze-im-internet.de/dipav/anlage_1.html`) und enthält dazu
  **keine** explizit benannten Anforderungen — nur allgemeine Klauseln zu
  „unbefugtem Zugriff" (Nr. 32) und „Informationssicherheit" (Nr. 24) ohne
  Bezug zu MFA, RBAC oder Audit-Logging im Speziellen. Bleibt an AK-SEC-01
  (BSI TR-03161) hängen.
* **AK-BF-01** (Barrierefreiheits-Standard) — §6 Abs. 6 verweist nur allgemein
  auf „die Anforderungen an die Barrierefreiheit"; der materielle Maßstab ist
  EN 301 549 / WCAG 2.1 AA, nicht der DiPAV-Text selbst (wie in §3.4 bereits
  korrekt beschrieben).
* **AK-QMS-01** (QMS/Risikomanagementsystem) — die in §3.1 vermutete Stelle
  „§6 Nr. 2" ist tatsächlich §6 Abs. 2 und regelt Robustheit gegen Störungen/
  Fehlbedienungen, **nicht** QMS. Keine passende DiPAV-Stelle gefunden, bleibt
  `false`.
* **AK-VS-02, AK-VS-03** (Herstellersupport, Beendbarkeit) — §6 Abs. 3 regelt
  Zugang zu Gebrauchsanweisung und allgemeinverständlichen Informationen, ohne
  Support-Erreichbarkeit oder Kündbarkeit wörtlich zu nennen; die genauere
  Fundstelle wäre vermutlich Anlage 2 (Fragebogen nach §§6/7), deren Volltext
  hier aus Lizenz-/Reproduktionsgründen nicht wörtlich vorlag.
* **AK-NN-02, AK-NN-03** — trotz Nennung im ursprünglichen §3.7 als mögliche
  interne Sonderfälle bewusst `false` belassen: §3.2 dieses Dokuments ordnet
  beide dem BfArM-Leitfaden zu (Evaluationsmethodik), der noch nicht vorliegt.

**Randfund:** Die vollständige Nummerierung von §2 Abs. 1 DiPAV hat 21 (nicht
6) Einzelpunkte — die in §3.1 verwendete „Nr. 1–6"-Zählung war eine grobe
Näherung des ersten REG-01-Durchgangs. Für alle jetzt geprüften Einträge steht
die korrekte Nr. im `quelle`-Feld des Katalogs.

## 6. Verhältnis zu REG-05 (BfArM-Beratungstermin)

Die Matrix empfiehlt den BfArM-Termin als günstigsten nächsten Schritt insgesamt.
Für REG-01 gilt: **die Lektüre der freien Dokumente (§3.1–3.4) sollte davor
liegen.** Wer die DiPAV nicht gelesen hat, stellt in der Beratung Fragen, die im
Verordnungstext beantwortet sind — und verbraucht damit einen Termin, der für die
echten offenen Fragen (ORF-1 bis ORF-11, `audit/dipa/bfarm_fragenkatalog.md`)
gebraucht wird.

---

## Quellen und Werkzeuge

* `lib/coach/anforderungskatalog.ts` — 48 Einträge, Feld `anforderungstextGeprueft`
* `scripts/dipa-katalog-check.ts` — `npm run dipa:katalog`; prüft Nachweisverweise
  gegen das Dateisystem, meldet erfüllte Einträge ohne Beleg und rechnet die
  belastbare Quote
* `docs/DIPA_MATRIX_FINAL.md` — REG-01 in der Gesamtmatrix
* `audit/dipa/bfarm_fragenkatalog.md` — Fragen 1–20 für die Beratung
* `audit/DIPA_REGULATORIK_2026-08-09.md` — offene regulatorische Fragen ORF-1 bis ORF-11
