# MASTER EXECUTION TRUTH — 12.09.2026 (FINAL)

**Alltagsengel UG (haftungsbeschränkt) · Frankfurt am Main**
**Stand:** 12.09.2026, 04:00 Uhr · **Gültigkeit:** löst alle vorherigen Truth-States ab

> **Regel dieses Berichts:** Jede Zahl darin ist in dieser Sitzung aus einer Primärquelle
> gezogen — Testlauf, `git log`, Live-`curl`, Supabase-Abfrage oder visuell geprüftes
> Dokument. Wo eine im Auftrag genannte Zahl von der gemessenen abweicht, steht die
> gemessene, und die Abweichung wird benannt. Übernommene Reportwerte ohne eigene
> Messung sind als solche markiert.

---

## 1. Executive Summary

Drei Produkte, drei grüne Testsuiten, **14.683 Tests** ohne einen einzigen Fehlschlag. Die
Technik ist nicht das Problem.

Das Problem ist der Rückstand im Posteingang und die Genehmigungsmappe.

**50 offene Leads. 37 davon liegen seit über sieben Tagen. Der älteste seit 58 Tagen.**
Darunter vier echte Kundenanfragen — Menschen, die Betreuung für Angehörige gesucht und
keine Antwort bekommen haben. Das ist kein Softwarefehler, das ist verlorener Umsatz und
ein Reputationsrisiko. Die Follow-up-Maschine, die genau das künftig verhindert, steht
seit heute — sie hat aber **noch nie gefeuert**, weil `CRON_SECRET` in Vercel nicht gesetzt
ist. Ein einzelner fehlender Wert trennt eine gebaute Funktion von einer wirkenden.

Bei der §45a-Anerkennung sind seit heute zwei Dinge gesichert und eine Sache unangenehm:
Die Mappe ist visuell Blatt für Blatt geprüft (26 Scans), die Anerkennung wird nirgends
mehr fälschlich behauptet (Scanner über 1.600 Dateien, 0 Befunde, in CI verdrahtet).
Unangenehm ist: **12 bereits unterschriebene Anträge an andere Bundesländer enthalten die
Behauptung, wir seien bereits anerkannt.** Das ist gegenüber Behörden eine unrichtige
Angabe und braucht eine Richtigstellung.

Drei Sicherheitsbefunde sind gefunden, zwei davon **nicht behoben** — die Migrationen sind
geschrieben, aber nicht angewendet, weil DDL aus der Agent-Sitzung heraus nicht möglich ist.

---

## 2. Änderungen seit dem letzten Truth State (12.09.2026, früher Stand)

| Bereich | Vorher | Jetzt | Beleg |
|---|---|---|---|
| Follow-up-Leiter | 24/48/72 h | **+ 7-Tage-Stufe „verschleppt"** | `105b94b8` |
| Posteingang | Liste | **KPI-Kacheln + Ampel/Art/Anliegen-Filter + Rückruf/Termin-Chips** | `105b94b8`, `f6465b6f` |
| Bewerber-ATS | ohne Filter | **Region, Qualifikation, Arbeitsmodell** | `105b94b8` |
| §45a-Prüfung | manuell | **Scanner über 1.600 Dateien, in CI** | `105b94b8` |
| SEO | ungeprüft | **182 URLs live vermessen, 2 Orphan-Silos behoben** | `2b708e75` |
| Genehmigungsmappe | Dateiliste | **26 Scans visuell geprüft, 9 Befunde** | `915509d7` |
| Preise | widersprüchlich verstreut | **PRICE_SOURCE_OF_TRUTH.md** | `a64e28a7` |

**Neu und vorher unbekannt:** ESLint läuft in CI mit `|| true` und wird damit stillgelegt
(siehe Abschnitt 17).

---

## 3. Alltagsengel Tech — Prüfstand

| Prüfung | Ergebnis | Exit |
|---|---|---|
| `tsc --noEmit` | keine Fehler | **0** |
| `vitest run` | 470 Dateien, **10.324 Tests** bestanden, 38 übersprungen | **0** |
| `npm run test:unit` (node:test) | 286 Suiten, **2.770 Tests** bestanden, 0 fehlgeschlagen | **0** |
| `lint:forbidden` · `lint:org-id` · `lint:route-auth` | je 0 Befunde | **0** |
| `lint:ladefehler` · `lint:leerzustand` · `lint:client-bundle` | je 0 Befunde | **0** |
| `lint:rls-sicht` · `lint:45a` | je 0 Befunde | **0** |
| `npm run lint` (ESLint) | **12 Fehler, 1 Warnung** | **1** |

