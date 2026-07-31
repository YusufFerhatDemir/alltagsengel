# Pricing-Modell — efy care Abrechnungsplattform

**Stand:** 31.07.2026 · **Erstellt für:** Alltagsengel UG / efy care
**Prämisse:** Kein Fremdkapital, Einnahmen ab Tag 1, Infrastruktur muss sich ab dem ersten Kunden selbst tragen.

---

## 1. Marktüberblick

| Kennzahl | Wert | Quelle |
|---|---|---|
| Ambulante Pflegedienste in Deutschland | ~18.000 (17.938) | Pflegestatistik / pflegemarkt.com |
| Versorgte Klienten gesamt | ~2,3 Mio. | Pflegestatistik 2025 |
| Ø Klienten pro Dienst | ~128 (Median deutlich niedriger) | pflegemarkt.com 03/2026 |
| Dienste mit < 50 Klienten | ~50 % | pflegemarkt.com |
| Dienste mit > 150 Klienten | ~11 % | pflegemarkt.com |
| Beschäftigte ambulant gesamt | ~443.000 → Ø ~25 MA pro Dienst | Destatis |

**Kernerkenntnis:** Der Markt ist ein Mittelstands-/Kleinbetriebsmarkt. Die Hälfte aller Dienste hat unter 50 Klienten — genau dort tun 5.000–15.000 € Einmalkosten (Medifox, Vivendi) am meisten weh und dort ist die Zahlungsbereitschaft für eine faire Flatrate am höchsten.

---

## 2. Kostenkalkulation

### 2.1 Fixkosten (monatlich, unabhängig von Kundenzahl)

| Position | Kosten/Monat | Anmerkung |
|---|---|---|
| Supabase Pro | ~23 € ($25) | 8 GB DB, 100 GB Storage, 250 GB Egress inkl. |
| Vercel Pro (1 Seat) | ~18 € ($20) | 1 TB Bandbreite inkl., $20 Usage-Credit |
| Domain + DNS + SSL | ~5 € | SSL via Vercel kostenlos, Domain + Mail-Routing |
| ITSG-Zertifikat (OSTC) | ~2 € | ~72 € netto / 3 Jahre Laufzeit |
| SMC-B Karte (Pflege) | ~8 € | ~400–500 € / 5 Jahre (D-Trust), größtenteils über TI-Pauschale refinanzierbar |
| KIM-Adresse | ~8 € | je nach Anbieter 5–10 €/Monat |
| Transaktionsmails (Resend/Postmark Basis) | ~9 € | bis 50.000 Mails/Monat |
| Monitoring/Backups extern | ~5 € | S3-kompatibles Offsite-Backup |
| **Summe Fixkosten** | **~78 €/Monat** | **< 1.000 €/Jahr Grundlast** |

> Später (ab ~30–40 Kunden) sinnvoll: Supabase Team ($599/Monat) wegen SOC-2/ISO-27001-Nachweis und 14-Tage-Backups. Das ist ein Wachstums-Upgrade, kein Startbedarf — DSGVO-Konformität ist auch auf Pro gegeben (EU-Region, AVV vorhanden).

### 2.2 Variable Kosten pro Mandant (Infrastruktur)

Annahmen pro Klient und Monat (konservativ gerechnet):

| Ressource | Annahme | Basis |
|---|---|---|
| DB-Speicher (strukturierte Daten) | ~0,5 MB/Klient/Monat | Verordnungen, Leistungsnachweise, Rechnungen, Touren = Textzeilen, kaum Volumen |
| Datei-Storage | ~8 MB/Klient/Monat | 4–6 Scans/PDFs à 1–2 MB (Verordnung, LNW, Unterschriften) |
| Bandbreite | ~150 MB/aktivem User/Monat | App-Sync, PDF-Downloads |
| EDIFACT-Erzeugung + PKCS#7 | vernachlässigbar | Edge-Function-Sekunden, im Kontingent |
| Transaktionsmails | ~0,001 €/Mail, ~50 Mails/Mandant/Monat | Rechnungsversand, Statusmails |

**Ergebnis pro Mandantengröße (marginale Infrastrukturkosten/Monat):**

| Mandant | Klienten | MA | DB-Wachstum | Storage-Wachstum | Bandbreite | Marginalkosten/Monat |
|---|---|---|---|---|---|---|
| Klein | 10 | 5 | ~5 MB | ~80 MB | ~0,8 GB | **~0,50 €** |
| Mittel | 50 | 20 | ~25 MB | ~400 MB | ~3 GB | **~2,50 €** |
| Groß | 200+ | 50+ | ~100 MB | ~1,6 GB | ~8 GB | **~9,00 €** |

