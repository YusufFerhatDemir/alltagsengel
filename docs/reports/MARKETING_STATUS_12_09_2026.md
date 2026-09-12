# Marketing-Status — 12.09.2026

Erhoben aus Primärquellen: Plandateien unter `docs/marketing/` über
`ladeContentKatalog()`, die Live-Tabellen `marketing_content_status`,
`email_templates`, `lead_inquiries` und `state_waitlist` (Projekt
`nnwyktkqibdjxgimjyuq`, Dienstschlüssel, nur lesend). Reproduzierbar mit
`npx tsx --require ./scripts/test-stubs/server-only-stub.cjs scripts/marketing-status-12-09.ts`.
Kein Versand, keine Datenänderung.

## 1. Content-Katalog — 54 Stücke, alle datiert

| Kennzahl | Wert |
|---|---|
| Stücke gesamt | **54** |
| mit Datum | **54** (100 %) |
| überfällig (Datum vor 12.09.) | **5** |
| heute fällig (12.09.) | **4** |
| künftig | 45 |
| Abschnitte, die das Format nicht traf | 2 (werden nicht verschluckt, sondern gezählt) |

Gelesene Dateien (4 von 11 unter `docs/marketing/` — die übrigen sind Strategie-
und Analysetexte ohne Postformat):

| Datei | Stücke |
|---|---|
| `CONTENTPLAN_30_TAGE_09_10_2026_V2.md` | 23 |
| `CONTENTPLAN_14_TAGE_09_2026_V2.md` | 12 |
| `RECRUITING_KAMPAGNEN_09_2026_V2.md` | 12 |
| `SOCIAL_MEDIA_7_POSTS_09_2026.md` | 7 |

**Zum Auftrag:** Die Annahme „K01 war für gestern (11.09.)“ trifft so nicht zu.
Der Katalog kennt keine Nummern `K01`; die Stücke heißen `Post 01`, `Tag 1`,
`Kampagne 1`. Der Plan beginnt am **10.09.**, nicht am 11.09. — überfällig sind
deshalb **fünf** Stücke, nicht eines.

## 2. Bearbeitungsstand (`marketing_content_status`) — nichts geführt

| Status | Anzahl |
|---|---|
| veröffentlicht | **0** |
| geplant | **0** |
| offen (Zeile vorhanden) | **0** |
| verworfen | 0 |
| ohne Zeile (gilt als offen) | **54** |

Die Tabelle steht live (Migration `20261103000000`), enthält aber keine einzige
Zeile. Das heißt: **kein Stück ist als veröffentlicht markiert.** Ob tatsächlich
schon etwas gepostet wurde, weiß das System nicht — der Stand wird erst
geführt, sobald jemand in `/admin/marketing-content` den Schalter benutzt.
Belegt ist damit nur: aus dieser Anwendung heraus wurde nichts veröffentlicht.

## 3. E-Mail-Vorlagen — 16/16, alle Prüfungen bestanden

| Prüfung | Ergebnis |
|---|---|
| Vorlagen in `email_templates` | **16** von 16 im Katalog, keine fehlt |
| `ANERKENNUNG_45A_LIEGT_VOR` | **false** (Sperre scharf) |
| §45a-Verstöße (Abrechnungszusage) | **0** |
| Nennungen von 125 € | **0** |
| ohne `{{abmeldelink}}` | **0** |
| `pruefeVorlage()` rot | **0** |

Der Entlastungsbetrag steht in den Vorlagen als Platzhalter
`{{entlastungsbetrag}}` (3 Vorlagen), gefüllt aus `ENTLASTUNG_MONATLICH_EUR`
= **131 €**. Ein hart geschriebener Betrag existiert nicht — genau deshalb kann
er nicht veralten.

## 4. Fälligkeiten — was liegt an

### Überfällig (5)

| Datum | Stück | Plattform | Titel |
|---|---|---|---|
| 10.09. | Post 01 | Instagram (Carousel) | Was ist Alltagsbegleitung? |
| 10.09. | Tag 1 | Instagram Feed + Facebook | „131 € im Monat — und die meisten wissen es nicht“ |
| 10.09. | Post 1 | Instagram Feed + Facebook | Alltagsbegleitung allgemein |
| 11.09. | Post 02 | Facebook | Entlastungsbetrag erklärt |
| 11.09. | Tag 2 | Instagram Reels, TikTok, FB Reels | „Ein Tag mit einem Alltagsengel“ |

