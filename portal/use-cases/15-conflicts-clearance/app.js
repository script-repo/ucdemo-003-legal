/**
 * Conflicts Clearance — Use Case App (self-contained, no ES modules).
 * Form-based input: party names, matter type, opposing parties, related entities,
 * matter description. AI identifies potential conflicts, rates severity, recommends actions.
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
   * Inference — conflicts analysis via chat completions
   * =================================================================== */

  var SYSTEM_PROMPT =
    'You are a legal conflicts clearance AI. Analyze party names and matter details to identify potential conflicts of interest. ' +
    'Respond with JSON: ' +
    '"conflictStatus" (Clear / Potential Conflict / Conflict Found), ' +
    '"conflictScore" (1-100, 100=severe conflict), ' +
    '"summary" (2-3 sentence plain-language summary), ' +
    '"conflicts" (array of { "party", "relationship", "type" (direct/indirect/affiliated), "severity" (Low/Medium/High), "description", "recommendation" }), ' +
    '"relatedMatters" (array of { "matter", "parties", "relevance" }), ' +
    '"clearanceDecision" (string recommendation). ' +
    'Respond ONLY with valid JSON, no markdown fences.';

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

  function runConflictsCheck(formData) {
    var userContent =
      'Analyze the following matter for conflicts of interest:\n\n' +
      'Client/Party Names:\n' + (formData.partyNames || '(none)') + '\n\n' +
      'Matter Type: ' + (formData.matterType || 'Not specified') + '\n\n' +
      'Opposing Parties:\n' + (formData.opposingParties || '(none)') + '\n\n' +
      'Related Entities:\n' + (formData.relatedEntities || '(none)') + '\n\n' +
      'Matter Description:\n' + (formData.matterDescription || '(none)');

    return chatCompletion(
      [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      { maxTokens: 4096 }
    )
      .then(function (response) {
        var raw = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
        if (!raw) throw new Error('No response content from AI');
        var parsed = parseAiJson(raw);
        if (!parsed.conflictStatus) throw new Error('Response missing conflictStatus');
        return parsed;
      });
  }

  /* =====================================================================
   * Database — persistent check storage via /api/db/summaries
   * =================================================================== */

  var DB_API = '/api/db/summaries';
  var USE_CASE = 'uc15';
  var localHistory = [];

  function saveCheckToDb(result, name) {
    var title = name || 'Untitled Check';
    return fetch(DB_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ use_case: USE_CASE, title: title, data: result }),
    })
      .then(function (res) { return res.json(); })
      .then(function (saved) {
        localHistory.unshift({
          id: saved.id,
          title: title,
          createdAt: saved.createdAt,
          data: result,
        });
        if (localHistory.length > 10) localHistory = localHistory.slice(0, 10);
        return saved;
      })
      .catch(function (err) {
        console.warn('Failed to persist check:', err.message);
        localHistory.unshift({
          id: 'local-' + Date.now(),
          title: title,
          createdAt: new Date().toISOString(),
          data: result,
        });
      });
  }

  function loadHistoryFromDb() {
    return fetch(DB_API + '?use_case=' + USE_CASE + '&limit=10')
      .then(function (res) { return res.json(); })
      .then(function (rows) {
        localHistory = rows;
        return rows;
      })
      .catch(function (err) {
        console.warn('Failed to load history:', err.message);
        return localHistory;
      });
  }

  function getHistory() { return localHistory.slice(); }

  function deleteCheckFromDb(id) {
    return fetch(DB_API + '?use_case=' + USE_CASE + '&id=' + id, { method: 'DELETE' })
      .then(function (res) { return res.json(); })
      .then(function () {
        localHistory = localHistory.filter(function (h) { return h.id !== id; });
      })
      .catch(function (err) { console.warn('Failed to delete check:', err.message); });
  }

  function deleteAllChecksFromDb() {
    return fetch(DB_API + '?use_case=' + USE_CASE, { method: 'DELETE' })
      .then(function (res) { return res.json(); })
      .then(function () { localHistory = []; })
      .catch(function (err) { console.warn('Failed to clear history:', err.message); });
  }

  /* =====================================================================
   * DOM references
   * =================================================================== */

  var landingSection = document.getElementById('landing-section');
  var conflictsForm = document.getElementById('conflicts-form');
  var btnRunCheck = document.getElementById('btn-run-check');
  var loadingSection = document.getElementById('loading-section');
  var resultsSection = document.getElementById('results-section');
  var btnNewCheck = document.getElementById('btn-new-check');
  var conflictStatusDisplay = document.getElementById('conflict-status-display');
  var conflictStatusBadge = document.getElementById('conflict-status-badge');
  var conflictScoreEl = document.getElementById('conflict-score');
  var summaryEl = document.getElementById('summary-text');
  var clearanceDecisionEl = document.getElementById('clearance-decision');
  var conflictsTbody = document.getElementById('conflicts-tbody');
  var relatedMattersList = document.getElementById('related-matters-list');
  var historyList = document.getElementById('history-list');
  var resultsHistoryList = document.getElementById('results-history-list');
  var btnClearHistory = document.getElementById('btn-clear-history');
  var btnClearResultsHistory = document.getElementById('btn-clear-results-history');
  var errorBanner = document.getElementById('error-banner');
  var loadingStatus = document.getElementById('loading-status');
  var stageSearch = document.getElementById('stage-search');
  var stageAnalyze = document.getElementById('stage-analyze');
  var stageAssess = document.getElementById('stage-assess');
  var stageRender = document.getElementById('stage-render');
  var allStages = [stageSearch, stageAnalyze, stageAssess, stageRender];

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  function showError(msg) {
    if (!errorBanner) return;
    errorBanner.textContent = msg;
    show(errorBanner);
    setTimeout(function () { hide(errorBanner); }, 8000);
  }

  function resetStages() {
    allStages.forEach(function (s) {
      s.classList.remove('active', 'done');
    });
    if (loadingStatus) loadingStatus.textContent = 'Searching records\u2026';
  }

  function setStage(stage, status, statusText) {
    if (status === 'active') {
      stage.classList.add('active');
      stage.classList.remove('done');
    } else if (status === 'done') {
      stage.classList.remove('active');
      stage.classList.add('done');
    }
    if (statusText && loadingStatus) loadingStatus.textContent = statusText;
  }

  /* =====================================================================
   * Rendering helpers
   * =================================================================== */

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function severityClass(severity) {
    var s = (severity || '').toLowerCase();
    if (s === 'high') return 'risk-high';
    if (s === 'medium') return 'risk-medium';
    return 'risk-low';
  }

  function statusClass(status) {
    var s = (status || '').toLowerCase();
    if (s.indexOf('clear') !== -1) return 'status-clear';
    if (s.indexOf('potential') !== -1) return 'status-potential';
    if (s.indexOf('conflict') !== -1) return 'status-conflict';
    return 'status-clear';
  }

  function renderConflictStatus(result) {
    var status = result.conflictStatus || 'Clear';
    var score = result.conflictScore != null ? result.conflictScore : 0;
    var cls = statusClass(status);

    conflictStatusDisplay.className = 'conflict-status-display ' + cls;
    conflictStatusBadge.textContent = status;
    conflictStatusBadge.className = 'conflict-status-badge ' + cls;
    conflictScoreEl.textContent = 'Conflict score: ' + score + ' / 100';
  }

  function renderSummary(text) { summaryEl.textContent = text || ''; }

  function renderClearanceDecision(text) {
    if (!clearanceDecisionEl) return;
    if (!text || !text.trim()) {
      hide(clearanceDecisionEl);
      return;
    }
    clearanceDecisionEl.innerHTML = '<strong>Clearance Recommendation</strong><p>' + esc(text) + '</p>';
    show(clearanceDecisionEl);
  }

  function renderConflicts(conflicts) {
    conflictsTbody.innerHTML = '';
    (conflicts || []).forEach(function (c) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + esc(c.party) + '</td><td>' + esc(c.relationship) + '</td>' +
        '<td>' + esc(c.type) + '</td>' +
        '<td><span class="risk-badge ' + severityClass(c.severity) + '">' + esc(c.severity) + '</span></td>' +
        '<td>' + esc(c.recommendation) + '</td>';
      conflictsTbody.appendChild(tr);
    });
  }

  function renderRelatedMatters(matters) {
    relatedMattersList.innerHTML = '';
    if (!matters || matters.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: var(--color-text-muted); font-size: 0.9rem; padding: 0.5rem 0;';
      empty.textContent = 'No related matters identified.';
      relatedMattersList.appendChild(empty);
      return;
    }
    matters.forEach(function (m) {
      var card = document.createElement('div');
      card.className = 'related-matter-item';
      card.setAttribute('role', 'listitem');
      card.innerHTML =
        '<div class="matter-name">' + esc(m.matter) + '</div>' +
        '<div class="matter-parties">' + esc(m.parties) + '</div>' +
        '<div class="matter-relevance">' + esc(m.relevance) + '</div>';
      relatedMattersList.appendChild(card);
    });
  }

  function displayResults(result) {
    renderConflictStatus(result);
    renderSummary(result.summary);
    renderClearanceDecision(result.clearanceDecision);
    renderConflicts(result.conflicts);
    renderRelatedMatters(result.relatedMatters);
    showResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderHistoryInto(container, history) {
    container.innerHTML = '';
    if (!history || history.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: #9e9e9e; font-size: 0.9rem; text-align: center; padding: 0.5rem 0;';
      empty.textContent = 'No checks yet. Enter matter details and run a conflicts check.';
      container.appendChild(empty);
      return;
    }
    history.forEach(function (h) {
      var item = document.createElement('div');
      item.className = 'history-item';
      item.setAttribute('role', 'listitem');
      var status = h.data ? (h.data.conflictStatus || '--') : '--';
      var date = new Date(h.createdAt).toLocaleDateString();

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'history-item-delete';
      deleteBtn.setAttribute('aria-label', 'Delete this check');
      deleteBtn.title = 'Delete';
      deleteBtn.innerHTML = '&#10005;';
      deleteBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!confirm('Delete "' + (h.title || 'Untitled') + '"?')) return;
        deleteCheckFromDb(h.id).then(function () { renderHistory(getHistory()); });
      });

      item.innerHTML =
        '<div class="history-item-name">' + esc(h.title) + '</div>' +
        '<div class="history-meta">' +
          '<span class="history-item-date">' + date + '</span>' +
          '<span class="conflict-status-badge ' + statusClass(status) + '">' + esc(status) + '</span>' +
        '</div>';
      item.appendChild(deleteBtn);

      if (h.data) {
        item.title = 'Click to view this check';
        item.addEventListener('click', function () { displayResults(h.data); });
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
    resetStages();
    show(loadingSection);
    hide(resultsSection);
  }

  function showResults() {
    hide(landingSection);
    hide(loadingSection);
    show(resultsSection);
  }

  /* =====================================================================
   * Check pipeline
   * =================================================================== */

  var processing = false;

  function runCheck(formData, title) {
    if (processing) return;
    processing = true;

    hide(errorBanner);
    showLoading();
    setStage(stageSearch, 'active', 'Searching records\u2026');

    runConflictsCheck(formData)
      .then(function (result) {
        setStage(stageSearch, 'done');
        setStage(stageAnalyze, 'done');
        setStage(stageAssess, 'done');
        setStage(stageRender, 'active', 'Rendering\u2026');

        displayResults(result);

        saveCheckToDb(result, title).then(function () {
          renderHistory(getHistory());
        });
        setStage(stageRender, 'done');
      })
      .catch(function (err) {
        console.error('Conflicts check failed:', err);
        showError('Conflicts check failed: ' + err.message);
        showLanding();
      })
      .then(function () { processing = false; });
  }

  /* =====================================================================
   * Form handling
   * =================================================================== */

  conflictsForm.addEventListener('submit', function (e) {
    e.preventDefault();

    var partyNames = document.getElementById('party-names').value.trim();
    if (!partyNames || partyNames.length < 3) {
      showError('Please enter at least one client or party name.');
      return;
    }

    var formData = {
      partyNames: partyNames,
      matterType: document.getElementById('matter-type').value || 'Litigation',
      opposingParties: document.getElementById('opposing-parties').value.trim(),
      relatedEntities: document.getElementById('related-entities').value.trim(),
      matterDescription: document.getElementById('matter-description').value.trim(),
    };

    var firstParty = partyNames.split('\n')[0].trim().substring(0, 40);
    var title = firstParty + ' — ' + formData.matterType;

    runCheck(formData, title);
  });

  /* =====================================================================
   * New check button
   * =================================================================== */

  btnNewCheck.addEventListener('click', function () {
    conflictsForm.reset();
    showLanding();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* =====================================================================
   * Clear history
   * =================================================================== */

  function handleClearAll() {
    if (!confirm('Delete all recent checks?')) return;
    deleteAllChecksFromDb().then(function () { renderHistory(getHistory()); });
  }

  if (btnClearHistory) btnClearHistory.addEventListener('click', handleClearAll);
  if (btnClearResultsHistory) btnClearResultsHistory.addEventListener('click', handleClearAll);

  /* =====================================================================
   * Init — load persisted checks from the database
   * =================================================================== */

  loadHistoryFromDb().then(function (history) {
    renderHistory(history);
  });

})();
