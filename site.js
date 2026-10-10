// Shared behaviour for every page. Each block checks that its elements exist.
const $ = id => document.getElementById(id);

// Footer year
const yr = $('yr'); if (yr) yr.textContent = new Date().getFullYear();

// Nav scroll
const nav = $('nav');
if (nav) window.addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 60), { passive: true });

// Hero image crossfade
const heroImgs = document.querySelectorAll('.hero-img');
if (heroImgs.length > 1) {
  let hi = 0;
  setInterval(() => {
    heroImgs[hi].classList.remove('active');
    hi = (hi + 1) % heroImgs.length;
    heroImgs[hi].classList.add('active');
  }, 5000);
}

// Mobile drawer
const burger = $('burger'), drawer = $('drawer'), ov = $('ov'), dc = $('dc');
function cd() { drawer.classList.remove('open'); ov.classList.remove('open'); }
if (burger) {
  burger.onclick = () => { drawer.classList.add('open'); ov.classList.add('open'); };
  dc.onclick = cd; ov.onclick = cd;
  drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', cd));
}

// Scroll reveal
const obs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }), { threshold: .1, rootMargin: '0px 0px -30px 0px' });
document.querySelectorAll('.reveal').forEach(el => obs.observe(el));

// Slideshow
const slides = document.querySelectorAll('.slide'), snav = $('snav');
if (slides.length && snav) {
  let cur = 0, tmr;
  slides.forEach((_, i) => { const d = document.createElement('button'); d.className = 'sdot' + (i === 0 ? ' active' : ''); d.setAttribute('aria-label', 'Slide ' + (i + 1)); d.onclick = () => go(i); snav.appendChild(d); });
  function go(n) { slides[cur].classList.remove('active'); snav.children[cur].classList.remove('active'); cur = (n + slides.length) % slides.length; slides[cur].classList.add('active'); snav.children[cur].classList.add('active'); clearInterval(tmr); tmr = setInterval(() => go(cur + 1), 5000); }
  tmr = setInterval(() => go(cur + 1), 5000);
}

// Gallery lightbox
const lb = $('lb');
if (lb) {
  const gis = document.querySelectorAll('.gi'), lbImg = $('lbImg'), lbC = $('lbC');
  const srcs = Array.from(document.querySelectorAll('.gi img')).map(i => i.src);
  let li = 0;
  gis.forEach((g, i) => g.addEventListener('click', () => { li = i; lbImg.src = srcs[i]; lbC.textContent = (i + 1) + ' / ' + srcs.length; lb.classList.add('open'); }));
  $('lbX').onclick = () => lb.classList.remove('open');
  $('lbP').onclick = () => { li = (li - 1 + srcs.length) % srcs.length; lbImg.src = srcs[li]; lbC.textContent = (li + 1) + ' / ' + srcs.length; };
  $('lbN').onclick = () => { li = (li + 1) % srcs.length; lbImg.src = srcs[li]; lbC.textContent = (li + 1) + ' / ' + srcs.length; };
  lb.addEventListener('click', e => { if (e.target === lb) lb.classList.remove('open'); });
  document.addEventListener('keydown', e => { if (!lb.classList.contains('open')) return; if (e.key === 'Escape') lb.classList.remove('open'); if (e.key === 'ArrowLeft') $('lbP').click(); if (e.key === 'ArrowRight') $('lbN').click(); });

  // Swipe left/right in the lightbox
  let tx = 0, ty = 0;
  lb.addEventListener('touchstart', e => { tx = e.changedTouches[0].clientX; ty = e.changedTouches[0].clientY; }, { passive: true });
  lb.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty; if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) $(dx < 0 ? 'lbN' : 'lbP').click(); }, { passive: true });
}

// Touch support for menu tiles on mobile
document.querySelectorAll('.menu-tile').forEach(tile => {
  tile.addEventListener('touchstart', () => tile.classList.add('touched'), { passive: true });
  tile.addEventListener('touchend', () => setTimeout(() => tile.classList.remove('touched'), 600), { passive: true });
});

