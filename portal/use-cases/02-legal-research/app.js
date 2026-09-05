/**
 * Legal Research — Use Case App (self-contained, no ES modules).
 * Sends natural-language research questions to Nutanix AI via the local proxy.
 * Returns ranked, cited legal authorities with summaries. Persists history
 * to the database API and supports clicking cached results.
 */
(function () {
  'use strict';

  /* =====================================================================
   * AI Client — Nutanix endpoint configuration (via local proxy)
   * =================================================================== */

  var AI_CONFIG = {
    proxyBase: '/api/ai',
    chatModel: 'llama3-1-8b',
    embeddingModel: 'llama-3-2-embed',
    defaults: { maxTokens: 4096, stream: false },
  };

  var USE_CASE = 'uc02';

  function chatCompletion(messages, opts) {
    opts = opts || {};
    var body = {
      model: opts.model || AI_CONFIG.chatModel,
      messages: messages,
      max_tokens: opts.maxTokens || AI_CONFIG.defaults.maxTokens,
      stream: opts.stream !== undefined ? opts.stream : AI_CONFIG.defaults.stream,
    };
    return fetch(AI_CONFIG.proxyBase + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (res) {
      if (!res.ok) throw new Error('Chat completions failed: ' + res.status);
      return res.json();
    });
  }

  /* =====================================================================
   * Robust JSON parsing — handles malformed LLM output
   * =================================================================== */

  function extractJsonObject(s) {
    var start = s.indexOf('{');
    if (start === -1) return s;
    var depth = 0;
    var inStr = false;
    var esc = false;
    for (var i = start; i < s.length; i++) {
      var c = s[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return s.substring(start, i + 1); }
    }
    return s.substring(start);
  }

  function getJsonErrorPos(str) {
    try { JSON.parse(str); return -1; } catch (e) {
      var m = e.message.match(/position\s+(\d+)/i);
      return m ? parseInt(m[1], 10) : -1;
    }
  }

  function parseAiJson(raw) {
    console.log('Raw AI response:', raw);
    var s = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

    try { return JSON.parse(s); } catch (_) {}

    s = extractJsonObject(s);
    try { return JSON.parse(s); } catch (_) {}

    s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
         .replace(/[\n\r]/g, ' ')
         .replace(/\t/g, ' ');
    try { return JSON.parse(s); } catch (_) {}

    s = s.replace(/\\(?!["\\\/bfnrtu])/g, '\\\\');
    try { return JSON.parse(s); } catch (_) {}

    s = s.replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(s); } catch (_) {}

    s = s.replace(/":\s*([A-Za-z][^,}\]"]*?)(\s*[,}\]])/g, function (m, val, end) {
      var t = val.trim();
      if (t === 'true' || t === 'false' || t === 'null') return m;
      return '": "' + t.replace(/"/g, '\\"') + '"' + end;
    });
    try { return JSON.parse(s); } catch (_) {}

    // Remove stray closing braces between property values
    var braceRe = /"\s*\}\s*,\s*"/g;
    var bm;
    while ((bm = braceRe.exec(s)) !== null) {
      var bracePos = s.indexOf('}', bm.index);
      var candidate = s.substring(0, bracePos) + s.substring(bracePos + 1);
      try { return JSON.parse(candidate); } catch (_) {
        s = candidate;
        braceRe.lastIndex = bm.index;
      }
    }
    try { return JSON.parse(s); } catch (_) {}

    var lastPos = -1;
    for (var attempt = 0; attempt < 25; attempt++) {
      var pos = getJsonErrorPos(s);
      if (pos === -1) return JSON.parse(s);
      if (pos <= lastPos) break;
      lastPos = pos;
      var fixed = false;
      for (var j = pos; j >= 0; j--) {
        if (s[j] === '"' && (j === 0 || s[j - 1] !== '\\')) {
          s = s.substring(0, j) + '\\' + s.substring(j);
          fixed = true;
          break;
        }
      }
      if (!fixed) break;
    }

    try { return JSON.parse(s); } catch (e) {
      var ep = getJsonErrorPos(s);
      if (ep >= 0) {
        console.error('JSON repair failed near:', s.substring(Math.max(0, ep - 60), ep + 60));
      }
      throw new Error('Could not parse AI response as JSON');
    }
  }

  /* =====================================================================
   * Inference — legal research via chat completions
   * =================================================================== */

  var SYSTEM_PROMPT =
    'You are a legal research assistant. Given a natural-language legal research question, respond with a JSON object containing:\n' +
    '- "summary": 2-3 sentence overview answering the question\n' +
    '- "authorities": array of objects with { "title", "type" (case/statute/secondary), "jurisdiction", "citation", "year", "summary", "relevanceScore" (0-100), "keyPassage" }\n' +
    '- "contraryAuthority": array of same shape for potentially adverse authorities\n' +
    '- "suggestedFollowUp": array of follow-up research questions (strings)\n' +
    'Only include authorities that are relevant. Respond ONLY with valid JSON, no markdown fences.';

  function runResearch(query) {
    var userContent = 'Research the following legal question:\n\n' + query;

    return chatCompletion(
      [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      { maxTokens: 4096 }
    )
      .then(function (response) {
        var raw = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
        if (!raw) throw new Error('No response content from AI');
        var parsed = parseAiJson(raw);
        if (!parsed.summary || !Array.isArray(parsed.authorities)) {
          throw new Error('AI response missing required fields');
        }
        return parsed;
      });
  }

  /* =====================================================================
   * Database persistence — research history
   * =================================================================== */

  function saveResearchToDb(query, data) {
    return fetch('/api/db/summaries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        use_case: USE_CASE,
        title: query.length > 80 ? query.slice(0, 77) + '...' : query,
        data: { query: query, result: data },
      }),
    }).then(function (r) { return r.json(); })
      .catch(function (e) { console.warn('Failed to save research:', e); });
  }

  function loadHistoryFromDb() {
    return fetch('/api/db/summaries?use_case=' + USE_CASE)
      .then(function (r) { return r.json(); })
      .then(function (rows) { return Array.isArray(rows) ? rows : []; })
      .catch(function () { return []; });
  }

  function deleteResearchFromDb(id) {
    return fetch('/api/db/summaries?use_case=' + USE_CASE + '&id=' + id, { method: 'DELETE' })
      .then(function (r) { return r.json(); })
      .catch(function (e) { console.warn('Failed to delete:', e); });
  }

  function deleteAllResearchFromDb() {
    return fetch('/api/db/summaries?use_case=' + USE_CASE, { method: 'DELETE' })
      .then(function (r) { return r.json(); })
      .catch(function (e) { console.warn('Failed to clear history:', e); });
  }

  /* =====================================================================
   * DOM references
   * =================================================================== */

  var landingSection = document.getElementById('landing-section');
  var queryInput = document.getElementById('query-input');
  var btnResearch = document.getElementById('btn-research');
  var loadingSection = document.getElementById('loading-section');
  var resultsSection = document.getElementById('results-section');
  var btnNewResearch = document.getElementById('btn-new-research');
  var summaryEl = document.getElementById('summary-text');
  var authoritiesList = document.getElementById('authorities-list');
  var contraryList = document.getElementById('contrary-list');
  var followupList = document.getElementById('followup-list');
  var historyList = document.getElementById('history-list');
  var errorBanner = document.getElementById('error-banner');
  var btnClearHistory = document.getElementById('btn-clear-history');

  function show(el) { if (el) el.classList.remove('hidden'); }
  function hide(el) { if (el) el.classList.add('hidden'); }

  function showError(msg) {
    if (!errorBanner) return;
    errorBanner.textContent = msg;
    show(errorBanner);
    setTimeout(function () { hide(errorBanner); }, 8000);
  }

  /* =====================================================================
   * Rendering helpers
   * =================================================================== */

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function relevanceClass(score) {
    if (score >= 80) return '';
    if (score >= 60) return 'medium';
    return 'low';
  }

  function renderAuthority(auth, container) {
    var card = document.createElement('div');
    card.className = 'authority-card';
    card.setAttribute('role', 'listitem');

    var keyPassageId = 'kp-' + Math.random().toString(36).slice(2);
    var hasKeyPassage = auth.keyPassage && auth.keyPassage.trim().length > 0;

    var keyPassageHtml = '';
    if (hasKeyPassage) {
      keyPassageHtml =
        '<button type="button" class="key-passage-toggle" data-target="' + keyPassageId + '" aria-expanded="false">Show key passage</button>' +
        '<div id="' + keyPassageId + '" class="key-passage-content hidden">' + esc(auth.keyPassage) + '</div>';
    }

    var relClass = relevanceClass(auth.relevanceScore || 0);

    card.innerHTML =
      '<h3>' + esc(auth.title) + '</h3>' +
      '<div class="authority-meta">' +
        '<span class="jurisdiction-badge">' + esc(auth.jurisdiction || 'N/A') + '</span>' +
        '<span class="authority-citation">' + esc(auth.citation || '') + '</span>' +
        (auth.year ? '<span class="authority-year">' + esc(auth.year) + '</span>' : '') +
      '</div>' +
      '<p class="authority-summary">' + esc(auth.summary || '') + '</p>' +
      '<div class="relevance-label">Relevance: ' + (auth.relevanceScore || 0) + '%</div>' +
      '<div class="relevance-bar"><div class="relevance-fill ' + relClass + '" style="width:' + (auth.relevanceScore || 0) + '%"></div></div>' +
      keyPassageHtml +
      '<div class="authority-feedback">' +
        '<button type="button" class="btn-feedback helpful">Helpful</button>' +
        '<button type="button" class="btn-feedback not-helpful">Not helpful</button>' +
      '</div>';

    container.appendChild(card);

    if (hasKeyPassage) {
      var toggle = card.querySelector('.key-passage-toggle');
      var content = card.querySelector('#' + keyPassageId);
      toggle.addEventListener('click', function () {
        var expanded = content.classList.contains('hidden');
        content.classList.toggle('hidden', !expanded);
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.textContent = expanded ? 'Hide key passage' : 'Show key passage';
      });
    }

    card.querySelectorAll('.btn-feedback').forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.classList.add(btn.classList.contains('helpful') ? 'helpful' : 'not-helpful');
        btn.disabled = true;
      });
    });
  }

  function renderResults(data) {
    summaryEl.textContent = data.summary || '';

    authoritiesList.innerHTML = '';
    (data.authorities || []).forEach(function (a) {
      renderAuthority(a, authoritiesList);
    });

    contraryList.innerHTML = '';
    (data.contraryAuthority || []).forEach(function (a) {
      renderAuthority(a, contraryList);
    });

    followupList.innerHTML = '';
    (data.suggestedFollowUp || []).forEach(function (q) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'followup-chip';
      chip.textContent = q;
      chip.addEventListener('click', function () {
        queryInput.value = q;
        btnResearch.disabled = false;
        runResearchPipeline(q);
      });
      followupList.appendChild(chip);
    });
  }

  function displayResults(data) {
    renderResults(data);
    showResultsView();
  }

  /* =====================================================================
   * History rendering
   * =================================================================== */

  var cachedHistory = [];

  function toggleClearButton() {
    if (cachedHistory.length > 0) show(btnClearHistory);
    else hide(btnClearHistory);
  }

  function renderHistory(rows) {
    cachedHistory = rows;
    historyList.innerHTML = '';
    toggleClearButton();

    if (rows.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: var(--color-text-muted); font-size: 0.85rem; margin: 0;';
      empty.textContent = 'No research history yet. Enter a question above to get started.';
      historyList.appendChild(empty);
      return;
    }

    rows.forEach(function (row) {
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'history-item';
      item.setAttribute('role', 'listitem');

      var queryText = (row.data && row.data.query) || row.title || '';
      item.textContent = queryText.length > 60 ? queryText.slice(0, 57) + '...' : queryText;
      item.title = queryText;

      item.addEventListener('click', function (e) {
        if (e.target.classList.contains('history-item-delete')) return;
        if (row.data && row.data.result) {
          queryInput.value = row.data.query || '';
          displayResults(row.data.result);
        } else {
          queryInput.value = queryText;
          btnResearch.disabled = false;
          runResearchPipeline(queryText);
        }
      });

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'history-item-delete';
      delBtn.title = 'Delete';
      delBtn.innerHTML = '&times;';
      delBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteResearchFromDb(row.id).then(function () {
          return loadHistoryFromDb();
        }).then(function (rows) {
          renderHistory(rows);
        });
      });

      item.appendChild(delBtn);
      historyList.appendChild(item);
    });
  }

  /* =====================================================================
   * Section state management
   * =================================================================== */

  function showLanding() {
    show(landingSection);
    hide(loadingSection);
    hide(resultsSection);
  }

  function showLoading() {
    hide(landingSection);
    show(loadingSection);
    hide(resultsSection);
  }

  function showResultsView() {
    hide(landingSection);
    hide(loadingSection);
    show(resultsSection);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* =====================================================================
   * Research pipeline
   * =================================================================== */

  var processing = false;

  function runResearchPipeline(query) {
    if (processing) return;
    processing = true;

    hide(errorBanner);
    showLoading();

    runResearch(query)
      .then(function (result) {
        renderResults(result);
        return saveResearchToDb(query, result).then(function () {
          return loadHistoryFromDb();
        });
      })
      .then(function (rows) {
        renderHistory(rows);
        showResultsView();
      })
      .catch(function (err) {
        console.error('Research failed:', err);
        showError('Research failed: ' + err.message);
        showLanding();
      })
      .then(function () { processing = false; });
  }

  /* =====================================================================
   * Event listeners
   * =================================================================== */

  queryInput.addEventListener('input', function () {
    btnResearch.disabled = queryInput.value.trim().length < 10;
  });

  btnResearch.addEventListener('click', function () {
    var query = queryInput.value.trim();
    if (query.length < 10) return;
    runResearchPipeline(query);
  });

  btnNewResearch.addEventListener('click', function () {
    queryInput.value = '';
    btnResearch.disabled = true;
    showLanding();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  btnClearHistory.addEventListener('click', function () {
    if (!confirm('Clear all research history?')) return;
    deleteAllResearchFromDb().then(function () {
      return loadHistoryFromDb();
    }).then(function (rows) {
      renderHistory(rows);
    });
  });

  /* =====================================================================
   * Init — load history from DB
   * =================================================================== */

  loadHistoryFromDb().then(function (rows) {
    renderHistory(rows);
  });

})();
