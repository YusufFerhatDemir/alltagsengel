'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  IconShield,
  IconClipboard,
  IconCard,
  IconCheck,
  IconInfo,
} from '@/components/Icons'

export default function EngelInfoPage() {
  const router = useRouter()

  return (
    <div className="screen engel-info-screen">
      <div className="legal-header">
        <button
          className="legal-back"
          onClick={() => router.back()}
          aria-label="Zurück"
        >
          ‹
        </button>
        <h1 className="legal-title">Info &amp; Ablauf</h1>
      </div>

      <div className="legal-body">
        {/* Intro */}
        <section className="legal-section">
          <h2>Willkommen bei AlltagsEngel</h2>
          <p>
            AlltagsEngel ist die Vermittlungs­plattform, die dich als Alltags­begleiter:in
            mit Menschen zusammenbringt, die Unterstützung im Alltag brauchen. Wir sind
            <strong> kein Arbeitgeber</strong> — du bleibst selbständig und entscheidest,
            welche Aufträge du annimmst. Wir kümmern uns um das Drumherum: Verifizierung,
            Versicherung, Abrechnung mit der Pflegekasse.
          </p>
        </section>

        {/* Ablauf */}
        <section className="legal-section">
          <h2>
            <IconClipboard size={18} /> So läuft der Ablauf
          </h2>

          <div className="info-step">
            <div className="info-step-num">1</div>
            <div className="info-step-body">
              <h3>Registrieren &amp; Dokumente hochladen</h3>
              <p>
                Du lädst Ausweis, erweitertes Führungszeugnis und — falls
                vorhanden — deine Qualifizierung nach §45a SGB XI hoch. Ohne
                diese Dokumente kannst du keine Aufträge annehmen.
              </p>
            </div>
          </div>

          <div className="info-step">
            <div className="info-step-num">2</div>
            <div className="info-step-body">
              <h3>Verifizierung durch uns</h3>
              <p>
                Wir prüfen deine Unterlagen innerhalb von 24–72 Stunden. Sobald
                alles freigegeben ist, erhältst du eine Benachrichtigung und
                kannst online gehen.
              </p>
            </div>
          </div>

          <div className="info-step">
            <div className="info-step-num">3</div>
            <div className="info-step-body">
              <h3>Online gehen &amp; Anfragen bekommen</h3>
              <p>
                Mit dem Online-Schalter auf der Home-Seite bist du für
                Kund:innen in deiner Umgebung sichtbar. Jede Anfrage kannst
                du einzeln annehmen oder ablehnen — du bist nie verpflichtet.
              </p>
            </div>
          </div>

          <div className="info-step">
            <div className="info-step-num">4</div>
            <div className="info-step-body">
              <h3>Einsatz durchführen</h3>
              <p>
                Du kommst zum vereinbarten Termin und unterstützt bei
                Alltags­tätigkeiten wie Gesellschaft leisten, Einkaufen,
                Spazier­gängen oder Arztbegleitung. Pflegerische Tätigkeiten
                gehören <strong>nicht</strong> zu deinem Leistungsumfang.
              </p>
            </div>
          </div>

          <div className="info-step">
            <div className="info-step-num">5</div>
            <div className="info-step-body">
              <h3>Abrechnung — §45b SGB XI</h3>
              <p>
                Nach dem Einsatz rechnen wir direkt mit der Pflegekasse der
                Kund:in ab (Entlastungsbetrag 131&nbsp;€ pro Monat). Du
                bekommst deine Vergütung automatisch aufs hinterlegte Konto
                — in der Regel innerhalb von 14 Tagen.
              </p>
            </div>
          </div>
        </section>

        {/* Datenschutz */}
        <section className="legal-section">
          <h2>
            <IconShield size={18} /> Datenschutz &amp; deine Daten
          </h2>
          <p>
            Wir verarbeiten deine personenbezogenen Daten ausschließlich zum
            Zweck der Vermittlung und gesetzlicher Pflichten (z.&nbsp;B.
            Abrechnung). Grundlage ist <strong>Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;b
            DSGVO</strong> (Vertragserfüllung) sowie dein ausdrückliches
            Einverständnis dort, wo es nötig ist.
          </p>

          <h3>Welche Daten wir speichern</h3>
          <ul className="info-list">
            <li>Name, Geburtsdatum, Adresse, Telefon, E-Mail</li>
            <li>Hochgeladene Dokumente (Ausweis, Führungszeugnis, Qualifikation)</li>
            <li>Bankverbindung für deine Vergütung</li>
            <li>Verfügbarkeiten und Einsatzhistorie</li>
            <li>Bewertungen durch Kund:innen (anonymisiert sichtbar)</li>
          </ul>

          <h3>Was wir <em>nicht</em> tun</h3>
          <ul className="info-list">
            <li>Daten an Dritte zu Werbezwecken weitergeben</li>
            <li>Klartext-Passwörter per E-Mail versenden — nie.</li>
            <li>Deine Daten in unsicheren Ländern verarbeiten (Server in EU)</li>
          </ul>

          <h3>Deine Rechte</h3>
          <p>
            Du hast jederzeit das Recht auf <strong>Auskunft, Berichtigung,
            Löschung, Einschränkung und Datenübertragbarkeit</strong>. Schreib
            uns an <a href="mailto:info@alltagsengel.care">info@alltagsengel.care</a>
            — wir antworten innerhalb von 30 Tagen. Die vollständige
            Datenschutz­erklärung findest du{' '}
            <Link href="/datenschutz" style={{ color: 'var(--gold2)' }}>
              hier
            </Link>.
          </p>
        </section>

        {/* Versicherung */}
        <section className="legal-section">
          <h2>
            <IconShield size={18} /> Versicherung während der Einsätze
          </h2>
          <p>
            AlltagsEngel schließt für alle verifizierten Engel eine{' '}
            <strong>Berufshaftpflicht­versicherung</strong> ab, die während
            vermittelter Einsätze greift. Damit bist du abgesichert, wenn im
            Rahmen deiner Tätigkeit versehentlich Sach- oder Personenschäden
            entstehen.
          </p>
          <p style={{ color: 'var(--ink4)', fontSize: 12 }}>
            Hinweis: Die Versicherung deckt <strong>keine vorsätzlichen
            Handlungen</strong> und greift nur für über AlltagsEngel vermittelte
            Einsätze. Details in deiner Versicherungs­bestätigung, die du nach
            Freischaltung per E-Mail erhältst.
          </p>
        </section>

        {/* Vergütung */}
        <section className="legal-section">
          <h2>
            <IconCard size={18} /> Deine Vergütung
          </h2>
          <ul className="info-list">
            <li>
              <strong>20&nbsp;€ pro Stunde</strong> — Festbetrag, transparent
              und unabhängig vom Abrechnungs­weg.
            </li>
            <li>
              Keine versteckten Kosten oder Abzüge. Was du siehst, bekommst du.
            </li>
            <li>
              Auszahlung automatisch nach jedem Einsatz (ca. 7–14 Tage nach
              Abrechnung mit der Pflegekasse).
            </li>
            <li>
              Du bekommst monatlich eine Abrechnungs­übersicht zum Export für
              dein Steuer­büro.
            </li>
          </ul>
          <p style={{ color: 'var(--ink4)', fontSize: 12 }}>
            Als selbständige:r Alltags­begleiter:in bist du für die
            Versteuerung deiner Einnahmen selbst verantwortlich. Wir
            empfehlen die Rücksprache mit einem Steuer­berater.
          </p>
        </section>

        {/* Was gehört zu den Aufgaben */}
        <section className="legal-section">
          <h2>
            <IconCheck size={18} /> Deine Aufgaben als Alltags­begleiter:in
          </h2>
          <h3>Das machst du</h3>
          <ul className="info-list">
            <li>Gesellschaft leisten, Zuhören, Gespräche führen</li>
            <li>Spaziergänge und Ausflüge begleiten</li>
            <li>Einkäufe und Besorgungen erledigen</li>
            <li>Zu Arztterminen oder Behörden begleiten</li>
            <li>Haushaltsnahe Unterstützung (z. B. Post sortieren)</li>
            <li>Freizeit­beschäftigung, Vorlesen, Spielen</li>
          </ul>
          <h3>Das machst du <em>nicht</em></h3>
          <ul className="info-list" style={{ '--bullet': 'var(--red-w)' } as React.CSSProperties}>
            <li>Pflegerische Tätigkeiten (Waschen, Medikamente, Wunden)</li>
            <li>Medizinische Behandlungen oder Diagnosen</li>
            <li>Tätigkeiten, für die eine Pflege­qualifikation nötig ist</li>
          </ul>
        </section>

        {/* Kontakt */}
        <section className="legal-section">
          <h2>
            <IconInfo size={18} /> Fragen?
          </h2>
          <p>
            Wir sind für dich da — von Mensch zu Mensch.
          </p>
          <p>
            <strong>E-Mail:</strong>{' '}
            <a href="mailto:info@alltagsengel.care">info@alltagsengel.care</a>
            <br />
            <strong>Support:</strong> Mo–Fr 9:00–18:00 Uhr
          </p>
        </section>

        <div className="legal-footer-nav">
          <Link href="/datenschutz">Datenschutz</Link>
          <Link href="/impressum">Impressum</Link>
          <Link href="/agb">AGB</Link>
        </div>
      </div>
    </div>
  )
}
