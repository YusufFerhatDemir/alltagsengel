# Business-Go-Live-Matrix — was heute Geld verdienen darf

**Stand:** 2026-08-14
**Datenquelle:** Produktions-Datenbank (`nnwyktkqibdjxgimjyuq`, PostgREST mit `service_role`) + Quellcode dieses Repositories
**Erhebungsart:** gezählt und gelesen, nicht geschätzt

---

## Wie dieses Dokument zu lesen ist

Jede Zahl unten ist am 14.08.2026 aus der Produktions-Datenbank oder aus dem Code
gelesen worden. Es stehen **keine** Preise, Fristen, Erstattungsbeträge oder
Umsatzprognosen darin, die nicht bereits als Stammdatum oder Gesetzeswert im System
liegen.

Zwei Fragen werden pro Produkt getrennt beantwortet, weil sie regelmäßig verwechselt
werden:

| Frage | Bedeutung |
|-------|-----------|
| **HEUTE VERKAUFBAR** | Darf die Leistung heute einem Kunden angeboten und erbracht werden? |
| **HEUTE ABRECHENBAR** | Kann daraus heute eine bezahlbare Forderung entstehen — im System, gegen den vorgesehenen Zahler? |

Verkaufbar ohne abrechenbar ist der teure Fall: Leistung erbracht, Geld nicht
einbringbar. Er kommt unten zweimal vor.

**Blocker-Typen:**

| Typ | Bedeutung |
|-----|-----------|
| **EXTERN** | Wartet auf einen Dritten (Landesbehörde, ITSG, GKV-SV, gematik, BfArM, Bundesbank). Kein Deploy macht das wahr. |
| **TECHNISCH** | Liegt im Code, in Stammdaten oder in der Konfiguration. Intern lösbar. |

---

## Gemessener Ausgangsbestand

### Tarife

| Tabelle | Zeilen | `verified` | `unverified` | `blocked` |
|---------|-------:|-----------:|-------------:|----------:|
| `billing_tariffs` | 23 | 11 | 4 | 8 |
| `leistungspreise` | 24 | 0 | 24 | 0 |
| `service_pricing` | 10 | — | — | — |

`service_pricing` hat **keine Spalte `tarif_status`** und ist damit von der
Tarif-Verifizierung nicht erfasst. Siehe „Heute behobener technischer Blocker".

Aufschlüsselung `billing_tariffs`:

