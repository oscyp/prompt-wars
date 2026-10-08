/* Prompt Wars — public landing page interactions. */
(function () {
  'use strict';

  // Set each URL only when its public store listing is live. An empty URL keeps
  // the Coming soon label and offers an email notification instead.
  var storeUrls = { iOS: '', Android: '' };
  var dialog = document.getElementById('waitlist-dialog');
  var form = document.getElementById('waitlist');
  var note = document.getElementById('form-note');
  var input = document.getElementById('email');
  var submit = form.querySelector('button[type="submit"]');
  var defaultNote = note.textContent;
  var pending = false;

  document.querySelectorAll('[data-platform]').forEach(function (link) {
    var platform = link.dataset.platform;
    var store = platform === 'iOS' ? 'App Store' : 'Google Play';
    var url = storeUrls[platform];
    if (url) {
      link.href = url;
      link.removeAttribute('aria-haspopup');
      link.setAttribute('aria-label', 'Play on ' + platform + ' — ' + store);
      link.querySelector('small').textContent =
        'PLAY ON ' + platform.toUpperCase();
      return;
    }
    link.addEventListener('click', function (event) {
      event.preventDefault();
      document.getElementById('waitlist-title').textContent =
        'Coming soon on ' + platform;
      document.getElementById('waitlist-message').textContent =
        'Prompt Wars is coming to ' +
        store +
        '. Leave your email and we’ll let you know when it launches.';
      dialog.showModal();
      input.focus();
    });
  });

  document
    .getElementById('close-dialog')
    .addEventListener('click', function () {
      dialog.close();
    });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (pending) return;
    var email = input.value.trim();
    note.classList.remove('success', 'error');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      note.textContent = 'Please enter a valid email address.';
      note.classList.add('error');
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }

    input.removeAttribute('aria-invalid');
    pending = true;
    submit.disabled = true;
    var buttonMarkup = submit.innerHTML;
    submit.textContent = 'Joining…';
    note.textContent = 'One moment…';
    var controller = new AbortController();
    var timeout = setTimeout(function () {
      controller.abort();
    }, 15000);

    try {
      var response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email }),
        signal: controller.signal,
      });
      var data = await response.json().catch(function () {
        return null;
      });
      if (!response.ok || !data || data.ok !== true) {
        throw new Error(
          (data && typeof data.error === 'string' && data.error) ||
            'Could not subscribe right now. Please try again.',
        );
      }
      note.textContent =
        'You’re on the list! We’ll email you when Prompt Wars launches.';
      note.classList.add('success');
      form.reset();
    } catch (error) {
      note.textContent =
        error.name === 'AbortError'
          ? 'The request took too long. Please try again.'
          : error instanceof TypeError
            ? 'Could not connect. Check your connection and try again.'
            : error.message ||
              'Could not subscribe right now. Please try again.';
      note.classList.add('error');
    } finally {
      clearTimeout(timeout);
      pending = false;
      submit.disabled = false;
      submit.innerHTML = buttonMarkup;
    }
  });

  input.addEventListener('input', function () {
    input.removeAttribute('aria-invalid');
    if (
      !pending &&
      (note.classList.contains('error') || note.classList.contains('success'))
    ) {
      note.classList.remove('success', 'error');
      note.textContent = defaultNote;
    }
  });

  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
