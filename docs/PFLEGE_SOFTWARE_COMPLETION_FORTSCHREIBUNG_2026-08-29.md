# Pflege-Software — Fortschreibung der Completion-Matrix

> **Bezug:** `docs/PFLEGE_SOFTWARE_COMPLETION.md` (Stand 28.08.2026, 70,6 %)
> **Fortgeschrieben:** 2026-08-29 · **Umfang:** Implementierungs-Track,
> sechs Blöcke (GAP-8 bis GAP-12 plus zwei Korrekturen am Prüfstand)
>
> Diese Fortschreibung **ersetzt die Matrix nicht**. Sie hält fest, was sich
> seither bewegt hat, was ausdrücklich **nicht** — und die zwei Befunde, die
> beim Durchfahren der Ketten aufgetaucht sind.

---

## 1. Die kurze Antwort

**Der Fertigstellungsgrad bewegt sich kaum. Das ist die ehrliche Aussage,
und sie hat einen Grund.**

Die Matrix vergibt Stufe 4 (`MIGRATION_APPLIED`) und höher nur, wenn die
DB-Objekte eines Moduls **live** sind. Von den vier Migrationen dieses
Tracks ist **keine angewendet** — DDL läuft über den Dienstschlüssel als
`42501` auf, das Einspielen ist ein manueller Schritt im SQL-Editor. Alles
Neue steht damit bei Stufe 3, egal wie gut es geprüft ist.

Was sich stattdessen bewegt hat, ist die **Belastbarkeit**: fünf Module
haben zum ersten Mal eine durchgehende Kette gegen echtes PostgreSQL, zwei
Produktlücken aus Befund I-12 sind im Code geschlossen, und zwei Fehler
sind gefunden worden, die im laufenden Betrieb Geld gekostet hätten.

| | 28.08. | 29.08. |
|---|---:|---:|
| Erreichte Punkte | 168 | **172** |
| Fertigstellungsgrad | 70,6 % | **72,3 %** |
| Module auf `E2E_PROVEN` | 11 | **12** |
| **Migrationen, die auf Apply warten** | — | **4** (+ 4 Rollbacks) |

Die vier Punkte kommen aus drei Modulen: 3 (+1), 6 (+1), 9 (+2). Mehr ist
es nicht, und mehr wäre unehrlich.

Nach Anwendung der Migrationen wären nach heutiger Beleglage **vier bis
sechs weitere Punkte** erreichbar (Module 3, 6, 29, 34 — je nachdem, welche
Stufe eine Live-Sonde danach belegt), also rund **74 %**. Diese Zahl steht
hier ausdrücklich als *bedingt*, nicht als erreicht: keine Migration ist
eingespielt, und die Matrix vergibt Stufe 4 nur gegen `pg_*`, nicht gegen
eine `.sql`-Datei.

---

## 2. Die zwei Befunde

### 2.1 P0 — Der Manipulationsschutz blockiert die Abrechnung

**Ein ordnungsgemäß unterschriebener Leistungsnachweis kann live nie
abgerechnet werden.** Drei Dinge, jedes für sich richtig, treffen
aufeinander (alle drei am 29.08.2026 aus `pg_get_functiondef` bzw.
`pg_get_triggerdef` gelesen):

1. `compute_signature_hash` setzt bei der Unterschrift `is_locked = true`.
2. `prevent_locked_record_change` weist auf einer gesperrten Zeile **jede**
   Änderung ab. Ausnahmen: nur Storno und Entsperren durch die
   Administration über `auth.uid()`.
3. `create_invoice_draft_atomic` setzt danach
   `service_records.status = 'invoiced'` — eine Änderung an genau dieser
   Zeile.

Der Trigger wirft, die RPC ist **atomar**, die gesamte Rechnungserstellung
rollt zurück: keine Rechnung, keine Position, kein Teilerfolg. Und die
andere Hälfte der Klemme: Migration `20261017000000` verlangt für die
Rechnung ausdrücklich eine Unterschrift. **Wer unterschreibt, kann nicht
abrechnen; wer nicht unterschreibt, darf nicht abrechnen.**

