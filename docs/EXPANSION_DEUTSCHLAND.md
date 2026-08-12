# Expansion Deutschland — Architektur & Betriebsanleitung

**Stand:** 08.08.2026 (nach Pre-Production-Review)
**Branch:** `review/expansion-preproduction`
**Production-Status:** vorbereitet, **NICHT** angewendet (Freigabe steht aus)
**Migrationsplan:** [PRODUCTION_MIGRATION_PLAN_EXPANSION.md](./PRODUCTION_MIGRATION_PLAN_EXPANSION.md)

| # | Migration | Inhalt |
|---|---|---|
| 1 | `20260808100000_expansion_deutschland.sql` | `state_settings`, Audit, Warteliste, RPCs, Seed 16 Länder |
| 2 | `20260808110000_tarifschichten_bundesland.sql` | 5 Tarifschichten, Obergrenzen-Guard, Kassen-Guards |
| 3 | `20260808120000_expansion_review_fixes.sql` | Review-Korrekturen B1–B8 |
| 4 | `20260808120001_plz_bundesland_seed.sql` | **generiert** — PLZ→Bundesland-Regeln für SQL |
| 5 | `20260808120002_invoice_bundesland_klient.sql` | Rechnungs-RPC v5 (Bundesland aus Klienten-PLZ) |
| 6 | `20260808130000_expansion_phase2.sql` | Freischaltung zieht Tarife + Landesregeln mit; Dashboard-View |
| 7 | `20260808140000_katalog_rls.sql` | RLS auf den Katalogtabellen, `anon` verliert Schreibrechte |
| 8 | `20260808150000_view_invoker_und_haertung.sql` | **schließt ein Kreuz-Mandanten-Leck** in den beiden Views; `search_path` für die letzte DEFINER-Funktion; Indizes für den Kassenrechnungs-Guard |
| 9 | `20260808160000_profiles_agb_spalten.sql` | `profiles.agb_accepted_at` / `agb_version` — von der Registrierung seit jeher geschrieben, in keiner Migration angelegt |
| 10 | `20260808170000_role_guard_insert_fix.sql` | eigener INSERT-Wächter; der alte wies **jede** Rolle ab, auch `kunde` |
| 11 | `20260808180000_fk_indizes_operativer_kern.sql` | 20 Fremdschlüssel-Indizes im Abrechnungskern |
| 12 | `20260808190000_fehlende_policies.sql` | Policies für fünf Tabellen, die RLS ohne jede Regel hatten |

Nummern 8–12 stammen aus der Produktionsreife-Abnahme vom 08.08.2026. Sie
gehören fachlich nicht zur Expansion, wurden aber im selben Durchlauf
gefunden und liegen deshalb in derselben Migrationskette (Phasen H–L des
Migrationsplans).

---

## 1. Warum das Ganze

Vorher war die Kassenabrechnung hart auf Hessen kodiert: `lib/hessen-plz.ts` prüfte
PLZ-Präfixe, und wer außerhalb lag, sah nur „privat". Diese Konstruktion hatte zwei
Fehler:

1. **Zu grob.** Sie beantwortete nur „liegt die PLZ in Hessen?", nicht „dürfen wir in
   diesem Bundesland überhaupt mit der Kasse abrechnen?". Solange der
   Anerkennungsbescheid fehlt, ist die Antwort auch in Hessen nein.
2. **Nicht skalierbar.** Jedes weitere Bundesland hätte einen Code-Change und ein
   Deployment gebraucht — inklusive App-Store-Review für die Native-App.

Jetzt ist die Freischaltung ein **Stammdatum**. Eine Tabelle, eine Zeile je
Bundesland, ein Klick.

> **Grundregel:** Eine fehlende Anerkennung blockiert **ein Modul in einem Bundesland** —
> niemals die Plattform. Werbung, Registrierung, Warteliste und Privatleistungen laufen
> in allen 16 Bundesländern unabhängig weiter.

---

## 2. Die Freischaltungs-Matrix

Tabelle `public.state_settings`, eindeutig je `(organization_id, bundesland)`.
Alle 16 Bundesländer werden für jede Organisation automatisch angelegt — auch für
neu registrierte Mandanten (Trigger `trg_seed_state_settings`).

### Status