// Booking modal
const bk = $('bk'), bkFrame = $('bkFrame');
function openBk(url) { const target = url || bkFrame.dataset.src; if (bkFrame.getAttribute('src') !== target) bkFrame.src = target; bk.classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeBk() { bk.classList.remove('open'); document.body.style.overflow = ''; }
document.addEventListener('click', e => {
  const b = e.target.closest('[data-book]'); if (!b) return;
  e.preventDefault(); if (drawer) cd(); pick.classList.remove('open');
  if (b.dataset.bookDate) openPicker(b.dataset.bookDate, b.dataset.bookLabel || ''); else openBk();
});

// "Pick a time" step for dated bookings (festive menus): we read live availability from
// ResDiary, then open their booking form already set to the chosen date, time and party size.
const RD = { api: 'https://booking.resdiary.com/api/Restaurant/VeerDhara', widget: 'https://booking.resdiary.com/widget/Standard/VeerDhara/8554', channel: 'ONLINE' };
const pick = document.createElement('div');
pick.className = 'modal'; pick.id = 'pick-modal'; pick.setAttribute('role', 'dialog'); pick.setAttribute('aria-modal', 'true'); pick.setAttribute('aria-labelledby', 'pk-title');
pick.innerHTML = '<div class="modal-box pk-box"><button type="button" class="modal-x" aria-label="Close" data-close>&times;</button>' +
  '<div class="sec-label" style="justify-content:center">Book a Table</div><h3 id="pk-title"></h3>' +
  '<label class="pk-label" for="pk-covers">Number of guests</label><select id="pk-covers" class="pk-select"></select>' +
  '<div class="pk-times" id="pk-times" aria-live="polite"></div><p class="pk-note" id="pk-note"></p>' +
  '<a class="pk-alt" href="' + RD.widget + '" data-book>See all dates and times</a></div>';
document.body.appendChild(pick);
const pkCovers = $('pk-covers'), pkTimes = $('pk-times'), pkNote = $('pk-note');
for (let i = 1; i <= 10; i++) pkCovers.add(new Option(i + (i === 1 ? ' guest' : ' guests'), i, false, i === 2));
let pkDate = '', pkReq = 0;
function openPicker(date, label) { pkDate = date; $('pk-title').textContent = label; pick.classList.add('open'); loadSlots(); }
function loadSlots() {
  const req = ++pkReq;
  pkTimes.textContent = ''; pkNote.textContent = 'Checking availability…';
  fetch(RD.api + '/AvailabilitySearch?date=' + pkDate + '&covers=' + pkCovers.value + '&channelCode=' + RD.channel + '&areaId=0&availabilityType=0')
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(data => {
      if (req !== pkReq) return;
      const slots = (data.TimeSlots || []).filter(t => t.HasStandardAvailability || (t.AvailablePromotions || []).length);
      pkTimes.textContent = '';
      if (!slots.length) { pkNote.innerHTML = 'No online tables are available for ' + pkCovers.value + ' on this date. Try a different number of guests, or call us on <a href="tel:+441727226226">01727 226226</a>.'; return; }
      pkNote.textContent = pkCovers.value > 8 ? 'For larger groups, please call 01727 226226 to confirm.' : 'Choose a time to continue.';
      slots.forEach(t => {
        const hm = t.TimeSlot.slice(11, 16), btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'pk-time'; btn.textContent = hm;
        btn.onclick = () => { pick.classList.remove('open'); openBk(RD.widget + '?channelCode=' + RD.channel + '&date=' + pkDate + '&time=' + hm + '&partySize=' + pkCovers.value); };
        pkTimes.appendChild(btn);
      });
    })
    .catch(() => { if (req === pkReq) { pkTimes.textContent = ''; pkNote.innerHTML = 'We couldn\u2019t load times just now. Use the link below, or call <a href="tel:+441727226226">01727 226226</a>.'; } });
}
pkCovers.addEventListener('change', loadSlots);
pick.addEventListener('click', e => { if (e.target === pick || e.target.hasAttribute('data-close')) pick.classList.remove('open'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') pick.classList.remove('open'); });
$('bkX').onclick = closeBk;
bk.addEventListener('click', e => { if (e.target === bk) closeBk(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && bk.classList.contains('open')) closeBk(); });

// Enquiry popup (catering)
const enq = $('enquire-modal');
if (enq) {
  document.querySelectorAll('[data-enquire]').forEach(b => b.addEventListener('click', () => enq.classList.add('open')));
  enq.addEventListener('click', e => { if (e.target === enq || e.target.hasAttribute('data-close')) enq.classList.remove('open'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') enq.classList.remove('open'); });
}

// Dialog focus management: move focus in on open, trap Tab, restore on close
(function () {
  const dialogs = [bk, pick, enq, lb].filter(Boolean), FOCUSABLE = 'a[href],button:not([disabled]),iframe,[tabindex]:not([tabindex="-1"])';
  let last = null;
  const openOne = () => dialogs.find(d => d.classList.contains('open'));
  dialogs.forEach(d => {
    if (!d.hasAttribute('aria-modal')) d.setAttribute('aria-modal', 'true');
    let was = false;
    new MutationObserver(() => {
      const is = d.classList.contains('open');
      if (is && !was) { last = document.activeElement; const f = d.querySelector(FOCUSABLE); if (f) f.focus(); }
      if (!is && was && last && document.body.contains(last)) { last.focus(); last = null; }
      was = is;
    }).observe(d, { attributes: true, attributeFilter: ['class'] });
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const d = openOne(); if (!d) return;
    const f = d.querySelectorAll(FOCUSABLE); if (!f.length) return;
    const first = f[0], end = f[f.length - 1];
    if (!d.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); }
    else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
  });
})();