| Rechtsgrundlage | Anzahl | Status | Satz |
|-----------------|-------:|--------|------|
| `privat` | 10 | **verified** | 38,00 / 40,00 / 45,00 €/Std, Wegepauschale 5,00 €/Einsatz |
| § 45b SGB XI | 8 | **blocked** | 35,00 €/Std (`verifizierungs_quelle`: „PfluV Hessen: 35 EUR") |
| § 45b SGB XI | 1 | **verified** | Wegepauschale 5,00 €/Einsatz |
| § 39 SGB XI | 4 | **unverified** | 35,00 €/Std, `verifizierungs_quelle` = NULL |

Damit bestätigt: von **9 § 45b-Tarifen sind 8 blocked**; die 35 €/h bleiben gesperrt.
Der einzige freigegebene § 45b-Satz ist die Wegepauschale.

### Bestand und Konfiguration

| Gegenstand | Gemessen |
|------------|----------|
| `organizations` | 3 (Alltagsengel UG + 2 E2E-Test-Orgs) |
| `clients` | 4 |
| `client_budgets` | 4 |
| `service_records` | 30 |
| `invoices` | 5 (3 Seed + 2 Test) |
| `bookings` / `assignments` | 10 / 5 |
| `abrechnungslaeufe` | 1 |
| `datenannahmestellen` | **0** |
| `coach_freischaltcodes` / `coach_consents` / `coach_assessments` | 0 / 0 / 0 |
| `organization_subscriptions` | 1 |
| `organizations.billing_plan` (Alltagsengel UG) | `intern` |
| SEPA-Gläubiger-ID | `DE98ZZZ09999999999` — **Platzhalter**, keine echte ID |
| IK-Nummer | 460629986 (vorhanden) |

### Bundesland-Freischaltung (`state_settings`, Stamm-Organisation)

| Bundesland | Status | anerkannt_am | Aktive Schalter |
|------------|--------|--------------|-----------------|
| **Hessen** | ANTRAG_EINGEREICHT | **NULL** | Werbung, Registrierung, Warteliste, **Privatleistungen** |
| 15 übrige | VORBEREITUNG | NULL | Werbung, Registrierung, Warteliste |

Für Hessen sind `insurance_enabled`, `kassentarife_enabled`, `budgetpruefung_enabled`,
`kassenrechnung_enabled`, `elnw_enabled` und `dakota_export_enabled` **alle false**.
Vermerk in der Zeile: „Anerkennungsverfahren §45a SGB XI laeuft. Anerkennungsbescheid
liegt am 08.08.2026 NICHT vor."

### Externe Freigabe-Schalter

| Env-Variable | Lokal gelesen | Code-Verhalten |
|--------------|---------------|----------------|
| `ITSG_ZERTIFIZIERT` | nicht gesetzt | fail-closed, nur exakt `'true'` schaltet frei |
| `SGB_V_302_FREIGABE` | nicht gesetzt | fail-closed; Generator wirft zusätzlich **immer** (`SgbVSpecFehltError`) |
| `KIM_AKTIV` | nicht gesetzt | fail-closed; Versand wirft **immer** (`KimSpecFehltError`) |
| `COACH_DIPA_MODUS` | nicht gesetzt | Default AUS |

> **Einschränkung, die nicht überlesen werden darf:** gelesen wurde die lokale
> Umgebung. Die in Vercel gesetzten Produktionswerte sind aus dieser Sitzung nicht
> einsehbar. Für die drei Kassenschalter ist das unkritisch — die zugehörigen
> externen Voraussetzungen (Anerkennungsbescheid, TA1, gematik-Zulassung) liegen
> nachweislich nicht vor, ein gesetzter Schalter würde also nur die Fehlerstelle
> verschieben. Für **Stripe** ist es der entscheidende offene Punkt (siehe e).

---

## Die Matrix

### a) Privatkunden — Selbstzahler Alltagsbegleitung

| | |
|---|---|
| **HEUTE VERKAUFBAR** | **JA** — `private_enabled` ist für Hessen aktiv. Privatleistung setzt keine §45a-Anerkennung voraus; sie läuft unabhängig vom laufenden Verfahren. |
| **HEUTE ABRECHENBAR** | **JA** — 10 Privattarife stehen auf `verified`. `resolvePrice()` lässt Privattarife durch, `createInvoiceDraft()` → `create_invoice_draft_atomic()` erzeugt die Rechnung, Nummernkreis/OPOS/Mahnwesen hängen daran. Fünf Rechnungen liegen bereits in der Tabelle. |
| **EXTERNER BLOCKER** | Für Leistung und Rechnung: **keiner**. Nur für den **Lastschrifteinzug**: die Gläubiger-Identifikationsnummer ist der Platzhalter `DE98ZZZ09999999999`; die echte vergibt die Deutsche Bundesbank auf Antrag. |
| **TECHNISCHER BLOCKER** | **KEINER** für Rechnung gegen Überweisung. Der SEPA-Weg ist bewusst gesperrt: `pruefeGlaeubigerIdOderWerfe()` blockiert den Platzhalter, und `generatePain008()` setzt die Sperre selbst durch — ein zweiter Aufrufer kann sie nicht umgehen. |
| **NÄCHSTER SCHRITT** | Gläubiger-ID bei der Deutschen Bundesbank beantragen (kostenfrei, Online-Antrag; Ablauf in `docs/ANLEITUNG_SEPA_CREDITOR_ID.md`) und in den Organisationsstammdaten ersetzen. Bis dahin Rechnung mit Überweisung — das funktioniert heute. |

**Das ist der einzige Weg, der heute vollständig durchläuft.**

---

### b) Selbstzahler PflegeCoach

| | |
|---|---|
| **HEUTE VERKAUFBAR** | **JA** — als freier digitaler Service. `dipaModus()` ist AUS, damit sind Anspruchsprüfung, Kassenreferenzen und Abrechnungswege im UI nicht sichtbar; es wird also nichts behauptet, was nicht gilt. |
| **HEUTE ABRECHENBAR** | **NEIN** — es existiert kein Bezahlvorgang. In `lib/coach/`, `app/pflegecoach/` und `app/api/coach/` gibt es keinen Checkout, kein Abo und keinen Preis. `app/pflegecoach/anfrage/` ist ein Kontaktformular, keine Kasse. |
| **EXTERNER BLOCKER** | **Keiner.** Ein digitaler Selbstzahler-Service braucht weder Anerkennung noch Listung. |
| **TECHNISCHER BLOCKER** | Kein B2C-Zahlungsweg. Stripe ist ausschließlich für **B2B-Organisationspläne** verdrahtet (`organization_subscriptions`, `organizations.billing_plan`) — es gibt keinen Pfad, über den eine Privatperson zahlt. |
| **NÄCHSTER SCHRITT** | Produktentscheidung durch Yusuf: Preis und Modell (einmalig / monatlich / Freemium). Erst danach kann der Checkout gebaut werden — **das Preisniveau wird hier nicht vorgeschlagen und ist nirgends im System hinterlegt.** |

Von allen sieben Kategorien ist dies die einzige, deren Blocker **rein intern** ist und
in der niemand auf einen Dritten wartet.

---

### c) § 45b Entlastungsbetrag (131 €/Monat) — Kostenerstattung / Papierrechnung

| | |
|---|---|
| **HEUTE VERKAUFBAR** | **JA als Leistung** — die Alltagsbegleitung darf erbracht und privat in Rechnung gestellt werden. **NEIN als „wird von der Kasse erstattet"**: diese Zusage darf nicht gemacht werden. |
| **HEUTE ABRECHENBAR gegen § 45b** | **NEIN** — auf beiden Ebenen gesperrt. |
| **EXTERNER BLOCKER** | Die **Anerkennung nach § 45a SGB XI liegt nicht vor**: `state_settings.hessen.anerkannt_am` ist NULL, Status `ANTRAG_EINGEREICHT`. Ohne Anerkennungsbescheid der zuständigen hessischen Landesbehörde erkennt die Pflegekasse die Leistung für den Entlastungsbetrag nicht an — auch nicht auf dem Kostenerstattungsweg über die versicherte Person. Der Papierweg umgeht die Anerkennung nicht, er umgeht nur den Datenträgeraustausch. |
| **TECHNISCHER BLOCKER** | 8 von 9 § 45b-Tarifen stehen auf `blocked`. `create_invoice_draft_atomic()` und `resolvePrice()` werfen dafür `TarifNichtVerifiziertError` — eine § 45b-Rechnung entsteht heute gar nicht erst. Das ist **gewolltes Verhalten**, kein Defekt. Zusätzlich `kassenrechnung_enabled = false` und `budgetpruefung_enabled = false` für Hessen. |
| **NÄCHSTER SCHRITT** | Anerkennungsverfahren bei der hessischen Landesbehörde nachhalten und Bescheiddatum in `state_settings.hessen.anerkannt_am` + `approval_document` eintragen. **Erst danach** die acht Tarife über den kontrollierten Freigabeprozess (`PATCH /api/billing/tariffs/[id]/verifizierung`, verlangt eine Rechtsquelle) auf `verified` setzen und `kassenrechnung_enabled` aktivieren. |

Der Entlastungsbetrag ist im System korrekt mit **131 €/Monat** und 1.572 €/Jahr
hinterlegt (`lib/config/budget-constants.ts`, gültig seit 01.01.2025). Der frühere
Wert 125 € existiert nur noch als historische Budgetversion für Altjahre.

---

### d) Verhinderungs- und Kurzzeitpflege (§§ 39, 42 SGB XI)

| | |
|---|---|
| **HEUTE VERKAUFBAR** | **JA als Leistung**, mit derselben Einschränkung wie unter c): keine Erstattungszusage. |
| **HEUTE ABRECHENBAR** | **NEIN** |
| **EXTERNER BLOCKER** | Dieselbe fehlende Anerkennung wie unter c), zusätzlich fehlt die **Vergütungsgrundlage**: alle vier § 39-Tarife haben `verifizierungs_quelle = NULL`. Es ist also nicht belegt, worauf die 35 €/h beruhen. |
| **TECHNISCHER BLOCKER** | Stammdatenlücke, kein Code-Defekt: die vier § 39-Tarife stehen auf `unverified`, damit greift Fail-Closed. Für **§ 42 (Kurzzeitpflege) existiert überhaupt kein Tarif** — die Rechtsgrundlage kommt in `billing_tariffs` nicht vor. |
| **NÄCHSTER SCHRITT** | Vergütungsgrundlage für § 39 beschaffen und beim Verifizieren als Rechtsquelle eintragen. Für § 42 entscheiden: Tarif anlegen oder Kurzzeitpflege bewusst aus dem Angebot nehmen — der jetzige Zustand („im Budgetmodell vorhanden, im Tarifmodell nicht") ist der unklarste im ganzen System. |

Das kombinierte VP/KZP-Jahresbudget ist mit 3.539 € hinterlegt und die
Kombinationsprüfung (`combined_used_amount`) funktioniert — die Budgetseite ist fertig,
die Preisseite nicht.

---

### e) Pflegedienst-Software als SaaS (B2B)

| | |
|---|---|
| **HEUTE VERKAUFBAR** | **JA, technisch** — Mehrmandantenfähigkeit ist live (Phase 3, 65 Org-Fences), Stripe Checkout / Portal / Webhook sind gebaut, `organization_subscriptions` existiert. |
| **HEUTE ABRECHENBAR** | **UNBESTÄTIGT** — hängt allein daran, ob `STRIPE_SECRET_KEY` und `STRIPE_PRICE_STARTER/PRO/SCALE` in Vercel gesetzt sind. Lokal sind sie es nicht; die Produktionsumgebung ist aus dieser Sitzung nicht lesbar. Ohne diese Werte wirft `getStripe()` beim ersten Checkout. |
| **EXTERNER BLOCKER** | **Keiner.** Ein Stripe-Konto samt Produkten und Preisen ist Selbstbedienung. |
| **TECHNISCHER BLOCKER** | Kein Defekt im Bezahlweg. Offen ist das **Produkt**: die drei Pläne haben keinen im Repository hinterlegten Preis und keinen definierten Funktionsumfang — `PLAN_TO_PRICE` liest ausschließlich Env-Variablen. Es gibt zudem keinen öffentlichen Preis- oder Selbstregistrierungsweg für fremde Pflegedienste. Faktischer Kundenbestand: **null** (die einzige echte Organisation trägt `billing_plan = 'intern'`, die beiden anderen sind E2E-Testdaten). |
| **NÄCHSTER SCHRITT** | Prüfen, ob die vier Stripe-Env-Variablen in Vercel gesetzt sind, und einen Test-Checkout durchlaufen lassen. Das beantwortet in fünf Minuten die einzige offene Frage dieser Kategorie. |

Kleinere Härtung, notiert aber nicht als Blocker: `PRICE_TO_PLAN` in
`lib/stripe/config.ts` baut seine Schlüssel aus `process.env.STRIPE_PRICE_*!`. Fehlen
die Variablen, entsteht ein Objekt mit dem Schlüssel `"undefined"`. `planFromPriceId()`
liefert für echte Price-IDs dann korrekt `null`, aber die Konstruktion verdeckt eine
Fehlkonfiguration, statt sie zu melden.

---

### f) Kassendirektabrechnung (§ 105 SGB XI, DTA)

| | |
|---|---|
| **HEUTE VERKAUFBAR** | **NEIN** |
| **HEUTE ABRECHENBAR** | **NEIN** |
| **EXTERNER BLOCKER** | Drei Dinge, alle bei Dritten: **§ 45a-Anerkennung** (Voraussetzung für alles Weitere), **ITSG-Zertifikat** vom ITSG Trust Center (kostenpflichtig, mehrere Tage Vorlauf), **SFTP-Zugang** bei jeder Datenannahmestelle samt bestätigter Testübertragung mit Dateiindikator „0". |
| **TECHNISCHER BLOCKER** | Keiner im Erzeugungsweg — Dateierstellung, SECON-Verschlüsselung, Validierung und Testmodus laufen. Gesperrt ist ausschließlich die Übertragung. Stammdatenseitig: `datenannahmestellen` hat **0 Zeilen**, `dakota_export_enabled = false`, `ITSG_ZERTIFIZIERT` nicht `'true'`. |
| **NÄCHSTER SCHRITT** | Auf den Anerkennungsbescheid warten — vorher ist der ITSG-Antrag nicht stellbar. Die vollständige Reihenfolge steht in `EXTERNE_FREIGABEN.itsg_zertifiziert.schritte` (`lib/abrechnung/externe-freigaben.ts`) und muss nicht neu erfunden werden. |

---

### g) DiPA — PflegeCoach als kassenerstattungsfähige Anwendung

| | |
|---|---|
| **HEUTE VERKAUFBAR** | **NEIN** — nicht als kassenerstattungsfähige Anwendung. Als freier Service: siehe b). |
| **HEUTE ABRECHENBAR** | **NEIN** |
| **EXTERNER BLOCKER** | **Es gibt keine BfArM-Listung.** Damit ist der PflegeCoach **nicht kassenerstattungsfähig** — weder direkt gegenüber der Pflegekasse noch über die Kostenerstattung der versicherten Person. Weiter extern offen laut `docs/DIPA_BFARM_READINESS.md`: Datenschutz-Folgenabschätzung, Penetrationstest, Evidenz-/Studiendurchführung, externes Barrierefreiheits-Audit. |
| **TECHNISCHER BLOCKER** | Drei Lücken, die intern lösbar sind: **Qualitätsmanagementsystem** für das Softwareprodukt (FEHLT), **Mehr-Faktor-Authentifizierung** (FEHLT), **Interoperabilität** — ein Export existiert, aber kein verbindliches Austauschformat (FEHLT). |
| **NÄCHSTER SCHRITT** | `COACH_DIPA_MODUS` bleibt AUS und muss AUS bleiben. Die drei internen Lücken abarbeiten — sie sind die einzigen der zwölf Readiness-Punkte, die ohne Dritte vorankommen. |

