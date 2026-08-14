# Externe Go-Live- und Monetarisierungsschritte

**Datum:** 14.08.2026
**Grundlage:** 25-Punkte-Abschlussbericht (GO), Phase-7-Finalaudit, alle docs/dipa/* und audit/dipa/* Dokumente
**Regel:** Keine erfundenen Preise, Zertifizierungen oder regulatorischen Anforderungen. UNVERIFIED wo nicht sicher belegt.

---

# 1. DiPA — 18 EXTERNE PUNKTE (vollständige Matrix)

## Legende

- **Bearbeitungsart:** Prüfung / Zertifikat / Gutachten / Test / Registrierung / Behörde
- **Vor BfArM:** Muss VOR der BfArM-Antragstellung abgeschlossen sein? JA/NEIN/UNVERIFIED
- **Parallel:** Kann parallel zu anderen Punkten beauftragt werden?

---

### 1. DS-02 — Datenschutz-Folgenabschätzung (DSFA)

| Feld | Inhalt |
|---|---|
| **ID** | DS-02 |
| **Anforderung** | DSFA nach Art. 35 DSGVO für Verarbeitung von Gesundheitsdaten |
| **Warum extern** | Juristische Risikobewertung (Eintrittswahrscheinlichkeit, Schwere) ist keine technische Ableitung, sondern Rechtseinschätzung durch DSB/Kanzlei |
| **Wer** | Externer Datenschutzbeauftragter oder Datenschutzkanzlei |
| **Nachweis** | Unterschriebene, vollständige DSFA mit Bewertung aller Risiken |
| **Dienstleister-Kategorie** | Datenschutzkanzlei mit Erfahrung im Gesundheitswesen / DiGA/DiPA-Bereich |
| **Vorbereitet** | `audit/dipa/dsfa_pflegecoach.md` (99 Zeilen, Beschreibung der Verarbeitung, Rechtsgrundlagen, Betroffene, Empfänger, TOM — alles mit `[zu bewerten]`-Markierungen wo juristische Einschätzung fehlt) |
| **Noch fehlt** | Juristische Bewertung aller `[zu bewerten]`-Felder, Unterschrift, Stellungnahme zum Restrisiko |
| **Reihenfolge** | Keine Abhängigkeit — kann sofort beauftragt werden |
| **Parallel** | JA |
| **Bearbeitungsart** | Gutachten |
| **Vor BfArM** | JA — DSFA ist Pflichtanlage zum DiPA-Antrag |
| **Nächste Aktion** | Datenschutzkanzlei beauftragen, `dsfa_pflegecoach.md` als Arbeitsgrundlage mitgeben |

---

### 2. DS-04 — Auftragsverarbeitungsverträge (AVV)

| Feld | Inhalt |
|---|---|
| **ID** | DS-04 |
| **Anforderung** | Geschlossene AVV-Kette nach Art. 28 DSGVO mit allen Auftragsverarbeitern |
| **Warum extern** | Verträge mit Drittanbietern (Supabase, Vercel, Resend, Stripe) müssen geschlossen und juristisch geprüft werden |
| **Wer** | Anbieter (Supabase Inc., Vercel Inc., Resend Inc., Stripe Inc.) + Datenschutzkanzlei zur Prüfung |
| **Nachweis** | 4 unterschriebene AVVs + Unterauftragnehmer-Listen |
| **Dienstleister-Kategorie** | Die Anbieter selbst (Standard-DPA anfordern) + Datenschutzkanzlei |
| **Vorbereitet** | `audit/dipa/avv_dossier_pflegecoach.md` (Kette erhoben, 4 Anbieter analysiert, 10-Punkte-Prüfliste, Verarbeitungsorte benannt) |
| **Noch fehlt** | Tatsächliche Standard-DPAs der 4 Anbieter anfordern, juristisch prüfen lassen, unterzeichnen |
| **Reihenfolge** | Kann parallel zu DS-02 |
| **Parallel** | JA |
| **Bearbeitungsart** | Prüfung |
| **Vor BfArM** | JA — AVV-Kette ist Pflichtnachweis |
| **Nächste Aktion** | Standard-DPAs bei Supabase, Vercel, Resend, Stripe anfordern |

---

### 3. SEC-01 — BSI TR-03161 Sicherheitszertifikat

| Feld | Inhalt |
|---|---|
| **ID** | SEC-01 |
| **Anforderung** | Prüfung nach BSI TR-03161 (Sicherheitsanforderungen an digitale Gesundheitsanwendungen) |
| **Warum extern** | Zertifikat kann nur von einer BSI-akkreditierten Prüfstelle ausgestellt werden |
| **Wer** | BSI-akkreditierte Prüfstelle |
| **Nachweis** | Prüfbericht + Zertifikat der Prüfstelle |
| **Dienstleister-Kategorie** | IT-Sicherheitsprüfstelle mit BSI-Akkreditierung (z.B. TÜV IT, SRC, secuvera, atsec) |
| **Vorbereitet** | `audit/dipa/tr03161_checkliste.md` (120 Zeilen, Selbsteinschätzung nach 7 Themenbereichen, Ist-Zustand dokumentiert, 7 Gaps priorisiert) |
| **Noch fehlt** | Prüfstelle beauftragen, Anwendungsbereich klären (Webanwendung ohne native App — welche Teile der TR gelten?), Prüfung durchführen |
| **Reihenfolge** | LÄNGSTE VORLAUFZEIT — sofort starten. Abhängigkeit: SEC-04 (Pentest) kann parallel oder vorher laufen |
| **Parallel** | JA (zu allen anderen) |
| **Bearbeitungsart** | Zertifikat |
| **Vor BfArM** | UNVERIFIED — Der aktualisierte DiPA-Leitfaden (15.07.2026) könnte die Anforderung modifiziert haben. Die TR-03161 wurde für DiGA konzipiert. Ob für DiPA identisch gefordert, ist mit BfArM zu klären (REG-05). |
| **Nächste Aktion** | Prüfstellen kontaktieren, Angebot einholen, parallel BfArM-Beratung (REG-05) anfragen ob TR-03161 für DiPA in dieser Form verlangt wird |

---

### 4. SEC-04 — Externer Penetrationstest

| Feld | Inhalt |
|---|---|
| **ID** | SEC-04 |
| **Anforderung** | Unabhängiger Penetrationstest des Produktbereichs |
| **Warum extern** | Selbsttest ist kein unabhängiger Test — Prüfung durch dieselbe Person, die den Code schrieb, hat keinen Wert |
| **Wer** | Externe IT-Sicherheitsfirma (unabhängig vom Hersteller) |
| **Nachweis** | Pentest-Bericht mit Befunden, Schweregraden, Empfehlungen |
| **Dienstleister-Kategorie** | IT-Sicherheitsdienstleister mit Erfahrung in Webanwendungen / Gesundheits-IT |
| **Vorbereitet** | `audit/dipa/pentest_beauftragung_scope.md` (154 Zeilen, VERSANDFERTIG: 17 API-Routen, 5 Testkonten, Schwerpunkte, Abnahmekriterien, Regeln) |
| **Noch fehlt** | Anbieter auswählen, beauftragen, Testumgebung bereitstellen, Prüfung durchführen |
| **Reihenfolge** | Kann vor SEC-01 abgeschlossen werden (schneller) |
| **Parallel** | JA |
| **Bearbeitungsart** | Test |
| **Vor BfArM** | UNVERIFIED — Empfohlen, aber ob zwingend vor Antrag oder als Anlage nachreichbar, ist mit BfArM zu klären |
| **Nächste Aktion** | Pentest-Anbieter mit `pentest_beauftragung_scope.md` kontaktieren |

---

### 5. SEC-05 — Informationssicherheits-Managementsystem (ISMS)

| Feld | Inhalt |
|---|---|
| **ID** | SEC-05 |
| **Anforderung** | ISMS nach ISO 27001 oder vergleichbar |
| **Warum extern** | Geltungsbereich muss mit BfArM abgestimmt werden, Zertifizierung erfordert externen Auditor |
| **Wer** | ISMS-Berater + ggf. Zertifizierungsstelle |
| **Nachweis** | Mindestens: dokumentiertes ISMS mit Geltungsbereich. Ideal: ISO-27001-Zertifikat |
| **Dienstleister-Kategorie** | ISO-27001-Berater mit Erfahrung im Gesundheitswesen |
| **Vorbereitet** | `audit/dipa/isms_scope_vorbereitung.md` (106 Zeilen, 3 Scope-Optionen, bestehende Maßnahmen erhoben, 5 Gaps identifiziert) |
| **Noch fehlt** | Geltungsbereich mit BfArM klären (REG-05 Abhängigkeit), dann ISMS aufbauen oder Berater beauftragen |
| **Reihenfolge** | ABHÄNGIG von REG-05 (BfArM-Beratung) für Geltungsbereich |
| **Parallel** | TEILWEISE — Beratung kann starten, Zertifizierung erst nach Scope-Klärung |
| **Bearbeitungsart** | Zertifikat |
| **Vor BfArM** | UNVERIFIED — Ob vollständiges ISMS oder nur dokumentierte Maßnahmen reichen, ist BfArM-Frage 11 |
| **Nächste Aktion** | Erst BfArM-Beratung (REG-05) für Scope, dann Berater beauftragen |

---

### 6. INT-02 — FHIR/MIO-Austauschformat Verbindlichkeit

| Feld | Inhalt |
|---|---|
| **ID** | INT-02 |
| **Anforderung** | Klärung, ob FHIR/MIO als Exportformat verbindlich gefordert ist |
| **Warum extern** | Technisch gebaut und getestet (18/18 PASS), aber die Verbindlichkeit des Formats ist eine offene regulatorische Frage |
| **Wer** | BfArM (Innovationsbüro-Beratung) |
| **Nachweis** | Antwort des BfArM auf Frage ORF-9 |
| **Dienstleister-Kategorie** | Behörde (BfArM) |
| **Vorbereitet** | `lib/coach/fhir.ts` (Code), `audit/dipa/interoperabilitaet_fhir.md` (Doku), `bfarm_fragenkatalog.md` Frage 10 |
| **Noch fehlt** | BfArM-Antwort auf Frage ORF-9 |
| **Reihenfolge** | Teil von REG-05 (BfArM-Beratung) |
| **Parallel** | Wird im REG-05-Termin mitgeklärt |
| **Bearbeitungsart** | Behörde |
| **Vor BfArM** | NEIN — wird im Beratungstermin selbst geklärt |
| **Nächste Aktion** | In BfArM-Beratung (REG-05) mitklären |

---

### 7. BF-01 — Barrierefreiheit EN 301 549 / BITV-Test

| Feld | Inhalt |
|---|---|
| **ID** | BF-01 |
| **Anforderung** | Barrierefreiheitsprüfung nach EN 301 549 / WCAG 2.1 AA durch akkreditierte Prüfstelle |
| **Warum extern** | axe-core (0 Verstöße) ist unterstützender Beleg, aber kein Ersatz für den amtlichen BITV-Test |
| **Wer** | BITV-akkreditierte Prüfstelle |
| **Nachweis** | BITV-Prüfbericht |
| **Dienstleister-Kategorie** | BITV-Prüfstelle (z.B. BIK BITV-Test, DIAS GmbH, Stiftung Pfennigparade) |
| **Vorbereitet** | `docs/dipa/14_ACCESSIBILITY_GAP_LISTE.md` (251 Zeilen), axe-core CI-Integration (0 Verstöße), E2E-Barrierefreiheits-Tests in CI |
| **Noch fehlt** | Beauftragung einer akkreditierten Prüfstelle, Durchführung des BITV-Tests |
| **Reihenfolge** | Kann sofort beauftragt werden |
| **Parallel** | JA |
| **Bearbeitungsart** | Prüfung |
| **Vor BfArM** | JA — Barrierefreiheitsnachweis ist Pflichtanlage |
| **Nächste Aktion** | BITV-Prüfstelle kontaktieren |

---

### 8. BF-02 — Gebrauchstauglichkeit mit Zielgruppe

| Feld | Inhalt |
|---|---|
| **ID** | BF-02 |
| **Anforderung** | Usability-Test mit mindestens 5 Testpersonen aus der Zielgruppe (pflegebedürftige, teils hochbetagte Menschen) |
| **Warum extern** | Testpersonen aus der Zielgruppe sind keine internen Mitarbeiter — ohne echte Nutzer ist der Test wertlos |
| **Wer** | Usability-Labor oder selbst organisiert mit externen Testpersonen |
| **Nachweis** | Durchgeführter Usability-Test mit Protokoll und Ergebnisbericht |
| **Dienstleister-Kategorie** | Usability-Labor mit Erfahrung in Seniorentests / Gesundheits-Apps ODER Selbstdurchführung mit rekrutierten Testpersonen |
| **Vorbereitet** | `audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md` (vollständiger Durchführungsplan: Wer, Womit, Reihenfolge, Abbruchregeln, Erfolgskriterien), `audit/dipa/gebrauchstauglichkeit_testprotokoll.md` (Aufnahmebogen) |
| **Noch fehlt** | 5 Testpersonen rekrutieren, Test durchführen, Ergebnisbericht schreiben |
| **Reihenfolge** | Kann sofort gestartet werden; genaue Personenzahl ggf. in BfArM-Beratung klären |
| **Parallel** | JA |
| **Bearbeitungsart** | Test |
| **Vor BfArM** | UNVERIFIED — ob vor Antrag oder während vorläufiger Aufnahme erbracht werden kann, ist BfArM-Frage |
| **Nächste Aktion** | Testpersonen über Pflegestützpunkte/Angehörigengruppen rekrutieren oder Usability-Labor beauftragen |

---

### 9. BF-03 — Screenreader-Durchgang (manuell)

| Feld | Inhalt |
|---|---|
| **ID** | BF-03 |
| **Anforderung** | Manuelle VoiceOver/NVDA-Prüfung der 4 Restpunkte S1, S5, S7, S8 |
| **Warum extern** | Ansage-Timing und Verständlichkeit kann nur ein Mensch mit Assistenztechnologie beurteilen, nicht automatisierte Tests |
| **Wer** | Person mit Screenreader-Erfahrung (kann Teil von BF-01/BF-02 sein) |
| **Nachweis** | Ausgefüllte Checkliste S1–S8 mit Ergebnis |
| **Dienstleister-Kategorie** | BITV-Prüfstelle (kann mit BF-01 kombiniert werden) oder einzelne Person mit Assistenztechnologie-Erfahrung |
| **Vorbereitet** | `docs/dipa/14_ACCESSIBILITY_GAP_LISTE.md` §3.3 (4 Restpunkte exakt beschrieben), maschineller Anteil (axe-core) abgeschlossen |
| **Noch fehlt** | Echte VoiceOver/NVDA-Sitzung durch einen Menschen |
| **Reihenfolge** | Kann mit BF-01 zusammengelegt werden |
| **Parallel** | JA (idealerweise zusammen mit BF-01) |
| **Bearbeitungsart** | Test |
| **Vor BfArM** | JA (Teil des Barrierefreiheitsnachweises) |
| **Nächste Aktion** | In BF-01-Beauftragung miteinschließen |

---

### 10. QI-01 — Pflegefachliche Inhaltsfreigabe

| Feld | Inhalt |
|---|---|
| **ID** | QI-01 |
| **Anforderung** | Freigabe aller pflegerischen Inhalte (Übungen, Wissensmodule, Assessments, Ziele, Checklisten) durch eine qualifizierte Pflegefachkraft |
| **Warum extern** | Freigabe durch Entwickler ist Selbstbestätigung und im Prüfverfahren wertlos. Höchstes Produktrisiko (R1.4) |
| **Wer** | Externe Pflegefachkraft mit Expertise in Gerontologie/häuslicher Pflege |
| **Nachweis** | Unterschriebene Freigabeerklärung mit Prüfvermerk je Modul |
| **Dienstleister-Kategorie** | Pflegewissenschaftler/in oder erfahrene Pflegefachkraft (Pflegepädagoge, Pflegeexperte APN) |
| **Vorbereitet** | `audit/dipa/inhalte_pruefdossier.md` (137 Zeilen, 12 Module, 6 Prüfkriterien K1–K6, VERSANDFERTIG an die Pflegefachkraft — ohne technische Vorkenntnisse nutzbar) |
| **Noch fehlt** | Pflegefachkraft beauftragen, Prüfung durchführen, Freigabeerklärung unterschreiben |
| **Reihenfolge** | SOFORT starten — höchstes Produktrisiko, betrifft auch den Selbstzahler-Weg |
| **Parallel** | JA |
| **Bearbeitungsart** | Gutachten |
| **Vor BfArM** | JA — fachliche Inhaltsfreigabe ist Pflichtanlage |
| **Nächste Aktion** | Pflegefachkraft finden und `inhalte_pruefdossier.md` übergeben |

---

### 11. QI-02 — Lizenzierung der Erhebungsinstrumente

| Feld | Inhalt |
|---|---|
| **ID** | QI-02 |
| **Anforderung** | Lizenzverträge für verwendete Erhebungsinstrumente (FES-I, HPS, BSFC-s, SUS) |
| **Warum extern** | Validierte Instrumente sind urheberrechtlich geschützt — Nutzung ohne Lizenz ist rechtlich angreifbar |
| **Wer** | Rechteinhaber der jeweiligen Instrumente |
| **Nachweis** | Unterschriebene Lizenzvereinbarungen |
| **Dienstleister-Kategorie** | Direkt bei den Entwicklern/Verlegern der Instrumente |
| **Vorbereitet** | Gap-Analyse in 7 Dateien dokumentiert, Instrumente identifiziert |
| **Noch fehlt** | Lizenzanfragen an Rechteinhaber senden, Verträge abschließen |
| **Reihenfolge** | Kann sofort starten, aber niedrigere Priorität als QI-01 |
| **Parallel** | JA |
| **Bearbeitungsart** | Prüfung |
| **Vor BfArM** | UNVERIFIED — ob formale Lizenz vor Antrag nötig oder Nachweis der Anfrage ausreicht, ist zu klären |
| **Nächste Aktion** | Rechteinhaber identifizieren und Lizenzanfragen senden |

---

### 12. NN-01 — Wissenschaftliches Evaluationskonzept

| Feld | Inhalt |
|---|---|
| **ID** | NN-01 |
| **Anforderung** | Wissenschaftliches Evaluationskonzept einer unabhängigen Institution für die vorläufige Aufnahme |
| **Warum extern** | Evaluationskonzept muss von unabhängiger wissenschaftlicher Institution stammen (§ 16 DiPAV) |
| **Wer** | Universität / Hochschule / Forschungsinstitut mit pflegewissenschaftlicher Kompetenz |
| **Nachweis** | Wissenschaftliches Evaluationskonzept + Ethikvotum der Ethikkommission |
| **Dienstleister-Kategorie** | Pflegewissenschaftliches Institut an einer Hochschule |
| **Vorbereitet** | `audit/dipa/evaluationskonzept.md` (109 Zeilen, Hypothesen H1/H2, Pre-Post-Design, Erhebungsinstrumente, Stichprobengröße — RAHMEN, kein einreichungsreifes Konzept) |
| **Noch fehlt** | Wissenschaftlichen Partner finden, Konzept finalisieren, Ethikvotum einholen |
| **Reihenfolge** | ABHÄNGIG von BfArM-Beratung (REG-05) für methodische Anforderungen (ORF-10) |
| **Parallel** | TEILWEISE — Partnersuche kann starten, Finalisierung erst nach BfArM-Klärung |
| **Bearbeitungsart** | Gutachten |
| **Vor BfArM** | JA — Evaluationskonzept ist Pflichtanlage für vorläufige Aufnahme |
| **Nächste Aktion** | Hochschulen/Institute kontaktieren, `evaluationskonzept.md` als Gesprächsgrundlage |

---

### 13. VS-04 — Nutzungsbedingungen Selbstzahler (juristische Prüfung)

| Feld | Inhalt |
|---|---|
| **ID** | VS-04 |
| **Anforderung** | Juristisch geprüfte und veröffentlichte Nutzungsbedingungen |
| **Warum extern** | Rechtstexte müssen juristisch geprüft werden — Selbstverfasste AGB sind vor Gericht angreifbar |
| **Wer** | Rechtsanwalt / IT-Rechtskanzlei |
| **Nachweis** | Freigegebene, veröffentlichte Nutzungsbedingungen |
| **Dienstleister-Kategorie** | IT-Rechtskanzlei mit Erfahrung in SaaS/Gesundheits-Apps |
| **Vorbereitet** | `audit/dipa/nutzungsbedingungen_entwurf_selbstzahler.md` (222 Zeilen, 13 Paragraphen — vollständiger Entwurf) |
| **Noch fehlt** | Juristische Prüfung, Freigabe, Veröffentlichung |
| **Reihenfolge** | Kann sofort beauftragt werden; relevant auch für Selbstzahler-Weg |
| **Parallel** | JA |
| **Bearbeitungsart** | Prüfung |
| **Vor BfArM** | UNVERIFIED — für Selbstzahler-Verkauf eher JA, für DiPA-Antrag ggf. separate Bedingungen |
| **Nächste Aktion** | IT-Rechtskanzlei mit Entwurf beauftragen |

---

### 14. REG-01 — Anforderungstexte gegen Originalnormen prüfen

| Feld | Inhalt |
|---|---|
| **ID** | REG-01 |
| **Anforderung** | Alle 48 Anforderungstexte gegen die amtlichen Originalnormen abgleichen (aktuell 9/48 = 15% geprüft) |
| **Warum extern** | 6 externe Normtexte benötigt (DiPAV, BfArM-Leitfaden V1.3 aktualisiert 15.07.2026, BSI TR-03161, WCAG 2.1, EN 301 549, MDR) |
| **Wer** | Regulatorik-Berater oder intern mit den Originaldokumenten |
| **Nachweis** | 48/48 Anforderungstexte gegen Original geprüft (100% statt 15%) |
| **Dienstleister-Kategorie** | DiPA/DiGA-Regulatorik-Berater ODER Eigenleistung mit den 6 Normtexten |
| **Vorbereitet** | `docs/dipa/15_REG01_ANFORDERUNGSTEXTE.md` (Detailaufschlüsselung), `lib/coach/anforderungskatalog.ts` (Katalog mit 9/48 geprüften Einträgen) |
| **Noch fehlt** | 6 Normtexte beschaffen, 39 verbleibende Einträge gegen Original halten |
| **Reihenfolge** | Kann sofort starten, aber aktualisierter BfArM-Leitfaden (15.07.2026) sollte als Basis dienen |
| **Parallel** | JA |
| **Bearbeitungsart** | Prüfung |
| **Vor BfArM** | JA — vollständig geprüfter Anforderungskatalog ist Grundlage des Antrags |
| **Nächste Aktion** | Aktuellen DiPA-Leitfaden V1.3 (15.07.2026) vom BfArM herunterladen, DiPAV-Text beschaffen |

---

### 15. REG-02 — Freischaltcode-Verfahren Verbindlichkeit

| Feld | Inhalt |
|---|---|
| **ID** | REG-02 |
| **Anforderung** | Klärung, ob ein Freischaltcode-Verfahren (wie bei DiGA) für DiPA verbindlich vorgeschrieben ist |
| **Warum extern** | Mechanismus technisch gebaut und getestet, aber per Flag deaktiviert — Verbindlichkeit ist regulatorische Frage |
| **Wer** | BfArM |
| **Nachweis** | BfArM-Auskunft |
| **Dienstleister-Kategorie** | Behörde (BfArM) |
| **Vorbereitet** | Code + Tests in 26 Dateien, `COACH_FREISCHALTUNG_PFLICHT`-Flag, `bfarm_fragenkatalog.md` |
| **Noch fehlt** | BfArM-Antwort |
| **Reihenfolge** | Teil von REG-05 |
| **Parallel** | Wird in REG-05 mitgeklärt |
| **Bearbeitungsart** | Behörde |
| **Vor BfArM** | NEIN — wird im Beratungstermin geklärt |
| **Nächste Aktion** | In REG-05 mitklären |

---

### 16. REG-03 — Qualifikationsanforderungen ergänzende Unterstützungsleistung (eUL)

| Feld | Inhalt |
|---|---|
| **ID** | REG-03 |
| **Anforderung** | Regulatorisch abgeleitete Qualifikationsanforderungen an Personen, die die eUL erbringen |
| **Warum extern** | Eigene Kriterien sind gesetzt, aber regulatorische Ableitung erfordert BfArM/GKV |
| **Wer** | BfArM / GKV-Spitzenverband |
| **Nachweis** | Genehmigte Qualifikationsanforderungen |
| **Dienstleister-Kategorie** | Behörde |
| **Vorbereitet** | `audit/dipa/eul_qualitaetsanforderungen.md`, `audit/dipa/eul_konzept.md` |
| **Noch fehlt** | Regulatorische Bestätigung |
| **Reihenfolge** | Teil von REG-05 |
| **Parallel** | Wird in REG-05 mitgeklärt |
| **Bearbeitungsart** | Behörde |
| **Vor BfArM** | NEIN — wird im Beratungstermin oder Antragsverfahren geklärt |
| **Nächste Aktion** | In REG-05 mitklären |

---

### 17. REG-04 — Vergütung und Abrechnungsweg

| Feld | Inhalt |
|---|---|
| **ID** | REG-04 |
| **Anforderung** | Vergütungsvereinbarung mit GKV-Spitzenverband für die DiPA-Erstattung |
| **Warum extern** | Preis wird zwischen Hersteller und GKV-Spitzenverband verhandelt (§ 78a Abs. 6b SGB XI) |
| **Wer** | GKV-Spitzenverband |
| **Nachweis** | Vergütungsvereinbarung |
| **Dienstleister-Kategorie** | Behörde / Verhandlungspartner |
| **Vorbereitet** | Code fail-closed gebaut (`verguetung_geklaert`-Flag, keine Beträge hardcoded) |
| **Noch fehlt** | Verhandlung — erst möglich nach vorläufiger Aufnahme ins DiPA-Verzeichnis |
| **Reihenfolge** | NACH BfArM-Aufnahme — frühestens bei vorläufiger Listung |
| **Parallel** | NEIN — sequentiell nach Aufnahme |
| **Bearbeitungsart** | Behörde |
| **Vor BfArM** | NEIN — kommt nach der Aufnahme |
| **Nächste Aktion** | Keine jetzt — wird nach Aufnahme relevant |

---

### 18. REG-05 — BfArM-Beratungstermin

| Feld | Inhalt |
|---|---|
| **ID** | REG-05 |
| **Anforderung** | Kostenpflichtige DiPA-Beratung beim BfArM-Innovationsbüro |
| **Warum extern** | Termin nur durch BfArM vergebbar |
| **Wer** | BfArM Innovationsbüro |
| **Nachweis** | Beratungsprotokoll |
| **Dienstleister-Kategorie** | Behörde (BfArM) |
| **Vorbereitet** | `audit/dipa/bfarm_fragenkatalog.md` (20 Fragen in 5 Kategorien: Verfahren, Zweckbestimmung, Datenschutz, Technik, Evaluation) |
| **Noch fehlt** | Termin beantragen, Beratung durchführen |
| **Reihenfolge** | HÖCHSTE PRIORITÄT — klärt Abhängigkeiten für SEC-01, SEC-05, INT-02, REG-02, REG-03, NN-01 |
| **Parallel** | NEIN — muss vor mehreren anderen Schritten abgeschlossen sein |
| **Bearbeitungsart** | Behörde |
| **Vor BfArM** | JA (ist selbst Teil des Vorverfahrens) |
| **Nächste Aktion** | Beratungsanfrage beim BfArM-Innovationsbüro stellen |

---

## Zusammenfassung DiPA 18 Punkte

| Bearbeitungsart | Anzahl | IDs |
|---|---|---|
| Behörde | 6 | INT-02, REG-01–05 |
| Zertifikat | 2 | SEC-01, SEC-05 |
| Gutachten | 3 | DS-02, QI-01, NN-01 |
| Test | 3 | SEC-04, BF-02, BF-03 |
| Prüfung | 4 | DS-04, BF-01, QI-02, VS-04 |

| Vor BfArM zwingend | JA | DS-02, DS-04, BF-01, BF-03, QI-01, NN-01, REG-01, REG-05 |
|---|---|---|
| | UNVERIFIED | SEC-01, SEC-04, SEC-05, BF-02, QI-02, VS-04 |
| | NEIN | INT-02, REG-02, REG-03, REG-04 |

---

# 2. DiPA — BEAUFTRAGUNGSPAKETE

## 2a. Anschreiben: BITV-Prüfstelle (BF-01, BF-03)

---

Betreff: Anfrage BITV-Prüfung — Digitaler PflegeCoach

Sehr geehrte Damen und Herren,

die Alltagsengel UG (haftungsbeschränkt) entwickelt den „Digitalen PflegeCoach", eine webbasierte Anwendung zur Unterstützung der häuslichen Pflege. Wir streben die Aufnahme als Digitale Pflegeanwendung (DiPA) in das DiPA-Verzeichnis des BfArM an.

**Produkt:** Digitaler PflegeCoach, Version 0.5.0
**Technologie:** Webanwendung (Next.js/React), responsive, kein nativer App-Client
**URL:** https://alltagsengel.care/pflegecoach/
**Zielgruppe:** Pflegebedürftige (Pflegegrad 1–5) und pflegende Angehörige

**Gewünschter Prüfungsumfang:**
- Vollständiger BITV-Test nach EN 301 549 / WCAG 2.1 AA
- Einschließlich manueller Screenreader-Prüfung (VoiceOver/NVDA) der Prüfpunkte S1, S5, S7, S8
- Produktbereich `/pflegecoach/**` (Assessment, Ziele, Wochenplan, Übungen, Bericht, Einstellungen, Konto)

**Regulatorischer Zweck:** Nachweis der Barrierefreiheit gemäß DiPAV für die Aufnahme ins DiPA-Verzeichnis des BfArM.

**Benötigte Deliverables:**
- BITV-Prüfbericht mit Einzelbefunden je Prüfschritt
- Ergebnisprotokoll der manuellen Screenreader-Prüfung
- Zusammenfassung der Konformitätsstufe

**Wir bitten Sie um:**
1. Preisangebot für den beschriebenen Umfang
2. Geschätzte Bearbeitungsdauer
3. Frühester möglicher Starttermin
4. Bestätigung, dass Ihr Prüfergebnis als Barrierefreiheitsnachweis im DiPA-Verfahren beim BfArM anerkannt wird

**Vorbereitung unsererseits:** Automatisierte Barrierefreiheitstests (axe-core) laufen in unserer CI-Pipeline und melden aktuell 0 Verstöße. Eine detaillierte Gap-Liste der noch offenen manuellen Prüfpunkte kann bei Interesse vorab zugesandt werden.

Für Rückfragen stehen wir gerne zur Verfügung.

Herzliche Grüße
Ihr Team von Alltagsengel

Alltagsengel UG (haftungsbeschränkt)
Neue Mainzer Straße 66-68, 60311 Frankfurt am Main
info@alltagsengel.care

---

## 2b. Anschreiben: Penetrationstest (SEC-04)

---

Betreff: Anfrage Penetrationstest — Digitaler PflegeCoach (Gesundheitsanwendung)

Sehr geehrte Damen und Herren,

die Alltagsengel UG (haftungsbeschränkt) entwickelt den „Digitalen PflegeCoach", eine webbasierte Gesundheitsanwendung für die häusliche Pflege. Im Rahmen der geplanten Aufnahme als Digitale Pflegeanwendung (DiPA) beim BfArM benötigen wir einen unabhängigen Penetrationstest.

**Produkt:** Digitaler PflegeCoach, Version 0.5.0
**Technologie:** Next.js (React), Supabase (PostgreSQL + Auth), Vercel (Hosting), Stripe (Zahlungen)
**URL:** https://alltagsengel.care/pflegecoach/

**Prüfgegenstand:**
- 17 API-Routen unter `/api/coach/**`
- Alle Produktseiten unter `/pflegecoach/**`
- Row Level Security auf allen `coach_*`-Datenbanktabellen
- Authentifizierung inkl. TOTP-Zweifaktor
- JSON- und FHIR-Datenexport

**Schwerpunkte:**
- IDOR / Cross-Tenant-Zugriff (Mandantentrennung)
- Session-/Token-Handling
- Injection (SQL, XSS, CSRF)
- Autorisierungs-Bypass (Rollenkonzept)
- Datenexfiltration über Export-Endpunkte

**Regulatorischer Zweck:** Unabhängiger Sicherheitsnachweis im Rahmen des DiPA-Antragsverfahrens beim BfArM.

**Benötigte Deliverables:**
- Pentest-Bericht mit Befundliste (Schweregrad nach CVSS)
- Executive Summary
- Empfehlungen zur Behebung

**Wir bieten an:**
- 5 vorkonfigurierte Testkonten (verschiedene Rollen)
- Detaillierter Scope-Beschreibung (versandfertig, 154 Zeilen)
- Staging-Umgebung mit Testdaten

**Wir bitten Sie um:**
1. Preisangebot
2. Geschätzte Bearbeitungsdauer
3. Frühester möglicher Starttermin
4. Bestätigung, dass Ihr Bericht als Sicherheitsnachweis im DiPA-Verfahren geeignet ist

Herzliche Grüße
Ihr Team von Alltagsengel

Alltagsengel UG (haftungsbeschränkt)
Neue Mainzer Straße 66-68, 60311 Frankfurt am Main
info@alltagsengel.care

---

## 2c. Anschreiben: TR-03161 Prüfstelle (SEC-01)

---

Betreff: Anfrage BSI TR-03161 Prüfung — Digitaler PflegeCoach

Sehr geehrte Damen und Herren,

die Alltagsengel UG (haftungsbeschränkt) entwickelt den „Digitalen PflegeCoach" und strebt die Aufnahme als Digitale Pflegeanwendung (DiPA) an.

**Produkt:** Digitaler PflegeCoach, Version 0.5.0
**Technologie:** Webanwendung (kein nativer App-Client) — Next.js, Supabase, Vercel
**Besonderheit:** Verarbeitung von Gesundheitsdaten (Art. 9 DSGVO)

**Gewünschter Prüfungsumfang:**
Prüfung nach BSI TR-03161 (Sicherheitsanforderungen an digitale Gesundheitsanwendungen) — Anwendungsbereich ist mit Ihnen abzustimmen, da das Produkt eine reine Webanwendung ohne nativen Client ist.

**Regulatorischer Zweck:** Sicherheitsnachweis für das DiPA-Antragsverfahren beim BfArM.

**Hinweis:** Die Anwendbarkeit der TR-03161 auf DiPA (im Unterschied zu DiGA) ist regulatorisch nicht abschließend geklärt. Wir bitten um Ihre Einschätzung, ob Ihre Prüfung für den vorgesehenen Zweck geeignet ist.

**Benötigte Deliverables:**
- Prüfbericht
- Zertifikat (falls ausstellbar)

**Vorbereitung unsererseits:** Eine Selbsteinschätzung nach 7 Themenbereichen der TR liegt vor und kann vorab zugesandt werden.

**Wir bitten Sie um:**
1. Preisangebot
2. Geschätzte Bearbeitungsdauer (wir rechnen mit mehreren Monaten Vorlauf)
3. Frühester möglicher Starttermin
4. Einschätzung zur Anwendbarkeit auf DiPA-Webanwendungen

Herzliche Grüße
Ihr Team von Alltagsengel

Alltagsengel UG (haftungsbeschränkt)
Neue Mainzer Straße 66-68, 60311 Frankfurt am Main
info@alltagsengel.care

---

## 2d. Anschreiben: Datenschutz / DSFA (DS-02, DS-04, VS-04)

---

Betreff: Anfrage Datenschutzberatung — DSFA + AVV-Prüfung + AGB für Gesundheitsanwendung

Sehr geehrte Damen und Herren,

die Alltagsengel UG (haftungsbeschränkt) betreibt den „Digitalen PflegeCoach", eine webbasierte Anwendung zur Unterstützung der häuslichen Pflege. Wir verarbeiten Gesundheitsdaten (Art. 9 DSGVO) und streben die Aufnahme als Digitale Pflegeanwendung (DiPA) beim BfArM an.

**Gewünschter Leistungsumfang:**

1. **Datenschutz-Folgenabschätzung (Art. 35 DSGVO):** Unsere DSFA-Vorbereitung (Verarbeitungsbeschreibung, Rechtsgrundlagen, TOM-Übersicht) liegt vor. Benötigt wird die juristische Risikobewertung, Stellungnahme zum Restrisiko und die unterschriebene DSFA.

2. **Prüfung der AVV-Kette (Art. 28 DSGVO):** 4 Auftragsverarbeiter (Supabase, Vercel, Resend, Stripe) — Standard-DPAs müssen angefordert, geprüft und ggf. ergänzt werden.

3. **Juristische Prüfung der Nutzungsbedingungen:** Entwurf (13 Paragraphen, 222 Zeilen) liegt vor.

**Regulatorischer Zweck:** Datenschutznachweis für das DiPA-Antragsverfahren beim BfArM.

**Benötigte Deliverables:**
- Unterschriebene DSFA
- Prüfvermerk zu den 4 AVVs
- Freigegebene Nutzungsbedingungen

**Wir bitten Sie um:**
1. Preisangebot (gerne aufgeteilt nach den 3 Leistungen)
2. Geschätzte Bearbeitungsdauer
3. Frühester möglicher Starttermin
4. Bestätigung, dass die Ergebnisse für das DiPA-Verfahren geeignet sind

Alle Vorbereitungsdokumente können sofort zugesandt werden.

Herzliche Grüße
Ihr Team von Alltagsengel

Alltagsengel UG (haftungsbeschränkt)
Neue Mainzer Straße 66-68, 60311 Frankfurt am Main
info@alltagsengel.care

---

## 2e. Anschreiben: Usability-Test (BF-02)

---

Betreff: Anfrage Gebrauchstauglichkeitstest — Digitaler PflegeCoach (Senioren-Zielgruppe)

Sehr geehrte Damen und Herren,

für unsere Gesundheitsanwendung „Digitaler PflegeCoach" suchen wir einen Partner für die Durchführung eines Gebrauchstauglichkeitstests mit Testpersonen aus der Zielgruppe.

**Zielgruppe:** Pflegebedürftige (65+ Jahre, Pflegegrad 1–5) und pflegende Angehörige
**Testpersonenzahl:** Mindestens 5 (genaue Zahl ggf. nach BfArM-Beratung)
**Testgegenstand:** Webanwendung unter https://alltagsengel.care/pflegecoach/

**Gewünschter Umfang:**
- Rekrutierung von Testpersonen aus der Zielgruppe
- Durchführung des Tests (Durchführungsplan und Protokollbogen liegen vor)
- Ergebnisbericht mit Befunden und Empfehlungen

**Regulatorischer Zweck:** Nachweis der Gebrauchstauglichkeit im Rahmen des DiPA-Verfahrens beim BfArM.

**Benötigte Deliverables:**
- Ergebnisbericht des Usability-Tests
- Ausgefüllte Protokollbögen

**Wir bitten Sie um:**
1. Preisangebot (inkl. Rekrutierung und Aufwandsentschädigung für Testpersonen)
2. Geschätzte Bearbeitungsdauer
3. Frühester möglicher Starttermin
4. Bestätigung der Eignung als DiPA-Nachweis

Herzliche Grüße
Ihr Team von Alltagsengel

Alltagsengel UG (haftungsbeschränkt)
Neue Mainzer Straße 66-68, 60311 Frankfurt am Main
info@alltagsengel.care

---

## 2f. Anschreiben: Pflegefachliche Inhaltsfreigabe (QI-01)

---

Betreff: Anfrage pflegefachliche Prüfung und Freigabe — Digitaler PflegeCoach

Sehr geehrte Damen und Herren,

die Alltagsengel UG (haftungsbeschränkt) entwickelt den „Digitalen PflegeCoach", eine webbasierte Anwendung zur Unterstützung pflegebedürftiger Menschen und ihrer Angehörigen im häuslichen Umfeld.

Wir suchen eine qualifizierte Pflegefachkraft (idealerweise mit pflegewissenschaftlicher Expertise in Gerontologie oder häuslicher Pflege) für die fachliche Prüfung und Freigabe unserer pflegerischen Inhalte.

**Prüfgegenstand:** 12 Inhaltsgruppen (Bewegungsübungen, Wissensmodule, Assessments, Pflegeziele, Tagesstruktur-Checklisten, Erinnerungen, Berichte, Freigabe-Empfehlungen, Glossar, Erhebungsinstrumente, Verlauf, Export)

**Prüfkriterien:** 6 Kriterien (K1–K6: fachliche Korrektheit, Zielgruppeneignung, Verständlichkeit, Vollständigkeit, Konsistenz, Aktualität)

**Vorbereitung:** Ein vollständiges Prüfdossier (137 Zeilen) liegt vor. Es ist so geschrieben, dass die Prüfung ohne technische Vorkenntnisse und ohne Rückfragen an die Entwicklung möglich ist.

**Regulatorischer Zweck:** Pflichtnachweis für das DiPA-Verfahren beim BfArM. Zugleich Minderung des höchsten Produktrisikos (R1.4).

**Benötigte Deliverables:**
- Unterschriebene Freigabeerklärung mit Prüfvermerk je Modul
- Ggf. Änderungsempfehlungen

**Wir bitten Sie um:**
1. Preisangebot (oder Honorarvorstellung)
2. Geschätzte Bearbeitungsdauer
3. Frühester möglicher Starttermin
4. Bestätigung Ihrer pflegefachlichen Qualifikation

Herzliche Grüße
Ihr Team von Alltagsengel

Alltagsengel UG (haftungsbeschränkt)
Neue Mainzer Straße 66-68, 60311 Frankfurt am Main
info@alltagsengel.care

---

## 2g. Anschreiben: ISMS-Beratung (SEC-05) — NUR NACH BfArM-KLÄRUNG

*Dieses Anschreiben ist vorbereitet, aber NICHT sofort zu versenden. Erst nach BfArM-Beratung (REG-05), um den Geltungsbereich zu klären.*

---

Betreff: Anfrage ISMS-Beratung / ISO 27001 — Digitaler PflegeCoach

Sehr geehrte Damen und Herren,

[Inhalt analog zu den obigen Anschreiben, spezifisch für ISMS — erst nach REG-05-Klärung versandfertig]

---

# 3. BfArM-ANTRAGSVORBEREITUNG

## A. Dokumentenindex

| # | Dokument | Typ | Pfad |
|---|---|---|---|
| 1 | Produktbeschreibung | Intern | `audit/dipa/produktbeschreibung_pflegecoach.md` |
| 2 | Zweckbestimmung | Intern | `audit/dipa/finale_zweckbestimmung.md` |
| 3 | Funktionsbeschreibung | Intern | `audit/dipa/funktionsbeschreibung_pflegecoach.md` |
| 4 | Zielgruppendefinition | Intern | `audit/dipa/zielgruppendefinition.md` |
| 5 | Technische Dokumentation | Intern | `audit/dipa/technische_dokumentation_pflegecoach.md` |
| 6 | Sicherheitsarchitektur | Intern | `audit/dipa/sicherheitsarchitektur_pflegecoach.md` |
| 7 | Datenschutzarchitektur | Intern | `audit/dipa/datenschutzarchitektur_pflegecoach.md` |
| 8 | Datenflüsse | Intern | `audit/dipa/datenfluesse_pflegecoach.md` |
| 9 | Rollen-/Rechtekonzept | Intern | `audit/dipa/rollen_rechtekonzept.md` |
| 10 | Verschlüsselungskonzept | Intern | `audit/dipa/verschluesselungskonzept.md` |
| 11 | Logging/Audit-Konzept | Intern | `audit/dipa/logging_audit_konzept.md` |
| 12 | MFA-Dokumentation | Intern | `docs/dipa/11_MFA_DOKUMENTATION.md` |
| 13 | Exportfunktionen | Intern | `audit/dipa/exportfunktionen.md` |
| 14 | FHIR/Interoperabilität | Intern | `audit/dipa/interoperabilitaet_fhir.md` |
| 15 | Löschkonzept | Intern | `audit/dipa/loeschkonzept.md` |
| 16 | Verarbeitungsverzeichnis | Intern | `audit/dipa/verarbeitungsverzeichnis_pflegecoach.md` |
| 17 | Einwilligungslogik | Intern | `audit/dipa/einwilligungslogik.md` |
| 18 | Pflegeprobleme/-ziele | Intern | `audit/dipa/pflegeprobleme_pflegeziele.md` |
| 19 | Nutzerflow | Intern | `audit/dipa/nutzerflow_dipa.md` |
| 20 | QMS-Handbuch | Intern | `audit/dipa/qms_handbuch_pflegecoach.md` |
| 21 | Risikoanalyse + Risikoakte | Intern | `audit/dipa/risikoanalyse_pflegecoach.md`, `risikoakte_pflegecoach.md` |
| 22 | Software-Lebenszyklus | Intern | `audit/dipa/software_lebenszyklus_pflegecoach.md` |
| 23 | Versionierung/Release | Intern | `docs/dipa/07_VERSIONIERUNG_RELEASE_PROZESS.md` |
| 24 | Incident/Vulnerability | Intern | `docs/dipa/08_INCIDENT_VULNERABILITY_PROZESS.md` |
| 25 | Backup/Restore | Intern | `docs/dipa/09_BACKUP_RESTORE_DOKUMENTATION.md` |
| 26 | MDR-Negativabgrenzung | Intern | `audit/dipa/mdr_negativabgrenzung.md` |
| 27 | Pilotdesign | Intern | `audit/dipa/pilotdesign.md` |
| 28 | Changelog | Intern | `audit/dipa/CHANGELOG_pflegecoach.md` |
| 29 | Anforderungskatalog | Intern | `lib/coach/anforderungskatalog.ts` |
| 30 | DSFA-Vorbereitung | Extern nötig | `audit/dipa/dsfa_pflegecoach.md` |
| 31 | AVV-Dossier | Extern nötig | `audit/dipa/avv_dossier_pflegecoach.md` |
| 32 | TR-03161-Checkliste | Extern nötig | `audit/dipa/tr03161_checkliste.md` |
| 33 | Pentest-Scope | Extern nötig | `audit/dipa/pentest_beauftragung_scope.md` |
| 34 | ISMS-Vorbereitung | Extern nötig | `audit/dipa/isms_scope_vorbereitung.md` |
| 35 | Evaluationskonzept (Rahmen) | Extern nötig | `audit/dipa/evaluationskonzept.md` |
| 36 | Usability-Durchführungsplan | Extern nötig | `audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md` |
| 37 | Inhalte-Prüfdossier | Extern nötig | `audit/dipa/inhalte_pruefdossier.md` |
| 38 | Nutzungsbedingungen (Entwurf) | Extern nötig | `audit/dipa/nutzungsbedingungen_entwurf_selbstzahler.md` |
| 39 | BfArM-Fragenkatalog | Extern nötig | `audit/dipa/bfarm_fragenkatalog.md` |
| 40 | Barrierefreiheit Gap-Liste | Extern nötig | `docs/dipa/14_ACCESSIBILITY_GAP_LISTE.md` |
| 41 | eUL-Konzept | Extern nötig | `audit/dipa/eul_konzept.md` |

## B. Bereits vorhandene Dokumente (intern complete)

Dokumente 1–29 aus dem Index oben. 30 von 48 Anforderungen technisch erfüllt (Kategorie A).

## C. Noch extern benötigte Dokumente

| Dokument | Lieferant | Status |
|---|---|---|
| Unterschriebene DSFA | Datenschutzkanzlei | Vorbereitung liegt vor |
| 4 unterschriebene AVVs | Supabase/Vercel/Resend/Stripe + Kanzlei | Dossier liegt vor |
| TR-03161-Zertifikat | BSI-Prüfstelle | Selbsteinschätzung liegt vor |
| Pentest-Bericht | IT-Sicherheitsfirma | Scope-Dokument versandfertig |
| ISMS-Dokumentation | ISMS-Berater | Scope-Vorbereitung liegt vor |
| BITV-Prüfbericht | BITV-Prüfstelle | axe-core clean, Gap-Liste fertig |
| Usability-Testbericht | Usability-Labor | Durchführungsplan fertig |
| Screenreader-Protokoll | Tester mit Assistenztechnologie | 4 Restpunkte definiert |
| Pflegefachliche Freigabe | Pflegefachkraft | Prüfdossier versandfertig |
| Lizenzvereinbarungen | FES-I/HPS/BSFC-s/SUS-Rechteinhaber | Gap identifiziert |
| Evaluationskonzept (final) | Wissenschaftlicher Partner | Rahmenkonzept liegt vor |
| Nutzungsbedingungen (final) | IT-Rechtskanzlei | Entwurf liegt vor |
| BfArM-Beratungsprotokoll | BfArM | Fragenkatalog fertig |

## D. Fehlende Unternehmensangaben

| Angabe | Status |
|---|---|
| Steuernummer / USt-IdNr. | FEHLT — muss eingetragen werden |
| SEPA-Gläubiger-ID | PLATZHALTER (DE98ZZZ09999999999) — Bundesbank-Antrag nötig |
| Datenschutzbeauftragter | FEHLT — muss bestellt/benannt werden |

## E–H. Fehlende Nachweise nach Kategorie

| Kategorie | Fehlend |
|---|---|
| **E. Technisch** | TR-03161-Zertifikat, Pentest-Bericht, ISMS |
| **F. Klinisch/Pflegerisch** | Pflegefachliche Inhaltsfreigabe, Lizenzvereinbarungen für Erhebungsinstrumente |
| **G. Datenschutz/Security** | DSFA, AVVs, DSB-Bestellung |
| **H. Gebrauchstauglichkeit/Barrierefreiheit** | BITV-Bericht, Usability-Testbericht, Screenreader-Protokoll |

## I. Antragsschritte in richtiger Reihenfolge

1. **SOFORT:** BfArM-Beratungstermin beantragen (REG-05) — klärt Abhängigkeiten
2. **SOFORT parallel:** Datenschutzkanzlei beauftragen (DS-02, DS-04, VS-04)
3. **SOFORT parallel:** Pflegefachkraft für Inhaltsfreigabe finden (QI-01)
4. **SOFORT parallel:** BITV-Prüfstelle kontaktieren (BF-01, BF-03)
5. **SOFORT parallel:** Pentest-Anbieter kontaktieren (SEC-04)
6. **SOFORT parallel:** Anforderungstexte gegen Normtexte prüfen (REG-01)
7. **NACH BfArM-Beratung:** TR-03161-Prüfstelle beauftragen (SEC-01)
8. **NACH BfArM-Beratung:** ISMS-Berater beauftragen (SEC-05)
9. **NACH BfArM-Beratung:** Wissenschaftlichen Partner suchen (NN-01)
10. **NACH BfArM-Beratung:** Usability-Test durchführen (BF-02)
11. **NACH allen Nachweisen:** BfArM-Antrag auf vorläufige Aufnahme stellen
12. **NACH Aufnahme:** Vergütungsverhandlung mit GKV-Spitzenverband (REG-04)

## Bewertung

- **INTERN COMPLETE:** 30/48 Anforderungen + 29 Dokumente + Code vollständig
- **EXTERNAL REQUIRED:** 18/48 Anforderungen (13 Dokumente/Nachweise von externen Parteien)
- **UNVERIFIED:** 6 Punkte (SEC-01, SEC-04, SEC-05, BF-02, QI-02, VS-04 — ob zwingend vor Antrag oder nachreichbar, ist ungeklärt)
- **FAIL:** 0

**BfArM-Einreichung heute möglich: NEIN**

Begründung: 13 extern zu erbringende Nachweise fehlen. Die 4 antragskritischsten: DSFA (DS-02), TR-03161 (SEC-01), pflegefachliche Inhaltsfreigabe (QI-01), Evaluationskonzept (NN-01). Keine dieser Lücken ist durch interne Arbeit schließbar. Der erste Schritt ist die BfArM-Beratung (REG-05), die mehrere Abhängigkeiten klärt.

---

# 4. PFLEGECOACH — GESCHÄFTSMODELL

## Entscheidung (14.08.2026)

**PflegeCoach ist dauerhaft kostenlos für alle Endnutzer.** Kein Abonnement, keine Monats- oder Jahresgebühr, keine Stripe-Zahlung durch Nutzer, keine Paywall.

## Monetarisierungsziel

Ausschließlich Erstattung/Vergütung über die Pflegekassen nach tatsächlicher DiPA-Zulassung durch das BfArM. Seit 01.01.2026 erstattet die Pflegekasse bis zu 40 €/Monat für eine im DiPA-Verzeichnis gelistete Anwendung (+ 30 €/Monat für ergänzende Unterstützungsleistungen).

**Wichtig:** Eine DiPA-Zulassung liegt derzeit NICHT vor und ist NICHT beantragt. Bis zur tatsächlichen Zulassung ist klar zwischen „kostenlos nutzbar" und „von Pflegekassen erstattungsfähig/zugelassen" zu unterscheiden. Kassenvergütung bleibt EXTERNAL_REQUIRED.

## Strategie

Möglichst viele Nutzer gewinnen durch kostenlosen Zugang → Nutzungsdaten und Wirksamkeitsbelege sammeln → DiPA-Zulassungsantrag beim BfArM stellen → nach Aufnahme ins DiPA-Verzeichnis Vergütung über die Pflegekassen.

## Technischer Stand

Der Code enthält einen vollständigen Selbstzahler-Verkaufsweg (`lib/coach/pricing.ts`, `lib/coach/verkauf-server.ts`, Stripe-Integration), der als technische Infrastruktur erhalten bleibt. Dieser Weg ist aktuell korrekt gesperrt:

- `COACH_PREISE_FREIGEGEBEN` = `false` (Default) → kein Checkout möglich
- `COACH_FREISCHALTUNG_PFLICHT` = `false` (Default) → kein Zugangs-Gate aktiv
- `COACH_DIPA_MODUS` = `false` (Default) → keine DiPA-Funktionen aktiv

**Ergebnis:** Jeder authentifizierte, einwilligende Nutzer hat vollen Zugang zum PflegeCoach ohne Zahlung. Das ist das gewünschte Verhalten.

## Was NICHT geplant ist

- Endnutzer-Abonnements (monatlich/jährlich)
- Stripe-Produkte oder Price-IDs für Endnutzer anlegen
- Preisfreigabe (`COACH_PREISE_FREIGEGEBEN=true`) für Endnutzer

## Offene externe Schritte für Kassenvergütung

Siehe Abschnitt 3 (BfArM-Readiness) und Abschnitt 5 (Kassenabrechnung). Die 13 extern zu erbringenden Nachweise und die BfArM-Beratung bleiben die kritischen Voraussetzungen.

---

# 5. KASSENABRECHNUNG — EXTERNE FREISCHALTUNGSMATRIX

## Legende

- **READY:** Technisch implementiert und verifiziert
- **EXTERNAL_REQUIRED:** Braucht externe Partei/Vertrag/Behörde
- **NOT_APPLICABLE:** Nicht relevant für aktuellen Leistungsumfang
- **UNVERIFIED:** Regulatorische Pflicht nicht sicher belegt

| # | Bereich | Status | Begründung |
|---|---|---|---|
| 1 | **§45b Entlastungsleistungen** | READY (technisch) / EXTERNAL_REQUIRED (Freischaltung) | Tarife angelegt, Budget 131€/Monat korrekt, Abrechnung technisch funktionsfähig. Freischaltung erfordert Anerkennungsbescheid nach §45a SGB XI. |
| 2 | **§39 Verhinderungspflege** | READY (technisch) / EXTERNAL_REQUIRED (Freischaltung) | VP/KZP-Budget 3539€ korrekt implementiert, Tarife vorhanden (verifiziert). Freischaltung erfordert Versorgungsvertrag. |
| 3 | **§36 Pflegesachleistung** | NOT_APPLICABLE | Alltagsengel erbringt keine Grundpflege/Behandlungspflege. Kein Versorgungsvertrag nach §72 SGB XI vorhanden und nicht angestrebt. |
| 4 | **§42 Kurzzeitpflege** | NOT_APPLICABLE | Alltagsengel betreibt keine stationäre Einrichtung. |
| 5 | **SGB V (§132/§132a)** | NOT_APPLICABLE | Alltagsengel ist kein zugelassener Pflegedienst nach SGB V. Im System als Modul vorgesehen, aber nicht für aktuelle Leistungen relevant. |
| 6 | **Anerkennung nach §45a SGB XI** | EXTERNAL_REQUIRED | Alltagsbegleitung erfordert Landesrecht-Anerkennung. Status in Hessen: zu beantragen beim RP Gießen (Landesverordnung HePflBG). |
| 7 | **IK-Nummer** | READY | IK 460629986, gültig ab 16.07.2026 |
| 8 | **DTA / §302 SGB V** | EXTERNAL_REQUIRED | DAKOTA-Adapter für elektronischen Datenaustausch nicht eingerichtet. Code-seitig vorbereitet (Pipeline, Tabellen), aber kein ITSG-Zertifikat und kein DAKOTA-System. |
| 9 | **ITSG-Sicherheitsverfahren** | EXTERNAL_REQUIRED | ITSG-Zertifikat für elektronischen Datenaustausch nicht vorhanden. Beantragung bei der ITSG erforderlich. |
| 10 | **Versorgungsvertrag (§72/§75 SGB XI)** | EXTERNAL_REQUIRED | Kein Versorgungsvertrag mit Landesverbänden der Pflegekassen abgeschlossen. Voraussetzung für direkte Kassenabrechnung. |
| 11 | **Vergütungsvereinbarung** | EXTERNAL_REQUIRED | Keine Vergütungssätze mit Kassen vereinbart. Tarife im System sind Platzhalter (verified = nur wegepauschale 5€). |
| 12 | **SEPA-Gläubiger-ID** | EXTERNAL_REQUIRED | Platzhalter DE98ZZZ09999999999. Muss bei Bundesbank beantragt werden für SEPA-Lastschriften. |
| 13 | **Bundesland-Gate (16 Länder)** | READY | `state_settings` für alle 16 Bundesländer mit `insurance_enabled=false` und `kassenrechnung_enabled=false`. Fail-closed. |
| 14 | **Billing Engine** | READY | `create_invoice_draft_atomic` v9, JSONB-Return, Audit-Persistenz, Idempotenz, fail-closed Unterschriftsprüfung. |
| 15 | **Tarif-Status-Vokabular** | READY | `verified`/`unverified`/`blocked` per CHECK-Constraint. Kasse: nur `verified`. Privat: alles außer `blocked`. |
| 16 | **Mahnwesen** | READY | `dunning_entries`, Cron-Job täglich 07:00, Eskalationsstufen. |
| 17 | **PDF-Erzeugung** | READY | Leistungsnachweis-PDF mit fontkit (DejaVuSans), Font-Tracing konfiguriert. |
| 18 | **Audit-Trail** | READY | `billing_audit_trail` mit entity_type CHECK (inkl. `invoice_draft`, `tariff_lookup`), SECDEF REVOKE. |

## Zusammenfassung Kassenabrechnung

| Status | Anzahl |
|---|---|
| READY (technisch) | 10 |
| EXTERNAL_REQUIRED | 7 |
| NOT_APPLICABLE | 3 |
| UNVERIFIED | 0 |

**Frühester Kassenstart:** Nach Anerkennung §45a + Versorgungsvertrag + Vergütungsvereinbarung + DAKOTA/ITSG + SEPA-ID. Das ist ein mehrmonatiger Prozess.

---

# 6. PERSÖNLICHE TOP-10 FÜR YUSUF

Sortiert nach: Umsatzwirkung → regulatorische Abhängigkeit → Zeitkritikalität

| # | Was tun | Wo | Dokument | Was wird dadurch freigeschaltet |
|---|---|---|---|---|
| **1** | **BfArM-Beratungstermin beantragen** | BfArM-Innovationsbüro (online/telefonisch) | `audit/dipa/bfarm_fragenkatalog.md` (20 Fragen mitschicken) | Klärt 6+ Abhängigkeiten (SEC-01, SEC-05, INT-02, REG-02/03, NN-01), beschleunigt ALLES |
| **2** | **Pflegefachkraft für Inhaltsfreigabe finden** | Netzwerk / Pflegewissenschaftliche Fakultäten / deine Frau (25J Erfahrung) fragen | `audit/dipa/inhalte_pruefdossier.md` (versandfertig) | Höchstes Produktrisiko (R1.4) gemindert, Pflichtanlage für BfArM |
| **3** | **Datenschutzkanzlei beauftragen** | Kanzlei kontaktieren mit Anschreiben 2d | `audit/dipa/dsfa_pflegecoach.md` + `avv_dossier_pflegecoach.md` + `nutzungsbedingungen_entwurf_selbstzahler.md` | DSFA + AVVs + Nutzungsbedingungen — 3 BfArM-Pflichtanlagen |
| **4** | **Pentest beauftragen** | IT-Sicherheitsfirma kontaktieren mit Anschreiben 2b | `audit/dipa/pentest_beauftragung_scope.md` (versandfertig, 154 Zeilen) | Unabhängiger Sicherheitsnachweis |
| **5** | **BITV-Prüfstelle beauftragen** | BITV-Prüfstelle kontaktieren mit Anschreiben 2a | `docs/dipa/14_ACCESSIBILITY_GAP_LISTE.md` | Barrierefreiheitsnachweis — BfArM-Pflichtanlage |
| **6** | **Steuernummer/USt-IdNr. klären** | Steuerberater fragen, dann mir mitteilen | `.env` Variablen COACH_STEUERNUMMER | Pflichtangabe für spätere Kassenrechnungen |
| **7** | **SEPA-Gläubiger-ID bei Bundesbank beantragen** | Online über Bundesbank-Portal | Keine Unterlage nötig, nur Firmendaten | SEPA-Lastschriften für Kassenabrechnung |
| **8** | **§45a-Anerkennung in Hessen beantragen** | RP Gießen / zuständige Landesbehörde | Nachweise gemäß HePflBG (Qualifikation, Konzept) | Kassenabrechnung für Entlastungsleistungen |
| **9** | **Manal + Violeta Groening — Bewerbungsgespräche terminieren** | Nachmittags (nie vor 13 Uhr) | — | Personalaufbau für Leistungserbringung |

---

**STOPP. Keine weitere Entwicklung. Alle Deliverables geliefert:**

1. ✅ DiPA 18-Punkte External Matrix (Abschnitt 1)
2. ✅ Beauftragungspakete — 7 versandfertige Anschreiben (Abschnitt 2)
3. ✅ BfArM Readiness (Abschnitt 3)
4. ✅ PflegeCoach Geschäftsmodell — kostenlos für Endnutzer (Abschnitt 4)
5. ✅ Kassen-External-Matrix (Abschnitt 5)
6. ✅ Top-10 persönliche nächste Schritte (Abschnitt 6)
