# Regulatorischer Faktencheck – DiPA (Digitale Pflegeanwendung)

**Erstellt:** 15.08.2026
**Methodik:** Primärquellen-basiert (Gesetzestexte, BfArM-Leitfäden, BSI-Veröffentlichungen)
**Zweck:** Validierung aller bisherigen regulatorischen Annahmen für die DiPA-Zulassung von Alltagsengel

---

## 1. Faktencheck-Tabelle

| # | Thema | Bisherige Annahme | Prüfergebnis | Status | Primärquelle |
|---|-------|-------------------|--------------|--------|--------------|
| 1a | TR-03161 Pflicht | Pflicht für DiPA-Zulassung | **JA, verpflichtend seit 01.01.2025.** §78a Abs. 7 SGB XI verweist auf §139e Abs. 10 SGB V ("gilt entsprechend"). BSI-Zertifikat ist Voraussetzung für vollständige Antragsunterlagen. | **BESTÄTIGT** | §78a Abs. 7 SGB XI; BSI TR-03161 FAQ (bsi.bund.de) |
| 1b | TR-03161 Teile 1-3 | Teile 1-3 jeweils Web/App/Backend | **Nummerierung korrigiert:** Teil 1 = Mobile Apps, Teil 2 = Web-Anwendungen, Teil 3 = Hintergrundsysteme. Alle Teile, die die Gesamtsicherheit beeinflussen, müssen geprüft werden. Für eine typische DiPA (App + Web + Backend): alle drei Teile. | **KORRIGIERT** | BSI TR-03161 Hauptseite |
| 1c | TR-03161 Prüfstelle nötig | Externe Prüfstelle erforderlich | **JA.** BSI-akkreditierte Prüfstelle (z.B. secuvera, TÜViT, SRC, IT-TÜV) muss die Konformitätsbewertung durchführen. Interne Tests reichen NICHT. | **BESTÄTIGT** | BSI FAQ; secuvera.de |
| 1d | TR-03161 Kosten | 15.000–30.000 € | **DEUTLICH UNTERSCHÄTZT.** Marktpreise: Prüfstelle + Pentest 30.000–80.000 €, interne Vorbereitung 20.000–70.000 €, BSI-Gebühren zusätzlich. **Gesamt: 50.000–150.000 €.** | **KORRIGIERT** | dux-healthcare.com; quickbirdmedical.com (basierend auf 15+ zertifizierten DiGA) |
| 1e | TR-03161 intern vorbereiten? | Unklar | **JA, Vorbereitung intern möglich und dringend empfohlen.** Dokumentation, Security-by-Design, Remediation können intern erfolgen. Das spart erheblich, da Nachbessern 3–5× teurer ist. Die formale Prüfung selbst muss aber extern erfolgen. | **BESTÄTIGT** | Praxisberichte (quickbirdmedical.com) |
| 2a | ISO 27001 zwingend | DAkkS-akkreditierte Zertifizierung erforderlich VOR Antragstellung | **JA, zwingend.** ISO 27001-Zertifikat (oder ISO 27001 auf Basis IT-Grundschutz) ist Pflicht. Ein ISMS ohne Zertifikat reicht NICHT. | **BESTÄTIGT** | tuvit.de/services/dipa; BfArM Datensicherheitskriterien |
| 2b | DAkkS-Akkreditierung | Muss DAkkS-akkreditiert sein | **JA**, oder alternativ BSI-Zertifikat (ISO 27001 auf Basis IT-Grundschutz). Beide Wege sind gleichwertig anerkannt. | **BESTÄTIGT** | azuma.health; BSI-Veröffentlichungen |
| 2c | ISO 27001 Kosten | 25.000–50.000 € | **Plausibel.** Marktpreise für kleine Unternehmen (<50 MA): ISMS-Aufbau 14.000–29.000 €, Audit 7.000–19.000 €, internes Audit 5.500–7.000 €/Jahr. **Gesamt Erstjahr: 24.000–50.000 €.** Lean-ISMS-Plattformen (Secfix, DataGuard) können auf 8.000–12.000 € reduzieren. | **BESTÄTIGT** | acato.de; proliance.ai; trustspace.io |
| 2d | §139e SGB V fordert ISO 27001 | ISO 27001 direkt genannt | **KORRIGIERT.** §139e SGB V nennt ISO 27001 NICHT direkt. Das Gesetz fordert ein BSI-Zertifikat gemäß BSI-eigener Anforderungen. BSI verlangt dann ISO 27001 als Grundlage. Der Weg geht: §78a Abs. 7 SGB XI → §139e Abs. 10 SGB V → BSI-Anforderungen → ISO 27001. | **KORRIGIERT** | §139e Abs. 10 SGB V (dejure.org) |
| 3 | Pentest in TR-03161 enthalten | Kein eigenständiger Beschaffungsvorgang | **BESTÄTIGT seit Dezember 2025.** Seit Update des DiGA-Leitfadens (10.12.2025) subsumiert das TR-03161-Zertifikat den Pentest vollständig. Zuvor war ein separater Pentest-Bericht zusätzlich erforderlich. BfArM kann jederzeit Pentest-Nachweise anfordern. | **BESTÄTIGT** | DiGA-Leitfaden Update 12/2025; quickbirdmedical.com |
| 4a | BfArM-Antragsprozess | Über DiGA-Fast-Track-ähnliches Verfahren | **BESTÄTIGT mit Nuancen.** Elektronischer Antrag über gemeinsames DiGA/DiPA-Portal des BfArM. Entscheidung innerhalb 3 Monaten (verlängerbar um 3 Monate). Seit BEEP-Gesetz (01.01.2026) gibt es auch für DiPA eine 12-monatige Erprobungsphase (vorläufige Aufnahme). | **BESTÄTIGT** | §78a Abs. 4-5 SGB XI; BfArM DiPA-Seite |
| 4b | §78a SGB XI als Grundlage | §78a regelt den Antragsprozess | **BESTÄTIGT.** §78a SGB XI ist die zentrale Norm: Abs. 3 = Verzeichnis, Abs. 4 = Antrag, Abs. 5 = Entscheidungsfrist, Abs. 7-8 = Sicherheitsanforderungen. | **BESTÄTIGT** | §78a SGB XI (dejure.org) |
| 4c | Beratungsgespräch vorab | Unklar ob verfügbar | **JA, verfügbar.** BfArM-Innovationsbüro bietet DiPA-spezifische Beratung an. Unterlagen 3 Wochen vorher einreichen, Termin 3–4 Monate nach Anmeldung, per Videokonferenz, kostenpflichtig, nicht bindend. Kontakt: innovation@bfarm.de | **BESTÄTIGT** | BfArM Innovationsbüro Beratungsformate |
| 4d | Unterlagen für Antrag | Unklar | **21 Kategorien gem. §2 DiPAV**, u.a.: Herstellerangaben, Zweckbestimmung, Konformitätserklärung, Gebrauchsanweisung, Quellen pflegerischer Inhalte, Nachweis pflegerischer Nutzen, Zielgruppe, Studien, Datenschutzerklärungen, Interoperabilitätsstandards, Haftpflichtversicherung. Plus Erklärungen gem. Anlage 1 + 2. | **BESTÄTIGT** | §2 DiPAV (lxgesetze.de) |
| 5a | DiPAV Fundstelle | BJNR156800022 korrekt | **BESTÄTIGT.** Digitale Pflegeanwendungen-Verordnung vom 29.09.2022 (BGBl. I S. 1568). | **BESTÄTIGT** | gesetze-im-internet.de/dipav |
| 5b | DiPAV Änderungen | Unklar ob geändert | **JA, eine Änderung:** Art. 4a des Digital-Gesetzes (DigiG), 22.03.2024, BGBl. 2024 I Nr. 101. | **BESTÄTIGT** | buzer.de/DiPAV.htm |
| 5c | DiPAV Anlagen | Unklar welche gültig | **Zwei Anlagen:** Anlage 1 (Fragebogen §3 Abs. 2: Sicherheit & Funktionstauglichkeit, 42+ Anforderungen) und Anlage 2 (Fragebogen §6: Qualitätsanforderungen). | **BESTÄTIGT** | gesetze-im-internet.de/dipav/anlage_1.html |
| 6a | §40b SGB XI Erstattung | 40 € DiPA + 30 € eUL | **BESTÄTIGT als geltendes Recht seit 01.01.2026.** §40b Abs. 1 SGB XI: Nr. 1 = bis 40 € DiPA, Nr. 2 = bis 30 € eUL. Gesamt: 70 € monatlich. | **BESTÄTIGT** | §40b SGB XI (dejure.org) |
| 6b | Nicht §40a | §40b ist richtig, nicht §40a | **BESTÄTIGT.** §40a = Definition/Anspruchsgrundlage (WAS ist eine DiPA), §40b = Leistungshöhe (WIE VIEL wird erstattet). Beide sind relevant, aber für Erstattungshöhe ist §40b korrekt. | **BESTÄTIGT** | §40a + §40b SGB XI |
| 6c | Nicht 70€-Deckel | Kein 70€-Deckel | **KORRIGIERT.** Seit 01.01.2026 beträgt die Summe TATSÄCHLICH 70 € (40+30). Vorher waren es ca. 53 € (50 € + 4,5% §30-Anpassung). Die Erhöhung kam durch das Befugniserweiterungsgesetz (12/2025), NICHT durch PUEG. | **KORRIGIERT** | §40b SGB XI i.d.F. v. 22.12.2025 (BGBl. I Nr. 371) |
| 7a | Prospektive Studie erforderlich | Prospektive Studie als Pflicht | **KORRIGIERT.** §11 Abs. 1 DiPAV setzt **retrospektive** Vergleichsstudien als Default, inkl. intraindividueller Vergleich (Prä/Post). Prospektive Studien sind die **Alternative** (§11 Abs. 2), nicht der Standard. | **KORRIGIERT** | §11 DiPAV (lxgesetze.de) |
| 7b | Retrospektive Analyse reicht | Zu prüfen | **BESTÄTIGT.** Retrospektive Vergleichsstudien reichen, müssen aber quantitativ und vergleichend sein (§11 Abs. 3 DiPAV). Methodik: Pflegeforschung, Sozialforschung oder klinische Methoden zulässig. | **BESTÄTIGT** | §11 Abs. 1+3 DiPAV |
| 7c | Endpunkte | Welche Endpunkte nötig | Pflegerischer Nutzen gem. §9 DiPAV in mind. einem Bereich nach §14 Abs. 2 SGB XI: Mobilität, kognitive Fähigkeiten, Verhaltensweisen, Selbstversorgung, Krankheitsbewältigung, Alltagsgestaltung, Haushaltsführung. Seit BEEP auch: Entlastung pflegender Angehöriger. | **BESTÄTIGT** | §9 DiPAV; §14 Abs. 2 SGB XI |
| 7d | Erprobungsphase | Keine vorläufige Aufnahme für DiPA | **KORRIGIERT.** Seit BEEP-Gesetz (01.01.2026) gibt es eine 12-monatige Erprobungsphase (§78a Abs. 6a SGB XI, §§13-14 DiPAV). Voraussetzung: systematische Datenauswertung + wissenschaftliches Evaluationskonzept. | **KORRIGIERT** | §78a Abs. 6a SGB XI; §§13-14 DiPAV |
| 8 | Pflegefachliche Freigabe | Braucht man eine Begutachtung? | **Kein formales Erfordernis "pflegefachliche Freigabe" in DiPAV gefunden.** §6 Abs. 8 DiPAV verlangt, dass pflegerische Inhalte "qualitätsgesichert" sind und dem "allgemein anerkannten Stand der pflegerisch-medizinischen Erkenntnisse" entsprechen. Quellen (Leitlinien, Expertenstandards) müssen angegeben werden (§2 Abs. 1 Nr. 9 DiPAV). Empfehlung: Im Beratungsgespräch klären. | **NICHT BELEGBAR** | §6 Abs. 8 DiPAV; §2 Abs. 1 Nr. 9 DiPAV |
| 9a | DSFA erforderlich | Ja, 9 Risiken identifiziert | **BESTÄTIGT.** Pflicht aus Art. 35 DSGVO (Gesundheitsdaten = hohes Risiko) UND BfArM-Datenschutzkriterien (V1.0, 24.04.2024), Abschnitt "DSFA und Verzeichnis von Verarbeitungstätigkeiten". | **BESTÄTIGT** | Art. 35 DSGVO; BfArM Datenschutzkriterien |
| 9b | Externer DSB nötig? | Unklar | **NEIN, internes Erstellen erlaubt.** Art. 35 Abs. 2 DSGVO: Der Verantwortliche führt die DSFA durch, der DSB wird nur beratend hinzugezogen ("holt den Rat ein"). Kein externer DSB erforderlich. | **KORRIGIERT** | Art. 35 Abs. 2 DSGVO |
| 10a | AVVs fehlen | 4 AVVs fehlen (Supabase, Vercel, Resend, Stripe) | **AVVs sind PFLICHT** gem. Art. 28 DSGVO und BfArM-Datenschutzkriterien. Müssen VOR Antragstellung abgeschlossen sein, können NICHT nachgereicht werden. | **BESTÄTIGT** | Art. 28 DSGVO; BfArM Datenschutzkriterien |
| 10b | Supabase/Vercel DPAs = AVVs? | Zu prüfen | **TEILWEISE.** Die Standard-DPAs decken Art. 28 DSGVO formal ab, müssen aber für DiPA ergänzt werden: DiPAV-§5-Abs.-3-Zweckbindung, CMEK-Vereinbarung, verbindliche Zusage kein US-Transfer (auch unter CLOUD Act). Standard-DPAs reichen in der Regel NICHT aus. | **KORRIGIERT** | Supabase DPA; Vercel DPA; BfArM Datenschutzkriterien |
| 11a | C5 fehlt bei Supabase/Vercel | Kein BSI C5 Testat vorhanden | **BESTÄTIGT.** Weder Supabase noch Vercel haben ein BSI C5-Testat. Supabase hat ISO 27001 + SOC 2 Type 2. Vercel hat SOC 2. | **BESTÄTIGT** | supabase.com/security; vercel.com/docs/security |
| 11b | C5 für DiPA erforderlich? | Zu prüfen | **JA, PFLICHT.** §393 SGB V (eingeführt durch DigiG) gilt auch für Pflegekassen (SGB XI). BSI TR-03161 verlangt C5 Type 2 vom Cloud-Anbieter. **Seit 01.07.2025: C5 Type 2 verpflichtend.** Übergangsweise (bis 01.07.2027): ISO 27001, ISO 27001 IT-Grundschutz oder CSA STAR Level 2 als Äquivalent per C5-Gleichwertigkeitsverordnung. | **BESTÄTIGT** | §393 SGB V; C5GleichwV; BSI TR-03161 |
| 11c | SOC 2 + ISO 27001 reicht? | Als Alternative zu C5 | **NEIN.** SOC 2 ist NICHT in der C5-Gleichwertigkeitsverordnung als Äquivalent gelistet. Nur: ISO 27001:2022, ISO 27001 IT-Grundschutz, CSA STAR Level 2 (CCM V4.0). Nach 01.07.2027 nur noch C5 Type 2, keine Ausnahmen. | **KORRIGIERT** | C5GleichwV (BJNR05B0A0025); activemind.de |
| 12a | Drittlandtransfer | DS-04 SCCs für DiPA unzulässig | **BESTÄTIGT.** DiPAV §5 Abs. 4: Verarbeitung nur in DE/EU/EWR/Schweiz oder Drittstaat mit Angemessenheitsbeschluss. BfArM-Kriterien explizit: "Eine Verarbeitung allein aufgrund von Standardvertragsklauseln oder BCR ist nicht zulässig." | **BESTÄTIGT** | DiPAV §5 Abs. 4; BfArM Datenschutzkriterien |
| 12b | Supabase EU reicht? | eu-west-1 Frankfurt löst das Problem | **NICHT AUTOMATISCH.** Zusätzlich erforderlich: (1) Customer-Managed Encryption Keys (CMEK), (2) verbindliche Zusage kein US-Transfer (auch unter CLOUD Act), (3) alle Verarbeitung inkl. Backups/Analytics/Support in EU. Standard-Setup reicht NICHT. | **KORRIGIERT** | BfArM Datenschutzkriterien; Dr-Datenschutz.de |
| 13 | §302 SGB V | DiPA-Abrechnung über §302? | **NEIN.** §302 SGB V gilt für DiGA (Krankenkassen/SGB V), NICHT für DiPA (Pflegekassen/SGB XI). DiPA-Abrechnung läuft über: §78a SGB XI (Preisverhandlung), §40b SGB XI (Erstattungshöhe), §105 SGB XI (Datenübermittlung). | **KORRIGIERT** | §302 SGB V; §78a/§40b/§105 SGB XI |
| 14a | TI-Anbindung | Muss DiPA an TI angeschlossen sein? | **NEIN, nicht wie bei DiGA.** DiPAV §6 fordert Interoperabilität, aber NICHT explizit TI-Anbindung, GesundheitsID oder ePA-Export. DiPA hat "weichere" TI-Anforderungen als DiGA. Vorausschauende TI-Kompatibilität empfohlen. | **KORRIGIERT** | DiPAV §6; gematik Wiki |
| 14b | KIM Pflicht | Ist KIM für DiPA obligatorisch? | **NEIN für DiPA-App.** KIM ist eine Pflicht für Pflegeeinrichtungen (ab 10/2027 für Abrechnung), nicht für DiPA-Hersteller. | **KORRIGIERT** | dmrz.de/ratgeber TI-Pflege |

