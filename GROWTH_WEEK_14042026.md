# Growth-Sprint — Woche 14.–20.04.2026

**Analogie:** Der Laden ist offen, Waren liegen bereit, aber keiner weiß davon. Jetzt: **Türklingel drücken, Plakate kleben, Nachbarn einladen.**

**Aktuelle Zahlen (14.04.2026):**
- 13 Kunden / 9 Engel / 6 Buchungen / 500 € Umsatz gesamt
- iOS live (18 Downloads, 20,9 % Conversion) — Google Play: v1.0.1 Einreichung diese Woche
- Web: 267 Visitors letzte 7 Tage

**Ziel Woche 1:** +10 Kunden, +3 Engel, +3 Buchungen, Google Ads live.

---

## Tag 1 (heute, Mo 14.04.) — Fundament

1. **Google Business Profile anlegen** (30 min)
   - https://business.google.com → "AlltagsEngel [Stadt]"
   - Kategorie: Pflegedienst / Seniorendienste
   - Website: alltagsengel.care
   - Foto: Logo + 3 App-Screenshots
   - Beitrag: "§45b SGB XI: 131 € jeden Monat — kennen Sie den Anspruch?"

2. **Kleinanzeigen-Stellenanzeige Engel** (20 min) — s.u. Textbaustein A

3. **Facebook-Gruppen beitreten + posten** (45 min)
   - 3 Suchen: "Pflege [Stadt]", "Angehörige [Stadt]", "Senioren [Stadt]"
   - In je 1 Gruppe: Text aus Baustein B

4. **Play Store Submission finalisieren** (60 min)
   - v1.0.1 AAB bauen (`npm run cap:build:android`)
   - Internen Test starten in Play Console
   - Demo-Kunde + Demo-Engel in Supabase anlegen für Google-Review

---

## Tag 2 (Di 15.04.) — Google Ads

1. Google Ads Konto 132-671-1476 öffnen
2. Kampagne **"Kunden Alltagsbegleitung"** starten (3 €/Tag)
   - Keywords + Anzeigen aus `GOOGLE_ADS_KAMPAGNE.md`
   - Zielseite: alltagsengel.care
   - Region: 30 km um deinen Wohnort
   - Conversion-Ziel: Registrierung
3. Kampagne **"Engel Recruiting"** starten (2 €/Tag)
   - Keywords: "alltagsbegleiter werden", "nebenjob pflege", "minijob alltagsbegleitung"
   - Zielseite: alltagsengel.care/engel/register

---

## Tag 3 (Mi 16.04.) — Lokaler Offline-Push

1. 20 Flyer drucken (Canva → DIN lang, beidseitig)
2. Auslegen bei:
   - 3 Hausärzten
   - 2 Apotheken
   - 1 Pflegestützpunkt (gleich vor Ort Gespräch suchen)
   - 1 Seniorenbüro

---

## Tag 4 (Do 17.04.) — Content

1. Instagram-Post + Story aus `kampanya/woche-1/instagram.md`
2. TikTok-Reel (30 Sek) nach Strategie `kampanya/woche-2/tiktok.md`
3. LinkedIn-Post (nur UG-Gründer-Story, keine Werbung)

---

## Tag 5 (Fr 18.04.) — Partnerschaft anbahnen

1. Anruf oder Mail an 2 lokale Pflegedienste:
   - "Wir machen Alltagsbegleitung (§45b), Sie machen SGB V — Kooperation statt Konkurrenz?"
2. Termin bei Pflegestützpunkt anfragen

---

## Tag 6–7 (Sa/So 19.–20.04.) — Review + Nachsteuern

1. Google-Ads-Kennzahlen ansehen:
   - CPC, CTR, Conversions
2. Registrierungen in Supabase checken (Analytics-MIS-Dashboard)
3. Keywords mit 0 Klicks ausbauen, Keywords mit hohen Kosten drosseln
4. 1 Beta-Tester (Marika/Hasan/Ali) anrufen: ehrliches Feedback

---

## Textbausteine

### A) Kleinanzeigen — Engel-Stellenanzeige

**Titel:** Alltagsbegleiter/in gesucht — flexibel, sinnvoll, sofortige Auszahlung

**Text:**
> AlltagsEngel sucht zuverlässige Alltagsbegleiter/innen (m/w/d) in [Stadt] auf Minijob-Basis.
>
> **Deine Aufgaben:**
> Einkäufe, Arztbegleitung, Spaziergänge, Gesellschaft leisten für Senioren in deiner Nähe.
>
> **Was wir bieten:**
> - Flexible Zeiten — du entscheidest wann
> - Bezahlung direkt nach Einsatz
> - Versichert über Plattform
> - Direkte App-Abrechnung, kein Papierkram
>
> **Was du mitbringst:**
> - Empathie & Geduld
> - Führungszeugnis (ohne Eintrag)
> - §45a SGB XI Zertifikat (oder Bereitschaft nachzuholen — wir helfen)
>
> Bewerbung direkt in der App: **alltagsengel.care** oder per E-Mail an info@alltagsengel.care

### B) Facebook-Gruppe — Angehörige

> Kurze Info für Angehörige pflegebedürftiger Menschen:
>
> Wusstet ihr, dass jeder mit Pflegegrad 1–5 monatlich **131 € Entlastungsbetrag** von der Pflegekasse bekommt? Dieses Geld können Mama/Papa nutzen für Einkaufsbegleitung, Arztfahrten, Spaziergänge, Gesellschaft.
>
> Die meisten Familien wissen das nicht oder nutzen es nicht — das Geld verfällt dann jeden Monat.
>
> Ich habe dafür eine App gebaut: **AlltagsEngel** — verbindet euch mit zertifizierten Alltagsbegleitern, direkt mit der Pflegekasse abgerechnet, kein Eigenanteil.
>
> Wer Fragen hat, gern PN oder: **alltagsengel.care**

### C) Instagram / TikTok — Hook-Zeile

- "131 € jeden Monat — verschenkt."
- "Deine Oma hat Pflegegrad 2. Sie bekommt monatlich 131 € geschenkt. Und weißt du was? Wahrscheinlich weiß sie es nicht."
- "Die meisten wissen das nicht: §45b SGB XI — hier ist, wie es geht."

---

## Kennzahlen die wir **nicht** aus dem Auge verlieren

| Metrik | Woche-1-Ziel | Aktuell |
|--------|--------------|---------|
| Registrierte Kunden | 23 (+10) | 13 |
| Registrierte Engel | 12 (+3) | 9 |
| Abgeschlossene Buchungen | 9 (+3) | 6 (nur 1 `completed`) |
| Google-Ads-Klicks | 50 | 0 |
| iOS Downloads | 30 (+12) | 18 |
| Play Store | Eingereicht | Vorbereitet |

**Wöchentliche Retro:** Jeden Sonntag 18:00 in Supabase-MIS-Dashboard Zahlen ziehen und in `memory/projects/alltagsengel.md` als neue Zeile.
