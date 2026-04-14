# Play Store Submission — TUTANAK 15.04.2026

**Analoji:** Mağaza vitrin tabelasını asıyorsun. Ürün (AAB) hazır, fotoğraflar çekilmiş, fiyat etiketi yazılmış. Sadece Google'ın vitrinin önündeki onay kâğıdını imzalaması gerekiyor.

## Bir bakışta — neye bakıyoruz

| Ne | Durum | Yer |
|------|-------|-----|
| AAB v1.0.1 (versionCode 2) | ✅ Hazır | `android/app/build/outputs/bundle/release/app-release.aab` (5.4 MB) |
| Demo Hesap Kunde | ✅ Canlı | `demo.kunde@alltagsengel.care` / `DemoKunde2026!` |
| Demo Hesap Engel | ✅ Canlı | `demo.engel@alltagsengel.care` / `DemoEngel2026!` |
| App-Icon 512×512 | ✅ Hazır | `public/icon-512x512.jpg` |
| Feature-Grafik 1024×500 | ✅ Hazır | `public/feature-graphic-1024x500.jpg` |
| 5 Screenshots | ✅ Hazır | `marketing/images/app-store-screenshots/` |
| Listing-Texte (DE) | ✅ Hazır | `docs/store/GOOGLE_PLAY_STORE_METADATA.md` |
| Datenschutz/Impressum URLs | ✅ Live | `https://alltagsengel.care/datenschutz` & `/impressum` |
| Identity verified, $25 paid | ✅ | 06–08.04.2026 |

## Sıra ile (yan yana yapıyoruz, her adım ~5 dk)

### ADIM 1 — Play Console aç & App-Eintrag oluştur (10 dk)

1. Aç: https://play.google.com/console
2. Sol üstte "App erstellen" / "App anlegen" tıkla
3. Doldur:
   - **App-Name:** `AlltagsEngel`
   - **Standardsprache:** `Deutsch (de-DE)`
   - **App oder Spiel:** `App`
   - **Kostenlos / kostenpflichtig:** `Kostenlos`
   - Beide Erklärungen (Richtlinien & US-Exportgesetze) ankreuzen → **Erstellen**

### ADIM 2 — Store-Eintrag (Hauptlisting) (15 dk)

Soldaki menüden: **Wachstum → Store-Präsenz → Haupteintrag im Store**.

Copy-paste hazır metinler `docs/store/GOOGLE_PLAY_STORE_METADATA.md`'den:

- **Kurzbeschreibung (max 80 Zeichen):**
  `Alltagsbegleitung für Senioren — 131€/Monat über die Pflegekasse`
- **Vollständige Beschreibung:** o dosyadaki uzun metni kopyala (~3500 karakter)
- **App-Symbol:** `public/icon-512x512.jpg` upload
- **Feature-Grafik:** `public/feature-graphic-1024x500.jpg` upload
- **Telefon-Screenshots:** `marketing/images/app-store-screenshots/screenshot-1...5-*.png` (5 adet drag&drop)

→ Sağ üstte **Speichern**.

### ADIM 3 — App-Inhalte Fragebögen (Pflicht) (15 dk)

Soldaki menüden: **Richtlinien → App-Inhalte**. Şunları doldur:

#### A) Datenschutzerklärung
- URL: `https://alltagsengel.care/datenschutz`

#### B) App-Zugriff (DEMO ACCOUNTS!)
- "Wird ein Teil deiner App eingeschränkt?" → **Ja, manche Funktionen erfordern Anmeldung**
- "Anweisungen für Tester":
  ```
  App öffnen → Splash → Rollenauswahl
  Test-Kunde: demo.kunde@alltagsengel.care / DemoKunde2026!
  Test-Engel: demo.engel@alltagsengel.care / DemoEngel2026!
  Beide E-Mails sind bereits bestätigt.
  ```

#### C) Werbung
- "Enthält deine App Werbung?" → **Nein**

#### D) Inhaltseinstufung (Altersfreigabe)
- Fragebogen başlat → Kategorie: **Soziale Netzwerke / Lifestyle / Gesundheit**
- Şiddet/Sex/Drogen → **alle Nein**
- Sonuç: Muhtemelen **USK 0 / PEGI 3** çıkar → Onayla.

