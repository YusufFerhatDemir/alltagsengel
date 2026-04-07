import type { Metadata, Viewport } from 'next'
import { Jost, Cormorant_Garamond } from 'next/font/google'
import './globals.css'
import LayoutWrapper from '@/components/LayoutWrapper'
import VisitorTracker from '@/components/VisitorTracker'
import CookieConsent from '@/components/CookieConsent'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'
import PushProvider from '@/components/PushProvider'
import NativePushProvider from '@/components/NativePushProvider'
import GoogleTagManager from '@/components/GoogleTagManager'
import SessionKeepAlive from '@/components/SessionKeepAlive'

const jost = Jost({ subsets: ['latin'], variable: '--font-jost', weight: ['300','400','500','600','700'] })
const cormorant = Cormorant_Garamond({ subsets: ['latin'], variable: '--font-cormorant', weight: ['400','500','600','700'], style: ['normal','italic'] })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#1A1612',
  colorScheme: 'only dark' as any,
}

export const metadata: Metadata = {
  title: {
    default: 'Alltagsengel.care — Premium Alltagsbegleitung',
    template: '%s | Alltagsengel.care',
  },
  description: 'Zertifizierte Alltagsbegleiter für Senioren & Pflegebedürftige. Abrechnung über §45b SGB XI — 131€/Monat. Jetzt Engel finden.',
  keywords: ['Alltagsbegleitung', 'Seniorenbetreuung', 'Pflegehilfe', '§45b SGB XI', 'Entlastungsbetrag', 'Alltagsbegleiter', 'Frankfurt', 'Pflege'],
  metadataBase: new URL('https://alltagsengel.care'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Alltagsengel.care — Premium Alltagsbegleitung',
    description: 'Zertifizierte Alltagsbegleiter für Senioren & Pflegebedürftige. 131€/Monat über die Pflegekasse. Jetzt kostenlos registrieren.',
    url: 'https://alltagsengel.care',
    siteName: 'Alltagsengel.care',
    locale: 'de_DE',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Alltagsengel.care — Premium Alltagsbegleitung für Senioren',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Alltagsengel.care — Premium Alltagsbegleitung',
    description: 'Zertifizierte Alltagsbegleiter für Senioren & Pflegebedürftige. 131€/Monat über die Pflegekasse.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: '/manifest.json',
  icons: [
    { rel: 'icon', url: '/favicon.ico', sizes: '32x32' },
    { rel: 'icon', url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    { rel: 'apple-touch-icon', url: '/apple-touch-icon.png', sizes: '180x180' },
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AlltagsEngel',
  },
  formatDetection: {
    telephone: false,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" data-theme="dark" style={{ colorScheme: 'only dark' } as any}>
      <head>
        {/* ═══ ANDROID AUTO-DARK / AKKU-SPARMODUS SCHUTZ ═══ */}
        {/* Chrome Auto Dark Theme opt-out (offizielle Methode) */}
        <meta name="color-scheme" content="only dark" />
        <meta name="supported-color-schemes" content="dark" />
        {/* DarkReader Browser-Extension blockieren */}
        <meta name="darkreader-lock" />
        <meta name="darkreader" content="NO" />
        {/* Samsung Internet Dark Mode blockieren */}
        <meta name="nightmode" content="disable" />
        {/* Android Chrome Theme */}
        <meta name="theme-color" content="#1A1612" />
        <meta name="msapplication-navbutton-color" content="#1A1612" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* Frühes Script: Auto-Dark Detection und Removal */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            // Ensure color-scheme is set before any rendering
            document.documentElement.style.colorScheme='dark';
            // Remove any filter/inversion applied by browser dark mode
            var s=document.documentElement.style;
            if(s.filter)s.filter='none';
            // Observer: watch for browser-injected style changes
            var obs=new MutationObserver(function(m){
              m.forEach(function(r){
                if(r.attributeName==='style'){
                  var el=r.target;
                  var cs=el.style;
                  if(cs.filter&&cs.filter!=='none'){cs.filter='none';}
                  if(cs.getPropertyValue&&cs.getPropertyValue('-webkit-filter')!=='none'){
                    cs.setProperty('-webkit-filter','none','important');
                  }
                }
              });
            });
            obs.observe(document.documentElement,{attributes:true,attributeFilter:['style']});
            document.addEventListener('DOMContentLoaded',function(){
              obs.observe(document.body,{attributes:true,attributeFilter:['style']});
            });
          })();
        `}} />
      </head>
      <body className={`${jost.variable} ${cormorant.variable}`} style={{ fontFamily: "'Jost', sans-serif", backgroundColor: '#1A1612', color: '#F5F0E8' }}>
        <GoogleTagManager />
        <VisitorTracker />
        <LayoutWrapper>
          {children}
        </LayoutWrapper>
        <SessionKeepAlive />
        <CookieConsent />
        <ServiceWorkerRegister />
        <PushProvider />
        <NativePushProvider />
      </body>
    </html>
  )
}
