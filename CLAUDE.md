# Proje Talimatları

## Autonomie-Regel (für Agents)

**Yusuf will NIE ein Terminal anfassen müssen.** Agents committen + pushen autonom.

- **Immer** `./deploy.sh "commit message"` benutzen — NICHT direkt `git push`, NICHT direkt `git commit`.
  `deploy.sh` macht: stale-lock-cleanup → typecheck (warn-only) → `precommit-guard` (Secrets/.env/node_modules → block) → `git add -A` → commit → push → `verify-push` (Remote-Wahrheits-Check).
- **Niemals** dem User sagen „führe X im Terminal aus". Wenn ein Schritt blockiert, selbst lösen oder im Report exakt benennen, was gerade NICHT geht.
- **Worktree-Branches** (`claude/*`, `worktree/*`) pushen automatisch nach `main` — `deploy.sh` erkennt das.
- **Rollback**: `./scripts/rollback.sh <N> --push` revertet die letzten N Commits via `git revert` (kein reset --hard).
- **Notfall-Override**: `GUARD_BYPASS=1 ./deploy.sh "…"` — nur wenn der User explizit zustimmt.
- Push-Failures (Network, divergierender Remote) löst der Agent selbst (rebase, retry). Bei Konflikten Report mit Datei-Liste statt Terminal-Anweisung.

## Git
- Değişiklik yaptıktan sonra her zaman `./deploy.sh "açıklama"` ile commit + push yap. Kullanıcıya sormadan deploy et.
- Commit mesajları Türkçe veya Almanca olabilir, açıklayıcı olsun.

## Dil
- Kullanıcıyla Türkçe konuş.
- Kod içindeki metinler (UI) Almanca kalmalı.

## Prevention-Controls
- `npm run setup:hooks` einmal pro Clone → installiert Pre-Commit-Hook.
- Vor größeren Umbenennungen: `npm run lint:forbidden` (Voll-Scan, 0 Treffer erwartet).
- Neue Regressions-Pattern: `scripts/forbidden-strings.json` erweitern, Lint-Lauf grün, commit.
- Nicht in Doku schreiben: Literal-Pattern in Erklärtexten. Verweis auf JSON-Config statt Copy-Paste.

## Kundenkommunikation (WICHTIG — gilt für ALLE Antwort-Entwürfe an Kunden oder Engel)
- **Absender / Unterschrift: IMMER „Alltagsengel" — NIEMALS persönliche Namen** (kein „Yusuf", kein „Abdullah", kein Mitarbeitername).
- Begrüßung: „Hallo Frau/Herr [Nachname]," — neutral, professionell.
- Verabschiedung: „Herzliche Grüße" gefolgt von „Ihr Team von Alltagsengel" oder nur „Alltagsengel".
- Gilt für: E-Mail, WhatsApp, SMS, In-App-Chat, Pressetexte, automatisierte Mails — JEDE Kommunikation in Kundenrichtung.
