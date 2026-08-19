# DiPA / PflegeCoach — die 14 offenen Katalogpunkte, klassifiziert und abgearbeitet

**Stand:** 19.08.2026 · **Grundlage:** `lib/coach/anforderungskatalog.ts` (48 Anforderungen),
Prüflauf `npm run dipa:katalog`

> **Keine Zulassungsaussage.** Eine Aufnahme des PflegeCoach in das Verzeichnis für digitale
> Pflegeanwendungen liegt **nicht** vor. Keine Pflegekasse zahlt für dieses Produkt, und es ist
> keine Vergütung vereinbart. Der PflegeCoach ist **dauerhaft kostenlos für Endnutzer**.
> `COACH_DIPA_MODUS` steht auf `false` und bleibt es bis zu einer Listung.

## Ausgangslage

```
Anforderungen gesamt:   48
erfüllt:                34
in Arbeit:               6   ┐
offen:                   8   ┘ = die 14 Punkte dieses Berichts
belastbare Quote:       71 %
```

Alle 48 Anforderungstexte sind gegen die Originaldokumente geprüft; 102 Nachweisdateien
existieren. Der Katalogstand ist damit belastbar — er beschönigt nicht und er dramatisiert nicht.

---

## Die Klassifikation im Überblick

| Kategorie | Bedeutung | Punkte |
|---|---|---|
| **A** | Intern technisch noch lösbar — sofort weiterarbeiten | **0** (siehe Erläuterung) |
| **B** | GF-Entscheidung | **3** — AK-VS-02, AK-DS-02, AK-BF-03 |
| **C** | Externer regulatorischer Blocker (Behörde/Zertifizierung) | **5** — AK-SEC-01, AK-SEC-04, AK-SEC-05, AK-REG-04, AK-REG-05 |
| **D** | Externer Vertrags-/Provider-Blocker | **6** — AK-DS-04, AK-BF-02, AK-QI-01, AK-QI-02, AK-NN-01, AK-VS-04 |

### Warum Kategorie A leer ist — und was trotzdem gebaut wurde

Kein einziger der 14 Punkte lässt sich durch Programmieren **schließen**. Das ist keine Ausrede,
sondern das Ergebnis: Was übrig ist, sind Zertifikate, Unterschriften, Fachprüfungen und
Entscheidungen. Ein Punkt, der als „erfüllt" gemeldet würde, weil Code dazu existiert, wäre eine
Falschaussage gegenüber dem BfArM.

