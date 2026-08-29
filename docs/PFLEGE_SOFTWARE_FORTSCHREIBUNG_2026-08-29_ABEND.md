# Pflege-Software — Fortschreibung, Abend des 29.08.2026

> **Bezug:** `docs/PFLEGE_SOFTWARE_COMPLETION.md` (Matrix, 28.08.) und
> `docs/PFLEGE_SOFTWARE_COMPLETION_FORTSCHREIBUNG_2026-08-29.md` (Vormittag).
> **Umfang:** sechs Implementierungsblöcke, Commits `f6d2d14c` bis `34a2b0cc`.
>
> Diese Fortschreibung ersetzt nichts. Sie hält fest, was sich seit dem
> Vormittag bewegt hat, welche Befunde dabei aufgetaucht sind — und was
> ausdrücklich **nicht** erledigt ist.

---

## 1. Die Methode dieses Durchgangs

Nicht ein neues Audit, sondern **eine Frage, systematisch gestellt**:

> Gibt es einen Weg, den die Software anbietet, den aber niemand gehen kann?

Drei Ausprägungen, alle drei fündig:

1. **Route ohne Aufrufer** — der Handler ist vollständig, keine Stelle der
   Oberfläche ruft ihn auf. Zu Beginn: 17 von 418 Routen; am Ende: 10, davon
   6 systembedingt (Cron, Zählpixel, Pilot-Freigabe).
2. **Seite ohne Verweis** — die Seite existiert, steht in der Rechtetabelle
   und ist über kein Menü und keinen Link erreichbar.
3. **Seite ohne Sicht** — die Seite ist erreichbar, die Rolle darf hinein,
   und die Datenbank gibt ihr unter RLS nichts zurück. Kein Fehler, keine
   Meldung, leere Liste. Der teuerste der drei Fälle.

---

## 2. Was hinzugekommen ist

| # | Block | Commit |
|---|---|---|
| 1 | Forderungsabschreibung erreichbar; Unveränderlichkeit nach dem Abschreiben | `f6d2d14c` |
| 2 | Dienstplan ändern, absagen, löschen; Mitarbeiterauswahl statt UUID | `11800eaf` |
| 3 | Personalakte korrigieren; zwei Löschwege gehärtet | `3e79e76c` |
| 4 | Aktenmodul: Download für die führenden Rollen; Schreibseite gleichgezogen | `9381999f` |
| 5 | ZUGFeRD-Konformität wirklich geprüft (Befund I-7) | `43ff3c27` |
| 6 | RLS-Sichtbarkeit der Fachrollen; falsche Berechtigung auf `/admin/nachweise` | `34a2b0cc` |

**Testbestand:** vitest 8671 → **8880** (+209), node:test 2526 → **2528**.
Sieben neue Suiten, alle mit gefahrener Gegenprobe.

---

## 3. Die Befunde, nach Gewicht

### 3.1 Falsche Berechtigung, verdeckt von einer anderen Lücke (Block 6)

`/admin/nachweise` zeigt **Qualifikationsnachweise der Mitarbeitenden** —
Führungszeugnis, Erste-Hilfe-Nachweis, Zertifikate je Pflegekraft. In
`BEREICHE` stand die Seite im Block der **Leistungs**nachweise und verlangte
deshalb `einsatz.lesen`. Die Rolle `buchhaltung` hat genau das und
ausdrücklich **nicht** `personal.lesen`; `lib/auth/rollen.ts` hält wörtlich
fest, dass sie „KEINE Gesundheitsdaten und keine Personalakten" bekommt.

Aufgefallen ist es nie, weil ein **zweiter** Fehler es verdeckte: die Seite
las `caregiver_qualifications` mit dem Browser-Client, und dort steht live
nur `is_admin()`. `buchhaltung` sah eine leere Liste — der falsche Riegel
war folgenlos, solange die Blindheit bestand.

**Das ist die gefährliche Kombination:** wer die Blindheit repariert (eine
`rk_`-Policy ergänzt), öffnet damit die Lücke. Die Berechtigung steht
deshalb **zuerst** richtig (`personal.lesen`), der Datenweg danach.

### 3.2 Die Fachrollen sehen auf 52 Seite/Rollen-Paaren nichts (Block 6)

46 Admin-Seiten lesen direkt über den Browser-Client. Die RLS dieses Schemas
kennt drei Wege für Verwaltungsrollen:

| Ausdruck | erreicht |
|---|---|
| `is_admin()` | admin, superadmin |
| `is_internal_staff()` | admin, superadmin, pdl, buero — **nicht** qm, **nicht** buchhaltung |
| `darf('bereich.recht')` | jede Rolle, deren Matrix das Recht führt |

Fehlt der dritte Weg, sieht jede Rolle ausser der Administration nichts,
obwohl der Seiten-Guard sie durchgelassen hat.

**`npm run lint:rls-sicht`** misst das live gegen `pg_policies`. Erstlauf:
59 Paare; nach den Korrekturen dieses Durchgangs **52**. Die Prüfung
kontrolliert auch ihre eigene Annahme gegen `pg_proc` und meldet, wenn die
Live-Fassung von `is_admin`/`is_internal_staff` abweicht.

