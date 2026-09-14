# Block 37 — Vier Funktionen, die nie funktioniert haben

**Stand:** 14.09.2026 · **Ausgangspunkt:** `20073a39`

---

## Warum dieser Block

Dasselbe Muster hat in dieser Sitzung **dreimal** zugeschlagen:

| Block | Stelle | Folge |
|---|---|---|
| 28 | `invoices.status` führt zwei Vokabulare; vier Stellen kannten je die halbe Liste | stornierte Rechnung blieb in den offenen Posten |
| 33 | `service_type` (Klartext) gegen `leistungsart` (Schlüssel) | Leistung lief aus dem falschen Budgettopf |
| 36 | `client_signer_role: 'client'` gegen den CHECK | hätte die Unterschriftskette zerrissen |

Zweimal ging es um Geld, einmal um einen Beleg. Jedes Mal einzeln
gefunden, jedes Mal durch Zufall. Dieser Block macht daraus eine Prüfung —
und die Prüfung fand beim ersten scharfen Lauf **vier tote
Schreibwege**.

---

## Die vier Befunde

Jeder davon scheitert mit `23514` — die Funktion dahinter ist
**vollständig tot**, nicht bloß fehlerhaft.

| Stelle | schreibt | erlaubt | Folge |
|---|---|---|---|
| `assignSubstitute` | `status: 'filled'` | …`assigned`, `confirmed`… | Vertretung ließ sich **nie** zuweisen |
| `markRequestFailed` | `status: 'failed'` | …`cancelled`… | Anfrage ließ sich **nie** als gescheitert markieren |
| Referral-Bonus | `notifications.type: 'referral'` | `booking`, `system`, `chat`, `payment`, `reminder` | der Werber erfuhr **nie** von seinem Bonus — obwohl die Gutschrift gebucht war |
| `deleteAufgabe` | `ops_aufgaben.status: 'archiviert'` | …`storniert`, `ueberfaellig`… | eine Aufgabe ließ sich **nie** löschen |

Der Bestand bestätigt es: `notifications.type` enthält live nur
`system`, `booking`, `reminder` — nie `referral`. Die anderen drei
Tabellen sind leer.

### Und die Oberfläche sprach eine dritte Sprache

`app/admin/schedule/page.tsx` rechnete mit `proposed`, `filled`,
`external`, `failed` — **keinen davon lässt der CHECK zu**. Umgekehrt
kennt die Datenbank `assigned` und `confirmed`, die die Oberfläche nirgends
behandelte.

Die Zähler „besetzt" und „gescheitert" standen damit dauerhaft auf **0**,
und eine Anfrage auf `assigned` fiel durch jeden Eimer.

### Zwei Vokabulare in einer Datei

`lib/ops/types.ts` führte `AufgabenStatus` mit sechs Werten — darunter
`'archiviert'`, das die Datenbank nicht kennt, **ohne** `'ueberfaellig'`,
das sie sehr wohl kennt und das die Tages-Kette setzt
(`cron_check_ueberfaellige_aufgaben`). Und `lib/ops/aufgaben.ts:25`
filterte `.neq('status', 'archiviert')` — auf einen Wert, den es nie geben
konnte.

---

## Der Detektor

`npm run verify:vokabular` (neu, schreibt nichts) liest 419 Wertelisten
live aus `pg_constraint` und prüft 1.554 Quelldateien.

### Zwei Entwürfe, die nichts taugten — und warum

**Entwurf 1** verglich Spaltennamen gegen die *Vereinigung* aller
erlaubten Werte im Schema. **1142 Treffer, fast alle falsch:**
`category: 'HARM_CATEGORY_HARASSMENT'` ist ein Gemini-Feld, `role: 'user'`
eine LLM-Rolle, `type: 'text/plain;…'` ein MIME-Typ. Nichts davon geht in
eine Datenbank.

**Entwurf 2** suchte `.from('X')` und danach im Umkreis von 400 Zeichen
ein `.insert({`. Damit überbrückte er zwei getrennte Anweisungen: **2 von
12 Treffern** ordneten das Objektliteral der falschen Tabelle zu — etwa
`clients.status = 'GEPLANT'`, wo das `.from('clients')` zu einem `select`
gehörte und das `.insert` zu einer ganz anderen Tabelle.

**Entwurf 3** zählt nur, was **direkt verkettet** ist: zwischen
`.from('X')` und `.insert({` darf nur Leerraum stehen. Das findet weniger —
aber was es findet, stimmt.

Ein vierter Fehler steckte im Lesen der Constraints selbst: der erste
Regex verlangte `::text` hinter dem Spaltennamen und fand deshalb **0 von
421** Constraints. Ein Detektor, der nichts findet, sieht aus wie ein
sauberes System.

---

## Behebung

Die Datenbank ist die Autorität — DDL ist ohnehin verwehrt, und ihre
Wörter sind die gültigen:

- `'filled'` → `'assigned'` (die Datenbank hatte das richtige Wort)
- `'archiviert'` → `'storniert'`, samt Filter und TypeScript-Typ
- `'referral'` → `'payment'` (eine Gutschrift ist eine Geldnachricht)
- `'failed'` → `'cancelled'` — **mit Verlust**: `cancelled` heißt
  „abgesagt", `failed` hieße „keine Vertretung gefunden". Das Vokabular
  der Datenbank kennt den zweiten Fall nicht. Ihn zu ergänzen wäre eine
  Migration und eine fachliche Entscheidung; bis dahin ist der gemeinsame
  Endzustand ehrlicher als ein Schreibvorgang, der nie ankommt.
- Die Übersicht zählt jetzt nach dem Vokabular der Datenbank.
- Der **Audit-Eintrag** hielt `status: 'failed'` fest — einen Wert, den
  die Spalte nie angenommen hat. Er trägt jetzt den tatsächlich
  geschriebenen.

---

## Tests

26 neue Tests. Mutationsprobe:

| Mutation | Wirkung |
|---|---|
| Zuordnung wieder mit 400-Zeichen-Fenster | **1 Test** fällt (die Anweisungsgrenze) |
| `::text` wieder pflichtig im Spaltennamen | **2 Tests** fallen |

---

## Offen — in Yusufs Hand

Neu aus diesem Block:

- **Fachliche Entscheidung:** soll `substitution_requests.status` ein
  eigenes `failed` bekommen? Heute wird „keine Vertretung gefunden" als
  `cancelled` geführt und ist damit von einer aktiven Absage nicht mehr
  unterscheidbar. Eine Migration wäre klein; die Frage ist, ob der
  Betrieb die Unterscheidung braucht.
- **`npm run verify:vokabular` gehört in den regelmäßigen Lauf.** Er ist
  heute grün und meldet jeden Neuzugang mit Exit 1.

Unverändert: `CRON_SECRET`, Migrationen `20261105000000`,
`20261115000000`, `20261120000000`, Entscheidung zu den 26 Bestandszeilen
aus Block 35, `mis_kpis`, Nachweise für die Einsatzfreigabe, Erika
Testfalls fehlende E-Mail-Adresse.
