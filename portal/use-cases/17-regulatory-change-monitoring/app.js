/**
 * Regulatory Change Monitoring — Use Case App (self-contained, no ES modules).
 * Form-based scan: practice area, jurisdiction, time period, keywords.
 * Sends criteria to Nutanix AI for regulatory change analysis.
 * Results persisted to database for history.
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
   * Inference — regulatory scan via chat completions
   * =================================================================== */

  var SYSTEM_PROMPT =
    'You are a regulatory monitoring AI. Analyze regulatory changes relevant to the user\'s practice area and criteria. ' +
    'Respond with a JSON object containing: ' +
    '"alertCount" (number), "summary" (2-3 sentence overview), ' +
    '"changes" (array of objects, each with: title, agency, jurisdiction, effectiveDate, impactLevel (High/Medium/Low), description, affectedAreas (array of strings), actionRequired, deadline), ' +
    '"recommendations" (array of strings). ' +
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

  function scanRegulatory(formData) {
    var practiceArea = formData.practiceArea || '';
    var jurisdiction = formData.jurisdiction || '';
    var timePeriod = formData.timePeriod || 'Last Month';
    var keywords = formData.keywords || '';

    if (!practiceArea || practiceArea.trim() === '') {
      return Promise.reject(new Error('Please select a practice area.'));
    }

    var userContent =
      'Analyze regulatory changes for the following criteria:\n' +
      '- Practice area: ' + practiceArea + '\n' +
      '- Jurisdiction: ' + (jurisdiction || 'Not specified') + '\n' +
      '- Time period: ' + timePeriod + '\n' +
      (keywords ? '- Specific topics/keywords: ' + keywords + '\n' : '') +
      '\nReturn a JSON object with alertCount, summary, changes (array), and recommendations (array).';

    return chatCompletion(
      [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      { maxTokens: 4096 }
    )
      .then(function (response) {
        var raw = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
        if (!raw) throw new Error('No response content from AI');
        var parsed = parseAiJson(raw);
        if (parsed.changes === undefined) parsed.changes = [];
        if (parsed.recommendations === undefined) parsed.recommendations = [];
        if (parsed.alertCount === undefined) parsed.alertCount = (parsed.changes || []).length;
        if (!parsed.summary) parsed.summary = 'Regulatory scan completed. Review the changes below.';
        return parsed;
      });
  }

  /* =====================================================================
   * Database — persistent scan storage via /api/db/summaries
   * =================================================================== */

  var DB_API = '/api/db/summaries';
  var USE_CASE = 'uc17';
  var localHistory = [];

  function saveScanToDb(result, name) {
    var title = name || 'Regulatory Scan';
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
        console.warn('Failed to persist scan:', err.message);
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

  function deleteScanFromDb(id) {
    return fetch(DB_API + '?use_case=' + USE_CASE + '&id=' + id, { method: 'DELETE' })
      .then(function (res) { return res.json(); })
      .then(function () {
        localHistory = localHistory.filter(function (h) { return h.id !== id; });
      })
      .catch(function (err) { console.warn('Failed to delete scan:', err.message); });
  }

  function deleteAllScansFromDb() {
    return fetch(DB_API + '?use_case=' + USE_CASE, { method: 'DELETE' })
      .then(function (res) { return res.json(); })
      .then(function () { localHistory = []; })
      .catch(function (err) { console.warn('Failed to clear history:', err.message); });
  }

  /* =====================================================================
   * DOM references
   * =================================================================== */

  var landingSection = document.getElementById('landing-section');
  var scanForm = document.getElementById('scan-form');
  var practiceAreaSelect = document.getElementById('practice-area');
  var jurisdictionInput = document.getElementById('jurisdiction');
  var timePeriodSelect = document.getElementById('time-period');
  var keywordsTextarea = document.getElementById('keywords');
  var btnScan = document.getElementById('btn-scan');
  var loadingSection = document.getElementById('loading-section');
  var resultsSection = document.getElementById('results-section');
  var btnNewScan = document.getElementById('btn-new-scan');
  var alertCountEl = document.getElementById('alert-count');
  var summaryEl = document.getElementById('summary-text');
  var changesList = document.getElementById('changes-list');
  var recommendationsList = document.getElementById('recommendations-list');
  var historyList = document.getElementById('history-list');
  var resultsHistoryList = document.getElementById('results-history-list');
  var btnClearHistory = document.getElementById('btn-clear-history');
  var btnClearResultsHistory = document.getElementById('btn-clear-results-history');
  var errorBanner = document.getElementById('error-banner');
  var loadingStatus = document.getElementById('loading-status');
  var stageScan = document.getElementById('stage-scan');
  var stageAnalyze = document.getElementById('stage-analyze');
  var stageImpact = document.getElementById('stage-impact');
  var stageRender = document.getElementById('stage-render');
  var allStages = [stageScan, stageAnalyze, stageImpact, stageRender];

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
    if (loadingStatus) loadingStatus.textContent = 'Scanning sources\u2026';
  }

  function setStage(stage, status, statusText) {
    if (stage) {
      if (status === 'active') {
        stage.classList.add('active');
        stage.classList.remove('done');
      } else if (status === 'done') {
        stage.classList.remove('active');
        stage.classList.add('done');
      }
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

  function impactClass(level) {
    var l = (level || '').toLowerCase();
    if (l === 'high') return 'impact-high';
    if (l === 'medium') return 'impact-medium';
    return 'impact-low';
  }

  function renderAlertCount(count) {
    if (alertCountEl) alertCountEl.textContent = String(count || 0);
  }

  function renderSummary(text) {
    if (summaryEl) summaryEl.textContent = text || '';
  }

  function renderChanges(changes) {
    if (!changesList) return;
    changesList.innerHTML = '';
    (changes || []).forEach(function (c) {
      var card = document.createElement('div');
      var impact = (c.impactLevel || 'Low').toLowerCase();
      card.className = 'change-card impact-' + impact;
      card.setAttribute('role', 'listitem');

      var meta = [];
      if (c.agency) meta.push(esc(c.agency));
      if (c.jurisdiction) meta.push(esc(c.jurisdiction));
      if (c.effectiveDate) meta.push(esc(c.effectiveDate));

      var affectedHtml = '';
      if (c.affectedAreas && c.affectedAreas.length > 0) {
        affectedHtml = '<div class="change-card-meta">Affected areas: ' + esc((c.affectedAreas || []).join(', ')) + '</div>';
      }

      var actionHtml = '';
      if (c.actionRequired) {
        var deadline = c.deadline ? ' Deadline: ' + esc(c.deadline) + '.' : '';
        actionHtml = '<div class="change-card-action"><strong>Action required:</strong> ' + esc(c.actionRequired) + deadline + '</div>';
      }

      card.innerHTML =
        '<div class="change-card-header">' +
          '<h4 class="change-card-title">' + esc(c.title || 'Untitled') + '</h4>' +
          '<span class="impact-badge ' + impactClass(c.impactLevel) + '">' + esc(c.impactLevel || 'Low') + '</span>' +
        '</div>' +
        '<div class="change-card-meta">' + meta.join(' &bull; ') + '</div>' +
        affectedHtml +
        '<p class="change-card-description">' + esc(c.description || '') + '</p>' +
        actionHtml;
      changesList.appendChild(card);
    });
  }

  function renderRecommendations(recs) {
    if (!recommendationsList) return;
    recommendationsList.innerHTML = '';
    (recs || []).forEach(function (r) {
      var item = document.createElement('div');
      item.className = 'recommendation-item';
      item.setAttribute('role', 'listitem');
      item.innerHTML = esc(typeof r === 'string' ? r : (r && r.text ? r.text : String(r || '')));
      recommendationsList.appendChild(item);
    });
  }

  function displayResults(result) {
    renderAlertCount(result.alertCount);
    renderSummary(result.summary);
    renderChanges(result.changes);
    renderRecommendations(result.recommendations);
    showResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderHistoryInto(container, history) {
    if (!container) return;
    container.innerHTML = '';
    if (!history || history.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: #9e9e9e; font-size: 0.9rem; text-align: center; padding: 0.5rem 0;';
      empty.textContent = 'No scans yet. Run a scan to get started.';
      container.appendChild(empty);
      return;
    }
    history.forEach(function (h) {
      var item = document.createElement('div');
      item.className = 'history-item';
      item.setAttribute('role', 'listitem');
      var count = h.data ? (h.data.alertCount || (h.data.changes && h.data.changes.length) || 0) : 0;
      var date = new Date(h.createdAt).toLocaleDateString();

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'history-item-delete';
      deleteBtn.setAttribute('aria-label', 'Delete this scan');
      deleteBtn.title = 'Delete';
      deleteBtn.innerHTML = '&#10005;';
      deleteBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!confirm('Delete "' + (h.title || 'Scan') + '"?')) return;
        deleteScanFromDb(h.id).then(function () { renderHistory(getHistory()); });
      });

      item.innerHTML =
        '<div class="history-item-name">' + esc(h.title) + '</div>' +
        '<div class="history-meta">' +
          '<span class="history-item-date">' + date + '</span>' +
          (count ? '<span class="impact-badge impact-medium">' + count + ' alerts</span>' : '') +
        '</div>';
      item.appendChild(deleteBtn);

      if (h.data) {
        item.title = 'Click to view this scan';
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
   * Scan pipeline
   * =================================================================== */

  var processing = false;

  function runScan(formData) {
    if (processing) return;
    processing = true;

    hide(errorBanner);

    var alreadyLoading = !loadingSection.classList.contains('hidden');
    if (!alreadyLoading) showLoading();

    setStage(stageScan, 'active', 'Scanning sources\u2026');

    scanRegulatory(formData)
      .then(function (result) {
        setStage(stageScan, 'done');
        setStage(stageAnalyze, 'active', 'Analyzing changes\u2026');
        setStage(stageAnalyze, 'done');
        setStage(stageImpact, 'active', 'Assessing impact\u2026');
        setStage(stageImpact, 'done');
        setStage(stageRender, 'active', 'Rendering\u2026');

        displayResults(result);

        var title = formData.practiceArea + ' — ' + (formData.timePeriod || '');
        saveScanToDb(result, title).then(function () {
          renderHistory(getHistory());
        });
        setStage(stageRender, 'done');
      })
      .catch(function (err) {
        console.error('Scan failed:', err);
        showError('Scan failed: ' + err.message);
        showLanding();
      })
      .then(function () { processing = false; });
  }

  /* =====================================================================
   * Event listeners
   * =================================================================== */

  scanForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var formData = {
      practiceArea: practiceAreaSelect.value.trim(),
      jurisdiction: jurisdictionInput.value.trim(),
      timePeriod: timePeriodSelect.value,
      keywords: keywordsTextarea.value.trim(),
    };
    runScan(formData);
  });

  btnNewScan.addEventListener('click', function () {
    practiceAreaSelect.value = '';
    jurisdictionInput.value = '';
    timePeriodSelect.value = 'Last Month';
    keywordsTextarea.value = '';
    showLanding();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  function handleClearAll() {
    if (!confirm('Delete all recent scans?')) return;
    deleteAllScansFromDb().then(function () { renderHistory(getHistory()); });
  }

  if (btnClearHistory) btnClearHistory.addEventListener('click', handleClearAll);
  if (btnClearResultsHistory) btnClearResultsHistory.addEventListener('click', handleClearAll);

  /* =====================================================================
   * Init — load persisted scans from the database
   * =================================================================== */

  loadHistoryFromDb().then(function (history) {
    renderHistory(history);
  });

})();
