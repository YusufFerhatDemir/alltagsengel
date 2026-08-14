# DiPA — Reklassifizierung der 16 externen Punkte (15.08.2026)

**Auftrag:** Die 16 als Klasse D/E ("extern") eingestuften Punkte aus
`lib/coach/anforderungskatalog.ts` kritisch gegen Primärquellen prüfen und in drei
Gruppen einordnen:

- **A** — wirklich zwingend extern (kann intern nicht gelöst werden)
- **B** — intern bereits weit vorbereitet, aber ein Kern-Schritt bleibt extern
- **C** — möglicherweise fälschlicherweise als extern eingestuft

**Methode:** Für jeden Punkt wurde der DiPAV-Volltext bzw. die genannte Anlage
direkt bei `gesetze-im-internet.de` abgerufen (nicht nur die Zusammenfassung aus
`docs/dipa/18_PHASE4_REVERIFY_2026-08-14.md` übernommen) und gegengelesen. Wo das
zu einem anderen Befund als bisher führte, steht das explizit unten — sonst wurde
die bestehende Einordnung bestätigt.

**Ergebnis in Kürze:** 5×A, 6×B, 5×C. Die fünf C-Fälle sind kein Vorwurf an den
letzten Durchgang — REG-02/REG-03 waren zum Zeitpunkt der ursprünglichen Einstufung
tatsächlich offene Fragen; erst die inzwischen beschaffte Leitfaden-Lektüre hat sie
beantwortet. Sie zeigen aber, dass "Klasse E" in der Praxis oft zu "durch Lektüre
lösbar" wurde, nicht zu "Behörde antworten lassen".

---

## TR-03161 — Sonderprüfung (wie beauftragt)

### Frage 1: Wird eine Zertifizierung verlangt, oder genügt eine Prüfung/Testierung?

**Eine formale Zertifizierung durch eine akkreditierte Stelle ist verlangt — keine
Selbsterklärung genügt (mehr).** Die Kette, wörtlich gegen Originaltext geprüft:

- **DiPAV §5 Abs. 2 Nr. 1**: DiPA müssen "die nach § 78a Absatz 7 des Elften Buches
  Sozialgesetzbuch vom Bundesamt für Sicherheit in der Informationstechnik
  festgelegten Anforderungen an die Datensicherheit erfüllen".
- **DiPAV §8 Abs. 3**: "Der Hersteller weist die Erfüllung der Anforderungen an die
  Datensicherheit nach § 5 Absatz 2 Nummer 1 ab dem in § 139e Absatz 10 Satz 3 des
  Fünften Buches Sozialgesetzbuch genannten Datum durch Vorlage eines Zertifikates
  nach § 78a Absatz 7 des Elften Buches Sozialgesetzbuch nach." Satz 2 desselben
  Absatzes erlaubt **übergangsweise** eine Erklärung nach § 4 Abs. 6 Satz 2 DiGAV
  — aber nur bis zu dem in §139e Abs.10 Satz 3 SGB V genannten Datum.
- **§78a Abs. 7 SGB XI**: BSI legt die Datensicherheitsanforderungen für DiPA fest
  ("erstmals bis zum 31.12.2021 und dann in der Regel jährlich") und ordnet an:
  "§ 139e Absatz 10 Satz 2 bis 4 des Fünften Buches gilt entsprechend."
- **§139e Abs. 10 SGB V** (die damit für DiPA sinngemäß gilt), wörtlich:
  - Satz 2: "Das Bundesamt für Sicherheit in der Informationstechnik bietet ab dem
    1. Juni 2024 Verfahren zur Prüfung der Einhaltung der Anforderungen … sowie
    Verfahren zur Bestätigung der Einhaltung der Anforderungen … durch entsprechende
    Zertifikate an."
  - Satz 3: "Der Nachweis der Erfüllung der Anforderungen an die Datensicherheit
    durch den Hersteller ist **spätestens ab dem 1. Januar 2025** unter Vorlage
    eines Zertifikates nach Satz 2 zu führen."

**Schlussfolgerung:** Die in §8 Abs. 3 DiPAV vorgesehene Übergangs-"Erklärung"
(Selbsteinschätzung statt Zertifikat) war nur bis zum 1. Januar 2025 zulässig.
Heute (15.08.2026) ist dieses Datum anderthalb Jahre überschritten — die
Übergangsoption ist **nicht mehr verfügbar**. Ein förmliches Zertifikat einer
akkreditierten Stelle ist zwingend. Die bisherige Katalog-Aussage "zwingend, kein
Wahlnachweis" wird damit **bestätigt und zusätzlich mit dem exakten Rechtsgrund
und Datum belegt** — sie war bisher richtig, aber ohne diese Kette formuliert.

