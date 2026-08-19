# Track 3 — DiPA / PflegeCoach: Bestandsaufnahme und Weiterentwicklung

**Stand:** 2026-08-19 · Grundlage: Code-Audit des vorhandenen Bestands, anschließende
Umsetzung, alle Belege als Datei- und Testverweise.

> **Keine Zulassungsaussage.** Eine Aufnahme des PflegeCoach in das Verzeichnis für digitale
> Pflegeanwendungen liegt **nicht** vor. Keine Pflegekasse zahlt für dieses Produkt, und es ist
> keine Vergütung vereinbart. Der PflegeCoach ist **dauerhaft kostenlos für Endnutzer**;
> Kassenvergütung bleibt `EXTERNAL_REQUIRED`.

---

## 1. Bestandsaufnahme (Ausgangslage 19.08.2026)

Der PflegeCoach war bereits ein vollständig gebautes Produkt, kein Gerüst.

| Bereich | Umfang | Zustand |
|---|---|---|
| Produktoberfläche | 25 Seiten unter `app/pflegecoach/**` | funktionsfähig |
| Endnutzer-API | 24 Routen unter `app/api/coach/**` | funktionsfähig |
| Betriebs-API | 5 Routen unter `app/api/dipa/**` (Admin) | funktionsfähig |
| Fachlogik | 28 Module in `lib/coach/**` | funktionsfähig |
| Datenbank | 5 Migrationen (je mit Rollback) | live |
| Zulassungsdossier | `audit/dipa/**` + `docs/dipa/**` | 48 Anforderungen erfasst |

**Anforderungskatalog zum Zeitpunkt der Aufnahme** (`npm run dipa:katalog`):
34 von 48 erfüllt, 6 in Arbeit, 8 offen; alle 48 Anforderungstexte gegen das Original geprüft;
belastbare Quote 71 %. Keine toten Nachweisverweise (102 Dateien geprüft).

### Was bereits funktionierte

- **Produktgrenze maschinell gesichert.** `lib/coach/produktgrenze.test.ts` verbietet
  Erstattungs- und Zulassungsaussagen im ungegateten Produktbereich und erzwingt, dass jede
  schreibende Coach-Route die Pflicht-Einwilligung prüft.
- **Fail-closed über die ganze Kette.** Anspruchsprüfung und Freischaltung sind an Schalter
  gebunden, in Seite **und** API, mit 404 statt Fehlermeldung.
- **Trennungsgebot umgesetzt.** `lib/coach/api-auth.ts` verwendet bewusst keinen
  `service_role`-Client — die `coach_*`-RLS bleibt die einzige Zugriffswahrheit. Admins haben
  keinen Zugriff auf Gesundheitsdaten des PflegeCoach.
- **Kostenloser Zugang.** Kein aktives Gate, kein Abo, keine Paywall.

### Was fehlte — die vier Lücken, die dieser Track schließt

1. **Die regulatorischen Eckwerte standen ausschließlich in Prosa.** Norm, Beträge und
   Fundstellen lebten in Fließtext-Kommentaren. Genau dort waren die drei Sachfehler entstanden,
   die am 15.08.2026 korrigiert wurden (falsche Anspruchsnorm, erfundener 70-€-Topf, tote
   DiPAV-Dokument-ID). Nichts hinderte sie daran, zurückzukehren.
2. **Es gab kein Verzeichnis der Schalter.** Dreizehn Umgebungsvariablen über sechs Module
   verstreut, jede für sich dokumentiert — aber keine Stelle, an der stand, welche es gibt,
   welcher Zustand der sichere ist und welche Freigabe fehlt. Ein vierzehnter Schalter hätte
   unbemerkt hinzukommen können.
3. **Die Kostenlos-Zusage war nicht abgesichert.** Sie stand in Dokumenten und Oberflächen-Texten,
   während der vollständige Selbstzahler-Verkaufsweg fail-closed im Code liegt. Ein einziger
   versehentlich gesetzter Schalter hätte aus dem kostenlosen Angebot ein zahlungspflichtiges
   gemacht — mit Platzhalterbeträgen, die ausdrücklich niemandem berechnet werden dürfen.
4. **Der Betrieb konnte den Zustand nicht sehen.** Weder Admin-Oberfläche noch Prüfskript zeigten,
   welche zulassungsgebundenen Schalter gerade scharf sind.

---

## 2. Umgesetzt in diesem Track

### 2.1 `lib/coach/regulatorik.ts` — regulatorische Konstanten, maschinenlesbar