---

## 2. Kostenblock-Analyse

### Bisherige Gesamtschätzung: 73.000–129.000 € → KORREKTUR ERFORDERLICH

| # | Posten | Bisherige Schätzung | Korrigierte Schätzung | Zwingend? | Begründung |
|---|--------|--------------------|-----------------------|-----------|------------|
| 1 | BSI TR-03161 Zertifizierung | 15.000–30.000 € | **50.000–150.000 €** | JA, keine Alternative | Prüfstelle 30.000–80.000 €, interne Vorbereitung 20.000–70.000 €, BSI-Gebühren zusätzlich. **GRÖSSTER Einzelposten.** Sparpotenzial: Security-by-Design von Anfang an (spart 3-5× vs. Nachbessern). |
| 2 | ISO 27001 Zertifizierung | 25.000–50.000 € | **24.000–50.000 €** (oder **8.000–12.000 €** mit Lean-ISMS) | JA, keine Alternative | Standard-Weg: ISMS-Aufbau + DAkkS-Audit. **Sparpotenzial:** Lean-ISMS-Plattformen (Secfix, DataGuard, TrustSpace) → 8.000–12.000 €. Förderprogramme (BAFA, Digitalbonus Bayern) möglich. |
| 3 | Penetrationstest | (separat geplant) | **0 € (separat)** | In TR-03161 enthalten | Seit 12/2025 subsumiert TR-03161 den Pentest vollständig. Kein separater Beschaffungsvorgang nötig. |
| 4 | C5-Testat (eigenes) | Nicht geplant | **0 € (eigenes nicht nötig)** | Nein, Provider muss es haben | DiPA-Hersteller brauchen KEIN eigenes C5. Aber der Cloud-Provider MUSS C5 Type 2 haben. → **Providerwechsel erforderlich** (siehe Blocker). |
| 5 | C5-konformes Hosting | Nicht eingeplant | **3.000–12.000 €/Jahr** | JA | Wechsel zu C5-zertifiziertem Provider (AWS direkt, Azure, Telekom Cloud, IONOS, PlusServer). Supabase/Vercel haben kein C5. |
| 6 | DSFA | Im internen Aufwand | **0–5.000 €** | JA | Kann intern erstellt werden (Art. 35 Abs. 2 DSGVO). DSB berät nur. Bei externer Unterstützung: 3.000–5.000 €. |
| 7 | AVV-Nachverhandlung | Nicht eingeplant | **2.000–5.000 € (Rechtsberatung)** | JA | Standard-DPAs von Supabase/Vercel reichen nicht. CMEK-Vereinbarung, No-US-Transfer-Zusage nötig. Anwaltliche Prüfung empfohlen. |
| 8 | Evaluation/Studie | Nicht in 73k–129k | **5.000–30.000 €** | JA | Retrospektive Studie (§11 DiPAV) ist günstiger als prospektiv. Intraindividueller Prä/Post-Vergleich möglich. Studienregistrierung + Reporting nach internationalen Standards. |
| 9 | BfArM-Gebühren | Nicht eingeplant | **1.000–5.000 €** | JA | Antragsgebühren + ggf. Beratungsgebühr. |