| Status | Bedeutung |
|---|---|
| `VORBEREITUNG` | Unterlagen werden zusammengestellt |
| `ANTRAG_EINGEREICHT` | Antrag ist bei der Landesbehörde |
| `IN_PRUEFUNG` | Behörde prüft, Rückfragen laufen |
| `ANERKANNT` | Bescheid liegt vor — nur über die Freischaltung erreichbar |
| `ABGELEHNT` | Ablehnung; Kassenabrechnung dauerhaft gesperrt |

### Schalter

**Unabhängig von der Anerkennung** — jederzeit im Admin änderbar:

| Spalte | Wirkung |
|---|---|
| `marketing_enabled` | Werbung/SEO-Landingpages für das Land |
| `registration_enabled` | Kunden dürfen sich registrieren |
| `waitinglist_enabled` | Warteliste nimmt Vormerkungen an |
| `private_enabled` | Privatleistungen buchbar |

**An die Anerkennung gebunden** — nur über die Ein-Klick-Freischaltung:

| Spalte | Wirkung |
|---|---|
| `insurance_enabled` | Hauptschalter Kassenabrechnung |
| `kassentarife_enabled` | Tarife mit `tarifquelle = ANERKENNUNGSBESCHEID` |
| `budgetpruefung_enabled` | §45b-Budgetprüfung |
| `kassenrechnung_enabled` | Rechnungen mit Kassenpositionen freigebbar |
| `elnw_enabled` | digitale Leistungsnachweise |
| `dakota_export_enabled` | Datenaustausch §302/§105 |

### Ist-Zustand nach dem Seed (Stamm-Org, 08.08.2026)

| Bundesland | Status | Werbung | Registrierung | Warteliste | Privat | Kasse |
|---|---|:-:|:-:|:-:|:-:|:-:|
| Hessen | Antrag eingereicht | ☑ | ☑ | ☑ | ☑ | ☐ |
| Bayern, NRW, RLP, Saarland | Vorbereitung | ☑ | ☑ | ☑ | ☐ | ☐ |
| übrige 11 | Vorbereitung | ☑ | ☑ | ☑ | ☐ | ☐ |

---

## 3. Ein Klick nach der Anerkennung

**Admin → Betriebssystem → Expansion Deutschland → „Kassenabrechnung aktivieren"**

Die Seite hat zwei Ansichten auf dieselben Daten: **Kacheln** (16 Länderkarten mit
Status, Modulpunkten, Tarif- und Wartelistenzahlen) und **Tabelle** (die Matrix zum
Bearbeiten der einzelnen Schalter). Die Kennzahlenzeile darüber zeigt unter anderem,
wie viele Länder *startklar* sind — Bescheid und Tarife liegen vor, es fehlt nur
noch der Klick.

Der Dialog verlangt den Anerkennungsbescheid (Storage-Pfad oder Aktenzeichen).
Ohne ihn ist der Knopf wirkungslos — das wird nicht nur in der Oberfläche, sondern
in der Datenbank erzwungen.

Ein Klick setzt in **einer** Transaktion:

```
status                 → ANERKANNT
insurance_enabled      → true
kassentarife_enabled   → true
budgetpruefung_enabled → true
kassenrechnung_enabled → true
elnw_enabled           → true
dakota_export_enabled  → true
private_enabled        → true
anerkannt_am, effective_date, approval_*

billing_tariffs.ist_aktiv      → true   (alle vorbereiteten Kassentarife des Landes)
billing_landesregeln.ist_aktiv → true   (alle Landesregeln des Landes)

+ Audit-Eintrag mit SHA-256-Checksumme
```

**Voraussetzungen** (beide werden von der Datenbank erzwungen):

1. Ein hinterlegter Anerkennungsbescheid.
2. Mindestens ein **vorbereiteter** Kassentarif für das Bundesland — aktiv oder
   inaktiv. Tarife werden bis zur Anerkennung bewusst inaktiv gepflegt und erst
   durch den Klick scharf geschaltet. Fehlt jeder Tarif, bricht die Freischaltung
   mit `FREISCHALTUNG_OHNE_TARIFE` ab; sonst wäre sie eine leere Zusage, weil jede
   Rechnung an `MISSING_VALID_TARIFF` scheitern würde.

Das Dashboard zeigt je Bundesland an, welche der beiden Voraussetzungen noch fehlt.

Danach ändert sich das Verhalten von Web-App, Kunden-App und Native-App sofort.
**Kein Deployment, kein Code-Change, kein App-Store-Review.**

Die Warteliste wird **nicht** automatisch benachrichtigt — der Versand an externe
Empfänger ist ein eigener, ausdrücklich zu bestätigender Schritt
(`POST …/notify-waitlist` mit `{ "bestaetigt": true }`).