**Abweichung zum Auftrag:** Dort stehen 10.320 Tests — gemessen sind es **10.324**. Die
vier zusätzlichen sind `__tests__/seo/footer-linkgraph.test.ts` aus Commit `2b708e75`.

**Commits heute (alle auf `main`, Remote synchron):**

```
2b708e75  SEO: /leistungen und /haushaltshilfe aus der Verwaisung geholt + Linkgraph-Test
f6465b6f  Posteingang: Rueckrufe und Terminwuensche als Filter
105b94b8  Track F: 7-Tage-Eskalation, Posteingang-Kennzahlen, ATS-Filter, §45a-Lint
915509d7  Track A: Genehmigungsdokumente visuell geprueft — Matrix + Checklisten aktualisiert
a64e28a7  feat(marketing): Master-Redaktionsplan KW37-38 + PRICE_SOURCE_OF_TRUTH erstellt
```

---

## 4. Kundenfunnel

**4 echte Kundenanfragen**, alle **CALL_REQUIRED**, alle mit fertigem Antwortentwurf
(Absender durchgängig „Alltagsengel", keine persönlichen Namen — Hausregel eingehalten).

Dazu **8 Rückruf-Leads ohne Inhalt** (NEEDS_CLASSIFICATION): Formular ohne Freitext, eine
Einordnung ist ohne Telefonat nicht möglich. Plus 2 Terminwünsche. Zusammen **14 offene
Anfragen** in der Live-Zählung.

Alle vier Anfragen sind über die **Stadtseiten** gekommen (Darmstadt, Aschaffenburg) oder
über das Rückruf-Formular. Die Kanaltrennung Kunde/Bewerber funktioniert sauber: Kunden und
Bewerber kommen nie über dasselbe Formular.

---

## 5. Bewerberfunnel

**35 aktive Bewerber** (+1 auf der Blockliste = 36 in der Live-Zählung), klassifiziert in:

| Stufe | Anzahl | Bedeutung |
|---|---|---|
| **PRIO 1** | **7** | Qualifiziert mit Berufserfahrung — sofort anrufen |
| PRIO 2 | 16 | Gute Eignung / Quereinsteiger |
| PRIO 3 | 12 | Zu wenig Informationen — nachfassen |

**ATS-Filter gebaut** (`105b94b8`): Region, Qualifikation, Arbeitsmodell. Die Pipeline hat
8 Stufen und liegt in `bewerbung_daten.pipeline` (jsonb) — bewusst ohne Migration, weil DDL
aus der Sitzung heraus nicht möglich ist.

**Kanal-Erkenntnis:** 8 von 35 Bewerbungen kamen über `google_jobs_apply`, 3 über
`chatgpt.com`. 25 haben **kein** UTM — der größte Kanal ist ein blinder Fleck.

---

## 6. Aktuelle Kundenanfragen

| Prio | Name | Anliegen | Wartet seit | Status |
|---|---|---|---|---|
| 🔴🔴🔴 | **MantheyIckenroth** | Alltagsbegleitung Darmstadt | **800 h ≈ 34 Tage** | CALL_REQUIRED |
| 🔴🔴 | **Uwe Büttner** | Verhinderungspflege / Demenz | **1.019 h ≈ 43 Tage** | CALL_REQUIRED |
| 🔴🔴 | **Maike Reichert** | mehrfache Terminversuche (Dublette) | — | CALL_REQUIRED (sofort) |
| 🔴 | **Darleen Suhe** | Alltagsbegleitung Darmstadt | **1.406 h ≈ 59 Tage** | CALL_REQUIRED |

Maike Reichert hat **mehrfach** versucht, einen Termin zu bekommen, und jedes Mal keine
Reaktion erhalten. Das ist der Fall mit dem höchsten Eskalationsrisiko — unabhängig vom
Alter des Eintrags.

---

## 7. Bewerber-Pipeline — Spitze

| # | Name | PLZ | Qualifikation | Erfahrung | Nächster Schritt |
|---|---|---|---|---|---|
| 1 | **Claudia Adjovi** | 63739 (Aschaffenburg) | Sozialbetreuerin + Pflegefachhelferin | **8 Jahre** | **Sofort anrufen** — Top-Kandidatin |
| 2 | Francesca Lorena Potočan | — | PRIO 1 | — | anrufen |
| 3 | Marcel Sauer | — | PRIO 1 | — | anrufen |
| 4 | michelle Gruber | — | PRIO 1 | — | anrufen |

Claudia Adjovi ist mit 8 Jahren Berufserfahrung im Bereich die einzige Bewerberin, die die
PfluV-Fachkraftanforderung eigenständig stützen könnte. Sie wartet unbearbeitet.

---

## 8. Marketing

| Kennzahl | Wert | Quelle |
|---|---|---|
| Content-Stücke im Katalog | **54** (4 Plandateien) | Katalog-Auswertung |
| davon mit Datum | 54 / 54 | — |
| überfällig / heute / künftig | 5 / 4 / 45 | — |
| **`marketing_content_status`-Zeilen** | **0 von 54** | Supabase |
| E-Mail-Vorlagen | 16 in DB = 16 im Katalog, keine fehlt | Supabase |
| §45a-Verstöße in Vorlagen | **0** | Scanner |
| 125-€-Nennungen | **0** | Scanner |
| Vorlagen ohne Abmeldelink | **0** | Scanner |

**Der Redaktionsplan existiert, die Ausführung ist nicht nachvollziehbar.** Kein einziges
der 54 Stücke hat eine Statuszeile. Ob etwas veröffentlicht wurde, ist aus dem System nicht
ablesbar — nur aus den Kanälen selbst.

### Preis-Widerspruch (BUSINESS_DECISION_REQUIRED)

| Quelle | Billing Rate | Marge/h | Marge % |
|---|---|---|---|
| `lib/mis/constants.ts` (kanonisch) | **35 €/h** | 15 €/h | 43 % |
| `app/investor/en/market-analysis/` | ~40 €/h | ~20 €/h | ~50 % |
| `app/investor/en/financial-projections/` | ~40 €/h | ~20 €/h | ~50 % |
| `app/investor/en/executive-summary/` | 35–40 €/h | ~20 €/h | ~50 % |
| `app/investor/finanzplan/` | ~40 €/h | — | — |

**Vier Investorenseiten widersprechen der Code-Konstante.** Das ist der eine Widerspruch,
der nach außen zeigt. Solange er offen ist, darf keine dieser Zahlen in neues Material.
Nachgelagert: `billing_tariffs` führt §45b-Tarife mit 35 €/h, die **PfluV Hessen deckelt
bei 30 €/h** (Betreuung) bzw. 25 €/h (Hauswirtschaft) — die Tarife stehen deshalb auf
`blocked` und müssen **vor** Freischaltung angepasst werden.

Weiterer offener Punkt: Recruiting-Altmaterial nennt 12–18 €/Std., der Code 20 €/h.

---

## 9. SEO

| Prüfung | Ergebnis |
|---|---|
| Sitemap-URLs live geprüft | **182 / 182 → HTTP 200** |
| Self-referential Canonicals | **186 / 186** |
| JSON-LD-Blöcke, fehlerfrei geparst | **186 / 186** |
| `noindex` / `X-Robots-Tag` | **0** |
| Exakte Titel- oder Description-Dubletten | **0** |
| genau ein `h1` je Seite | 186 / 186 |

**Die technische Basis ist sauber.** Gefunden wurden zwei Verlinkungsfehler und eine
Textbaustelle:

| # | Befund | Zustand |
|---|---|---|
| 1 | `/leistungen` hatte **1** internen Link (von 186 Seiten) | **behoben** (`2b708e75`) |
| 2 | `/haushaltshilfe` hatte **0** Links außerhalb des eigenen Silos | **behoben** (`2b708e75`) |
| 3 | Near-Duplicate-Descriptions auf **65 Stadtseiten** (bis 96,3 % identisch) | offen |
| 4 | 76 Titel > 60 Zeichen, 55 Descriptions > 160 Zeichen | offen |
| 6 | Keyword-Kollision `/pflegebox` ↔ `/hygienebox` | offen, Entscheidung nötig |

Befund 1 und 2 brauchten **keine neue Seite** — zwei Footer-Zeilen. Der Regressionstest
`__tests__/seo/footer-linkgraph.test.ts` hält die Regel fest und wurde mit Gegenprobe
belegt (Zeile entfernt → 3 von 4 Fällen rot).

---

## 10. Genehmigung — §45a Hessen

**26 Scans visuell geprüft** (nicht nur Dateinamen gelesen, sondern Seite für Seite
gerendert und angesehen). Ergebnis: 4 Dokumente amtlich/verifiziert, 9 unterschriftsreif,
3 mit fehlenden Feldern, 1 fehlt komplett.

---

## 11. Dokumentenmatrix

| Dokument | Status | Nächste Aktion |
|---|---|---|
| Berufserlaubnis Sabrina Martin | **VERIFIED_SIGNED** | keine |
| Erweitertes Führungszeugnis Yusuf (20.07.2026) | **VERIFIED_SIGNED** | keine |
| IK-Bestätigung 460629986 (21.07.2026) | **VERIFIED_LIVE** | keine |
| Handelsregisterauszug HRB 140351 | **VERIFIED_LIVE** | keine |
| Betriebshaftpflicht Generali (10 Mio. €) | **VERIFIED_LIVE** | Versicherungsnehmer klären |
| Erhebungsbogen (eigene Fassung) | VERIFIED_UNSIGNED | unterschriebenen Scan einlegen |
| Anschreiben Hessen | VERIFIED_UNSIGNED | unterschriebenen Scan einlegen |
| Leistungskonzept (8 S.) | VERIFIED_UNSIGNED | Unterschrift S. 8 |
| Schulungskonzept | VERIFIED_UNSIGNED | 2 Unterschriften (GF + Fachkraft) |
| Erklärung Führungszeugnisse | VERIFIED_UNSIGNED | Unterschrift |
| Erklärung SV/Mindestlohn | VERIFIED_UNSIGNED | Unterschrift |
| Datenschutzkonzept | VERIFIED_UNSIGNED | Unterschrift |
| Einverständnis Veröffentlichung | VERIFIED_UNSIGNED | Unterschrift |
| **Arbeitsvertrag Sabrina** | **FIELD_MISSING** | Beginn, Wochenstunden, Vergütung, Adresse leer |
| **Leistungs-/Kostenübersicht** | **FIELD_MISSING** | nennt 30,00 €/Std. — Preisentscheidung nötig |
| **Schweigepflichterklärung** | **FIELD_MISSING** | Name, Geburtsdatum, Wohnort leer |
| **Erhebungsbogen der Stadt Frankfurt** | **DOCUMENT_MISSING** | echtes Formular beschaffen |
| Gewerbeanmeldung | **SUBMITTED_AWAITING_CONFIRMATION** | Eingangsbestätigung sichern |

**Wichtige Einordnung:** Die unterschriebenen Fassungen existieren — 12 Anträge an andere
Bundesländer tragen Tinten-Unterschriften vom 16.07.2026. Für die **Hessen-Mappe** wurde
auf diesem Rechner keine unterschriebene Fassung gefunden. „VERIFIED_UNSIGNED" heißt
deshalb: *die Repo-Kopie* ist unsigniert, nicht *es fehlt eine Unterschrift*.

---

## 12. Gewerbeanmeldung

**Status: SUBMITTED_AWAITING_CONFIRMATION** (online eingereicht, Bestätigung ausstehend).

Auf dem Rechner existiert dazu **kein Beleg**: keine Eingangsbestätigung, kein
Zahlungsbeleg, kein Screenshot, keine E-Mail-Datei. Vorhanden sind die Vorbereitung
(`Gewerbeanmeldung_Alltagsengel_UG_Vorbereitung.docx`, 13.07.2026) und eine
Sachstandsanfrage (09.09.2026). Ein Postfachzugriff war nicht möglich.

Der Status stützt sich allein auf Ihre Angabe. Für die Behördenmappe braucht es einen
Beleg — die Eingangsbestätigung reicht.

---

## 13. §45a Anerkennungsstatus

| Ebene | Wert |
|---|---|
| **Intern (Erwartung)** | ERWARTET — Verfahren läuft |
| **Extern (Code-Flag)** | `ANERKENNUNG_45A_LIEGT_VOR = false` |
| **Sprachregelung** | „im Anerkennungsverfahren" — **nie** „anerkannt" |
| **Scanner** | 1.600 Dateien geprüft, **0 Befunde** |
| **CI** | `lint:45a` verdrahtet (ci.yml Zeile 93), blockierend |
| **Entlastungsbetrag** | **131 €** (125 € als verbotene Zeichenkette hinterlegt) |

Der Scanner prüft vier Regeln: bereits-anerkannt, garantierte-abrechnung,
kassenabrechnung-zusage, veralteter-betrag. Ausnahmen (§40/§60-Leistungen, Marktaufklärung)
sind einzeln begründet. Mit gepflanzter Verletzung gegengeprüft — alle drei Regeln feuerten.

---

## 14. ChairMatch

| Prüfung | Ergebnis |
|---|---|
| `vitest run` | 99 Dateien, **1.866 Tests** bestanden | 
| HEAD | `aacde3e` |
| Live | **https://www.chairmatch.de** (308 → 200), **153 Sitemap-URLs** |

**Sicherheitsbefund:** `spatial_ref_sys` ist für `anon` **beschreib- und löschbar**. Die
bestehende Sicherheitssonde war blind dafür — sie hat die Tabelle nie geprüft. Migration
`20260912_spatial_ref_sys_lockdown.sql` ist geschrieben, **nicht angewendet**.

Weiter: zwei Salon-Regeln konsolidiert (die Sperre hatte zwei Namen), Preis-Audit über
**1.240 Euro-Literale** mit `PRICE_DECISION_REQUIRED` markiert.

---

## 15. efy care

| Prüfung | Ergebnis |
|---|---|
| `vitest run` | 93 Dateien, **2.493 Tests** bestanden, 30 übersprungen |
| HEAD | `6cf0b8f` |
| Live | **nirgends deployt** — kein `.vercel`, kein DNS auf efy-care.de / efycare.de / efy.care |

**Sicherheitsbefund:** `anon` und `authenticated` hatten **TRUNCATE**- und TRIGGER-Rechte.
Migration `20260912020000_truncate_trigger_rechte.sql` entzieht sie und setzt eine globale
`search_path`-Invariante — **geschrieben, nicht angewendet**.

**Funktionslücke:** Tourenplanung fehlt.

---

## 16. Security — alle drei Produkte

| Produkt | Befund | Zustand |
|---|---|---|
| **Alltagsengel** | §45a-Scanner über 1.600 Dateien, in CI blockierend verdrahtet | ✅ **live** |
| **ChairMatch** | `spatial_ref_sys` von `anon` beschreibbar; anon-Perimeter nachgezogen | ⚠️ **Migration nicht angewendet** |
| **efy care** | anon/authenticated hatten TRUNCATE; `search_path`-Invariante | ⚠️ **Migration nicht angewendet** |

**Gemeinsame Ursache der zwei offenen Punkte:** DDL ist aus der Agent-Sitzung heraus nicht
möglich (PostgREST + `service_role` meldet `42501`; ein `service_role`-Apply gibt HTTP 204
**ohne Wirkung**). Beide Migrationen müssen im Supabase-SQL-Editor angewendet werden.
Bis dahin sind die Lücken offen — geschriebener SQL-Code ist keine Behebung.

---

## 17. CI/CD

| Produkt | Suite | Ergebnis |
|---|---|---|
| Alltagsengel | vitest + node:test | **PASS** — 10.324 + 2.770 |
| ChairMatch | vitest | **PASS** — 1.866 |
| efy care | vitest | **PASS** — 2.493 |
| **Summe** | | **14.683 Tests, 0 Fehlschläge** |

**Zwei Befunde zur CI selbst:**

1. **ESLint ist stillgelegt.** `ci.yml` Zeile 65 lautet `npm run lint || true`. Lokal meldet
   ESLint **12 Fehler** (react-hooks/refs in 6 Admin-Seiten, `no-assign-module-variable` in
   einem Test). Alle betreffen Dateien, die zuletzt am 21.–29.08. angefasst wurden — also
   **nicht neu**, aber seither unbemerkt. Die acht projekteigenen `lint:*`-Prüfungen laufen
   dagegen blockierend und sind alle grün.
2. **Die CI-Läufe zu `105b94b8` und `f6465b6f` wurden abgebrochen** (`cancelled`), weil der
   jeweils nächste Push sie verdrängt hat. Der Lauf zu `2b708e75` lief zum Redaktionsschluss
   noch. Der Beleg für diese Commits ist damit der **lokale Prüfstand**, nicht ein grünes
   CI-Häkchen.

---

## 18. DB-Zustände (live aus Supabase)

```
50 offen — 37 verschleppt (>7 Tage), 8 dringend, 2 eskaliert, 1 zur Erinnerung
je Art:  Warteliste 0 · Bewerbungen 36 · Anfragen 14
Kennzahlen: >24h 1 · >48h 2 · >72h 8 · >7 Tage 37
            ältester 58 Tage · heute fällig 0 · Rückrufe 8 · Termine 2
```

| Tabelle | Zustand |
|---|---|
| `lead_inquiries` | 50 offen, **37 verschleppt** |
| `state_waitlist` | **0 Zeilen** |
| `marketing_content_status` | **0 Zeilen** (bei 54 Content-Stücken) |
| `email_templates` | 16 Zeilen, vollständig, 0 Verstöße |

**Abweichung zum Auftrag:** Dort stehen „36 ROT". Gemessen sind **37 verschleppt** plus
8 dringend — die rote und schwarze Ampel zusammen sind **45** von 50.

---

## 19. Live-Deployments

| Produkt | URL | Status |
|---|---|---|
| **Alltagsengel** | https://alltagsengel.care | **live**, HTTP 200, 182 Sitemap-URLs |
| **ChairMatch** | https://www.chairmatch.de | **live**, 308 → 200, 153 Sitemap-URLs |
| **efy care** | — | **nicht deployt** (kein DNS auf 3 geprüften Kandidaten) |

Der Footer-Fix aus `2b708e75` war zum Redaktionsschluss live noch nicht sichtbar — der
Vercel-Build lief. Push ist per `verify-push` bestätigt.

---

## 20. Aktuelle Commits

| Produkt | HEAD | Weitere heute |
|---|---|---|
| Alltagsengel | `2b708e75` | `f6465b6f`, `105b94b8`, `915509d7`, `a64e28a7` |
| ChairMatch | `aacde3e` | `095f2d1`, `c507e9b` |
| efy care | `6cf0b8f` | `84d2e84`, `c0b766a` |

---

## 21. BLOCKED_EXTERNAL

Punkte, die **niemand im Team** allein auflösen kann — sie hängen an Dritten.

| # | Punkt | Hängt an | Blockiert |
|---|---|---|---|
| 1 | **Gewerbeanmeldung-Bestätigung** | Stadt Frankfurt | §45a-Mappe unvollständig |
| 2 | **Erhebungsbogen Anbieterform II** | Stadt Frankfurt (Download defekt) | §45a-Antrag |
| 3 | **§45a-Anerkennungsbescheid Hessen** | Land Hessen | Kassenabrechnung, Tariffreigabe, „kostenlos"-Werbung |
| 4 | **Google Business Profile** | Google-Verifizierung | Local SEO, Bewertungen |
| 5 | **Stripe** | bewusst **DEFERRED** | Online-Zahlung (kein Blocker für Rechnungsgeschäft) |

---

## 22. USER_ACTION_REQUIRED

Gebündelt, nach Dringlichkeit. Alles hier braucht **Ihre** Hand.

### Sofort (heute / Montag)

| # | Aktion | Warum |
|---|---|---|
| 1 | **`CRON_SECRET` in Vercel setzen** | Die Follow-up-Maschine hat **noch nie gefeuert**. Ohne diesen Wert laufen alle Ketten ins Leere — `Bearer undefined` gilt sonst für jeden. |
| 2 | **4 Kundenanfragen anrufen** | MantheyIckenroth (34 T), Büttner (43 T), Reichert (mehrfach vergeblich), Suhe (59 T) |
| 3 | **Claudia Adjovi anrufen** | 8 Jahre Erfahrung, Top-Kandidatin, wartet unbearbeitet |
| 4 | **Kartenscan löschen + Karte sperren lassen** | `~/Downloads/Gescanntes Dokument 14.pdf` zeigt Kartennummer, Ablauf **und Prüfziffer**. **Nicht im Repo** (per SHA-256 über alle PDFs und die Git-Historie geprüft) — es ist also nichts aus dem Projekt zu entfernen. Eine Karte mit sichtbarer Prüfziffer gilt als kompromittiert. |

### Diese Woche

| # | Aktion | Warum |
|---|---|---|
| 5 | **12 Bundesländer-Anträge richtigstellen** | Sie behaupten die §45a-Anerkennung, die nicht vorliegt. Unrichtige Angabe gegenüber Behörden. |
| 6 | **Erhebungsbogen Frankfurt neu beschaffen** | Die Repo-Datei ist eine Cloudflare-Sperrseite, kein Formular |
| 7 | **Erweitertes FZ für Sabrina beantragen** | Vorhanden ist ein **einfaches** FZ (22.04.2026). §45a und der eigene Arbeitsvertrag §10 verlangen das erweiterte; zudem ist es ~5 Monate alt (Behörden wollen ≤ 3). |
| 8 | **Arbeitsvertrag Sabrina ausfüllen** | Beginn, Wochenstunden, Vergütung, Adresse leer |
| 9 | **Betriebshaftpflicht: Versicherungsnehmer klären** | Police läuft auf „Alltagsengel" **ohne UG** — die Behörde erwartet „Alltagsengel UG (haftungsbeschränkt)" |
| 10 | **Preisentscheidung 35 € vs. 40 €** | Vier Investorenseiten widersprechen der Code-Konstante |
| 11 | **2 Migrationen im SQL-Editor anwenden** | ChairMatch `spatial_ref_sys`, efy care TRUNCATE — beide Lücken sind bis dahin offen |
| 12 | **Gerichtskasse-Mahnung prüfen** | 26.05.2026, Az. 72 HRB 140351/0 002, Status unbekannt |

---

## 23. Nächste 20 produktive Schritte

**Umsatz / Menschen (1–5)**
1. Vier Kundenanfragen abtelefonieren, Ergebnis im Posteingang festhalten
2. Acht Rückruf-Leads klassifizieren (eine Frage genügt: Kunde oder Bewerber?)
3. Sieben PRIO-1-Bewerber kontaktieren, beginnend mit Claudia Adjovi
4. `CRON_SECRET` setzen und den 05:00-Lauf am Folgetag gegen `notifications` belegen
5. Dublette Maike Reichert zusammenführen

**Genehmigung (6–10)**
6. Erhebungsbogen der Stadt beschaffen
7. Erweitertes Führungszeugnis Sabrina beantragen
8. Arbeitsvertrag + Schweigepflichterklärung vervollständigen
9. Richtigstellung an die 12 Bundesländer formulieren (Absender „Alltagsengel")
10. Versicherungsnehmer auf die UG umschreiben lassen

**Produkt (11–15)**
11. Near-Duplicate-Descriptions der 65 Stadtseiten auflösen — Muster aus `/haushaltshilfe` übernehmen
12. 76 Titel auf ≤ 60 Zeichen kürzen, beginnend mit `/engel-werden` (91 Zeichen, Marke doppelt)
13. `/pflegebox` ↔ `/hygienebox` entscheiden: eine Seite führt das Keyword
14. Dokumentenstatus ins Kunden-CRM — **braucht eine Migration**, daher nach Punkt 11 der USER_ACTION-Liste
15. `marketing_content_status` befüllen, damit Veröffentlichung nachvollziehbar wird

**Technische Schuld (16–20)**
16. `|| true` bei ESLint in `ci.yml` entfernen — nachdem die 12 Fehler behoben sind
17. Die 12 ESLint-Fehler beheben (6 Admin-Seiten, `lib/a11y.ts`, ein Test)
18. Zwei offene Migrationen anwenden und **nachmessen**, nicht annehmen
19. UTM auf dem Bewerberformular nachziehen — 25 von 35 Bewerbungen kommen ohne Quelle an
20. efy care deployen oder ausdrücklich als „nicht deployt" im Portfolio führen — der jetzige Zustand ist ein unentschiedener Zwischenstand

---

*Erstellt 12.09.2026. Alle Zahlen in dieser Sitzung aus Primärquellen gemessen.
Schrift der PDF-Fassung: DejaVuSans (Helvetica-Rückfall per Prüfung ausgeschlossen).*