### Korrigierte Gesamtschätzung

| Szenario | Betrag | Anmerkung |
|----------|--------|-----------|
| **Minimum (Lean-Ansatz)** | **~93.000 €** | Lean-ISMS (8k), TR-03161 Minimum (50k), günstiges Hosting (3k), interne DSFA (0), retrospektive Studie (5k), AVV-Nachverhandlung (2k), BfArM (1k), interne Vorbereitung optimiert |
| **Realistisch** | **~140.000–180.000 €** | Standard ISO 27001 (30k), TR-03161 Mitte (80k), Hosting (6k), Studie (15k), DSFA + AVV (7k), BfArM (3k) |
| **Maximum** | **~257.000 €** | Alles extern, große Studie, maximale TR-03161-Kosten |

### Einsparstrategien (konkret)

1. **Security-by-Design ab sofort** → spart 60–100% der Nachbesserungskosten bei TR-03161
2. **Lean-ISMS-Plattform** statt klassischer Beratung → spart 15.000–38.000 € bei ISO 27001
3. **Retrospektive Studie** statt prospektiv → spart 10.000–50.000 € bei Evaluation
4. **DSFA intern** mit DSB-Beratung → spart 3.000–5.000 €
5. **Erprobungsphase nutzen** (seit BEEP 01.01.2026) → vorläufige Aufnahme mit systematischer Datenauswertung statt vollständiger Studie, dann 12 Monate Zeit für endgültige Evaluation
6. **Förderprogramme** prüfen: BAFA Digitalförderung, Digitalbonus Bayern, go-digital