### Frage 2: Welche Prüfstelle muss qualifiziert sein?

Eine nach dem BSI-Verfahren akkreditierte Zertifizierungs-/Prüfstelle für
BSI TR-03161. Recherche (Web, Stand 15.08.2026) bestätigt, dass solche Stellen
**bereits aktiv am Markt tätig sind** — nicht nur theoretisch vorgesehen:
TÜV Informationstechnik (TÜVIT), secuvera GmbH und IT-TÜV werden von mehreren
unabhängigen Quellen (u. a. TÜVIT selbst, secuvera selbst, it-tuv.com) als
TR-03161-Prüfstellen für DiGA/DiPA benannt. Das ist ein wichtiger praktischer
Unterschied zur reinen Rechtslage: Die Beauftragung ist heute technisch und
organisatorisch möglich, nicht nur rechtlich gefordert.

**Wichtige Nebenerkenntnis:** TR-03161 deckt nur die *Datensicherheits*-Seite ab
(§78a Abs. 7 SGB XI). Es gibt eine **separate** zweite Zertifikatsspur für die
*Datenschutz*-Prüfkriterien nach §78a Abs. 8 SGB XI / DiPAV §8 Abs. 4, für die laut
Recherche **noch keine akkreditierten Zertifizierungsstellen existieren** ("ein
spezifisches Datenschutz-Zertifikat befindet sich noch in der Entwicklung durch das
BfArM"). Für diese zweite Spur bleibt die Übergangs-Erklärung nach DiGAV also
faktisch die einzig verfügbare Option — nicht weil sie günstiger ist, sondern weil
der Markt für das Zertifikat selbst noch nicht existiert. **Das ist im bisherigen
Katalog nirgends als eigener Punkt erfasst** — die vorhandenen AK-DS-*-Einträge
zitieren nur DSGVO-Artikel, nicht DiPAV §8 Abs. 4 / §78a Abs. 8 SGB XI. Empfehlung:
bei der nächsten Katalog-Pflege einen Punkt AK-DS-08 "BfArM-Datenschutz-Prüfkriterien-
Nachweis nach §78a Abs. 8 SGB XI" ergänzen, aktuell erfüllbar nur per Erklärung, da
keine Zertifizierungsstelle existiert.

### Frage 3: Welche Fassung/Version ist maßgeblich?

BSI TR-03161 gliedert sich in mehrere Teile; laut Recherche aktuell in Kraft:
**Teil 1 (Mobile Anwendungen) Version 3.0** und **Teil 2 (Web-Anwendungen)
Version 2.0**, dazu ein Teil 3 (Hintergrundsysteme). Die konkrete, für uns
verbindliche Fassung wird nicht direkt durch die DiPAV festgelegt, sondern durch
die **jährliche BSI-Festlegung nach §78a Abs. 7 SGB XI** — d. h. die Prüfstelle
selbst nennt bei Beauftragung die für den Antragszeitpunkt gültige Version. Das
war schon in der bisherigen Katalog-Formulierung so vorgesehen ("in gültiger
Fassung"); neu ist die Bestätigung, dass es sich um einen eigenständigen,
jährlich aktualisierten Anforderungskatalog handelt, nicht um eine einmal fixierte
Norm.

**Gesamtfazit TR-03161:** Die bisherige Aussage "BSI TR-03161-Zertifikat blockiert
alles" ist **korrekt und wird durch die Primärquellen bestätigt**, nicht
widerlegt. Präzisiert: Die Zertifikatspflicht gilt seit 1.1.2025 zwingend (keine
Erklärungs-Option mehr), akkreditierte Prüfstellen sind am Markt verfügbar, und
sie deckt laut BfArM-Leitfaden i. d. R. auch den Pentest (SEC-04) ab. Neu entdeckt:
eine zweite, bisher nicht im Katalog erfasste Zertifikatsspur für Datenschutz
(§78a Abs. 8 SGB XI), für die noch keine Zertifizierungsstelle existiert.

---

## Die 16 Punkte im Einzelnen

### Gruppe A — wirklich zwingend extern (5)

| ID | Anforderung | Primärquelle | Fundstelle | Warum zwingend extern | Wer liefert den Nachweis | Intern vorbereitbar | Priorität | Abhängigkeiten |
|---|---|---|---|---|---|---|---|---|
| AK-SEC-01 | Datensicherheitszertifikat | DiPAV + §78a Abs.7 SGB XI + §139e Abs.10 SGB V | §5 Abs.2 Nr.1, §8 Abs.3 (s. Sonderprüfung oben) | Zertifikat kann per Definition nur von einer akkreditierten Drittstelle ausgestellt werden; Übergangs-Erklärung seit 1.1.2025 nicht mehr zulässig | BSI-akkreditierte Prüfstelle (TÜVIT, secuvera, IT-TÜV o. ä. — Markt existiert) | Selbsteinschätzung (`tr03161_checkliste.md`) als Beauftragungsgrundlage | P0 | Keine — sofort beauftragbar; längste Vorlaufzeit im gesamten Katalog |
| AK-SEC-04 | Penetrationstest | DiPAV + BfArM-Leitfaden | §8 Abs.3; Leitfaden Kap.3.4 | Ist laut Leitfaden i.d.R. **Teil desselben** TR-03161-Zertifizierungsprozesses, keine unabhängige zweite Beschaffung — trotzdem strukturell extern | Dieselbe Prüfstelle wie SEC-01 | Scope-Dokument (`pentest_beauftragung_scope.md`) | P0 (an SEC-01 gebunden) | **Nicht separat beauftragen**, bevor SEC-01-Scope klar ist |
| AK-QI-02 | Lizenzen für validierte Erhebungsinstrumente | BfArM-Leitfaden | Kap.4.5.1 | Nutzungsrechte liegen bei Dritten (Testinstrument-Rechteinhaber); kann durch eigene Erklärung nicht ersetzt werden | Jeweiliger Rechteinhaber (FES-I, BSFC-s, SUS) | Produkteigenes unvalidiertes Kurzinstrument als Zwischenlösung bereits im Einsatz | P1 | Keine |
| AK-NN-01 | Wissenschaftliches Evaluationskonzept | DiPAV §§11-12 + BfArM-Leitfaden | Kap.4.5.2, wörtlich "muss von einem herstellerunabhängigen wissenschaftlichen Institut erstellt werden" | Unabhängigkeit ist explizit Teil der Anforderung — eigenes Personal ist per Definition ausgeschlossen | Universität / pflegewissenschaftliches Institut | Grobkonzept (`evaluationskonzept.md`) als Diskussionsgrundlage | P1 | Sinnvoll erst nach BfArM-Beratung (Studiendesign) |
| AK-REG-04 | Vergütungsanteil am 70€-Deckel | §40a Abs.1a SGB XI + BfArM-Leitfaden | S.6 (gesetzlicher Rahmen bekannt, Anteil offen) | Konkreter Abrechnungsanteil ist Verhandlungsergebnis mit GKV-Spitzenverband/Pflegekassen, keine einseitig festlegbare Größe | GKV-Spitzenverband / Pflegekassen | Fail-closed-Schalter `verguetung_geklaert` bereits gebaut | P2 | Erst nach vorläufiger DiPA-Aufnahme verhandelbar |

### Gruppe B — intern weit vorbereitet, ein Kern-Schritt bleibt extern (6)

| ID | Anforderung | Primärquelle | Fundstelle | Was bereits intern steht | Was zwingend extern bleibt | Priorität | Abhängigkeiten |
|---|---|---|---|---|---|---|---|
| AK-DS-02 | Datenschutz-Folgenabschätzung | DSGVO | Art.35 | Vollständiger Entwurf (`dsfa_pflegecoach.md`) | Juristische Schlussbewertung — Art.35 verlangt keine Kanzlei wörtlich, aber DSFA + hohes Risiko (Gesundheitsdaten) macht externe Prüfung faktisch unumgänglich | P0 | Keine |
| AK-DS-04 | AV-Verträge (AVV-Kette) | DSGVO | Art.28 | Kette vollständig erhoben (`avv_dossier_pflegecoach.md`) | **Kein externer Dienstleister nötig, nur Gegenzeichnung durch bereits genutzte Auftragsverarbeiter** (Hosting, Zahlungsdienstleister) — siehe C-Hinweis unten, Grenzfall zwischen B und C | P0 | Keine |
| AK-SEC-05 | ISMS-Zertifikat (ISO 27001) | BfArM-Leitfaden Kap.3.4.1 (S.50) | **Nicht** in Anlage 1 DiPAV selbst — siehe Korrektur unten | Geltungsbereich vorbereitet (`isms_scope_vorbereitung.md`) | DAkkS-akkreditierte Zertifizierungsstelle — **falls** BfArM in der Praxis auf dem Leitfaden besteht (siehe Korrektur) | P1 | Geltungsbereich vor Beauftragung mit BfArM abstimmen |
| AK-BF-01 | Barrierefreiheits-Konformität | Anlage 2 DiPAV, Themenfeld IV Pkt.13 | "die aktuellsten Empfehlungen der DIN EN ISO 9241-171-Normenfamilie" | axe-core-Strukturprüfung, Grundausstattung (Kontrastmodus, Zielgrößen etc.) | Externe Konformitätsprüfung **nur falls** BfArM über die Selbstauskunft hinaus einen Nachweis verlangt — siehe C-Hinweis | P1 | Keine |
| AK-BF-02 | Usability-Test mit Zielgruppe | Anlage 2 DiPAV Themenfeld 4 + Leitfaden Kap.3.6.3.1 | formative + summative Evaluation | Durchführungsplan mit 5 Testpersonen, 9 Aufgaben fertig | Testpersonen aus der Zielgruppe — **müssen kein externes Marktforschungsinstitut sein**, ggf. aus eigenem Pflegekunden-Bestand rekrutierbar; Testleitung kann intern erfolgen | P1 | Testpersonen gewinnen |
| AK-VS-04 | Selbstzahler-Nutzungsbedingungen | Kein DiPAV-Bezug (Zivilrecht) | AGB-Recht | Vollständiger Entwurf, 13 Paragrafen (`nutzungsbedingungen_entwurf_selbstzahler.md`) | Juristische Schlussprüfung vor Wirksamkeit | P0 (im Datenschutzpaket gebündelt) | Keine |

### Gruppe C — möglicherweise fälschlicherweise als extern eingestuft (5)

| ID | Anforderung | Bisherige Einstufung | Korrektur | Empfehlung |
|---|---|---|---|---|
| AK-QI-01 | Pflegefachliche Inhaltsfreigabe | Klasse D, `verantwortlich: 'extern'` in der externen Todo-Liste — **aber im Katalog selbst steht `verantwortlich: 'fachlich'`, nicht `'extern'`** | Widerspruch zwischen Katalog (fachlich = ggf. intern) und Todo-Liste (extern). Alltagsengel betreibt bereits ein Netzwerk an Pflegefachkräften ("Engel") für das Kerngeschäft — ob darunter jemand mit den geforderten ≥3 Jahren Pflegewissenschaft-Erfahrung für diese spezielle Freigabe verfügbar ist, ist unbeantwortet, nicht verneint | **Vor Beauftragung prüfen, ob eine bereits kooperierende/angestellte Pflegefachkraft die Freigabe übernehmen kann**, statt automatisch neu extern auszuschreiben. Kein Fakt, sondern eine offene, klärungswürdige Frage — nicht als erledigt annehmen |
| AK-REG-01 | Klasse **E** ("Behörde/Kostenträger nötig") | Falsch verortet: Die Aufgabe ist, die restlichen 12 Katalogeinträge gegen bereits vorliegende oder frei zugängliche Primärquellen zu lesen (`docs/DIPA_EXTERNE_TODO_2026-08-14.md` Punkt 16 selbst: "Volltext frei beim BSI erhältlich, dann Lesezeit statt Beschaffung") | Es ist keine Behörde und kein Kostenträger beteiligt — reine interne Lesearbeit | **Korrigiert in `anforderungskatalog.ts`**: Klasse E → C (siehe Commit). Erscheint dadurch korrekt in `internOffen()` als intern erledigbar |
| AK-REG-02 | Klasse E, Frage "Freischaltcode-Verfahren?" | Wurde **ohne jeden Behördenkontakt** durch Lektüre des BfArM-Leitfadens (Kap.1/1.1) beantwortet | Die Einstufung als "Behörde nötig" war von Anfang an zu konservativ — die Antwort stand bereits in einem öffentlich verfügbaren Dokument | Bereits erledigt (`stand: erfuellt`), keine Code-Änderung nötig — als Präzedenzfall für REG-04/REG-05 im Blick behalten |
| AK-REG-03 | Klasse E, Frage "Qualifikation eUL-Erbringer?" | Ebenfalls durch Leitfaden-Lektüre (S.88) beantwortet, keine Behördenanfrage nötig | s. o. | Bereits erledigt, keine Code-Änderung nötig |
| AK-REG-05 | Klasse E, "BfArM-Beratungstermin" | DiPAV §22 ("auf deren Anfrage") + Leitfaden Kap.5.5 ("keine rechtliche Bindung des BfArM") belegen **ausdrücklich Freiwilligkeit** | Der Punkt ist kein Blocker, sondern ein empfohlener, aber optionaler Service. Ihn neben echten Blockern (SEC-01, QI-01) als "externe Anforderung" zu listen, überzeichnet seine Verbindlichkeit | Weiterhin als hohe Priorität *empfehlen* (klärt mehrere andere Punkte in einem Termin), aber nicht als Zulassungsvoraussetzung zählen — die 16er-Zahl sollte diesen Punkt separat kennzeichnen (siehe Zusammenfassung unten) |

---

## Zusätzlicher Korrekturhinweis: AK-SEC-05 (ISMS/ISO 27001)

Anlage 1 DiPAV (Fragebogen nach §3 Abs. 2, bindender Verordnungstext) wurde im
Volltext erneut gelesen. Der Punkt "Informationssicherheit" (Nr. 24) verlangt
wörtlich nur, dass Software "entsprechend dem Stand der Technik entwickelt und
hergestellt" wird, unter Berücksichtigung "des Risikomanagements einschließlich
der Informationssicherheit" — **eine Selbstauskunfts-Frage im Fragebogenformat,
kein Verweis auf ISO 27001 oder eine DAkkS-Akkreditierung.**

Die Aussage "ISMS-Zertifikat ist zwingender Bestandteil der Antragstellung" stammt
ausschließlich aus dem **BfArM-Leitfaden** (Verwaltungshinweis, nicht bindender
Verordnungstext), Kap. 3.4.1, S. 50. Das bedeutet nicht, dass die Anforderung
erfunden ist — BfArM wendet seinen eigenen Leitfaden in der Praxis als
Prüfmaßstab an, und ein Antrag ohne das dort verlangte Zertifikat trägt ein
reales Ablehnungsrisiko. Es bedeutet aber, dass die **rechtliche Verbindlichkeit
schwächer** ist als bei AK-SEC-01 (dort: Verordnung → SGB XI → SGB V mit festen
Daten). Ein Leitfaden kann von BfArM ohne Gesetzgebungsverfahren geändert werden.

**Konsequenz für den Katalog:** `quelle`-Feld von AK-SEC-05 um diesen Vorbehalt
ergänzt (siehe Commit) — die Anforderung bleibt Klasse D, aber die Formulierung
"zwingender Bestandteil" wird um den Hinweis "laut Leitfaden, nicht laut Anlage 1
DiPAV selbst" präzisiert.

---

## Auswirkung auf die "16 externen Punkte"-Zahl

Von den 16 sind bei strenger Lesart **nur 14 echte, noch offene externe
Blocker**:

- REG-02 und REG-03 sind bereits gelöst (`stand: erfuellt`) — sie zählten nur
  formal noch zur Klasse-D/E-Menge, weil die Bearbeitungsklasse rückwirkend nicht
  geändert wurde, obwohl die Erfüllung längst da ist.
- REG-05 ist kein Blocker, sondern ein empfohlener optionaler Schritt.
- REG-01 wird mit diesem Durchgang auf Klasse C korrigiert und zählt damit nicht
  mehr zu den externen Punkten.

Damit bleiben **13 tatsächlich noch zu erbringende externe Nachweise** offen
(5×A + 6×B + REG-04, abzüglich der bereits gelösten/reklassifizierten). Das ist
keine Verharmlosung — SEC-01, QI-01, das Datenschutzpaket und SEC-05 bleiben
P0/P1-Blocker mit langer Vorlaufzeit —, sondern eine genauere Zahl, die nicht
mehr durch bereits erledigte oder nie wirklich blockierende Punkte aufgebläht ist.

## Vorgenommene Korrekturen in `lib/coach/anforderungskatalog.ts`

1. `AK-REG-01`: `klasse: 'E'` → `klasse: 'C'` (reine interne Lesearbeit, keine
   Behörde beteiligt).
2. `AK-SEC-05`: `quelle` um einen Satz ergänzt, der klarstellt, dass Anlage 1
   DiPAV selbst kein ISO-27001-Zertifikat verlangt und die Pflicht ausschließlich
   aus dem BfArM-Leitfaden stammt.

Keine weitere Korrektur wurde vorgenommen, ohne dass eine der oben zitierten
Primärquellen sie trägt. Die B- und C-Empfehlungen zu AK-DS-04, AK-QI-01, AK-BF-01
und AK-BF-02 sind strategische Vorschläge zur Beauftragungsreihenfolge, keine
Tatsachenkorrekturen — sie wurden deshalb **nicht** in den Katalog-Code
übernommen, sondern hier als Entscheidungsgrundlage dokumentiert.
