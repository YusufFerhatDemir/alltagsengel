# DiPA Reality-Check (Track C)

**Stand:** 28.08.2026 · **Methode:** Repo-Scan + Katalog-Läufe (`npm run dipa:katalog`,
`npm run dipa:compliance`) + nur-lesende Produktionsproben (PostgREST, HTTP)

**Die kurze Antwort:** Die **Technik** des DiPA-Produkts ist weitgehend gebaut und läuft
live — die **Zulassung** hat noch nicht begonnen. Kein einziges der drei
Eingangsdokumente für den BfArM-Antrag existiert, und alle drei sind extern zu
beschaffen. Der DiPA-Modus ist in Produktion **aus**, es gibt **null** Nutzer.

---

## 1. Was existiert

### 1.1 Produkt „Digitaler PflegeCoach" — live, aber im Selbstzahler-Modus

| Bereich | Umfang | Pfade |
|---|---|---|
| Oberfläche | 25 Seiten | `app/pflegecoach/` (start, assessment, ziele, wochenplan, verlauf, bericht, anspruch, freischaltung, interoperabilitaet, einstellungen/{konto,sicherheit,freigaben}, checkout, loeschung, widerruf, agb, datenschutz …) |
| API | 24 Routen | `app/api/coach/` |
| DiPA-Betrieb | 5 Routen + Admin-Seite | `app/api/dipa/{nachweise,codes,abrechnungswege,schalter}`, `app/admin/dipa/page.tsx` |
| Fachlogik | 6.496 Zeilen, 24 Testdateien / 3.303 Zeilen Test | `lib/coach/` |

Alle geprüften Module (`fhir`, `interop`, `mfa`, `freischaltung`, `nachweise`, `anspruch`,
`eul`, `export`, `dipa-compliance`, `regulatorik`, `schalter`) haben echte Importe außerhalb
ihres eigenen Verzeichnisses — das ist **kein** Karteileichen-Code.

### 1.2 Datenmodell — live in Supabase, aber leer

`supabase/migrations/20260819010000_pflegecoach_dipa_modul.sql` (coach_users,
coach_consents, coach_shares, coach_assessments, coach_goals, coach_activities,
coach_activity_log, coach_measurements, coach_reports, coach_audit_log) und
`supabase/migrations/20260826010000_dipa_freischaltung_nachweise_eul.sql`
(coach_pseudonym_key, coach_freischaltcodes, coach_freischaltungen,
coach_anspruchspruefungen, coach_nutzungsereignisse, coach_abrechnungswege,
eul_erbringungen, eul_qualifikationen) — beide mit Rollback-Datei, beide **angewendet**.

Produktionsprobe (28.08.2026, service_role, nur lesend):

```
coach_users               HTTP 200   0 Zeilen
coach_freischaltcodes     HTTP 200   0 Zeilen
coach_freischaltungen     HTTP 200   0 Zeilen
coach_anspruchspruefungen HTTP 200   0 Zeilen
coach_nutzungsereignisse  HTTP 200   0 Zeilen
coach_abrechnungswege     HTTP 200   0 Zeilen
eul_erbringungen          HTTP 200   0 Zeilen
eul_qualifikationen       HTTP 200   0 Zeilen
coach_pseudonym_key       HTTP 200   1 Zeile
```

**Das Schema ist live, die Nutzung ist null.** Alles bisher Gebaute ist unbenutzt.

### 1.3 Regulatorischer Apparat — ungewöhnlich weit

- **Maschinenlesbarer 48-Punkte-Anforderungskatalog:** `lib/coach/anforderungskatalog.ts`
  (99 KB), prüfbar über `npm run dipa:katalog`. Jeder Eintrag mit Verordnungsquelle,
  Nachweisdateien und Prüfkennzeichen. Der Lauf verifiziert, dass **alle 106 verwiesenen
  Nachweisdateien existieren** — Doku-Verweise können nicht ins Leere zeigen.
- **Antragsreife-Prüfung:** `lib/coach/dipa-compliance.ts` + `npm run dipa:compliance`,
  benennt die Eingangsblocker und die ausstellende Stelle je Blocker.
- **Schalterverzeichnis:** `lib/coach/schalter.ts` — 13 Umgebungsschalter mit sicherem
  Stand, Freigabeweg (intern/extern) und Risiko bei vorzeitigem Umlegen. Ein Test erzwingt,
  dass jede neue `*_ENV`-Konstante in `lib/coach` dort eingetragen ist.
- **Regulatorik-Konstanten:** `lib/coach/regulatorik.ts` — § 40b Abs. 1 SGB XI,
  40 € DiPA + 30 € eUL je Kalendermonat, getrennte Beträge.