**Warum es nie aufgefallen ist:** Die beiden Wege sind sich live nie
begegnet. Befund I-5 der Matrix hält fest, dass von 30 `service_records`
keiner `signature_hash` oder `client_signed_at` trägt und `is_locked`
überall `false` steht — auch auf den 15 bereits abgerechneten. Die stammen
aus der Zeit vor der Sperre.

**Tragweite:** Der Matrix-Vorschlag „einen echten Kunden komplett
durchlaufen lassen" (§ 6.1) wäre an dieser Stelle gescheitert — nach der
Unterschrift, vor der ersten Rechnung.

**Behoben:** Migration `20260829011500`, eingecheckt, **nicht angewendet**.
Die Ausnahme ist bewusst eng: erlaubt ist genau der Übergang `status` von
`signed`/`complete` auf `invoiced`, und alles andere an der Zeile muss
unverändert bleiben — geprüft als Ganzes über
`to_jsonb(NEW) - <erlaubte Felder> = to_jsonb(OLD) - <erlaubte Felder>`.
Eine Aufzählung verbotener Spalten hätte jede später ergänzte Spalte
vergessen; der Vergleich über das Zeilenabbild kennt sie automatisch.

### 2.2 P1 — Jede Zeitkorrektur scheitert an einer NOT-NULL-Spalte

`log_arbeitszeit_korrektur` schreibt `korrigiert_von = auth.uid()` in
`personal_zeitkorrekturen`, und die Spalte ist `NOT NULL` (live aus
`information_schema`: `nullable = NO`). Der einzige Schreibweg der
Zeiterfassung fährt über `createAdminClient()`; unter dem Dienstschlüssel
liefert `auth.uid()` live **NULL** — die JWT-Claims lauten dort
`{"role":"service_role"}` und tragen kein `sub` (ebenfalls live gemessen).

Folge: jede Korrektur einer Arbeitszeit scheitert mit `23502`, und der
Nutzer sieht die rohe Datenbankmeldung samt Spalten- und Tabellennamen.
Nie aufgefallen, weil `personal_arbeitszeiten` live **0 Zeilen** trägt.

**Behoben:** Migration `20260829005500` (neue Spalte `geaendert_von`,
Trigger nimmt `COALESCE(auth.uid(), NEW.geaendert_von)`, fail-closed mit
Klartext). Die Anwendung wirkt **auch ohne** die Migration: ein `42703`
führt zu einem zweiten Versuch ohne die Spalte, und die fehlende
Urheberschaft geht als lesbare 409 nach außen statt als rohe
Datenbankmeldung.

**Live-Sweep zur Eingrenzung:** Vier Trigger-Funktionen schreiben
`auth.uid()` in einen INSERT. Nur bei `log_arbeitszeit_korrektur` ist die
Zielspalte `NOT NULL` und damit der ganze Schreibweg blockiert; bei
`audit_invoice_status_change`, `audit_service_record_change` und
`coach_audit_trigger` sind die Zielspalten nullable — dort geht nur die
Zuordnung verloren, kein Abbruch.

---

## 3. Was pro Modul dazugekommen ist

