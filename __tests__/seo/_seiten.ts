/**
 * Gemeinsame Grundlage der Inhaltstests unter __tests__/seo:
 * welche Seiten gerendert werden, wie gerendert wird und wie der Text in
 * Sätze zerlegt wird. Eine Liste für alle Prüfungen — sonst prüft die eine
 * Regel Seiten, welche die andere nie sieht.
 *
 * Aufrufer müssen die Client-Komponenten selbst mocken (vi.mock wird je
 * Testdatei gehoben): LeadForm, EngelBewerbungForm, VisitTracker.
 */
import { renderToStaticMarkup } from 'react-dom/server'

export const SEITEN: Record<string, () => Promise<any>> = {
  '/': () => import('@/app/page'),
  '/alltagsbegleitung': () => import('@/app/alltagsbegleitung/page'),
  '/leistungen': () => import('@/app/leistungen/page'),
  '/entlastungsbetrag': () => import('@/app/entlastungsbetrag/page'),
  '/finanzierung': () => import('@/app/finanzierung/page'),
  '/faq': () => import('@/app/faq/page'),
  '/budgetrechner': () => import('@/app/budgetrechner/page'),
  '/einzugsgebiet': () => import('@/app/einzugsgebiet/page'),
  '/bewertungen': () => import('@/app/bewertungen/page'),
  '/ueber-uns': () => import('@/app/ueber-uns/page'),
  '/team': () => import('@/app/team/page'),
  '/engel-werden': () => import('@/app/engel-werden/page'),
  '/haushaltshilfe': () => import('@/app/haushaltshilfe/page'),
  '/verhinderungspflege': () => import('@/app/verhinderungspflege/page'),
  ...Object.fromEntries([
    'alltagsbegleiter-werden', 'alltagsbegleitung-demenz', 'alltagsbegleitung-frankfurt',
    'alltagsbegleitung-kosten', 'alltagsbegleitung-psychische-erkrankungen', 'alltagsbegleitung-vs-pflegedienst',
    'alltagshilfe-senioren', 'arztbegleitung-senioren', 'demenzbetreuung-zu-hause', 'einkaufshilfe-senioren',
    'entlastungsbetrag-45b', 'entlastungsbetrag-beantragen', 'entlastungsbetrag-nutzen',
    'entlastungsbetrag-rueckwirkend', 'haushaltshilfe-frankfurt', 'pflegegrad-1-leistungen',
    'pflegegrad-beantragen', 'senioren-hitze-sommer', 'seniorenbetreuung-frankfurt',
    'seniorenbetreuung-zu-hause', 'tipps-fuer-pflegende-angehoerige', 'was-ist-alltagsbegleitung',
    'wer-zahlt-alltagsbegleitung', 'einsamkeit-im-alter', 'pflege-app-vergleich',
    'kurzzeitpflege-verhinderungspflege-kombinieren', 'verhinderungspflege-beantragen',
  ].map(slug => [`/blog/${slug}`, () => import(`@/app/blog/${slug}/page`)])),
}

export function saetze(html: string): string[] {
  const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
    .flatMap(m => JSON.stringify(JSON.parse(m[1])).match(/"(?:[^"\\]|\\.){20,}"/g) ?? [])
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ')
  return [text, ...jsonLd]
    .join(' . ')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+|\s[—–]\s(?=[A-ZÄÖÜ])|\s·\s/)
    .map(s => s.trim())
    .filter(Boolean)
}

export async function rendere(lade: () => Promise<any>): Promise<string> {
  const mod = await lade()
  const el = await mod.default({ params: Promise.resolve({}), searchParams: Promise.resolve({}) })
  return renderToStaticMarkup(el)
}
