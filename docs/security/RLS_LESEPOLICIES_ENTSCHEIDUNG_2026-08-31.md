# Wer darf was lesen — die 48 offenen Seite/Rolle-Paare, entschieden

**Stand:** 31.08.2026 · **Befundquelle:** `npm run lint:rls-sicht`, `npm run audit:rls-rollen`

## Was offen war

48 Seite/Rolle-Paare über 25 Tabellen lieferten `pdl`, `qm` oder
`buchhaltung` unter RLS **null Zeilen** — nicht, weil eine Sperre griff,
sondern weil auf diesen Tabellen überhaupt keine Policy stand, die eine
**Berechtigung** auswertet. Es gab dort genau zwei Wege:

| Weg | erreicht |
|---|---|
| `is_admin()` | admin, superadmin |
| `is_internal_staff()` | admin, superadmin, pdl |

Wer nicht Administration ist, fiel durch — lautlos. Der Seiten-Guard
ließ die Rolle durch, die Abfrage lief ohne Fehler, die Liste blieb leer.
`/admin/nachweise` sagte der Pflegedienstleitung damit „keine Nachweise
vorhanden", während Führungszeugnisse abliefen.

Es ist **kein Datenleck** — es wird zu wenig gezeigt, nicht zu viel. Es ist
eine stille Falschaussage, und die ist gefährlicher als eine Fehlermeldung,
weil niemand sie bemerkt.

## Die Regel, nach der entschieden wurde

Maßgeblich ist, **was in der Tabelle steht** — nicht, welche Seite sie
zufällig liest. Drei Seiten aus drei Bereichen lesen `review_errors`; die
Tabelle bekommt trotzdem genau ein Recht. Sonst wäre das Zugriffsrecht eine
Funktion der Oberfläche, und jede neue Seite könnte eine
Sicherheitsentscheidung verschieben, ohne dass jemand eine trifft.

Wo Gegenstand und Seite auseinanderfallen, gewinnt der Gegenstand.

## Die Zuordnung — 24 Tabellen

Quelle im Code: `lib/auth/rls-lesepolicies.ts` (mit Begründung je Zeile).
Umsetzung: `supabase/migrations/20261022000000_rk_lesepolicies_verwaltungsrollen.sql`.

| Tabelle | Recht | sieht danach | Grund in einem Satz |
|---|---|---|---|
| `absences` | `personal.lesen` | pdl, qm | `grund` trägt Krankheit — Gesundheitsdatum der Mitarbeitenden |
| `applications` | `personal.lesen` | pdl, qm | Bewerbungen = Personalakte, nur früher |
| `bookings` | `einsatz.lesen` | pdl, qm, buchhaltung | Termine der Kundschaft |
| `care_notes` | `pflege.lesen` | pdl, qm | hängt über `verlauf_id`/`massnahme_id` am Pflegeprozess |
| `caregiver_bonuses` | `bonus.verwalten` | admin, superadmin | Vergütung — Vorbehalt der Administration |
| `caregiver_documents` | `personal.lesen` | pdl, qm | Führungszeugnis, Verträge |
| `caregiver_initials_history` | `personal.lesen` | pdl, qm | Handzeichen, Grundlage jeder Unterschrift |
| `caregiver_qualifications` | `personal.lesen` | pdl, qm | der Ursprungsbefund vom 29.08. |
| `client_preferred_substitutes` | `einsatz.lesen` | pdl, qm, buchhaltung | reine Einsatzplanung |
| `cooperation_partners` | `stammdaten.lesen` | pdl, qm, buchhaltung | Stammdaten des Umfelds |
| `datenannahmestellen` | `abrechnung.lesen` | pdl, buchhaltung | Abrechnungsstammdaten (bundesweite Zeilen zugelassen) |
| `dta_dakota_auftraege` | `abrechnung.lesen` | pdl, buchhaltung | Versandvorgang der Kassenabrechnung |
| `einsatz_absagen` | `einsatz.lesen` | pdl, qm, buchhaltung | abgesagte Einsätze, auch abrechnungsrelevant |
| `kostentraeger_kontakte` | `stammdaten.lesen` | pdl, qm, buchhaltung | Kontaktstammdaten |
| `monthly_closings` | `abrechnung.lesen` | pdl, buchhaltung | Rechnungsgrundlage |
| `ocr_results` | `einsatz.lesen` | pdl, qm, buchhaltung | eingescannter Leistungsnachweis |
| `partner_visits` | `stammdaten.lesen` | pdl, qm, buchhaltung | gehört zu `cooperation_partners` |
| `payment_allocations` | `abrechnung.lesen` | pdl, buchhaltung | Zahlungszuordnung |
| `payment_status` | `abrechnung.lesen` | pdl, buchhaltung | Zahlungsstand je Rechnung |
| `review_errors` | `einsatz.lesen` | pdl, qm, buchhaltung | Prüffehler **am Nachweis** — das Recht, das alle drei tragen |
| `state_settings` | `einsatz.lesen` | pdl, qm, buchhaltung | Bundesländer für die Feiertage im Kalender |
| `substitution_requests` | `einsatz.lesen` | pdl, qm, buchhaltung | Vertretungsanfragen |
| `verordnung_leistungen` | `pflege.lesen` | pdl, qm | Positionen einer ärztlichen Verordnung |
| `verordnungen` | `pflege.lesen` | pdl, qm | Spalte `diagnose` — Gesundheitsdatum |

Jede Policy ist `FOR SELECT TO authenticated` mit
`darf('<recht>') AND organization_id = current_org_id()`. Vier Eigenschaften
mit Absicht:

