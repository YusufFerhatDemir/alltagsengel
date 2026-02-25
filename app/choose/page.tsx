import Link from 'next/link'
import Icon3D from '@/components/Icon3D'

function PersonHeartIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Person silhouette */}
      <circle cx="12" cy="8" r="4.5" fill="url(#goldGrad)" />
      <path d="M4 26c0-5.5 3.6-9 8-9s8 3.5 8 9" fill="url(#goldGrad)" />
      {/* Heart */}
      <path d="M22.5 8.5c0-1.8 1.4-3.2 3-3.2s3 1.4 3 3.2c0 3.6-3 5.7-3 5.7s-3-2.1-3-5.7z" fill="url(#goldGrad2)" />
      <defs>
        <linearGradient id="goldGrad" x1="4" y1="4" x2="20" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ECC870" />
          <stop offset="50%" stopColor="#C9963C" />
          <stop offset="100%" stopColor="#A67A2E" />
        </linearGradient>
        <linearGradient id="goldGrad2" x1="22" y1="5" x2="28" y2="14" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F8E064" />
          <stop offset="100%" stopColor="#DBA84A" />
        </linearGradient>
      </defs>
    </svg>
  )
}

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
              <PersonHeartIcon />
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
            <div className="role-icon-3d">
              <img src="/assets/icon.jpg" alt="Engel" />
            </div>
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
