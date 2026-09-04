'use client'
/** Schritt 1 — Begrüßung. Sammelt nichts; nimmt die Angst vor dem Formular. */
export default function Schritt01Willkommen() {
  return (
    <div style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink)' }}>
      <p style={{ marginTop: 0 }}>
        Als Alltagsbegleiterin oder Alltagsbegleiter unterstützen Sie Menschen
        in ihrem gewohnten Zuhause — beim Einkaufen, bei Terminen oder einfach
        mit Gesellschaft.
      </p>
      <ul style={{ paddingLeft: 20, margin: '12px 0' }}>
        <li>Eine Ausbildung ist <strong>nicht</strong> nötig.</li>
        <li>Sie bestimmen selbst, wann und wie viel Sie arbeiten.</li>
        <li>Wir melden uns nach Ihrer Bewerbung persönlich bei Ihnen.</li>
      </ul>
      <p style={{ marginBottom: 0, color: 'var(--ink4)' }}>
        Das Ausfüllen dauert etwa fünf Minuten. Ihre Angaben werden bei jedem
        Schritt gespeichert — Sie können jederzeit pausieren.
      </p>
    </div>
  )
}