#### E) Zielgruppe und Inhalt
- Zielgruppe: **18+** (Pflegekontext)
- Kinderspezifisch: **Nein**

#### F) Daten-Sicherheit (en uzunu, ~10 dk)
- Werden Daten erfasst? **Ja**
- Werden weitergegeben? **Ja** (Service Provider: Supabase, Resend, Vercel, Firebase)
- Verschlüsselung im Ruhezustand & während Übertragung? **Ja**
- Nutzer kann Daten löschen lassen? **Ja**
- Hangi veriler:
  - Name (für Konto)
  - E-Mail (für Konto + Benachrichtigungen)
  - Telefon (für Buchungen)
  - Adresse / Standort (für Engel-Match)
  - Foto (Profilbild — optional)
  - Auth-Info (für Login)

#### G) Government Apps / News-App / Covid-Tracing → **Nein**, Nein, Nein

### ADIM 4 — AAB Upload + Test-Track (15 dk)

Soldaki menüden: **Test → Interner Test** (zuerst!).

1. **Neue Version erstellen**
2. **App-Bundle hochladen** → `app-release.aab` (`/Users/work/alltagsengel/android/app/build/outputs/bundle/release/app-release.aab`)
3. **Versionsname:** `1.0.1`
4. **Versionshinweise (DE):**
   ```
   Erste Veröffentlichung von AlltagsEngel.

   - Zertifizierte Alltagsbegleiter buchen
   - Pflegebox & Hygienebox bestellen
   - Krankenfahrt buchen (DRK Fulda Partner)
   - Angehörigen-Modus: für pflegebedürftige Verwandte buchen
   - Push-Benachrichtigungen für Buchungsbestätigungen
   ```
5. Tester: Senin E-Mail'in (yusuf@alltagsengel.care?) ekle
6. **Speichern → Überprüfen → Rollout starten**

→ ~15 dk içinde "Internal Testing"de erişilebilir olur. Sen kendi Android'inde test edebilirsin.

### ADIM 5 — Produktion-Track (Test'ten sonra)

İç test başarılı olunca:
1. **Produktion → Neue Version erstellen**
2. AAB'yi seç (zaten upload'lı, "Aus früherer Version übernehmen" tıkla)
3. Versionshinweise yapıştır
4. **Rollout-Strategie:** %20 → %50 → %100 (Staged Rollout) — risk azaltma
5. **Speichern → Überprüfen → Rollout starten**

### ADIM 6 — Beklemek (Google review)

- Erste Veröffentlichung: **3–14 gün** (genelde 5–7)
- E-Mail bildirimi gelir
- Ret olursa: Sebep gösterir → düzelt → tekrar gönder

## Reddedilmemek için son kontrol

| Hata | Çözüm |
|------|-------|
| Demo-Account çalışmıyor | ✅ Bugün test ettim, ikisi de canlı + onaylı |
| Datenschutz erişilemez | ✅ Live: `curl -I https://alltagsengel.care/datenschutz` → 200 |
| Berechtigungen erklärt değil | ✅ Description'da Kamera/Standort/Push gerekçesi var |
| App-Name tutarsız | ✅ Manifest'te ve Listing'de `AlltagsEngel` |
| COVID iddiası | ✅ Hiçbir yerde COVID kelimesi yok |
| Sahte/yanıltıcı bilgi | ✅ §45b SGB XI gerçek (Almanya pflege yasası) |

## Ben yardımcı olabilirim:

- AAB'yi tekrar build edip yeni bir versiyon hazırlamak (gerekirse)
- Demo-Account credentials'ları tekrar resetlemek (gerekirse)
- Reddetme sebebine cevap yazmak (gerekirse)
- Yeni Screenshots üretmek (gerekirse)

**Manuel yapman gerekenler (ben yapamam):** Play Console UI'a giriş, formları doldurma, AAB upload, "Rollout starten" tıklaması.

---
**Bugün başla → 1 hafta sonra Play Store'da.**