---

## 3. Kritische Blocker

### BLOCKER 1: Cloud-Provider ohne C5 (HÖCHSTE PRIORITÄT)

**Problem:** Weder Supabase noch Vercel haben ein BSI C5 Type 2-Testat. Seit 01.07.2025 ist C5 Type 2 für Cloud-Anbieter von DiGA/DiPA Pflicht (§393 SGB V, BSI TR-03161).

**Übergangsregelung:** Bis 01.07.2027 akzeptiert die C5-Gleichwertigkeitsverordnung als Äquivalent:
- ISO 27001:2022 (Supabase HAT das) ← **nutzbar als Übergangslösung**
- ISO 27001 auf Basis IT-Grundschutz
- CSA STAR Level 2 (CCM V4.0)

**ACHTUNG:** SOC 2 Type II ist NICHT als Äquivalent gelistet. Und nach 01.07.2027 gibt es KEINE Ausnahmen mehr.

**Handlungsoptionen:**
1. **Kurzfristig (bis 07/2027):** Supabase ISO 27001 als Übergangslösung nutzen, schriftlichen Gap-Analyse-Plan vorlegen
2. **Mittelfristig:** Migration zu C5-zertifiziertem Provider (AWS direkt, Azure, Telekom Cloud) ODER Supabase drängen, C5 zu erlangen
3. **Vercel:** Kein ISO 27001 → auch Übergangsregelung greift nicht. Statische Assets ggf. über C5-Provider deployen.

