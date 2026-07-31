# Alltagsengel Desktop-App (Tauri v2)

Die Desktop-App verpackt das Next.js-Frontend in eine native App für
macOS, Windows und Linux — mit Tauri v2 (Rust-Backend + System-Webview,
Binaries ~10 MB statt ~150 MB bei Electron).

## Struktur

```
src-tauri/
├── tauri.conf.json        # App-Konfiguration (Fenster, Bundle, Build)
├── Cargo.toml             # Rust-Abhängigkeiten
├── build.rs               # Tauri-Build-Glue (nicht anfassen)
├── capabilities/
│   └── default.json       # Berechtigungen des Hauptfensters
├── icons/                 # App-Icons (aus public/icon-512x512.png)
└── src/
    ├── main.rs            # Desktop Entry Point
    └── lib.rs             # App-Setup (Desktop + später Mobile geteilt)
```

## Voraussetzungen

1. **Rust + Cargo** (via rustup):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
   Danach Terminal neu öffnen — `cargo --version` muss funktionieren.
2. **Tauri CLI** — ist als npm-devDependency (`@tauri-apps/cli`) im Projekt,
   `npm install` reicht. Kein globales Install nötig.
3. **macOS:** Xcode Command Line Tools (`xcode-select --install`).
   **Windows:** Microsoft C++ Build Tools + WebView2 (auf Win 11 vorinstalliert).
   **Linux:** `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`,
   `libayatana-appindicator3-dev`, `librsvg2-dev`.
4. Einmalig das volle Icon-Set generieren (`.icns` für macOS, `.ico` für
   Windows — aus dem bestehenden goldenen App-Icon, KEINE neuen Grafiken):
   ```bash
   npm run tauri:icons
   ```

## Entwicklung

```bash
npm run tauri:dev
```
Startet `next dev` (localhost:3000) und öffnet das Desktop-Fenster darauf.
Hot Reload funktioniert wie im Browser.

## Production-Build

**Wichtig — Static Export:** Tauri bündelt statische Dateien (`../out`)
und kann keinen Node-Server ausliefern. Die Website nutzt aber
Server-Features (Redirects, Middleware, ISR, API-Routen). Es gibt zwei Wege:

**Weg A — Static Export (empfohlen für den App-Umfang):**
In `next.config.ts` konditional aktivieren (nur wenn `TAURI_BUILD=1`, damit
der Vercel-Deploy unverändert bleibt):
```ts
...(process.env.TAURI_BUILD ? { output: 'export' } : {}),
```
`beforeBuildCommand` in `tauri.conf.json` setzt `TAURI_BUILD=1` bereits.
Seiten mit Server-Logik (API-Routen, Middleware) sind im Export nicht
enthalten — die App spricht Supabase ohnehin direkt vom Client an.

**Weg B — Remote-Shell:** Statt `frontendDist` einfach die Live-Site laden
(`"frontendDist": "https://alltagsengel.care"` in `tauri.conf.json`).
Kein Export nötig, aber App erfordert Internet — für den Büro-Einsatz oft
völlig ausreichend und in 5 Minuten ausgeliefert.

### Build-Kommandos

```bash
npm run tauri:build            # Build für das aktuelle System
npm run tauri:build:mac        # macOS Universal (Intel + Apple Silicon)
npm run tauri:build:win        # Windows x64 (nur AUF Windows ausführbar!)
```

Für den Mac-Universal-Build einmalig die Targets installieren:
```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
```

Cross-Compiling macOS→Windows wird von Tauri nicht unterstützt — der
Windows-Build läuft auf einer Windows-Maschine oder in GitHub Actions
(`tauri-apps/tauri-action` baut alle drei Plattformen in einem Workflow).

Ergebnis liegt unter `src-tauri/target/release/bundle/`:
- macOS: `.app` + `.dmg`
- Windows: `.msi` (WiX) + `.exe` (NSIS)
- Linux: `.deb`, `.rpm`, `.AppImage`

## Signieren

### macOS (Apple Developer Account ist vorhanden)

1. Im Developer-Portal ein **Developer ID Application**-Zertifikat erzeugen
   und in den Schlüsselbund importieren (Xcode → Settings → Accounts →
   Manage Certificates → „Developer ID Application").
2. Identität prüfen: `security find-identity -v -p codesigning`
3. Signatur konfigurieren (Umgebungsvariablen beim Build):
   ```bash
   export APPLE_SIGNING_IDENTITY="Developer ID Application: Alltagsengel UG (TEAMID)"
   npm run tauri:build:mac
   ```
4. **Notarisierung** (Pflicht für Verteilung außerhalb des App Store):
   ```bash
   export APPLE_ID="<Apple-ID der Organisation>"
   export APPLE_PASSWORD="<App-spezifisches Passwort>"
   export APPLE_TEAM_ID="<TEAMID>"
   ```
   Tauri notarisiert dann automatisch beim Build. Hinweis: Der Account wird
   gerade auf Organisation umgestellt (Fall #102935816726) — Zertifikate
   erst NACH der Umstellung erzeugen, sonst laufen sie auf die Einzelperson.
5. App Store-Variante: statt Developer ID ein „Apple Distribution"-Zertifikat
   + Provisioning Profile, Upload via Transporter.

### Windows

Code-Signing-Zertifikat (OV/EV, z. B. Sectigo/DigiCert) nötig, sonst warnt
der SmartScreen-Filter. Konfiguration in `tauri.conf.json` unter
`bundle.windows.certificateThumbprint` bzw. via `signtool` in CI.

### Updater (später)

Tauri bringt einen eingebauten Updater mit (`tauri-plugin-updater`):
Ed25519-Schlüsselpaar via `npm run tauri signer generate`, Public Key in die
Config, signierte Releases auf einen Static Host (z. B. GitHub Releases).

## Häufige Fehler

| Fehler | Lösung |
| --- | --- |
| `failed to run custom build command for tauri-build` | Rust fehlt/veraltet: `rustup update` |
| `frontendDist ../out not found` | Weg A aktivieren oder Weg B nutzen (siehe oben) |
| Weißes Fenster im Dev-Modus | `npm run dev` läuft nicht auf Port 3000 |
| macOS: „App ist beschädigt" | Nicht signiert/notarisiert — siehe Signieren |
