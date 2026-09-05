/**
 * Legal AI Portal — client-side inference endpoint settings.
 *
 * Stores provider configuration (Nutanix Enterprise AI, OpenRouter) in the
 * browser's localStorage ONLY. Nothing here is ever sent to, or read from,
 * the server — this is intentionally a bring-your-own-key model that lives
 * entirely on the client.
 *
 * See portal/settings/ for the configuration UI and
 * portal/shared/inference-client.js for the runtime fallback logic that
 * consumes what's saved here.
 *
 * Plain script, no bundler/ES modules — attaches `window.LegalAISettings`,
 * matching every other file in portal/.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'legalAiPortal.inferenceSettings.v1';

  var PROVIDER_META = {
    nai: {
      id: 'nai',
      label: 'Nutanix Enterprise AI',
      priority: 1,
      priorityLabel: 'Primary',
      defaultBaseUrl: 'https://nai.hpoc.nutanix.com:443/api/v1',
      hint: 'OpenAI-compatible endpoint. Leave disabled to use this demo\u2019s built-in server-side key via the local proxy instead of your own key.',
    },
    openrouter: {
      id: 'openrouter',
      label: 'OpenRouter',
      priority: 2,
      priorityLabel: 'Fallback',
      defaultBaseUrl: 'https://openrouter.ai/api/v1',
      hint: 'Create a key at openrouter.ai/keys. Used only if the primary endpoint fails or isn\u2019t configured.',
    },
  };

  function defaultProviderSettings(id) {
    var meta = PROVIDER_META[id];
    return {
      enabled: false,
      baseUrl: meta.defaultBaseUrl,
      apiKey: '',
      model: '',
      models: [], // cached model ids from the last successful "Test" call
      lastTestOk: null,
      lastTestedAt: null,
    };
  }

  function defaults() {
    return {
      version: 1,
      providers: {
        nai: defaultProviderSettings('nai'),
        openrouter: defaultProviderSettings('openrouter'),
      },
    };
  }

  function load() {
    var base = defaults();
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      var parsed = JSON.parse(raw);
      if (parsed && parsed.providers) {
        base.providers.nai = Object.assign({}, base.providers.nai, parsed.providers.nai || {});
        base.providers.openrouter = Object.assign({}, base.providers.openrouter, parsed.providers.openrouter || {});
      }
      return base;
    } catch (e) {
      console.warn('[inference-settings] failed to load saved settings, using defaults.', e);
      return base;
    }
  }

  function save(settings) {
    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function clear() {
    global.localStorage.removeItem(STORAGE_KEY);
  }

  function normalizeBaseUrl(url) {
    return (url || '').trim().replace(/\/+$/, '');
  }

  function withTimeout(promiseFactory, ms) {
    if (typeof AbortController === 'undefined') {
      return promiseFactory(undefined);
    }
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, ms);
    return promiseFactory(controller.signal).finally(function () {
      clearTimeout(timer);
    });
  }

  /**
   * Validate a provider's base URL + API key by listing available models.
   * @returns {Promise<{ok: boolean, models?: string[], error?: string}>}
   */
  function testProvider(baseUrl, apiKey) {
    var url = normalizeBaseUrl(baseUrl) + '/models';
    var headers = { Accept: 'application/json' };
    if (apiKey) headers.Authorization = 'Bearer ' + apiKey;

    return withTimeout(function (signal) {
      return fetch(url, { method: 'GET', headers: headers, signal: signal })
        .then(function (res) {
          if (!res.ok) {
            return res.text().then(function (text) {
              throw new Error('HTTP ' + res.status + (text ? ': ' + text.slice(0, 300) : ''));
            });
          }
          return res.json();
        })
        .then(function (json) {
          var list = (json && Array.isArray(json.data)) ? json.data : (Array.isArray(json) ? json : []);
          var ids = list
            .map(function (m) { return (m && (m.id || m.name || m.model)) || null; })
            .filter(Boolean);
          ids.sort();
          return { ok: true, models: ids };
        });
    }, 15000).catch(function (err) {
      var message = (err && err.name === 'AbortError')
        ? 'Request timed out after 15s.'
        : (err && err.message) || String(err);
      return { ok: false, error: message };
    });
  }

  global.LegalAISettings = {
    STORAGE_KEY: STORAGE_KEY,
    PROVIDER_META: PROVIDER_META,
    defaults: defaults,
    load: load,
    save: save,
    clear: clear,
    testProvider: testProvider,
    normalizeBaseUrl: normalizeBaseUrl,
  };
})(window);
