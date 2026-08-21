/*!
 * ChairMatch — gemeinsames Lead-Formular für die statische Landing-Site.
 *
 * Ersetzt die zuvor in jeder Seite duplizierte submitLead()-Kopie und
 * ergänzt zwei Dinge, die dort fehlten:
 *   1. Fehlerbehandlung — vorher wurde auch bei fehlgeschlagenem POST
 *      "Danke!" angezeigt und der Lead war still verloren.
 *   2. Übersetzbare Zustände über ChairMatchI18n.
 *
 * Einbinden nach i18n.js:
 *   <script src="/js/supabase-config.js"></script>
 *   <script src="/js/lead-form.js" defer></script>
 */
(function (global) {
  'use strict';

  function t(key, vars) {
    if (global.ChairMatchI18n) return global.ChairMatchI18n.t(key, vars);
    return null; // i18n noch nicht da -> vorhandenes Markup unverändert lassen
  }

  /** Stadt: eigenes Feld (Startseite) oder Seitenkontext (Stadtseiten). */
  function cityOf(form) {
    var field = form.querySelector('[name="city"]');
    if (field && field.value.trim()) return field.value.trim();
    return document.body.getAttribute('data-cm-city') || '';
  }

  function box(form, cls) {
    return form.parentElement.querySelector('.' + cls);
  }

  function showError(form, messageKey) {
    var el = box(form, 'form-error');
    if (!el) {                                   // Fallback ohne Fehler-Markup
      global.alert(t(messageKey) || 'Fehler beim Senden.');
      return;
    }
    var title = el.querySelector('[data-error-title]');
    var text = el.querySelector('[data-error-text]');
    if (title) title.textContent = t('form.error.title') || title.textContent;
    if (text) text.textContent = t(messageKey) || text.textContent;
    el.style.display = 'block';
  }

  function hideError(form) {
    var el = box(form, 'form-error');
    if (el) el.style.display = 'none';
  }

  function resetButton(btn, label) {
    btn.disabled = false;
    btn.textContent = label;
  }

  function submitLead(e, source, service) {
    e.preventDefault();
    var form = e.target;
    var btn = form.querySelector('button[type="submit"]');
    var originalLabel = btn.textContent;
    var data = new FormData(form);

    hideError(form);

    var name = (data.get('name') || '').trim();
    var phone = (data.get('phone') || '').trim();
    if (!name || !phone) {
      showError(form, 'form.error.required');
      return;
    }

    if (!global.__SUPABASE_URL || !global.__SUPABASE_ANON_KEY) {
      // supabase-config.js wird beim Deploy generiert; fehlt sie, wäre der
      // Lead sonst still verloren.
      showError(form, 'form.error.config');
      return;
    }

    btn.disabled = true;
    btn.textContent = t('form.sending') || 'Wird gesendet...';

    var params = new URLSearchParams(global.location.search);
    var utmSource = params.get('utm_source') || params.get('source') || '';
    var branch = data.get('branch');
    var message = data.get('message');

    fetch(global.__SUPABASE_URL + '/rest/v1/lead_inquiries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': global.__SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + global.__SUPABASE_ANON_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        name: name,
        phone: phone,
        plz: cityOf(form),
        service: branch ? service + ' (' + branch + ')' : service,
        message: message ? String(message).trim() : null,
        source: source,
        utm_source: utmSource || null
      })
    }).then(function (res) {
      if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { status: res.status });
      form.style.display = 'none';
      var ok = box(form, 'form-success');
      if (ok) ok.style.display = 'block';
    }).catch(function (err) {
      console.error('[lead-form] Senden fehlgeschlagen:', err);
      resetButton(btn, originalLabel);
      showError(form, err.status ? 'form.error.server' : 'form.error.network');
    });
  }

  global.submitLead = submitLead;
})(window);
