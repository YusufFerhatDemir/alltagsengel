# LEAD TRUTH RESET — 12.09.2026

> **Primärquelle:** Supabase `lead_inquiries` (Projekt `nnwyktkqibdjxgimjyuq`)
> **Abfragezeitpunkt:** 12.09.2026
> **Erstellt von:** Automatisierte Analyse (Claude Agent)

---

## 1. GESAMTÜBERSICHT

| Kennzahl | Wert |
|---|---|
| **Gesamt-Leads in DB** | 50 |
| **Status: new** | 48 |
| **Status: contacted** | 2 (Amela — Blockliste / bereits kontaktiert) |
| **Kundenanfragen** | 4 unique (5 Einträge, 1 Dublette Maike Reichert) |
| **Rückruf-Leads** | 8 |
| **Bewerber** | 35 (+ 2 Amela = contacted/Blockliste) |
| **Dubletten** | 2× Maike Reichert, 2× Amela |

### Ampel-Verteilung (nur status=new, N=48)

| Ampel | Kriterium | Anzahl | Anteil |
|---|---|---|---|
| 🔴 ROT | >7 Tage ohne Reaktion | 36 | 75 % |
| 🟠 ORANGE | 3–7 Tage | 10 | 21 % |
| 🟡 GELB | <3 Tage | 2 | 4 % |

**FAZIT:** 75 % aller Leads warten seit über einer Woche — davon viele seit Juli. Sofortige Bearbeitung der Kundenanfragen ist kritisch.

---

## 2. KUNDENANFRAGEN — 4 ECHTE FÄLLE (PRIORITÄT)

### 2.1 🔴🔴🔴 HÖCHSTE PRIORITÄT — MantheyIckenroth

| Feld | Wert |
|---|---|
| **ID** | `088a510e-…-1b7141c24d4b` |
| **Name** | MantheyIckenroth |
| **Telefon** | 0157•••••409 |
| **PLZ** | 64285 (Darmstadt) |
| **Service** | Alltagsbegleitung |
| **Nachricht** | Herz-OP am 14.08., nach Reha Hilfe im Haushalt benötigt |
| **Eingang** | 09.08.2026 |
| **Alter** | **34 Tage** |
| **Status** | new |
| **Source** | alltagsbegleitung-darmstadt |
| **Ampel** | 🔴 ROT |

**Analyse:**
- Herz-OP war am 14.08. — Patient befindet sich seit ca. 4 Wochen in Reha oder ist bereits entlassen
- Anfrage kam VOR der OP → Planung vorausschauend
- Bedarf: Haushaltshilfe nach Reha (Einkaufen, Kochen, Putzen, ggf. Begleitung)
- Region Darmstadt: PLZ 64285 → Engel in der Nähe suchen
- **GEFAHR:** Nach 34 Tagen ohne Reaktion ist der Kunde möglicherweise bei einem Mitbewerber. Trotzdem anrufen — Bedarf besteht ggf. weiterhin.
- Mögliche Finanzierung: Entlastungsbetrag (131 €/Monat) bei Pflegegrad, oder Privatleistung

**Status:** CALL_REQUIRED

**Rückrufskript:**
> „Hallo Frau/Herr MantheyIckenroth, hier ist [Name] vom Team Alltagsengel. Sie hatten sich Anfang August bei uns gemeldet wegen Unterstützung im Haushalt nach Ihrer Herz-OP. Wir möchten uns zunächst entschuldigen, dass wir uns erst jetzt melden — wir hatten einen Rückstau bei den Anfragen. Wie geht es Ihnen? Sind Sie bereits aus der Reha zurück? Wir würden Ihnen sehr gerne helfen und hätten Kapazitäten für Alltagsbegleitung in Darmstadt. Darf ich Ihnen kurz erklären, wie das bei uns funktioniert?"

**Antwortentwurf (falls telefonisch nicht erreichbar):**

