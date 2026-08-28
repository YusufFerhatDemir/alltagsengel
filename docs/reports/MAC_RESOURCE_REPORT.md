# Mac Resource Cleanup Report — Track F

**Datum:** 2026-08-28  
**Status:** MEMORY_RED, Disk CRITICAL  
**Ziel:** 30 GB+ freier Speicher (aktuell: 17.6 GB frei von 245 GB)  
**Fehlend:** ~13 GB müssen freigeräumt werden

---

## 1. System-Übersicht

| Metrik | Wert | Bewertung |
|---|---|---|
| Disk gesamt | 245.1 GB | — |
| Disk frei | 17.6 GB | KRITISCH |
| RAM gesamt | 8 GB | — |
| Swap belegt | 10.9 GB / 12 GB | KRITISCH |
| Zombie-Prozesse | 0 | OK |
| Claude-Prozesse | 96 aktiv | HOCH |
| Claude RSS gesamt | ~1.08 GB + 1.64 GB (Sessions) | KRITISCH |

---

## 2. Claude Sessions — Klassifikation

**Pfad:** `~/Library/Application Support/Claude/local-agent-mode-sessions/`  
**Gesamt:** 1 Haupt-Session (`c8e8c52e-...`) + 1 skills-plugin (18 MB)  
**Sub-Sessions:** 854 local sessions, 4.8 GB gesamt

### 2.1 Altersverteilung

| Kategorie | Alter | Anzahl | Klassifikation |
|---|---|---|---|
| TODAY | < 1 Tag | 18 | ACTIVE_REQUIRED |
| RECENT | 1–7 Tage | 56 | ACTIVE_REQUIRED |
| MEDIUM | 7–30 Tage | 273 | COMPLETED (prüfbar) |
| OLD | > 30 Tage | 507 | COMPLETED / ORPHAN |

### 2.2 Größenverteilung

| Größenklasse | Anzahl | Gesamt-Größe |
|---|---|---|
| > 20 MB | 13 | 476 MB |
| 5–20 MB | 91 | 874 MB |
| < 5 MB | 750 | 1.033 MB |

### 2.3 Top 10 größte Sessions

| Session | Größe |
|---|---|
| local_3bbb9fb0-... | 150 MB |
| local_4797aa92-... | 35 MB |
| local_6c7f44a1-... | 34 MB |
| local_8d468101-... | 29 MB |
| local_1f6ab0ab-... | 29 MB |
| local_32c6663a-... | 28 MB |
| local_f6e40903-... | 27 MB |
| local_712677e1-... | 27 MB |
| local_8c2c2061-... | 26 MB |
| local_40d5ef21-... | 24 MB |

### 2.4 Älteste Sessions (seit 2. Juni 2026)

| Datum | Größe | Session |
|---|---|---|
| 2026-06-02 | 160 KB | local_550e48e5-... |
| 2026-06-02 | 2.1 MB | local_96128b8d-... |
| 2026-06-03 | 1.6 MB | local_ef30b9dd-... |
| 2026-06-03 | 196 KB | local_89d0f307-... |
| 2026-06-03 | 160 KB | local_b91af4b0-... |

### 2.5 Empfehlung Sessions

| Aktion | Ziel | Geschätzter Gewinn |
|---|---|---|
| OLD Sessions löschen (507 Stk., > 30 Tage) | ORPHAN/COMPLETED | ~1.5–2.0 GB |
| MEDIUM Sessions prüfen + löschen (273 Stk.) | COMPLETED | ~0.5–1.0 GB |
| **Gesamt Sessions-Bereinigung** | | **~2.0–3.0 GB** |

---

## 3. vm_bundles — Analyse

**Pfad:** `~/Library/Application Support/Claude/vm_bundles/`  
**Gesamt:** 11 GB

| Datei | Größe | Letzte Änderung | Status |
|---|---|---|---|
| rootfs.img | 10.0 GB | 2026-08-28 18:47 | AKTIV (VM Root-Filesystem) |
| sessiondata.img | 3.8 GB | 2026-08-28 18:39 | AKTIV (Session-Daten) |
| vmlinuz | 56 MB | 2026-08-18 | AKTIV (Kernel) |
| initrd | 27 MB | 2026-08-18 | AKTIV (Init-Ramdisk) |
| initrd-micro | 4.3 MB | 2026-08-18 | AKTIV |
| efivars.fd | 128 KB | 2026-08-15 | AKTIV |
| warm/ | 0 B | 2026-08-18 | LEER |

### Empfehlung vm_bundles

- **rootfs.img (10 GB):** Aktives VM-Image. Darf NICHT gelöscht werden. Mögliche Kompaktierung prüfen (sparse file?).
- **sessiondata.img (3.8 GB):** Akkumuliert Session-Daten. Nach Session-Bereinigung könnte Claude diese Datei ggf. neu aufbauen → potentiell einige GB rückgewinnbar, aber RISIKO.
- **warm/ (0 B):** Leer, kein Handlungsbedarf.
- **Fazit:** vm_bundles sind "untouchable" im Sinne von: nicht blind löschen. Aber 3.8 GB sessiondata.img könnte nach Claude-Neustart und Bereinigung der alten Sessions schrumpfen.

---

## 4. RAM-Analyse

### 4.1 Speicherdruck

