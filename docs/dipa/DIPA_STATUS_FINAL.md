# DiPA — Status final (15.08.2026, WS4: intern lösbare Punkte abgearbeitet)

> **Diese Datei ist der aktuelle Arbeitsstand.** Sie ersetzt keine der
> Analyse-Dokumente unter `docs/dipa/` (insbesondere nicht
> `21_FINAL_MATRIX_2026-08-15.md` für die vollständige 48-Punkte-Prosa oder
> `24_REGULATORIK_TIEFENPRUEFUNG_2026-08-15.md` für die Kostenschätzung),
> sondern verdichtet sie auf die Frage dieses Durchgangs: **von den 13
> Punkten, die am Morgen des 15.08. noch nicht `PASS_INTERNAL` waren — was
> davon war doch intern zu Ende zu bringen?**
>
> Maschinenlesbare Quelle unverändert: `lib/coach/anforderungskatalog.ts`,
> geprüft über `npm run dipa:katalog`. Neu in diesem Durchgang:
> `lib/coach/dipa-compliance.ts`, geprüft über `npm run dipa:compliance`.

---

## Ausgangslage (Stand Beginn WS4)

```
PASS_INTERNAL                      34
EXTERNAL_EVIDENCE_REQUIRED         12
PARTIAL                             1
FAIL / NOT_APPLICABLE / UNVERIFIED  0
──────────────────────────────────────
Gesamt                             48
```

Auftrag: die 12 EXTERNAL- und die 1 PARTIAL-Position noch einmal einzeln
darauf prüfen, ob ein Teil davon entgegen der bisherigen Einordnung doch
intern abschließbar ist — Vorlagen, Checklisten, Code, Konfiguration,
Testszenarien.

## Ergebnis in einem Satz

**Drei der zwölf „externen" Punkte brauchen gar keinen externen Akteur** —
sie waren falsch als Bearbeitungsklasse „D" (externer Dienstleister nötig)
eingeordnet, obwohl der eigene Analysetext bereits belegte, dass eine
Geschäftsführungsentscheidung reicht. Der PARTIAL-Punkt (BF-03) hat jetzt
ein vollständiges Ergebnis-Formular für den verbleibenden manuellen
Durchgang. An den neun echten externen Abhängigkeiten (Zertifizierungs-
stellen, wissenschaftliches Institut, Kanzlei, Behörde) ändert sich nichts
— die lassen sich nicht wegdokumentieren, nur bestmöglich vorbereiten, und
das waren sie zum größten Teil schon.

---

## A) Sofort intern erledigt in diesem Durchgang

| Was | Datei(en) | Wirkung |
|---|---|---|
| `AK-DS-02`/`AK-DS-04` Bearbeitungsklasse D→C korrigiert | `lib/coach/anforderungskatalog.ts` | Beseitigt einen Selbstwiderspruch: beide Einträge sagten schon in ihrem eigenen Analysetext „keine externe Stelle vorgeschrieben", waren aber als „externer Dienstleister nötig" (D) klassifiziert |
| DSFA-Risikomatrix (Eintrittswahrscheinlichkeit × Schwere für R1–R9) als Vorschlag ausgearbeitet | `audit/dipa/dsfa_pflegecoach.md` §4b | Aus neun offenen `[zu bewerten]`-Feldern wird ein Bestätigungsschritt für die Geschäftsführung statt eines Neu-Entwurfs |
| Kopplungsverbot-Entscheidungsvorlage (Art. 7 Abs. 4 DSGVO) | `audit/dipa/dsfa_pflegecoach.md` §3b | Zwei Argumentationswege ausformuliert, Empfehlung begründet — GF muss entscheiden, nicht mehr von Null aus prüfen |
| AVV-Abschluss-Checkliste je Anbieter (Supabase, Vercel, Resend, Stripe) | `audit/dipa/avv_dossier_pflegecoach.md` §5b | Konkreter Suchpfad je Anbieter statt offener Frage „wo ist der Vertrag" |
| Screenreader-Ergebnisprotokoll (ausfüllbare Vorlage, S1–S8 je Seite) | `audit/dipa/screenreader_ergebnisprotokoll_vorlage.md` | Reduziert BF-03 auf: Termin, Person, Ausfüllen — vorher gab es nur die Fragenliste, kein Format für das Ergebnis |
| `antragsBlocker()`/`ZEITKLASSE` verdrahtet (existierten seit 15.08. im Katalog, wurden nie aufgerufen) | `lib/coach/dipa-compliance.ts`, `scripts/dipa-compliance-check.ts`, `app/admin/dipa/page.tsx` | Die „N Eingangsblocker"-Aussage ist jetzt eine Live-Berechnung aus dem Katalog statt handgepflegter Prosa, die abweichen konnte, ohne dass es auffällt |
| Dokument-Aktualitätsprüfung für 7 kritische Vorbereitungsdokumente | `lib/coach/dipa-compliance.ts`, `npm run dipa:compliance` | Ein Dokument mit veraltetem „Stand:"-Datum (> 180 Tage) fällt jetzt automatisch auf, statt unbemerkt zu verrotten |