> Hallo Frau/Herr MantheyIckenroth,
>
> vielen Dank für Ihre Anfrage bei Alltagsengel. Wir möchten uns aufrichtig entschuldigen, dass wir uns erst jetzt bei Ihnen melden — wir hatten in den letzten Wochen einen ungewöhnlich hohen Eingang an Anfragen.
>
> Sie hatten uns geschrieben, dass Sie nach Ihrer Herz-OP Unterstützung im Haushalt benötigen. Wir hoffen, dass Ihre Operation und Reha gut verlaufen sind.
>
> Wir bieten Alltagsbegleitung in Darmstadt an — von Haushaltshilfe über Einkaufsbegleitung bis hin zu Arztbegleitung. Wenn Sie einen Pflegegrad haben, können Sie den monatlichen Entlastungsbetrag von 131 € dafür nutzen, sodass Ihnen keine zusätzlichen Kosten entstehen.
>
> Wir würden Sie sehr gerne telefonisch beraten. Wann dürfen wir Sie zurückrufen?
>
> Herzliche Grüße
> Ihr Team von Alltagsengel

---

### 2.2 🔴🔴 Uwe Büttner — Verhinderungspflege / Demenz

| Feld | Wert |
|---|---|
| **ID** | `9a1e9dfd-…-c43d51ea8d51` |
| **Name** | Uwe Büttner |
| **Telefon** | 0171•••••573 |
| **PLZ** | 63743 (Aschaffenburg Umland) |
| **Service** | Allgemein |
| **Nachricht** | Verhinderungspflege für an Demenz erkrankte Mutter, tageweise |
| **Eingang** | 31.07.2026 |
| **Alter** | **43 Tage** |
| **Status** | new |
| **Source** | alltagsbegleitung-aschaffenburg |
| **Ampel** | 🔴 ROT |

**Analyse:**
- Klarer Bedarf: Verhinderungspflege (tageweise) für Mutter mit Demenz
- "Wir" → Angehörige teilen sich Pflege, brauchen Entlastung
- Verhinderungspflege = Leistung der Pflegekasse (§39 SGB XI) — bis zu 1.612 €/Jahr ab Pflegegrad 2
- Zusätzlich: Entlastungsbetrag 131 €/Monat für Alltagsbegleitung
- Region Aschaffenburg: PLZ 63743 → Engel in der Nähe prüfen
- Demenz erfordert qualifizierte Betreuungskraft (§53b oder vergleichbar)
- **GEFAHR:** 43 Tage Wartezeit bei dringendem Pflegebedarf — hohes Abwanderungsrisiko

**Status:** CALL_REQUIRED

**Rückrufskript:**
> „Hallo Herr Büttner, hier ist [Name] vom Team Alltagsengel. Sie hatten sich Ende Juli bei uns gemeldet wegen Verhinderungspflege für Ihre Mutter. Es tut uns sehr leid, dass wir uns erst jetzt melden. Besteht der Bedarf noch? Wir haben Alltagsbegleiter im Raum Aschaffenburg, die Erfahrung mit Demenz haben. Darf ich Sie kurz zu den Möglichkeiten beraten — auch was die Kostenübernahme durch die Pflegekasse betrifft?"

**Antwortentwurf:**

> Hallo Herr Büttner,
>
> vielen Dank für Ihre Anfrage bei Alltagsengel. Wir möchten uns aufrichtig entschuldigen, dass wir uns erst jetzt bei Ihnen melden.
>
> Sie hatten uns geschrieben, dass Sie tageweise Verhinderungspflege für Ihre Mutter benötigen. Wir verstehen, wie belastend die Pflege eines an Demenz erkrankten Familienmitglieds sein kann, und möchten Sie gerne unterstützen.
>
> Alltagsengel bietet Betreuung im Raum Aschaffenburg an. Unsere Alltagsbegleiter können Ihre Mutter stundenweise oder tageweise betreuen — Gespräche, Spaziergänge, Gesellschaft, leichte Hauswirtschaft. Bei Pflegegrad 2 oder höher steht Ihnen Verhinderungspflege (bis 1.612 € jährlich) sowie der monatliche Entlastungsbetrag (131 €) zu.
>
> Wir würden Sie gerne telefonisch beraten, um den genauen Bedarf und die passende Betreuung zu besprechen. Wann dürfen wir Sie erreichen?
>
> Herzliche Grüße
> Ihr Team von Alltagsengel

---

### 2.3 🔴🔴 Maike Reichert — Mehrfache Terminversuche

| Feld | Wert |
|---|---|
| **IDs** | `178fea9f-…` + `f7ab41cc-…` (DUBLETTE) |
| **Name** | Maike Reichert |
| **Telefon** | 0157•••••812 |
| **PLZ** | 55246 (Mainz-Bingen Gebiet) |
| **Service** | Alltagsbegleitung |
| **Eingang 1** | 31.08.2026 — Terminwunsch Mi, 2. Sep, Mittag (12–15 Uhr) |
| **Eingang 2** | 02.09.2026 — Terminwunsch Fr, 11. Sep, Mittag (12–15 Uhr) |
| **Alter** | 12 / 10 Tage |
| **Status** | new (beide) |
| **Source** | terminbuchung |
| **Ampel** | 🔴 ROT |

