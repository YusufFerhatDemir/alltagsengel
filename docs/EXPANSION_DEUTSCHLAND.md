# Expansion Deutschland — Architektur & Betriebsanleitung

**Stand:** 08.08.2026
**Branch:** `feature/unified-invoice-creation`
**Migrationen:** `20260808100000_expansion_deutschland.sql`, `20260808110000_tarifschichten_bundesland.sql`
**Production-Status:** vorbereitet, **NICHT** angewendet (Freigabe steht aus)

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
+ Audit-Eintrag mit SHA-256-Checksumme
```

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
| `trg_state_audit_no_update` | Audit-Trail ist append-only |
| `trg_tariff_obergrenze` | Anbieterpreis ≤ bestätigte gesetzliche Obergrenze des Landes |
| `trg_kassentarif_freigeschaltet` | `tarifquelle = ANERKENNUNGSBESCHEID` nur mit Bescheid |
| `trg_kassenrechnung_freigeschaltet` | Rechnung mit Kassenpositionen verlässt den Entwurf nur bei freigeschaltetem Land |
| `trg_booking_zahlungsart` | Buchung mit `payment_method = kasse` fällt ohne Freischaltung auf `privat` zurück |

### Was bewusst NICHT blockiert wird

Damit die Vorgabe „keine Features wegen fehlender Bescheide blockieren" eingehalten
wird, sind die Guards absichtlich eng geschnitten:

- **Rechnungsentwürfe** entstehen in jedem Bundesland. Berechnen, Vorschau ansehen,
  Monatsabschluss simulieren — alles läuft. Erst die Freigabe (Statuswechsel weg von
  `entwurf`) ist gesperrt. Nach der Anerkennung lassen sich die Entwürfe ohne
  Neuberechnung freigeben.
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

**Neue Grenzfälle pflegen:** `AUSNAHMEN_5` in `lib/expansion/plz-bundesland.ts`
ergänzen, Testfall in `__tests__/expansion/plz-bundesland.test.ts` hinzufügen.
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

**Verboten:** ein Bundesland im Code hart prüfen. Es gibt genau eine Wahrheit —
`state_settings`.

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

Betroffene Seiten: `app/kunde/buchen-service`, `app/kunde/buchen/[id]`,
`app/kunde/krankenfahrt`, Native-Tab „Einzugsgebiet".

**Fail-safe:** Bis die Statusantwort da ist, gilt „Kasse aus". Es gibt keine
Millisekunde, in der ein Kassen-Button sichtbar wäre, der es nicht sein dürfte.

---

## 10. Anwenden der Migrationen

**Noch nicht auf Production angewendet.** Reihenfolge:

```
20260808100000_expansion_deutschland.sql
20260808110000_tarifschichten_bundesland.sql
```

Rollback (umgekehrte Reihenfolge):

```
20260808110001_rollback_tarifschichten_bundesland.sql
20260808100001_rollback_expansion_deutschland.sql
```

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
| `lib/hessen-plz.test.ts` | 16 Tests: Abwärtskompatibilität | `npm run test:unit` |
| `tests/e2e-expansion-deutschland.sql` | 20 DB-Prüfungen inkl. Guards | `psql -f …` (Staging) |

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
| Migrationen auf Production anwenden | wartet auf Freigabe |
| PfluV-Obergrenzen gegen Verordnungstext prüfen (`bestaetigt`) | offen |
| PfluV-Novelle: Rechtsstand nach Verbändeanhörung nachziehen | offen |
| Wegepauschalen Hessen erfassen | offen — keine belegten Werte vorhanden |
| Landesregeln Hessen (Mindestdauer, Taktung, Qualifikation) erfassen | offen |
| Grenz-PLZ außerhalb Hessens auf 5-stellige Ausnahmen verfeinern | laufend, bei Bedarf |
| Storage-Bucket für Anerkennungsbescheide anlegen | offen (aktuell wird der Pfad als Text geführt) |