Alle Änderungen mit Tests: `lib/coach/dipa-compliance.test.ts` (13 Fälle,
`node:test`, grün). `npm run dipa:katalog` und `npm run dipa:compliance`
laufen beide ohne Befund.

---

## B) Intern vorbereitet — Abschluss ist Geschäftsführung, kein Dienstleister

Diese drei Punkte trugen bisher denselben Status wie die neun echten
externen Punkte unten. Das war zu grob: hier fehlt keine Beauftragung,
sondern eine Entscheidung/Unterschrift.

| ID | Was fehlt konkret | Wo vorbereitet |
|---|---|---|
| `AK-DS-02` DSFA | Bestätigung der Risikomatrix (§4b) und der Kopplungsverbot-Einschätzung (§3b), Entscheidung zur Infrastrukturtrennung, Datum/Unterschrift | `audit/dipa/dsfa_pflegecoach.md` |
| `AK-DS-04` AVV-Kette | Vier Unterschriften unter bestehende Anbieterbeziehungen (kein neuer Vertragspartner) | `audit/dipa/avv_dossier_pflegecoach.md` §5b |
| `AK-VS-02` Support-SLA | Personalentscheidung: wer deckt die 24-Stunden-Rückmeldefrist ab, inkl. Wochenende/Feiertag (keine Ausnahme in der Norm) | Bewusst **nicht** vorab ins Produkt geschrieben — eine veröffentlichte Zusage ohne betriebliche Deckung wäre schlechter als keine, siehe Katalogeintrag |

**Warum das nicht „sofort implementiert" wurde, obwohl es Bearbeitungsklasse
C ist:** alle drei sind Entscheidungen mit Außenwirkung (Risikobewertung
gegenüber Aufsicht, Vertragsunterschrift, Personalzusage). Code kann sie
vorbereiten, nicht treffen. Das deckt sich mit der bestehenden Regel im
Katalog (`verantwortlich: 'geschaeftsfuehrung'`).

---

## C) Zwingend extern — neun echte Abhängigkeiten

Unverändert gegenüber der Ausgangslage. Vorbereitungsstand pro Punkt (alle
bereits vor diesem Durchgang vorhanden, hier nur zusammengefasst):