### Rücknahme

Widerruf oder Fehleingabe: „Kasse abschalten" mit Pflicht-Begründung
(mind. 10 Zeichen). Setzt alle sechs Schalter zurück, schreibt einen Audit-Eintrag.
Privatleistungen und Warteliste laufen weiter.

---

## 4. Was in der Datenbank erzwungen wird

Diese Regeln stehen als `CHECK`-Constraints und Trigger in der DB — sie gelten auch,
wenn jemand am UI vorbei schreibt.

| Guard | Regel |
|---|---|
| `chk_insurance_requires_anerkennung` | `insurance_enabled` nur bei `status = ANERKANNT` **und** hinterlegtem Bescheid |
| `chk_kassenmodule_require_insurance` | kein Kassenmodul ohne Hauptschalter |
| `chk_abgelehnt_keine_kasse` | abgelehntes Land ⇒ keine Kassenabrechnung |
| `trg_state_settings_kanal` | Kassenschalter und Status `ANERKANNT` **nur** über die RPCs — kein direktes `UPDATE` |
| `trg_state_settings_audit_immer` | jede Änderung erzeugt einen Audit-Eintrag, auch am RPC vorbei |
| `trg_state_settings_kein_delete` | die 16 Zeilen je Organisation sind unlöschbar |
| `trg_state_audit_no_update` | Audit-Trail ist append-only |
| `activate_insurance_billing` | Freischaltung verlangt Bescheid **und** ≥ 1 gültigen Kassentarif |
| `trg_tariff_obergrenze` | Anbieterpreis ≤ bestätigte gesetzliche Obergrenze des Landes |
| `trg_kassentarif_freigeschaltet` | `tarifquelle = ANERKENNUNGSBESCHEID` nur mit Bescheid |
| `trg_kassenrechnung_freigeschaltet` | Rechnung mit Kassenpositionen verlässt den Entwurf nur, wenn das Bundesland **des Klienten** freigeschaltet ist |
| `trg_booking_zahlungsart` | Buchung mit `payment_method = kasse` fällt auf `privat` zurück, wenn die **Kunden-PLZ** nicht freigeschaltet ist |
| `sendePerSFTP(…, freigabe)` | Dakota-Übermittlung verlangt `dakota_export_enabled` als Pflichtparameter |

> **Bundesland des Klienten, nicht der Organisation.** Alle Abrechnungs-Guards
> leiten das Bundesland aus der PLZ des Klienten bzw. Kunden ab
> (`public.eindeutiges_bundesland_fuer_plz`). Andernfalls wäre nach der
> Freischaltung eines einzigen Bundeslands bundesweit abrechenbar gewesen.
> Lässt sich die PLZ keinem Bundesland eindeutig zuordnen, blockiert der Guard —
> fail-safe.

### Was bewusst NICHT blockiert wird

Damit die Vorgabe „keine Features wegen fehlender Bescheide blockieren" eingehalten
wird, sind die Guards absichtlich eng geschnitten:

- **Privatrechnungen** sind vollständig unberührt — erstellen, freigeben, versenden
  funktioniert in jedem Bundesland zu jeder Zeit.
- **Kassenrechnungen**: Der Guard sperrt nur die *Freigabe* (Statuswechsel weg von
  `entwurf`), nicht das Erstellen. In der Praxis entsteht vor der Anerkennung
  allerdings ohnehin kein Kassen-Entwurf: Kassentarife liegen bis zum Ein-Klick
  bewusst inaktiv, und die Rechnungs-RPC verlangt einen aktiven Tarif
  (`MISSING_VALID_TARIFF`). Nach der Freischaltung schaltet der Klick die Tarife
  scharf, und Entwürfe lassen sich auch rückwirkend für zurückliegende Leistungen
  erzeugen — die Gültigkeitszeiträume der Tarife decken sie ab.
  Nachgewiesen in `tests/regression-abrechnung.sql` (R2 → R3 → R4).
- **Tarifpflege** läuft überall. Kassentarife dürfen angelegt und aktiv gehalten
  werden; nur die Behauptung „dieser Preis stammt aus einem Anerkennungsbescheid"
  setzt einen Bescheid voraus.
- **Buchungen** gehen nie verloren. Sie werden auf `privat` heruntergestuft, nicht
  abgelehnt — der Kunde bekommt seine Leistung.