| # | Modul | Stufe 28.08. | Stufe 29.08. | Was dazugekommen ist |
|---:|---|---|---|---|
| 3 | PDL | `MIGRATION_APPLIED` (4) | **`PRODUCTION_VERIFIED` (5)** | Eigenes Fachmodul statt Lesesicht: Wochenübersicht mit Auslastung, ArbZG-Entscheidung, Dienstplanfreigabe. 38 Tests. Live belegt: es gab **keinen** Schreibweg auf `arbeitszeit_verstoesse.quittiert`. |
| 6 | Zeiterfassung | `MIGRATION_APPLIED` (4) | **`PRODUCTION_VERIFIED` (5)** | 14 → **86** Testfälle, davon 72 gegen echtes Postgres. Befund I-6 belegt statt behauptet, P1 aus § 2.2 gefunden. Stufe 6 wartet auf `20260829005500`. |
| 9 | Maßnahmenplanung | `MIGRATION_APPLIED` (4) | **`E2E_PROVEN` (6)** | 23 → **61** Testfälle. Die Kette läuft gegen das **heutige** Live-Schema durch — keine neue Migration nötig. |
| 13 | Leistungsnachweis | `E2E_PROVEN` (6) | `E2E_PROVEN` (6) | Unverändert in der Stufe, aber der P0 aus § 2.1 betrifft genau dieses Modul und ist jetzt benannt. |
| 29 | QM | `DEPLOYED` (3) | `DEPLOYED` (3) | Aus dem Lesepanel wird ein Fachmodul: Pflegevisite nach § 113 SGB XI mit Checkliste, Befunden, Regelkreis und Oberfläche. 41 Tests. Produktlücke I-12 im Code geschlossen; Stufe 4+ wartet auf `20260829005600`. |
| 34 | Production E2E | `PRODUCTION_VERIFIED` (5) | `PRODUCTION_VERIFIED` (5) | Die Vollkette des Pflegebetriebs läuft (33 Tests) — aber nur **mit** `20260829011500`. Ohne sie bricht sie bei der Rechnung ab. Genau deshalb bleibt die Stufe. |

**Nicht bewegt und warum:** Alle übrigen Module. Dieser Track hat sie nicht
angefasst; ihre Bewertung aus der Matrix gilt unverändert.

---

## 4. Die vier Migrationen, die auf Apply warten