| ID | Braucht | Intern vorbereitet |
|---|---|---|
| `AK-SEC-01` + `AK-SEC-04` | BSI-anerkannte TR-03161-Prüfstelle (Web + Backend), Pentest ist darin absorbiert | `audit/dipa/tr03161_checkliste.md`, `pentest_beauftragung_scope.md`, `docs/dipa/external-readiness/BRIEFING_TR03161_PRUEFSTELLE.md`, `BRIEFING_PENETRATIONSTEST.md` |
| `AK-SEC-05` | DAkkS-akkreditierte ISO-27001-Zertifizierung, offene C5-Testat-Frage bei Supabase/Vercel (siehe `24_REGULATORIK_TIEFENPRUEFUNG_2026-08-15.md` Abschnitt F) | `audit/dipa/isms_scope_vorbereitung.md`, `BRIEFING_ISO27001_ZERTIFIZIERUNG.md` |
| `AK-BF-02` | Fünf repräsentative Testpersonen für die summative Validierung (formative Runde bereits intern erledigt: Cognitive Walkthrough) | `audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md`, `gebrauchstauglichkeit_testprotokoll.md`, `BRIEFING_BARRIEREFREIHEIT_USABILITY.md` |
| `AK-QI-01` | Pflegefachlich qualifizierte Person (keine Zertifizierungsstelle) für die Freigabe der 12 Module | `audit/dipa/inhalte_pruefdossier.md`, `BRIEFING_PFLEGEFACHLICHE_PRUEFUNG.md` |
| `AK-QI-02` | Läuft über `AK-NN-01` — Validierung des Messinstruments im Rahmen des Evaluationskonzepts | `lib/coach/belastung.ts` (unvalidiert gekennzeichnet) |
| `AK-NN-01` | Herstellerunabhängiges wissenschaftliches Institut/CRO — zweiter Eingangsblocker neben SEC-01/SEC-05 | `audit/dipa/evaluationskonzept.md`, `BRIEFING_EVALUATION.md` |
| `AK-VS-04` | Anwaltliche AGB-Prüfung Selbstzahler-Weg — Zeitklasse E, kein Antragsblocker (Bestellweg technisch gesperrt) | `audit/dipa/nutzungsbedingungen_entwurf_selbstzahler.md` |
| `AK-REG-04` | GKV-Spitzenverband-Vergütungsverhandlung nach Aufnahme (seit BEEP 01.01.2026 auch vorziehbar) | `lib/coach/abrechnung.ts` fail-closed, keine erfundenen Beträge |
| `AK-REG-05` | BfArM-Beratungstermin — freiwillig, höchste Hebelwirkung (klärt SEC-01-Scope, INT-02-MIO-Frage, QI-02, REG-04 in einem Termin) | `audit/dipa/bfarm_fragenkatalog.md`, `BFARM_BERATUNG_PAKET.md` |

Für keinen dieser neun Punkte gab dieser Durchgang einen Weg zur weiteren
internen Vorarbeit über das bereits Vorhandene hinaus — sie wurden
einzeln geprüft (Checklisten/Briefings/Scope-Dokumente durchgesehen), aber
der jeweilige Kern (Zertifikat, Testpersonen, Institut, Kanzlei,
Behördentermin) bleibt außerhalb der Technik.

---

## Antragsreife — live berechnet

```
$ npm run dipa:compliance
```

Zeigt aktuell 10 offene Zeitklasse-A-Punkte (Pflicht vor Antragstellung):
3 intern (B, oben — GF-Entscheidung/Unterschrift: `DS-02`, `DS-04`, `VS-02`)
und 7 extern (`SEC-01`, `SEC-04`, `SEC-05`, `BF-02`, `QI-01`, `QI-02`,
`NN-01` — aus Abschnitt C, ohne `VS-04`/`REG-04`/`REG-05`, die keine
Zeitklasse A tragen: empfohlen bzw. erst nach Aufnahme relevant). Diese
Zahl ist ab jetzt keine Prosa mehr, sondern `antragsreife()` aus
`lib/coach/dipa-compliance.ts` — sie ändert sich automatisch, sobald ein
Katalogeintrag auf `stand: 'erfuellt'` wechselt, und ist im Admin-Bereich
(`/admin/dipa`, Tab „Anforderungskatalog") sichtbar.

---

## Was unverändert gilt

- `COACH_DIPA_MODUS` bleibt Default `false`.
- PflegeCoach bleibt für Endnutzer kostenlos; Kassenvergütung bleibt
  `EXTERNAL_REQUIRED` (Produktschalter, keine Zahlungen ohne Freigabe).
- Keine Preise oder Beträge wurden erfunden — `AK-REG-04` bleibt fail-closed
  über `verguetung_geklaert`.
- Keine Behauptung, dass die Pflegekasse bereits zahlt.
- Kostenschätzung unverändert: `docs/dipa/24_REGULATORIK_TIEFENPRUEFUNG_2026-08-15.md`,
  85.000–128.000 € (die drei Punkte aus Abschnitt B dieses Dokuments
  ändern daran nichts — sie waren in der Kostenschätzung nie als externer
  Beschaffungsposten enthalten).

---

*Nächste Aktualisierung: wenn `npm run dipa:compliance` einen neuen Befund
zeigt (Antragsreife ändert sich, oder ein kritisches Dokument fällt aus dem
180-Tage-Fenster) — oder nach dem nächsten inhaltlichen Durchgang durch den
Katalog.*
