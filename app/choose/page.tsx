import Link from 'next/link'
import Icon3D from '@/components/Icon3D'

export default function ChoosePage() {
  return (
    <div className="screen" id="choose">
      <div className="ch-wrap">
        <div className="ch-logo">
          <Icon3D size={64} />
        </div>
        <div className="ch-title">Wie möchten Sie<br/>Alltagsengel nutzen?</div>
        <div className="ch-sub">Wählen Sie Ihre Rolle, um<br/>die passende Erfahrung zu erhalten.</div>

        <Link href="/auth/register?role=kunde" style={{ textDecoration: 'none' }}>
          <div className="role-card">
            <div className="role-icon-3d">
              <img src="/assets/hilfe-icon.svg" alt="Hilfe" />
            </div>
            <div className="role-text">
              <h3>Ich suche Hilfe</h3>
              <p>Finden Sie zertifizierte Alltagsbegleiter in Ihrer Nähe. Versichert &amp; §45b-fähig.</p>
            </div>
            <div className="role-arr">›</div>
          </div>
        </Link>

        <Link href="/auth/register?role=engel" style={{ textDecoration: 'none' }}>
          <div className="role-card">
            <Icon3D size={52} />
            <div className="role-text">
              <h3>Ich bin ein Engel</h3>
              <p>Zertifiziert · Selbständig · Bundesweit Aufträge. Versicherungsschutz über Alltagsengel.</p>
            </div>
            <div className="role-arr">›</div>
          </div>
        </Link>

        <div className="ch-legal">
          Mit Nutzung stimmen Sie den <a>AGB</a> &amp; <a>Datenschutzerklärung</a> zu.
        </div>
      </div>
    </div>
  )
}