**Analyse:**
- Hat ZWEI Mal einen Termin gebucht → hohe Motivation, ernsthafter Bedarf
- Erster Termin (Mi 2. Sep) nicht bestätigt → zweiter Versuch (Fr 11. Sep) — GESTERN!
- PLZ 55246 = Mainz-Bingen Region — prüfen ob aktuell Engel dort verfügbar
- "Bitte zur Bestätigung zurückrufen" → erwartet Rückruf
- **GEFAHR:** Kundin hat 2× versucht uns zu erreichen. Wenn sie heute/morgen nicht zurückgerufen wird, verlieren wir sie definitiv.

**Status:** CALL_REQUIRED (SOFORT!)

**Rückrufskript:**
> „Hallo Frau Reichert, hier ist [Name] vom Team Alltagsengel. Sie hatten bei uns zwei Termine zur Beratung gebucht — einmal am 2. September und noch einmal für den 11. September. Es tut uns sehr leid, dass wir Sie bisher nicht zurückgerufen haben. Sind Sie noch an Alltagsbegleitung interessiert? Ich würde Ihnen gerne gleich am Telefon alle Fragen beantworten."

**Antwortentwurf:**

> Hallo Frau Reichert,
>
> vielen Dank, dass Sie sich gleich zwei Mal an Alltagsengel gewandt haben. Es tut uns aufrichtig leid, dass wir uns bisher nicht bei Ihnen gemeldet haben — das entspricht nicht unserem Anspruch.
>
> Wir sind sehr an einem Gespräch mit Ihnen interessiert. Bitte teilen Sie uns mit, wann wir Sie am besten telefonisch erreichen können, damit wir Ihren Bedarf an Alltagsbegleitung besprechen können.
>
> Herzliche Grüße
> Ihr Team von Alltagsengel

---

### 2.4 🔴 Darleen Suhe — Alltagsbegleitung Darmstadt

| Feld | Wert |
|---|---|
| **ID** | `5b8b1bee-…-7b6507f262ed` |
| **Name** | Darleen Suhe |
| **Telefon** | 0151•••••623 |
| **PLZ** | 64285 (Darmstadt) |
| **Service** | Alltagsbegleitung |
| **Nachricht** | (keine) |
| **Eingang** | 15.07.2026 |
| **Alter** | **59 Tage** |
| **Status** | new |
| **Source** | alltagsbegleitung-darmstadt |
| **Ampel** | 🔴 ROT |

**Analyse:**
- Älteste Kundenanfrage in der DB (59 Tage!)
- Keine Nachricht — nur Formular mit Telefon + PLZ
- Darmstadt PLZ 64285 — gleiche Region wie MantheyIckenroth
- Bedarf unklar, da keine Details angegeben
- **GEFAHR:** Extrem alt. Wahrscheinlich bereits anderweitig versorgt, aber ein Anruf ist Pflicht.

**Status:** CALL_REQUIRED

**Rückrufskript:**
> „Hallo Frau Suhe, hier ist [Name] vom Team Alltagsengel. Sie hatten sich Mitte Juli bei uns wegen Alltagsbegleitung in Darmstadt gemeldet. Wir entschuldigen uns sehr für die späte Rückmeldung. Besteht Ihr Bedarf noch? Wir würden Sie gerne beraten."

**Antwortentwurf:**

> Hallo Frau Suhe,
>
> vielen Dank für Ihr Interesse an Alltagsengel. Wir möchten uns aufrichtig entschuldigen, dass wir uns erst jetzt bei Ihnen melden.
>
> Sie hatten eine Anfrage für Alltagsbegleitung in Darmstadt gestellt. Besteht Ihr Bedarf noch? Wir würden Sie gerne telefonisch beraten und eine passende Betreuung besprechen.
>
> Bitte teilen Sie uns mit, wann wir Sie am besten erreichen können.
>
> Herzliche Grüße
> Ihr Team von Alltagsengel

---

## 3. RÜCKRUF-LEADS — 8 Stück (NEEDS_CLASSIFICATION)