1. **`FOR SELECT`, nicht `FOR ALL`** — permissive Policies sind ODER-verknüpft;
   eine `FOR ALL` hätte nebenbei das Schreiben geöffnet (Befund
   „FOR-ALL-Policy hebt engere auf").
2. **`TO authenticated`** — `anon` wertet den Ausdruck gar nicht erst aus.
3. **Mandantenbindung doppelt** — obwohl auf jeder Tabelle schon ein
   RESTRICTIVE `org_fence` steht. `current_org_id()` ist fail-open, und eine
   Policy soll lesbar sein, ohne dass man die zweite kennt.
4. **`darf('…')` statt einer Rollenliste** — die Matrix steht in
   `lib/auth/rollen.ts` und in `public.rollen_matrix()`. Eine dritte Liste
   wäre die nächste, die ausläuft (siehe `is_internal_staff()`/`buero`).

## Vier bewusste Verweigerungen

Diese lassen eine Seite für eine Rolle weiter leer — und das ist die
**richtige** Antwort:

| Tabelle | bleibt blind für | auf Seite |
|---|---|---|
| `verordnungen`, `verordnung_leistungen` | buchhaltung | `/admin/abrechnung`, `/admin/kundenakte` |
| `care_notes` | buchhaltung | `/admin/notizen` |
| `absences` | buchhaltung | `/admin/ausfallmanagement`, `/admin/kalender`, `/admin/schedule`, `/admin/dashboard` |
| `caregiver_bonuses` | pdl, qm | `/admin/caregivers/[id]` |

`lib/auth/rollen.ts` hält wörtlich fest, dass die Buchhaltung „KEINE
Gesundheitsdaten und keine Personalakten" bekommt. Damit die Seite das
**sagt** statt es zu verschweigen, tragen die vier betroffenen Bereiche in
`lib/auth/bereiche.ts` jetzt die passenden `zusatzRechte`.

## Ein Fehlbefund — `documents`

Der einzige Befund auf `documents` (`/admin/sepa` · buchhaltung) war keiner:
die Seite spricht `supabase.storage.from('documents')` an, den
**Speicher-Eimer**, nicht die Tabelle. Der Linter las beides als
Tabellenzugriff.

Das war kein Schönheitsfehler. Die Tabelle `documents` führt live
`fuehrungszeugnis` und `ausweis` — von Engeln selbst hochgeladen. Eine
`rk_documents_lesen`-Policy nach dem Muster der anderen hätte der
Buchhaltung die Führungszeugnisse der Mitarbeitenden geöffnet. Der Linter
blendet Speicherpfade jetzt vor der Tabellensuche aus
(`scripts/lint-rls-sichtbarkeit.ts`); RLS auf Storage ist eine andere Frage
(`storage.objects`) und gehört nicht in diese Prüfung.

## Offener Punkt — kein Blocker

`/admin/abrechnung` liest `verordnungen`, um Genehmigungsstand,
Aktenzeichen, Kostenträger und Gültigkeit zu zeigen — alles
abrechnungsrelevant und alles harmlos. In derselben Zeile steht aber
`diagnose`. **RLS kann keine Spalten ausblenden**: entweder die ganze Zeile
oder keine.

Bis dafür eine Route existiert, die nur die abrechnungsrelevanten Spalten
herausgibt, bleibt der Verordnungsteil dieser Seite für die Buchhaltung
leer — und sagt es. Das ist die sichere Richtung; der Umbau ist eine
Funktionsergänzung, keine Sicherheitslücke.

## Nachweis

| Prüfung | Was sie beweist | Braucht DB |
|---|---|---|
| `npx vitest run __tests__/security/rls-lesepolicies.test.ts` | Entscheidung (TS) und Migration (SQL) sind deckungsgleich; keine Policy schreibt, keine lässt `anon` zu, keine öffnet Gesundheitsdaten für die Buchhaltung | nein |
| `npm run verify:rls-lesepolicies` | ob die Policies **live stehen**, ob `darf()` unter jeder Rolle so entscheidet wie die Matrix, wer wirklich Zeilen sieht, ob die Mandantengrenze hält, ob `anon` draußen bleibt | ja |
| `npm run lint:rls-sicht` | ob noch eine Seite für eine zugelassene Rolle blind ist | ja |
| `npm run audit:rls-rollen` | dieselbe Frage per Impersonation, inklusive Schreibprobe und IDOR | ja |

Ein grüner Testlauf ist **kein** Beleg dafür, dass die Policies stehen —
diese Verwechslung hat hier schon zweimal zu falschen „ist live"-Meldungen
geführt. Das misst ausschließlich `verify:rls-lesepolicies`.

## Stand der Anwendung

**Die Migration ist NICHT angewendet.** `CREATE POLICY` scheitert über den
Dienstschlüssel am Eigentümer:

```
ERROR: must be owner of table absences   (42501)   ← am 31.08.2026 geprüft
```

Es gibt in dieser Umgebung keinen Weg daran vorbei: kein Supabase-MCP, kein
`SUPABASE_ACCESS_TOKEN`, kein `DATABASE_URL`, `supabase link` nicht möglich.
Die Anwendung braucht den SQL-Editor als `postgres`.

Messung vor der Anwendung (`npm run verify:rls-lesepolicies`, 31.08.2026
08:24 UTC): **0 von 24** Policies stehen, `anon` bekommt auf allen 24
Tabellen 0 Zeilen, `darf()` entscheidet unter allen drei Rollen exakt nach
`ROLLEN_MATRIX`.