- **Unbestätigte Obergrenzen** sperren nicht. Sie sind dokumentiert und sichtbar,
  wirken aber erst nach dem Abgleich mit der Originalverordnung (`bestaetigt = true`).

---

## 5. PLZ → Bundesland

`lib/expansion/plz-bundesland.ts`, offline, ohne Netzwerkzugriff.

Auflösung: **5-stellige Ausnahme → 3-stelliges Präfix → 2-stelliges Präfix → null.**

Jeder Treffer trägt ein `sicher`-Flag:

- `sicher = true` — das Gebiet liegt eindeutig in diesem Land
- `sicher = false` — die Leitregion überschreitet eine Landesgrenze und es gibt keine
  gepflegte 5-stellige Ausnahme

**Für die Kassenabrechnung zählt ausschließlich `sicher = true`.** Eine Grenz-PLZ
löst nie „Kasse" aus, selbst wenn das wahrscheinliche Bundesland freigeschaltet ist.
Werbung, Registrierung, Warteliste und Privatleistungen nutzen dagegen die
wahrscheinlichste Zuordnung.

Der kuratierte Hessen-Block (Mainz-Kostheim/-Kastel, Viernheim, Lampertheim,
Neckarsteinach, Hann. Münden, Warburg, Diez …) wurde unverändert aus
`lib/hessen-plz.ts` übernommen und ist durch die bestehende Testsuite abgedeckt.

### Dieselben Regeln in SQL

Die Trigger, die die Anerkennungssperre durchsetzen, brauchen die Zuordnung
ebenfalls — sonst könnten sie nur das Bundesland der Organisation prüfen.
Deshalb liegt sie zusätzlich in `public.plz_bundesland_regeln`.

**TypeScript ist die einzige Quelle.** Die SQL-Seite wird generiert:

```
npm run generate:plz-sql      # schreibt 20260808120001_plz_bundesland_seed.sql
```

`__tests__/expansion/plz-sql-sync.test.ts` vergleicht beide Welten über den
**gesamten PLZ-Raum (01000–99999)** und schlägt fehl, sobald sie auseinanderlaufen.

**Neue Grenzfälle pflegen:** `AUSNAHMEN_5` in `lib/expansion/plz-bundesland.ts`
ergänzen, `npm run generate:plz-sql` laufen lassen, Testfall in
`__tests__/expansion/plz-bundesland.test.ts` hinzufügen.
Eine 5-stellige Ausnahme gilt immer als `sicher`.

`lib/hessen-plz.ts` existiert nur noch als Re-Export für Bestandsimporte.
`kasseErlaubt()` ist als `@deprecated` markiert.

---

## 6. Die fünf Tarifschichten

Sauber getrennt, jede bundeslandabhängig:

| # | Schicht | Tabelle | Inhalt |
|---|---|---|---|
| 1 | Gesetzliche Obergrenzen | `billing_gesetzliche_obergrenzen` | Was das Land maximal erlaubt. **Kein Abrechnungspreis.** |
| 2 | Anbieterpreise | `billing_tariffs` (`rechtsgrundlage ≠ 'privat'`) | Was gegenüber der Kasse abgerechnet wird. Muss ≤ Schicht 1 sein. |
| 3 | Privatpreise | `billing_tariffs` (`rechtsgrundlage = 'privat'`) | Frei kalkulierbar, keine Deckelung. |
| 4 | Wegepauschalen | `billing_wegepauschalen` | Modell (pro Einsatz / pro km / Zone) je Land. |
| 5 | Landesregeln | `billing_landesregeln` + `billing_landesregel_keys` | Mindestdauer, Taktung, Qualifikation, Nachweispflichten. |

Diagnose: `SELECT * FROM public.billing_preisschichten_uebersicht`.

### Hessen-Seed (Schicht 1)

Die PfluV-Werte sind als **unbestätigte** Obergrenzen hinterlegt:

| Angebotstyp | Obergrenze | Quelle | bestätigt |
|---|---|---|---|
| Betreuungsangebote (Nr. 1) + Entlastung von Pflegenden (Nr. 2) | 30,00 €/Std. inkl. USt. | §3 PfluV Hessen | ☐ |
| Entlastung im Alltag (Nr. 3) | 25,00 €/Std. inkl. USt. | §3 PfluV Hessen | ☐ |

Belegt durch `billing/QUELLENPRÜFUNG_30-25-5_EUR.md` (07.08.2026) mit drei
übereinstimmenden Fundstellen im Repo. Deren Kernaussage ist im Datenmodell
abgebildet: Das sind **Preisobergrenzen, keine Abrechnungstarife** — der Anbieter
wählt seinen Preis bis zu dieser Grenze, und die Kasse erstattet dem Versicherten
das, was er tatsächlich bezahlt hat.