Alle haben `service=Rückrufservice`, `source=rueckruf`, keine PLZ, keine E-Mail.

| # | Name | Telefon | Eingang | Alter (Tage) | Ampel | Bevorzugte Zeit | Klassifikation |
|---|---|---|---|---|---|---|---|
| 1 | Opitz | 06021•••••090 | 23.07 | 51 | 🔴 | Nachmittags | **UNKLAR** — Festnetz 06021 = Aschaffenburg. Könnte Kunde ODER Bewerber sein. |
| 2 | Stefanie Bendert | 0173•••••266 | 29.07 | 45 | 🔴 | Nachmittags | **UNKLAR** — kein Kontext. Eher Kunde (kein Bewerbungskanal). |
| 3 | Demirhan | 0155•••••913 | 31.07 | 43 | 🔴 | Vormittags | **UNKLAR** — nur Vorname/Nachname. |
| 4 | Assa Sohail | 0151•••••444 | 08.08 | 35 | 🔴 | Vormittags | **UNKLAR** — kein Kontext. |
| 5 | John-James | +49 152•••••665 | 21.08 | 22 | 🔴 | Nachmittags | **UNKLAR** — nur Vorname. |
| 6 | Gabriela Zajder | 0176•••••926 | 08.09 | 4 | 🟠 | Abends | **UNKLAR** — kein Kontext. |
| 7 | Martina Kühl | 0176•••••995 | 08.09 | 4 | 🟠 | Nachmittags | **UNKLAR** — kein Kontext. Eher Kunde (Name, Alter). |
| 8 | Ana Rajic | 0152•••••354 | 10.09 | 2 | 🟡 | Nachmittags | **UNKLAR** — kein Kontext. |

**Empfehlung:** Alle 8 telefonisch kontaktieren. Rückruf-Leads sind nicht klassifizierbar ohne Gespräch. Erste Frage im Anruf:
> „Hallo [Name], hier ist [Name] vom Team Alltagsengel. Sie hatten um einen Rückruf gebeten. Geht es um Alltagsbegleitung für sich selbst oder einen Angehörigen, oder interessieren Sie sich für eine Tätigkeit als Alltagsengel?"

**Priorisierung:**
1. 🟡 Ana Rajic (2 Tage) — sofort
2. 🟠 Gabriela Zajder, Martina Kühl (4 Tage) — heute/morgen
3. 🔴 Opitz, Stefanie Bendert, Demirhan, Assa Sohail, John-James — so schnell wie möglich, aber Erwartung gering (>3 Wochen alt)

---

## 4. BEWERBER — 35 aktive Leads (+ 2 Amela Blockliste)

### Blockliste / Bereits Kontaktiert

| Name | Telefon | Status | Notes | Aktion |
|---|---|---|---|---|
| Amela (2 Einträge) | 0176•••••198 | contacted | Persönliches Gespräch 3h am 19.07.2026 | ⚠️ Blockliste: „Amela Sejdovic" — NICHT erneut kontaktieren |

---

### PRIO 1 — Qualifiziert / Berufserfahrung (7 Bewerber)

| # | Name | PLZ/Region | Qualifikation | Erfahrung | FS/Auto | Sprachen | Verfügbarkeit | Stunden | Modell | Start | Quelle | Alter (Tage) | Ampel | Fehlend | Nächster Schritt |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Claudia Adjovi | 63739 (AB) | Sozialbetreuerin + Pflegefachhelferin | **8 Jahre** im Bereich | — | — | Nebenberuflich | — | Selbstständig | sofort | engel-bewerbung | 10 | 🔴 | FS, Stunden, Sprachen | **SOFORT anrufen** — Top-Kandidatin |
| 2 | Ziyana Filote | 63743 (AB) | **Pflegefachkraft** | Arbeitet im Altenheim | FS ja, kein Auto | DE, EN, Weitere | Abends, Nachmittags, WE | bis 10h | Minijob | sofort | engel-bewerbung (ChatGPT) | 3 | 🟠 | — | Anrufen — sehr gutes Profil, neues Formular (bewerbung_daten vorhanden) |
| 3 | Sotiris Tiropoulos | 60326 (FFM) | **Alltagsbegleiter §45b** | Therapon24 | — | — | — | — | — | sofort | engel-bewerbung | 7 | 🟠 | Fast alles | Anrufen — direkte Branchenerfahrung |
| 4 | Francesca L. Potočan | 63457 (Hanau) | **Betreuungskraft §53b** | — | — | — | — | — | — | — | engel-bewerbung | 26 | 🔴 | Erfahrung, FS, Stunden | Anrufen |
| 5 | Marcel Sauer | 63808 (AB) | Rettungsdienst (Hauptberuf) | Medizinisch | — | — | Flexibel (Dienstplan) | Nebenjob | — | — | engel-bewerbung (Google Jobs) | 27 | 🔴 | FS, Stunden | Anrufen — medizinischer Hintergrund |
| 6 | michelle Gruber | 55124 (Mainz) | **Pflegehelferin** | — | FS ja | — | — | — | — | — | engel-bewerbung | 25 | 🔴 | Erfahrungsjahre, Stunden | Anrufen |
| 7 | Natalie Riedl | 63071 (OF) | Erfahrung als Alltagshelferin | Praktische Erfahrung | — | — | Nebenjob (VZ bei REWE) | Minijob | — | — | engel-bewerbung | 4 | 🟠 | FS, Stunden | Anrufen — hat relevante Vorerfahrung |

