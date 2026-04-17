# Proje Talimatları

## Git
- Değişiklik yaptıktan sonra her zaman commit ve push yap. Kullanıcıya sormadan push et.
- Commit mesajları Türkçe veya Almanca olabilir, açıklayıcı olsun.

## Dil
- Kullanıcıyla Türkçe konuş.
- Kod içindeki metinler (UI) Almanca kalmalı.

## Prevention-Controls
- `npm run setup:hooks` einmal pro Clone → installiert Pre-Commit-Hook.
- Vor größeren Umbenennungen: `npm run lint:forbidden` (Voll-Scan, 0 Treffer erwartet).
- Neue Regressions-Pattern: `scripts/forbidden-strings.json` erweitern, Lint-Lauf grün, commit.
- Nicht in Doku schreiben: Literal-Pattern in Erklärtexten. Verweis auf JSON-Config statt Copy-Paste.