### BLOCKER 2: Drittlandtransfer / CMEK

**Problem:** Supabase (US-Mutterkonzern) auf eu-west-1 reicht NICHT automatisch. Zusätzlich nötig:
- Customer-Managed Encryption Keys (CMEK): Alltagsengel muss die Schlüssel halten
- Verbindliche Zusage von Supabase: Kein US-Datentransfer, auch nicht unter CLOUD Act
- Alle Verarbeitung (inkl. Backups, Analytics, Support-Zugriff) in EU

**Handlungsoptionen:**
1. Supabase CMEK-Option prüfen (Enterprise-Plan?)
2. Alternativ: Self-hosted Supabase auf AWS EU mit eigenem Key Management
3. EU-Angemessenheitsbeschluss (EU-US Data Privacy Framework) ist derzeit gültig → zusätzliche Rechtsgrundlage, aber politisch unsicher

### BLOCKER 3: AVV-Nachverhandlung

**Problem:** Standard-DPAs von Supabase, Vercel, Resend, Stripe decken DiPAV-Anforderungen nicht vollständig ab.

**Lösung:** Anwaltliche Prüfung + Ergänzungsvereinbarungen. Geschätzte Kosten: 2.000–5.000 €.

---

## 4. Verfahrens-Überblick DiPA-Antrag