---

### PRIO 2 — Gute Eignung / Quereinsteiger (16 Bewerber)

| # | Name | PLZ/Region | Hintergrund | FS/Auto | Stunden | Alter (Tage) | Ampel | Nächster Schritt |
|---|---|---|---|---|---|---|---|---|
| 1 | Lena Schulz | 65929 (FFM-Höchst) | Pflege des Vaters, Erste-Hilfe, FZ vorhanden, 43J, 2-3 Tage/Woche gewünscht | **FS ja** | Midijob | 29 | 🔴 | Anrufen — sehr motiviert, FS + FZ da |
| 2 | Larissa Zeman | 63073 (OF) | Pflege der 98j-Großmutter, unterstützt ältere Dame im HH | — | — | 13 | 🔴 | Anrufen |
| 3 | Julia Jaspert | 63065 (OF) | Fachabitur Pädagogik, selbstständige Kreative | — | Flexibel | 57 | 🔴 | Anrufen |
| 4 | Issam Gannouf | 65199 (Wiesbaden) | Kundenbetreuung Segmüller seit 2019, Kinderbetreuung | **FS Klasse B** | — | 24 | 🔴 | Anrufen |
| 5 | Michelle Brostmeyer | 63322 (Rödermark) | Kinderpflegerin, Pflege der Tante bis Tod | — | Ab Okt. 2026 | 51 | 🔴 | Anrufen ab Oktober |
| 6 | Jasmin Zubrod | 63741 (AB) | Servicekraft, Friseurin, Individual Begleitung | — | — | 59 | 🔴 | Anrufen |
| 7 | Kimberly Engel | 63067 (OF) | FSJ in Pflege + Beschäftigung | — | — | 47 | 🔴 | Anrufen |
| 8 | Myriam | 63067 (OF) | Pflegt eigenen Vater (80 Jahre) | — | — | 46 | 🔴 | Anrufen |
| 9 | Sebastian Philippeit | 60389 (FFM) | Ehrenamt seit 2013 für Menschen mit Behinderung, Kellner | — | TZ | 27 | 🔴 | Anrufen |
| 10 | Tom Kaffenberger | 63477 (Maintal) | Personal Trainer, 26J, motiviert | — | Flexibel | 47 | 🔴 | Anrufen |
| 11 | Sabrina Hinrichs | 65719 (Hofheim) | — | — | TZ | 54 | 🔴 | Anrufen |
| 12 | Pashtana Gulzar | 63263 (NI) | Schulbegleiterin in TZ | — | Nachmittags | 6 | 🟠 | Anrufen |
| 13 | The Anh Tran | 63263 (NI) | Lehramtsstudent, Schulpraktika | — | — | 14 | 🔴 | Anrufen |
| 14 | Oxana | 63263 (NI) | Freude am Umgang mit Senioren | — | — | 19 | 🔴 | Anrufen |
| 15 | Diwah Ashrati | 63263 (NI) | Lehramt Studentin, 23J | — | — | 9 | 🔴 | Anrufen |
| 16 | Denise von der Heydt | 60599 (FFM) | Quereinsteigerin | **FS + Auto** | unklar | 1 | 🟡 | Anrufen — neues Formular (bewerbung_daten vorhanden), ChatGPT-Quelle |

---

### PRIO 3 — Zu wenig Informationen (12 Bewerber)

