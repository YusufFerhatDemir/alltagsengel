// ═══════════════════════════════════════════════════════════════════════════
// WELCHER CODE LÄUFT GERADE, UND GEGEN WELCHE DATENBANK?
//
// PROBLEM, DAS DIESE DATEI LÖST
// Das Control Center misst den Bestand — Rechnungen, Zahlungen, Protokolle.
// Was es nicht sagt: WELCHER Code diese Zahlen erhoben hat. Vor dem ersten
// echten Versand ist das die erste Frage: eine Freigabe, die gegen eine
// Vorschau-Bereitstellung oder eine andere Datenbank erteilt wurde, ist keine
// Freigabe für das, was gleich passiert.
//
// ── GEMESSEN, NICHT GEMELDET ───────────────────────────────────────────────
// Hier steht ausschließlich, was die laufende Funktion über sich selbst
// wissen KANN: die Vercel-Umgebungsvariablen ihres eigenen Deployments und
// die Projektkennung aus der Supabase-URL. `git HEAD`, `origin/main` und der
// CI-Ausgang stehen bewusst NICHT darin — ein Serverless-Prozess hat kein
// Arbeitsverzeichnis und keinen Zugang zur Werkbank. Wer diese drei braucht,
// nimmt `GET /api/pilot/snapshot?git=…&origin=…&ci=…`, wo sie als 'gemeldet'
// gekennzeichnet sind. Ein 'gemessen' danebenzuschreiben wäre eine Behauptung
// mit falschem Etikett.
//
// ── KEINE GEHEIMNISSE ──────────────────────────────────────────────────────
// Von RESEND_API_KEY, CRON_SECRET und den Supabase-Schlüsseln steht hier nur,
// OB sie gesetzt sind. Die Projektkennung stammt aus NEXT_PUBLIC_SUPABASE_URL
// und ist damit ohnehin öffentlich — sie beantwortet die Frage „welche
// Datenbank?", ohne einen Schlüssel preiszugeben.
// ═══════════════════════════════════════════════════════════════════════════

import type { EnvQuelle } from '@/lib/env/pruefung'

export type HerkunftStand = 'gemessen' | 'nicht_messbar'

export interface HerkunftPunkt {
  schluessel: string
  label: string
  wert: string | null
  stand: HerkunftStand
  bedeutung: string
}

export interface LaufzeitHerkunft {
  /** Läuft dieser Prozess in einer Produktions-Bereitstellung? */
  produktion: boolean
  punkte: HerkunftPunkt[]
  /**
   * Ein Satz für die Kopfzeile: gegen welchen Stand eine Freigabe hier
   * tatsächlich gälte.
   */
  zusammenfassung: string
}

function punkt(
  schluessel: string, label: string, wert: string | null, bedeutung: string,
): HerkunftPunkt {
  return {
    schluessel, label, wert,
    stand: wert === null ? 'nicht_messbar' : 'gemessen',
    bedeutung,
  }
}

/** Die ersten 7 Stellen — dieselbe Kürzung wie `git log --oneline`. */
function kurzCommit(wert: string | undefined): string | null {
  const w = (wert ?? '').trim()
  return w.length >= 7 ? w.slice(0, 7) : (w.length > 0 ? w : null)
}

/**
 * Die Projektkennung aus der Supabase-URL, z. B. `abcdefgh` aus
 * `https://abcdefgh.supabase.co`.
 *
 * Beantwortet „welche Datenbank hängt daran?" mit einem Wert, den man gegen
 * das Supabase-Dashboard halten kann. Eigenbetriebene Instanzen ohne dieses
 * Muster liefern die Hostangabe — besser als nichts, und sichtbar anders.
 */
export function supabaseProjektKennung(url: string | undefined): string | null {
  const roh = (url ?? '').trim()
  if (roh === '') return null
  try {
    const host = new URL(roh).host
    const treffer = /^([a-z0-9-]+)\.supabase\.(co|in|net)$/i.exec(host)
    return treffer ? treffer[1] : host
  } catch {
    return null
  }
}

const GESETZT = (quelle: EnvQuelle, ...namen: string[]): boolean =>
  namen.some(n => (quelle[n] ?? '').length > 0)