### Ablauf (gem. §78a SGB XI, DiPAV)

1. **Beratungsgespräch** (empfohlen, nicht Pflicht) → BfArM Innovationsbüro, 3–4 Monate Vorlauf
2. **Antrag** über elektronisches DiGA/DiPA-Portal beim BfArM
3. **Vollständigkeitsprüfung** → Bei Mängeln: 3 Monate Nachreichfrist
4. **Inhaltliche Prüfung** → 3 Monate Entscheidungsfrist (verlängerbar um 3 Monate)
5. **Entscheidung:** Aufnahme ins DiPA-Verzeichnis ODER Aufnahme zur Erprobung (12 Monate) ODER Ablehnung
6. **Vergütungsverhandlung** → Spitzenverband Bund der Pflegekassen, 3 Monate nach Aufnahme

### Zwei Antragsoptionen (seit BEEP 01.01.2026)

| Option | Voraussetzung | Dauer |
|--------|--------------|-------|
| **Dauerhafte Aufnahme** | Vollständiger Nachweis pflegerischer Nutzen (§§10-11 DiPAV) | Dauerhaft |
| **Erprobung** | Systematische Datenauswertung + Evaluationskonzept (§§13-14 DiPAV) | 12 Monate, dann endgültiger Nachweis |

**Empfehlung für Alltagsengel:** Erprobungsphase nutzen. Systematische Datenauswertung (Prä/Post-Vergleich aus Nutzungsdaten) + wissenschaftliches Evaluationskonzept einreichen → 12 Monate vorläufige Aufnahme → In dieser Zeit retrospektive Vergleichsstudie durchführen.