| # | Name | PLZ | Qualifikation lt. Formular | Nachricht | Alter (Tage) | Ampel | Nächster Schritt |
|---|---|---|---|---|---|---|---|
| 1 | Inka Ines Bischof | 63075 | Keine Erfahrung | Kurze Motivation | 58 | 🔴 | Anrufen |
| 2 | Akif Aydin | 63741 | Keine Erfahrung | — | 58 | 🔴 | Anrufen |
| 3 | Saba Haile | 60326 | Sonstige | — | 57 | 🔴 | Anrufen |
| 4 | Anne Dyllong | 63450 | Sonstige | — | 56 | 🔴 | Anrufen |
| 5 | samia krades | 63075 | Sonstige | Möchte Infos per Mail | 55 | 🔴 | E-Mail an kra•••@gmail.com |
| 6 | Mokhtar Al-Aqab | 63739 | Sonstige | — | 23 | 🔴 | Anrufen (ChatGPT-Quelle) |
| 7 | Radit Haile | 63303 | Engel-Bewerbung (ohne Typ) | — | 15 | 🔴 | Anrufen |
| 8 | Thomas Auner | 63069 | Sonstige | — | 26 | 🔴 | Anrufen |
| 9 | Johanna Knorrek | 60486 | Sonstige | — | 6 | 🟠 | Anrufen |
| 10 | Thomas Graffy | 65439 | Keine Erfahrung | — | 5 | 🟠 | Anrufen |
| 11 | Joy Elsner | 63165 | Sonstige | — | 5 | 🟠 | Anrufen |
| 12 | Rahwa Ghirmai | 60314 | Keine Erfahrung | — | 3 | 🟠 | Anrufen |

---

## 5. UTM-TRACKING & KANALANALYSE

### 5.1 Leads nach Quelle (source)

| Quelle | Anzahl | Typ |
|---|---|---|
| engel-bewerbung | 35 | Bewerber |
| rueckruf | 8 | Unklar (Rückrufwunsch) |
| alltagsbegleitung-darmstadt | 2 | Kunden |
| terminbuchung | 2 | Kunden (Maike Reichert 2×) |
| alltagsbegleitung-aschaffenburg | 1 | Kunden |
| alltagsbegleitung-hanau | 1 | Amela (Blockliste) |
| **Summe** | **50** | |

### 5.2 UTM-Source Verteilung

| utm_source | Anzahl | Lead-Typ |
|---|---|---|
| (leer/null) | 40 | Gemischt |
| google_jobs_apply | 7 | **Alle Bewerber** |
| chatgpt.com | 3 | **Alle Bewerber** |

**Erkenntnisse:**
- **Google Jobs** bringt 7 Bewerber (14 % aller Bewerber) — wichtiger Kanal für Recruiting
- **ChatGPT** bringt 3 Bewerber — überraschend, Alltagsengel wird offenbar in ChatGPT-Empfehlungen genannt
- **Kunden kommen ausschließlich über die Landingpages** (alltagsbegleitung-darmstadt/aschaffenburg) und Terminbuchung — kein UTM-Tracking bei Kunden
- **Rückruf-Leads haben kein UTM-Tracking** — Quelle unklar

### 5.3 Kanäle: Kunden vs. Bewerber

| Kanal | Kunden | Bewerber | Rückruf |
|---|---|---|---|
| Landingpages (alltagsbegleitung-*) | 3 | 0 | 0 |
| Engel-Bewerbung Formular | 0 | 35 | 0 |
| Terminbuchung | 2 | 0 | 0 |
| Rückrufservice | 0 | 0 | 8 |

**Fazit:** Die Kanaltrennung funktioniert perfekt — Kunden und Bewerber kommen über unterschiedliche Formulare. Rückruf-Leads sind der blinde Fleck: 8 Leads ohne jede Klassifizierung.

---

## 6. REGIONALE VERTEILUNG

| Region (PLZ-Bereich) | Kunden | Bewerber | Rückruf |
|---|---|---|---|
| 60xxx (Frankfurt) | 0 | 9 | 1 |
| 63xxx (Offenbach/Hanau/AB) | 0 | 18 | 0 |
| 64xxx (Darmstadt) | 2 | 0 | 0 |
| 65xxx (Wiesbaden/Hofheim) | 0 | 4 | 0 |
| 55xxx (Mainz) | 1 (+Dublette) | 1 | 0 |
| Ohne PLZ | 0 | 0 | 7 |

