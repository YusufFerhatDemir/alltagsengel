import type { Page } from '@playwright/test'

/**
 * Den Cookie-Banner VORWEG beantworten.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WARUM
 * ────────────────────────────────────────────────────────────────────────────
 * `components/CookieConsent.tsx` legt sich 800 ms nach dem Laden als
 * `position: fixed`-Leiste ueber den unteren Seitenrand, mit `z-index: 99999`.
 * Auf dem schmalen Testgeraet (`mobile-safari` = iPhone 14) liegt genau dort
 * bei mehreren Formularen der Absende-Knopf. Ein Test, der ihn anklickt,
 * trifft dann den Banner — und scheitert an einer Stelle, die mit dem
 * geprueften Verhalten nichts zu tun hat.
 *
 * Das ist ein TESTAUFBAU-Problem, kein Produktfehler: ein echter Nutzer
 * beantwortet den Banner und arbeitet danach weiter. Genau das macht dieser
 * Helfer — er beantwortet ihn, bevor die Seite geladen wird.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WARUM UEBER localStorage UND NICHT PER KLICK
 * ────────────────────────────────────────────────────────────────────────────
 * Ein Klick braeuchte den Banner sichtbar — also mindestens 800 ms Wartezeit
 * pro Test, und ein Wettlauf bliebe: erscheint er spaeter, ist er trotzdem im
 * Weg. `addInitScript` laeuft VOR dem Seitenskript; die Komponente liest den
 * Schluessel in ihrem ersten `useEffect` und zeigt den Banner dann gar nicht
 * erst an.
 *
 * Der Schluessel ist derselbe wie in der Komponente. Aendert er sich dort,
 * greift dieser Helfer stillschweigend nicht mehr — deshalb prueft
 * `e2e/cookie-consent.spec.ts` den Banner ausdruecklich MIT seinem echten
 * Verhalten, ohne diesen Helfer. Faellt der Schluessel auseinander, faellt
 * dort ein Test, nicht nur hier die Wirkung.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * VOREINSTELLUNG: ABLEHNEN
 * ────────────────────────────────────────────────────────────────────────────
 * `rejected` ist die datensparsame Antwort und schaltet die Trackingskripte
 * NICHT frei. Ein Testlauf soll keine Analyse- und Werbepixel laden.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * FORMAT (Stand 04.09.2026)
 * ────────────────────────────────────────────────────────────────────────────
 * Gespeichert wird seit der Kategorien-Umstellung JSON mit einzelnen
 * Kategorien. Die alten Zeichenketten wuerden zwar weiterhin gelesen
 * (`lies()` uebersetzt sie), aber ein Helfer, der ein Altformat schreibt,
 * prueft nebenbei die Uebersetzung mit — und faellt still aus, sobald die
 * irgendwann entfaellt. Er schreibt deshalb dasselbe, was die Komponente
 * schreiben wuerde.
 *
 * Aufruf VOR `page.goto`:
 *
 *     await cookieBannerVorwegBeantworten(page)
 *     await page.goto('/auth/register')
 */
export async function cookieBannerVorwegBeantworten(
  page: Page,
  antwort: 'accepted' | 'rejected' = 'rejected',
): Promise<void> {
  const alles = antwort === 'accepted'
  await page.addInitScript((erlaubt: boolean) => {
    try {
      window.localStorage.setItem('ae_cookie_consent', JSON.stringify({
        notwendig: true,
        statistik: erlaubt,
        marketing: erlaubt,
        zeitpunkt: new Date().toISOString(),
        // Muss zu CONSENT_VERSION in lib/consent/kategorien.ts passen —
        // eine aeltere Fassung wird dort verworfen und der Banner kaeme
        // trotz Helfer.
        version: 2,
      }))
    } catch {
      // Privater Modus o. ae.: dann erscheint der Banner eben. Ein Test soll
      // daran nicht scheitern, bevor er ueberhaupt angefangen hat.
    }
  }, alles)
}
