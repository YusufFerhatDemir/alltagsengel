/**
 * Root Loading — minimaler Indikator statt Full-Screen-Spinner.
 *
 * Der alte Full-Screen-Spinner (min-height:100dvh, opaker Hintergrund)
 * hat den FCP blockiert: Erst wurde der Spinner gemalt, dann ~13s
 * gewartet bis Hydration + JS fertig war. Für SEO und Web-UX muss
 * Content sofort sichtbar sein.
 *
 * Jetzt: dünner Progress-Bar oben — blockiert keinen Content.
 */
export default function Loading() {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: 3,
      zIndex: 9999,
      overflow: 'hidden',
      background: 'rgba(201,150,60,.15)',
    }}>
      <div style={{
        width: '40%',
        height: '100%',
        background: 'linear-gradient(90deg, transparent, #C9963C, transparent)',
        animation: 'loadBar 1.2s ease-in-out infinite',
      }} />
      <style>{`@keyframes loadBar { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }`}</style>
    </div>
  )
}
