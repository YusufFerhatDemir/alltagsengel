# Next.js — zwei kritische Befunde, einer davon einschlägig

**Stand:** 12.09.2026 · **Gefunden durch:** `npm audit --omit=dev` (Track 10)

---

## 1. Was gemeldet wird

| Advisory | Schwere | Betrifft | Fix in |
|---|---|---|---|
| [GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36) — Unauthenticated RCE auf **Windows-gehosteten** Servern | critical | `>=16.0.0 <16.3.3` | 16.3.3 |
| [GHSA-2xp9-vwfh-vxw4](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4) — Unauthenticated RCE in der **Image-Optimization-API, wenn AVIF verwendet wird** | critical | `>=16.0.0 <16.3.3` | 16.3.3 |

Installiert war **16.2.12** — beide Bereiche treffen zu.

### Fast-Fehler beim Lesen

Die erste Zeile von `npm audit` nennt als Bereich `9.5.6-canary.0 - 10.0.7`. Damit wäre
16.2.12 nicht betroffen, und der Befund wäre ein Fehlalarm. Der vollständige Bereich lautet
aber `9.5.6-canary.0 - 10.0.7 || 14.3.0-canary.0 - 15.5.23 || 15.6.0-canary.0 - 16.3.2` —
die ersten beiden Alternativen waren in meiner Ausgabe abgeschnitten. **16.2.12 fällt in den
dritten Bereich.** Wer nur die erste Alternative liest, gibt fälschlich Entwarnung.

## 2. Welcher der beiden uns wirklich trifft

| Befund | Einschlägig? | Begründung |
|---|---|---|
| Windows-RCE | **nein** | Produktion läuft auf Vercel (Linux) |
| **AVIF-RCE** | **ja** | `next.config.ts` führte `formats: ['image/avif', 'image/webp']`, neun Komponenten nutzen `next/image` |

Der zweite ist damit kein theoretischer Befund, sondern ein offener, **unauthentifizierter**
Weg über eine öffentlich erreichbare API.

## 3. Warum das Upgrade nicht gekommen ist

Der saubere Weg wäre `next@16.3.3+`. Am 12.09.2026 versucht mit **16.3.5**:

| Prüfung | 16.2.12 | 16.3.5 |
|---|---|---|
| `npm run typecheck` | 0 | 0 |
| `npm run lint` | 0 | 0 |
| `vitest run` | 10.416 bestanden | 10.416 bestanden |
| `npm run test:unit` | 2.770 bestanden | 2.770 bestanden |
| **`npm run build`** | **0 — „Compiled successfully in 24,1 s"** | **1 — Build error** |

```
Error: Turbopack build failed with 2 errors:
[next]/internal/font/google/cormorant_garamond_…
Error: next/font: error: Failed to fetch Cormorant Garamond from Google Fonts.
[next]/internal/font/google/jost_…
Error: next/font: error: Failed to fetch Jost from Google Fonts.
```

Nicht die Erklärung, die der Fehler nahelegt: `fonts.googleapis.com` antwortet in derselben
Umgebung per `curl` mit **HTTP 200**. Die Gegenprobe ist eindeutig — dieselbe Maschine,
dieselbe Minute, nur die Next-Version unterschiedlich: 16.2.12 baut durch, 16.3.5 nicht.

**Tests, Typecheck und Lint hätten das Upgrade durchgewunken.** Nur der Build hat es
gefangen. Ein Prüfstand ohne `npm run build` hätte einen kaputten Stand freigegeben.

## 4. Was stattdessen getan wurde

`next.config.ts`: **AVIF abgeschaltet**, WebP bleibt.

```diff
-    formats: ['image/avif', 'image/webp'],
+    formats: ['image/webp'],
```

Ohne AVIF greift der Angriffsweg aus GHSA-2xp9-vwfh-vxw4 nicht — die Lücke sitzt im
AVIF-Pfad der Optimierung. Das ist kein Ersatz für das Upgrade, aber es schließt heute
genau den Weg, der offen war.

**Kosten:** Ausgelieferte Bilder sind gegenüber AVIF 30–50 % größer. WebP bleibt aktiv,
die Quelldateien sind unberührt. Messbar in den Core Web Vitals, nicht sichtbar für Nutzer.

**Build nach der Änderung:** Exit 0, „Compiled successfully in 23,4 s".

## 5. Der Weg zum Upgrade

| # | Schritt | Warum |
|---|---|---|
| 1 | **Jost und Cormorant Garamond per `next/font/local` selbst ausliefern** | Nimmt die Netzabhängigkeit aus dem Build. Ein Produktionsbuild, der zur Bauzeit Google fragt, ist ohnehin fragil — er scheitert bei jedem Netzhänger, nicht nur bei diesem |
| 2 | `next@16.3.3+` installieren | Schließt beide Advisories echt |
| 3 | `npm run build` **und** die Suiten fahren | Der Build ist hier die einzige Prüfung, die greift |
| 4 | **AVIF wieder einschalten** | Die Zeile in `next.config.ts` nennt die Bedingung |

Schritt 1 ist eigene Arbeit mit sichtbarer Wirkung (Schriftbild) und gehört in einen
eigenen, einzeln geprüften Commit — nicht ans Ende einer Sitzung mit sieben Tracks.

## 6. Die übrigen sieben Befunde

| Paket | Schwere | Kurz |
|---|---|---|
| `@xmldom/xmldom` | high | XML-Fragment-Injection |
| `browserslist` | high | unbegrenztes Speicherwachstum |
| `fast-uri` | high | Host-Verwechslung über IDN |
| `image-size` | high | DoS über ICNS-Parser |
| `nanoid` | high | Endlosschleife bei negativer Länge |
| `pptxgenjs` | high | — |
| `sharp` | high | geerbte libvips-Lücken |
| `baseline-browser-mapping` | moderate | Prozessabbruch bei ungültiger Eingabe |

Alle mit verfügbarem Fix, keiner kritisch, keiner an einem unauthentifizierten Pfad.
Gehören in denselben Aufräum-Commit wie das Next-Upgrade.
