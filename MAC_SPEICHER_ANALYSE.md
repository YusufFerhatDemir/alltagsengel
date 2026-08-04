# Mac Speicheranalyse — KRITISCH

**Status:** Nur 1.7 GB von 228 GB frei (88% belegt)  
**Ursache Kernel Panic:** watchdog timeout, LOW swap space, 12 swapfiles

---

## Löschbare Daten (~43 GB)

| Pfad | Größe | Löschbar | Ersparnis | Risiko |
|------|-------|----------|-----------|--------|
| ~/Library/Application Support/Claude/**vm_bundles** | 21.0 GB | ✅ Ja | ~21 GB | Niedrig — wird bei Bedarf neu geladen |
| ~/Library/Developer/**CoreSimulator/Devices** | 7.0 GB | ✅ Ja | ~5 GB | Niedrig — alte Simulator-Geräte |
| ~/Library/Application Support/Google/Chrome/**OptGuideOnDeviceModel** | 4.0 GB | ✅ Ja | ~4 GB | Niedrig — Chrome AI-Modell, lädt sich neu |
| ~/Library/**Caches** (gesamt) | 3.1 GB | ✅ Ja | ~3 GB | Niedrig |
| ~/.npm (npm Cache) | 2.5 GB | ✅ Ja | ~2.5 GB | Niedrig |
| ~/Library/Application Support/Claude/**local-agent-mode-sessions** | 2.0 GB | ✅ Ja | ~1.5 GB | Niedrig |
| /private/var/vm/**sleepimage** | 2.0 GB | ⚠️ Bedingt | ~2 GB | Mittel |
| ~/Library/Caches/**ShipIt** (Claude + GitHub Updates) | 1.5 GB | ✅ Ja | ~1.5 GB | Niedrig |
| ~/Library/Developer/Xcode/**DerivedData** | 855 MB | ✅ Ja | ~855 MB | Niedrig |
| ~/Library/Application Support/Claude/**Cache + Code Cache** | 522 MB | ✅ Ja | ~522 MB | Niedrig |
| ~/Library/Caches/**Google** | 614 MB | ✅ Ja | ~614 MB | Niedrig |
| ~/Library/Caches/**dotslash** | 620 MB | ✅ Ja | ~620 MB | Niedrig |
| ~/Library/Caches/**Homebrew** | 125 MB | ✅ Ja | ~125 MB | Niedrig |
| **SUMME** | | | **~43 GB** | |

## Optional: node_modules (+3.1 GB)

| Pfad | Größe | Hinweis |
|------|-------|---------|
| alltagsengel/node_modules | 1.4 GB | Reinstallierbar (npm i) |
| chairmatch/node_modules | 1.3 GB | Reinstallierbar (npm i) |
| efy-care/app/node_modules | 440 MB | Reinstallierbar (npm i) |

## NICHT löschen

- Git-Repos (.git) aller Projekte
- Supabase-Konfigurationen
- Projektdateien (src, public, etc.)

---

**Nächster Schritt:** Nach deiner Bestätigung lösche ich alles sicher in einem Durchgang.  
**Ziel:** Mindestens 48 GB frei (mit node_modules: ~51 GB frei)
