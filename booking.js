/*
 * Built-in booking form. Replaces the ResDiary widget for every "Book" button.
 *
 * It talks to the same ResDiary service the widget uses, so menus/promotions, closed dates and
 * availability you set up in ResDiary carry over automatically:
 *   1. AvailabilitySearch  -> times (and the menus/options available at each time)
 *   2. CreateTableHold     -> holds the table for ~5 minutes
 *   3. UpdateTableHold     -> confirms it with the guest's details
 *
 * If anything fails (service change, payment required, network...), guests are offered a
 * phone call and the original ResDiary booking form, so a booking is never blocked.
 *
 * Buttons: any element with data-book. Optional data-book-date="YYYY-MM-DD" and
 * data-book-label="Christmas Day" pre-select the date and show the event name.
 */
(function () {
  var API = 'https://booking.resdiary.com/api/Restaurant/VeerDhara',
    WIDGET = 'https://booking.resdiary.com/widget/Standard/VeerDhara/8554',
    CHANNEL = 'ONLINE', PHONE = '01727 226226', TEL = 'tel:+441727226226';

  var state, setup = null, timer = null, openedAt = 0;

  /* ---------- helpers ---------- */
  function $(sel, root) { return (root || dlg).querySelector(sel); }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function pad(n) { return ('0' + n).slice(-2); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function longDate(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  function money(n) { return '£' + Number(n).toFixed(2); }
  function total() { return state.adults + state.children; }
  function widgetUrl() {
    return WIDGET + (state.date && state.time ? '?channelCode=' + CHANNEL + '&date=' + state.date + '&time=' + state.time.slice(0, 5) + '&partySize=' + total() : '');
  }
  function getJSON(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function postJSON(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(r.status); e.data = j; e.status = r.status; throw e; } return j; }); });
  }

  /* ---------- dialog shell ---------- */
  var dlg = document.createElement('div');
  dlg.className = 'modal'; dlg.id = 'book-modal';
  dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-labelledby', 'bkd-title');
  dlg.innerHTML = '<div class="modal-box bkd-box"><button type="button" class="modal-x" aria-label="Close" data-close>&times;</button>' +
    '<div class="sec-label bkd-label">Book a Table</div><h3 id="bkd-title">Reserve your table</h3><div id="bkd-body"></div>' +
    '<div class="bkd-call"><p>Can’t find your time? Call us and we’ll do our best to fit you in.</p>' +
    '<a class="btn-p" href="' + TEL + '">Call Now &middot; ' + PHONE + '</a></div></div>';
  document.body.appendChild(dlg);
  var body = dlg.querySelector('#bkd-body'), title = dlg.querySelector('#bkd-title');

  function close() { clearInterval(timer); dlg.classList.remove('open'); document.body.style.overflow = ''; }
  dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target.hasAttribute('data-close')) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dlg.classList.contains('open')) close(); });

  /* ---------- public entry ---------- */
  window.openBooking = function (opts) {
    opts = opts || {};
    var today = ymd(new Date());
    state = { adults: 2, children: 0, date: opts.date && opts.date >= today ? opts.date : '', label: opts.label || '', slots: [], promos: {}, time: '', promo: null, holdId: null, expiry: null, req: 0, cache: {} };
    title.textContent = state.label || 'Reserve your table';
    dlg.querySelector('.bkd-call').hidden = false;
    openedAt = Date.now();
    dlg.classList.add('open'); document.body.style.overflow = 'hidden';
    if (!setup) getJSON(API + '/Setup?date=' + (state.date || today) + '&channelCode=' + CHANNEL).then(function (s) { setup = s; }).catch(function () { setup = {}; });
    showWhen();
  };

  /* ---------- step 1: date, guests, times ---------- */
  function select(id, from, to, sel, label) {
    var h = '<select id="' + id + '" class="bkd-input">';
    for (var i = from; i <= to; i++) h += '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + label(i) + '</option>';
    return h + '</select>';
  }
  function showWhen() {
    clearInterval(timer);
    var max = (setup && setup.MaxOnlinePartySize) || 16, today = ymd(new Date());
    body.innerHTML =
      '<label class="bkd-lab" for="bkd-date">Date</label><input id="bkd-date" class="bkd-input" type="date" min="' + today + '" value="' + state.date + '">' +
      '<div class="bkd-row"><div><label class="bkd-lab" for="bkd-adults">Adults</label>' + select('bkd-adults', 1, max, state.adults, function (i) { return i; }) + '</div>' +
      '<div><label class="bkd-lab" for="bkd-kids">Children (under 10)</label>' + select('bkd-kids', 0, 10, state.children, function (i) { return i; }) + '</div></div>' +
      '<div id="bkd-times" class="pk-times" aria-live="polite"></div><p id="bkd-note" class="pk-note"></p>';
    $('#bkd-date').onclick = function () { try { this.showPicker(); } catch (e) {} };
    $('#bkd-date').onchange = function () { state.date = this.value; title.textContent = state.label && this.value === state.dateOrig ? state.label : 'Reserve your table'; loadSlots(); };
    $('#bkd-adults').onchange = function () { state.adults = +this.value; loadSlots(); };
    $('#bkd-kids').onchange = function () { state.children = +this.value; loadSlots(); };
    state.dateOrig = state.date;
    if (state.date) loadSlots();
    else $('#bkd-note').textContent = 'Choose a date to see available times.';
  }

  function renderSlots(data) {
    var times = $('#bkd-times'), note = $('#bkd-note');
    state.promos = {};
    (data.Promotions || []).forEach(function (p) { state.promos[p.Id] = p; });
    state.slots = (data.TimeSlots || []).filter(function (t) { return t.HasStandardAvailability || (t.AvailablePromotions || []).length; });
    times.textContent = ''; times.classList.remove('is-loading');
    if (!state.slots.length) { note.innerHTML = 'No online tables are available for ' + total() + (total() === 1 ? ' guest' : ' guests') + ' on this date. Try another date or number of guests, or call us on <a href="' + TEL + '">' + PHONE + '</a>.'; return; }
    note.textContent = 'Choose a time to continue.';
    state.slots.forEach(function (s) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'pk-time'; b.textContent = s.TimeSlot.slice(11, 16);
      b.onclick = function () { pickSlot(s); };
      times.appendChild(b);
    });
  }

  function loadSlots() {
    var times = $('#bkd-times'), note = $('#bkd-note'), req = ++state.req, key = state.date + '|' + total();
    if (!state.date) { times.textContent = ''; note.textContent = 'Choose a date to see available times.'; return; }
    if (total() > ((setup && setup.MaxOnlinePartySize) || 16)) { times.textContent = ''; note.innerHTML = 'For parties this large please call us on <a href="' + TEL + '">' + PHONE + '</a>.'; return; }
    if (state.cache[key]) return renderSlots(state.cache[key]);
    // keep the current times on screen (dimmed) until the new ones arrive, so nothing flickers
    if (times.children.length) times.classList.add('is-loading');
    note.textContent = 'Checking availability\u2026';
    getJSON(API + '/AvailabilitySearch?date=' + state.date + '&covers=' + total() + '&channelCode=' + CHANNEL + '&areaId=0&availabilityType=0').then(function (data) {
      state.cache[key] = data;
      if (req === state.req) renderSlots(data);
    }).catch(function () { if (req === state.req) failure('We couldn\u2019t load times just now.'); });
  }

  /* ---------- step 2: menu / option ---------- */
  function pickSlot(slot) {
    state.time = slot.TimeSlot.slice(11, 19);
    var opts = (slot.AvailablePromotions || []).map(function (a) {
      var p = state.promos[a.Id] || {};
      return { id: a.Id, name: p.Name || 'Menu', desc: p.Description || '', price: a.BasePrice != null ? a.BasePrice : p.FullPrice };
    });
    if (slot.HasStandardAvailability) opts.unshift({ id: null, name: 'Table only', desc: 'Choose from the menus on the day.', price: 0 });
    if (opts.length === 1 && opts[0].id === null) { state.promo = null; return hold(); }   // plain table, nothing to choose
    showOptions(opts);
  }
  function showOptions(opts) {
    body.innerHTML = '<p class="bkd-sum">' + esc(longDate(state.date)) + ' · ' + esc(state.time.slice(0, 5)) + ' · ' + total() + (total() === 1 ? ' guest' : ' guests') + '</p>' +
      '<p class="pk-note">' + (opts.length === 1 ? 'This time is for:' : 'Please choose an option for your booking.') + '</p><div class="bkd-opts"></div><button type="button" class="bkd-link" id="bkd-back">← Change time</button>';
    var list = $('.bkd-opts');
    opts.forEach(function (o) {
      var c = document.createElement('button'); c.type = 'button'; c.className = 'bkd-opt';
      c.innerHTML = '<span class="bkd-opt-name"></span><span class="bkd-opt-price"></span><span class="bkd-opt-desc"></span><span class="bkd-opt-cta">Select \u2192</span>';
      c.querySelector('.bkd-opt-name').textContent = o.name;
      c.querySelector('.bkd-opt-desc').textContent = o.desc;
      c.querySelector('.bkd-opt-price').textContent = o.price > 0 && o.desc.indexOf('£') < 0 ? money(o.price) : '';
      c.onclick = function () { state.promo = o.id; hold(); };
      list.appendChild(c);
    });
    $('#bkd-back').onclick = showWhen;
  }

  /* ---------- step 3: hold the table, then collect details ---------- */
  function hold() {
    body.innerHTML = '<p class="pk-note">Reserving your table…</p>';
    postJSON(API + '/CreateTableHold', {
      VisitDate: state.date, VisitTime: state.time, PartySize: total(), ChannelCode: CHANNEL, PromotionId: state.promo,
      AreaId: null, WidgetThemeId: null, OriginalMicrositeName: 'VeerDhara', MicrositeName: 'VeerDhara'
    }).then(function (r) {
      if (!r || !r.BookingId || !r.ExpiryTimestamp) throw new Error('no hold');
      state.holdId = r.BookingId; state.expiry = new Date(/Z|[+-]\d\d:?\d\d$/.test(r.ExpiryTimestamp) ? r.ExpiryTimestamp : r.ExpiryTimestamp + 'Z');
      showDetails();
    }).catch(function (e) {
      if (e && e.status === 429) return failure('We’re getting a lot of requests right now.');
      failure('We couldn’t reserve that table online.');
    });
  }

  function showDetails() {
    var mk = setup && setup.IsIndividualVenueMarketingEnabled;
    body.innerHTML = '<p class="bkd-sum">' + esc(longDate(state.date)) + ' · ' + esc(state.time.slice(0, 5)) + ' · ' + total() + (total() === 1 ? ' guest' : ' guests') + '</p>' +
      '<p class="bkd-hold" id="bkd-hold"></p>' +
      '<form id="bkd-form" novalidate>' +
      '<div class="bkd-row"><div><label class="bkd-lab" for="bkd-fn">First name *</label><input id="bkd-fn" class="bkd-input" autocomplete="given-name" required></div>' +
      '<div><label class="bkd-lab" for="bkd-ln">Last name *</label><input id="bkd-ln" class="bkd-input" autocomplete="family-name" required></div></div>' +
      '<label class="bkd-lab" for="bkd-em">Email *</label><input id="bkd-em" class="bkd-input" type="email" autocomplete="email" required>' +
      '<label class="bkd-lab" for="bkd-mo">Mobile number *</label><input id="bkd-mo" class="bkd-input" type="tel" autocomplete="tel" placeholder="07123 456789" required>' +
      '<label class="bkd-lab" for="bkd-sr">Special requests (optional)</label><textarea id="bkd-sr" class="bkd-input" rows="3" maxlength="500" placeholder="Allergies, celebrations, high chairs…"></textarea>' +
      '<input type="text" id="bkd-web" class="bkd-trap" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      (mk ? '<label class="bkd-check"><input type="checkbox" id="bkd-mk"> <span>Email me news and offers from Veer Dhara</span></label>' : '') +
      '<p class="bkd-priv">By booking you agree to our <button type="button" class="bkd-link" id="bkd-privbtn">privacy notice</button>.</p><div id="bkd-priv" class="bkd-privtext" hidden></div>' +
      '<p class="bkd-err" id="bkd-err" role="alert"></p>' +
      '<button type="submit" class="btn-p bkd-submit" id="bkd-go">Confirm Booking</button></form>' +
      '<button type="button" class="bkd-link" id="bkd-back">← Change time</button>';
    $('#bkd-back').onclick = showWhen;
    $('#bkd-privbtn').onclick = function () {
      var box = $('#bkd-priv');
      if (box.hidden && !box.textContent) {
        var t = (setup && setup.PrivacyPolicy) || '';
        box.textContent = new DOMParser().parseFromString(t.replace(/<br\s*\/?>/gi, '\n'), 'text/html').body.textContent.trim() || 'Your details are used only to manage your booking and, if you opt in, to send you news and offers.';
      }
      box.hidden = !box.hidden;
    };
    $('#bkd-form').onsubmit = submit;
    clearInterval(timer);
    function tick() {
      var s = Math.round((state.expiry - Date.now()) / 1000), h = $('#bkd-hold');
      if (!h) return clearInterval(timer);
      if (s <= 0) { clearInterval(timer); body.innerHTML = '<p class="pk-note">Your table hold has expired.</p><button type="button" class="btn-p" id="bkd-again">Choose a time again</button>'; $('#bkd-again').onclick = showWhen; return; }
      h.textContent = 'We’re holding your table for ' + Math.floor(s / 60) + ':' + pad(s % 60);
    }
    tick(); timer = setInterval(tick, 1000);
    $('#bkd-fn').focus();
  }

  function submit(e) {
    e.preventDefault();
    var fn = $('#bkd-fn').value.trim(), ln = $('#bkd-ln').value.trim(), em = $('#bkd-em').value.trim(),
      mo = $('#bkd-mo').value.replace(/[\s()-]/g, ''), err = $('#bkd-err'), btn = $('#bkd-go');
    if (!fn || !ln) return err.textContent = 'Please enter your first and last name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) return err.textContent = 'Please enter a valid email address.';
    if (!/^[+\d]{1}\d{6,14}$/.test(mo)) return err.textContent = 'Please enter a valid mobile number.';
    if ($('#bkd-web').value || Date.now() - openedAt < 4000) return err.textContent = 'Please check your details and try again.';
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Confirming…';
    var mk = !!($('#bkd-mk') && $('#bkd-mk').checked),
      notes = $('#bkd-sr').value.trim() + (state.children ? (($('#bkd-sr').value.trim() ? '\n\n' : '') + 'Children: ' + state.children) : '');
    postJSON(API + '/UpdateTableHold', {
      BookingId: state.holdId, WidgetThemeId: null, SpecialRequests: notes,
      RedirectUrl: 'https://booking.resdiary.com/GuestPay/Close', CancelUrl: 'https://booking.resdiary.com/GuestPay/Cancel',
      Customer: {
        Title: null, FirstName: fn, Surname: ln, Email: em, Mobile: mo, MobileCountryCode: '44', MobileAlpha2Code: 'GB',
        Phone: null, Company: null, Postcode: null, MembershipId: null, CustomField: null,
        ReceiveEmailMarketing: mk, ReceiveSmsMarketing: false, ReceiveRestaurantEmailMarketing: mk, ReceiveRestaurantSmsMarketing: false
      }
    }).then(function (r) {
      var st = r && r.Status;
      if (st === 'Success') return done(r, em);
      btn.disabled = false; btn.textContent = 'Confirm Booking';
      if (st === 'TableHoldExpired' || st === 'TableConflict') { body.innerHTML = '<p class="pk-note">Sorry, that table is no longer available. Please choose another time.</p><button type="button" class="btn-p" id="bkd-again">Choose a time</button>'; $('#bkd-again').onclick = showWhen; return; }
      failure(st === 'PaymentRequired' || st === 'CreditCardRequired' ? 'This booking needs a payment step, which our quick form can’t take.' : 'We couldn’t complete your booking online.');
    }).catch(function (x) {
      btn.disabled = false; btn.textContent = 'Confirm Booking';
      failure(x && x.status === 429 ? 'We’re getting a lot of requests right now.' : 'We couldn’t complete your booking online.');
    });
  }

  /* ---------- finish / fallback ---------- */
  function done(r, email) {
    clearInterval(timer);
    var b = (r && r.Booking) || {}, ref = b.Reference || b.BookingReference || b.Ref || '';
    title.textContent = 'You’re booked in';
    body.innerHTML = '<div class="bkd-done"><svg class="bkd-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6.5"/></svg><p class="bkd-sum"></p><p class="pk-note"></p></div>';
    dlg.querySelector('.bkd-call').hidden = true;
    $('.bkd-sum').textContent = longDate(state.date) + ' · ' + state.time.slice(0, 5) + ' · ' + total() + (total() === 1 ? ' guest' : ' guests');
    $('.bkd-done .pk-note').textContent = (ref ? 'Booking reference: ' + ref + '. ' : '') + 'A confirmation will be emailed to ' + email + '. Need to change anything? Call us on ' + PHONE + '.';
  }
  function failure(msg) {
    clearInterval(timer);
    body.innerHTML = '<p class="pk-note"></p><p class="pk-note">You can call us, or use our standard booking form.</p>' +
      '<a class="bkd-link" id="bkd-widget" href="' + esc(widgetUrl()) + '">Open the standard booking form</a>';
    body.querySelector('.pk-note').textContent = msg;
    $('#bkd-widget').onclick = function (e) { e.preventDefault(); close(); if (window.openWidgetBooking) window.openWidgetBooking(widgetUrl()); };
  }
})();