Selbst ein Großkunde kostet unter 10 €/Monat an Infrastruktur. Die Supabase-Pro-Kontingente (100 GB Storage) reichen rechnerisch für **~2 Jahre mit 30–50 Mandanten**, bevor Overage-Kosten (Storage $0,021/GB, Egress $0,09/GB) überhaupt relevant werden. **SaaS-Bruttomargen von 90 %+ sind hier strukturell gegeben.**

### 2.3 Nicht-Infrastruktur-Kosten (ehrlich gerechnet)

| Position | Kosten | Anmerkung |
|---|---|---|
| Onboarding-Aufwand pro Kunde | ~4–8 h Arbeitszeit | Datenmigration, Kassen-Stammdaten, Schulung (remote) |
| Support laufend | ~0,5–1 h/Kunde/Monat | anfangs mehr, sinkt mit Reife |
| ITSG-Zulassungsverfahren (einmalig) | Anhörungs-/Prüfaufwand | Zeit, kein großes Geld — Pflicht für DTA-Direktversand |

---

## 3. Pricing-Modell

### Prinzipien

1. **Flatrate statt Prozent.** DMRZ & Factoring-Anbieter bestrafen Wachstum (0,5 % von 50.000 € = 250 €/Monat). Wir nicht — das ist DAS Verkaufsargument.
2. **Niedrige Einstiegshürde.** Keine 5.000-€-Lizenz wie Medifox/Vivendi. Kleine Dienste müssen ohne Bankgespräch starten können.
3. **Staffelung nach Klienten** (nicht nach MA) — Klientenzahl korreliert mit Abrechnungsvolumen und Nutzen.
4. **Jeder Tier deckt seine Kosten um ein Vielfaches** — kein Tier ist Quersubvention.

### 3.1 Einmalige Setup-Gebühr (Onboarding + Datenmigration)

| Tier | Setup-Gebühr | Enthalten |
|---|---|---|
| S | **199 €** | Mandant-Einrichtung, Kassen-Stammdaten, 1 h Remote-Schulung |
| M | **399 €** | + Datenmigration Klienten/MA aus Altsystem (CSV/Export), 2 h Schulung |
| L | **799 €** | + begleitete Parallelabrechnung 1 Monat, 4 h Schulung |
| XL | **1.490 €** | + dedizierter Migrationsplan, Vor-Ort/Video-Workshops |

Deckt bei 4–8 h Aufwand die Onboarding-Kosten und filtert Nicht-Ernst-Interessenten, bleibt aber eine Größenordnung unter Medifox (5.000–15.000 €).

**Launch-Aktion:** Für die ersten 10 Pilotkunden Setup **0 €** gegen Referenz + Feedback-Calls. Das ist unser Marketing-Budget — wir haben keins in Geld, also zahlen wir in verzichteter Setup-Gebühr.

### 3.2 Monatliche Flatrate

| | **Tier S** | **Tier M** | **Tier L** | **Tier XL** |
|---|---|---|---|---|
| Klienten | bis 20 | 21–100 | 101–300 | 300+ |
| **Launch-Preis/Monat** | **49 €** | **99 €** | **199 €** | **349 €** |
| Listenpreis (ab Jahr 2) | 69 € | 149 € | 279 € | 449 € |
| User (MA-Accounts) | 10 | 40 | 100 | unbegrenzt |
| Speicher inkl. | 5 GB | 20 GB | 50 GB | 100 GB |
| DTA/EDIFACT-Abrechnung | ✓ unbegrenzt | ✓ unbegrenzt | ✓ unbegrenzt | ✓ unbegrenzt |
| Leistungsnachweise, Touren, Dienstplan | ✓ | ✓ | ✓ | ✓ |
| Support | E-Mail (48 h) | E-Mail + Chat (24 h) | Priorität (8 h) | Dedizierter Kontakt |

**Add-ons:** zusätzlicher Speicher 5 €/10 GB · zusätzliche User 2 €/User · Premium-Support (Telefon, 4 h Reaktion) 49 €/Monat · API-Zugang 99 €/Monat (Tier L/XL inkl.).

