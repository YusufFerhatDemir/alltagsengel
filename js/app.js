/* ══════════════════════════════════════════════
   ALLTAGSENGEL — App Logic (Clean)
   ══════════════════════════════════════════════ */

// ─── Screen Sets ───
const kundeScreens = new Set(['khome', 'eprofil', 'bform', 'bwarten', 'bbestaetigt']);
let currentScreen = 'splash';
let waitTimer = null;

// ─── Navigation ───
function go(id) {
  if (waitTimer) { clearTimeout(waitTimer); waitTimer = null; }

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));

  const target = document.getElementById(id);
  if (target) {
    target.classList.add('on');
    target.style.animation = 'none';
    target.offsetHeight;
    target.style.animation = '';
  }

  // Kunde bottom nav visibility
  const bnavK = document.getElementById('bnav-k');
  if (bnavK) bnavK.style.display = kundeScreens.has(id) && id === 'khome' ? 'flex' : 'none';

  // Warten screen auto-progress
  if (id === 'bwarten') startWaiting();

  currentScreen = id;
}

// ─── Wartebildschirm ───
function startWaiting() {
  const btn = document.getElementById('wdoneBtn');
  if (btn) btn.style.display = 'none';

  waitTimer = setTimeout(() => {
    const title = document.querySelector('#bwarten .wait-title');
    const sub = document.querySelector('#bwarten .wait-sub');
    if (title) title.textContent = 'Buchung bestätigt!';
    if (sub) sub.textContent = 'Anna Müller hat Ihre Anfrage angenommen. Sie können jetzt die Details einsehen.';
    if (btn) {
      btn.style.display = 'block';
      btn.style.animation = 'screenIn .28s cubic-bezier(.4,0,.2,1) both';
    }
  }, 4000);
}

// ─── Zahlungsart ───
function selectPay(el) {
  el.parentElement.querySelectorAll('.pay-opt').forEach(p => p.classList.remove('on'));
  el.classList.add('on');
  const kkpanel = document.getElementById('kkpanel');
  const pay = el.dataset.pay;
  if (kkpanel) kkpanel.classList.toggle('show', pay === 'kasse' || pay === 'kombi');
}

// ─── Krankenkasse Typ ───
function selectKKT(el) {
  el.parentElement.querySelectorAll('.kk-type').forEach(k => k.classList.remove('on'));
  el.classList.add('on');
}

// ─── Krankenkasse wählen ───
function selectKK(el) {
  const grid = el.closest('.kk-grid') || el.parentElement;
  grid.querySelectorAll('.kk-item').forEach(k => k.classList.remove('on'));
  el.classList.add('on');
}

// ─── Kategorie-Auswahl (Event Delegation) ───
document.addEventListener('click', function(e) {
  const cat = e.target.closest('.cat-item');
  if (cat) {
    cat.parentElement.querySelectorAll('.cat-item').forEach(c => c.classList.remove('on'));
    cat.classList.add('on');
  }
});

// ─── Generic Toggle (Tags, Tage, Switches) ───
function toggleEl(el) {
  el.classList.toggle('on');
}

// ─── Online/Offline Toggle ───
function toggleOnline() {
  const dot = document.getElementById('onlineDot');
  const label = document.getElementById('onlineLabel');
  if (!dot || !label) return;
  const isOn = !dot.classList.contains('off');
  dot.classList.toggle('off', isOn);
  label.textContent = isOn ? 'Offline' : 'Online';
}

// ─── Uhr ───
function updateClock() {
  const clk = document.getElementById('clk');
  if (!clk) return;
  const now = new Date();
  clk.textContent = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
}
updateClock();
setInterval(updateClock, 30000);

// ─── Init ───
document.addEventListener('DOMContentLoaded', function() {
  const bnavK = document.getElementById('bnav-k');
  if (bnavK) bnavK.style.display = 'none';
});
