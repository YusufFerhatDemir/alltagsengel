# Go-Live-Checkliste — Phase 6

**Stand:** 14.08.2026 · **Produktions-Commit:** `66a6f15` · **Adressat:** Yusuf

Diese Liste ist die Arbeitsliste nach Abschluss der Phasen 1–5. Sie enthält **keine
erfundenen Preise, keine erfundenen Genehmigungen und keine erfundenen Fristen**. Wo eine
Angabe fehlt, ist sie zu beschaffen — nicht zu ergänzen.

Grundlagen: [`FINALER_BERICHT_2026-08-14.md`](./FINALER_BERICHT_2026-08-14.md) ·
[`PFLEGECOACH_VERKAUFSSTATUS.md`](./PFLEGECOACH_VERKAUFSSTATUS.md) ·
[`KASSENABRECHNUNG_READINESS.md`](./KASSENABRECHNUNG_READINESS.md) ·
[`KASSENABRECHNUNG_FREISCHALTUNG.md`](./KASSENABRECHNUNG_FREISCHALTUNG.md) ·
[`DIPA_MATRIX_FINAL.md`](./DIPA_MATRIX_FINAL.md) ·
[`dipa/15_EVIDENCE_NACHWEIS_MATRIX.md`](./dipa/15_EVIDENCE_NACHWEIS_MATRIX.md) ·
[`BUSINESS_GO_LIVE_MATRIX_2026-08-14.md`](./BUSINESS_GO_LIVE_MATRIX_2026-08-14.md)

---

## Was heute Umsatz trägt

**Genau ein Weg: Privatkunden Alltagsbegleitung gegen Rechnung.** Alles andere ist entweder
extern blockiert (§45b, VP/KZP, §105, DiPA) oder wartet auf eine Preisentscheidung
(PflegeCoach Selbstzahler). Priorität **A** macht genau diesen einen Weg sauber scharf.

## Übersicht

| Stufe | Bedeutung | Punkte | Wer erledigt das |
|---|---|:--:|---|
| **A** | SOFORT — vor dem ersten echten Kunden | 7 | intern, heute machbar |
| **B** | DIESE WOCHE | 6 | intern + 1 Behördengang (kostenlos, Minuten) |
| **C** | VOR KASSENABRECHNUNG | 8 | 1 Landesbehörde, 1 Trust Center, Annahmestellen |
| **D** | VOR DiPA | 13 | Kanzlei, Prüfstellen, Fachpersonal, BfArM |
| **E** | OPTIONAL / nice-to-have | 6 | intern, jederzeit |

---

# A — SOFORT (vor dem ersten Kunden)

## A1 — Drei ausstehende Migrationen live anwenden

**Was:** Diese drei Migrationsdateien sind geschrieben, getestet, aber **nicht auf der
Produktions-Datenbank angewendet**. Inhalt jeder Datei in den Supabase-SQL-Editor kopieren
und ausführen, in dieser Reihenfolge:

| Datei | Behebt |
|---|---|
| `supabase/migrations/20260901000000_bewertungen_rls_fence.sql` | `angel_reviews` mit `USING(true)` — Bewertungskommentare **und `reviewer_id`** sind ohne Login lesbar (DSGVO-Personenbezug) |
| `supabase/migrations/20260901010000_service_record_status_sync.sql` | `status` / `proof_status` können auseinanderlaufen; nur `status` steuert Rechnung + Budget |
| `supabase/migrations/20260901020000_invoice_due_date_default.sql` | `due_date`-Default in der DB (App-Layer kompensiert das heute über `setzeFaelligkeitFallsLeer()`, 14 Tage) |

**Wo:** Supabase Dashboard → SQL Editor (Produktionsprojekt). Kein Agent kann das anwenden —
es gibt in dieser Umgebung weder Supabase-MCP noch `DATABASE_URL`.

**Unterlagen:** Zu jeder Migration liegt eine Rollback-Datei mit derselben Nummer + `0001`
daneben (`…000001_rollback_*.sql`). Bei Fehlschlag diese ausführen.

**Schaltet frei:** Schließt den letzten offenen anon-Lesezugriff aus der Security-Abnahme
(MITTEL-Befund 3 aus dem 15-Punkte-Bericht) und macht Statuslogik + Fälligkeit
datenbankseitig statt nur applikationsseitig verbindlich.

---

## A2 — Playwright-E2E-Suite tatsächlich ausführen

**Was:** Die Suite ist geschrieben (`e2e/pflegecoach.spec.ts` — 9 geschützte Seiten, 401 auf
allen Produkt-APIs, 404 der DiPA-Seiten, Werbefreiheit/Fremdhost-Prüfung, 6
A11y-Strukturprüfungen), aber **nie gelaufen**: es sind keine Playwright-Browser installiert.

```
npm run test:e2e:install     # playwright install --with-deps
npm run test:e2e             # playwright test
```

**Wo:** Lokal, anschließend gegen die Vercel-Preview-URL. Danach als Job in die CI aufnehmen.

**Unterlagen:** keine.

**Schaltet frei:** Erst danach ist DiPA-Punkt **QS-05** von „TEILWEISE — geschrieben, nicht
ausgeführt" auf erledigt zu setzen. Zusätzlich ist es der einzige laufende Nachweis für
DS-07/VS-01 (keine Tracker im PflegeCoach-Bereich) — ein Test, der nie läuft, belegt nichts.

---

## A3 — `server-only`-Guard in `lib/supabase/admin.ts`

**Was:** `import 'server-only'` als erste Zeile in `lib/supabase/admin.ts` ergänzen. Die Datei
erzeugt den Service-Role-Client, der RLS vollständig umgeht. Heute verhindert nur Konvention,
dass sie versehentlich aus einer Client-Komponente importiert wird.

**Wo:** `lib/supabase/admin.ts`, Zeile 1.