**Launch-Preise gelten lebenslang für Kunden, die im ersten Jahr abschließen** („Founding Member"-Preis). Erzeugt Dringlichkeit ohne Rabattschlachten.

### 3.3 Konkurrenzvergleich

| Anbieter | Kostenstruktur | Beispiel: Dienst mit 50 Klienten, ~50.000 € Abrechnung/Monat | Was fehlt |
|---|---|---|---|
| **dakota.le** | 200 € einmalig + 50 €/Jahr + Zertifikat | ~7 €/Monat | Nur Transportverschlüsselung — keine Software, keine Abrechnung, keine Doku |
| **DMRZ** | ab 0,5 % vom Volumen (Tarifmodelle, Inklusivvolumen, dann 0,6 %/0,2 %) | **~250 €/Monat** | Wächst mit dem Umsatz mit — bestraft Erfolg |
| **Optica/Noventi (Factoring)** | 1–3 % vom Volumen | **500–1.500 €/Monat** | Vorfinanzierung inklusive, aber sehr teuer |
| **Medifox DAN** | 5.000–15.000 € einmalig + Wartung; mtl. „niedriger bis mittlerer dreistelliger Bereich" | ~200–500 €/Monat + Einmalkosten | Hohe Einstiegshürde, Preise nur auf Anfrage |
| **Connext Vivendi** | 10.000 €+ einmalig, Enterprise-orientiert | für kleine Dienste unerreichbar | Overkill unter 100 MA |
| **snap ambulant** | Preise auf Anfrage, mtl. dreistellig | ~150–400 €/Monat | Intransparent |
| **efy care** | **399 € Setup + 99 €/Monat flat** | **99 €/Monat — für immer, egal wie viel abgerechnet wird** | — |

**Positionierung:** „Alles drin. Ein Preis. Kein Prozent." — Wir sind bei jedem Vergleichskunden 50–80 % günstiger als DMRZ/Factoring und ohne die Kapitalhürde von Medifox/Vivendi.

---

## 4. Unit Economics

### 4.1 CAC (Customer Acquisition Cost)

Nur kostenlose Kanäle (Vorgabe): SEO/City-Pages, Pflegedienst-Verzeichnisse, LinkedIn, Empfehlungen, Branchengruppen, Direktansprache.

- Aufwand pro gewonnenem Kunden: ~5–10 h Vertriebszeit → kalkulatorisch **100–200 €**
- Mit Referenzkunden + Empfehlungsprogramm (1 Monat gratis pro Empfehlung ≈ 99 € Kosten) sinkt CAC weiter.

### 4.2 LTV (Lifetime Value)

Pflegesoftware hat extrem hohe Wechselkosten (Datenmigration, Schulung, Kassenanbindung). Branchentypische Haltedauer: **5+ Jahre**, konservativ mit 4 Jahren (48 Monate) und 2 % Monats-Churn-Äquivalent gerechnet:

| Tier | MRR | Bruttomarge | LTV (48 Mon.) | CAC | **LTV/CAC** |
|---|---|---|---|---|---|
| S | 49 € | ~95 % | ~2.230 € | 150 € | **~15×** |
| M | 99 € | ~95 % | ~4.510 € | 150 € | **~30×** |
| L | 199 € | ~93 % | ~8.880 € | 200 € | **~44×** |
| XL | 349 € | ~92 % | ~15.400 € | 300 € | **~51×** |

Benchmark „gesund" ist LTV/CAC ≥ 3. Wir liegen weit darüber, weil CAC aus Zeit statt Geld besteht und die Infrastrukturkosten minimal sind.

### 4.3 Break-Even

Fixkosten ~78 €/Monat (Infrastruktur komplett):

- **Infrastruktur-Break-Even: 2 Kunden** (2× Tier S = 98 €).
- Mit realistischem Overhead (Buchhaltung, Versicherung, Tools ~300 €/Monat): **Break-Even bei 4–6 Kunden**.
- Ab ~35 Kunden (Mix) trägt die Plattform ein Gehalt: ~3.500–4.000 € MRR bei < 400 € Kosten.

### 4.4 Marge pro Tier (Launch-Preise, inkl. anteiligem Support)

| Tier | MRR | Infra marginal | Support kalk. (0,5–1 h) | **Deckungsbeitrag** | **Marge** |
|---|---|---|---|---|---|
| S | 49 € | 0,50 € | ~15 € | 33,50 € | ~68 % |
| M | 99 € | 2,50 € | ~20 € | 76,50 € | ~77 % |
| L | 199 € | 9,00 € | ~30 € | 160 € | ~80 % |
| XL | 349 € | 15,00 € | ~40 € | 294 € | ~84 % |

---

## 5. Revenue-Projektion (konservativ, nur kostenlose Kanäle)

Annahme: 1–2 Neukunden/Monat in H1, 3–4/Monat ab Referenzen (M7+), Mix 40 % S / 40 % M / 15 % L / 5 % XL, Churn 1 %/Monat.

| Monat | Kunden | MRR | Setup-Erlöse kumuliert | Kosten/Monat | Cashflow/Monat |
|---|---|---|---|---|---|
| M3 | 4 (Piloten, Setup 0 €) | ~300 € | 0 € | ~380 € | ~-80 € |
| M6 | 9 | ~800 € | ~1.200 € | ~400 € | ~+400 € |
| M12 | 25 | ~2.400 € | ~7.500 € | ~500 € | **~+1.900 €** |
| M18 | 45 | ~4.400 € | ~15.000 € | ~700 € | ~+3.700 € |
| M24 | 75 | ~7.400 € | ~27.000 € | ~1.400 € (inkl. Supabase Team) | **~+6.000 €** |

- **Jahr 1 Umsatz:** ~20.000–25.000 € (MRR + Setups)
- **Jahr 2 Umsatz:** ~65.000–80.000 €
- Bei 75 Kunden sind erst **0,4 %** des Marktes (18.000 Dienste) erreicht — enormes Restpotenzial. 1 % Marktanteil (180 Kunden) ≈ **18.000 € MRR**.

---

## 6. Monetarisierungs-Extras (ab Jahr 2, kein Launch-Fokus)

| Extra | Modell | Potenzial | Anmerkung |
|---|---|---|---|
| **Pflegeboxen-Vermittlung** | Provision pro vermittelter Box (Entlastungsbetrag 131 €/Monat je Klient) | 5–10 €/Klient/Monat Provision üblich | Natürlicher Fit: Klienten sind schon im System, ein Klick im Workflow |
| **Fortbildungs-Marketplace** | 15–20 % Provision auf Pflichtfortbildungen | mittel | MA-Daten + Qualifikationen liegen vor — Erinnerung + Buchung in einem |
| **Versicherungs-Vermittlung** | Lead-Provision (Betriebshaftpflicht etc.) | klein, passiv | Nur mit seriösen Partnern, keine Bezahl-Leads einkaufen |
| **White-Label-API** | 499–999 €/Monat pro Softwarehersteller | hoch, ab ITSG-Zulassung | Andere Hersteller sparen sich eigenes DTA-Modul — wir werden Infrastruktur |
| **Anonymisierte Branchendaten** | Reports/Benchmarks, DSGVO-konform aggregiert | später, ab ~200 Mandanten | „Was zahlt Kasse X wirklich in Region Y" — nur mit AVV + Aggregation ≥ k-Anonymität |

**Wichtigster Hebel:** Die White-Label-API. Ein eigenes ITSG-zugelassenes DTA-Modul ist genau das, was Dutzende kleine Softwareanbieter teuer bei der ITSG (dakota.ag-Lizenzierung) einkaufen.

---

## 7. Empfehlung Launch-Pricing (Zusammenfassung)

1. **Sofort:** 10 Pilotkunden mit Setup 0 € + Founding-Member-Preis (49/99/199/349 €) lebenslang. Ziel: Referenzen + Fehlerbereinigung unter Echtlast.
2. **Ab Kunde 11:** Setup-Gebühren aktivieren (199–1.490 €). Launch-Monatspreise bis Ende Jahr 1 halten.
3. **Jahr 2:** Listenpreise (69/149/279/449 €) für Neukunden. Bestandskunden behalten Founding-Preis — Loyalität ist in dieser Branche mehr wert als 30 € Delta.
4. **Nie prozentual abrechnen.** Das ist die Kernbotschaft gegen DMRZ/Factoring und der Grund, warum Kunden bleiben, wenn sie wachsen.
5. **Supabase Team ($599) erst ab ~35–40 zahlenden Kunden** buchen (SOC-2-Argument für Tier-L/XL-Vertrieb), vorher Pro behalten.
6. **Kostenrisiko ist praktisch null:** 78 €/Monat Grundlast, Break-Even bei 2 Kunden. Das Modell trägt sich ab dem ersten Monat mit Piloten + einem zahlenden Kunden.

---

### Quellen (Recherche 31.07.2026)

- Supabase Pricing: supabase.com/pricing via uibakery.io, makerkit.dev, schematichq.com (Pro $25: 8 GB DB, 100 GB Storage, 250 GB Egress; Team $599)
- Vercel Pricing: schematichq.com, temps.sh (Pro $20/Seat, 1 TB Bandbreite, Overage $0,15/GB)
- ITSG Trust Center Preisliste: itsg.de (OSTC-Zertifikat 72 € netto/3 Jahre)
- dakota.le: dakota-le.com (200 € Lizenz, 50 €/Jahr Wartung, Zertifikat 45–60 €/3 Jahre)
- DMRZ Preisliste: dmrz.de/preisliste (ab 0,5 %; Professional: 30.000 € Inklusivvolumen, 0,6 %/0,2 % darüber)
- Medifox/snap/Vivendi: familienpflege-altenpflegewerk.de, ki-syndikat.de, euregon.de (Preise auf Anfrage, mtl. dreistellig, Einmalkosten 5.000 €+)
- Marktdaten: pflegemarkt.com (17.938 Dienste, Ø 128 Klienten, 50 % < 50 Klienten), Destatis (443.000 Beschäftigte ambulant)
- SMC-B/KIM: d-trust.net, heilberufsausweis.de, gematik.de (SMC-B ~400–500 €/5 J., KIM 5–10 €/Monat, TI-Pflicht ambulant seit 07/2025, Refinanzierung via TI-Pauschale)
