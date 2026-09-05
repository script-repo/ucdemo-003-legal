/**
 * Legal AI Portal — runtime inference client with provider fallback.
 *
 * Fixed resolution order (not user-configurable, per product spec):
 *   1. Nutanix Enterprise AI
 *        - If the user saved their own API key in Settings (gear icon,
 *          top right), call the NAI endpoint directly from the browser
 *          with that key.
 *        - Otherwise, use this demo's local `/api/ai` reverse proxy, which
 *          injects a server-side key. This is today's zero-config default
 *          and keeps every use case working with no settings required.
 *   2. OpenRouter — only attempted if the user configured & enabled it in
 *        Settings. Called directly from the browser with the user's key.
 *
 * If every configured tier fails, an aggregated error is thrown so the
 * calling use case's existing error-handling UI can show it.
 *
 * Depends on inference-settings.js being loaded first. Plain script, no
 * bundler/ES modules — attaches `window.LegalAIInference`.
 */
(function (global) {
  'use strict';

  function buildCandidates(fallback) {
    fallback = fallback || {};
    var settings = global.LegalAISettings.load();
    var normalize = global.LegalAISettings.normalizeBaseUrl;
    var candidates = [];

    var nai = settings.providers.nai;
    if (nai.enabled && nai.apiKey && nai.model) {
      candidates.push({
        label: 'Nutanix Enterprise AI (your key)',
        url: normalize(nai.baseUrl) + '/chat/completions',
        apiKey: nai.apiKey,
        model: nai.model,
        extraHeaders: {},
      });
    } else {
      candidates.push({
        label: 'Nutanix Enterprise AI (local proxy)',
        url: (fallback.proxyBase || '/api/ai').replace(/\/+$/, '') + '/chat/completions',
        apiKey: null,
        model: fallback.chatModel,
        extraHeaders: {},
      });
    }

    var or = settings.providers.openrouter;
    if (or.enabled && or.apiKey && or.model) {
      candidates.push({
        label: 'OpenRouter (fallback)',
        url: normalize(or.baseUrl) + '/chat/completions',
        apiKey: or.apiKey,
        model: or.model,
        extraHeaders: {
          'HTTP-Referer': global.location.origin,
          'X-Title': 'Legal AI Portal',
        },
      });
    }

    return candidates;
  }

  function callOne(candidate, messages, opts) {
    var body = {
      model: opts.model || candidate.model,
      messages: messages,
      max_tokens: opts.maxTokens || 2048,
      stream: false,
    };
    var headers = Object.assign(
      { 'Content-Type': 'application/json', Accept: 'application/json' },
      candidate.extraHeaders
    );
    if (candidate.apiKey) headers.Authorization = 'Bearer ' + candidate.apiKey;

    var timeoutMs = opts.timeoutMs || 60000;
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;

    return fetch(candidate.url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined,
    })
      .then(function (res) {
        if (timer) clearTimeout(timer);
        if (!res.ok) {
          return res.text().then(function (text) {
            throw new Error(candidate.label + ' failed: HTTP ' + res.status + (text ? ' \u2014 ' + text.slice(0, 300) : ''));
          });
        }
        return res.json();
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        if (err && err.name === 'AbortError') {
          throw new Error(candidate.label + ' timed out after ' + Math.round(timeoutMs / 1000) + 's.');
        }
        throw err;
      });
  }

  /**
   * @param {Array<{role:string, content:string}>} messages
   * @param {Object} [opts] - { model, maxTokens, timeoutMs }
   * @param {Object} [fallback] - { proxyBase, chatModel } this use case's
   *   existing zero-config defaults (its local `AI_CONFIG`), used as the
   *   NAI tier's implementation whenever the user hasn't saved their own key.
   * @returns {Promise<Object>} raw OpenAI-shape chat completion response
   *   (same shape every use case already parses via response.choices[0]).
   */
  function chatCompletion(messages, opts, fallback) {
    opts = opts || {};
    var candidates = buildCandidates(fallback);
    var errors = [];

    function tryNext(index) {
      if (index >= candidates.length) {
        var summary = errors
          .map(function (e) { return e.candidate + ': ' + e.error.message; })
          .join(' | ');
        throw new Error('All inference endpoints failed. ' + summary);
      }
      var candidate = candidates[index];
      return callOne(candidate, messages, opts).catch(function (err) {
        console.warn('[inference-client]', candidate.label, 'failed:', err.message);
        errors.push({ candidate: candidate.label, error: err });
        return tryNext(index + 1);
      });
    }

    return tryNext(0);
  }

  global.LegalAIInference = {
    chatCompletion: chatCompletion,
    buildCandidates: buildCandidates,
  };
})(window);