Eine Stelle für die tragenden Werte, jeder mit Fundstelle und Prüfdatum.

| Konstante | Inhalt |
|---|---|
| `LEISTUNGSANSPRUCH` | **§ 40b Abs. 1 SGB XI** — 40 € DiPA (Nr. 1, § 40a) + 30 € ergänzende Unterstützungsleistungen (Nr. 2, § 39a) je Kalendermonat. `getrennteToepfe: true`, `gemeinsamerDeckelEuro: null`. |
| `HERSTELLERVERGUETUNG` | § 78a Abs. 1 SGB XI. `vereinbarterBetragEuro: null` — für den PflegeCoach existiert keiner. |
| `RECHTSQUELLEN` | DiPAV (`BJNR156800022`), SGB XI, BfArM-Leitfaden v1.3, BSI TR-03161, C5GleichwV. |
| `EINGANGSBLOCKER` | AK-SEC-01, AK-SEC-05, AK-NN-01 — je mit ausstellender Stelle und Fundstelle. |
| `AUFTRAGSVERARBEITUNG` | DiPAV § 5 Abs. 4. **`standardvertragsklauselnZulaessig: false`.** |
| `CLOUD_ATTESTIERUNG` | BSI TR-03161-3 O.Org_2. `soc2Gleichwertig: false`, `testatVorhanden: false`. |
| `WIDERLEGTE_ANNAHMEN` | Acht dokumentierte Fehler mit „falsch → richtig → Quelle → Datum". |

**Die eingearbeiteten Korrekturen im Einzelnen:**

- **REG-04 (Norm):** Anspruchsnorm ist **§ 40b Abs. 1 SGB XI**, nicht § 40a Abs. 1a.
- **REG-04 (Beträge):** **40 € + 30 €, zwei getrennte Beträge.** Ein 70-€-Deckel existiert im
  Gesetz nicht — die Summe ist eine Rechenoperation, kein Anspruch. Die Beträge sind nicht
  gegeneinander verschiebbar.
- **REG-04 (Vergütung):** § 78a Abs. 1 SGB XI sieht eine Vergütungsverhandlung mit dem
  GKV-Spitzenverband vor; seit dem BEEP (01.01.2026) auch schon vor der Aufnahme. Option, keine
  Antragsvoraussetzung.
- **DiPAV-Fundstelle:** gültig ist **`BJNR156800022`**. Die früher zitierte zweite ID liefert 404.
- **DS-04:** Standardvertragsklauseln (Art. 46 DSGVO) sind für DiPA **unzulässig**. Eine
  AVV-Kette mit SCC-Drittstaatstransfer ist nicht heilbar — der Dienstleister muss ersetzt
  werden. Vorab bei der Auswahl zu prüfen, nicht hinterher.