`bestaetigt = false` ist Absicht: Die Fundstellen sind Sekundärquellen, der
Verordnungstext selbst wurde noch nicht gegengelesen. Zusätzlich läuft die
**PfluV-Novelle in der Verbändeanhörung** — starre Obergrenzen könnten entfallen.

Die **5-EUR-Fahrtkostenpauschale** ist bewusst nirgends hinterlegt: laut derselben
Quellenprüfung ein selbst beantragter Wert ohne PfluV-Grundlage und ohne Genehmigung.

**Vor der Aktivierung der Kassenabrechnung in Hessen zu erledigen:**

1. Verordnungstext beschaffen, Nummern und Beträge gegenlesen
2. `leistungsart` konkretisieren, falls die Verordnung nach Leistungsart differenziert
3. `bestaetigt = true`, `bestaetigt_von`, `bestaetigt_am` setzen — erst dann sperrt der Trigger
4. Rechtsstand der Novelle prüfen und `gueltig_bis` setzen, falls überholt

Wegepauschalen und Landesregeln sind **bewusst leer** — dafür gibt es keine belegten
Werte. Nur der Struktur-Katalog (`billing_landesregel_keys`, 16 Schlüssel) ist geseedet.

---

## 7. Schnittstellen

| Route | Methode | Zugriff | Zweck |
|---|---|---|---|
| `/api/expansion/status?plz=60311` | GET | öffentlich | Lage für eine PLZ |
| `/api/expansion/status?bundesland=hessen` | GET | öffentlich | Lage für ein Land |
| `/api/expansion/status` | GET | öffentlich | alle 16 Länder |
| `/api/expansion/waitlist` | POST | öffentlich | Vormerkung |
| `/api/expansion/waitlist` | GET | Admin | Warteliste lesen |
| `/api/expansion/states` | GET | Admin | volle Matrix + Wartelisten-Zahlen |
| `/api/expansion/states` | PATCH | Admin | unabhängige Schalter + Stammdaten |
| `/api/expansion/states/{land}/activate` | POST | Admin | **Ein-Klick-Freischaltung** |
| `/api/expansion/states/{land}/activate` | DELETE | Admin | Abschaltung mit Begründung |
| `/api/expansion/states/{land}/notify-waitlist` | GET | Admin | Vorschau Empfängerzahl |
| `/api/expansion/states/{land}/notify-waitlist` | POST | Admin | Versand (Bestätigung nötig) |

Die öffentliche Route liefert ausschließlich `state_settings_public` — keine
Bescheid-Pfade, keine Aktenzeichen, keine internen Notizen.

---

## 8. Verwendung im Code

**Server / API-Routen:**

```ts
import { bundeslandLage, zahlungsartFuerPlz } from '@/lib/expansion/state-settings'

const lage = await bundeslandLage(plz)
if (lage.kassenabrechnung) { /* … */ }

const zahlungsart = await zahlungsartFuerPlz(plz)   // 'kasse' | 'privat'
```

**Client-Komponenten:**

```tsx
import { useBundeslandLage } from '@/lib/expansion/client'
import BundeslandHinweis from '@/components/kunde/BundeslandHinweis'

const { lage, laedt } = useBundeslandLage(profil?.postal_code)

{!lage.kassenabrechnung && <BundeslandHinweis lage={lage} quelle="buchung" />}
```

**Native (Expo):**

```ts
import { ladeBundeslandLage } from '../lib/expansion'
const lage = await ladeBundeslandLage(plz)
```

> **Zum Stack:** Die mobile App ist **Expo / React Native** (`native/`) plus ein
> Capacitor-WKWebView der Live-Site für iOS — kein Flutter. Die Anbindung ist
> entsprechend in `native/src/lib/expansion.ts` und
> `native/src/components/BundeslandStatus.tsx` umgesetzt.

**Einzelne Kassenmodule abfragen:**

```ts
import { modulAktiv, modulAktivFuerPlz } from '@/lib/expansion/state-settings'

await modulAktivFuerPlz('elnw_enabled', client.zip_code)
await modulAktiv('dakota_export_enabled', 'hessen', orgId)
```

