# Kassenabrechnung Real-Readiness — Teil 2

**Datum:** 2026-08-08
**Branch:** `staging/expansion-abnahme`
**Basis-Commit:** `feb8ea7`
**Supabase Production:** `nnwyktkqibdjxgimjyuq` · Stamm-Org `00000000-0000-4000-8000-000460629986`
**Vorgänger:** `audit/VERIFIZIERUNGSBERICHT_2026-08-08.md`

---

## 0. Zwei Korrekturen an der Aufgabenstellung — vorab

**Supabase MCP war in dieser Umgebung nicht verfügbar.** Der Auftrag nannte
„Supabase MCP verfügbar mit execute_sql". Es ist kein MCP-Server konfiguriert
(`ToolSearch` auf `supabase` liefert nichts, `~/.claude.json` enthält keine
`mcpServers`). Vorhanden ist ausschließlich der Service-Role-Key aus
`.env.local` — der spricht PostgREST und kann Daten lesen/schreiben, aber
**kein DDL ausführen**. Es existiert weder eine `exec_sql`-RPC noch ein
Datenbank-Passwort noch ein Supabase-Access-Token. Die `profiles`-RLS-Migration
ist damit **weiterhin nicht anwendbar** — Details in §1.

**Ich habe eine Zeile in `billing_audit_trail` erzeugt und kann sie nicht
löschen.** Bei der Prüfung des `entity_type`-CHECK-Constraints (§2, P0-1) habe
ich drei Insert-Versuche abgesetzt; die ersten beiden schlugen erwartungsgemäß
fehl (nichts geschrieben), der dritte mit `dta_ruecklaeufer` war gültig und
ging durch. Der Löschversuch wird von einem Trigger blockiert:
`Audit-Trail-Einträge dürfen nicht verändert oder gelöscht werden.` Die Zeile
bleibt bestehen:

```
id         e9c8908f-8d54-4d15-9aba-22096eef5efb
entity_type dta_ruecklaeufer
action      __probe__
checksum    probe
```

Sie ist als Probe erkennbar und fachlich folgenlos (kein Bezug zu einer
Rechnung, keinem Lauf, keinem Kunden). Zwei Probes hätten für den Nachweis
gereicht; der dritte war überflüssig. Falls die Zeile weg soll, geht das nur
mit temporär deaktiviertem Trigger — auf Ansage.

---

## 1. profiles-RLS — EXTERNER BLOCKER, unverändert offen

### Live gemessener Ist-Zustand

```
$ npm run verify:profiles-rls

 FEHL  A_keine_rekursion    42P17 — Migration 20260815010000 ist NICHT angewendet
 FEHL  B_kein_anon_leck     durch die Rekursion verdeckt — erst nach (A) bewertbar
  OK   C_datenbestand       59 Profile (erwartet 59)
```

Der anonyme Zugriff auf `profiles` scheitert weiterhin mit
`{"code":"42P17","message":"infinite recursion detected in policy for relation profiles"}`.
Die Migration ist **nicht** angewendet. Das wird hier ausdrücklich **nicht**
anders behauptet.

### Was stattdessen geliefert wurde

- **`scripts/verify-profiles-rls.mjs`** + `npm run verify:profiles-rls` —
  prüft die drei Zusagen der Migration gegen die Live-DB, rein lesend.
- **Ein Fehler im ersten Entwurf dieses Skripts wurde korrigiert:** die
  Rekursionsprüfung lief zunächst über den Service-Role-Key. Der umgeht RLS
  vollständig und liefert auch bei kaputten Policies HTTP 200 — die Prüfung
  meldete fälschlich „bestanden". Die Rekursion zeigt sich ausschließlich für
  Rollen, die die Policies durchlaufen (`anon`, `authenticated`). Das Skript
  prüft jetzt über den Anon-Key.
- Die Migration `20260815010000` und ihr Rollback sind unverändert
  deployment-ready (Prüfung siehe §6 des Vorgängerberichts).

### Was Yusuf tun muss