---

## 5. Primärquellen-Verzeichnis

### Gesetzestexte

| Quelle | URL |
|--------|-----|
| DiPAV Volltext | https://www.gesetze-im-internet.de/dipav/BJNR156800022.html |
| DiPAV PDF | https://www.gesetze-im-internet.de/dipav/DiPAV.pdf |
| DiPAV Anlage 1 | https://www.gesetze-im-internet.de/dipav/anlage_1.html |
| DiPAV Anlage 2 | https://www.gesetze-im-internet.de/dipav/anlage_2.html |
| §2 DiPAV (Antragsinhalt) | https://lxgesetze.de/dipav/2 |
| §5 DiPAV (Datenschutz) | https://lxgesetze.de/dipav/5 |
| §6 DiPAV (Qualität) | https://lxgesetze.de/dipav/6 |
| §9 DiPAV (Pflegerischer Nutzen) | https://lxgesetze.de/dipav/9 |
| §11 DiPAV (Studien) | https://lxgesetze.de/dipav/11 |
| §13-14 DiPAV (Erprobung) | https://lxgesetze.de/dipav/13 |
| §39a SGB XI (eUL) | https://dejure.org/gesetze/SGB_XI/39a.html |
| §40a SGB XI (DiPA-Definition) | https://dejure.org/gesetze/SGB_XI/40a.html |
| §40b SGB XI (Leistungshöhe) | https://dejure.org/gesetze/SGB_XI/40b.html |
| §78a SGB XI (Verzeichnis/Antrag) | https://dejure.org/gesetze/SGB_XI/78a.html |
| §105 SGB XI (Abrechnung) | https://dejure.org/gesetze/SGB_XI/105.html |
| §139e SGB V (DiGA-Verzeichnis) | https://dejure.org/gesetze/SGB_V/139e.html |
| §302 SGB V (Leistungserbringer-Abrechnung) | https://dejure.org/gesetze/SGB_V/302.html |
| §393 SGB V (C5-Anforderungen) | https://dejure.org/gesetze/SGB_V/393.html |
| C5-Gleichwertigkeitsverordnung | https://www.gesetze-im-internet.de/c5gleichwv/BJNR05B0A0025.html |
| Art. 35 DSGVO (DSFA) | https://dsgvo-gesetz.de/art-35-dsgvo/ |

### BfArM

| Quelle | URL |
|--------|-----|
| BfArM DiPA-Hauptseite | https://www.bfarm.de/DE/Medizinprodukte/Aufgaben/DiGA-und-DiPA/DiPA/_node.html |
| BfArM DiPA-Leitfaden V1.3 | https://www.bfarm.de/SharedDocs/Downloads/DE/Medizinprodukte/dipa_leitfaden.pdf |
| BfArM DiPA FAQ | https://www.bfarm.de/DE/Medizinprodukte/_FAQ/DiPA/faq-liste.html |
| BfArM Beratung (Innovationsbüro) | https://www.bfarm.de/DE/Das-BfArM/Aufgaben/Innovationsbuero/Beratungsformate/Beratung-DiGA-DiPA/_node.html |
| BfArM DiGA/DiPA-Portal | https://www.bfarm.de/DE/Medizinprodukte/Portale/DiGA-DiPA/_node.html |
| BfArM Datenschutzkriterien V1.0 | https://www.bfarm.de/SharedDocs/Downloads/DE/Medizinprodukte/diga-dipa-datenschutzkriterien.html |
| BfArM Datensicherheitskriterien | https://www.bfarm.de/DE/Medizinprodukte/Aufgaben/DiGA-und-DiPA/Datensicherheitskriterien/_node.html |