`lib/coach/abrechnung.ts` enthält bewusst **keine** Vergütungshöhen und setzt
`verguetungGeklaert: false` auf allen Abrechnungsweg-Vorlagen; `istAbrechnungsbereit()`
verhindert damit, dass ein Abrechnungslauf gegen einen dieser Wege erzeugt wird. Diese
Sperre ist korrekt und darf nicht gelockert werden.

---

### Nachtrag: § 302 SGB V (häusliche Krankenpflege)

Nicht Teil der sieben Kategorien, aber ein weiterer verdrahteter Abrechnungsweg:
**NEIN und NEIN.** Extern fehlt die Technische Anlage 1 zur § 302-Vereinbarung, ohne
die keine Segmentstruktur erzeugt werden darf. Der Generator wirft deshalb
**immer** — er rekonstruiert keine Segmente aus Vermutungen. Das ist Absicht.
Gleiches Muster bei KIM: gebaut, wirft immer, wartet auf gematik-Zulassung.

---

## Zusammenfassung

| # | Produkt | Verkaufbar | Abrechenbar | Blocker |
|---|---------|:----------:|:-----------:|---------|
| a | Privatkunden Alltagsbegleitung | **JA** | **JA** | Nur Lastschrift: Gläubiger-ID (extern) |
| b | Selbstzahler PflegeCoach | **JA** | **NEIN** | Technisch: kein B2C-Bezahlweg |
| c | § 45b Entlastungsbetrag | Leistung ja | **NEIN** | Extern: §45a-Anerkennung + technisch: 8 Tarife blocked |
| d | VP/KZP §§ 39, 42 | Leistung ja | **NEIN** | Extern: Anerkennung + Vergütungsgrundlage; § 42 ohne Tarif |
| e | Pflegedienst-SaaS | **JA** | **unbestätigt** | Stripe-Env in Vercel prüfen; kein Produktpreis |
| f | Kassendirektabrechnung § 105 | **NEIN** | **NEIN** | Extern: Anerkennung, ITSG, Annahmestelle |
| g | DiPA PflegeCoach | **NEIN** | **NEIN** | Extern: keine BfArM-Listung |