/**
 * Erhebt die Herkunft des laufenden Prozesses. Rein, ohne Nebenwirkung und
 * ohne Datenbankzugriff.
 */
export function ermittleLaufzeitHerkunft(quelle: EnvQuelle = process.env): LaufzeitHerkunft {
  const umgebung = (quelle.VERCEL_ENV ?? '').trim() || null
  const produktion = umgebung === 'production'
  const commit = kurzCommit(quelle.VERCEL_GIT_COMMIT_SHA)
  const branch = (quelle.VERCEL_GIT_COMMIT_REF ?? '').trim() || null
  const projekt = supabaseProjektKennung(quelle.NEXT_PUBLIC_SUPABASE_URL)

  const punkte: HerkunftPunkt[] = [
    punkt('commit', 'Laufender Commit', commit,
      commit
        ? `Der ausgeführte Code stammt aus ${commit} (VERCEL_GIT_COMMIT_SHA). Ob das dem Remote-Stand entspricht, sagt dieser Wert NICHT.`
        : 'VERCEL_GIT_COMMIT_SHA ist nicht gesetzt — außerhalb einer Vercel-Bereitstellung ist der Commit des laufenden Codes nicht feststellbar.'),
    punkt('branch', 'Zweig', branch,
      branch
        ? `Die Bereitstellung wurde aus dem Zweig „${branch}" gebaut.`
        : 'VERCEL_GIT_COMMIT_REF ist nicht gesetzt.'),
    punkt('umgebung', 'Bereitstellungsart', umgebung,
      umgebung
        ? (produktion
            ? 'Produktionslauf. Handlungen hier treffen echte Kunden.'
            : `„${umgebung}" — keine Produktion. Die Versandschalter wirken hier nur mit der ausdrücklichen Nicht-Produktions-Ausnahme.`)
        : 'VERCEL_ENV ist nicht gesetzt — der Prozess läuft außerhalb einer Vercel-Bereitstellung (lokal oder in einem Testlauf).'),
    punkt('supabase_projekt', 'Supabase-Projekt', projekt,
      projekt
        ? `Alle Zahlen dieser Übersicht stammen aus dem Projekt ${projekt}.`
        : 'NEXT_PUBLIC_SUPABASE_URL ist nicht lesbar — gegen welche Datenbank gemessen wird, ist unbekannt.'),
    punkt('resend', 'Resend konfiguriert', GESETZT(quelle, 'RESEND_API_KEY') ? 'ja' : 'nein',
      GESETZT(quelle, 'RESEND_API_KEY')
        ? 'RESEND_API_KEY ist gesetzt. Ob der Schlüssel gültig und die Absenderdomain verifiziert ist, sagt das NICHT — dafür gibt es scripts/verify-resend.mjs (liest, versendet nicht).'
        : 'RESEND_API_KEY fehlt. Der Versand meldet dann „übersprungen", setzt sent_at NICHT und bleibt nachholbar.'),
    punkt('cron', 'CRON_SECRET gesetzt', GESETZT(quelle, 'CRON_SECRET') ? 'ja' : 'nein',
      GESETZT(quelle, 'CRON_SECRET')
        ? 'Die geplanten Läufe können sich ausweisen.'
        : 'Ohne CRON_SECRET weist sich kein geplanter Lauf aus — die Zustellwiederholung und der Mahnlauf greifen nicht.'),
    punkt('service_key', 'Server-Schlüssel gesetzt',
      GESETZT(quelle, 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY') ? 'ja' : 'nein',
      GESETZT(quelle, 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY')
        ? 'Der serverseitige Schlüssel ist gesetzt (nur Existenz geprüft, nie der Wert).'
        : 'Ohne serverseitigen Schlüssel kann diese Übersicht nichts messen.'),
  ]

  const zusammenfassung = commit && projekt
    ? `Commit ${commit}${branch ? ` (${branch})` : ''} gegen Projekt ${projekt}${umgebung ? `, ${umgebung}` : ''}.`
    : 'Die Herkunft des laufenden Codes ist nicht vollständig messbar — eine Freigabe hier lässt sich keinem bestimmten Stand zuordnen.'

  return { produktion, punkte, zusammenfassung }
}
