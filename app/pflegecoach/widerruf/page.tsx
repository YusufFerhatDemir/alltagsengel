// PflegeCoach — Widerrufsbelehrung und Muster-Widerrufsformular.
//
// Der Text kommt aus lib/coach/rechtstexte.ts, damit er hier, in der
// Bestellbestätigung und auf der Bestellseite wortgleich ist. Weicht er
// auseinander, ist im Streitfall nicht mehr feststellbar, welche
// Fassung zugegangen ist.
//
// Der Hinweis auf den Selbst-Widerruf im Konto steht bewusst weit oben:
// Der schnellste Weg soll auch der sichtbarste sein — nicht das
// Formular zum Ausdrucken.

import Link from 'next/link'
import {
  MUSTER_WIDERRUFSFORMULAR, RECHTSTEXTE_STAND,
  WIDERRUFSBELEHRUNG, WIDERRUFSBELEHRUNG_VERSION, WIDERRUF_ANSCHRIFT,
} from '@/lib/coach/rechtstexte'

// noindex, aber follow — Begründung wie bei den AGB.
export const metadata = {
  title: 'Widerrufsbelehrung — Digitaler PflegeCoach',
  robots: { index: false, follow: true },
}

export default function CoachWiderruf() {
  return (
    <>
      <h1 className="pc-h1">Widerrufsbelehrung</h1>
      <p className="pc-lead">
        für Verbraucherinnen und Verbraucher beim Kauf des Digitalen PflegeCoach
      </p>

      <p className="pc-feedback pc-feedback--info">
        <strong>Entwurf.</strong> Diese Belehrung wird vor dem Verkaufsstart juristisch geprüft.
        Fassung {WIDERRUFSBELEHRUNG_VERSION}, Stand {RECHTSTEXTE_STAND}.
      </p>

      <section className="pc-card" aria-labelledby="schnellweg">
        <h2 id="schnellweg">Der schnellste Weg</h2>
        <p>
          Sie können Ihren Widerruf mit einem Klick in Ihrem Konto erklären — ohne Formular,
          ohne Begründung, ohne Wartezeit. Er wirkt sofort.
        </p>
        <Link className="pc-btn" href="/pflegecoach/einstellungen/konto">
          Zum Konto — Widerruf erklären
        </Link>
      </section>

      {WIDERRUFSBELEHRUNG.map(block => (
        <section className="pc-card" key={block.titel} aria-labelledby={`wb-${block.titel.replace(/\W/g, '')}`}>
          <h2 id={`wb-${block.titel.replace(/\W/g, '')}`}>{block.titel}</h2>
          {block.absaetze.map((text, i) => (
            <p key={i}>{text}</p>
          ))}
        </section>
      ))}

      <section className="pc-card" aria-labelledby="wb-kein-wertersatz">
        <h2 id="wb-kein-wertersatz">Kein Verzicht, kein Wertersatz</h2>
        <p>
          Bei digitalen Diensten darf ein Anbieter sich bestätigen lassen, dass die Leistung
          sofort beginnt und das Widerrufsrecht dadurch vorzeitig erlischt. Diese Bestätigung
          holen wir bewusst nicht ein.
        </p>
        <p>
          Das heißt für Sie: Ihr Widerrufsrecht besteht die vollen vierzehn Tage — auch dann,
          wenn Sie den PflegeCoach in dieser Zeit bereits genutzt haben. Für die Nutzung bis zum
          Widerruf berechnen wir nichts.
        </p>
      </section>

      <section className="pc-card" aria-labelledby="wb-formular">
        <h2 id="wb-formular">Muster-Widerrufsformular</h2>
        <p>
          Sie können dieses Formular verwenden, müssen es aber nicht — eine formlose E-Mail an{' '}
          <a href={`mailto:${WIDERRUF_ANSCHRIFT.email}`}>{WIDERRUF_ANSCHRIFT.email}</a> genügt
          ebenso.
        </p>
        {/* <pre> statt <p>: Das Muster hat vorgegebene Zeilenumbrüche und
            Ausfülllinien, die erhalten bleiben müssen. */}
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
            background: 'rgba(0,0,0,0.03)',
            padding: 16,
            borderRadius: 10,
            lineHeight: 1.7,
          }}
        >
          {MUSTER_WIDERRUFSFORMULAR}
        </pre>
      </section>

      <section className="pc-card" aria-labelledby="wb-kontakt">
        <h2 id="wb-kontakt">Anschrift für den Widerruf</h2>
        <p>
          {WIDERRUF_ANSCHRIFT.name}<br />
          {WIDERRUF_ANSCHRIFT.zusatz}<br />
          {WIDERRUF_ANSCHRIFT.strasse}<br />
          {WIDERRUF_ANSCHRIFT.ort}<br />
          E-Mail: <a href={`mailto:${WIDERRUF_ANSCHRIFT.email}`}>{WIDERRUF_ANSCHRIFT.email}</a>
        </p>
        <p>
          <Link href="/pflegecoach/agb">AGB</Link>{' · '}
          <Link href="/pflegecoach/datenschutz">Datenschutz</Link>{' · '}
          <Link href="/impressum">Impressum</Link>
        </p>
      </section>
    </>
  )
}
