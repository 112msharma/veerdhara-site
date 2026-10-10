/*
 * Festive menus: shows the right events automatically, based on today's date.
 *
 * HOW IT WORKS
 *  - Each event below has a date rule (fixed date, or worked out from Easter etc.).
 *  - An event appears 60 days before its date (unless it has its own "from") and
 *    disappears after the event date (unless it has its own "until").
 *  - Its menu is the PDF  menus/festive/<slug>-<year>.pdf
 *    e.g. menus/festive/valentines-day-2027.pdf
 *  - If that PDF has not been uploaded yet, the event stays hidden. So to publish
 *    a menu you only add the PDF; to retire one you do nothing.
 *  - If nothing is active, the whole Festive section and its nav link disappear.
 *
 * PREVIEW:  add ?festivedate=2026-12-20 to the page address to pretend it is that day
 *           (this skips the PDF check so you can see the cards).
 */
(function (root) {
  var DAY = 86400000;
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function d(y, m, day) { return new Date(y, m - 1, day); }
  function addDays(date, n) { return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n); }

  // Easter Sunday (Gregorian calendar)
  function easter(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, dd = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
      h = (19 * a + b - dd - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return d(y, month, day);
  }

  // nth Sunday of a month (1-based)
  function nthSunday(y, m, n) {
    var first = d(y, m, 1);
    return d(y, m, 1 + ((7 - first.getDay()) % 7) + (n - 1) * 7);
  }

  /* ---- THE EVENT LIST: edit here to add or change events ---- */
  var EVENTS = [
    {
      slug: 'christmas-party', title: 'Christmas Party Menu',
      blurb: 'Celebrate the festive season with friends, family or colleagues over a special Christmas menu.',
      date: function (y) { return d(y, 12, 24); },
      from: function (y) { return d(y, 10, 1); },   // listed from 1 Oct; the menu itself runs 1 Nov - 30 Dec
      until: function (y) { return d(y, 12, 30); },
      label: function () { return 'November & December'; }
    },
    {
      slug: 'christmas-day', title: 'Christmas Day',
      blurb: 'Spend Christmas Day with us — a festive feast with an Indian twist.',
      date: function (y) { return d(y, 12, 25); },
      from: function (y) { return d(y, 10, 1); }
    },
    {
      slug: 'new-years-eve', title: "New Year's Eve",
      blurb: 'See in the New Year in style with our special celebration menu.',
      date: function (y) { return d(y, 12, 31); },
      from: function (y) { return d(y, 10, 1); }
    },
    {
      slug: 'valentines-day', title: "Valentine's Day",
      blurb: 'Share a romantic evening with a specially created Valentine’s menu.',
      date: function (y) { return d(y, 2, 14); }
    },
    {
      slug: 'mothers-day', title: "Mother's Day",
      blurb: 'Give your mum a day to remember — treat her to a meal she will never forget.',
      date: function (y) { return addDays(easter(y), -21); }   // Mothering Sunday (UK)
    },
    {
      slug: 'easter', title: 'Easter Buffet',
      blurb: 'Easter at an Indian restaurant? We’ve included Egg Curry on our Buffet to mark the occasion.',
      date: function (y) { return easter(y); }
    },
    {
      slug: 'fathers-day', title: "Father's Day",
      blurb: 'Dads are hard to buy for, but with our Father’s Day Buffet, you’re sure to impress him.',
      date: function (y) { return nthSunday(y, 6, 3); }
    }
  ];
  var LEAD_DAYS = 60;

  function startOfDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }

  function formatDate(date) {
    return DAYS[date.getDay()] + ' ' + date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
  }

  function menuUrl(ev, year) { return 'menus/festive/' + ev.slug + '-' + year + '.pdf'; }

  // Events whose window includes "today", soonest first
  function activeEvents(today) {
    today = startOfDay(today);
    var out = [], y = today.getFullYear();
    [y, y + 1].forEach(function (year) {
      EVENTS.forEach(function (ev) {
        var date = ev.date(year),
          from = ev.from ? ev.from(year) : addDays(date, -LEAD_DAYS),
          until = ev.until ? ev.until(year) : date;
        if (today >= from && today <= until) {
          out.push({
            slug: ev.slug, title: ev.title, blurb: ev.blurb, year: year, date: date,
            label: ev.label ? ev.label(date) : formatDate(date), url: menuUrl(ev, year)
          });
        }
      });
    });
    return out.sort(function (a, b) { return a.date - b.date; });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { activeEvents: activeEvents, easter: easter, nthSunday: nthSunday, EVENTS: EVENTS };
    return;
  }

  /* ---- browser only ---- */
  function menuExists(url) {
    return fetch(url, { method: 'HEAD' }).then(function (r) {
      return r.ok && !/text\/html/i.test(r.headers.get('content-type') || '');
    }).catch(function () { return true; });   // can't tell (e.g. opened as a local file): show it
  }

  function render(grid, items, preview) {
    items.forEach(function (it) {
      var card = document.createElement('div');
      card.className = 'ev';
      var dt = document.createElement('div'); dt.className = 'ev-date'; dt.textContent = it.label;
      var h = document.createElement('h3'); h.textContent = it.title;
      var p = document.createElement('p'); p.textContent = it.blurb;
      var a = document.createElement('a'); a.className = 'ev-cta'; a.textContent = 'View Menu';
      a.href = preview ? '#festive' : it.url;
      if (!preview) { a.target = '_blank'; a.rel = 'noopener'; }
      card.appendChild(dt); card.appendChild(h); card.appendChild(p); card.appendChild(a);
      grid.appendChild(card);
    });
  }

  function init() {
    var section = document.getElementById('festive');
    if (!section) return;
    var grid = section.querySelector('.events-grid'),
      navItems = document.querySelectorAll('[data-festive]'),
      m = /[?&]festivedate=(\d{4})-(\d{2})-(\d{2})/.exec(location.search),
      preview = !!m,
      today = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(),
      items = activeEvents(today);

    Promise.all(items.map(function (it) { return preview ? true : menuExists(it.url); })).then(function (ok) {
      var shown = items.filter(function (_, i) { return ok[i]; });
      if (!shown.length) { section.remove(); navItems.forEach(function (n) { n.remove(); }); return; }
      render(grid, shown, preview);
      section.hidden = false;
      navItems.forEach(function (n) { n.hidden = false; });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(this);
