/**
 * Endpoint Settings page — configure Nutanix Enterprise AI + OpenRouter.
 * Reads/writes via window.LegalAISettings (portal/shared/inference-settings.js).
 * Self-contained, no ES modules, matches the rest of the portal.
 */
(function () {
  'use strict';

  var PROVIDERS = ['nai', 'openrouter'];

  function el(id) {
    return document.getElementById(id);
  }

  function showStatusBanner(message, type) {
    var banner = el('status-banner');
    banner.textContent = message;
    banner.className = 'status-banner ' + type;
    window.clearTimeout(showStatusBanner._t);
    showStatusBanner._t = window.setTimeout(function () {
      banner.className = 'status-banner hidden';
    }, 4000);
  }

  function populateModelSelect(providerId, models, selected) {
    var select = el(providerId + '-model');
    select.innerHTML = '';
    if (!models || !models.length) {
      var opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Test the connection to load available models\u2026';
      select.appendChild(opt);
      select.disabled = true;
      return;
    }
    models.forEach(function (id) {
      var opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      select.appendChild(opt);
    });
    select.disabled = false;
    if (selected && models.indexOf(selected) !== -1) {
      select.value = selected;
    }
  }

  function setTestStatus(providerId, message, kind) {
    var span = el(providerId + '-test-status');
    span.textContent = message;
    span.className = 'test-status' + (kind ? ' ' + kind : '');
  }

  function hydrateForm(settings) {
    PROVIDERS.forEach(function (id) {
      var p = settings.providers[id];
      el(id + '-enabled').checked = !!p.enabled;
      el(id + '-base-url').value = p.baseUrl || window.LegalAISettings.PROVIDER_META[id].defaultBaseUrl;
      el(id + '-api-key').value = p.apiKey || '';
      populateModelSelect(id, p.models, p.model);
      if (p.lastTestOk === true) {
        setTestStatus(id, '\u2713 Last test succeeded (' + (p.models || []).length + ' models)', 'ok');
      } else if (p.lastTestOk === false) {
        setTestStatus(id, '\u2717 Last test failed', 'error');
      } else {
        setTestStatus(id, '', '');
      }
    });
  }

  function readFormIntoSettings() {
    var settings = window.LegalAISettings.load();
    PROVIDERS.forEach(function (id) {
      var p = settings.providers[id];
      p.enabled = el(id + '-enabled').checked;
      p.baseUrl = el(id + '-base-url').value.trim() || window.LegalAISettings.PROVIDER_META[id].defaultBaseUrl;
      p.apiKey = el(id + '-api-key').value.trim();
      var select = el(id + '-model');
      p.model = select.disabled ? p.model : select.value;
    });
    return settings;
  }

  function wireKeyVisibilityToggles() {
    document.querySelectorAll('.key-visibility-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var input = el(btn.getAttribute('data-target'));
        var showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        btn.setAttribute('aria-label', showing ? 'Show API key' : 'Hide API key');
      });
    });
  }

  function wireTestButtons() {
    document.querySelectorAll('.test-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var providerId = btn.getAttribute('data-provider');
        var baseUrl = el(providerId + '-base-url').value.trim() || window.LegalAISettings.PROVIDER_META[providerId].defaultBaseUrl;
        var apiKey = el(providerId + '-api-key').value.trim();

        if (!apiKey) {
          setTestStatus(providerId, 'Enter an API key first.', 'error');
          return;
        }

        btn.disabled = true;
        setTestStatus(providerId, 'Testing\u2026', 'pending');

        window.LegalAISettings.testProvider(baseUrl, apiKey).then(function (result) {
          btn.disabled = false;
          if (result.ok) {
            setTestStatus(providerId, '\u2713 Connected \u2014 ' + result.models.length + ' models found', 'ok');
            populateModelSelect(providerId, result.models, el(providerId + '-model').value);
            // Persist the fresh model list + last-test outcome immediately so a
            // page refresh (without hitting Save) doesn't lose the test result.
            var settings = window.LegalAISettings.load();
            settings.providers[providerId].models = result.models;
            settings.providers[providerId].lastTestOk = true;
            settings.providers[providerId].lastTestedAt = new Date().toISOString();
            window.LegalAISettings.save(settings);
          } else {
            setTestStatus(providerId, '\u2717 ' + result.error, 'error');
            var failed = window.LegalAISettings.load();
            failed.providers[providerId].lastTestOk = false;
            failed.providers[providerId].lastTestedAt = new Date().toISOString();
            window.LegalAISettings.save(failed);
          }
        });
      });
    });
  }

  function wireForm() {
    el('settings-form').addEventListener('submit', function (evt) {
      evt.preventDefault();
      var settings = readFormIntoSettings();
      window.LegalAISettings.save(settings);
      showStatusBanner('Settings saved to this browser.', 'success');
    });

    el('clear-settings-btn').addEventListener('click', function () {
      window.LegalAISettings.clear();
      hydrateForm(window.LegalAISettings.defaults());
      showStatusBanner('Saved settings cleared. Use cases will fall back to the demo\u2019s default endpoint.', 'success');
    });
  }

  function init() {
    hydrateForm(window.LegalAISettings.load());
    wireKeyVisibilityToggles();
    wireTestButtons();
    wireForm();
  }

  init();
})();
