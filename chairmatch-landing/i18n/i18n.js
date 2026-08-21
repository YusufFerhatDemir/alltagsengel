/*!
 * ChairMatch — leichtgewichtige i18n für die statische Landing-Site.
 *
 * Kein Build-Schritt, keine Abhängigkeiten. Einbinden mit:
 *   <script src="/i18n/i18n.js" defer></script>
 *
 * Markup-API
 * ----------
 *   <h1 data-i18n="home.hero.title"></h1>              -> textContent
 *   <p  data-i18n-html="home.hero.claim"></p>          -> innerHTML (nur eigene Kataloge!)
 *   <input data-i18n-attr="placeholder:form.name">     -> Attribut(e), mehrere per ";"
 *   <section data-i18n-vars='{"city":"Frankfurt"}'>    -> {city} in allen Keys darunter
 *   data-i18n-vars='{"city":"@city.local.koeln.city"}'  -> Wert kommt aus dem Katalog
 *   <time data-i18n-date="2026-06-06">                 -> Intl.DateTimeFormat
 *   <span data-i18n-count="8" data-i18n="blog.readTime"> -> {count} + Plural via _one/_other
 *   <div data-i18n-switcher></div>                     -> Sprachumschalter wird gemountet
 *
 * JS-API (window.ChairMatchI18n)
 * ------------------------------
 *   t(key, vars?)            Übersetzung, Fallback: Locale -> de -> key
 *   getLocale() / setLocale(l)
 *   formatDate(d, opts?)     Intl.DateTimeFormat, Zeitzone Europe/Berlin
 *   formatDateTime(d, opts?)
 *   formatCurrency(n, cur?)  Intl.NumberFormat
 *   formatNumber(n, opts?)
 *   formatPriceRange(a, b)
 *
 * Ereignis `chairmatch:i18n` (auf document) nach jedem Anwenden:
 *   detail = { locale }
 *
 * Locale-Auflösung (erste Fundstelle gewinnt):
 *   ?lang=xx  ->  Cookie NEXT_LOCALE  ->  localStorage  ->  navigator.languages  ->  'de'
 * Das Cookie heißt bewusst NEXT_LOCALE, damit die Sprachwahl mit der
 * Next.js-App unter chairmatch.de identisch bleibt.
 */
