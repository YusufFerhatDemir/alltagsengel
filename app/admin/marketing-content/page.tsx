import Link from 'next/link'
import {
  ladeContentKatalog, frequenzProWoche, ZIEL_PRO_WOCHE,
  type ContentStueck,
} from '@/lib/marketing/contentplan'

// ═══════════════════════════════════════════════════════════════════════
// MARKETING-CONTENT — veröffentlichungsfertige Stücke, organisiert
//
// Serverkomponente: Die Pläne liegen als Markdown in docs/marketing/ und
// werden beim Rendern gelesen. Sie sind damit die EINE Quelle — niemand
// muss eine zweite Fassung nachtragen. Die Seite wird statisch
// vorgerendert, der Stand entspricht also dem letzten Deploy.
//
// ES WIRD NICHTS AUTOMATISCH GEPOSTET. Diese Seite sammelt, ordnet und
// macht kopierbar. Das Veröffentlichen bleibt eine Handlung eines
// Menschen auf der jeweiligen Plattform.
//
// Keine Datenbank, kein Schreibweg — deshalb auch kein Statusfeld je
// Stück: ein Status, den nur der eigene Browser kennt, wäre schlimmer als
// keiner, weil er wie eine geteilte Wahrheit aussieht.
// ═══════════════════════════════════════════════════════════════════════

export const metadata = { title: 'Marketing-Content' }

/** Kategorien auf eine Farbe abbilden — für die Übersicht auf einen Blick. */
const KATEGORIE_FARBE: Record<string, string> = {
  'Kunden-Content': '#2196F3',
  'Recruiting': '#9C27B0',
  'Pflegewissen': '#26A69A',
  'Regional': '#E8A000',
  'Team': '#5CB882',
  'Haushaltshilfe': '#C9963C',
}

function farbeFuer(kategorie: string | null): string {
  if (!kategorie) return '#8A8279'
  const treffer = Object.keys(KATEGORIE_FARBE).find(k =>
    kategorie.toLowerCase().includes(k.toLowerCase().split('-')[0]),
  )
  return treffer ? KATEGORIE_FARBE[treffer] : '#8A8279'
}