**Heute ist niemand betroffen** — live trägt kein Profil eine der drei
Fachrollen (admin 1, superadmin 3, engel 22, fahrer 5, kunde 34). Genau
deshalb ist es niemandem aufgefallen.

### 3.3 Abschreiben hob die Unveränderlichkeit der Rechnung auf (Block 1)

`prevent_finalized_invoice_mutation` schützt Betrag, Zeitraum, Kunde und
Rechnungsnummer, sobald der Status festgeschrieben ist — die Liste dieser
Status kannte `abgeschrieben` nicht. Der erste Schritt der Funktion ist
`IF OLD.status NOT IN (…) THEN RETURN NEW`, also ein Durchwinken:
`abgeschrieben` war der einzige Endstatus, der den Schutz nicht bloss nicht
hinzufügt, sondern **wegnimmt**.

Nie aufgefallen, weil der Weg dorthin gar nicht begehbar war. Migration
`20260829213000` liegt bereit, **nicht angewendet** (siehe § 5).

### 3.4 Löschen, das Erfolg meldet, ohne zu löschen (Blöcke 3 und 4)

Vier Stellen, dieselbe Ursache: ein `DELETE`/`UPDATE`, das keine Zeile
trifft, ist in PostgREST kein Fehler.

* `deleteQualifikation`, `deleteSchulung` — `{ ok: true }` bei unbekannter
  Kennung und bei einer Zeile eines fremden Mandanten.
* `softDeleteKontaktperson` — dazu ein Zugriffsprotokoll-Eintrag
  „geloescht" über eine Kontaktperson, die es weiter gibt. Ein Protokoll,
  das eine nicht erfolgte Löschung festhält, ist schlimmer als keines: es
  wird später gelesen und geglaubt.

Dazu: eine **bestandene** Schulung liess sich löschen, obwohl sie sich nicht
ändern lässt — Löschen ist der stärkere Eingriff.

### 3.5 Die Schreibseite des Aktenmoduls war offener als die Leseseite (Block 4)

In **einer** Datei sichtbar: der `GET`-Handler prüft seit `0ba1d61e`
`caregiver_id && !darf('personal.lesen')`, `PATCH` und `DELETE` zwei
Bildschirmseiten darunter nicht — ebenso `[id]/sperren` und `[id]/version`.
Wer die Personalakte nicht **lesen** darf, konnte ein Dokument daraus
umbenennen, sperren, überschreiben und löschen.

Heute nicht ausnutzbar (wer `stammdaten.schreiben` hat, hat auch
`personal.lesen`) — der Riegel hing damit an einer Eigenschaft der
Rollentabelle statt an einer Prüfung.

### 3.6 Und die Akte war für ihre eigenen Rollen verschlossen (Block 4)

Umgekehrte Richtung, dieselbe Wurzel: `GET …/download` lief allein über RLS,
und `admin_akten_dokumente` ist `is_admin()`. Für `pdl`, `qm` und
`buchhaltung` traf keine Policy zu — die Pflegedienstleitung konnte kein
einziges Dokument öffnen, das sie in jeder Liste sah.

### 3.7 ZUGFeRD: drei Konformitätsfehler (Block 5, Befund I-7)

* `/AFRelationship` war `Data` — der Wert für MINIMUM und BASIC WL. Die XMP
  nennt `EN 16931`; ab BASIC verlangt ZUGFeRD `Alternative`.
* Die vier `fx:`-Angaben standen ohne `pdfaExtension:schemas` da. Ein
  PDF/A-Prüfer wertet dann **jede** davon als undefiniert: die Datei trägt
  die ZUGFeRD-Angaben und fällt genau an ihnen durch.
* `/MarkInfo /Marked true` ohne `/StructTreeRoot`, kommentiert als „required
  for PDF/A". Für Stufe B ist es nicht verlangt und ohne Strukturbaum eine
  Behauptung, die nicht stimmt.

Quelle für Dateiname und `AFRelationship`: PDFlib, *The ZUGFeRD and Factur-X
Formats for electronic Invoices*, abgerufen 29.08.2026 — nachgeschlagen,
nicht aus dem Gedächtnis behauptet.

**Methodischer Fehler, selbst gemacht und verworfen:** der erste Entwurf der
Prüfung suchte `/AF` und `/AFRelationship` als Zeichenketten in den
PDF-Bytes und meldete sie gegen die eigene Ausgabe als *fehlend* — pdf-lib
schreibt Objektströme, darin liegt die Katalogsyntax komprimiert. Die
Prüfung läuft jetzt über den geladenen Objektgraphen.

### 3.8 Fünf Minuten am Tag ohne Sturzprotokoll (Block 6)

`validiereSturzZeitpunkt` bildet den 5-Minuten-Puffer als
`berlinParts(now + 5min)`. In den letzten fünf Minuten des Tages kippt das
über Mitternacht: `puffer.hour` ist `'00'`, die Obergrenze also `'00:03'` —
und **jede** Uhrzeit dieses Tages ist grösser. Ein Sturz von 14:30, um 23:57
nachgetragen, wurde abgewiesen. Ein Sturz wird oft am Ende der Spätschicht
nachgetragen.