(function (global) {
  'use strict';

  var LOCALES = ['de', 'en'];
  var DEFAULT_LOCALE = 'de';
  var RTL_LOCALES = ['ar', 'he', 'fa'];
  var COOKIE = 'NEXT_LOCALE';
  var STORAGE_KEY = 'cm_locale';
  var COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
  var TIMEZONE = 'Europe/Berlin';
  var CURRENCY = 'EUR';

  var LOCALE_META = {
    de: { label: 'Deutsch', flag: '🇩🇪', htmlLang: 'de-DE', intl: 'de-DE' },
    en: { label: 'English', flag: '🇬🇧', htmlLang: 'en-US', intl: 'en-GB' }
  };

  // ── Basis-URL aus dem eigenen <script>-Tag ableiten ────────────────
  // Damit funktionieren auch Unterverzeichnisse (/stadt/…, /blog/…) und
  // Deployments unter einem Pfad-Präfix ohne Konfiguration.
  var selfScript = document.currentScript ||
    (function () {
      var s = document.querySelectorAll('script[src*="i18n.js"]');
      return s.length ? s[s.length - 1] : null;
    })();
  var BASE = (function () {
    if (selfScript && selfScript.getAttribute('data-i18n-base')) {
      return selfScript.getAttribute('data-i18n-base').replace(/\/+$/, '');
    }
    if (selfScript && selfScript.src) {
      return selfScript.src.replace(/\/[^/]*$/, '');
    }
    return '/i18n';
  })();

  var catalogs = Object.create(null);
  var currentLocale = DEFAULT_LOCALE;

  // ── Hilfsfunktionen ────────────────────────────────────────────────
  function isLocale(v) { return !!v && LOCALES.indexOf(v) !== -1; }

  function readCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function writeCookie(name, value) {
    var secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = name + '=' + encodeURIComponent(value) +
      '; path=/; max-age=' + COOKIE_MAX_AGE + '; SameSite=Lax' + secure;
  }

  function storageGet(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { global.localStorage.setItem(key, value); } catch (e) { /* Private Mode */ }
  }

  /** Erste unterstützte Sprache aus der Browser-Präferenzliste. */
  function fromNavigator() {
    var langs = (global.navigator && (global.navigator.languages ||
      [global.navigator.language || global.navigator.userLanguage])) || [];
    for (var i = 0; i < langs.length; i++) {
      if (!langs[i]) continue;
      var base = String(langs[i]).toLowerCase().split('-')[0];
      if (isLocale(base)) return base;
    }
    return null;
  }

  function resolveLocale() {
    var qs = null;
    try {
      qs = new URLSearchParams(location.search).get('lang');
    } catch (e) { /* sehr alte Browser */ }
    if (isLocale(qs)) return qs;

    var cookie = readCookie(COOKIE);
    if (isLocale(cookie)) return cookie;

    var stored = storageGet(STORAGE_KEY);
    if (isLocale(stored)) return stored;

    var nav = fromNavigator();
    if (nav) return nav;

    return DEFAULT_LOCALE;
  }

  /** "a.b.c" gegen ein verschachteltes Objekt auflösen. */
  function resolvePath(obj, path) {
    var parts = path.split('.');
    var acc = obj;
    for (var i = 0; i < parts.length; i++) {
      if (acc === null || typeof acc !== 'object' || !(parts[i] in acc)) return undefined;
      acc = acc[parts[i]];
    }
    return typeof acc === 'string' ? acc : undefined;
  }

  /** {name}-Token ersetzen. Unbekannte Token bleiben sichtbar stehen. */
  function interpolate(template, vars) {
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, function (match, key) {
      var v = vars[key];
      return (v === undefined || v === null) ? match : String(v);
    });
  }

  /**
   * Waehlt bei vorhandenem Count die Plural-Variante:
   *   "blog.readTime" -> "blog.readTime_one" | "blog.readTime_other"
   * Fehlt die Variante im Katalog, greift der Basis-Key.
   */
  function pluralKey(key, n) {
    var rules = new Intl.PluralRules(intlLocale());
    var candidate = key + '_' + rules.select(n);
    var cat = catalogs[currentLocale] || {};
    if (resolvePath(cat, candidate) !== undefined) return candidate;
    if (resolvePath(catalogs[DEFAULT_LOCALE] || {}, candidate) !== undefined) return candidate;
    return key;
  }

  function t(key, vars) {
    var hit = resolvePath(catalogs[currentLocale], key);
    if (hit === undefined && currentLocale !== DEFAULT_LOCALE) {
      hit = resolvePath(catalogs[DEFAULT_LOCALE], key);   // Fallback auf Deutsch
    }
    if (hit === undefined) {
      if (global.console && console.warn) {
        console.warn('[i18n] Kein Eintrag für "' + key + '" (' + currentLocale + ')');
      }
      return key;
    }
    return interpolate(hit, vars);
  }

  // ── Intl-Formatierung ──────────────────────────────────────────────
  function intlLocale() {
    return (LOCALE_META[currentLocale] || LOCALE_META[DEFAULT_LOCALE]).intl;
  }

  function toDate(value) {
    return value instanceof Date ? value : new Date(value);
  }

  function formatDate(value, opts) {
    var d = toDate(value);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat(intlLocale(), Object.assign(
      { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TIMEZONE }, opts || {}
    )).format(d);
  }

  function formatDateTime(value, opts) {
    var d = toDate(value);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat(intlLocale(), Object.assign(
      {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE
      }, opts || {}
    )).format(d);
  }

  function formatNumber(value, opts) {
    if (typeof value !== 'number' || isNaN(value)) return '';
    return new Intl.NumberFormat(intlLocale(), opts || {}).format(value);
  }

  function formatCurrency(value, currency, opts) {
    if (typeof value !== 'number' || isNaN(value)) return '';
    return new Intl.NumberFormat(intlLocale(), Object.assign({
      style: 'currency',
      currency: currency || CURRENCY,
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2
    }, opts || {})).format(value);
  }

  /** "30–60 €" bzw. "€30–60" — mit lokalem Gedankenstrich. */
  function formatPriceRange(from, to, currency) {
    var fmt = new Intl.NumberFormat(intlLocale(), {
      style: 'currency', currency: currency || CURRENCY,
      minimumFractionDigits: 0, maximumFractionDigits: 0
    });
    if (typeof fmt.formatRange === 'function') {
      try { return fmt.formatRange(from, to); } catch (e) { /* fällt unten durch */ }
    }
    return fmt.format(from) + '–' + fmt.format(to);
  }

  // ── DOM anwenden ───────────────────────────────────────────────────
  /** Variablen des nächsten Vorfahren mit data-i18n-vars einsammeln. */
  function varsFor(el) {
    var merged = null;
    var node = el;
    var chain = [];
    while (node && node.nodeType === 1) {
      var raw = node.getAttribute && node.getAttribute('data-i18n-vars');
      if (raw) chain.unshift(raw);
      node = node.parentNode;
    }
    for (var i = 0; i < chain.length; i++) {
      try {
        var parsed = JSON.parse(chain[i]);
        merged = Object.assign(merged || {}, parsed);
      } catch (e) {
        if (global.console && console.warn) console.warn('[i18n] Ungültiges data-i18n-vars:', chain[i]);
      }
    }
    // Werte der Form "@some.key" kommen aus dem Katalog und wechseln damit
    // die Sprache mit — z. B. Stadtnamen ("München" / "Munich").
    if (merged) {
      for (var k in merged) {
        if (typeof merged[k] === 'string' && merged[k].charAt(0) === '@') {
          merged[k] = t(merged[k].slice(1));
        }
      }
    }
    return merged;
  }

  function applyTo(root) {
    var scope = root || document;

    scope.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var vars = varsFor(el);
      var count = el.getAttribute('data-i18n-count');
      if (count !== null && count !== '') {
        var n = Number(count);
        vars = Object.assign({}, vars, { count: formatNumber(n) });
        key = pluralKey(key, n);
      }
      el.textContent = t(key, vars);
    });

    // Datumsangaben rein aus dem maschinenlesbaren Wert formatieren.
    scope.querySelectorAll('[data-i18n-date]').forEach(function (el) {
      var raw = el.getAttribute('data-i18n-date');
      var style = el.getAttribute('data-i18n-date-style');
      var opts = style === 'long'
        ? { day: 'numeric', month: 'long', year: 'numeric' }
        : style === 'month' ? { month: 'long', year: 'numeric' } : null;
      var out = formatDate(raw, opts);
      if (!out) return;
      el.textContent = out;
      if (el.tagName === 'TIME') el.setAttribute('datetime', raw);
    });

    scope.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      // Nur eigene Katalogtexte — nie Nutzereingaben hier durchreichen.
      el.innerHTML = t(el.getAttribute('data-i18n-html'), varsFor(el));
    });

    scope.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      var vars = varsFor(el);
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var parts = pair.split(':');
        if (parts.length < 2) return;
        var attr = parts[0].trim();
        var key = parts.slice(1).join(':').trim();
        if (!attr || !key) return;
        el.setAttribute(attr, t(key, vars));
      });
    });
  }

  function applyDocumentMeta() {
    var html = document.documentElement;
    var meta = LOCALE_META[currentLocale] || LOCALE_META[DEFAULT_LOCALE];
    html.setAttribute('lang', meta.htmlLang);
    html.setAttribute('dir', RTL_LOCALES.indexOf(currentLocale) !== -1 ? 'rtl' : 'ltr');

    var titleEl = document.querySelector('title[data-i18n]');
    if (titleEl) document.title = t(titleEl.getAttribute('data-i18n'), varsFor(titleEl));
  }

  // ── Sprachumschalter ───────────────────────────────────────────────
  /**
   * Eigenes Stylesheet, damit das Modul ohne Eingriff in die 27
   * seiteneigenen <style>-Blöcke auskommt. Farben kommen aus den
   * bestehenden CSS-Variablen, mit Rückfallwerten.
   */
  function injectStyles() {
    if (document.getElementById('cm-i18n-style')) return;
    var css =
      '.cm-lang-switch{display:inline-flex;gap:6px;align-items:center}' +
      '.cm-lang-btn{font:inherit;font-size:12px;font-weight:700;letter-spacing:.5px;' +
      'padding:6px 12px;border-radius:20px;cursor:pointer;' +
      'background:transparent;color:var(--muted,#888);' +
      'border:1px solid var(--border,#2a2a2a);transition:all .2s}' +
      '.cm-lang-btn:hover{color:var(--accent,#D4A853);border-color:var(--accent,#D4A853)}' +
      '.cm-lang-btn.is-active{color:var(--accent,#D4A853);border-color:var(--accent,#D4A853)}' +
      '.cm-lang-btn:focus-visible{outline:2px solid var(--accent,#D4A853);outline-offset:2px}';
    var style = document.createElement('style');
    style.id = 'cm-i18n-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function mountSwitcher(el) {
    if (!el) return;
    injectStyles();
    el.innerHTML = '';
    var nav = document.createElement('div');
    nav.className = 'cm-lang-switch';
    nav.setAttribute('role', 'group');
    nav.setAttribute('aria-label', t('switcher.label'));

    LOCALES.forEach(function (loc) {
      var meta = LOCALE_META[loc];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cm-lang-btn' + (loc === currentLocale ? ' is-active' : '');
      btn.lang = loc;
      btn.textContent = meta.flag + ' ' + loc.toUpperCase();
      btn.setAttribute('aria-label', meta.label);
      btn.setAttribute('aria-pressed', loc === currentLocale ? 'true' : 'false');
      btn.addEventListener('click', function () { setLocale(loc); });
      nav.appendChild(btn);
    });

    el.appendChild(nav);
  }

  function mountAllSwitchers() {
    document.querySelectorAll('[data-i18n-switcher]').forEach(mountSwitcher);
  }

  // ── hreflang ───────────────────────────────────────────────────────
  /**
   * Setzt/aktualisiert <link rel="alternate" hreflang>. Da die Seite die
   * Sprache clientseitig wechselt, zeigen die Alternates auf ?lang=xx —
   * die einzige URL-Form, unter der die jeweilige Sprache reproduzierbar
   * ausgeliefert wird.
   */
  function syncHreflang() {
    // Statisch gepflegte Alternates haben Vorrang — sie sind auch ohne
    // JavaScript für Crawler sichtbar und dürfen nicht überschrieben werden.
    if (document.querySelector('link[rel="alternate"][hreflang]:not([data-i18n-generated])')) return;

    var canonical = document.querySelector('link[rel="canonical"]');
    var base = canonical ? canonical.href : location.origin + location.pathname;
    base = base.split('?')[0].split('#')[0];

    document.querySelectorAll('link[rel="alternate"][data-i18n-generated]')
      .forEach(function (n) { n.parentNode.removeChild(n); });

    LOCALES.concat(['x-default']).forEach(function (loc) {
      var link = document.createElement('link');
      link.rel = 'alternate';
      link.hreflang = loc === 'x-default' ? 'x-default' : loc;
      link.href = (loc === 'de' || loc === 'x-default') ? base : base + '?lang=' + loc;
      link.setAttribute('data-i18n-generated', '');
      document.head.appendChild(link);
    });
  }

  // ── Laden & Initialisierung ────────────────────────────────────────
  function loadCatalog(locale) {
    if (catalogs[locale]) return Promise.resolve(catalogs[locale]);
    return fetch(BASE + '/' + locale + '.json', { credentials: 'omit' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (json) { catalogs[locale] = json; return json; })
      .catch(function (err) {
        if (global.console && console.warn) {
          console.warn('[i18n] Katalog "' + locale + '" nicht ladbar:', err.message);
        }
        catalogs[locale] = {};
        return catalogs[locale];
      });
  }

  /**
   * Elemente mit .cm-de-only sind Hinweise für Nicht-Deutschsprachige
   * (z. B. "Artikel liegt nur auf Deutsch vor") und bleiben in de verborgen.
   */
  function toggleGermanOnlyNotices() {
    document.querySelectorAll('.cm-de-only').forEach(function (el) {
      el.hidden = currentLocale === DEFAULT_LOCALE;
    });
  }

  function render() {
    applyDocumentMeta();
    applyTo(document);
    toggleGermanOnlyNotices();
    mountAllSwitchers();
    syncHreflang();
    document.dispatchEvent(new CustomEvent('chairmatch:i18n', { detail: { locale: currentLocale } }));
  }

  function setLocale(locale) {
    if (!isLocale(locale) || locale === currentLocale) return Promise.resolve(currentLocale);
    currentLocale = locale;
    writeCookie(COOKIE, locale);
    storageSet(STORAGE_KEY, locale);

    // URL mitziehen, damit Teilen/Reload die Sprache behält.
    try {
      var url = new URL(location.href);
      if (locale === DEFAULT_LOCALE) url.searchParams.delete('lang');
      else url.searchParams.set('lang', locale);
      history.replaceState(null, '', url.toString());
    } catch (e) { /* ohne History-API einfach ohne URL-Update */ }

    var needed = locale === DEFAULT_LOCALE ? [locale] : [locale, DEFAULT_LOCALE];
    return Promise.all(needed.map(loadCatalog)).then(function () {
      render();
      return currentLocale;
    });
  }

  /**
   * Vermeidet, dass für Nicht-Deutsch kurz die deutsche Quellfassung
   * aufblitzt. Die Sperre löst sich immer — auch wenn das Laden hängt.
   */
  function cloak() {
    var html = document.documentElement;
    var previous = html.style.visibility;
    html.style.visibility = 'hidden';
    var done = false;
    var uncloak = function () {
      if (done) return;
      done = true;
      html.style.visibility = previous || '';
    };
    setTimeout(uncloak, 400);
    return uncloak;
  }

  function init() {
    currentLocale = resolveLocale();
    // Auswahl festschreiben, damit Folgeseiten ohne ?lang= gleich rendern.
    if (currentLocale !== DEFAULT_LOCALE) {
      writeCookie(COOKIE, currentLocale);
      storageSet(STORAGE_KEY, currentLocale);
    }

    var uncloak = currentLocale === DEFAULT_LOCALE ? function () {} : cloak();
    var needed = currentLocale === DEFAULT_LOCALE
      ? [DEFAULT_LOCALE]
      : [currentLocale, DEFAULT_LOCALE];

    Promise.all(needed.map(loadCatalog)).then(function () {
      render();
      uncloak();
    }).catch(function () { uncloak(); });
  }

  global.ChairMatchI18n = {
    t: t,
    apply: applyTo,
    getLocale: function () { return currentLocale; },
    setLocale: setLocale,
    locales: LOCALES.slice(),
    defaultLocale: DEFAULT_LOCALE,
    meta: LOCALE_META,
    mountSwitcher: mountSwitcher,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    formatNumber: formatNumber,
    formatCurrency: formatCurrency,
    formatPriceRange: formatPriceRange,
    timeZone: TIMEZONE
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
