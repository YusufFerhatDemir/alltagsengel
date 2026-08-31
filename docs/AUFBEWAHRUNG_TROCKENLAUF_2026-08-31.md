# Aufbewahrung — Trockenlauf-Bericht

**Erzeugt:** 31.08.2026 · **Lauf:** `npm run aufbewahrung:bericht`
· **Gegen:** Produktionsdatenbank

> **`AUFBEWAHRUNG_AKTIV` wurde NICHT gesetzt. Es wurde nichts gelöscht und
> nichts geändert.** Der Bericht liest ausschließlich. Das Werkzeug
> (`scripts/aufbewahrung-trockenlauf-bericht.mjs`) kennt kein `DELETE` und
> kein `UPDATE`.

## Warum es diesen Bericht zusätzlich zum Cron-Trockenlauf gibt

`GET /api/cron/aufbewahrung` läuft ohne `AUFBEWAHRUNG_AKTIV=1` bereits als
Trockenlauf — aber er **zählt** nur. Für die Entscheidung „dürfen wir scharf
schalten?" ist eine Zahl zu wenig: wer `geloescht: 2450` liest, weiß nicht,
welche Zeilen das sind, wie alt der Bestand ist und ob die Schutzbedingung
überhaupt etwas zurückhält.

Der Bericht beantwortet je Regel fünf Fragen: Bestand, ältester Datensatz,
Stichtag, **welche** Zeilen fielen (mit Kennung und Alter) und wie viele die
Schutzbedingung hält.

Die Regeln werden aus `lib/aufbewahrung/katalog.ts` **importiert**, nicht
abgeschrieben — sonst wiese der Bericht Fristen aus, nach denen der Lauf gar
nicht arbeitet.

---

## Ergebnis auf einen Blick

| Tabelle | Bereich | Frist | Bestand | Ältester | **Würde gelöscht** | IP kürzen |
|---|---|---|---|---|---|---|
| `visitors` | perimeter | 90 T | 3.498 | 174 T | **2.450** | 3.318 |
| `visitor_locations` | perimeter | 90 T | 3.957 | 174 T | **2.211** | 2.670 |
| `page_views` | perimeter | 90 T | 8.861 | 157 T | **2.286** | 6.212 |
| `analytics_events` | perimeter | 180 T | 5.324 | 19 T | 0 | — |
| `conversions` | perimeter | 365 T | 40 | 136 T | 0 | 30 |
| `geo_events` | betrieb | 14 T | **0** | — | 0 | — |
| `offline_queue` | betrieb | 30 T | **0** | — | 0 | — |
| | | | | **Summe** | **6.947** | **12.230** |

Alle Zahlen stammen aus dem Lauf, der unten vollständig abgedruckt ist. Die
Bestände wachsen laufend (die öffentliche Seite schreibt weiter); ein neuer
Lauf liefert daher leicht andere Bestandszahlen. Die Zahl der **Löschkandidaten**
ändert sich dadurch praktisch nicht — sie hängt am Stichtag vor 90 Tagen, nicht
am heutigen Zulauf.

---

## Was das bedeutet

**Der scharfe Lauf würde 6.947 Zeilen entfernen und 12.230 IP-Adressen
kürzen.** Alles davon ist Reichweitenmessung der öffentlichen Website
(`visitors`, `visitor_locations`, `page_views`) — kein Betriebsdatum, kein
Leistungsnachweis, keine Pflegedokumentation.

**Kein einziger Löschkandidat ist jünger als 90 Tage.** Der jüngste betroffene
Datensatz liegt genau auf dem Stichtag; die ältesten sind 174 Tage alt.

**Die beiden Betriebstabellen sind leer.** `geo_events` und `offline_queue`
haben live null Zeilen — der scharfe Lauf täte dort heute nichts.

### Der Punkt, der ehrlich benannt gehört: die Schutzbedingung ist ungeprüft

Der Bericht weist aus, wie viele Zeilen **alt genug wären, aber vom Schutz
gehalten werden.** Dieser Wert ist überall **0** — und zwar nicht, weil der
Schutz greift, sondern weil `geo_events` und `offline_queue` leer sind. Die
beiden Schutzbedingungen sind damit **live noch nie wirksam geworden**:

- `geo_events`: nur Ereignisse **ohne** `service_record_id` werden entfernt.
  Der Filter prüft `IS NULL` und nicht `= NULL` — als `eq` wäre er wirkungslos
  und der Lauf würde **alle** alten Ereignisse löschen, auch die mit Beleg.
  Das ist im Modul korrekt gebaut und durch Tests gedeckt, aber **an echtem
  Bestand nicht gemessen**.
- `offline_queue`: nur `synced` und `failed` werden entfernt; `pending` und
  `conflict` sind Arbeit, die den Server nie erreicht hat.