Aufgefallen, weil der zugehörige Test um 23:54 Berlin rot wurde. Er rechnete
„jetzt + 15 Minuten" aus der echten Uhr und nahm ein „vernachlässigbares
Zeitfenster" ausdrücklich in Kauf. Er steht jetzt auf `mock.timers`.

---

## 4. Wege, die es gab und die jetzt begehbar sind

| Weg | vorher | jetzt |
|---|---|---|
| Uneinbringliche Forderung ausbuchen | Route ohne Aufrufer | `/admin/rechnungen/[id]`, Status- und Betragsprüfung sichtbar |
| Dienst ändern, absagen, löschen | Route ohne Aufrufer | Kachel im Wochenplan; Freigabestand als Band darüber |
| Pflegekraft im Dienstplan wählen | Freitextfeld „UUID" | Auswahl mit Name, Vertragsstatus, Freigabehinweis |
| Qualifikation/Schulung korrigieren | Route ohne Aufrufer | je Zeile in `/admin/personal/[id]` |
| Kontaktperson anlegen/ändern/entfernen | nur Liste | vollständig in `/admin/kundenakte/[id]` |
| Aktendokument herunterladen (pdl/qm) | 404 | zweiter Weg über den Guard |
| Ablaufwarnungen der Qualifikationen | Seite ohne Verweis | Navigation, „Ablaufwarnungen" |

---

## 5. Was blockiert ist — und woran

**DDL über den Dienstschlüssel läuft als `42501` auf.** Migrationen einspielen
bleibt ein Schritt im SQL-Editor.

| Blockiert | Woran | Wer |
|---|---|---|
| `20260829213000` (Abschreiben ↛ Unveränderlichkeit) | Apply | Betreiber |
| `20260829005500` (Zeitkorrektur-Akteur, aus dem Vormittag) | Apply | Betreiber |
| Ausgabebedingung im ZUGFeRD-PDF | eingebettetes ICC-Profil — keines im Baum, Beschaffung und Lizenz sind eine Entscheidung | Betreiber |
| 52 RLS-Sichtbarkeits-Paare | je Tabelle eine `rk_`-Policy (Migration) **oder** eine API-Route, die es noch nicht gibt | Betreiber / Folgearbeit |
| veraPDF-/EN-16931-Lauf | Java-Laufzeit bzw. externes Werkzeug | Betreiber |

**DiPA:** `npm run dipa:katalog` meldet 48/48 geprüft, Quote 71 %. Klasse B
(„intern technisch umsetzbar") ist bei **0 offenen** Punkten. Die vier
offenen Punkte der Klasse C hängen an einer Entscheidung oder Unterschrift
der Geschäftsführung, nicht an Technik:

* **AK-DS-02** DSFA — Dossier liegt, Bestätigung fehlt
* **AK-DS-04** AVV-Kette — erhoben, Verträge nicht unterzeichnet
* **AK-BF-03** Screenreader-Durchgang — Protokollvorlage liegt, S4–S8 sind
  maschinell nicht entscheidbar; ein Nachweis ohne gelaufenen Screenreader
  wäre ein erfundener Nachweis (Zeitklasse E, kein Antragsblocker)
* **AK-VS-02** 24-h-Zusage — `SUPPORT_ZUSAGE` ist fail-closed `null`; eine
  veröffentlichte Reaktionszeit ist eine bindende Zusage und setzt eine
  Personalentscheidung voraus

Die drei Eingangsblocker (TR-03161, ISO 27001, Evaluationskonzept) sind
extern und unverändert.

Ausserdem: `npm run dipa:compliance` meldet `COACH_MFA_PFLICHT = nicht
gesetzt` als Abweichung vom sicheren Stand. Eine Umgebungsvariable, kein
Code.

---

## 6. Ausdrücklich nicht gemessen

* Keine Rechnung abgeschrieben, kein Dienst geändert, keine Datei gebucht —
  weder lokal noch gegen die Produktion.
* `FIRST_REAL_INVOICE_APPROVED` bleibt `false`.
* Die Oberflächen sind **nicht** automatisiert geprüft: jsdom ist im Projekt
  nicht eingerichtet, und ein Test, der nur Zeichenketten im Quelltext
  sucht, wäre eine Behauptung. Geprüft sind die Handler, die Bibliotheken
  und die Datenwege dahinter.
* Kein ZUGFeRD-PDF an einen Empfänger geschickt.
* Die Fachtabellen sind live weiterhin fast alle leer. Der Fertigstellungs-
  grad der Matrix bewegt sich dadurch kaum: was hier dazukam, ist
  **Begehbarkeit** und **Belastbarkeit**, nicht Benutzung.

---

*Fortgeschrieben am Abend des 29.08.2026. Alle Live-Aussagen sind mit dem
Lese-Orakel `public._run_sql` gegen `nnwyktkqibdjxgimjyuq.supabase.co`
gemessen — nur lesend, die Transaktion rollt per `RAISE` immer zurück.*