- **Dokumentation:** 30 Dossiers unter `audit/dipa/`, 29 unter `docs/dipa/` (inkl.
  `external-readiness/` mit sieben fertigen Briefings für externe Dienstleister),
  Leitmatrix `docs/dipa/21_FINAL_MATRIX_2026-08-15.md`.

### 1.4 § 39a SGB XI / § 40b / DiPAV

Referenzen sind vorhanden und **geprüft** (`anforderungstextGeprueft: true` für 48 von 48
Einträgen, jeweils gegen Primärquelle statt Zusammenfassung). Fundstellen u. a.
`lib/coach/regulatorik.ts`, `lib/coach/anforderungskatalog.ts`,
`docs/dipa/23_REGULATORISCHER_FAKTENCHECK_V2_2026-08-15.md`,
`audit/DIPA_REGULATORIK_2026-08-09.md`.

Wichtige Korrektur, die im Repo bereits festgehalten ist: Der Leistungsanspruch läuft über
**§ 40b SGB XI**, nicht § 39a — § 39a betrifft Hospiz-/Palliativleistungen. Der frühere
Eintrag „§ 40a Abs. 1a SGB XI, 70-€-Deckel" wurde als **falsch** verworfen
(`docs/dipa/21_FINAL_MATRIX_2026-08-15.md`, Korrektur 3).

### 1.5 FHIR / Interoperabilität — gebaut

`lib/coach/fhir.ts` (14,5 KB) + `lib/coach/interop.ts` + `lib/coach/export.ts` mit
JSON-Schema (`lib/coach/export.schema.json`), Nutzeroberfläche unter
`app/pflegecoach/interoperabilitaet/page.tsx`. Plattformseitig zusätzlich 10 FHIR-Routen
(`app/api/fhir/Patient|Observation|CarePlan|Encounter|export|import|audit-log`) und
`app/admin/fhir/page.tsx`. Dokumentiert in `docs/dipa/13_FHIR_EXPORT_DOKUMENTATION.md`
und `audit/dipa/interoperabilitaet_fhir.md`.

### 1.6 DSFA