Es gab aber **internen technischen Rest** an drei Punkten — nicht die Erfüllung, sondern die
Vorrichtung, die die Erfüllung nachweisbar macht und die Zwischenzeit ehrlich hält. Dieser Rest
ist in dieser Sitzung gebaut und getestet (Abschnitt „Umgesetzt"). Er bewegt die Quote bewusst
nicht: 34/48 vorher, 34/48 nachher.

---

## Die 14 Punkte im Einzelnen

Legende Zeitklasse: **A** = muss vor Antragstellung vorliegen · **D** = erst nach Aufnahme ·
**E** = empfohlen, keine zwingende Voraussetzung.

### B — GF-Entscheidung (3)

#### AK-VS-02 · Erreichbarer Herstellersupport, Reaktion binnen 24 Stunden
*Zeitklasse A · Anlage 2 DiPAV, Themenfeld III Nr. 8*

**Zu entscheiden:** Über welche Kanäle Anfragen entgegengenommen werden; Abdeckung an
Wochenenden und Feiertagen (die Frist kennt keine Ausnahme); Vertretungsregelung für Urlaub und
Krankheit; wer die Rückmeldung fachlich verantwortet; wo die Zusage steht.

**Umfang der Entscheidung — kleiner als bisher dargestellt.** Der BfArM-Leitfaden v1.3 Kap. 3.6.2
verlangt eine *zugeschnittene Rückmeldung* binnen 24 Stunden, nicht die fertige Antwort. Kein
Format ist vorgeschrieben, kein Telefonsupport, kein Bereitschaftsdienst.

**Befund dieser Sitzung.** Auf `/pflegecoach/anfrage` stand „Wir melden uns in der Regel innerhalb
von zwei Werktagen". Das war (a) eine veröffentlichte Reaktionszusage ohne hinterlegten Beschluss
und (b) mit der 24-Stunden-Frist unvereinbar, weil „Werktage" Wochenenden ausnehmen. Der Satz ist
entfernt.

**Nächste Aktion:** Entscheidung treffen und in `lib/coach/support.ts` als `SUPPORT_ZUSAGE`
eintragen. Sobald der Eintrag vollständig ist, erzeugt die Oberfläche den Fristsatz von allein —
niemand muss Text auf Seiten nachziehen.

#### AK-DS-02 · Datenschutz-Folgenabschätzung
*Zeitklasse A · Art. 35 DSGVO; verfahrensseitig Anlage 1 DiGAV über DiPAV § 8 Abs. 4 Satz 4*

**Zu entscheiden:** Bestätigung und Unterschrift der Geschäftsführung unter die vorliegende DSFA.

Die DSFA ist inhaltlich fertig (`audit/dipa/dsfa_pflegecoach.md`, inkl. Risikomatrix und
Kopplungsverbot-Analyse). **Regulatorisch ist keine externe Stelle vorgeschrieben** — die DSFA
führt der Verantwortliche selbst durch. Eine anwaltliche Schlussbewertung wäre ein selbst
gesetzter Qualitätsmaßstab, keine Rechtspflicht.

**Nächste Aktion:** Dokument lesen, zeichnen, Datum und Unterzeichnenden eintragen. Muss vor der
Anlage-1-DiGAV-Erklärung vorliegen.

#### AK-BF-03 · Screenreader-Durchgang
*Zeitklasse E · in keiner Rechtsquelle als Pflicht benannt*

**Zu entscheiden:** Termin und Person. Sonst nichts.

Der maschinell entscheidbare Teil ist erledigt: `e2e/pflegecoach-axe.spec.ts` läuft axe-core über
`cat.aria`, `cat.name-role-value`, `cat.structure` und `cat.semantics` und prüft gezielt
eindeutige Dokumenttitel, `html-lang`, und ein lebendes Sprungziel (S1–S3). Die Punkte S4 bis S8 —
Verständlichkeit der Ansagen, Zeitpunkt von Live-Regionen, Richtigkeit von Alternativtexten,
Vorlesereihenfolge, Fokusfallen — sind maschinell nicht entscheidbar. Ein Screenreader-Nachweis
ohne gelaufenen Screenreader wäre ein erfundener Nachweis.

**Nächste Aktion:** Eine Person, ein Termin, VoiceOver oder NVDA, Ergebnis in
`audit/dipa/screenreader_ergebnisprotokoll_vorlage.md` eintragen. Intern leistbar, kein externer
Akteur nötig.

---

### C — Externer regulatorischer Blocker (5)

#### AK-SEC-01 · Zertifikat nach BSI TR-03161
*Zeitklasse A · **Eingangsblocker** · Stelle: nach ISO/IEC 17065 akkreditierte Prüfstelle*

Seit 01.07.2025 ist der Erklärungsweg geschlossen; ohne Zertifikat ist der Antrag formal
unvollständig. Vorhanden ist eine Selbsteinschätzung (`audit/dipa/tr03161_checkliste.md`) — kein
Zertifikat. **Nicht nachreichbar.**

**Nächste Aktion:** Prüfstelle auswählen und beauftragen. Vorher die C5-Frage klären (siehe
AK-SEC-05) — sie gehört in den Prüfscope, nicht hinterher.

#### AK-SEC-04 · Externer Penetrationstest
*Zeitklasse A · **in AK-SEC-01 enthalten***

BfArM-Leitfaden v1.3 Kap. 3.4.2 wörtlich: durch die Zertifizierung nach TR-03161 entfällt die
Notwendigkeit eines zusätzlichen Pen-Tests. SEC-01 und SEC-04 sind **ein** Beschaffungsvorgang.

**Nächste Aktion:** Keine eigene. Nicht separat beauftragen — die Beauftragungsunterlage
(`audit/dipa/pentest_beauftragung_scope.md`) dient dem Scope-Gespräch mit der Prüfstelle.

#### AK-SEC-05 · Informationssicherheits-Managementsystem
*Zeitklasse A · **Eingangsblocker** · Stelle: DAkkS-akkreditierte Zertifizierungsstelle (ISO 27001)*

BSI TR-03161-3 O.Org_1 fordert es als MUSS und ist über DiPAV § 5 Abs. 2 Nr. 1 → § 78a Abs. 7
SGB XI verbindlich. Der frühere Vorbehalt („nur im nicht bindenden Leitfaden") war falsch.

**Offene Risikofrage, vor der Beauftragung zu klären:** Weder Supabase noch Vercel besitzen ein
BSI-C5-Testat. Beide haben SOC 2 Type II und ISO 27001 — ob das als „vergleichbares Testat"
i. S. v. O.Org_2 genügt, ist ungeklärt. SOC 2 ist nach C5GleichwV **nicht** gleichwertig; ab
01.07.2027 gilt nur noch C5 Typ 2. Supabase läuft auf AWS Frankfurt (AWS hat C5), aber das
AWS-Testat deckt Supabase als darauf aufbauenden Dienst nicht automatisch ab.

**Nächste Aktion:** Diese Frage in den BfArM-Beratungstermin (AK-REG-05) oder direkt an die
TR-03161-Prüfstelle — **bevor** die Prüfung beauftragt wird. Zusätzlich in den ISMS-Scope
aufzunehmen: Monitoring mit Alarmierung (O.Org_3/O.Org_4) und Notfallvorsorgekonzept (O.Org_5).

#### AK-REG-04 · Vergütung und Abrechnungsweg
*Zeitklasse D · Stelle: GKV-Spitzenverband · § 78a Abs. 1 SGB XI*

Erst nach Aufnahme relevant; seit dem BEEP (01.01.2026) kann die Verhandlung vorgezogen werden —
Option, keine Antragsvoraussetzung. Für den PflegeCoach existiert **kein** vereinbarter
Vergütungsbetrag (`HERSTELLERVERGUETUNG.vereinbarterBetragEuro: null`).

Zur Einordnung der Beträge: § 40b Abs. 1 SGB XI gewährt der pflegebedürftigen Person 40 € (DiPA,
§ 40a) **und** 30 € (ergänzende Unterstützungsleistungen, § 39a) je Kalendermonat — zwei getrennte
Töpfe, kein 70-€-Deckel. Das ist der Leistungsanspruch der versicherten Person, keine
Herstellervergütung.

**Nächste Aktion:** Zurückstellen. Der Abrechnungsweg ist fail-closed gebaut
(`coach_abrechnungswege.verguetung_geklaert`), es stehen keine Beträge im Code.

#### AK-REG-05 · Formaler BfArM-Beratungstermin
*Zeitklasse E · Stelle: BfArM · DiPAV § 22 („auf Anfrage")*

Nicht verpflichtend, aber **die höchste Hebelwirkung im ganzen Katalog**: klärt in einem Zug den
TR-03161-Scope und die C5-Frage (AK-SEC-01/05), den Vergütungsanteil (AK-REG-04),
AK-INT-02 und AK-QI-02. Fragen 1–20 sind vorbereitet
(`docs/dipa/external-readiness/BFARM_BERATUNG_PAKET.md`).

**Nächste Aktion:** Termin anfragen. Günstigster nächster Schritt insgesamt — er kostet nichts
und macht mehrere teure Beauftragungen zielsicher.

---

### D — Externer Vertrags-/Provider-Blocker (6)

#### AK-DS-04 · Auftragsverarbeitungs-Kette
*Zeitklasse A · Provider: alle eingesetzten Dienstleister (u. a. Hosting, Datenbank)*

Die Kette ist erhoben, die Abschluss-Checkliste steht (`audit/dipa/avv_dossier_pflegecoach.md`) —
**unterzeichnet ist nichts.**

**Harte Randbedingung:** Standardvertragsklauseln (Art. 46 DSGVO) sind für DiPA **unzulässig**
(DiPAV § 5 Abs. 4). Eine AVV-Kette mit SCC-Drittstaatstransfer ist nicht heilbar — der
Dienstleister muss ersetzt werden. Das ist **vor** der Auswahl zu prüfen, nicht hinterher.

**Nächste Aktion:** Je Dienstleister AVV anfordern, auf Drittstaatstransfer prüfen, zeichnen. Wo
nur SCC angeboten wird: Ersatz suchen.

#### AK-BF-02 · Gebrauchstauglichkeit mit der Zielgruppe
*Zeitklasse A · Externe: repräsentative Testpersonen aus der Zielgruppe*

Die **formative** Runde ist abgeschlossen: Cognitive Walkthrough über 9 Kernaufgaben, 0 kritische
Befunde, 5 UNSICHER-Befunde (alle gering, UX-Optimierungen). Nach Anlage 2 IV Nr. 2 ist das
analytische Verfahren ausdrücklich zulässig.

**Nicht ersetzbar:** summative Validierung (Nr. 3) mit mindestens 5 repräsentativen Testpersonen,
Online-Befragung (Nr. 10), Fokusgruppen-Test (Nr. 12). Der Durchführungsplan steht.

**Nächste Aktion:** Testpersonen gewinnen (5+). Kein Dienstleister zwingend nötig — aber echte
Menschen aus der Zielgruppe.

#### AK-QI-01 · Pflegefachliche Prüfung und Freigabe der Inhalte
*Zeitklasse A · Externe: pflegefachlich qualifizierte Person*

**Wichtig für die Beauftragung:** Anlage 2 ist ein **Selbsterklärungs**-Fragebogen (DiPAV § 6
Abs. 11). Es ist **keine** Zertifizierungsstelle vorgeschrieben — gebraucht wird eine
pflegefachlich qualifizierte Person, die die Freigabe verantwortet. Das kann eine Fachkraft aus
dem eigenen Netz sein.

**Bestand:** 10 Inhalte (4 Übungen, 5 Wissensmodule, 1 Checkliste), alle im Status `entwurf`. Die
im Katalog genannte Zahl „12 Module" stammte aus einem Bericht, nicht aus dem Bestand; sie ist
korrigiert.

**Nächste Aktion:** Fachkraft benennen, `audit/dipa/inhalte_pruefdossier.md` mit ihr durchgehen,
Ergebnis in `INHALTE_FREIGABEN` (`lib/coach/inhalte-freigabe.ts`) eintragen.

#### AK-QI-02 · Validierte bzw. lizenzierte Erhebungsinstrumente
*Zeitklasse A, über AK-NN-01*

Betrifft das **Messinstrument des Nutzennachweises**, nicht Erhebungsinstrumente als
Produktfunktion. Der Leitfaden entlastet ausdrücklich: ohne geeignetes validiertes Instrument darf
ein eigenes erstellt werden, dessen Gütekriterien per Pretest an einer kleinen Gruppe zu prüfen
sind — „eine vollständige Validierungsstudie ist in beiden Kontexten nicht zwingend erforderlich".

Das produkteigene 7-Item-Kurzinstrument ist im Produkt und im FHIR-Export als **nicht validiert**
gekennzeichnet; lizenzpflichtige Instrumente übertragen nur Summenwerte.

**Nächste Aktion:** Gehört in das Evaluationskonzept (AK-NN-01), nicht separat zu beauftragen.

#### AK-NN-01 · Wissenschaftliches Evaluationskonzept
*Zeitklasse A · **Eingangsblocker** · Externe: Studienpartner + Ethikkommission*

§ 78a Abs. 6a Satz 2 Nr. 3 SGB XI — dem Antrag beizufügen. Vorhanden:
`audit/dipa/evaluationskonzept.md`. Fehlen: Studienpartner und Ethikvotum. **Nicht nachreichbar.**

**Nächste Aktion:** Wissenschaftliche Einrichtung ansprechen (Pflegewissenschaft/Versorgungs-
forschung). Das Ethikvotum hat den längsten Vorlauf im ganzen Katalog — zuerst anstoßen.

#### AK-VS-04 · Nutzungsbedingungen für den Selbstzahler-Weg
*Zeitklasse E · Externe: Kanzlei (AGB-Prüfung)*

Entwurf mit 13 Paragrafen und Prüfliste liegt vor, **nicht wirksam**. Der Bestellweg ist technisch
gesperrt (`COACH_PREISE_FREIGEGEBEN=false`), und der PflegeCoach ist dauerhaft kostenlos.

**Nächste Aktion:** Zurückstellen. Erst relevant, wenn der Selbstzahler-Weg jemals aufgehen soll —
solange er gesperrt ist, gibt es keinen Vertrag, den die Bedingungen regeln müssten.

---

## Umgesetzt in dieser Sitzung (der interne technische Rest)

Drei Vorrichtungen, alle **fail-closed**, alle mit Tests. Keine bewegt die Quote — sie machen die
offenen Punkte belastbar statt behauptbar.

### 1. `lib/coach/support.ts` — Register für die Antwortzusage (zu AK-VS-02)

Eine veröffentlichte Reaktionszeit ist eine bindende Zusage. Bisher konnte sie als Satz auf einer
Seite entstehen — genau so war die „zwei Werktage"-Zusage entstanden, nicht böswillig, sondern
weil ein hilfreicher Satz keinen Ort hatte, an dem er hätte auffallen können.

- `SUPPORT_ZUSAGE = null` — solange nichts beschlossen ist, zeigt die Oberfläche einen Text
  **ohne jede Frist**, auch ohne „in der Regel" oder „zeitnah".
- `pruefeSupportZusage()` weist eine Zusage ab, die länger als 24 h ist, Wochenenden ausnimmt,
  keine Vertretung, keinen Urheber, kein Datum oder keine Fundstelle hat.
- Ein Test durchsucht die gesamte Coach-Oberfläche nach Fristzusagen, die am Register vorbeigehen.

**13 Tests, alle grün.**

### 2. `lib/coach/inhalte-freigabe.ts` — Freigabe an einen Nachweis gebunden (zu AK-QI-01)

Bisher war `pruefstatus: 'fachlich_freigegeben'` ein Wort in `inhalte.ts`. Wer es hinschrieb,
hatte die Freigabe erteilt — ohne Prüferin, ohne Qualifikation, ohne Protokoll, und ohne Bezug auf
*die Fassung*, die geprüft wurde. Ein Text konnte danach beliebig geändert werden und trug den
Vermerk weiter.

- Ein Vermerk braucht Prüferrolle, **pflegefachliche Qualifikation**, Prüfdatum, Protokollverweis
  und einen **Inhaltsstempel** der geprüften Fassung.
- Ändert sich der Text, passt der Stempel nicht mehr und der Inhalt fällt automatisch auf
  `entwurf` zurück — mit sichtbarem Hinweis in der Oberfläche.
- `INHALTE_FREIGABEN` ist leer; die drei Inhaltsseiten lesen den Status jetzt aus dem Register
  statt aus dem Literal.

Der Stempel hat **keinen kryptografischen Anspruch** — wer das Register ändern kann, kann ihn neu
berechnen. Er schützt gegen das Versehen: die Formulierung, die nach der Prüfung „nur schnell
noch" verbessert wurde. **12 Tests, alle grün.**

### 3. Fail-closed-Default beim EDIFACT-Dateiindikator (Simulationscheck 1.4)

`generateEDIFACT()` und `UNB()` setzten ohne ausdrückliche Angabe `'2'` (Echtdatei). Der einzige
Produktivaufrufer setzt den Wert immer korrekt — der Default griff nur im Vergessensfall, und
dann wäre die Vergesslichkeit zur Forderung gegen eine Kasse geworden. Jetzt `'0'`.
**101 EDIFACT-Tests grün.** Einzelheiten: `docs/SIMULATIONSCHECK_2026-08-19.md`.

---

## Was den Antrag heute blockiert

Von den 14 Punkten liegen **11 in Zeitklasse A** — sie müssen bei Antragstellung vorliegen und
sind nach DiPAV § 15 Satz 2 **nicht eigeninitiativ nachreichbar**. Die DiPAV kennt keine
Zwischenstufe: nachgereicht wird nur auf Aufforderung des BfArM (§ 78a Abs. 5 Satz 2 SGB XI, drei
Monate, sonst Ablehnung).

Drei davon sind **Eingangsblocker** — ohne sie ist der Antrag formal unvollständig:

1. **AK-SEC-01** — TR-03161-Zertifikat
2. **AK-SEC-05** — ISMS-Zertifikat (ISO 27001, DAkkS-akkreditiert)
3. **AK-NN-01** — Evaluationskonzept mit Studienpartner und Ethikvotum

**Ein BfArM-Antrag ist derzeit nicht einreichbar.** Das ändert nichts am Betrieb: der PflegeCoach
läuft als kostenloses Angebot ohne Kassenbezug, und alle zulassungsgebundenen Schalter stehen auf
`false`.

## Empfohlene Reihenfolge

| # | Schritt | Kategorie | Warum zuerst |
|---|---|---|---|
| 1 | BfArM-Beratungstermin anfragen (AK-REG-05) | C | kostenlos, klärt SEC-01-Scope, C5-Frage, REG-04, QI-02 in einem Zug |
| 2 | Studienpartner + Ethikvotum anstoßen (AK-NN-01) | D | längster Vorlauf im Katalog |
| 3 | DSFA zeichnen (AK-DS-02) | B | eine Unterschrift, Voraussetzung für die Anlage-1-Erklärung |
| 4 | Support-Entscheidung treffen (AK-VS-02) | B | eine Entscheidung, Umsetzung danach automatisch |
| 5 | AVV-Kette auf SCC prüfen und zeichnen (AK-DS-04) | D | ein SCC-Fund erzwingt einen Dienstleisterwechsel — je später, desto teurer |
| 6 | Pflegefachkraft für die Inhaltsfreigabe gewinnen (AK-QI-01) | D | keine Zertifizierungsstelle nötig, Register steht bereit |
| 7 | ISMS + TR-03161 gemeinsam beauftragen (AK-SEC-05, -01, -04) | C | ein Vorgang, nicht drei; erst nach Schritt 1 |
| 8 | Testpersonen für die summative Runde (AK-BF-02) | D | 5+ Personen aus der Zielgruppe |
| 9 | Screenreader-Durchgang terminieren (AK-BF-03) | B | intern leistbar, Protokollvorlage steht |
| — | AK-QI-02, AK-REG-04, AK-VS-04 | C/D | zurückgestellt: gehen in anderen Punkten auf oder sind erst nach Aufnahme relevant |

---

## Prüfbefehle

```
npm run dipa:katalog                                  # 48 Anforderungen, Nachweise, Quote
npx tsx --test lib/coach/support.test.ts              # Antwortzusage
npx tsx --test lib/coach/inhalte-freigabe.test.ts     # Inhaltsfreigabe
npx vitest run __tests__/simulationscheck.test.ts     # Simulationscheck
```
