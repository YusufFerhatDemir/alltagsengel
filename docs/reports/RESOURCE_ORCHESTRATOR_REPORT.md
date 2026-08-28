# Resource Orchestrator Report

**Datum:** 2026-08-28 21:30 Uhr
**System:** MacBook 8GB RAM, 228GB SSD

---

## Vorher-Stand

| Metrik | Wert |
|--------|------|
| RAM gesamt | 8 GB |
| RAM frei | ~25% (~2 GB) |
| Swap total | 11.264 MB |
| Swap used | 10.008 MB (89%) |
| Swap free | 1.256 MB |
| SSD gesamt | 228 GB |
| SSD belegt | 16 GB |
| SSD frei | 15 GB (48% frei) |
| Claude-Prozesse | 98 |
| Claude-Code-Instanzen | 68 |
| Claude Helper (Plugin) | 25 |
| Zombie-Prozesse | 1 |
| Stale tsc-Prozesse | 2 (seit 18:31 und 19:12 laufend) |
| Stale node benchmark | 1 (bench.mjs, 30% CPU) |

## Durchgeführte Aktionen

### Beendete Prozesse (SIGTERM / SIGKILL)

| PID | Typ | Laufzeit | Grund |
|-----|-----|----------|-------|
| 93663 | Zombie (`<defunct>`) | - | State Z, immer beenden |
| 69581 | `tsc --noEmit` | >3 Stunden | Orphan, hängt seit 18:31 |
| 75018 | `tsc --noEmit` | >2 Stunden | Orphan, hängt seit 19:12 |
| 69543 | `npm exec tsc` | >3 Stunden | Parent von PID 69581 |
| 74975 | `npm exec tsc` | >2 Stunden | Parent von PID 75018 |
| 93441 | `node /tmp/bench.mjs` | ~5 Min | 30% CPU, Benchmark-Script |
| 93438 | `/bin/zsh` (Shell) | ~5 Min | Parent-Shell von bench.mjs |

**Gesamt: 7 Prozesse beendet**

### Nicht beendet (ACTIVE_REQUIRED)

- Claude.app Hauptprozess (PID 922)
- 68 claude-code Instanzen (aktive Cowork-Sessions)
- 25 Claude Helper (Plugin) Prozesse (Electron-Infrastruktur)
- Aktive Sessions: local_bb535c05, local_ea1b279b, local_5396d4e4, local_74dcd9a9 und weitere

### Cache-Prüfung

| Cache-Typ | Gefunden | Größe |
|-----------|----------|-------|
| `.next` (alltagsengel) | 0 | - |
| `coverage/` | 0 | - |
| `dist/` | 0 | - |
| `build/` | 0 | - |
| `node_modules/.cache` | 0 | - |
| `.next` (efy-care) | 0 | - |
| `Library/Caches` | vorhanden | 1.6 GB |

### vm_bundles Deep-Analyse

| Bundle | Größe | Status |
|--------|-------|--------|
| `claudevm.bundle/` | 11 GB | Aktiv (PID 1446) |
| `rootfs.img` | 10 GB | Geöffnet von com.apple (Virtualisierung) |
| `sessiondata.img` | 3.8 GB | Geöffnet von com.apple |
| `vmlinuz` | 56 MB | Linux-Kernel |
| `initrd-micro` | 4.3 MB | InitRD |
| `warm/` | 0 B | Leer (Warm-Cache) |

**Hinweis:** Die vm_bundles (11 GB) gehören zur aktiven Claude-VM und können NICHT gelöscht werden.

## Nachher-Stand

| Metrik | Vorher | Nachher | Delta |
|--------|--------|---------|-------|
| Zombie-Prozesse | 1 | 0 | -1 |
| Stale tsc | 2 | 0 | -2 |
| Stale node | 1 | 0 | -1 |
| Claude-Prozesse | 98 | 99* | - |
| Swap used | 10.008 MB | 10.695 MB | +687 MB** |
| SSD frei | 15 GB | 15 GB | ~0 |

\* +1 durch den aktuellen Orchestrator-Prozess selbst
\** Swap steigt weiter weil 68 claude-code Instanzen permanent Speicher beanspruchen

## Klassifikation

### RAM: CRITICAL

- 25% frei klingt ok, aber **10.7 GB Swap** auf einem 8 GB System = massives Thrashing
- Swapins: 530 Mio, Swapouts: 537 Mio = permanentes Hin-und-Her-Schieben
- Compressor: 258K Pages belegt, 1.4M Pages komprimiert gespeichert
- **Hauptursache: 68 claude-code Prozesse** (je ~50-75 MB RSS = ~3.4-5.1 GB nur für claude-code)

### SSD: YELLOW

- 15 GB frei ist knapp aber nutzbar
- vm_bundles belegen 11 GB (unvermeidbar)
- alltagsengel: 3.8 GB
- Library/Caches: 1.6 GB

### Gesamt-Klassifikation: CRITICAL

## Empfehlungen

### Sofort (hohes Impact)

1. **Claude-Sessions konsolidieren** — 68 gleichzeitige claude-code Instanzen sind der Hauptgrund für den Swap-Druck. Nicht benötigte Sessions in der Claude-App schließen. Ziel: max. 5-10 aktive Sessions.

2. **Library/Caches bereinigen** — 1.6 GB in ~/Library/Caches. Manuelles Prüfen empfohlen:
   ```
   du -sh ~/Library/Caches/* | sort -rh | head -20
   ```

3. **Claude-App neustarten** — nach dem Schließen alter Sessions einmal Claude.app komplett beenden und neu starten. Das gibt die 25 Helper-Prozesse frei und lässt das OS Swap zurückgewinnen.

### Mittelfristig

4. **Scheduled Tasks prüfen** — einige claude-code Instanzen scheinen zu Scheduled Tasks zu gehören (gmail-check, strato-mail, procare etc.). Prüfen ob alle davon noch benötigt werden.

5. **tsc-Watcher vermeiden** — die gestoppten tsc-Prozesse waren wahrscheinlich von früheren `npm run typecheck` Aufrufen die hängen geblieben sind. Deploy-Script `deploy.sh` nutzt typecheck als warn-only, das sollte nicht blockieren.

### Langfristig

6. **RAM-Upgrade auf 16 GB** — bei dieser Nutzungsintensität (Cowork + Chrome + MCPs) ist 8 GB strukturell zu wenig. Swap-Thrashing verlangsamt das gesamte System massiv.

---

*Erstellt von Resource Orchestrator Agent, 2026-08-28*