Zwei Dokumente, beide **ausdrücklich als Selbstbewertung gekennzeichnet**:
`docs/DSFA_ALLTAGSENGEL.md` (Plattform, Stand 21.08.2026, „Freigabe durch externen DSB
ausstehend") und `audit/dipa/dsfa_pflegecoach.md` (Produkt, Stand 15.08.2026, „Das ist noch
keine unterzeichnete DSFA"). Vorlage: `docs/DSFA_VORLAGE.md`.

---

## 2. Was fehlt komplett

| # | Fehlt | Kennung | Wer kann es liefern |
|---|---|---|---|
| 1 | **TR-03161-Datensicherheitszertifikat** | AK-SEC-01 | BSI-anerkannte Prüfstelle |
| 2 | **ISO-27001-Zertifikat (ISMS)** | AK-SEC-05 | DAkkS-akkreditierte Zertifizierungsstelle |
| 3 | **Wissenschaftliches Evaluationskonzept** | AK-NN-01 | Wissenschaftliche Einrichtung |
| 4 | Externer Penetrationstest | AK-SEC-04 | Sicherheitsdienstleister |
| 5 | Summative Gebrauchstauglichkeitsprüfung mit der Zielgruppe | AK-BF-02 | Usability-Institut |
| 6 | Pflegefachliche Inhaltsfreigabe | AK-QI-01 | Pflegefachkraft/PDL mit Freigabemandat |
| 7 | Lizenzierte/validierte Erhebungsinstrumente | AK-QI-02 | Lizenzgeber |
| 8 | Unterzeichnete DSFA + AVV-Kette | AK-DS-02, AK-DS-04 | Geschäftsführung (+ DSB) |
| 9 | Screenreader-Protokoll | AK-BF-03 | intern (Technik) |
| 10 | Support-Zusage mit 24-h-Frist | AK-VS-02 | Geschäftsführung |
| 11 | Nutzungsbedingungen Selbstzahler (final) | AK-VS-04 | Kanzlei |
| 12 | Entscheidung Vergütung/Abrechnungsweg | AK-REG-04 | Geschäftsführung |
| 13 | **BfArM-Beratungstermin** | AK-REG-05 | BfArM |

Die ersten drei sind **Eingangsblocker**: Ohne sie ist der Antrag formal unvollständig,
sie sind nicht nachreichbar.

Zusätzlich außerhalb des Katalogs:

- **Telematik-Infrastruktur: keine echte Anbindung.** `lib/kim/` ist vollständig gebaut,
  aber `lib/kim/provider-factory.ts` **wirft ausnahmslos** für `kim_plus` und `kim_basis`
  — der echte TI-Konnektor ist extern, die KIM-Client-Spezifikation (Technische Anlage 5)
  liegt nicht vor. Nutzbar sind nur `mock` und `test`. Das ist eine bewusste, gut begründete
  Sperre, keine Lücke im Sinne von „vergessen". Für DiPA ist TI derzeit ohnehin nicht
  gefordert.
- **KI-Risikoklassen-Dokumentation: existiert nicht.** Es gibt keine AI-Act-Einordnung,
  kein Risikoklassen-Dokument, keine Transparenzpflicht-Prüfung. Das ist **überwiegend
  konsistent**, weil KI aus dem DiPA-Produkt bewusst ausgeschlossen wurde
  (`audit/DIPA_REGULATORIK_2026-08-09.md:134`) und `lib/coach/` tatsächlich **keinen
  einzigen LLM-Aufruf** enthält (verifiziert). **Aber:** Die Plattform daneben betreibt
  generative KI (`app/api/ai-chat/route.ts` — Gemini 2.5 Flash / GPT-4o-mini). Der
  Ausschluss steht bislang nur als *ein Satz in einem Audit-Dokument vom 09.08.2026*, nicht
  als durchgesetzte Produktgrenze und nicht im 48-Punkte-Katalog. Die MDR-Negativabgrenzung
  (`audit/dipa/mdr_negativabgrenzung.md`) ist als Betriebsanweisung sauber ausformuliert —
  ein Gegenstück für die KI-Grenze fehlt.
- **Kein BfArM-Antrag, kein Verzeichniseintrag.** Es gibt Vorbereitungspakete
  (`docs/dipa/external-readiness/BFARM_BERATUNG_PAKET.md`,
  `audit/dipa/bfarm_fragenkatalog.md`), aber keinen eingereichten Antrag und keine
  Verzeichnisaufnahme.

---

## 3. Realistische Einschätzung: Wie weit ist DiPA wirklich?

**Zwei Zahlen, die auseinanderlaufen — und das ist der ganze Befund:**

```
Technik / intern erledigt:   34 von 48 Anforderungen  (71 %)
Externe Nachweise:            0 von  8 Punkten der Klasse D  (0 %)
```

Aufgeschlüsselt nach Zuständigkeit (`npm run dipa:katalog`):

| Zuständigkeit | gesamt | offen |
|---|---|---|
| A Intern erledigt | 25 | 0 |
| B Intern umsetzbar (technisch) | 4 | 0 |
| C Intern erstellbar (Dokumentation) | 7 | **4** |
| D Externer Dienstleister nötig | 8 | **8** |
| E Behörde/Kostenträger nötig | 4 | **2** |

**Was das heißt:** Alles, was das Team allein tun konnte, ist getan — die 25 Punkte der
Klasse A und die 4 der Klasse B stehen ausnahmslos auf „erfüllt", mit Nachweisdateien, die
ein Skript gegenprüft. Der Rest hängt an Stellen außerhalb des Hauses.

**Produktionslage (28.08.2026):**

- `/pflegecoach` → HTTP 200, öffentlich erreichbar
- `/api/coach/tarife` → `{"verkauf_moeglich": false, "tarife": []}` — **kein Verkauf möglich**
- `COACH_DIPA_MODUS` = nicht gesetzt → **DiPA-Modus aus**, Produkt läuft als freier Service
- Alle 4 zulassungsgebundenen Schalter stehen auf dem sicheren Stand
- 0 Nutzer in `coach_users`

**Ehrliche Einordnung: DiPA ist bei etwa 0 % im Sinne der Zulassung und bei etwa 90 % im
Sinne der Bauarbeiten.** Der Abstand zum Verzeichniseintrag wird **nicht** in Code gemessen,
sondern in Kalenderzeit und Geld für externe Stellen. Grobe Erfahrungswerte:
ISO 27001 sechs bis zwölf Monate, TR-03161-Prüfung zwei bis vier Monate, summative
Usability-Studie ein bis zwei Monate, danach das BfArM-Verfahren selbst (drei Monate
Bearbeitungsfrist ab vollständigem Antrag). Realistisch frühestens **Mitte bis Ende 2027**,
und das nur, wenn die externen Aufträge zeitnah vergeben werden.

**Das eigentliche Risiko ist nicht technisch, sondern wirtschaftlich:** Es steht ein
vollständig gebautes, unbenutztes Produkt im System. Jeder weitere Ausbau vor der ersten
externen Beauftragung erhöht den Wartungsaufwand, ohne den Zulassungsstand zu bewegen.

**Was ausdrücklich gut ist** und nicht schöngeredet werden muss: Die Selbsteinschätzung im
Repo ist an keiner geprüften Stelle zu optimistisch. Der Katalog zählt „erfüllt" erst, wenn
der Anforderungstext gegen das Original geprüft ist; die DSFA-Dokumente kennzeichnen sich
selbst als Selbstbewertung; die KIM-Fabrik wirft lieber, als einen Zustellwert zu erfinden;
das Schalterverzeichnis benennt je Schalter das Risiko bei vorzeitigem Umlegen. Diese
Disziplin ist der eigentliche Vermögenswert — nicht der Code.

---

## 4. Empfehlung: nächste konkrete Schritte

### Zuerst — die Entscheidung, die alles andere gated

**Schritt 0: Geschäftsführung entscheidet, ob DiPA überhaupt verfolgt wird.**
Die drei Eingangsblocker kosten Geld und ein Jahr Zeit, bevor der erste Euro fließt.
Solange diese Entscheidung offen ist, ist jeder technische Ausbau am PflegeCoach verlorene
Zeit. Entscheidungsgrundlage liegt bereit:
`docs/dipa/19_ZULASSUNGSSTRATEGIE_ANALYSE.md`,
`docs/dipa/external-readiness/GESAMTUEBERSICHT_EXTERNE_NACHWEISE.md`.

### Wenn ja — in dieser Reihenfolge

1. **BfArM-Beratungstermin beantragen (AK-REG-05).** Kostenlos oder gering, klärt vor jeder
   teuren Beauftragung, ob die Zweckbestimmung trägt. Paket ist fertig:
   `docs/dipa/external-readiness/BFARM_BERATUNG_PAKET.md`.
2. **ISO-27001-Angebote einholen (AK-SEC-05).** Längste Laufzeit, deshalb zuerst starten.
   Briefing fertig: `docs/dipa/external-readiness/BRIEFING_ISO27001_ZERTIFIZIERUNG.md`,
   Scope: `audit/dipa/isms_scope_vorbereitung.md`.
3. **TR-03161-Prüfstelle beauftragen (AK-SEC-01).** Checkliste vorgearbeitet:
   `audit/dipa/tr03161_checkliste.md`, Briefing:
   `docs/dipa/external-readiness/BRIEFING_TR03161_PRUEFSTELLE.md`.
4. **Evaluationspartner suchen (AK-NN-01).** Konzept liegt vor
   (`audit/dipa/evaluationskonzept.md`), braucht eine wissenschaftliche Einrichtung als
   Trägerin.

### Parallel, intern, ohne Fremdkosten (die 4 offenen C-Punkte)

5. **DSFA von der Geschäftsführung unterzeichnen (AK-DS-02).** Art. 35 Abs. 2 DSGVO verlangt
   *keine* externe Stelle — nur den Rat eines DSB, falls einer benannt ist. Das ist im
   Repo bereits korrekt festgestellt und wird derzeit trotzdem als offen geführt. Das ist
   der billigste schließbare Punkt im ganzen Katalog.
6. **AVV-Kette produktbezogen dokumentieren (AK-DS-04)** — Vorarbeit:
   `audit/dipa/avv_dossier_pflegecoach.md`.
7. **Screenreader-Durchgang protokollieren (AK-BF-03)** — Vorlage liegt bereit:
   `audit/dipa/screenreader_ergebnisprotokoll_vorlage.md`. Rein interne Arbeit.
8. **Support-Frist verbindlich zusagen (AK-VS-02)** — eine Entscheidung, kein Projekt.

### Zwei Ergänzungen, die dieser Check vorschlägt

9. **KI-Ausschluss als Produktgrenze verankern.** Der Ausschluss generativer KI aus dem
   PflegeCoach existiert bislang nur als Satz in einem Audit-Dokument. Er gehört —
   analog zu `audit/dipa/mdr_negativabgrenzung.md` — als Betriebsanweisung dokumentiert
   und als Katalogeintrag geführt, damit ein späterer Einbau eines Chat-Assistenten in
   `app/pflegecoach/` nicht unbemerkt die AI-Act-Frage aufreißt.
   Aufwand: eine Datei plus ein Katalogeintrag.
10. **Ausbaustopp am PflegeCoach bis Schritt 0 entschieden ist.** Das Produkt ist gebaut,
    hat null Nutzer und wird durch weiteren Code nicht zulassungsfähiger.

---

## 5. Nachprüfbarkeit

```bash
npm run dipa:katalog      # 48 Punkte, Nachweisdateien, Erfüllungsstand
npm run dipa:compliance   # Antragsreife, Eingangsblocker, Schalterstand
```

Beide Läufe waren am 28.08.2026 ohne Befund. Die in diesem Bericht genannten Zahlen
stammen aus diesen Läufen, nicht aus den Fließtext-Dokumenten.