**Ein Weg trägt heute Umsatz: (a) Privatkunden gegen Rechnung.**

Drei der sechs übrigen Blocker hängen an **derselben** externen Entscheidung — dem
§ 45a-Anerkennungsbescheid aus Hessen. Er entscheidet über c), d) und f) gleichzeitig
und ist damit der einzige Vorgang, dessen Nachhalten sich mehrfach auszahlt.

Zwei Blocker sind **rein intern** und warten auf niemanden:
- **b)** braucht eine Preisentscheidung und einen B2C-Checkout.
- **e)** braucht vermutlich nur vier Env-Variablen — das ist in Minuten prüfbar und der
  billigste offene Punkt der ganzen Matrix.

---

## Heute behobener technischer Blocker

**Der Leistungsnachweis druckte einen Eurobetrag, der auf einem gesperrten Tarif beruhte.**

`lib/abrechnung/leistungsnachweis-pdf.ts` summierte `service_records.amount` und gab die
Summe als „Summe der Leistungen" aus. Diese Beträge stammen aus `service_pricing` —
der dritten Preistabelle, die **keine Spalte `tarif_status` hat** und deshalb von der
Tarif-Verifizierung (Migrationen 20260831040000 / 20260831050000) nie erfasst wurde.
Für § 45b lieferte sie 35,00 €/h: genau den Satz, den `billing_tariffs` als `blocked`
führt.

