/* Optional website analytics. Google is contacted only after acceptance. */
(function () {
  'use strict';

  var measurementId = 'G-Q17QEN6GLW';
  var storageKey = 'promptwars.analytics-consent.v1';
  var consent = readConsent();
  var started = false;
  var pageViewed = false;
  var lastSettingsButton = null;
  var disableKey = 'ga-disable-' + measurementId;
  window[disableKey] = consent !== 'accepted';

  function readConsent() {
    try {
      var saved = window.localStorage.getItem(storageKey);
      return saved === 'accepted' || saved === 'rejected' ? saved : null;
    } catch (error) {
      return null;
    }
  }

  function gtag() {
    window.dataLayer.push(arguments);
  }

  function consentSettings(analytics) {
    return {
      analytics_storage: analytics,
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    };
  }

  function referrerOrigin() {
    try {
      return document.referrer ? new URL(document.referrer).origin : '';
    } catch (error) {
      return '';
    }
  }

  function campaignParameters() {
    var parameters = new URLSearchParams(window.location.search);
    var fields = {
      utm_source: 'campaign_source',
      utm_medium: 'campaign_medium',
      utm_campaign: 'campaign_name',
      utm_id: 'campaign_id',
      utm_content: 'campaign_content',
      utm_term: 'campaign_term',
    };
    var campaign = {};
    Object.keys(fields).forEach(function (key) {
      var values = parameters.getAll(key);
      if (values.length !== 1) return;
      var value = values[0];
      // Campaign identifiers only: no emails, URLs, free text or phone numbers.
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value)) return;
      if (/^[0-9_-]{7,}$/.test(value)) return;
      campaign[fields[key]] = value;
    });
    return campaign;
  }

  function startAnalytics() {
    if (consent !== 'accepted' || !/^G-[A-Z0-9]+$/.test(measurementId)) return;
    window[disableKey] = false;
    if (!started) {
      started = true;
      window.dataLayer = window.dataLayer || [];
      gtag('consent', 'default', consentSettings('denied'));
      gtag('consent', 'update', consentSettings('granted'));
      gtag('js', new Date());
      var config = {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        page_location: window.location.origin + window.location.pathname,
        page_referrer: referrerOrigin(),
        cookie_expires: 60 * 60 * 24 * 180,
      };
      var campaign = campaignParameters();
      Object.keys(campaign).forEach(function (key) {
        config[key] = campaign[key];
      });
      gtag('config', measurementId, config);
      var script = document.createElement('script');
      script.id = 'google-analytics';
      script.async = true;
      script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
      document.head.appendChild(script);
    } else {
      gtag('consent', 'update', consentSettings('granted'));
    }
    if (!pageViewed) {
      pageViewed = true;
      gtag('event', 'page_view');
    }
  }

  function clearAnalyticsCookies() {
    document.cookie.split(';').forEach(function (cookie) {
      var name = cookie.split('=')[0].trim();
      if (!/^_ga(?:_|$)/.test(name)) return;
      var expired = name + '=; Max-Age=0; path=/; SameSite=Lax';
      document.cookie = expired;
      var parts = window.location.hostname.split('.');
      while (parts.length > 1) {
        document.cookie = expired + '; domain=' + parts.join('.');
        parts.shift();
      }
    });
  }

  function stopAnalytics() {
    // Google's opt-out flag also blocks events from its already-loaded library.
    window[disableKey] = true;
    if (started) gtag('consent', 'update', consentSettings('denied'));
    clearAnalyticsCookies();
  }

  var panel = document.createElement('section');
  panel.className = 'analytics-consent';
  panel.setAttribute('aria-label', 'Analytics preferences');
  panel.hidden = true;
  panel.innerHTML =
    '<div class="analytics-consent-copy"><h2>Optional analytics</h2>' +
    '<p>Allow Google Analytics to measure visits and store-button clicks? ' +
    'You can use the site without it and change your choice in the footer. ' +
    '<a href="/privacy-policy#cookies">Privacy details</a></p></div>' +
    '<div class="analytics-consent-actions">' +
    '<button type="button" data-analytics-choice="rejected">Reject analytics</button>' +
    '<button type="button" data-analytics-choice="accepted">Accept analytics</button>' +
    '</div>';
  document.body.appendChild(panel);

  function closePanel() {
    panel.hidden = true;
    if (lastSettingsButton) {
      lastSettingsButton.focus();
      lastSettingsButton = null;
    }
  }

  panel.querySelectorAll('[data-analytics-choice]').forEach(function (button) {
    button.addEventListener('click', function () {
      consent = button.dataset.analyticsChoice;
      try {
        window.localStorage.setItem(storageKey, consent);
      } catch (error) {
        // The choice still applies to this page when browser storage is blocked.
      }
      if (consent === 'accepted') startAnalytics();
      else stopAnalytics();
      closePanel();
    });
  });

  document.querySelectorAll('[data-analytics-settings]').forEach(function (button) {
    button.hidden = false;
    button.addEventListener('click', function () {
      lastSettingsButton = button;
      panel.hidden = false;
      panel.querySelector('button').focus();
    });
  });

  document.querySelectorAll('a[data-store-platform]').forEach(function (link) {
    link.addEventListener('click', function () {
      if (consent !== 'accepted' || !started) return;
      gtag('event', 'app_store_clicked', {
        store_platform: link.dataset.storePlatform,
        placement: link.dataset.storePlacement,
      });
    });
  });

  // A choice changed in another tab takes effect here immediately too.
  window.addEventListener('storage', function (event) {
    if (event.key !== storageKey && event.key !== null) return;
    consent = readConsent();
    if (consent === 'accepted') startAnalytics();
    else stopAnalytics();
    panel.hidden = consent !== null;
  });

  if (consent === 'accepted') startAnalytics();
  else stopAnalytics();
  panel.hidden = consent !== null;
})();