Supabase Dashboard → SQL Editor → Inhalt von
`supabase/migrations/20260815010000_profiles_rls_rekursion_und_anon_leck.sql`
einfügen, ausführen, danach `npm run verify:profiles-rls` — es muss 3/3 grün
melden. **Beide Teile müssen gemeinsam laufen:** wer nur die Rekursion behebt,
öffnet ein anon-Leseleck auf 59 Profile inkl. E-Mail und Telefon.

---

## 2. Neu gefundene Defekte

### P0-1 — Der gesamte Rückläufer-, Fehler- und Korrekturpfad war tot

`logBillingAction()` schreibt in `billing_audit_trail`, dessen `entity_type`
einem CHECK-Constraint unterliegt. Die TypeScript-Union erlaubte fünf Werte,
die Postgres ablehnt:

| Code verwendete | Constraint erlaubt |
|---|---|
| `ruecklaeufer` | `dta_ruecklaeufer` |
| `fehlerprotokoll` | `dta_fehlerprotokoll` |
| `korrekturlauf` | `dta_korrekturlauf` |
| `dta_export`, `dta_freigabe` | nur `dta_lauf` |

`logBillingAction` **wirft** bei einem Fehler. Der Aufruf steht mitten in
`importiereRuecklaeufer()`, `erstelleFehler()`, `fuehreKorrekturAus()`,
`gebeLaufFrei()` und `exportiereLauf()` — die Exception riss jeweils die
komplette Verarbeitung mit. Jeder Rückläufer-Import, jede Fehlererfassung,
jede Freigabe und jeder Export wäre in Produktion mit
`Audit-Trail konnte nicht geschrieben werden: … violates check constraint`
abgebrochen, **nachdem** die fachlichen Zeilen bereits geschrieben waren.

**Live nachgewiesen** (zwei bewusst fehlschlagende Inserts, die nichts
schreiben):

```
entity_type='__definitiv_ungueltig__' → 400 / 23514  (Constraint existiert)
entity_type='ruecklaeufer'            → 400 / 23514  (Wert ist NICHT erlaubt)
```

Das erklärt auch, warum `dta_ruecklaeufer`, `dta_fehlerprotokoll` und
`dta_korrekturlaeufe` je 0 Zeilen haben.

**Fix:** alle Werte auf die Constraint-Schreibweise gezogen; die Union in
`audit.ts` ist jetzt die exakte Constraint-Liste (`AUDIT_ENTITY_TYPES`).
Regressionstest `__tests__/abrechnung/schema-konsistenz.test.ts` liest den
Constraint aus den Migrationen und vergleicht ihn mit der TS-Liste.

### P0-2 — Audit-Trail war mandantenblind

`logBillingAction()` setzte `organization_id` nicht. Die Spalte hat den Default
`current_org_id()`, der bei einem Service-Role-Client (kein JWT) auf die
**Stamm-Org** zurückfällt. Wirkung: jede Abrechnungsaktion **jedes** Mandanten
wäre im Audit-Trail der Stamm-Org gelandet — der verursachende Mandant hätte
seinen eigenen Trail wegen der `org_fence`-Policy nie gesehen, die Stamm-Org
dafür fremde Vorgänge.

Live sichtbar in der Fehlermeldung des Probe-Inserts: `organization_id` wurde
ohne Angabe auf `00000000-0000-4000-8000-000460629986` gesetzt.

**Fix:** `organizationId` ist jetzt **Pflichtfeld** in `AuditLogParams`. Alle
26 Aufrufstellen wurden nachgezogen; TypeScript erzwingt es. Wo die Org nicht
als Parameter vorlag, wird sie aus der geladenen Zeile genommen
(`lauf.organization_id`, `korrektur.organization_id`, …) statt aus einem
optionalen Argument.

### P1-1 — Pre-Flight prüfte Zertifikat und Transport mandantenübergreifend

```ts
// vorher
.from('abrechnung_zertifikate').select('gueltig_bis').eq('typ', 'absender')
.from('datenannahmestellen').select(...).eq('aktiv', true)
```

Beide Abfragen ohne `organization_id`. Eine Organisation **ohne** eigenes
SECON-Zertifikat hätte den Prüfpunkt bestanden, sobald irgendein anderer
Mandant eines besaß — und wäre in den Versand gelaufen. Analog für die
Transportkonfiguration.