- **SEC-05:** ISMS-Zertifikat nach ISO 27001, ausgestellt von einer **DAkkS-akkreditierten**
  Stelle, ist **Eingangsblocker** bei Antragstellung. Der frühere Vorbehalt („nur im nicht
  bindenden Leitfaden") war falsch: BSI TR-03161-3 O.Org_1 fordert es als MUSS und ist über
  DiPAV § 5 Abs. 2 Nr. 1 → § 78a Abs. 7 SGB XI verbindlich.
- **SEC-04:** Der Penetrationstest ist **in der TR-03161-Prüfung enthalten** — SEC-01 und SEC-04
  sind ein Beschaffungsvorgang, nicht zwei.
- **C5-Lücke:** Für die eingesetzten Hosting- und Datenbankdienstleister liegt **kein BSI-C5-Testat
  vor** (`testatVorhanden: false`). SOC 2 ist nach C5GleichwV **nicht** gleichwertig. Ab
  01.07.2027 gilt nur noch C5 Typ 2. Die Beschaffung gehört in den ISMS-Auftrag (AK-SEC-05).

### 2.2 `lib/coach/schalter.ts` — Schalterverzeichnis

Alle **13** Umgebungsvariablen des PflegeCoach mit Wirkung, sicherem Stand, Schaltlogik,
Freigabeweg, Voraussetzung und Risiko bei Fehlschaltung.

**Zulassungsgebundene Schalter — alle vier Default `false`, alle vier `aus` = sicher:**

| Variable | Wirkung | Voraussetzung für die Freigabe |
|---|---|---|
| `COACH_DIPA_MODUS` | Anspruchsprüfung, Kassenbezug, Abrechnungswege sichtbar | **BfArM-Listung** — liegt nicht vor |
| `COACH_FREISCHALTUNG_PFLICHT` | Zugang nur mit Freischaltcode | Klärung des Versorgungswegs |
| `COACH_PREISE_FREIGEGEBEN` | Gibt den Bestellweg frei | **Entfällt** — dauerhaft kostenlos |
| `COACH_NUTZUNGSNACHWEIS_AKTIV` | Pseudonyme Nutzungserfassung | Evaluationskonzept (AK-NN-01) **und** Einzeleinwilligung |

Das Verzeichnis wertet **nicht** aus — es beschreibt. Die Verhaltenssteuerung bleibt bei
`dipaModus()`, `preiseFreigegeben()` und den übrigen Funktionen in ihren Modulen; eine zweite
Auswertung wäre eine zweite Wahrheit.

**Beim Bau gefunden:** `COACH_UST_KLEINUNTERNEHMER` ist umgekehrt gepolt (`!== 'false'`, Default
an) — die konservative Steuerannahme. Ein einheitlich unterstelltes `=== 'true'` hätte sie
dauerhaft als unsicher gemeldet. Das Feld `schaltlogik` bildet die tatsächliche Polarität ab,
statt Einheitlichkeit zu unterstellen, die es nicht gibt.

### 2.3 Testfälle — 45 neue, alle grün

`lib/coach/*.test.ts`: **245 Testfälle, 245 grün.** Gesamte `lib`: 772 grün.

| Datei | Fälle | Sichert |
|---|---|---|
| `regulatorik.test.ts` | 17 | Norm, Beträge, Fundstellen, Eingangsblocker; **Gegenprobe gegen den übrigen Quelltext** |
| `schalter.test.ts` | 15 | Vollständigkeit des Verzeichnisses, sichere Defaults, Auswertungslogik |
| `kostenfreiheit.test.ts` | 13 | Verkauf fail-closed in beide Richtungen, Zusage im UI vorhanden |

Drei Prüfungen, die über reine Selbstkonsistenz hinausgehen:

- **Vollständigkeitstest** (`schalter.test.ts`): durchsucht `lib/coach` nach `*_ENV`-Konstanten
  und hält sie gegen das Verzeichnis. Ein neuer Schalter kommt hier nicht vorbei. Gegenprobe:
  ein verzeichneter Schalter, den es im Code nicht mehr gibt, fällt ebenfalls auf.
- **Gegenprobe gegen den Quelltext** (`regulatorik.test.ts`): sucht in `lib/coach`,
  `app/pflegecoach`, `app/api/coach` und `app/api/dipa` nach der toten DiPAV-ID, nach einem
  behaupteten 70-€-Deckel und nach abweichenden Monatsbeträgen. Eine Konstante kann richtig sein
  und in einer UI-Datei trotzdem falsch abgetippt — genau so ist der 70-€-Topf entstanden.
- **Reihenfolge der Verkaufssperren** (`kostenfreiheit.test.ts`): prüft, dass ein *vollständig*
  konfiguriertes Stripe-Konto trotzdem nichts verkauft und der Ablehnungscode
  `PREISE_NICHT_FREIGEGEBEN` lautet. Stünde die Preisfreigabe hinter der Stripe-Prüfung, würde
  die Konfiguration entscheiden statt der kaufmännischen Freigabe.

### 2.4 Regressions-Lint

`scripts/lint-forbidden.ts` kennt jetzt **regelspezifische Ausnahmen** (`excludeGlobs` je Regel,
abwärtskompatibel). Nötig, weil eine Regel, die einen dokumentierten Fehler sperrt, sonst
ausgerechnet ihre eigene Begründung verbieten würde.

Zwei neue Regeln in `scripts/forbidden-strings.json`:

| Regel | Sperrt | Ersatz |
|---|---|---|
| `dipav-tote-dokument-id` | die 404-liefernde DiPAV-ID | `BJNR156800022` |
| `dipa-falsche-anspruchsnorm` | `40a Abs. 1a SGB XI` | `40b Abs. 1 SGB XI` |

Beides gegengeprüft: Vollscan über 24 188 Dateien grün, und eine testweise eingefügte
Falschangabe wurde blockiert. Eine Regel, die nur grün ist, ohne dass je gezeigt wurde, dass sie
auch rot werden kann, ist kein Schutz.

### 2.5 Betriebs-Sichtbarkeit

- **`GET /api/dipa/schalter`** (Ops-Admin): liefert Schalterstand, Eingangsblocker und
  Leistungsanspruch. **Nur Zustände, nie Werte** — unter den Schaltern sind ein Pepper
  (`COACH_CODE_PEPPER`) und ein Signaturschlüssel (`COACH_STRIPE_WEBHOOK_SECRET`).
- **Neuer Tab „Schalter & Regulatorik"** unter `/admin/dipa`: zeigt zulassungsgebundene Schalter
  mit Ist-Zustand, die übrigen Schalter, die drei Eingangsblocker und den Leistungsanspruch. Bei
  scharfem zulassungsgebundenem Schalter erscheint ein roter Banner.
- **`npm run dipa:compliance`** um drei Abschnitte erweitert: Eingangsblocker, Schalterstand
  dieser Umgebung, regulatorische Eckwerte. Ein scharfer zulassungsgebundener Schalter zählt als
  **Befund** und lässt `--check` mit Exit-Code 1 abbrechen.

---

## 3. Aktueller Stand nach diesem Track

```
npm run dipa:katalog     → 34/48 erfüllt, belastbare Quote 71 %, keine Befunde
npm run dipa:compliance  → 4/4 zulassungsgebundene Schalter sicher, keine Befunde
npm run lint:forbidden   → 24 188 Dateien, 0 Treffer
npm run typecheck        → grün
lib/coach-Tests          → 245/245
lib-Tests gesamt         → 772/772
```

---

## 4. Was weiterhin blockiert ist — und warum es hier nicht lösbar war

Die Katalogquote steht unverändert bei 34/48. **Das ist kein ausgebliebener Fortschritt.** Die
verbleibenden 14 Punkte sind zu keinem Teil Technik:

**Drei Eingangsblocker — extern, nicht nachreichbar, nicht abkürzbar:**

| Punkt | Nachweis | Ausstellende Stelle |
|---|---|---|
| AK-SEC-01 | Datensicherheitszertifikat BSI TR-03161 (enthält den Pentest aus AK-SEC-04) | BSI-anerkannte Prüfstelle |
| AK-SEC-05 | ISMS-Zertifikat ISO 27001 | DAkkS-akkreditierte Zertifizierungsstelle |
| AK-NN-01 | Wissenschaftliches Evaluationskonzept | Wissenschaftliche Einrichtung |

**Vier intern offene Punkte — alle Geschäftsführungs-, keine Technikentscheidungen:**

- **AK-DS-02 / AK-DS-04:** DSFA und AVV-Dossier sind inhaltlich fertig. Offen sind
  Unterschriften.
- **AK-BF-03:** Screenreader-Durchgang. Maschinell prüfbar ist alles Prüfbare bereits
  (axe-core über `cat.aria`, `cat.name-role-value`, `cat.structure`, `cat.semantics`; eindeutige
  Dokumenttitel, `html-lang`, lebendes Sprungziel). Was fehlt — Verständlichkeit der Ansagen,
  Vorlesereihenfolge, Fokusfallen in echter Bedienung — ist maschinell nicht entscheidbar. Ein
  Screenreader-Nachweis ohne gelaufenen Screenreader wäre ein erfundener Nachweis. Es braucht
  eine Person und einen Termin; das Ergebnisformular liegt bereit.
- **AK-VS-02:** 24-Stunden-Antwortzusage für den Support. Technisch trivial einzutragen und
  **bewusst nicht eingetragen**: Eine veröffentlichte Reaktionszeit ist eine bindende Zusage und
  setzt eine Personal- und Bereitschaftsentscheidung voraus (Wochenenden, Feiertage, Vertretung).
  Eine Zusage zu veröffentlichen, die betrieblich nicht hinterlegt ist, wäre schlechter als keine.

**Kassenvergütung: `EXTERNAL_REQUIRED`.** Sie setzt die Aufnahme in das DiPA-Verzeichnis voraus
und danach eine Vereinbarung nach § 78a Abs. 1 SGB XI. Beides steht aus. Bis dahin gilt
unverändert: PflegeCoach ist kostenlos, keine Kasse zahlt, keine Zulassung liegt vor.

---

## 5. Verweise

| Was | Wo |
|---|---|
| Regulatorische Konstanten | `lib/coach/regulatorik.ts` |
| Schalterverzeichnis | `lib/coach/schalter.ts` |
| Anforderungskatalog (48) | `lib/coach/anforderungskatalog.ts` |
| Führende Matrix | `docs/dipa/21_FINAL_MATRIX_2026-08-15.md` |
| Geschäftsmodell / Zugangsstatus | `docs/PFLEGECOACH_VERKAUFSSTATUS.md` |
| Externe Beauftragungen | `docs/DIPA_EXTERNE_TODO_2026-08-14.md` |
| Zulassungsdossier | `audit/dipa/**` |
