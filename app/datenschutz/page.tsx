import Link from 'next/link'
import type { Metadata } from 'next'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import CookieSettingsLink from '@/components/CookieSettingsLink'

export const metadata: Metadata = {
  title: 'Datenschutzerklärung',
  description: 'Datenschutzerklärung der Alltagsengel UG (haftungsbeschränkt). Informationen zu Datenverarbeitung, Cookies und Ihren Rechten.',
  alternates: { canonical: 'https://alltagsengel.care/datenschutz' },
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    title: 'Datenschutzerklärung — Alltagsengel',
    description: 'Informationen zu Datenverarbeitung, Cookies und Ihren Rechten bei Alltagsengel.',
    url: 'https://alltagsengel.care/datenschutz',
  },
}

export default function DatenschutzPage() {
  return (
    <div className="screen legal-screen">
      <BreadcrumbSchema items={[{ name: 'Datenschutz' }]} />
      <div className="legal-header">
        <Link href="/" className="legal-back">‹</Link>
        <h1 className="legal-title">Datenschutzerklärung</h1>
      </div>
      <div className="legal-body">
        <section className="legal-section">
          <h2>1. Datenschutz auf einen Blick</h2>
          <h3>Allgemeine Hinweise</h3>
          <p>
            Die folgenden Hinweise geben einen einfachen Überblick darüber, was mit Ihren personenbezogenen Daten
            passiert, wenn Sie diese Website besuchen. Personenbezogene Daten sind alle Daten, mit denen Sie
            persönlich identifiziert werden können.
          </p>
          <h3>Datenerfassung auf dieser Website</h3>
          <p>
            <strong>Wer ist verantwortlich für die Datenerfassung auf dieser Website?</strong><br/>
            Die Datenverarbeitung auf dieser Website erfolgt durch den Websitebetreiber:<br/><br/>
            Alltagsengel UG (haftungsbeschränkt)<br/>
            Neue Mainzer Straße 66-68<br/>
            60311 Frankfurt am Main<br/>
            Geschäftsführer: Yusuf Ferhat Demir<br/>
            E-Mail: info@alltagsengel.care
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Hosting</h2>
          <p>
            Diese Website wird bei einem externen Dienstleister gehostet (Hoster). Die personenbezogenen Daten, die
            auf dieser Website erfasst werden, werden auf den Servern des Hosters gespeichert. Hierbei kann es sich
            v. a. um IP-Adressen, Kontaktanfragen, Meta- und Kommunikationsdaten, Vertragsdaten, Kontaktdaten,
            Namen, Websitezugriffe und sonstige Daten, die über eine Website generiert werden, handeln.
          </p>
          <p>
            Unser Hoster ist Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, USA. Die Datenverarbeitung
            erfolgt auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO.
          </p>
        </section>

        <section className="legal-section">
          <h2>3. Allgemeine Hinweise und Pflichtinformationen</h2>
          <h3>Datenschutz</h3>
          <p>
            Die Betreiber dieser Seiten nehmen den Schutz Ihrer persönlichen Daten sehr ernst. Wir behandeln Ihre
            personenbezogenen Daten vertraulich und entsprechend der gesetzlichen Datenschutzvorschriften sowie
            dieser Datenschutzerklärung.
          </p>
          <h3>Hinweis zur verantwortlichen Stelle</h3>
          <p>
            Verantwortliche Stelle ist die natürliche oder juristische Person, die allein oder gemeinsam mit anderen
            über die Zwecke und Mittel der Verarbeitung personenbezogener Daten entscheidet.
          </p>
          <p>
            Die verantwortliche Stelle für die Datenverarbeitung auf dieser Website ist:<br/>
            Alltagsengel UG (haftungsbeschränkt)<br/>
            Neue Mainzer Straße 66-68<br/>
            60311 Frankfurt am Main<br/>
            Geschäftsführer: Yusuf Ferhat Demir<br/>
            E-Mail: info@alltagsengel.care
          </p>
          <h3>Speicherdauer</h3>
          <p>
            Soweit innerhalb dieser Datenschutzerklärung keine speziellere Speicherdauer genannt wurde, verbleiben
            Ihre personenbezogenen Daten bei uns, bis der Zweck für die Datenverarbeitung entfällt. Wenn Sie ein
            berechtigtes Löschersuchen geltend machen oder eine Einwilligung zur Datenverarbeitung widerrufen,
            werden Ihre Daten gelöscht, sofern wir keine anderen rechtlich zulässigen Gründe für die Speicherung
            Ihrer personenbezogenen Daten haben.
          </p>
          <h3>Widerruf Ihrer Einwilligung zur Datenverarbeitung</h3>
          <p>
            Viele Datenverarbeitungsvorgänge sind nur mit Ihrer ausdrücklichen Einwilligung möglich. Sie können eine
            bereits erteilte Einwilligung jederzeit widerrufen. Die Rechtmäßigkeit der bis zum Widerruf erfolgten
            Datenverarbeitung bleibt vom Widerruf unberührt.
          </p>
          <p>
            Ihre Cookie-Einwilligung können Sie hier direkt anpassen oder widerrufen:{' '}
            <CookieSettingsLink style={{ color: '#C9963C', textDecoration: 'underline' }} />
          </p>
          <h3>Recht auf Datenübertragbarkeit</h3>
          <p>
            Sie haben das Recht, Daten, die wir auf Grundlage Ihrer Einwilligung oder in Erfüllung eines Vertrags
            automatisiert verarbeiten, an sich oder an einen Dritten in einem gängigen, maschinenlesbaren Format
            aushändigen zu lassen.
          </p>
          <h3>Auskunft, Löschung und Berichtigung</h3>
          <p>
            Sie haben im Rahmen der geltenden gesetzlichen Bestimmungen jederzeit das Recht auf unentgeltliche
            Auskunft über Ihre gespeicherten personenbezogenen Daten, deren Herkunft und Empfänger und den Zweck
            der Datenverarbeitung und ggf. ein Recht auf Berichtigung oder Löschung dieser Daten.
          </p>
        </section>

        <section className="legal-section">
          <h2>4. Datenerfassung auf dieser Website</h2>
          <h3>Registrierung auf dieser Website</h3>
          <p>
            Sie können sich auf dieser Website registrieren, um zusätzliche Funktionen auf der Seite zu nutzen. Die
            dazu eingegebenen Daten verwenden wir nur zum Zwecke der Nutzung des jeweiligen Angebotes oder Dienstes,
            für den Sie sich registriert haben. Die bei der Registrierung abgefragten Pflichtangaben müssen
            vollständig angegeben werden. Anderenfalls werden wir die Registrierung ablehnen.
          </p>
          <p>
            Wir speichern: Name, E-Mail-Adresse, Postleitzahl, Stadt und ggf. Ihre Rolle (Kunde oder Alltagsbegleiter).
          </p>
          <h3>Anfrage per E-Mail</h3>
          <p>
            Wenn Sie uns per E-Mail kontaktieren, wird Ihre Anfrage inklusive aller daraus hervorgehenden
            personenbezogenen Daten zum Zwecke der Bearbeitung bei uns gespeichert.
          </p>
        </section>

        <section className="legal-section">
          <h2>5. Dienste von Drittanbietern</h2>
          <h3>Supabase</h3>
          <p>
            Für die Authentifizierung und Datenspeicherung nutzen wir Supabase (Supabase Inc.). Supabase verarbeitet
            die Daten in sicheren Rechenzentren. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
          </p>
          <h3>Vercel</h3>
          <p>
            Für das Hosting nutzen wir Vercel Inc. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse
            an einer zuverlässigen Darstellung unserer Website).
          </p>
          <h3>OpenStreetMap</h3>
          <p>
            Auf der Seite „Einzugsgebiet" binden wir Kartenmaterial von OpenStreetMap ein (OpenStreetMap Foundation,
            St John's Innovation Centre, Cowley Road, Cambridge, CB4 0WS, Großbritannien). Beim Laden der Karte wird
            Ihre IP-Adresse an Server der OpenStreetMap Foundation übertragen; wir haben keinen Einfluss auf diese
            Datenverarbeitung. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einer
            ansprechenden Darstellung unseres Einzugsgebiets). Weitere Informationen:{' '}
            <a href="https://wiki.osmfoundation.org/wiki/Privacy_Policy" target="_blank" rel="noopener noreferrer" style={{ color: '#C9963C', textDecoration: 'underline' }}>
              Datenschutzerklärung der OSMF
            </a>.
          </p>
          <h3>Resend (E-Mail-Versand)</h3>
          <p>
            Für den Versand von E-Mails (Registrierungsbestätigung, Passwort-Reset, Newsletter, Drip-Kampagnen)
            nutzen wir den Dienst Resend (Resend Inc., USA). Dabei werden Ihre E-Mail-Adresse und ggf. Ihr Name
            an Resend übermittelt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) bzw. Art. 6
            Abs. 1 lit. a DSGVO (Einwilligung bei Newsletter). Weitere Informationen:{' '}
            <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: '#C9963C', textDecoration: 'underline' }}>
              Datenschutzerklärung von Resend
            </a>.
          </p>
          <h3>Google Gemini AI (KI-gestützter Chat)</h3>
          <p>
            Für den KI-gestützten Beratungschat und die WhatsApp-Assistenzfunktion nutzen wir Google Gemini AI
            (Google LLC, 1600 Amphitheatre Parkway, Mountain View, CA 94043, USA). Dabei werden Ihre Chatnachrichten
            an Google-Server übermittelt, um Ihnen passende Antworten zu generieren. Es werden keine personenbezogenen
            Daten dauerhaft bei Google gespeichert. Rechtsgrundlage ist Art. 6 Abs. 1 lit. a DSGVO (Einwilligung)
            bzw. Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einem hilfreichen Beratungsangebot).
          </p>
          <h3>OpenAI (KI-Fallback)</h3>
          <p>
            Ist Google Gemini nicht verfügbar, greift unser Chat ersatzweise auf die API von OpenAI (OpenAI, L.L.C.,
            3180 18th Street, San Francisco, CA 94110, USA) zurück. In diesem Fall werden Ihre Chatnachrichten an
            OpenAI-Server übermittelt, um eine Antwort zu erzeugen. Die Daten werden von OpenAI nicht zum Training
            der Modelle verwendet. Rechtsgrundlage ist Art. 6 Abs. 1 lit. a DSGVO (Einwilligung) bzw. Art. 6 Abs. 1
            lit. f DSGVO (berechtigtes Interesse an einem hilfreichen Beratungsangebot).
          </p>
          <h3>WhatsApp Business API (Meta)</h3>
          <p>
            Wir bieten Kundenkommunikation über WhatsApp an. Dabei wird die WhatsApp Business API von Meta Platforms
            Ireland Ltd. (4 Grand Canal Square, Dublin 2, Irland) genutzt. Wenn Sie uns über WhatsApp kontaktieren,
            werden Ihre Telefonnummer, Nachrichteninhalte und ggf. Medien von Meta verarbeitet. Rechtsgrundlage ist
            Art. 6 Abs. 1 lit. a DSGVO (Einwilligung durch Ihre Kontaktaufnahme). Weitere Informationen:{' '}
            <a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: '#C9963C', textDecoration: 'underline' }}>
              Datenschutzerklärung von WhatsApp
            </a>.
          </p>
          <h3>Expo Push Notifications (Mobile App)</h3>
          <p>
            In unserer mobilen App nutzen wir den Push-Notification-Service von Expo (650 Industries Inc., USA).
            Dabei wird ein gerätegebundenes Push-Token an Expo-Server übermittelt, um Ihnen Benachrichtigungen
            zuzustellen. Zur technischen Zustellung wird zusätzlich Firebase Cloud Messaging (Google LLC, USA)
            eingesetzt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. a DSGVO (Einwilligung durch Aktivierung der
            Push-Benachrichtigungen auf Ihrem Gerät).
          </p>
          <h3>Sentry (Fehler-Monitoring)</h3>
          <p>
            Zur Erkennung und Behebung von technischen Fehlern nutzen wir Sentry (Functional Software Inc.,
            132 Hawthorne Street, San Francisco, CA 94107, USA). Tritt in der App oder auf der Website ein Fehler
            auf, werden technische Daten wie Fehlermeldung, aufgerufene Seite, Browser-/Gerätetyp und IP-Adresse an
            Sentry übermittelt. Diese Daten dienen ausschließlich der Stabilität und Sicherheit unseres Angebots.
            Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einem fehlerfreien und sicheren
            Betrieb). Weitere Informationen:{' '}
            <a href="https://sentry.io/privacy/" target="_blank" rel="noopener noreferrer" style={{ color: '#C9963C', textDecoration: 'underline' }}>
              Datenschutzerklärung von Sentry
            </a>.
          </p>
          <h3>Google Tag Manager & Google Ads (Consent Mode v2)</h3>
          <p>
            Zur Auslieferung von Marketing-Tags und zur Messung von Werbe-Conversions nutzen wir den Google Tag
            Manager sowie Google Ads (Google Ireland Ltd., Gordon House, Barrow Street, Dublin 4, Irland). Diese
            Dienste laden erst nach Ihrer ausdrücklichen Einwilligung Cookies bzw. übertragen Daten wie IP-Adresse,
            aufgerufene Seiten und Geräteinformationen an Google. Standardmäßig ist das Tracking über den Google
            Consent Mode v2 deaktiviert („denied") und wird erst nach Ihrer Zustimmung im Cookie-Banner aktiviert.
            Ihre Einwilligung können Sie jederzeit über die Cookie-Einstellungen widerrufen. Rechtsgrundlage ist
            Art. 6 Abs. 1 lit. a DSGVO (Einwilligung). Weitere Informationen:{' '}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#C9963C', textDecoration: 'underline' }}>
              Datenschutzerklärung von Google
            </a>.
          </p>
          <h3>Meta Pixel (Facebook/Instagram)</h3>
          <p>
            Zur Messung der Wirksamkeit unserer Werbeanzeigen auf Facebook und Instagram nutzen wir das Meta Pixel
            (Meta Platforms Ireland Ltd., 4 Grand Canal Square, Dublin 2, Irland). Das Pixel wird erst nach Ihrer
            ausdrücklichen Einwilligung im Cookie-Banner geladen. Nach Einwilligung werden Daten wie IP-Adresse,
            besuchte Seiten und Geräteinformationen an Meta übertragen und können dort mit Ihrem Meta-Konto
            verknüpft werden. Dabei können Daten in die USA übermittelt werden (Meta ist nach dem EU-US Data
            Privacy Framework zertifiziert). Ihre Einwilligung können Sie jederzeit über die Cookie-Einstellungen
            widerrufen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. a DSGVO (Einwilligung). Weitere Informationen:{' '}
            <a href="https://www.facebook.com/privacy/policy/" target="_blank" rel="noopener noreferrer" style={{ color: '#C9963C', textDecoration: 'underline' }}>
              Datenschutzerklärung von Meta
            </a>.
          </p>
          <h3>TikTok Pixel</h3>
          <p>
            Zur Messung der Wirksamkeit unserer Werbeanzeigen auf TikTok nutzen wir das TikTok Pixel (TikTok
            Technology Ltd., 10 Earlsfort Terrace, Dublin 2, Irland). Das Pixel wird erst nach Ihrer ausdrücklichen
            Einwilligung im Cookie-Banner geladen. Nach Einwilligung werden Daten wie IP-Adresse, besuchte Seiten
            und Geräteinformationen an TikTok übertragen; eine Übermittlung in Drittländer (u. a. USA, Singapur)
            ist dabei möglich. Ihre Einwilligung können Sie jederzeit über die Cookie-Einstellungen widerrufen.
            Rechtsgrundlage ist Art. 6 Abs. 1 lit. a DSGVO (Einwilligung). Weitere Informationen:{' '}
            <a href="https://www.tiktok.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: '#C9963C', textDecoration: 'underline' }}>
              Datenschutzerklärung von TikTok
            </a>.
          </p>
        </section>

        <section className="legal-section">
          <h2>6. Kontakt zum Datenschutz</h2>
          <p>
            Wenn Sie Fragen zum Datenschutz haben, schreiben Sie uns bitte eine E-Mail an:<br/>
            <strong>info@alltagsengel.care</strong>
          </p>
        </section>

        <p className="legal-date">Stand: Juli 2026</p>

        <div className="legal-footer-nav">
          <Link href="/impressum">Impressum</Link>
          <Link href="/agb">AGB</Link>
        </div>
      </div>
    </div>
  )
}