**Fix:** `organization_id`-Filter ergänzt. Bei Datenannahmestellen bleibt
`organization_id IS NULL` zulässig, damit global gepflegte Stellen (ITSCare,
BITMARCK) für alle Mandanten nutzbar sind, ohne dass Mandanten sich
gegenseitig sehen.

### P1-2 — Zertifikatsverwaltung ohne Mandantenbezug, mit unbrauchbarem `upsert`

`lib/abrechnung/zertifikate.ts` filterte **nirgends** nach `organization_id`,
obwohl die Tabelle die Spalte hat. Zusätzlich:
`upsert(…, { onConflict: 'ik_nummer,typ' })` — ein Unique-Constraint über
`(ik_nummer, typ)` existiert in den Repo-Migrationen nicht; der Aufruf wäre zur
Laufzeit mit 42P10 gescheitert. Der Upload-Pfad schrieb außerdem keine
`organization_id`, während die GET-Route danach filtert: ein hochgeladenes
Zertifikat wäre in der Oberfläche nie aufgetaucht.

**Fix:** select-then-write über `(organization_id, ik_nummer, typ, fingerprint)`
statt `upsert`. `speichereAbsenderZertifikat` und `ladeAbsenderZertifikat`
verlangen jetzt eine `organizationId`. Storage-Pfad enthält Org und
Fingerprint.

### P1-3 — Stille No-Ops mit trotzdem geschriebenem Audit-Eintrag

`markiereRuecklaeuferErledigt()` und `gebeLaufFrei()` führten ein Update mit
optionalem `organization_id`-Filter aus, **ohne** das Ergebnis zu prüfen. Ein
Aufruf mit fremder Org veränderte nichts — der Audit-Trail meldete trotzdem
„erledigt" bzw. „freigegeben".

**Fix:** `.select().maybeSingle()` am Update; ohne getroffene Zeile wird
geworfen.

### P1-4 — Halbe Ereignis-Konfiguration nicht speicherbar

Die TS-Union `EreignisTyp` und der Constraint `ops_ereignis_typ_check` waren
nie deckungsgleich: **11 von 22** TS-Werten lehnt Postgres ab, **11** DB-Werte
waren aus dem Code nicht erreichbar — darunter `abrechnung_ruecklaefer`, genau
der Typ, den die neue Aufgaben-Automatik braucht.

**Fix:** TS-Union auf die Vereinigung gezogen; Migration
`20260816010000_ereignis_typ_konsistenz.sql` (+ Rollback) zieht die DB-Seite
nach. Regressionstest erzwingt Deckungsgleichheit. `abrechnung_ruecklaefer` ist
**bereits heute** DB-gültig — die neue Automatik funktioniert ohne diese
Migration.

### P2-1 — Admin ohne Org-Mitgliedschaft landet still auf der Stamm-Org

