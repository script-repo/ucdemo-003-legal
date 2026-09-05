/**
 * Timekeeping & Time Entry — Use Case App (self-contained, no ES modules).
 * Form-based: user enters date, activities, matter. AI generates structured
 * time entries. Results persisted to the database for history.
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
   * Inference — time entry generation via chat completions
   * =================================================================== */

  var SYSTEM_PROMPT =
    'You are a legal timekeeping AI. Given a description of an attorney\'s daily activities, generate structured time entries. Respond with JSON: ' +
    'totalHours (number), entries (array of { matter, phase, taskCode, description, duration (in hours as number), billable (boolean) }), ' +
    'summary (brief daily overview), warnings (array of strings for potential issues like exceeding 24h or missing matters). ' +
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

  var MAX_INPUT_CHARS = 8000;

  function truncateText(text, maxChars) {
    if (text.length <= maxChars) return text;
    var headSize = Math.floor(maxChars * 0.6);
    var tailSize = Math.floor(maxChars * 0.3);
    return text.substring(0, headSize) +
      '\n\n[... middle truncated (' + text.length.toLocaleString() + ' chars total) ...]\n\n' +
      text.substring(text.length - tailSize);
  }

  function generateTimeEntries(formData) {
    var activities = (formData.activities || '').trim();
    if (!activities || activities.length < 20) {
      return Promise.reject(new Error('Please describe your activities in more detail (at least 20 characters).'));
    }

    var trimmed = truncateText(activities, MAX_INPUT_CHARS);
    var userContent = 'Date: ' + (formData.date || 'Not specified') + '\n' +
      'Attorney: ' + (formData.attorney || 'Not specified') + '\n' +
      'Matter/Client: ' + (formData.matter || 'Not specified') + '\n\n' +
      'Activities:\n' + trimmed;

    return chatCompletion(
      [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      { maxTokens: 4096 }
    )
      .then(function (response) {
        var raw = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
        if (!raw) throw new Error('No response content from AI');
        var parsed = parseAiJson(raw);
        if (!parsed.entries || !Array.isArray(parsed.entries)) throw new Error('Response missing entries array');
        return parsed;
      });
  }

  /* =====================================================================
   * Database — persistent storage via /api/db/summaries
   * =================================================================== */

  var DB_API = '/api/db/summaries';
  var USE_CASE = 'uc12';
  var localHistory = [];

  function saveToDb(result, name) {
    var title = name || 'Time Entry';
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
        console.warn('Failed to persist:', err.message);
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

  function deleteFromDb(id) {
    return fetch(DB_API + '?use_case=' + USE_CASE + '&id=' + id, { method: 'DELETE' })
      .then(function (res) { return res.json(); })
      .then(function () {
        localHistory = localHistory.filter(function (h) { return h.id !== id; });
      })
      .catch(function (err) { console.warn('Failed to delete:', err.message); });
  }

  function deleteAllFromDb() {
    return fetch(DB_API + '?use_case=' + USE_CASE, { method: 'DELETE' })
      .then(function (res) { return res.json(); })
      .then(function () { localHistory = []; })
      .catch(function (err) { console.warn('Failed to clear history:', err.message); });
  }

  /* =====================================================================
   * DOM references
   * =================================================================== */

  var landingSection = document.getElementById('landing-section');
  var timekeepingForm = document.getElementById('timekeeping-form');
  var inputDate = document.getElementById('input-date');
  var inputAttorney = document.getElementById('input-attorney');
  var inputActivities = document.getElementById('input-activities');
  var inputMatter = document.getElementById('input-matter');
  var btnGenerate = document.getElementById('btn-generate');
  var loadingSection = document.getElementById('loading-section');
  var resultsSection = document.getElementById('results-section');
  var btnNewEntry = document.getElementById('btn-new-entry');
  var totalHoursEl = document.getElementById('total-hours');
  var summaryEl = document.getElementById('summary-text');
  var warningsList = document.getElementById('warnings-list');
  var entriesTbody = document.getElementById('entries-tbody');
  var btnAddEntry = document.getElementById('btn-add-entry');
  var historyList = document.getElementById('history-list');
  var resultsHistoryList = document.getElementById('results-history-list');
  var btnClearHistory = document.getElementById('btn-clear-history');
  var btnClearResultsHistory = document.getElementById('btn-clear-results-history');
  var errorBanner = document.getElementById('error-banner');
  var loadingStatus = document.getElementById('loading-status');
  var stageAnalyze = document.getElementById('stage-analyze');
  var stageMatch = document.getElementById('stage-match');
  var stageGenerate = document.getElementById('stage-generate');
  var stageDone = document.getElementById('stage-done');
  var allStages = [stageAnalyze, stageMatch, stageGenerate, stageDone];

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
    if (loadingStatus) loadingStatus.textContent = 'Analyzing activities\u2026';
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

  function formatDuration(hours) {
    if (typeof hours !== 'number' || isNaN(hours)) return '--';
    if (hours < 1) return (hours * 60).toFixed(0) + 'm';
    var h = Math.floor(hours);
    var m = Math.round((hours - h) * 60);
    return m > 0 ? h + 'h ' + m + 'm' : h + 'h';
  }

  function renderTotalHours(hours) {
    if (totalHoursEl) {
      totalHoursEl.textContent = typeof hours === 'number' && !isNaN(hours)
        ? hours.toFixed(2) + ' hrs'
        : '--';
    }
  }

  function renderEntries(entries) {
    if (!entriesTbody) return;
    entriesTbody.innerHTML = '';
    (entries || []).forEach(function (e) {
      var tr = document.createElement('tr');
      var phaseTask = [e.phase, e.taskCode].filter(Boolean).join(' / ') || '--';
      var status = e.billable === false ? 'Non-billable' : 'Billable';
      tr.innerHTML =
        '<td class="editable-cell">' + esc(e.matter || '--') + '</td>' +
        '<td class="editable-cell">' + esc(phaseTask) + '</td>' +
        '<td class="editable-cell">' + esc(e.description || '--') + '</td>' +
        '<td class="duration-cell">' + esc(formatDuration(e.duration)) + '</td>' +
        '<td>' + esc(status) + '</td>';
      entriesTbody.appendChild(tr);
    });
  }

  function renderWarnings(warnings) {
    if (!warningsList) return;
    if (!warnings || warnings.length === 0) {
      hide(warningsList);
      return;
    }
    warningsList.innerHTML = '<ul>' + warnings.map(function (w) {
      return '<li>' + esc(w) + '</li>';
    }).join('') + '</ul>';
    show(warningsList);
  }

  function displayResults(result) {
    renderTotalHours(result.totalHours);
    renderWarnings(result.warnings);
    if (summaryEl) summaryEl.textContent = result.summary || '';
    renderEntries(result.entries);
    showResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderHistoryInto(container, history) {
    container.innerHTML = '';
    if (!history || history.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: #9e9e9e; font-size: 0.9rem; text-align: center; padding: 0.5rem 0;';
      empty.textContent = 'No submissions yet. Enter your activities to get started.';
      container.appendChild(empty);
      return;
    }
    history.forEach(function (h) {
      var item = document.createElement('div');
      item.className = 'history-item';
      item.setAttribute('role', 'listitem');
      var totalH = h.data ? (h.data.totalHours || 0) : 0;
      var date = new Date(h.createdAt).toLocaleDateString();

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'history-item-delete';
      deleteBtn.setAttribute('aria-label', 'Delete this submission');
      deleteBtn.title = 'Delete';
      deleteBtn.innerHTML = '&#10005;';
      deleteBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!confirm('Delete "' + (h.title || 'Untitled') + '"?')) return;
        deleteFromDb(h.id).then(function () { renderHistory(getHistory()); });
      });

      item.innerHTML =
        '<div class="history-item-name">' + esc(h.title) + '</div>' +
        '<div class="history-meta">' +
          '<span class="history-item-date">' + date + '</span>' +
          (totalH ? '<span>' + totalH.toFixed(1) + ' hrs</span>' : '') +
        '</div>';
      item.appendChild(deleteBtn);

      if (h.data) {
        item.title = 'Click to view this submission';
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
   * Generation pipeline
   * =================================================================== */

  var processing = false;

  function runGeneration(formData) {
    if (processing) return;
    processing = true;

    hide(errorBanner);

    var alreadyLoading = !loadingSection.classList.contains('hidden');
    if (!alreadyLoading) showLoading();

    setStage(stageAnalyze, 'active', 'Analyzing activities\u2026');

    generateTimeEntries(formData)
      .then(function (result) {
        setStage(stageAnalyze, 'done');
        setStage(stageMatch, 'done');
        setStage(stageGenerate, 'active', 'Generating entries\u2026');
        setStage(stageGenerate, 'done');
        setStage(stageDone, 'active', 'Done');
        setStage(stageDone, 'done');

        displayResults(result);

        var title = (formData.date || '') + ' - ' + (formData.matter || 'Time Entry');
        saveToDb(result, title).then(function () {
          renderHistory(getHistory());
        });
      })
      .catch(function (err) {
        console.error('Generation failed:', err);
        showError('Generation failed: ' + err.message);
        showLanding();
      })
      .then(function () { processing = false; });
  }

  /* =====================================================================
   * Set default date to today
   * =================================================================== */

  function setDefaultDate() {
    if (inputDate && !inputDate.value) {
      var today = new Date();
      var y = today.getFullYear();
      var m = String(today.getMonth() + 1).padStart(2, '0');
      var d = String(today.getDate()).padStart(2, '0');
      inputDate.value = y + '-' + m + '-' + d;
    }
  }

  /* =====================================================================
   * Event listeners
   * =================================================================== */

  timekeepingForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var formData = {
      date: inputDate.value,
      attorney: inputAttorney.value.trim(),
      activities: inputActivities.value.trim(),
      matter: inputMatter.value.trim(),
    };
    if (formData.activities.length < 20) {
      showError('Please describe your activities in more detail (at least 20 characters).');
      return;
    }
    runGeneration(formData);
  });

  btnNewEntry.addEventListener('click', function () {
    inputDate.value = '';
    inputAttorney.value = '';
    inputActivities.value = '';
    inputMatter.value = '';
    setDefaultDate();
    showLanding();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  if (btnAddEntry) {
    btnAddEntry.addEventListener('click', function () {
      showLanding();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* =====================================================================
   * Clear history
   * =================================================================== */

  function handleClearAll() {
    if (!confirm('Delete all recent submissions?')) return;
    deleteAllFromDb().then(function () { renderHistory(getHistory()); });
  }

  if (btnClearHistory) btnClearHistory.addEventListener('click', handleClearAll);
  if (btnClearResultsHistory) btnClearResultsHistory.addEventListener('click', handleClearAll);

  /* =====================================================================
   * Init — set default date, load persisted submissions
   * =================================================================== */

  setDefaultDate();
  loadHistoryFromDb().then(function (history) {
    renderHistory(history);
  });

})();