**Unterlagen:** keine.

**Schaltet frei:** Baufehler statt Sicherheitsvorfall — ein falscher Import bricht den Build,
statt den Service-Role-Key in ein Browser-Bundle zu legen. (MITTEL-Befund 4 aus dem
15-Punkte-Bericht.)

---

## A4 — Vercel-Production-Deploy grün bestätigen

**Was:** Der 15-Punkte-Bericht schloss mit CI-Status **IN PROGRESS** für `9b53aed`.
Seitdem sind zwei Commits dazugekommen (`a1ed3ea`, `66a6f15`). Bestätigen, dass der aktuelle
`main`-Stand auf Production ausgerollt und der Build grün ist.

**Wo:** `gh api` gegen den GitHub-Actions-Status; Vercel-Projekt
`prj_Wre4nj8w11Kv6YAPUorBS24x03qA`. Anschließend per `curl` gegen `alltagsengel.care`
verifizieren — lokale Dev-Server sind kein Nachweis.

**Unterlagen:** keine.

**Schaltet frei:** Nichts aus dieser Liste darf abgehakt werden, solange unklar ist, welcher
Codestand überhaupt live ist.

---

## A5 — Rechnungspflichtangaben (§ 14 UStG) in den Organisationsstammdaten prüfen

**Was:** Prüfen, dass die Stamm-Organisation (`00000000-0000-4000-8000-000460629986`)
Firmenname, vollständige Anschrift, Steuernummer bzw. USt-IdNr. und Bankverbindung hinterlegt
hat. `lib/pdf/briefkopf.ts:307` druckt die Steuernummer nur, wenn sie gesetzt ist — fehlt sie,
verlässt eine unvollständige Rechnung das Haus, ohne dass irgendwas fehlschlägt.

**Wo:** Admin → Einstellungen → Organisation, bzw. Tabelle `organizations`.

**Unterlagen:** Gewerbeanmeldung / Handelsregisterauszug, Steuernummer vom Finanzamt,
ggf. USt-IdNr. Umsatzsteuerliche Behandlung der Pflegeleistungen klären
(`lib/billing/datev/kontenrahmen.ts:5` geht von § 4 Nr. 16 UStG aus — das ist eine
Arbeitsannahme, keine Steuerberatung).

**Schaltet frei:** Rechtssichere Rechnungsstellung an Privatkunden — der einzige Weg, der
heute Umsatz trägt.

---

## A6 — Einen echten Kunden vollständig durch die Kette führen

**Was:** Die 13-Schritte-Kundenkette wurde bisher **nur synthetisch** bestätigt
(`scripts/pilot-e2e-durchlauf.ts`, Testmandanten). Live existieren 4 Klienten, 5 Rechnungen
und **0 Zahlungen**. Einmal mit einem echten Kunden durchgehen: Klient anlegen (`status='new'`)
→ Mitarbeiter zuweisen → Einsatz planen → Leistungsnachweis erfassen → unterschreiben
(`status='signed'`) → Rechnung erzeugen → PDF prüfen → Zahlung erfassen → OPOS-Ausgleich prüfen.

**Wo:** `/admin/clients`, `/admin/personal`, `/admin/schedule`, Leistungsnachweis-Maske,
`/admin/billing`.

**Unterlagen:** Unterschriebener Betreuungsvertrag mit dem Kunden.

**Schaltet frei:** Die Schritte Zahlungseingang, OPOS und Mahnwesen sind in Production **noch
nie gelaufen**. Erst dieser Durchlauf beweist die Kette an echten Daten.
Achtung bei der Zahlungserfassung: wer die Zuordnung selbst vornimmt, muss `autoMatch: false`
setzen — sonst HTTP 500 durch Doppelzuordnung.

---

## A7 — Testmandanten vom Echtbetrieb trennen

**Was:** 5 von 6 Organisationen sind Test-Mandanten. Sie sind **nicht löschbar** — das
unveränderliche `wf_audit_log` hält Zeilen fest. Also: eindeutig als Test kennzeichnen und
sicherstellen, dass kein Echtkunde in einer Test-Org landet und kein Testdatensatz in einer
Rechnung, einem Mahnlauf oder einer Auswertung des Echtmandanten auftaucht.

**Wo:** Tabelle `organizations`; Prüfung über die `org_fence`-RESTRICTIVE-Policies.

**Unterlagen:** keine.

**Schaltet frei:** Verhindert, dass Testdaten in echten Rechnungen oder Auswertungen landen.
Wichtig: `current_org_id()` ist fail-open — Nutzer ohne Eintrag in `organization_members`
landen in der Stamm-Org. Jeder neue Echtbenutzer braucht eine explizite Mitgliedschaft.

---

# B — DIESE WOCHE

## B1 — SEPA-Gläubiger-ID bei der Deutschen Bundesbank beantragen

**Was:** Der konfigurierte Wert **`DE98ZZZ09999999999` ist ein Platzhalter**, keine gültige
Kennung. Echte Gläubiger-Identifikationsnummer beantragen und eintragen.

**Wo:** Deutsche Bundesbank, https://extranet.bundesbank.de/scp/ → „Gläubiger-Identifikations-
nummer beantragen". Danach eintragen unter Admin → Einstellungen → Organisation, Feld
„SEPA Gläubiger-ID" (`organizations.sepa_creditor_id`).

**Unterlagen:** Vollständiger Firmenname, Rechtsform, Geschäftsadresse, Kontaktdaten,
Verwendungszweck. Kostenlos, Zustellung in der Regel innerhalb weniger Minuten per E-Mail.