`kassenabrechnungMoeglich`, `zahlungsartFuerPlz` und `modulAktiv*` lesen bewusst
**am Cache vorbei**: Nach einer Abschaltung muss die Sperre sofort greifen.
Nur die Anzeige (`bundeslandLage`, `alleBundeslaender`) nutzt den 30-Sekunden-Cache.

**Verboten:** ein Bundesland im Code hart prüfen. Es gibt genau eine Wahrheit —
`state_settings`.

### Wo die fünf Kassenmodule heute wirken

| Modul | Wirkort |
|---|---|
| `kassentarife_enabled` | `trg_kassentarif_freigeschaltet` — Tarifquelle `ANERKENNUNGSBESCHEID` |
| `budgetpruefung_enabled` | Statusflag; die Budgetlogik läuft ohnehin nur über Kassen-Budgettöpfe, die `kassenrechnung_enabled` bereits sperrt |
| `kassenrechnung_enabled` | `trg_kassenrechnung_freigeschaltet` — Rechnungsfreigabe |
| `elnw_enabled` | `/api/leistungsnachweis` — ohne Freischaltung trägt das PDF „LEISTUNGSDOKUMENTATION — NICHT ZUR EINREICHUNG BEI DER PFLEGEKASSE" |
| `dakota_export_enabled` | `sendePerSFTP()` — Pflichtparameter `freigabe`, bricht sonst ab |

---

## 8a. Bundesland-Umschalter in der Admin-Oberfläche

In der Seitenleiste steht unter dem Organisations-Umschalter ein
**Bundesland-Umschalter**. Die Auswahl liegt im Cookie `ae_active_bundesland`
und wirkt auf alle bundeslandbezogenen Admin-Listen:

| Seite | Wirkung |
|---|---|
| Klienten | Filter über `clients.zip_code` → Bundesland; Klienten ohne zuordenbare PLZ bleiben sichtbar |
| Leistungspreise | ersetzt das seiteneigene Auswahlfeld, solange ein Land gewählt ist |
| Kostenträger | filtert; bundesweite Kontakte (`bundesland IS NULL`) bleiben immer sichtbar |
| Expansion | hebt die Kachel des gewählten Landes hervor (blendet nichts aus) |

Der Umschalter ist **ein Anzeigefilter, keine Sicherheitsgrenze**. Die
Mandantentrennung läuft weiter über `organization_id` und RLS, die
Freischaltung über `state_settings`. Ein manipuliertes Cookie kann höchstens
die eigene Liste falsch filtern.

Serverseitig: `getActiveBundesland()` / `getActiveBundeslandFilter()` aus
`lib/expansion/active-state.ts`.
Clientseitig: `useBundeslandFilter()` aus `components/admin/BundeslandContext`
mit `passtZuFilter(plz)` und `passtZuLand(code)`.

Jede gefilterte Liste zeigt `<BundeslandFilterHinweis />` — sonst hält jemand
eine gefilterte Liste für den vollständigen Bestand.

---

## 9. Kundenoberfläche

Ist ein Bundesland noch nicht freigeschaltet, zeigt die App:

