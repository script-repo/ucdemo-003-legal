/**
 * Knowledge Management & Precedent Search — Use Case App (self-contained, no ES modules).
 * AI-powered search across the firm's precedent library. Similar to UC-02 (Legal Research)
 * but for INTERNAL firm knowledge — work product, memos, briefs, templates.
 * Sends search query to Nutanix AI via the local proxy. Returns relevant precedents
 * with summaries and relevance scores. Persists history to the database.
 */
(function () {
  'use strict';

  /* =====================================================================
   * AI Client — Nutanix endpoint configuration (via local proxy)
   * =================================================================== */

  var AI_CONFIG = {
    proxyBase: '/api/ai',
    chatModel: 'llama3-1-8b',
    defaults: { maxTokens: 4096, stream: false },
  };

  function chatCompletion(messages, opts) {
    opts = opts || {};
    if (!opts.maxTokens) opts.maxTokens = AI_CONFIG.defaults.maxTokens;
    if (opts.stream === undefined) opts.stream = AI_CONFIG.defaults.stream;
    // Tries Nutanix Enterprise AI first (via the local proxy, or directly
    // with a user-saved key from Settings), then falls back to OpenRouter
    // if configured. See portal/shared/inference-client.js.
    return window.LegalAIInference.chatCompletion(messages, opts, AI_CONFIG);
  }

  /* =====================================================================
   * Robust JSON parsing — handles malformed LLM output (identical to UC-01)
   * =================================================================== */

  function extractJsonObject(s) {
    var start = s.indexOf('{');
    if (start === -1) return s;
    var depth = 0;
    var inStr = false;
    var end = -1;
    for (var i = start; i < s.length; i++) {
      var c = s[i];
      if (c === '\\' && inStr) { i++; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return end !== -1 ? s.substring(start, end + 1) : s.substring(start);
  }

  function getJsonErrorPos(s) {
    try { JSON.parse(s); return -1; } catch (e) {
      var m = e.message.match(/position\s+(\d+)/i);
      return m ? parseInt(m[1]) : -2;
    }
  }

  function parseAiJson(raw) {
    console.log('Raw AI response:', raw);
    var s = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    try { return JSON.parse(s); } catch (_) {}

    s = extractJsonObject(s);
    try { return JSON.parse(s); } catch (_) {}

    s = s.replace(/[\x00-\x1f\x7f]/g, function (ch) {
      if (ch === '\n' || ch === '\r' || ch === '\t') return ' ';
      return '';
    });
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

    var lastErrPos = -1;
    for (var attempt = 0; attempt < 25; attempt++) {
      var errPos = getJsonErrorPos(s);
      if (errPos === -1) return JSON.parse(s);
      if (errPos === -2 || errPos <= lastErrPos) break;
      lastErrPos = errPos;

      var found = false;
      for (var i = errPos - 1; i >= 0; i--) {
        if (s[i] === '"' && (i === 0 || s[i - 1] !== '\\')) {
          s = s.substring(0, i) + '\\"' + s.substring(i + 1);
          found = true;
          break;
        }
      }
      if (!found) break;
    }

    try { return JSON.parse(s); } catch (e) {
      var pos = (e.message.match(/position\s+(\d+)/i) || [])[1];
      var snippet = pos ? s.substring(Math.max(0, +pos - 40), +pos + 40) : s.substring(0, 200);
      console.error('JSON repair failed near:', snippet);
      throw new Error('Could not parse AI response as JSON');
    }
  }

  /* =====================================================================
   * Inference — precedent search via chat completions
   * =================================================================== */

  var SYSTEM_PROMPT =
    'You are a legal knowledge management AI. Search and summarize firm precedents (memos, briefs, templates, opinions, contracts). Respond with JSON containing:\n' +
    '- "summary": 2-3 sentence answer summarizing relevant precedents found\n' +
    '- "precedents": array of objects with { "title", "documentType", "practiceArea", "author", "date", "relevanceScore" (0-100), "excerpt", "keyTakeaway" }\n' +
    '- "suggestedSearches": array of follow-up query strings the user might try\n' +
    'Only include precedents that are relevant. Respond ONLY with valid JSON, no markdown fences.';

  function searchPrecedents(query, filters) {
    if (!query || query.trim().length < 10) {
      return Promise.reject(new Error('Search query must be at least 10 characters.'));
    }

    var userContent = 'Search the firm knowledge base for precedents matching this query:\n\n' + query.trim();

    if (filters && (filters.documentType || filters.practiceArea)) {
      userContent += '\n\nFilters:';
      if (filters.documentType) userContent += '\n- Document type: ' + filters.documentType;
      if (filters.practiceArea) userContent += '\n- Practice area: ' + filters.practiceArea;
    }

    return chatCompletion(
      [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      { maxTokens: 4096 }
    )
      .then(function (response) {
        var raw = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
        if (!raw) throw new Error('No response content from AI');
        var parsed = parseAiJson(raw);
        if (!parsed.summary || !Array.isArray(parsed.precedents)) {
          throw new Error('AI response missing required fields (summary, precedents)');
        }
        return parsed;
      });
  }

  /* =====================================================================
   * Database — persistent search storage via /api/db/summaries
   * =================================================================== */

  var DB_API = '/api/db/summaries';
  var USE_CASE = 'uc16';
  var localHistory = [];

  function saveSearchToDb(result, query) {
    var title = query.length > 80 ? query.slice(0, 77) + '...' : query;
    return fetch(DB_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ use_case: USE_CASE, title: title, data: { query: query, result: result } }),
    })
      .then(function (res) { return res.json(); })
      .then(function (saved) {
        localHistory.unshift({
          id: saved.id,
          title: title,
          createdAt: saved.createdAt,
          data: { query: query, result: result },
        });
        if (localHistory.length > 10) localHistory = localHistory.slice(0, 10);
        return saved;
      })
      .catch(function (err) {
        console.warn('Failed to persist search:', err.message);
        localHistory.unshift({
          id: 'local-' + Date.now(),
          title: title,
          createdAt: new Date().toISOString(),
          data: { query: query, result: result },
        });
      });
  }

  function loadHistoryFromDb() {
    return fetch(DB_API + '?use_case=' + USE_CASE + '&limit=10')
      .then(function (res) { return res.json(); })
      .then(function (rows) {
        localHistory = Array.isArray(rows) ? rows : [];
        return localHistory;
      })
      .catch(function (err) {
        console.warn('Failed to load history:', err.message);
        return localHistory;
      });
  }

  function getHistory() { return localHistory.slice(); }

  function deleteSearchFromDb(id) {
    return fetch(DB_API + '?use_case=' + USE_CASE + '&id=' + id, { method: 'DELETE' })
      .then(function (res) { return res.json(); })
      .then(function () {
        localHistory = localHistory.filter(function (h) { return h.id !== id; });
      })
      .catch(function (err) { console.warn('Failed to delete search:', err.message); });
  }

  function deleteAllSearchesFromDb() {
    return fetch(DB_API + '?use_case=' + USE_CASE, { method: 'DELETE' })
      .then(function (res) { return res.json(); })
      .then(function () { localHistory = []; })
      .catch(function (err) { console.warn('Failed to clear history:', err.message); });
  }

  /* =====================================================================
   * DOM references
   * =================================================================== */

  var landingSection = document.getElementById('landing-section');
  var queryInput = document.getElementById('query-input');
  var docTypeFilter = document.getElementById('doc-type-filter');
  var practiceAreaFilter = document.getElementById('practice-area-filter');
  var btnSearch = document.getElementById('btn-search');
  var loadingSection = document.getElementById('loading-section');
  var resultsSection = document.getElementById('results-section');
  var btnNewSearch = document.getElementById('btn-new-search');
  var summaryEl = document.getElementById('summary-text');
  var precedentsList = document.getElementById('precedents-list');
  var followupList = document.getElementById('followup-list');
  var historyList = document.getElementById('history-list');
  var resultsHistoryList = document.getElementById('results-history-list');
  var btnClearHistory = document.getElementById('btn-clear-history');
  var btnClearResultsHistory = document.getElementById('btn-clear-results-history');
  var errorBanner = document.getElementById('error-banner');
  var loadingStatus = document.getElementById('loading-status');

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

  function renderPrecedentCard(prec) {
    var card = document.createElement('div');
    card.className = 'precedent-card';
    card.setAttribute('role', 'listitem');

    var score = prec.relevanceScore || 0;
    var relClass = relevanceClass(score);

    card.innerHTML =
      '<h3>' + esc(prec.title) + '</h3>' +
      '<div class="precedent-meta">' +
        '<span class="precedent-type-badge">' + esc(prec.documentType || 'Document') + '</span>' +
        (prec.practiceArea ? '<span class="precedent-practice-area">' + esc(prec.practiceArea) + '</span>' : '') +
        (prec.author || prec.date ? '<span class="precedent-author-date">' + esc(prec.author || '') + (prec.author && prec.date ? ' · ' : '') + esc(prec.date || '') + '</span>' : '') +
      '</div>' +
      '<div class="relevance-label">Relevance: ' + score + '%</div>' +
      '<div class="relevance-bar"><div class="relevance-fill ' + relClass + '" style="width:' + score + '%"></div></div>' +
      (prec.excerpt ? '<div class="precedent-excerpt">' + esc(prec.excerpt) + '</div>' : '') +
      (prec.keyTakeaway ? '<p class="precedent-takeaway"><strong>Key takeaway:</strong> ' + esc(prec.keyTakeaway) + '</p>' : '');

    precedentsList.appendChild(card);
  }

  function renderResults(data) {
    summaryEl.textContent = data.summary || '';

    precedentsList.innerHTML = '';
    (data.precedents || []).forEach(function (p) {
      renderPrecedentCard(p);
    });

    followupList.innerHTML = '';
    (data.suggestedSearches || []).forEach(function (q) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'followup-chip';
      chip.textContent = q;
      chip.addEventListener('click', function () {
        queryInput.value = q;
        btnSearch.disabled = false;
        runSearchPipeline(q, getFilters());
      });
      followupList.appendChild(chip);
    });
  }

  function getFilters() {
    return {
      documentType: docTypeFilter ? docTypeFilter.value : '',
      practiceArea: practiceAreaFilter ? practiceAreaFilter.value : '',
    };
  }

  function displayResults(data) {
    renderResults(data);
    showResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderHistoryInto(container, history) {
    if (!container) return;
    container.innerHTML = '';
    if (!history || history.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: var(--color-text-muted); font-size: 0.9rem; text-align: center; padding: 0.5rem 0;';
      empty.textContent = 'No searches yet. Enter a query above to get started.';
      container.appendChild(empty);
      return;
    }
    history.forEach(function (h) {
      var item = document.createElement('div');
      item.className = 'history-item';
      item.setAttribute('role', 'listitem');
      var queryText = (h.data && h.data.query) || h.title || '';
      var date = new Date(h.createdAt).toLocaleDateString();

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'history-item-delete';
      deleteBtn.setAttribute('aria-label', 'Delete this search');
      deleteBtn.title = 'Delete';
      deleteBtn.innerHTML = '&#10005;';
      deleteBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!confirm('Delete "' + (queryText.length > 50 ? queryText.slice(0, 47) + '...' : queryText) + '"?')) return;
        deleteSearchFromDb(h.id).then(function () { renderHistory(getHistory()); });
      });

      item.innerHTML =
        '<div class="history-item-name">' + esc(queryText.length > 60 ? queryText.slice(0, 57) + '...' : queryText) + '</div>' +
        '<div class="history-meta"><span class="history-item-date">' + date + '</span></div>';
      item.appendChild(deleteBtn);

      if (h.data && h.data.result) {
        item.title = 'Click to view this search';
        item.addEventListener('click', function () { displayResults(h.data.result); });
      } else {
        item.classList.add('no-data');
      }
      container.appendChild(item);
    });
  }

  function toggleClearButtons(hasHistory) {
    if (btnClearHistory) {
      if (hasHistory) btnClearHistory.classList.remove('hidden');
      else btnClearHistory.classList.add('hidden');
    }
    if (btnClearResultsHistory) {
      if (hasHistory) btnClearResultsHistory.classList.remove('hidden');
      else btnClearResultsHistory.classList.add('hidden');
    }
  }

  function renderHistory(history) {
    renderHistoryInto(historyList, history);
    if (resultsHistoryList) renderHistoryInto(resultsHistoryList, history);
    toggleClearButtons(history && history.length > 0);
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
    if (loadingStatus) loadingStatus.textContent = 'Searching knowledge base\u2026';
  }

  function showResults() {
    hide(landingSection);
    hide(loadingSection);
    show(resultsSection);
  }

  /* =====================================================================
   * Search pipeline
   * =================================================================== */

  var processing = false;

  function runSearchPipeline(query, filters) {
    if (processing) return;
    processing = true;

    hide(errorBanner);
    showLoading();

    searchPrecedents(query, filters)
      .then(function (result) {
        displayResults(result);
        return saveSearchToDb(result, query).then(function () {
          renderHistory(getHistory());
        });
      })
      .catch(function (err) {
        console.error('Search failed:', err);
        showError('Search failed: ' + err.message);
        showLanding();
      })
      .then(function () { processing = false; });
  }

  /* =====================================================================
   * Event listeners
   * =================================================================== */

  function updateSearchButton() {
    var hasQuery = queryInput && queryInput.value.trim().length >= 10;
    btnSearch.disabled = !hasQuery;
  }

  if (queryInput) {
    queryInput.addEventListener('input', updateSearchButton);
  }

  if (btnSearch) {
    btnSearch.addEventListener('click', function () {
      var query = queryInput.value.trim();
      if (query.length < 10) {
        showError('Please enter at least 10 characters for your search query.');
        return;
      }
      runSearchPipeline(query, getFilters());
    });
  }

  if (btnNewSearch) {
    btnNewSearch.addEventListener('click', function () {
      queryInput.value = '';
      btnSearch.disabled = true;
      showLanding();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function handleClearAll() {
    if (!confirm('Delete all recent searches?')) return;
    deleteAllSearchesFromDb().then(function () { renderHistory(getHistory()); });
  }

  if (btnClearHistory) btnClearHistory.addEventListener('click', handleClearAll);
  if (btnClearResultsHistory) btnClearResultsHistory.addEventListener('click', handleClearAll);

  /* =====================================================================
   * Init — load persisted searches from the database
   * =================================================================== */

  loadHistoryFromDb().then(function (history) {
    renderHistory(history);
  });
  updateSearchButton();

})();