**Auffällig:**
- Starke Bewerber-Konzentration in 63xxx (Offenbach/Hanau/Aschaffenburg)
- Kunden kommen aus Darmstadt und Mainz-Bingen — dort KEINE Bewerber vorhanden
- **Regionales Mismatch:** Bewerber sind in FFM/OF/Hanau, Kunden in Darmstadt → Engel-Matching wird schwierig

---

## 7. DUBLETTEN & DATENQUALITÄT

| Problem | Details | Empfehlung |
|---|---|---|
| Maike Reichert 2× | Gleiche Person, 2 Terminbuchungen | Zusammenführen, 1 Kundenkarte |
| Amela 2× | Gleiche Person, 2 Formulare (Bewerbung + Alltagsbegleitung) | Blockliste, nicht kontaktieren |
| Spalte `art` | Meist „anfrage" — auch für Bewerber. Nur 2 neuere Einträge nutzen „bewerbung" | Neues Formular funktioniert korrekt (art=bewerbung + bewerbung_daten JSONB) |
| Spalte `lead_type` | Existiert NICHT in der DB-Tabelle | In Codebase ggf. Referenzen entfernen |
| E-Mail | Nur bei 2 von 50 Leads vorhanden | Formular-Pflichtfeld prüfen |
| PLZ leer | 7 Rückruf-Leads + 1 Bewerber ohne PLZ | Rückruf-Formular hat kein PLZ-Feld |

---

## 8. AKTIONSPLAN — PRIORISIERTE REIHENFOLGE

### SOFORT (heute / Montag 14.09.)

1. ☎️ **Maike Reichert** anrufen — 2× Terminversuch, Termin Fr 11.09 war GESTERN
2. ☎️ **MantheyIckenroth** anrufen — Herz-OP 14.08, Reha müsste bald enden
3. ☎️ **Uwe Büttner** anrufen — Demenz-Pflege, dringender Bedarf
4. ☎️ **Darleen Suhe** anrufen — 59 Tage, Pflichtanruf

### DIESE WOCHE

5. ☎️ 🟡 **Ana Rajic** (Rückruf, 2 Tage)
6. ☎️ 🟠 **Gabriela Zajder, Martina Kühl** (Rückruf, 4 Tage)
7. ☎️ 🟠 Top-Bewerber: **Ziyana Filote, Sotiris Tiropoulos, Natalie Riedl, Pashtana Gulzar**
8. ☎️ 🟡 **Denise von der Heydt** (neuer Bewerber, 1 Tag)

### NÄCHSTE WOCHE

9. ☎️ PRIO-1-Bewerber: Claudia Adjovi, Francesca Potočan, Marcel Sauer, michelle Gruber
10. ☎️ PRIO-2-Bewerber: Lena Schulz, Larissa Zeman, Julia Jaspert, Issam Gannouf
11. ☎️ Verbleibende Rückruf-Leads (ROT): Opitz, Stefanie Bendert, Demirhan, Assa Sohail, John-James

### FORTLAUFEND

12. ☎️ Alle PRIO-3-Bewerber durcharbeiten
13. 📧 samia krades per E-Mail kontaktieren (hat E-Mail-Wunsch geäußert)

---

## 9. KONTAKT-BLOCKLISTE (NICHT KONTAKTIEREN)

| Name | Grund |
|---|---|
| Amela (Sejdovic) | Blockliste — 2 Einträge in DB, beide status=contacted |
| Umut Kiran | Blockliste — kein Eintrag in lead_inquiries gefunden |
| eflex-verlag / AOK-Harburg-Fake | Blockliste — kein Eintrag in lead_inquiries gefunden |

---

## 10. HINWEISE ZUR KOMMUNIKATION

- **Absender immer:** „Alltagsengel" — KEINE persönlichen Namen
- **Begrüßung:** „Hallo Frau/Herr [Nachname],"
- **Verabschiedung:** „Herzliche Grüße, Ihr Team von Alltagsengel"
- **Entlastungsbetrag:** 131 € (NICHT 125 €)
- **Business-Mail:** info@alltagsengel.care (Strato)
- **Alle Entwürfe Status:** DRAFT_READY — NICHT versendet, Status in DB NICHT geändert

---

*Report generiert am 12.09.2026 aus Supabase-Primärdaten. Telefonnummern und E-Mails sind maskiert.*