**Schaltet frei:** SEPA-Lastschrifteinzug. `lib/billing/sepa/sepa-service.ts:177` wirft heute
bei jedem Einzugsversuch — korrekt, denn ein Einzug mit Platzhalter-ID wird von der Bank
abgewiesen. Danach zusätzlich: Mandate einrichten (Format `MREF-[Kundennr]-[lfd.Nr.]`),
Pre-Notifications mindestens 14 Tage vor dem ersten Einzug versenden, Mandatsformular- und
Pre-Notification-Vorlage mit der echten ID aktualisieren.
Vollständige Anleitung: [`ANLEITUNG_SEPA_CREDITOR_ID.md`](./ANLEITUNG_SEPA_CREDITOR_ID.md).

---

## B2 — Preisentscheidung PflegeCoach Selbstzahler

**Was:** Der Verkaufsweg ist **technisch vollständig** (12 von 14 Checklistenpunkten erfüllt,
die übrigen zwei sind bewusste Entscheidungen). Er ist fail-closed gesperrt, weil die Preise
in `lib/coach/pricing.ts` ausdrücklich als Platzhalter deklariert sind
(`PLATZHALTER_BETRAG_CENT`, Kopfkommentar: „dürfen niemandem in Rechnung gestellt werden").

Zu entscheiden sind, in dieser Reihenfolge:
1. Realer Monats- und Jahrespreis → `COACH_PREIS_MONATLICH_CENT`, `COACH_PREIS_JAEHRLICH_CENT`
2. Testphase in Tagen → `COACH_TESTPHASE_MONATLICH_TAGE`, `COACH_TESTPHASE_JAEHRLICH_TAGE`
3. Umsatzsteuer → `COACH_UST_KLEINUNTERNEHMER`, `COACH_UST_SATZ`, `COACH_STEUERNUMMER`,
   ggf. `COACH_UST_ID_NR`
4. Stripe-Produkte mit den echten Beträgen anlegen → `COACH_STRIPE_PRICE_MONATLICH`,
   `COACH_STRIPE_PRICE_JAEHRLICH`, `COACH_STRIPE_WEBHOOK_SECRET` (eigener Secret, nicht der
   der Hauptanwendung)
5. **Erst danach** `COACH_PREISE_FREIGEGEBEN=true`

**Wo:** Preisentscheidung durch den Produktverantwortlichen; Stripe-Dashboard;
Env-Variablen in Vercel (Production).

**Unterlagen:** Kalkulation. Diese Checkliste nennt bewusst keinen Betrag — die im Code
stehenden 19 €/190 € sind Platzhalter und **keine Empfehlung**.

**Schaltet frei:** Checkout, Bestellung, Rechnung (`PC-YYYY-NNNNNN`), Zugangsfreischaltung und
Kündigung. Automatisch mit: die Verkaufsseite `/pflegecoach/start` wird indexierbar —
`robots.index` hängt in `app/pflegecoach/_lib/seitentitel.ts:57-63` direkt an
`verkaufMoeglich()`. Der Produktbereich selbst bleibt dauerhaft `noindex`.
**`COACH_DIPA_MODUS` bleibt `false`** — der Selbstzahler-Weg darf keine Aussage über
Kostenträger, Kassenerstattung oder BfArM treffen.

---

## B3 — Stripe-Env für den Pflegedienst-SaaS-Weg prüfen

**Was:** Der günstigste offene Punkt der gesamten Business-Matrix: der SaaS-Weg ist als
„verkaufbar, Abrechenbarkeit unbestätigt" geführt und braucht vermutlich nur die Prüfung von
vier Env-Variablen in Vercel. In Minuten zu klären.

**Wo:** Vercel → Projekt-Settings → Environment Variables (Production).

**Unterlagen:** keine.

**Schaltet frei:** Klärt, ob ein zweiter Umsatzweg heute schon funktioniert oder ob ein
Produktpreis fehlt.

---

## B4 — CI: Testsuite und E2E als Pflicht-Gate

**Was:** Die CI lief in der Vergangenheit über vier Commits unbemerkt rot, weil ein
Schema-Wahrheits-Fix die alten Testannahmen brach. Sicherstellen, dass ein roter Lauf
sichtbar ist und den Deploy blockiert; die E2E-Suite aus **A2** dort aufnehmen.

**Wo:** `.github/workflows/`, GitHub-Branch-Protection.

**Unterlagen:** keine.

**Schaltet frei:** Verhindert die Wiederholung genau des Musters, das schon einmal vier
Commits lang unentdeckt blieb.

---

## B5 — `npm run check:schema-drift` als festen Vor-Deploy-Schritt etablieren

**Was:** Eine unbekannte Spalte lässt eine PostgREST-Abfrage still komplett fehlschlagen
(Fehler 42703) — das Feature ist tot, ohne dass irgendetwas alarmiert. So wurden bereits
12 tote Abfragen gefunden.

**Wo:** `npm run check:schema-drift` (prüft `select`-Listen **und** Filter).

**Unterlagen:** keine.

**Schaltet frei:** Frühwarnung statt stiller Datenverluste nach jeder Schemaänderung.

---

## B6 — Reaktionszeit-Zusage für den Support festlegen

**Was:** `COACH_SUPPORT_EMAIL` ist in Fußzeile, Produktseite, Einstellungen und Konto-Seite
eingebunden, `/pflegecoach/anfrage` existiert. Es ist bewusst **keine** Reaktionszeit
behauptet, solange keine zugesagt wurde (DiPA-Punkt VS-02).

**Wo:** Entscheidung des Produktverantwortlichen, danach Text auf den Support-Seiten.

**Unterlagen:** keine.

**Schaltet frei:** Erledigt VS-02 vollständig. Solange offen: nichts versprechen, was nicht
gehalten wird — der aktuelle Zustand ist korrekt, nur unvollständig.

---

# C — VOR KASSENABRECHNUNG

> **Kernaussage:** Kein Bereich der Kassenabrechnung ist code-seitig blockiert. Alle zehn
> geprüften Bereiche sind intern fertig oder komplett gebaut und einzig durch externe Vorgänge
> gesperrt. **C1 ist der einzige Vorgang, dessen Nachhalten sich dreifach auszahlt** — er
> entscheidet über § 45b, VP/KZP und § 105 gleichzeitig.

## C1 — § 45a-Anerkennungsbescheid Hessen nachhalten ⚑ KRITISCHER PFAD

**Was:** Das Anerkennungsverfahren nach § 45a SGB XI läuft
(`state_settings.hessen`: Status `ANTRAG_EINGEREICHT`, `anerkannt_am` ist **NULL**). Ohne
Bescheid erkennt die Pflegekasse die Leistung für den Entlastungsbetrag nicht an — auch nicht
auf dem Kostenerstattungsweg über die versicherte Person. Der Papierweg umgeht die Anerkennung
nicht, er umgeht nur den Datenträgeraustausch.

**Wo:** Zuständige hessische Landesbehörde (Anerkennungsverfahren nach § 45a SGB XI).
Nach Erhalt eintragen: `state_settings.hessen.anerkannt_am` + `approval_document`, zu
erreichen über Admin → Expansion Deutschland.

**Unterlagen:** Der Anerkennungsbescheid selbst. Für den Sachstand: Aktenzeichen des laufenden
Antrags.

**Schaltet frei:** Drei blockierte Geschäftsfelder gleichzeitig — § 45b Entlastungsbetrag,
Verhinderungs-/Kurzzeitpflege (§§ 39, 42 SGB XI) und die Kassendirektabrechnung nach
§ 105 SGB XI. **Ohne diesen Bescheid ist C2 bis C8 sinnlos.**

---

## C2 — Vergütungsvereinbarungen abschließen, dann Tarife kontrolliert freigeben

**Was:** 8 von 9 § 45b-Tarifen stehen auf `blocked` (Satz 35,00 €/Std,
`verifizierungs_quelle`: „PfluV Hessen: 35 EUR"). `create_invoice_draft_atomic()` und
`resolvePrice()` werfen dafür `TarifNichtVerifiziertError` — eine § 45b-Rechnung entsteht
heute gar nicht erst. **Das ist gewolltes Verhalten, kein Defekt, und bleibt so, bis eine
Rechtsquelle vorliegt.**

Live-Stand: `billing_tariffs` 23 Zeilen (11 verified · 8 blocked · 4 unverified),
`leistungspreise` 24 Zeilen (alle unverified), `service_pricing` als dritte Legacy-Tabelle
ohne `tarif_status`.

**Wo:** Vergütungsvereinbarung mit den Pflegekassen bzw. maßgebliche Landesregelung.
Freigabe ausschließlich über `PATCH /api/billing/tariffs/[id]/verifizierung` — der Endpunkt
**verlangt eine Rechtsquelle** und protokolliert unveränderlich in `billing_tariff_audit`.
Ein direktes `UPDATE` auf der Tabelle wird durch einen DB-Trigger abgewiesen.

**Unterlagen:** Vergütungsvereinbarung oder Verordnungstext mit Datum und Fundstelle — je
Tarif einzeln, nicht pauschal.

**Schaltet frei:** § 45b-Rechnungen, den Geldbetrag auf dem Leistungsnachweis (heute entfällt
die Geldzeile über `pruefeBetragsfreigabe()`, Einsätze und Handzeichen werden weiter gedruckt)
und `kassenrechnung_enabled` für Hessen. **Die 35 €/h-Tarife bleiben `blocked`, bis eine
Rechtsquelle vorliegt — nicht vorher freigeben.**

---

## C3 — SECON-/ITSG-Zertifikat beantragen

**Was:** Kostenpflichtiger Vorgang mit mehreren Tagen Vorlauf. Kein Code kann das ersetzen.

**Wo:** ITSG Trust Center. Ablage danach: PKCS#12-Datei über Admin → Abrechnung →
Einstellungen hochladen (landet im privaten Bucket `abrechnung` unter
`zertifikate/<org>/absender-<ik>-<fingerprint>.p12`, **nie** in der Datenbank). Das beim
Antrag selbst vergebene Passwort als Env `SECON_ZERT_PASSWORT` in Vercel.

**Unterlagen:** IK-Nummer **460629986** (Bescheid liegt vor), Firmendaten,
Ansprechpartner. Die Empfänger-Zertifikate lädt das System selbst aus dem öffentlichen
ITSG-Verzeichnis.

**Schaltet frei:** SECON-Verschlüsselung. Ohne Verschlüsselung verlässt keine Datei das
Haus — die Sperre sitzt bewusst **nach** dem Verschlüsselungsschritt.

---

## C4 — SFTP-Zugang bei jeder Datenannahmestelle

**Was:** Zugang beantragen, Schlüsselpaar selbst erzeugen, den **öffentlichen** Teil bei der
Stelle registrieren.

**Wo:** Jeweilige Datenannahmestelle. Privaten Schlüssel hochladen über
`POST /api/admin/abrechnung/sftp-key` (Admin → Annahmestellen) — Ablage im Bucket
`abrechnung` unter `sftp-keys/<das-id>.key`, nie in der DB. Verbindungsdaten in die Tabelle
`datenannahmestellen`: `sftp_host`, `sftp_port`, `sftp_user`, `sftp_verzeichnis`,
`antwort_verzeichnis`.

**Unterlagen:** IK-Nummer, Zertifikatsfingerprint, öffentlicher SSH-Key.

**Schaltet frei:** Den Transportweg für § 105 SGB XI. § 302 SGB V nutzt denselben Weg — ein
zweiter Zugang ist nicht nötig, sofern die Stelle beide Verfahren annimmt.

---

## C5 — Testübertragung mit Dateiindikator `0` durchführen

**Was:** Testübertragung mit der Annahmestelle vereinbaren und durchführen. Der Dateiindikator
im UNB-Segment entscheidet: `0` = Testdatei, folgenlos · `2` = Echtdatei, **Forderung**.
Ohne Eintrag gilt immer Testbetrieb — nicht „unbekannt", nicht „wie zuletzt".

**Wo:** Ablauf: `POST /api/billing/dta/create` → `/validate` → `/freigabe` → `/export`
→ `/versand`, Antworten über `POST /api/billing/dta/antworten`.

**Unterlagen:** Bestätigung der Annahmestelle mit **Datum und Referenz** — beides wird beim
Umschalten auf Echtbetrieb verlangt.

**Schaltet frei:** Voraussetzung für C6. Das Umschalten auf Echtbetrieb erfordert drei Dinge
gleichzeitig: offenes Env-Gate, belegte Testübertragung, und die umschaltende Person tippt
`ECHTBETRIEB`.

---

## C6 — `ITSG_ZERTIFIZIERT=true` setzen — als letzter Schritt

**Was:** Env-Variable in Vercel setzen. **Nur der exakte String `true`** schaltet frei —
`1`, `TRUE` oder ein Leerzeichen zu viel bedeuten gesperrt (fail-closed by design).

**Wo:** Vercel → Environment Variables (Production). Aktueller Stand jederzeit abrufbar über
`GET /api/billing/dta/freigaben`. Zusätzlich `state_settings.dakota_export_enabled` für
Hessen aktivieren.

**Unterlagen:** C1 + C3 + C4 + C5 müssen **alle** vorliegen. Diese Variable behauptet, dass
ein Dritter etwas erteilt hat — genau deshalb ist es eine Env-Variable und kein
Admin-Klick in der Datenbank.

**Schaltet frei:** § 105 SGB XI — Übertragung an die Datenannahmestelle und Antwortabruf.

---

## C7 — Technische Anlage 1 zur § 302-Vereinbarung beschaffen

**Was:** `erzeugeSgbVDatei()` in `lib/abrechnung/sgb-v/generator.ts` wirft **absichtlich
immer** `SgbVSpecFehltError`, `exportImplementiert()` liefert hart `false`. Grund: die
Segmentstrukturen dürfen nicht aus dem Gedächtnis rekonstruiert werden. Routing,
Positionsaufbereitung, Versionsauflösung, Statusmodell und Lauf-Anlage sind fertig;
`POST /api/billing/sgb-v/versand` legt heute schon einen echten, prüfbaren Lauf an und endet
planmäßig bei `gesperrt_extern`.

**Wo:** GKV-Spitzenverband (Technische Anlagen zur Vereinbarung nach § 302 Abs. 2 SGB V).

**Unterlagen:** TA1 in der zum Zeitpunkt gültigen Fassung.

**Schaltet frei:** Nach Implementierung gegen die echte Spezifikation:
`SGB_V_302_FREIGABE=true` → häusliche Krankenpflege abrechenbar. **Bis dahin keine Segmente
rekonstruieren.**

---

## C8 — Fehlercode-Katalog aus echten Rückläufern befüllen

**Was:** `dta_fehlercode_katalog` ist live leer (0 Zeilen) — **bewusst**. Geratene
Kassen-Fehlercodes würden eine echte Ablehnung still falsch einsortieren. Ohne Katalogtreffer
greift eine Heuristik, die im Zweifel `unbekannt` liefert und den Fall im Arbeitsvorrat
sichtbar hält.

**Wo:** Befüllung nach den ersten echten Rückläufern der Kostenträger.

**Unterlagen:** Reale Rückläufer-Dateien bzw. der Fehlercode-Schlüssel der jeweiligen
Annahmestelle.

**Schaltet frei:** Automatische Klassifizierung von Ablehnungen statt manueller Sichtung.
Kein Blocker für den Go-Live — die Mechanik (`ruecklaeufer.ts`, `wiedervorlage.ts`)
funktioniert auch mit leerem Katalog.

---

# D — VOR DiPA

> **Stand:** 29 von 48 Punkten erledigt, 3 teilweise, 16 offen — davon **15 extern**, 1 intern
> (D13). Alle intern möglichen Punkte sind abgearbeitet. Der Selbstzahler-Weg (Produkt A)
> braucht **nichts** aus dieser Stufe. `COACH_DIPA_MODUS` bleibt `false`, bis eine Aufnahme
> vorliegt.

## D1 — BfArM-Beratungstermin beantragen ⚑ BILLIGSTER ERSTER SCHRITT (REG-05)

**Was:** Beratungsgespräch beantragen. Der Fragenkatalog mit 20 vorbereiteten Fragen liegt
fertig vor — er klärt gleich mehrere andere offene Punkte auf einmal (Frage 9: Geltung des
TR-03161-Zertifikats für eine vorläufige Aufnahme · Frage 10: Verbindlichkeit von FHIR ·
Frage 11: ISMS-Geltungsbereich · Frage 12: Nachweisform Barrierefreiheit · Frage 13:
Trennungstiefe zur Plattform · Frage 16: Lizenzen für Assessment-Instrumente).

**Wo:** BfArM (Bundesinstitut für Arzneimittel und Medizinprodukte), DiPA-Verzeichnis.

**Unterlagen:** `audit/dipa/bfarm_fragenkatalog.md` (Fragen 1–20, versandfertig),
Produktbeschreibung, Zweckbestimmung.

**Schaltet frei:** Klärt REG-02, REG-03, SEC-01, SEC-03, SEC-05, SEC-08, INT-02, BF-01 und
QI-02 in einem Termin. **Günstigster nächster Schritt der gesamten DiPA-Liste.**

---

## D2 — BSI TR-03161-Zertifikat ⚑ KRITISCHER PFAD, MONATE VORLAUF (SEC-01)

**Was:** Zertifikat einer akkreditierten Prüfstelle. Vorhanden ist bislang nur eine
**Selbsteinschätzung, kein Zertifikat**. Wegen der Vorlaufzeit parallel zu D1 anfragen.

**Wo:** Akkreditierte Prüfstelle nach BSI TR-03161.

**Unterlagen:** `audit/dipa/tr03161_checkliste.md` (Selbsteinschätzung),
`audit/dipa/verschluesselungskonzept.md`, `sicherheitsarchitektur_pflegecoach.md`,
`technische_dokumentation_pflegecoach.md`.

**Schaltet frei:** Der längste Einzelvorgang der DiPA-Kette. Zusätzlich verifiziert die
Prüfstelle SEC-02 mit.

---

## D3 — Datenschutz-Folgenabschätzung durch Kanzlei/DSB (DS-02)

**Was:** DSFA nach Art. 35 DSGVO. Die Vorbereitung liegt vor, offene Bewertungen sind darin
markiert. Einwilligungstexte und Datenschutzhinweise mitprüfen lassen.

**Wo:** Kanzlei oder externer Datenschutzbeauftragter.

**Unterlagen:** `audit/dipa/dsfa_pflegecoach.md`, `verarbeitungsverzeichnis_pflegecoach.md`,
`datenfluesse_pflegecoach.md`, `loeschkonzept.md`.

**Schaltet frei:** DS-02, und im selben Mandat gegenprüfbar: DS-05, PROD-02
(MDR-Negativabgrenzung) und VS-04 (Nutzungsbedingungen). **Diese drei in ein Mandat bündeln.**

---

## D4 — AVV-Kette vervollständigen (DS-04)

**Was:** Auftragsverarbeitungsverträge für Supabase, Vercel, Resend und Stripe beschaffen,
Unterauftragnehmerlisten anfordern, Aufbewahrungsfristen der Sicherungen erfragen. Die Kette
ist erhoben, eine 10-Punkte-Prüfliste liegt vor — **die Verträge selbst fehlen**.

**Wo:** Direkt bei den vier Anbietern.

**Unterlagen:** `audit/dipa/avv_dossier_pflegecoach.md`, `AVV_VORLAGE.md`.

**Schaltet frei:** DS-04, und schließt zugleich die offene Frage aus DS-03 (Aufbewahrungsfrist
der Sicherungen).

---

## D5 — Externen Penetrationstest beauftragen (SEC-04)

**Was:** Die Beauftragungsunterlage ist **versandfertig**: Umfang, 5 Testkonten,
6 Schwerpunkte, Regeln, Abnahmekriterien. An mindestens drei Anbieter zur Angebotseinholung
geben.

**Wo:** Security-Dienstleister.

**Unterlagen:** `audit/dipa/pentest_beauftragung_scope.md`.

**Schaltet frei:** SEC-04.

---

## D6 — ISMS-Geltungsbereich festlegen und Beratung anfragen (SEC-05)

**Was:** Drei Geltungsbereiche sind bewertet, der Bestand nach 13 Themenfeldern erhoben, die
5 größten Lücken benannt. **Reihenfolge:** erst Geltungsbereich mit dem BfArM klären
(D1, Frage 11), dann Beratung anfragen.

**Wo:** ISMS-/ISO-27001-Beratung.

**Unterlagen:** `audit/dipa/isms_scope_vorbereitung.md`.

**Schaltet frei:** SEC-05, und mit ihm die externe Auditierbarkeit des QMS (QMS-01) sowie die
noch fehlende Auswertung/Alarmierung des Audit-Logs (SEC-07, Lücke 5).

---

## D7 — BITV-/Barrierefreiheits-Test beauftragen (BF-01)

**Was:** Die Grundausstattung ist umgesetzt (3 Schriftgrade, Kontrastmodus, Skip-Link,
ARIA-Landmarks, Touch-Ziele ≥ 44 px, `prefers-reduced-motion`), die maschinelle
Strukturprüfung liegt in `e2e/pflegecoach.spec.ts`. Was fehlt, ist der externe Nachweis nach
EN 301 549 / WCAG 2.1 AA.

**Wo:** BITV-Prüfstelle. Nachweisform vorher mit dem BfArM klären (D1, Frage 12).

**Unterlagen:** Zugang zum Produkt, Testkonten.

**Schaltet frei:** BF-01. Setzt A2 voraus — die Strukturprüfung sollte laufen, bevor extern
geprüft wird.

---

## D8 — Gebrauchstauglichkeitstest mit Testpersonen (BF-02, BF-03)

**Was:** 5 Testpersonen **ohne Vorkenntnis des Produkts** gewinnen. Der Durchführungsplan mit
9 Aufgaben, Zeitlimits, Erfolgskriterien und Bewertungsmaßstab liegt fertig vor. Im selben
Termin den manuellen Screenreader-Durchgang mit VoiceOver/NVDA erledigen (Prüfpunkte S1–S8
sind festgelegt) — das schließt BF-03 mit ab.

**Wo:** Eigene Organisation, Rekrutierung aus der Zielgruppe.

**Unterlagen:** `audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md`,
Einwilligung der Testpersonen, Protokollbögen.

**Schaltet frei:** BF-02 und BF-03 in einem Durchgang.

---

## D9 — Pflegefachkraft für die Inhaltsprüfung beauftragen (QI-01) ⚑ HÖCHSTES PRODUKTRISIKO

**Was:** Alle 12 Module stehen weiterhin auf `pruefstatus: 'entwurf'`. Prüfgegenstand,
Kriterien K1–K6, Einstufungen und Protokollform sind definiert. Als Risiko R1.4 geführt —
das **höchste Produktrisiko** — und es betrifft **auch Produkt A**, den heute verkaufbaren
Selbstzahler-Weg.

**Wo:** Externe Pflegefachkraft mit einschlägiger Qualifikation.

**Unterlagen:** `audit/dipa/inhalte_pruefdossier.md`, die 12 Module.

**Schaltet frei:** QI-01, und im selben Auftrag gegenprüfbar QI-03 (Pflegeprobleme/Pflegeziele).
**Dieser Punkt ist die einzige D-Position, die auch ohne DiPA-Ambition Priorität verdient** —
er betrifft die fachliche Qualität dessen, was heute schon verkauft würde.

---

## D10 — Lizenzen für Assessment-Instrumente klären (QI-02)

**Was:** Aktuell im Einsatz: ein produktinternes 7-Item-Kurzinstrument, transparent als **nicht
validiert** gekennzeichnet; der FHIR-Export überträgt nur Summenwerte. Zu klären ist, ob und
zu welchen Bedingungen validierte Instrumente (FES-I, HPS/BSFC-s, SUS) genutzt werden dürfen.

**Wo:** Jeweilige Rechteinhaber; Rahmenklärung im BfArM-Termin (D1, Frage 16).

**Unterlagen:** Lizenzanfragen, Nutzungsumfang, geplante Nutzerzahl.

**Schaltet frei:** QI-02. Bis dahin bleibt die Kennzeichnung „nicht validiert" — sie ist
korrekt und darf nicht entfernt werden.

---

## D11 — Studienpartner und Ethikvotum für den Nutzennachweis (NN-01)

**Was:** Das Evaluationskonzept liegt vor, es fehlen **Studienpartner und Ethikvotum**.
Hochschul- oder Institutspartner gewinnen, Ethikvotum einholen.

**Wo:** Hochschule / Forschungsinstitut mit Pflegewissenschafts-Bezug; zuständige
Ethikkommission.

**Unterlagen:** `audit/dipa/evaluationskonzept.md`, `pilotdesign.md`.

**Schaltet frei:** NN-01 und damit den Pilotstart (NN-03), der zusätzlich an QI-01 hängt.
Vor Pilotstart außerdem `COACH_NUTZUNGSNACHWEIS_AKTIV=true` setzen (NN-02) —
`coach_nutzungsereignisse` erfasst dann Ereignisse **ohne Zeitstempel und ohne Inhalte**.

---

## D12 — Nutzungsbedingungen wirksam machen (VS-04)

**Was:** Der Entwurf umfasst 13 Paragrafen mit Prüfliste. Er ist **nicht wirksam und nicht
veröffentlicht**.

**Wo:** Zusammen mit D3 in dasselbe Mandat geben (DS-02 + PROD-02 + VS-04).

**Unterlagen:** `audit/dipa/nutzungsbedingungen_entwurf_selbstzahler.md`.

**Schaltet frei:** VS-04. **Hinweis:** Der Selbstzahler-Weg hat eigene, verlinkte Coach-AGB
und eine versionierte Widerrufsbelehrung (`WIDERRUFSBELEHRUNG_VERSION`, je Bestellung
protokolliert) — dieser Punkt betrifft die DiPA-Fassung, nicht den heutigen Verkauf.

---

## D13 — Anforderungskatalog gegen die Originaldokumente prüfen (REG-01) — INTERN

**Was:** Der einzige intern lösbare offene DiPA-Punkt. **43 von 48 Einträgen sind ungeprüft;
die belastbare Quote liegt damit bei 6 %.** Die Formulierungen in der Matrix sind
Arbeitsfassungen, keine Zitate. DiPAV, BfArM-Leitfaden und BSI TR-03161 durcharbeiten und je
Eintrag `anforderungstextGeprueft` setzen.

**Wo:** `lib/coach/anforderungskatalog.ts`, Prüfung über `npm run dipa:katalog` (meldet tote
Nachweisverweise und erfüllte Einträge ohne Beleg).

**Unterlagen:** DiPAV, BfArM-Leitfaden, BSI TR-03161 — jeweils in der zum Antragszeitpunkt
gültigen Fassung.

**Schaltet frei:** Ohne diesen Schritt ist unbekannt, ob die 29 als erledigt geführten Punkte
die **echte** Anforderung erfüllen oder nur unsere Arbeitsfassung davon. **Vor Antragstellung
zwingend.**

---

# E — OPTIONAL / nice-to-have

## E1 — Wachposten gegen das stille Wiederöffnen der Tarif-Sperre

**Was:** Drei Definitionen von `zaehle_kassentarife` existieren im Migrationsverlauf
(`20260808120000` und `20260808130000` — beide **ohne** `tarif_status`-Filter — sowie
`20260831050000` **mit** `AND tarif_status='verified'`). Die zeitlich letzte gewinnt und ist
heute aktiv. Eine künftige Migration, die diese RPC erneut ohne Filter definiert, öffnet die
Fail-Closed-Sperre **still** wieder.

**Wo:** Muster in `scripts/forbidden-strings.json` aufnehmen, damit `npm run lint:forbidden`
anschlägt.

**Schaltet frei:** Schutz gegen eine Regression, die bei Eintritt niemand bemerken würde.

---

## E2 — Drei doppelte Migrations-Zeitstempel umbenennen

**Was:** `20260831010000`, `20260907000000` und `20260907000001` existieren jeweils doppelt.
Bei CLI-basiertem Apply ist die Reihenfolge innerhalb eines Paars undefiniert. Beide
betroffenen Paare sind derzeit voneinander unabhängig — es besteht kein Ordnungskonflikt.

**Wo:** `supabase/migrations/`.

**Schaltet frei:** Verhindert, dass ein künftiges Paar mit echter Abhängigkeit in derselben
Falle landet.

---

## E3 — CAMT-Matching und manuelles Zahlungs-Matching konsolidieren

**Was:** Zwei unabhängige Matching-Engines existieren nebeneinander:
`lib/billing/matching/matching-engine.ts` für den CAMT-Kontoauszug-Import und der manuelle
Zahlungsweg über `autoMatchPayment`. Architektonisch sauber getrennt, aber zwei parallele
Implementierungen sind eine offene Konsolidierungsfrage.

**Wo:** `lib/billing/matching/`, `lib/billing/core/payments.ts`.

**Schaltet frei:** Nichts — reine Wartbarkeit. Ausdrücklich **nicht** go-live-relevant.

---

## E4 — Admin-Leseansicht auf `coach_bestellungen` — Produktentscheidung

**Was:** Es existiert **keine** RLS-Policy, die Admins Lesezugriff auf `coach_bestellungen`
gibt. Das ist in der Migration ausdrücklich so festgelegt: der Nutzer sieht ausschließlich
seine eigenen Bestellungen, ein Admin sieht sie überhaupt nicht. Operative Zahlungs- und
Abo-Sicht ist über das Stripe-Dashboard abgedeckt.

**Wo:** Entscheidung des Produktverantwortlichen — **kein Bug, keine Implementierungslücke.**
Eine Aufweichung wäre ein Privacy-Entscheid.

**Schaltet frei:** In-App-Sicht auf Kaufverträge. Nur umsetzen, wenn bewusst so entschieden.

---

## E5 — PfluV-Sätze in allen drei Preistabellen nachziehen

**Was:** Es existieren drei Preisquellen: `billing_tariffs`, `leistungspreise` (alle 24 Zeilen
`unverified`) und `service_pricing` (Legacy, **ohne** `tarif_status`-Spalte). Die PfluV-Sätze
fehlen in allen dreien.

**Wo:** Nach C2, über den kontrollierten Freigabeweg mit Rechtsquelle.

**Schaltet frei:** Nichts vor C1/C2 — vorher gibt es keine Rechtsquelle, gegen die geprüft
werden könnte. **Unverifizierte LK-/VP-Tarife bleiben `unverified`.**

---

## E6 — KIM / Telematikinfrastruktur

**Was:** `lib/kim/versand.ts` wirft immer `KimSpecFehltError`, bis TA5 vorliegt. Gebaut,
fail-closed, wartet auf gematik-Zulassung, Provider-Vertrag, Konnektor-Anbindung und einen
registrierten Provider-Adapter (`lib/kim/adapter.ts`). Der Ablageort für die
Provider-Zugangsdaten ist **bewusst noch nicht festgelegt** — er ergibt sich erst aus dem
Vertrag.

**Wo:** gematik; KIM-Provider.

**Schaltet frei:** `KIM_AKTIV=true`. Für den aktuellen Go-Live-Scope (Kassenabrechnung
SGB XI / SGB V) **nicht blockierend**.

---

# Abhängigkeitsketten auf einen Blick

```
C1 (§45a-Bescheid Hessen)
 ├─→ C2 (Tarife verified)  ──→ §45b-Rechnungen + Geldzeile auf dem Leistungsnachweis
 ├─→ VP/KZP (§§ 39, 42 SGB XI) abrechenbar
 └─→ C3 (ITSG-Zertifikat) → C4 (SFTP) → C5 (Testübertragung) → C6 (ITSG_ZERTIFIZIERT=true)
                                                                 └─→ §105 SGB XI

D1 (BfArM-Termin) ──→ klärt REG-02, REG-03, SEC-01, SEC-03, SEC-05, SEC-08, INT-02, BF-01, QI-02
D2 (TR-03161)     ──→ längster Vorlauf, parallel zu D1 starten
D3 + D12 + PROD-02 ─→ ein einziges Kanzlei-Mandat
D9 (Pflegefachkraft) ─→ betrifft AUCH den heute verkaufbaren Selbstzahler-Weg

B2 (Preisentscheidung) ──→ PflegeCoach-Checkout + Indexierung der Verkaufsseite
B1 (Creditor-ID)       ──→ SEPA-Lastschrift
```

---

# Was diese Liste bewusst NICHT enthält

- **Keine Preise.** Weder für PflegeCoach noch für Pflegeleistungen. Die Zahlen im Code sind
  ausdrücklich als Platzhalter deklariert.
- **Keine Genehmigungen oder Zulassungen als „vorhanden".** Vorhanden ist ausschließlich der
  **IK-Bescheid (460629986)**. §45a-Anerkennung, ITSG-Zertifikat, BfArM-Listung,
  TR-03161-Zertifikat und Vergütungsvereinbarungen liegen **nicht** vor.
- **Keine echte SEPA-Gläubiger-ID.** `DE98ZZZ09999999999` ist und bleibt ein Platzhalter,
  bis B1 erledigt ist.
- **Keine Änderung an Fail-Closed-Sperren.** `COACH_DIPA_MODUS=false`, 35 €/h-Tarife
  `blocked`, unverifizierte LK-/VP-Tarife `unverified`, `SGB_V_302_FREIGABE=false`,
  `KIM_AKTIV=false` — jede dieser Sperren ist gewolltes Verhalten und wird erst durch den
  jeweils genannten externen Nachweis geöffnet.
- **Entlastungsbetrag = 131 €/Monat** (`entlastungJaehrlich: 1572`), gültig ab 01.01.2025.
  Der 2024er Wert von 125 € bleibt ausschließlich für rückwirkende Berechnungen erhalten.
  VP/KZP kombiniert: 3.539 € (§ 42a, seit 01.07.2025 flexibel aufteilbar).

---

*Erstellt: 14.08.2026 · Phase 6 · Grundlage: Phasen 1–5 (Security-Befunde geschlossen,
2711 Tests, PflegeCoach verkaufsfähig fail-closed, Kassenabrechnung-Readiness-Matrix,
DiPA 29/48 mit 15 Dokumenten in `docs/dipa/`)*
