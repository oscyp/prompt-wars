/* =========================================================
   Prompt Wars — Landing interactions
   Progressive enhancement only: the page is fully usable
   with JavaScript disabled.
   ========================================================= */
(function () {
  'use strict';

  /* ---- Mobile nav toggle ---- */
  var toggle = document.querySelector('.nav-toggle');
  var mobileNav = document.getElementById('mobile-nav');

  function closeNav() {
    if (!mobileNav) return;
    mobileNav.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
  }

  if (toggle && mobileNav) {
    toggle.addEventListener('click', function () {
      var open = mobileNav.hidden;
      mobileNav.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    mobileNav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeNav);
    });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeNav();
    });
  }

  /* ---- Scroll reveal ---- */
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    revealEls.forEach(function (el, i) {
      // gentle stagger for siblings
      el.style.transitionDelay = (Math.min(i % 4, 3) * 80) + 'ms';
      io.observe(el);
    });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---- FAQ: keep one open at a time ---- */
  var faqItems = document.querySelectorAll('.faq details');
  faqItems.forEach(function (item) {
    item.addEventListener('toggle', function () {
      if (item.open) {
        faqItems.forEach(function (other) {
          if (other !== item) other.open = false;
        });
      }
    });
  });

  /* ---- Waitlist (validation + Resend signup via /api/subscribe) ---- */
  var form = document.getElementById('waitlist');
  var note = document.getElementById('form-note');
  if (form && note) {
    var defaultNote = note.textContent;
    var submitBtn = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = document.getElementById('email');
      var value = (input.value || '').trim();
      var valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

      note.classList.remove('success', 'error');
      if (!valid) {
        note.textContent = 'Please enter a valid email address.';
        note.classList.add('error');
        input.focus();
        return;
      }

      var btnLabel = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Joining…'; }
      note.textContent = 'One moment…';

      fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value })
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            throw new Error((result.data && result.data.error) || 'Subscription failed.');
          }
          note.textContent = "You're on the list! We'll be in touch at launch. 🎉";
          note.classList.add('success');
          form.reset();
        })
        .catch(function (err) {
          note.textContent = err.message || 'Something went wrong. Please try again.';
          note.classList.add('error');
        })
        .then(function () {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = btnLabel; }
        });
    });

    form.addEventListener('input', function () {
      if (note.classList.contains('error')) {
        note.textContent = defaultNote;
        note.classList.remove('error');
      }
    });
  }

  /* ---- Current year ---- */
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