Warum das mehr als ein Schönheitsfehler war: der Leistungsnachweis ist ein
**Kassendokument**. Er nennt Pflegekasse, IK, Genehmigungsnummer und führt im Fußtext
ausdrücklich „§45a/§45b Entlastungsbetrag … sowie §39 Verhinderungspflege" als
Abrechnungsgrundlage auf. Es ist genau das Blatt, das eine versicherte Person bei der
Kostenerstattung einreicht. Rechnung, Korrekturrechnung und Monatsabschluss verweigern
`service_records.amount` als Preisquelle ausdrücklich — der Nachweis tat es als
einziger nicht und lief damit am Fail-Closed vorbei. Dasselbe Muster wie der am
13.08. gefundene Bypass in `correctInvoice()`: die Sperre saß nicht auf allen Lesepfaden.

**Behoben:** neue Funktion `pruefeBetragsfreigabe()` prüft vor dem Druck, ob jede
abgerechnete Leistungsart einen als `verified` gekennzeichneten Kassentarif hat.
Andernfalls entfällt die Geldzeile, und der Nachweis trägt einen Hinweis, dass der
Betrag gesondert mitgeteilt wird. Einsätze, Zeiten und Handzeichen werden unverändert
gedruckt — der Nachweis bleibt als Dokumentation vollständig gültig.