function Stueck({ s }: { s: ContentStueck }) {
  const farbe = farbeFuer(s.kategorie)
  return (
    <section className="admin-table-wrap" style={{ padding: 18, marginBottom: 14, borderLeft: `3px solid ${farbe}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
          {s.nummer} — {s.titel}
        </h3>
        <span style={{ fontSize: 12, color: 'var(--ink5)', whiteSpace: 'nowrap' }}>
          {s.datum || 'ohne Datum'}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {s.kategorie && <span style={{ ...chip, borderColor: farbe, color: farbe }}>{s.kategorie}</span>}
        {s.plattform && <span style={chip}>{s.plattform}</span>}
        {s.region && <span style={chip}>📍 {s.region}</span>}
        {s.zielgruppe && <span style={{ ...chip, opacity: 0.8 }}>{s.zielgruppe}</span>}
      </div>

      {/* Der Hinweis steht VOR dem Text: er ist eine Bedingung für dessen
          Verwendung, keine Fußnote. Wer nach unten scrollt, hat schon
          kopiert. */}
      {s.hinweis && (
        <p style={hinweisFeld}>
          <strong>Vor dem Posten beachten:</strong> {s.hinweis}
        </p>
      )}

      {/* Der Text steht in einem <pre>, damit Absätze und Emojis so
          kopierbar bleiben, wie sie gepostet werden sollen. */}
      <pre style={textFeld}>{s.text}</pre>

      {s.hashtags.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--gold2)', margin: '10px 0 0', lineHeight: 1.7 }}>
          {s.hashtags.join(' ')}
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12, marginTop: 12 }}>
        {s.cta && (
          <div>
            <div style={feldTitel}>CTA</div>
            <div style={feldWert}>{s.cta}</div>
          </div>
        )}
        {s.bildBriefing && (
          <div>
            <div style={feldTitel}>Bild-/Video-Briefing</div>
            <div style={feldWert}>{s.bildBriefing}</div>
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: 'var(--ink5)', marginTop: 10 }}>
        Quelle: <code>docs/marketing/{s.quelle}</code>
      </div>
    </section>
  )
}

export default function MarketingContentPage() {
  const katalog = ladeContentKatalog()
  const frequenz = frequenzProWoche(katalog.stuecke)

  const nachKategorie = katalog.stuecke.reduce((acc, s) => {
    const k = s.kategorie || '— ohne Kategorie'
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const nachPlattform = katalog.stuecke.reduce((acc, s) => {
    const k = s.plattform || '— ohne Plattform'
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const mitRegion = katalog.stuecke.filter(s => s.region).length
  const wochenUnterZiel = frequenz.filter(w => !w.erfuellt)
  const mitHinweis = katalog.stuecke.filter(s => s.hinweis)

  // Herkunft je Datei — bei vier Plänen in drei Formaten ist das die
  // Antwort auf „woher kommt das, und ist etwas davon unvollständig?"
  const jeQuelle = katalog.dateien.map(datei => ({
    datei,
    anzahl: katalog.stuecke.filter(s => s.quelle === datei).length,
  }))

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Marketing-Content</h1>
          <p className="admin-subtitle">
            {katalog.stuecke.length} veröffentlichungsfertige Stücke aus {katalog.dateien.length} Plänen
            {katalog.uebersprungen > 0 && ` · ${katalog.uebersprungen} Abschnitt(e) ohne Text übersprungen`}
          </p>
        </div>
        <Link href="/admin/marketing-dashboard" className="btn-ghost" style={{ whiteSpace: 'nowrap' }}>
          Zum Marketing-Dashboard
        </Link>
      </div>

      <div className="admin-table-wrap" style={{ padding: 16, marginBottom: 18 }}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
          <strong>Hier wird nichts automatisch veröffentlicht.</strong> Diese Seite sammelt und
          ordnet, was fertig ist — Text, Zielgruppe, Plattform, Region, CTA, Bildbriefing und
          Hashtags. Das Posten bleibt ein bewusster Schritt auf der jeweiligen Plattform.
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--ink3)' }}>
          Die Pläne liegen als Markdown unter <code>docs/marketing/</code> und werden hier direkt
          gelesen — es gibt keine zweite Fassung, die veralten könnte. Wer einen Text im Plan
          ändert, sieht ihn hier nach dem nächsten Deploy; der geänderte Plan kommt ohnehin über
          einen Commit.
        </p>
      </div>

      {mitHinweis.length > 0 && (
        <div className="admin-table-wrap" style={{ padding: 16, marginBottom: 18, borderLeft: '3px solid #E8A000' }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            <strong>{mitHinweis.length} Stück(e) tragen eine Bedingung aus dem Plan.</strong>{' '}
            Sie steht jeweils über dem Text — zum Beispiel der Vorbehalt, dass Kundenstimmen
            nur mit schriftlicher Einwilligung veröffentlicht werden dürfen.
          </p>
        </div>
      )}

      {/* ── Herkunft ───────────────────────────────────────────────── */}
      <section style={{ marginBottom: 22 }}>
        <h2 style={ueberschrift}>Herkunft</h2>
        <p style={hinweis}>
          Die Pläne sind in verschiedenen Formaten geschrieben; gelesen werden alle.
          {katalog.uebersprungen > 0 && (
            <> {katalog.uebersprungen} Abschnitt(e) enthalten keinen Beitragstext — etwa
            Story-Konzepte, die nur eine Bildfolge beschreiben — und sind daher nicht
            aufgeführt.</>
          )}
        </p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Plandatei</th><th>Stücke</th></tr></thead>
            <tbody>
              {jeQuelle.map(q => (
                <tr key={q.datei}>
                  <td><code style={{ fontSize: 12 }}>{q.datei}</code></td>
                  <td style={{ fontWeight: 700 }}>{q.anzahl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Frequenz ───────────────────────────────────────────────── */}
      <section style={{ marginBottom: 22 }}>
        <h2 style={ueberschrift}>Frequenz — Ziel: mindestens {ZIEL_PRO_WOCHE} pro Woche</h2>
        {wochenUnterZiel.length > 0 && (
          <p style={hinweis}>
            {wochenUnterZiel.length} Woche(n) liegen unter dem Ziel. Das ist kein Fehler des
            Plans, sondern die Stelle, an der Nachschub gebraucht wird.
          </p>
        )}
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Woche ab</th><th>Stücke</th><th>Ziel erreicht</th></tr></thead>
            <tbody>
              {frequenz.length === 0 ? (
                <tr><td colSpan={3} style={{ color: 'var(--ink5)' }}>Keine datierten Stücke</td></tr>
              ) : frequenz.map(w => (
                <tr key={w.woche}>
                  <td style={{ whiteSpace: 'nowrap' }}>{w.woche}</td>
                  <td style={{ fontWeight: 700 }}>{w.anzahl}</td>
                  <td style={{ color: w.erfuellt ? '#5CB882' : '#E8A000', fontWeight: 600 }}>
                    {w.erfuellt ? 'ja' : `nein — ${ZIEL_PRO_WOCHE - w.anzahl} fehlen`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Mix ────────────────────────────────────────────────────── */}
      <section style={{ marginBottom: 22 }}>
        <h2 style={ueberschrift}>Content-Mix</h2>
        <p style={hinweis}>
          {mitRegion} von {katalog.stuecke.length} Stücken haben einen erkennbaren Regionsbezug.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Kategorie</th><th>Stücke</th></tr></thead>
              <tbody>
                {Object.entries(nachKategorie).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                  <tr key={k}>
                    <td><span style={{ color: farbeFuer(k) }}>■</span> {k}</td>
                    <td style={{ fontWeight: 700 }}>{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Plattform</th><th>Stücke</th></tr></thead>
              <tbody>
                {Object.entries(nachPlattform).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                  <tr key={k}><td>{k}</td><td style={{ fontWeight: 700 }}>{n}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Die Stücke ─────────────────────────────────────────────── */}
      <section>
        <h2 style={ueberschrift}>Alle Stücke, chronologisch</h2>
        {katalog.stuecke.length === 0 ? (
          <div className="admin-table-wrap" style={{ padding: 16 }}>
            <p style={{ margin: 0 }}>
              Keine Stücke gefunden. Erwartet werden Dateien unter <code>docs/marketing/</code>
              mit Abschnitten <code>## Post N</code>, <code>### Tag N</code> oder{' '}
              <code>## Kampagne N</code> und einem Textfeld (<code>**Text:**</code>,{' '}
              <code>**Caption:**</code>, <code>### Post-Text</code> oder <code>### Text</code>).
            </p>
          </div>
        ) : katalog.stuecke.map(s => <Stueck key={s.id} s={s} />)}
      </section>
    </div>
  )
}

const ueberschrift: React.CSSProperties = {
  fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: 'var(--ink)',
}
const hinweis: React.CSSProperties = {
  fontSize: 13, color: 'var(--ink3)', margin: '0 0 12px', lineHeight: 1.5,
}
const chip: React.CSSProperties = {
  display: 'inline-block', padding: '4px 10px', borderRadius: 999,
  border: '1px solid var(--border)', fontSize: 12, color: 'var(--ink3)',
}
const textFeld: React.CSSProperties = {
  background: 'var(--coal3)', border: '1px solid var(--border)', borderRadius: 10,
  padding: '14px 16px', fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink2)',
  whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
  fontFamily: "'Jost', sans-serif", maxHeight: 340, overflowY: 'auto',
}
const hinweisFeld: React.CSSProperties = {
  background: 'rgba(232,160,0,0.08)', border: '1px solid rgba(232,160,0,0.35)',
  borderRadius: 8, padding: '10px 12px', fontSize: 13, lineHeight: 1.55,
  color: 'var(--ink2)', margin: '0 0 10px',
}
const feldTitel: React.CSSProperties = {
  fontSize: 11, color: 'var(--ink5)', fontWeight: 700, marginBottom: 3,
}
const feldWert: React.CSSProperties = {
  fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5,
}