**Konsequenz:** Für die Perimeter-Tabellen ist der Trockenlauf
aussagekräftig — dort gibt es Bestand, und es gibt keine Schutzbedingung, die
etwas zurückhalten müsste. Für die beiden Betriebstabellen beweist er nichts
außer „heute ist da nichts". Sobald der erste Einsatz mit Standorterfassung
läuft, sollte der Bericht **erneut** gefahren werden, **bevor**
`AUFBEWAHRUNG_AKTIV=1` gesetzt wird.

---

## Ausdrücklich ohne automatische Frist

Fünf Tabellen bekommen bewusst keine Frist — „wird nicht gelöscht" ist hier
eine hinterlegte Entscheidung und kein Vergessen: `lead_inquiries`,
`newsletter_subscribers`, `personal_audit_log`, `service_records`,
`security_audit_log`. Die Begründungen stehen im vollständigen Ausdruck unten
und in `lib/aufbewahrung/katalog.ts`.

Besonders relevant für die Produktionsabnahme: **`service_records` ist
ausgenommen** (§ 147 AO, § 257 HGB) — was für Option B im Dokument
`RE-2026-0001_68EUR_ANALYSE_2026-08-31.md` eine ausdrückliche Entscheidung
verlangt.

---

## Empfehlung zur Freischaltung

`AUFBEWAHRUNG_AKTIV=1` ist aus Sicht dieses Berichts **vertretbar** — mit
einer Einschränkung:

1. Die 6.947 Löschkandidaten sind ausnahmslos Website-Reichweitendaten,
   mindestens 90 Tage alt. Kein Beleg, kein Nachweis, keine Pflegedokumentation
   ist betroffen.
2. Die 12.230 IP-Kürzungen sind die eigentliche datenschutzrechtliche
   Verbesserung und wirken sofort.
3. **Einschränkung:** Der erste scharfe Lauf ist unumkehrbar. Vor dem
   Einschalten sollte feststehen, dass die Reichweitenauswertung keinen
   Jahresvergleich über 90 Tage hinaus braucht — das ist eine
   Betriebsentscheidung, keine gesetzliche Frist, und sie ist über
   `AUFBEWAHRUNG_VISITORS_TAGE` etc. jederzeit stellbar, **bevor** der Lauf
   scharf wird. Danach nicht mehr.

Diese Entscheidung wird hier nicht getroffen.

---

## Vollständiger Ausdruck des Laufs