| Metrik | Wert |
|---|---|
| Physischer RAM | 8 GB |
| Swap belegt | 10.9 GB / 12 GB (91%) |
| Pages in Compressor | 1.452.447 |
| Swap-Ins (kumulativ) | 237.797.069 |
| Swap-Outs (kumulativ) | 242.456.468 |

**Bewertung:** System schreibt massiv auf Swap. Die Swap-In/Out-Zahlen in den Hunderten von Millionen zeigen extremes Thrashing — das ist wie ein Jongleur, der 20 Bälle mit 2 Händen halten will und ständig welche fallen lässt und aufhebt.

### 4.2 Top RAM-Verbraucher

| Prozess | Instanzen | RSS gesamt |
|---|---|---|
| Claude Session-Prozesse | 64 | 1.640 MB |
| Claude App (Renderer/Main) | 24 | 105 MB |
| TypeScript Compiler (tsc) | 3 | 86 MB |
| Vitest Workers (efy-care) | ~6 | ~80 MB |
| CoreLocationAgent | 1 | 38 MB |
| DriverKit WLAN | 1 | 27 MB |
| Google Chrome | 11 | 20 MB |

### 4.3 Empfehlung RAM

| Aktion | Geschätzter Gewinn |
|---|---|
| Nicht benötigte Claude-Sessions in der App schließen | 500–1.000 MB RAM |
| Vitest-Worker beenden (wenn nicht aktiv genutzt) | ~80 MB RAM |
| Google Chrome Tabs reduzieren | variabel |
| **Wichtigste Maßnahme:** Weniger parallele Claude-Sessions | **Drastische Swap-Reduktion** |

---

## 5. Disk-Analyse — Gesamtübersicht

### 5.1 Größte Verbraucher

| Pfad | Größe | Empfehlung |
|---|---|---|
| Claude vm_bundles | 11.0 GB | Nicht löschbar (aktiv) |
| Claude Sessions | 4.8 GB | ~2–3 GB rückgewinnbar |
| Homebrew (/opt/homebrew) | 3.5 GB | `brew cleanup` ausführen |
| alltagsengel/node_modules | 1.2 GB | `npm ci` bei Bedarf |
| npm Cache (~/.npm) | 524 MB | `npm cache clean --force` |
| Caches/dotslash | 512 MB | Löschbar |
| Claude Code Runtime | 220 MB | Behalten |
| efy-care/node_modules | 108 MB | Löschbar wenn nicht aktiv |
| Caches/deno | 77 MB | Löschbar |
| Library/Logs | 40 MB | Prüfbar |

### 5.2 Bereinigungsplan — Priorisiert

| # | Aktion | Geschätzter Gewinn | Risiko |
|---|---|---|---|
| 1 | OLD Claude Sessions löschen (507 Stk.) | ~1.5–2.0 GB | NIEDRIG |
| 2 | MEDIUM Sessions selektiv löschen | ~0.5–1.0 GB | NIEDRIG |
| 3 | `brew cleanup` | ~0.5–1.0 GB | NIEDRIG |
| 4 | `npm cache clean --force` | ~0.5 GB | NIEDRIG |
| 5 | Caches/dotslash löschen | ~0.5 GB | NIEDRIG |
| 6 | efy-care/node_modules löschen (wenn inaktiv) | ~0.1 GB | NIEDRIG |
| 7 | Caches/deno löschen | ~0.08 GB | NIEDRIG |
| | **Summe konservativ** | **~3.5–5.0 GB** | |

### 5.3 Erweiterte Maßnahmen (falls 30 GB+ nicht erreichbar)

| Aktion | Geschätzter Gewinn | Risiko |
|---|---|---|
| sessiondata.img nach Claude-Neustart compactieren | ~1–2 GB | MITTEL |
| Homebrew: nicht genutzte Formulas deinstallieren | ~1–2 GB | MITTEL |
| alltagsengel/node_modules neu aufbauen | ~0.3 GB (temp) | NIEDRIG |

---

## 6. Zusammenfassung

### Ist-Zustand

```
Disk:  17.6 GB frei / 245 GB → 7.2% frei
RAM:   8 GB physisch, 10.9 GB Swap aktiv → Permanentes Thrashing
Claude: 96 Prozesse, 17 GB Disk, ~2.7 GB RAM
```

### Realistisches Ziel

Mit den Maßnahmen aus 5.2 (konservativ): **~21–23 GB frei**  
Mit erweiterten Maßnahmen aus 5.3: **~24–27 GB frei**  
**30 GB+ ist mit reiner Bereinigung schwer erreichbar** — der größte Einzelposten (vm_bundles, 11 GB) ist aktiv und nicht löschbar.

### Prioritäten

1. **SOFORT:** Alte Claude-Sessions prunen (Aktion 1+2) → größter sicherer Gewinn
2. **SOFORT:** Cache-Bereinigung (Aktion 3–5+7) → schnell, risikoarm
3. **RAM:** Parallele Claude-Sessions reduzieren → Swap-Druck massiv senken
4. **OPTIONAL:** Erweiterte Maßnahmen wenn Ziel nicht erreicht

### WARNUNG

> **NICHTS WURDE GELÖSCHT.** Dieser Report ist reine Analyse.  
> Jede Löschaktion erfordert explizite Freigabe durch den User.

---

*Report generiert: 2026-08-28 18:45 Uhr*