### Heute fällig (12.09.)

| Stück | Plattform | Titel |
|---|---|---|
| Post 03 | Instagram (Reel) | Team-Einblick: Unsere Schulung |
| Tag 3 | Instagram Feed | „Wir suchen Alltagsbegleiter:innen in Frankfurt & Umgebung“ |
| Kampagne 1 | Instagram + Facebook | Quereinsteiger Frankfurt & Offenbach |
| Post 2 | Instagram Reel | Pflegegrad-Aufklärung — „Ab Pflegegrad 1 …“ |

### Diese und nächste Woche

| Woche | Stücke | Ziel (`ZIEL_PRO_WOCHE`) |
|---|---|---|
| KW 37 (08.–14.09.) | **12** | 5 |
| KW 38 (15.–21.09.) | **14** | 5 |
| KW 39 (ab 21.09.) | 10 | 5 |
| KW 40 (ab 28.09.) | 7 | 5 |

Der Plan ist damit **doppelt bis dreifach über der eigenen Zielfrequenz** —
nicht, weil viel geplant wurde, sondern weil vier Pläne parallel laufen und
sich auf denselben Tagen überlagern (am 12.09. vier Stücke von drei Plänen).
Wer alle vier Pläne abarbeitet, postet an einem Tag viermal.

**Redaktionsvorbehalt:** 1 Stück trägt einen Hinweis, der nicht mitgepostet
werden darf — „Post 7 / Kundenstimmen-Vorlage“: beispielhafte Stimmen, echte
nur nach schriftlicher Einwilligung.

## 5. Herkunft der Leads

| Anzahl | Quelle (`source`) | `utm_source` |
|---|---|---|
| 25 | engel-bewerbung | — |
| 8 | engel-bewerbung | google_jobs_apply |
| 8 | rueckruf | — |
| 3 | engel-bewerbung | chatgpt.com |
| 2 | alltagsbegleitung-darmstadt | — |
| 2 | terminbuchung | — |
| 1 | alltagsbegleitung-hanau | — |
| 1 | alltagsbegleitung-aschaffenburg | — |

**50 Leads, davon 11 mit `utm_source` (22 %).** Bemerkenswert: Die einzigen
belegten Kanäle sind `google_jobs_apply` (8) und `chatgpt.com` (3) — beide im
Recruiting. Für die Kundenseite ist **kein einziger** Kanal belegt.

`state_waitlist`: **0 Zeilen.** Die Warteliste hat bis heute keine echte
Eintragung; der Funnel selbst ist am 11.09. mit einem Testdatensatz
durchgemessen und belegt worden (Bestätigungsmail zugestellt, Datensatz
gelöscht).

Die Attributionslücke ist seit heute (Commit `e22d0f09`) geschlossen: Alle
sechs Formulare senden jetzt die Herkunft, auch wenn sie erst auf einer
späteren Seite abgesendet werden. Die 22 % sind also der Stand **vor** dem Fix
und die Vergleichsbasis für die nächsten Wochen.

## Was daraus folgt

1. **Veröffentlichen ist Handarbeit und hängt.** Fünf Stücke sind überfällig,
   vier weitere fällig heute. Das System kann nicht posten — es kann nur den
   Stand führen, und auch das tut bisher niemand (0 von 54 Zeilen).
2. **Die Planüberlagerung gehört entschieden.** Vier Pläne auf denselben Tagen
   ergeben 12–14 Stücke pro Woche bei Ziel 5. Welcher Plan führt, ist eine
   Geschäftsentscheidung, keine Codefrage.
3. **Kundenseitige Kanäle sind unbelegt.** Ohne UTM in den Anzeigen lässt sich
   nicht sagen, was wirkt. Ab jetzt wird gemessen.
4. **Die Vorlagen sind versandfertig und rechtlich sauber**, aber es existiert
   keine Kampagne und keine Empfängerliste — der nächste Schritt ist eine
   Einwilligungsbasis, nicht mehr Text.