```
> NODE_OPTIONS="--require ./scripts/test-stubs/server-only-stub.cjs" tsx scripts/aufbewahrung-trockenlauf-bericht.mjs

═══════════════════════════════════════════════════════════════════
 AUFBEWAHRUNG — TROCKENLAUF-BERICHT
 Erzeugt: 2026-08-31T10:19:41.835Z
 Es wurde NICHTS geloescht und NICHTS geaendert — nur gelesen.
═══════════════════════════════════════════════════════════════════

── visitors  [perimeter]
   Frist            90 Tage (vorgabe, AUFBEWAHRUNG_VISITORS_TAGE)
   Zeitspalte       created_at
   Bestand gesamt   3498 Zeilen
   Aeltester        2026-03-09T16:17:59.958774+00:00  (174 Tage, id 1)
   Stichtag         alles vor 2026-06-02T10:19:41.835Z
   WUERDE GELOESCHT 2450 Zeilen
                    · 1  2026-03-09T16:17:59.958774+00:00  (174 Tage)
                    · 2  2026-03-09T16:18:00.398346+00:00  (174 Tage)
                    · 3  2026-03-09T16:18:47.505108+00:00  (174 Tage)
                    · 4  2026-03-09T16:18:48.131881+00:00  (174 Tage)
                    · 5  2026-03-09T16:20:13.084113+00:00  (174 Tage)
                    … und 2445 weitere
   IP-Kuerzung      3318 Zeilen (Spalte ip, 7 Tage, vor 2026-08-24T10:19:41.835Z)
   Regel            Reichweitenmessung der oeffentlichen Website. Die volle IP wird nur fuer die Geo-Aufloesung und den Besucher-Alarm gebraucht — beides geschieht im Request selbst. Nach einer Woche hat sie keinen Zweck mehr.

── visitor_locations  [perimeter]
   Frist            90 Tage (vorgabe, AUFBEWAHRUNG_VISITOR_LOCATIONS_TAGE)
   Zeitspalte       created_at
   Bestand gesamt   3957 Zeilen
   Aeltester        2026-03-15T12:11:44.394814+00:00  (168 Tage, id 694f8bc6-4fef-4c8d-8058-9a7322b55742)
   Stichtag         alles vor 2026-06-02T10:19:41.835Z
   WUERDE GELOESCHT 2211 Zeilen
                    · 694f8bc6-4fef-4c8d-8058-9a7322b55742  2026-03-15T12:11:44.394814+00:00  (168 Tage)
                    · 2c68e278-3139-43c5-850d-b84baf15becb  2026-03-15T12:14:02.643967+00:00  (168 Tage)
                    · fa2a2afb-9af9-4dbf-99e1-65aa5a898416  2026-03-15T12:15:46.973723+00:00  (168 Tage)
                    · bdfb5091-4822-4113-932d-8cea867726e8  2026-03-15T12:16:01.01439+00:00  (168 Tage)
                    · 5339a467-e506-436d-ba49-4fea6012f923  2026-03-15T12:19:41.813901+00:00  (168 Tage)
                    … und 2206 weitere
   IP-Kuerzung      2670 Zeilen (Spalte ip_address, 7 Tage, vor 2026-08-24T10:19:41.835Z)
   Regel            Wie visitors, zusaetzlich mit Portalbezug. ACHTUNG: die Zeilen mit user_id sind zusaetzlich ueber den Loeschkatalog an die Kontoloeschung gebunden (Track 13 B4) — diese Frist ersetzt das nicht, sie greift nur frueher.

── page_views  [perimeter]
   Frist            90 Tage (vorgabe, AUFBEWAHRUNG_PAGE_VIEWS_TAGE)
   Zeitspalte       viewed_at
   Bestand gesamt   8861 Zeilen
   Aeltester        2026-03-26T21:41:35.203+00:00  (157 Tage, id 141b3a44-e58a-43f5-850c-b7b0a0c1a0ef)
   Stichtag         alles vor 2026-06-02T10:19:41.835Z
   WUERDE GELOESCHT 2286 Zeilen
                    · 141b3a44-e58a-43f5-850c-b7b0a0c1a0ef  2026-03-26T21:41:35.203+00:00  (157 Tage)
                    · 5c7f1748-533d-4b7d-8a9f-45537d34c0dd  2026-03-26T21:42:12.372+00:00  (157 Tage)
                    · 3f3ab748-d13a-4e60-ba5f-2fb89949d147  2026-03-26T21:45:13.223+00:00  (157 Tage)
                    · 8a3b382c-7ea4-4e3d-a9c8-01c0db230b4c  2026-03-26T21:45:13.282+00:00  (157 Tage)
                    · a61f1d3b-02f5-4328-b6b4-a81a4a3c91e4  2026-03-26T21:45:13.343+00:00  (157 Tage)
                    … und 2281 weitere
   IP-Kuerzung      6212 Zeilen (Spalte ip_address, 7 Tage, vor 2026-08-24T10:19:41.835Z)
   Regel            Seitenaufrufe aus allen Portalen. Der groesste Bestand des Perimeters (live 8315 Zeilen, 6632 mit IP, 2033 verschiedene). ACHTUNG Zeitspalte: `viewed_at`, NICHT `created_at` — die Tabelle hat keine. Die Zeilen mit user_id haengen zusaetzlich ueber den Loeschkatalog an der Kontoloeschung.

── analytics_events  [perimeter]
   Frist            180 Tage (vorgabe, AUFBEWAHRUNG_ANALYTICS_EVENTS_TAGE)
   Zeitspalte       created_at
   Bestand gesamt   5324 Zeilen
   Aeltester        2026-08-12T08:06:19.190534+00:00  (19 Tage, id a60f3af4-eee0-4485-ae21-eca910b2ddb0)
   Stichtag         alles vor 2026-03-04T10:19:41.835Z
   WUERDE GELOESCHT 0 Zeilen
   Regel            Web-Vitals (Ladezeiten je Seitenpfad). Enthaelt keinen direkten Personenbezug — der user_agent ist der staerkste Wert. Laengere Frist als bei visitors, weil ein Jahresvergleich der Ladezeiten fachlich Sinn ergibt.

── conversions  [perimeter]
   Frist            365 Tage (vorgabe, AUFBEWAHRUNG_CONVERSIONS_TAGE)
   Zeitspalte       created_at
   Bestand gesamt   40 Zeilen
   Aeltester        2026-04-16T12:07:02.015855+00:00  (136 Tage, id 1)
   Stichtag         alles vor 2025-08-31T10:19:41.835Z
   WUERDE GELOESCHT 0 Zeilen
   IP-Kuerzung      30 Zeilen (Spalte ip, 30 Tage, vor 2026-08-01T10:19:41.835Z)
   Regel            Server-seitige Conversion-Erfassung fuer den Offline-Import zu Google Ads. E-Mail und Telefon liegen bereits nur als SHA-256 vor; die IP dagegen roh — sie wird fuer den Import gar nicht gebraucht und faellt nach 30 Tagen. Die Zeile selbst bleibt ein Jahr, damit Jahresvergleiche der Werbewirkung moeglich sind. BETRIEBSENTSCHEIDUNG, keine gesetzliche Frist.

── geo_events  [betrieb]
   Frist            14 Tage (vorgabe, AUFBEWAHRUNG_GEO_EVENTS_TAGE)
   Zeitspalte       created_at
   Bestand gesamt   0 Zeilen
   Aeltester        — (Tabelle leer)
   Stichtag         alles vor 2026-08-17T10:19:41.835Z
   WUERDE GELOESCHT 0 Zeilen
   Schutz haelt     0 Zeilen zurueck, die alt genug waeren
                    Grund: Nur Ereignisse ohne Leistungsnachweis werden entfernt. Ein geo_event an einem service_record ist der Standortbeleg einer abzurechnenden Leistung; 14 Tage sind kuerzer als ein Abrechnungszeitraum, und ein geloeschter Beleg laesst sich nicht wiederherstellen.
   Regel            Check-in/Check-out-Punkte der Einsatz-App (Breitengrad, Laengengrad, Genauigkeit, Abstand zum Klienten). Ein Bewegungsprofil der Mitarbeitenden — deshalb kurz. Live 0 Zeilen (31.08.2026), die Frist greift also ab dem ersten Einsatz mit Standorterfassung. BETRIEBSENTSCHEIDUNG.

── offline_queue  [betrieb]
   Frist            30 Tage (vorgabe, AUFBEWAHRUNG_OFFLINE_QUEUE_TAGE)
   Zeitspalte       created_at
   Bestand gesamt   0 Zeilen
   Aeltester        — (Tabelle leer)
   Stichtag         alles vor 2026-08-01T10:19:41.835Z
   WUERDE GELOESCHT 0 Zeilen
   Schutz haelt     0 Zeilen zurueck, die alt genug waeren
                    Grund: Nur uebertragene (`synced`) und endgueltig gescheiterte (`failed`) Eintraege werden entfernt. `pending` und `conflict` sind Aenderungen, die den Server nie erreicht haben — sie zu loeschen hiesse, die Arbeit einer Kollegin wegzuwerfen, weil die Synchronisation nicht durchkam.
   Regel            In der App gepufferte Aenderungen (Nutzlast als JSON, Geraetekennung, Nutzer). Nach der Uebertragung ist der Inhalt in der Zieltabelle und hier nur noch eine Kopie — eine Kopie, die Gesundheits- und Zeitdaten mitfuehrt. Live 0 Zeilen (31.08.2026). BETRIEBSENTSCHEIDUNG.

═══════════════════════════════════════════════════════════════════
 SUMME:  6947 Zeilen wuerden geloescht · 12230 IP-Adressen gekuerzt
         0 Zeilen sind alt genug, werden aber vom Schutz gehalten
═══════════════════════════════════════════════════════════════════

AUSDRUECKLICH OHNE AUTOMATISCHE FRIST:
  · lead_inquiries
      Eine Beratungsanfrage ist eine geschaeftliche Willenserklaerung („bitte rufen Sie mich an"), kein Messwert. Wann sie erledigt ist, entscheidet die Bearbeitung im CRM (status: converted/lost), nicht ein Kalender. Eine hier erfundene Frist wuerde offene Anfragen loeschen. Der richtige Ort fuer die Entscheidung ist die CRM-Pflege.
  · newsletter_subscribers
      Die abgemeldete Zeile IST der Nachweis, dass dem Widerspruch entsprochen wurde (Art. 21 DSGVO), und gleichzeitig die Sperrliste, die eine Wiederaufnahme derselben Adresse verhindert. Sie zu loeschen wuerde beides zerstoeren und die Person erneut anschreibbar machen.
  · personal_audit_log
      Revisionsspur des Personalbereichs. Sie ist per Trigger unveraenderlich („HR-Audit-Log ist unveraenderlich (Revisionssicherheit)") — eine Loeschfrist waere ein Widerspruch zu genau der Eigenschaft, wegen der sie gefuehrt wird. Ihre Frist ergibt sich aus der Aufbewahrungspflicht der Personalakte und gehoert nicht in einen naechtlichen Lauf.
  · service_records
      Leistungsnachweise sind Rechnungsgrundlage und unterliegen der handels- und steuerrechtlichen Aufbewahrung (§ 147 AO, § 257 HGB). Ein unterschriebener Nachweis ist zudem `is_locked` und laesst sich nicht einmal aendern. Hier entscheidet kein Kalender, sondern die Aufbewahrungspflicht.
  · security_audit_log
      Fuehrt bereits eine eigene Bereinigung mit (`security_audit_log_aufraeumen`, Migration 20261018000002). Eine zweite Frist daneben waere eine zweite Antwort auf dieselbe Frage.

Scharf schalten: AUFBEWAHRUNG_AKTIV=1 setzen. Bis dahin zaehlt der
Cron-Lauf nur — dieser Bericht ist dasselbe, nur ausfuehrlicher.
```