Die Prüfung ist an fünf Stellen fail-closed: `blocked`, `unverified`, fehlender Status,
gar kein Tarif und ein Lesefehler sperren allesamt. Sie ist zudem **strenger** als
`resolvePrice()`: steht neben einem verifizierten Tarif auch ein gesperrter, wird
ebenfalls gesperrt — der Nachweis wählt keinen Tarif aus, er summiert nur, und kann
deshalb nicht belegen, welcher der beiden seiner Summe zugrunde liegt.

Abgesichert durch `__tests__/billing/leistungsnachweis-betrag-fail-closed.test.ts`
(15 Tests). Vier davon prüfen das erzeugte HTML statt nur das Datenmodell — die Sperre
muss dort greifen, wo das Blatt entsteht, nicht nur eine Ebene darüber.

**Wirkung auf diese Matrix:** keine Verschiebung von NEIN nach JA. Die Korrektur
verhindert, dass ein Betrag das Haus verlässt, den das System an jeder anderen Stelle
bereits verweigert.

---

## Offener technischer Punkt, nicht behoben

`service_pricing` bleibt eine Preisquelle ohne Verifizierungsstatus. Sie wird gelesen
von `GET /api/pricing` (Anzeige) und von `native/src/app/einsatz/leistung-erfassen.tsx`,
wo die Betreuungskraft bei der Leistungserfassung einen Betrag zu sehen bekommt —
inklusive eines fest verdrahteten Rückfallwerts von 35 €, wenn zur Kombination kein
Satz hinterlegt ist.

In eine Rechnung fließt dieser Wert nicht: die Rechnung rechnet über
`create_invoice_draft_atomic()` neu und fail-closed. Nach dem heutigen Fix erscheint er
auch auf keinem Kassendokument mehr. Er steht aber weiterhin auf dem Bildschirm einer
Mitarbeiterin — als Zahl, die keiner Tarifprüfung unterliegt.

Sauber wäre, `service_pricing` entweder um `tarif_status` zu erweitern und in die
Verifizierung aufzunehmen, oder sie zugunsten von `billing_tariffs` aufzulösen. Das ist
ein Stammdaten- und Migrationsvorgang mit Auswirkung auf die Native App und gehört
nicht in dieselbe Änderung wie die Betragssperre.

Ein zweiter, unabhängiger Punkt: `leistungspreise` steht mit **allen 24 Zeilen** auf
`unverified`. Solange dort nichts verifiziert ist, ist diese Tabelle für die
Rechnungsstellung wirkungslos — was heute korrekt ist, aber beim Freischalten der
Kassenabrechnung nicht vergessen werden darf.
