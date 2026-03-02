import Link from 'next/link'
import Icon3D from '@/components/Icon3D'

export default function SplashPage() {
  return (
    <div className="screen" id="splash">
      <div className="sp-glow"></div>
      <div className="sp-inner">
        <div style={{ marginBottom: 26 }}>
          <Icon3D size={140} float />
        </div>
        <div className="sp-word">ALLTAGSENGEL</div>
        <div className="sp-tag">Mit Herz für dich da</div>
        <div className="sp-ug">Premium Alltagsbegleitung</div>
        <div className="gold-div"></div>
        <div className="sp-btns">
          <Link href="/choose"><button className="btn-gold">JETZT STARTEN</button></Link>
          <Link href="/auth/login"><button className="btn-ghost">Ich habe bereits ein Konto</button></Link>
        </div>
      </div>
      <div className="sp-trust">
        <div className="trust-row">
          <div className="trust-item"><div className="trust-val">100%</div><div className="trust-lbl">Versichert</div></div>
          <div className="trust-sep"></div>
          <div className="trust-item"><div className="trust-val">§45b</div><div className="trust-lbl">Integriert</div></div>
          <div className="trust-sep"></div>
          <div className="trust-item"><div className="trust-val">24/7</div><div className="trust-lbl">Verfügbar</div></div>
        </div>
      </div>
    </div>
  )
}