- Werbung und Inhalte wie gewohnt
- Registrierung offen
- Warteliste mit E-Mail-Feld („Bei Freischaltung benachrichtigen")
- Ansprechpartner (falls hinterlegt)
- Privatleistungen buchbar, sofern `private_enabled`
- Kassen-Option ausgegraut mit dem Text:

  > Die Anerkennung für die Pflegekassenabrechnung befindet sich derzeit im
  > Genehmigungsverfahren.

Betroffene Seiten: `app/kunde/home`, `app/kunde/buchen-service`,
`app/kunde/buchen/[id]`, `app/kunde/krankenfahrt`, `components/OnboardingFlow`,
Native-Tab „Einzugsgebiet".

**Fail-safe:** Bis die Statusantwort da ist, gilt „Kasse aus". Es gibt keine
Millisekunde, in der ein Kassen-Button sichtbar wäre, der es nicht sein dürfte.
Dasselbe gilt für einen Kunden ohne hinterlegte PLZ: unbekanntes Bundesland
heißt „keine Kassenabrechnung", nicht „wahrscheinlich Hessen".

### Kein Kassenversprechen ohne Freischaltung

Die Zusage „wir rechnen direkt mit Ihrer Pflegekasse ab" ist an
`kassenabrechnung` gebunden, nicht nur der Buchungsknopf. Konkret:

| Ort | freigeschaltet | nicht freigeschaltet |
|---|---|---|
| `/kunde/home`, §45b-Banner | „Bis zu 131 €/Monat über Ihre Pflegekasse. Direkt über Alltagsengel abrechnen." | Verfahrenshinweis + Warteliste an derselben Stelle |
| Onboarding, Abschluss-Schritt | „131 €/Monat von der Pflegekasse — 0 € Eigenanteil", Schritt 3 „Abrechnung läuft" | „131 €/Monat stehen Ihnen nach §45b SGB XI zu" + Verfahrenshinweis, Schritt 3 „Privat abrechnen" |

Der gesetzliche Anspruch (131 €/Monat nach §45b SGB XI) gilt bundesweit und
darf überall genannt werden — Werbung ist in jedem Bundesland erlaubt. Was
an die Freischaltung gebunden ist, ist ausschließlich die Zusage, dass
**wir** das abrechnen. Diese Trennung ist der Grund, warum die
Marketing- und Ratgeberseiten (`/entlastungsbetrag`, `/faq`, Blog) den
Betrag weiterhin ungefiltert nennen.

---

## 10. Anwenden der Migrationen

**Noch nicht auf Production angewendet.** Reihenfolge:

```
20260808100000_expansion_deutschland.sql
20260808110000_tarifschichten_bundesland.sql
20260808120000_expansion_review_fixes.sql
20260808120001_plz_bundesland_seed.sql        (generiert)
20260808120002_invoice_bundesland_klient.sql
20260808130000_expansion_phase2.sql
20260808140000_katalog_rls.sql
20260808150000_view_invoker_und_haertung.sql
20260808160000_profiles_agb_spalten.sql
20260808170000_role_guard_insert_fix.sql
20260808180000_fk_indizes_operativer_kern.sql
20260808190000_fehlende_policies.sql
```

Rollback (umgekehrte Reihenfolge):

```
20260808190001_rollback_fehlende_policies.sql
20260808180001_rollback_fk_indizes_operativer_kern.sql
20260808170001_rollback_role_guard_insert_fix.sql
20260808160001_rollback_profiles_agb_spalten.sql        (vorher AGB-Nachweis sichern)
20260808150001_rollback_view_invoker_und_haertung.sql   (setzt das Leck wieder ein)
20260808140001_rollback_katalog_rls.sql
20260808130001_rollback_expansion_phase2.sql
20260808120003_rollback_expansion_review_fixes.sql
20260808110001_rollback_tarifschichten_bundesland.sql
20260808100001_rollback_expansion_deutschland.sql
```

Der vollständige Ablauf mit Preflight-Checks, Backup, Smoke-Tests und
GO/NO-GO-Gates steht in
[PRODUCTION_MIGRATION_PLAN_EXPANSION.md](./PRODUCTION_MIGRATION_PLAN_EXPANSION.md).

Die Rollbacks sichern fachliche Daten (Warteliste, Audit, Wegepauschalen,
Obergrenzen) vorher in `*_archiv`-Tabellen.

### Vor dem Apply prüfen

1. **Bundesland-Normalisierung.** Migration 2 schreibt `organizations.bundesland`,
   `organizations.address->>'bundesland'` und `billing_tariffs.bundesland` auf
   Katalog-Codes um (`'Hessen'` → `'hessen'`) und setzt Fremdschlüssel darauf.
   Werte, die sich nicht zuordnen lassen, bleiben unverändert und lassen den
   Fremdschlüssel scheitern — vorher prüfen:

   ```sql
   SELECT id, name, bundesland FROM public.organizations
    WHERE bundesland IS NOT NULL
      AND public.normalize_bundesland(bundesland) IS NULL;
   ```

   (Die Funktion existiert erst nach dem ersten Abschnitt von Migration 2 —
   auf einem Staging-Branch vorab laufen lassen.)

2. **Bestehende Kassenrechnungen.** `trg_kassenrechnung_freigeschaltet` greift ab
   sofort für jeden Statuswechsel weg von `entwurf`. Solange Hessen nicht
   freigeschaltet ist, lässt sich keine Kassenrechnung freigeben. Auf Production
   ist `billing_tariffs` leer und es existieren keine Kassenrechnungen — trotzdem
   vor dem Apply gegenprüfen:

   ```sql
   SELECT COUNT(*) FROM public.invoices i
    WHERE i.status = 'entwurf'
      AND EXISTS (SELECT 1 FROM public.invoice_items x
                   WHERE x.invoice_id = i.id AND x.budget_type <> 'private');
   ```

3. **E2E-Test auf Staging:**

   ```
   psql "$STAGING_URL" -f tests/e2e-expansion-deutschland.sql
   ```

   Das Skript endet mit `ROLLBACK` und hinterlässt keine Daten.

---

## 11. Tests

| Suite | Umfang | Aufruf |
|---|---|---|
| `__tests__/expansion/plz-bundesland.test.ts` | 28 Tests: Zuordnung, Grenzfälle, Fail-safe | `npx vitest run __tests__/expansion` |
| `__tests__/expansion/gating.test.ts` | 15 Tests: Freischaltungsregel von allen Seiten | dito |
| `__tests__/expansion/plz-sql-sync.test.ts` | 6 Tests: TS ↔ SQL über den gesamten PLZ-Raum | dito |
| `__tests__/expansion/alle-bundeslaender.test.ts` | 101 Tests: Gating-Matrix und Unabhängigkeit für alle 16 Länder | dito |
| `lib/hessen-plz.test.ts` | 16 Tests: Abwärtskompatibilität | `npm run test:unit` |
| `tests/e2e-expansion-deutschland.sql` | 28 DB-Prüfungen inkl. aller Guards | `psql -f …` (Staging) |
| `tests/e2e-alle-bundeslaender.sql` | 16 × 9 Prüfungen: Freischaltung, Tarif-/Regel-Kaskade, Unabhängigkeit, Rücknahme | `psql -f …` (Staging) |
| `tests/security-expansion.sql` | 30 Angriffsproben als `anon`, Kunde und Admin gegen die Freischaltungslogik | `psql -f …` (Staging) |
| `tests/regression-abrechnung.sql` | 10 Prüfungen: die bestehende Abrechnung bleibt unberührt | `psql -f …` (Staging) |
| `tests/audit-rls-vollstaendig.sql` | Befundliste: RLS, Policies, `anon`-Rechte, `search_path`, FK-Indizes, View-Semantik | `psql -f …` (Staging) |
| `scripts/api-audit.mjs` | fährt alle 71 API-Routen unauthentifiziert an; meldet 5xx und offene Endpunkte | `node scripts/api-audit.mjs http://127.0.0.1:8080` |

---

## 12. Neues Bundesland in Betrieb nehmen

1. **Antrag** stellen, Status im Admin auf `ANTRAG_EINGEREICHT`, Datum eintragen.
2. **Werbung/Registrierung/Warteliste** aktiv lassen — Leads sammeln.
3. **Landesverordnung auswerten:** Obergrenzen (Schicht 1) und Landesregeln
   (Schicht 5) erfassen, Quelle und Paragraf angeben, `bestaetigt = true` erst nach
   Abgleich mit dem Original.
4. **Anbieterpreise** (Schicht 2) und **Wegepauschalen** (Schicht 4) anlegen —
   zunächst `ist_aktiv = false`, Tarifquelle ≠ `ANERKENNUNGSBESCHEID`.
5. **Bescheid trifft ein:** Datei in Storage ablegen, Pfad notieren.
6. **Ein Klick:** „Kassenabrechnung aktivieren" mit Bescheid, Aktenzeichen, Behörde,
   GO-Live-Datum.
7. **Tarife scharf schalten:** `ist_aktiv = true`, Tarifquelle auf
   `ANERKENNUNGSBESCHEID` umstellen (ab jetzt erlaubt).
8. **Warteliste benachrichtigen** — Vorschau ansehen, dann ausdrücklich bestätigen.

---

## 13. Offene Punkte

| Punkt | Status |
|---|---|
| Migrationen auf Production anwenden | wartet auf Freigabe — siehe [Migrationsplan](./PRODUCTION_MIGRATION_PLAN_EXPANSION.md) |
| `clients.zip_code` bei Bestandsklienten füllen | **Voraussetzung** — ohne eindeutige PLZ blockiert die Rechnungsfreigabe (Preflight P4) |
| PfluV-Obergrenzen gegen Verordnungstext prüfen (`bestaetigt`) | offen |
| PfluV-Novelle: Rechtsstand nach Verbändeanhörung nachziehen | offen |
| Wegepauschalen Hessen erfassen | offen — keine belegten Werte vorhanden |
| Landesregeln Hessen (Mindestdauer, Taktung, Qualifikation) erfassen | offen |
| Grenz-PLZ außerhalb Hessens auf 5-stellige Ausnahmen verfeinern | laufend, bei Bedarf |
| Storage-Bucket für Anerkennungsbescheide anlegen | offen (aktuell wird der Pfad als Text geführt) |