`getActiveOrgId()` fällt auf `DEFAULT_ORG_ID` zurück, wenn der User keine
Zeile in `organization_members` hat. Ein `admin`-Profil ohne Mitgliedschaft
arbeitet damit unbemerkt auf den Daten der Stamm-Org. Das ist dokumentiertes
Bestandsverhalten („Bestandsverhalten bleibt identisch") und **nicht** in
dieser Session entstanden — für einen Mehrmandantenbetrieb ist es trotzdem ein
Fallback, der besser ein 403 wäre. Nicht geändert, weil es außerhalb des
Auftrags liegt und bestehende Zugänge brechen könnte.

### Security-Sweep — was geprüft wurde und sauber ist

- **Cookie-Vertrauen:** `getActiveOrgId()` validiert den Org-Switcher-Cookie
  gegen die tatsächliche Mitgliedschaft (`orgs.some(o => o.id === fromCookie)`)
  und prüft ihn zusätzlich gegen ein UUID-Muster. Ein gesetzter Fremd-Org-Cookie
  führt **nicht** zu Fremdzugriff, und der Wert kann nicht in den
  PostgREST-`.or()`-Filter injiziert werden.
- **Auth:** alle vier neuen Routen laufen über `requireAdminMitOrg()`
  (401 ohne Session, 403 ohne Adminrolle, 403 ohne Organisation).
- **IDOR:** beide `DELETE`-Routen filtern zusätzlich auf `organization_id` und
  liefern 404 statt zu löschen, wenn die Zeile einem anderen Mandanten gehört.
- **Mass Assignment:** Feld-Allowlist je Route; `organization_id`,
  `deleted_at`, `sftp_key_url` sind von außen nicht setzbar.
- **Secret Leakage:** `datenannahmestellen` GET ersetzt `sftp_key_url` durch
  ein Ja/Nein; die Readiness-Antwort enthält weder Zertifikat, Key-Pfad, Host
  noch Passwort — durch Test abgesichert.
- **Fehlermeldungen:** neue Routen geben nach außen „Interner Serverfehler"
  und protokollieren das Detail serverseitig, statt DB-Meldungen
  durchzureichen.

---

## 3. Neu gebaut

### 3.1 Automatische Aufgabe bei Kassenrückläufer (`lib/abrechnung/ruecklaeufer-aufgaben.ts`)

Der Vorgängerbericht führte das als **FEHLT**. Tatsächlich existierte ein
Ansatz — aber ausschließlich in `POST /api/billing/dta/ruecklaeufer`, ohne
Dublettenschutz, ohne Verantwortlichen, ohne Audit-Eintrag. Jeder andere
Eingangsweg (automatischer Antwortabruf über `pruefeAntworten()`, Job, direkter
Aufruf) erzeugte still keine Aufgabe.

Die Erstellung sitzt jetzt **an der Quelle** in `importiereRuecklaeufer()`; die
Route erzeugt nichts mehr selbst.

| Anforderung | Umsetzung |
|---|---|
| organization_id | `ops_aufgaben.organization_id`, in jeder Lese- und Schreib-Query gefiltert |
| Rechnung / DTA-Lauf / Rückläufer | `abrechnungslauf_id`, `client_id`, `metadata.{ruecklaeufer_id, invoice_id, fehlerprotokoll_id}` |
| Fehlercode | `metadata.fehler_code` + Klartext in der Beschreibung |
| Priorität | aus dem Status: `abgelehnt`/`korrektur_erforderlich`/`technischer_fehler` → kritisch, Teilablehnung/fachlich → hoch |
| Frist | technisch 2 Tage · Ablehnung 3 · fachlich 5 · sonst 7 |
| Status offen/in Bearbeitung/erledigt | `ops_aufgaben.status` (bestehender Check-Constraint) |
| Verantwortlicher | explizit übergebbar, sonst erster Admin der Org (Zwei-Schritt-Query — zwischen `organization_members` und `profiles` gibt es keinen FK, ein Embed liefert still PGRST200) |
| Zeitstempel | `created_at`, `faellig_am` |
| Audit-Log | `billing_audit_trail`, `action='aufgabe_automatisch_erstellt'`, org-korrekt |
| Admin-Verlinkung | Deep-Links auf `/admin/ruecklaeufer`, `/admin/dta/laeufe/<id>`, `/admin/abrechnungsfehler` |
| Dubletten | eine Aufgabe je `metadata->>ruecklaeufer_id`, statusunabhängig; bei fehlgeschlagener Prüfung wird **nicht** angelegt |

Die Funktion wirft nie — ein Fehler beim Anlegen der Aufgabe darf den
Rückläufer-Import nicht rückgängig machen.

### 3.2 Stammdatenpflege (`lib/abrechnung/stammdaten.ts` + 2 API-Routen + UI)

- Validierung vor jedem Schreibzugriff: IK-Prüfziffer nach § 293 SGB V,
  Kassenart gegen den Katalog, Gültigkeitszeitraum, E-Mail, SFTP-Port,
  Host-Zeichensatz, Zuständigkeits-IKs.
- **Halbe Transportkonfiguration wird abgewiesen** (Host ohne User und
  umgekehrt) — der häufigste Grund für stille Versandfehler.
- Massenimport mit `dryRun` **als Vorgabe**: `{zeilen:[…]}` validiert und
  schreibt nichts, bis `dryRun:false` gesetzt wird. Zeilenweise Bewertung, eine
  fehlerhafte Zeile stoppt den Import nicht.
- `pruefeRouting()` beantwortet für **alle** Kostenträger auf einmal, was der
  Pre-Flight nur für einen prüft.
- Mass-Assignment-Schutz: Feld-Allowlist. `organization_id`, `deleted_at` und
  `sftp_key_url` sind von außen nicht setzbar.
- UI unter `/admin/kassenabrechnung/stammdaten`.

**Es wurden keine Kassendaten als Seed mitgeliefert.** Echte IK-Nummern und
SFTP-Zugänge sind externe Stammdaten; erfundene Werte wären schlimmer als leere
Tabellen, weil sie eine Bereitschaft vortäuschen.

### 3.3 Readiness-Ansicht (`lib/abrechnung/readiness.ts` + Route + Seite)

`/admin/kassenabrechnung/readiness`, Ampel GRÜN/GELB/ROT über 15 Punkte in
fünf Gruppen: Organisation, Stammdaten, SECON, Übertragung, Betrieb. Enthält
IK, Freischaltung je Bundesland, Kostenträger, Datenannahmestellen, Routing,
Tarife, Zertifikat + Restlaufzeit, Übertragungszugang, Test-/Produktionsmodus,
Absenderdaten, letzter Preflight / Dry-Run / Lauf / Versand / Rückläufer,
offene Aufgaben und Fehler.

Zwei Eigenschaften, die über eine gewöhnliche Statusliste hinausgehen:

- **Blocker sind nach `intern` / `extern` getrennt.** Eine Ampel, die beides
  vermischt, verleitet dazu, externe Voraussetzungen für erledigt zu halten.
- **Keine Secrets.** Zertifikatsinhalte, SSH-Key-Pfade, SFTP-Hosts und das
  SECON-Passwort verlassen die Funktion nicht; gemeldet wird nur Existenz.
  Ein Test prüft das gegen die serialisierte Antwort.

„Letzter Preflight" und „letzter Dry-Run" waren vorher nicht beantwortbar —
beide Routen protokollieren jetzt (`preflight_ausgefuehrt`,
`dry_run_ausgefuehrt`), damit der Wert aus einer echten Quelle stammt statt
aus einer Schätzung.

**Gegen Produktionsdaten ausgeführt** (lesend, Stamm-Org):

```
Organisation: Alltagsengel UG · IK 460629986
Gesamt: ROT · versandbereit: false · Modus: test
Ampeln: 2 gruen / 1 gelb / 12 rot

[ OK ] ik_nummer              460629986
[ OK ] absenderdaten          Alltagsengel UG
[ROT ] kassenabrechnung_aktiv 0 von 16 Bundesländern           extern
[ROT ] anerkennung            keine Anerkennung                extern
[ROT ] kostentraeger          0 aktive Kostenträger            intern
[ROT ] datenannahmestellen    0 aktiv, 0 mit Transportweg      intern
[ROT ] routing                0 von 0 Kostenträgern            intern
[ROT ] tarife                 0 aktive Tarife                  intern
[ROT ] secon_absender         —                                extern
[ROT ] secon_ablauf           —                                extern
[ROT ] secon_empfaenger       0 gültig (0 gesamt)              intern
[ROT ] secon_passwort         —                                extern
[ROT ] uebertragungszugang    0 Transportwege, 0 mit SSH-Key   extern
[WARN] dakota                 nicht freigeschaltet             extern
[ROT ] erstversand            nie übermittelt                  extern

Extern zu beschaffen: 8 · Intern lösbar: 5
Secret-Check: keine Geheimnisse in der Antwort.
```

Das ist der reale Ausgangszustand: **8 externe, 5 interne offene Punkte.** Die
fünf internen sind reine Dateneingabe — die Funktionen dafür existieren jetzt
(§3.2), die Daten selbst sind extern zu beschaffen (§9, Punkte 8 und 9).

### 3.4 Versand-Guard (`lib/abrechnung/versand-guard.ts`)

`sendePerSFTP()` und `pruefeAntworten()` haben **keinen einzigen Aufrufer** —
es existiert weder Route noch Job, der tatsächlich überträgt. Solange das so
ist, kann nichts versehentlich hinausgehen. Für den Tag, an dem jemand den Pfad
verdrahtet, sitzt `pruefeVersandbereitschaft()` davor: sie **wirft**, statt
einen Wahrheitswert zurückzugeben, damit ein vergessener If-Zweig nicht zum
stillen Versand führt.

Zusätzlich sind im Pre-Flight drei Punkte von Warnung auf **Pflicht** gehoben:
`secon_absender`, `sftp_config`, `routing`. Vorher meldete der Pre-Flight
„bestanden" für Läufe, die nachweislich nie versendbar waren.

---

## 4. Tests

| Prüfung | Ergebnis |
|---|---|
| `tsc --noEmit` | **0 Fehler** |
| `vitest run` | **1047 passed**, 29 skipped, 0 failed (51 Dateien) |
| `npm run test:unit` (node:test) | **178 passed**, 0 failed |
| `npm run build` | **BUILD_EXIT=0**, 404/404 Seiten |
| `scripts/ci-secret-scan.sh` | clean |
| `scripts/ci-ik-check.sh` | clean |
| `npm run lint:forbidden` | 23.039 Dateien, 0 Treffer |
| `npm run verify:profiles-rls` | **1/3** — erwartet, Migration nicht angewendet |

**Neu: +109 Tests** in 5 Dateien unter `__tests__/abrechnung/`.

| Datei | Tests | Schwerpunkt |
|---|---|---|
| `ruecklaeufer-aufgaben.test.ts` | 27 | Einstufung, Auslösung, Dubletten, Inhalt, Mandantentrennung |
| `stammdaten.test.ts` | 33 | IK-Prüfziffer, Kassenart, Transport-Vollständigkeit, Import-dryRun, Routing-Lücken |
| `readiness.test.ts` | 20 | Ampelschwellen, Teilzustände, **Secret-Leakage** |
| `e2e-ruecklaeufer-kette.test.ts` | 16 | vollständige Kette gegen speicherinterne DB |
| `schema-konsistenz.test.ts` | 13 | TS-Union vs. Postgres-Constraint (beide P0/P1-Klassen) |

Ein bestehender Security-Test (`p0-billing-mandanten-isolation`) wurde
**erweitert, nicht aufgeweicht**: er akzeptiert jetzt zusätzlich
`requireAdminMitOrg()` als Org-Quelle — und prüft in einem neuen Fall, dass
dieser Helfer die Org selbst über `getActiveOrgId()` auflöst und nicht aus
`profiles` zieht.

---

## 5. Datenintegrität vorher / nachher

| Tabelle | Vorher | Nachher |
|---|---|---|
| profiles | 59 | 59 |
| clients | 4 | 4 |
| invoices | 5 | 5 |
| service_records | 31 | 31 |
| caregivers | 2 | 2 |
| abrechnungslaeufe | 1 | 1 |
| verordnungen | 3 | 3 |
| client_budgets | 4 | 4 |
| assignments | 5 | 5 |
| leistungspreise | 24 | 24 |
| monthly_closings | 0 | 0 |
| dta_lauf_rechnungen / dta_ruecklaeufer / dta_fehlerprotokoll | 0 | 0 |
| dta_kostentraeger / datenannahmestellen / abrechnung_zertifikate | 0 | 0 |
| ops_aufgaben | 0 | 0 |
| **billing_audit_trail** | **0** | **1** ⚠️ |

Die einzige Änderung ist die Probe-Zeile aus §0. Kein DDL, keine Löschung,
keine Demo-Daten. Alle Verifikationsläufe liefen lesend oder speicherintern.

---

## 6. E2E-Matrix — alt vs. neu

| # | Schritt | Vorher | Jetzt | Nachweis |
|---|---|---|---|---|
| 1–6 | Aufnahme … Leistungsnachweis | FUNKTIONIERT | **unverändert** | — |
| 7 | Signatur / Freigabe | TEILWEISE | **TEILWEISE (unverändert)** | Code vollständig; real weiterhin 31× `ENTWURF`, `service_signatures` 0. Rein operativ — kein Codedefekt gefunden |
| 8–10 | Budget, Monatsabschluss, Rechnung | FUNKTIONIERT | **unverändert** | — |
| 11 | DTA / EDIFACT | FUNKTIONIERT | **FUNKTIONIERT** | zusätzlich: Freigabe/Export waren durch P0-1 tot, jetzt behoben |
| 12 | Kostenträger-Routing | TEILWEISE | **VOLLSTÄNDIG (intern)** | Pflege-API + UI + `pruefeRouting()` + 7 Routing-Tests. Tabelle weiterhin leer — Daten sind extern |
| 13 | SECON | FUNKTIONIERT (Krypto) | **VOLLSTÄNDIG (intern)** | + Mandantentrennung, Rotation, Ablaufwarnung (60 Tage), Ampel, Aktiv-Kennzeichnung. Zertifikat weiterhin extern |
| 14 | DAKOTA | TEILWEISE | **TEILWEISE (unverändert)** | Auftragsdatei korrekt; Übermittlung ohne Zugangsdaten nicht auslösbar |
| 15 | Datenannahmestelle | TEILWEISE | **VOLLSTÄNDIG (intern)** | Pflege-API + UI + Validierung; DB-Pfad greift, sobald Daten existieren |
| 16 | Rückläufer | TEILWEISE | **VOLLSTÄNDIG (intern)** | War durch P0-1 nicht ausführbar. 16 E2E-Tests über die volle Kette |
| 17 | Automatische Aufgabe | **FEHLT** | **VOLLSTÄNDIG (intern)** | §3.1, 27 + 16 Tests |
| 18 | Korrekturlauf | TEILWEISE | **VOLLSTÄNDIG (intern)** | War durch P0-1 tot (`korrekturlauf`), jetzt lauffähig |
| 19 | Erneute Übermittlung | NICHT VERIFIZIERBAR | **unverändert** | ohne Erstversand nicht auslösbar |
| 20 | Zahlungsstatus / OPOS | FUNKTIONIERT | **unverändert** | Audit jetzt mandantenrichtig |
| — | Readiness-Ansicht | existierte nicht | **NEU** | §3.3 |
| — | **Externer Kassenversand** | NICHT VERIFIZIERBAR | **NICHT VERIFIZIERBAR** | `sendePerSFTP()` hat keinen Aufrufer. Keine Übertragung, keine Quittung |

### INTERN VERIFIZIERT vs. EXTERN REAL VERIFIZIERT

**Intern verifiziert** (Code läuft gegen echte oder speicherinterne Daten):
Leistungsdaten → Monatsabschluss → Rechnung → DTA-Erzeugung → Formatvalidierung
→ Kostenträger-Erkennung → Datenannahmestellen-Routing → Pre-Flight →
Rückläufer-Verarbeitung → automatische Aufgabe → Korrekturlauf.

**Extern real verifiziert: nichts.** Kein Übertragungs-Payload wurde an eine
Datenannahmestelle geschickt, keine technische Response empfangen, keine
Kassenquittung erhalten. Es wurde auch **keine simulierte Response** in den
Produktionspfad eingespeist — eine Simulation, die im Audit-Trail wie ein
echter Versand aussieht, wäre schlimmer als die Lücke.

---

## 7. Build

```
✓ Compiled successfully in 27.3min
  Finished TypeScript in 79s
✓ Generating static pages using 7 workers (404/404) in 30.6s
BUILD_EXIT=0
```

404 Seiten (vorher 402) — die zwei neuen Admin-Seiten. Alle fünf neuen Routen
sind im Build enthalten:

```
├ ○ /admin/kassenabrechnung/readiness
├ ○ /admin/kassenabrechnung/stammdaten
├ ƒ /api/billing/dta/readiness
├ ƒ /api/billing/stammdaten/datenannahmestellen
├ ƒ /api/billing/stammdaten/kostentraeger
```

Der Lauf verwendet dasselbe Kommando wie Vercel (`next build --webpack` mit
`--max-old-space-size=4096`). Kein OOM, keine deaktivierte Prüfung.

---

## 8. Entscheidungen

### CODE-PRODUCTION: **CONDITIONAL GO**

Dafür: 2 P0 und 4 P1 im Kernpfad behoben, davon einer (P0-1) so gravierend,
dass Rückläufer, Fehlerprotokoll, Korrekturlauf, Freigabe und Export in
Produktion **allesamt** mit einer Exception abgebrochen wären. 0 Typfehler,
1.225 grüne Tests, alle Lint-/Secret-Gates sauber.

Bedingungen vor dem Merge nach `main`:

1. **Migration `20260815010000` (profiles-RLS) anwenden** — die einzige harte
   Sperre. Danach `npm run verify:profiles-rls` → 3/3.
2. Migration `20260816010000` (Ereignistypen) anwenden — ohne sie bleiben 11
   Ereignistypen nicht konfigurierbar. Nicht blockierend für die
   Rückläufer-Automatik.
3. Grünen Vercel-Preview-Build abwarten.
4. Danach `audit:rls` in `ci.yml` aufnehmen.

### ECHTE KASSENABRECHNUNG: **NO-GO**

Unverändert, aus einem anderen Grund als vorher: die **internen** Sperren sind
weg, die **externen** bestehen sämtlich fort. Die Readiness-Ansicht meldet für
die Stamm-Org derzeit rot.

---

## 9. WAS YUSUF JETZT EXTERN BESORGEN / FREISCHALTEN MUSS

Ohne diese Punkte ist echte Kassenabrechnung unmöglich — unabhängig vom Code.
Reihenfolge = Abhängigkeit und Vorlaufzeit.

| # | Punkt | Wo | Vorlauf | Blockiert |
|---|---|---|---|---|
| 1 | **profiles-RLS-Migration anwenden** | Supabase Dashboard → SQL Editor | Minuten | alles (DSGVO + `profiles` unlesbar) |
| 2 | **Anerkennung nach § 45a SGB XI** je Bundesland, Bescheid als PDF | zuständige Landesbehörde | Wochen–Monate | Pre-Flight Pflichtpunkt |
| 3 | **`kassenrechnung_enabled` freischalten** nach Bescheid | Admin → Expansion Deutschland | Minuten | Pre-Flight Pflichtpunkt |
| 4 | **SECON-Zertifikat (PKCS#12)** beantragen | ITSG Trust Center, kostenpflichtig | Tage–Wochen | Verschlüsselung, Signatur |
| 5 | **`SECON_ZERT_PASSWORT`** als Env setzen | Vercel → Environment Variables | Minuten | Private Key nicht lesbar |
| 6 | **SFTP-Zugang** je Datenannahmestelle (Kennung + Verzeichnisse) | ITSCare / BITMARCK / DAVASO / T-Systems | Wochen | Übertragung |
| 7 | **SSH-Schlüsselpaar** erzeugen, öffentlichen Teil registrieren | bei der jeweiligen Annahmestelle | Tage | Übertragung |
| 8 | **Kassen-Stammdaten** (IK, Kassenart, Zuständigkeit) | Kassenverzeichnis / Landesrahmenvertrag | Tage | Routing |
| 9 | **Kassentarife** aus dem Landesrahmenvertrag | Vertragsunterlagen | Tage | Betragsberechnung |
| 10 | **`dakota_export_enabled`** freischalten | Admin → Expansion Deutschland | Minuten | Übermittlung |
| 11 | **Testlieferung + Freigabe** durch die Annahmestelle | Annahmestelle | Wochen | Produktivbetrieb |
| 12 | **Versandpfad verdrahten** (`sendePerSFTP` hat keinen Aufrufer) | intern, nach 4–7 | Tage | Übertragung |

Punkte 1, 3, 5 und 10 sind in Minuten erledigt. 2, 4, 6, 7 und 11 haben echte
Vorlaufzeiten und bestimmen den Termin.

**Empfohlene Reihenfolge:** 1 sofort → 4 und 6 parallel starten (längster
Vorlauf) → 8 und 9 währenddessen intern pflegen → 2 verfolgen → nach Eingang
von 4/6/7: 12 bauen, dann 11.

Fortschritt jederzeit unter `/admin/kassenabrechnung/readiness` — die Ansicht
listet unter „Offene Sperren" getrennt, was extern beschafft und was intern
gelöst werden muss.