Alle mit **echtem Zeitstempel** nach der Regel aus `docs/MIGRATION_LEDGER.md`
(„Neue Migrationen: ab sofort NUR mit echtem aktuellem Timestamp"), alle mit
Rollback, keine angewendet.

| Migration | Wirkung | Ohne sie |
|---|---|---|
| `20260829005500` | Zeitkorrektur: Akteur (`geaendert_von`), Sperre an der Absicht statt am Endzustand, Kaskade durchlassen | Jede Zeitkorrektur scheitert; die Sperre lässt sich mit `gesperrt = false` umgehen; eine korrigierte Arbeitszeit ist nie löschbar |
| `20260829005600` | QM: `qm_pflegevisiten` + `qm_visite_befunde` samt Abschluss-Riegeln | Kein Pflegevisiten-Modul; die Routen melden „noch nicht eingerichtet" (503) statt einer rohen 42P01 |
| `20260829005700` | PDL: `dienstplan_freigaben` + Änderungsriegel auf `dienstplan_eintraege` | Keine Wochenfreigabe; `quittiereVerstoss()` wirkt trotzdem — es hängt nur an `arbeitszeit_verstoesse` |
| `20260829011500` | **P0 aus § 2.1**: gesperrter Nachweis darf als abgerechnet gekennzeichnet werden | Die Kette Unterschrift → Rechnung ist zu |

Zu jeder gehört ein Rollback mit derselben Nummer +1 — zusammen acht
Dateien.

**Reihenfolge beim Einspielen:** beliebig — keine der vier hängt an einer
anderen. `20260829011500` ist die dringlichste: sie ist die einzige, die
einen Weg öffnet, der heute geschlossen ist.

---

## 5. Korrekturen an früheren Aussagen

Die Matrix hält in § 7 fest: „Wo eine frühere Notiz und der Live-Befund
auseinandergingen, gilt der Live-Befund." Zwei solche Fälle in diesem Track:

**5.1 — `__tests__/e2e/mahnversand-route-pglite.test.ts` behauptete als
Befund**, die Rollen `pdl`, `qm` und `buchhaltung` ließen sich in `profiles`
gar nicht anlegen. Das war eine Aussage über das **Testschema**, nicht über
die Produktion: das Kettenschema schnitt `profiles` aus der Core-Baseline,
die diese Rollen noch nicht kannte. Live steht seit `20260924000000` die
weitere Fassung — am 29.08. aus `pg_constraint` gelesen.

Die feinere Rechteschwelle ist trotzdem eine Absicht ohne Träger, aber aus
einem anderen Grund, und der ist eine Aussage über den **Bestand**: von 65
Profilen trägt live **keines** eine der drei Fachrollen (admin 1,
superadmin 3, engel 22, fahrer 5, kunde 34). Anlegbar wären sie; angelegt
hat sie niemand.

**5.2 — `extrahiereFunktion()` in `__tests__/helpers/sql-extract.ts`** suchte
das Funktionsende als `$$;` und fand in Migrationen der Schreibweise
`$$ LANGUAGE plpgsql;` stillschweigend das Ende einer viel späteren
Funktion. Es schnitt also einen zu großen Block heraus, ohne dass etwas rot
wurde. Betroffen war jede Suite, die eine Funktion aus der
Personalmanagement-Migration zog.

---

## 6. Was der Prüfstand jetzt kann — und was weiter fehlt

**Dazugekommen** (`__tests__/e2e/helpers/kette-schema.ts`):
Personal-Strecke (Dienstplan, Zeiterfassung, ArbZG), Pflegeplanung
(Maßnahmenpläne, Verlauf, Pflege-Audit), QM-Strecke, und drei
`wende…MigrationAn`-Helfer, mit denen eine Suite **beide Schemafassungen**
fahren kann — die heutige und die mit der eingecheckten Migration. Das ist
kein Beiwerk: würde eine noch nicht angewendete Migration im Grundaufbau
stehen, wäre der Befund, den sie behebt, in keinem Lauf mehr sichtbar.

Zwei Lücken im Shim behoben: mehrere `.order()`-Aufrufe wurden bis auf den
letzten verworfen (betraf `listMassnahmen`, `listArbeitszeiten`,
`listPlaene` — ein Test auf die Sortierung hätte dort das Gegenteil dessen
bestätigt, was live passiert), und `profiles_role_check` war im Testschema
**strenger** als in der Produktion.

**Weiter offen am Prüfstand:**

* Die **Playwright-Suite** ist seit dem 28.08. rot (AUTH-005 in
  `booking.spec`, AUTH-011 in `register.spec`) — beide wurden in
  `472fb9c4` als behoben eingecheckt und sind es nicht. Gehört in den
  Web-Track; hier nur benannt.
* Die **Shadow-DB-Suite** war aus demselben Zeitraum rot, aber aus einem
  anderen Grund: sie räumte ihren eigenen Ratelimit-Zähler nicht weg.
  `DELETE /api/user/delete` zählt über `rateLimitPersistent` in
  `public.api_rate_limits` — also in der Datenbank, die den Testlauf
  überlebt. Behoben.
* `npm run typecheck` läuft auf dieser Maschine weiter unbrauchbar langsam.
  Geprüft wurde stattdessen jede neue Oberfläche gezielt mit einer eigenen
  `tsconfig` — das deckt die neuen Dateien samt ihrer Importe ab, **nicht**
  das ganze Projekt. Der volle Typecheck bleibt Sache des Vercel-Builds und
  wird hier nicht als grün ausgegeben.

---

## 7. Was als Nächstes den größten Unterschied macht

Die Reihenfolge aus § 6 der Matrix gilt weiter. Davor liegt jetzt ein
Schritt, der vorher nicht sichtbar war:

0. **`20260829011500` einspielen.** Ohne sie scheitert der erste echte
   Kundendurchlauf (§ 6.1 der Matrix) nach der Unterschrift und vor der
   ersten Rechnung — und zwar nicht mit einer Meldung, aus der hervorginge,
   warum.

Danach unverändert: echter Kundendurchlauf, Löschautomatik (I-1),
SEPA-Gläubiger-ID (I-4), Testmandanten räumen (I-3), ZUGFeRD-Konformität
(I-7), Anerkennungsbescheid § 45a (E-1/E-2).

---

*Fortgeschrieben 2026-08-29. Alle Live-Aussagen dieser Fortschreibung sind
mit dem Lese-Orakel `public._run_sql` gegen
`nnwyktkqibdjxgimjyuq.supabase.co` gemessen — nur lesend, die Transaktion
rollt per `RAISE` immer zurück.*