### BSI

| Quelle | URL |
|--------|-----|
| BSI TR-03161 FAQ | https://www.bsi.bund.de/DE/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/Technische-Richtlinien/TR-nach-Thema-sortiert/tr03161/TR-03161-FAQ/FAQ-TR-03161_node.html |

### Fachquellen (Sekundär, zur Kostenvalidierung)

| Quelle | URL |
|--------|-----|
| dux-healthcare (TR-03161 Kosten, 5 DiGA) | https://dux-healthcare.com/en/knowledge/diga/bsi-tr-03161-certification/ |
| quickbirdmedical (TR-03161, 15+ DiGA) | https://quickbirdmedical.com/bsi-tr-03161-diga-zertifizierung-anforderungen/ |
| secuvera (Prüfstelle) | https://www.secuvera.de/bsi-pruefstelle/bsi-tr-03161-zertifizierung-pruefstelle/ |
| TÜViT (DiPA-Services) | https://www.tuvit.de/en/services/applications/digital-care-applications-dipa/ |
| activemind (C5-Gleichwertigkeit) | https://www.activemind.de/magazin/c5-gleichwertigkeitsverordnung/ |
| pflege-dschungel (DiPA 2026) | https://pflege-dschungel.de/dipa-2026/ |
| Dr-Datenschutz (DiGA/DiPA Kriterien) | https://www.dr-datenschutz.de/gesundheits-apps-neue-datenschutzkriterien-fuer-diga-dipa/ |
| PwC (TR-03161 + C5) | https://www.pwc.de/de/risk-regulatory/tr-03161-und-c5-das-fundament-fuer-sichere-digitale-gesundheitsanwendungen.html |

---

## 6. Zusammenfassung der Korrekturen

### Was war FALSCH oder UNGENAU:

1. **TR-03161 Kosten massiv unterschätzt** (15-30k → tatsächlich 50-150k)
2. **TR-03161 Teilenummerierung vertauscht** (Teil 1 = Mobile, nicht Web)
3. **70€-Deckel existiert DOCH** (40+30 seit 01.01.2026, Befugniserweiterungsgesetz)
4. **Prospektive Studie ist NICHT Pflicht** (retrospektiv ist der Default)
5. **Erprobungsphase gibt es JETZT** (seit BEEP 01.01.2026, 12 Monate)
6. **§302 SGB V gilt NICHT für DiPA** (DiPA nutzt §78a/§40b/§105 SGB XI)
7. **ISO 27001 nicht direkt im Gesetz** (Gesetz fordert BSI-Zertifikat, BSI verlangt dann ISO 27001)
8. **SOC 2 reicht NICHT als C5-Äquivalent** (nur ISO 27001, IT-Grundschutz, CSA STAR)
9. **Supabase eu-west-1 reicht NICHT automatisch** (CMEK + No-US-Transfer-Zusage nötig)
10. **DSFA kann intern erstellt werden** (kein externer DSB nötig)
11. **Pflegefachliche Freigabe:** Kein formales Erfordernis gefunden, aber Inhalte müssen qualitätsgesichert sein
12. **TI/KIM ist NICHT Pflicht für DiPA** (anders als DiGA)

### Was war KORREKT:

1. DiPAV Fundstelle BJNR156800022
2. TR-03161 ist Pflicht
3. Externe Prüfstelle nötig
4. ISO 27001 Zertifizierung zwingend (über Umweg BSI)
5. Pentest in TR-03161 enthalten (seit 12/2025)
6. BfArM-Antrag über §78a SGB XI
7. Beratungsgespräch verfügbar
8. DSFA erforderlich
9. AVVs müssen vor Antrag vorliegen
10. C5 fehlt bei Supabase/Vercel
11. SCCs allein unzulässig für DiPA
12. §40b SGB XI = 40€ DiPA + 30€ eUL (seit 01.01.2026)
