/**
 * Legal Hold Management — Use Case App (self-contained, no ES modules).
 * Form-based input: matter name, matter type, custodian names, data sources,
 * hold reason, scope description. AI generates legal hold notice, custodian list,
 * preservation plan, and reminder schedule.
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
   * Inference — legal hold generation via chat completions
   * =================================================================== */

  var SYSTEM_PROMPT =
    'You are a legal hold management AI. Generate legal hold notices and preservation plans. ' +
    'Respond with JSON: ' +
    '"matterName" (string), ' +
    '"holdNotice" (full text of the hold notice), ' +
    '"custodians" (array of { "name", "department", "dataSources" (array of strings), "status" }), ' +
    '"preservationPlan" (array of { "dataSource", "location", "preservationMethod", "responsible", "deadline" }), ' +
    '"reminderSchedule" (array of { "date", "action", "recipients" }), ' +
    '"riskAssessment" (string). ' +
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

  function generateHold(formData) {
    var matterName = (formData.matterName || '').trim();
    if (!matterName || matterName.length < 3) {
      return Promise.reject(new Error('Please enter a matter name (at least 3 characters).'));
    }

    var userContent =
      'Generate a legal hold notice and preservation plan for the following matter:\n\n' +
      'Matter Name: ' + (formData.matterName || '(none)') + '\n\n' +
      'Matter Type: ' + (formData.matterType || 'Not specified') + '\n\n' +
      'Custodian Names (one per line):\n' + (formData.custodianNames || '(none)') + '\n\n' +
      'Data Sources (one per line):\n' + (formData.dataSources || '(none)') + '\n\n' +
      'Hold Reason:\n' + (formData.holdReason || '(none)') + '\n\n' +
      'Scope Description:\n' + (formData.scopeDescription || '(none)');

    return chatCompletion(
      [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      { maxTokens: 4096 }
    )
      .then(function (response) {
        var raw = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
        if (!raw) throw new Error('No response content from AI');
        var parsed = parseAiJson(raw);
        if (!parsed.holdNotice) throw new Error('Response missing hold notice');
        return parsed;
      });
  }

  /* =====================================================================
   * Database — persistent storage via /api/db/summaries
   * =================================================================== */

  var DB_API = '/api/db/summaries';
  var USE_CASE = 'uc26';
  var localHistory = [];

  function saveHoldToDb(result, name) {
    var title = name || result.matterName || 'Untitled Hold';
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
        console.warn('Failed to persist hold:', err.message);
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

  function deleteHoldFromDb(id) {
    return fetch(DB_API + '?use_case=' + USE_CASE + '&id=' + id, { method: 'DELETE' })
      .then(function (res) { return res.json(); })
      .then(function () {
        localHistory = localHistory.filter(function (h) { return h.id !== id; });
      })
      .catch(function (err) { console.warn('Failed to delete hold:', err.message); });
  }

  function deleteAllHoldsFromDb() {
    return fetch(DB_API + '?use_case=' + USE_CASE, { method: 'DELETE' })
      .then(function (res) { return res.json(); })
      .then(function () { localHistory = []; })
      .catch(function (err) { console.warn('Failed to clear history:', err.message); });
  }

  /* =====================================================================
   * DOM references
   * =================================================================== */

  var landingSection = document.getElementById('landing-section');
  var holdForm = document.getElementById('hold-form');
  var btnGenerate = document.getElementById('btn-generate');
  var loadingSection = document.getElementById('loading-section');
  var resultsSection = document.getElementById('results-section');
  var btnNewHold = document.getElementById('btn-new-hold');
  var holdNoticeEl = document.getElementById('hold-notice');
  var custodianTbody = document.getElementById('custodian-tbody');
  var preservationPlanEl = document.getElementById('preservation-plan');
  var reminderScheduleEl = document.getElementById('reminder-schedule');
  var riskAssessmentEl = document.getElementById('risk-assessment');
  var historyList = document.getElementById('history-list');
  var resultsHistoryList = document.getElementById('results-history-list');
  var btnClearHistory = document.getElementById('btn-clear-history');
  var btnClearResultsHistory = document.getElementById('btn-clear-results-history');
  var errorBanner = document.getElementById('error-banner');
  var loadingStatus = document.getElementById('loading-status');
  var stageDraft = document.getElementById('stage-draft');
  var stageCustodians = document.getElementById('stage-custodians');
  var stagePlan = document.getElementById('stage-plan');
  var stageRender = document.getElementById('stage-render');
  var allStages = [stageDraft, stageCustodians, stagePlan, stageRender];

  function show(el) { if (el) el.classList.remove('hidden'); }
  function hide(el) { if (el) el.classList.add('hidden'); }

  function showError(msg) {
    if (!errorBanner) return;
    errorBanner.textContent = msg;
    show(errorBanner);
    setTimeout(function () { hide(errorBanner); }, 8000);
  }

  function resetStages() {
    allStages.forEach(function (s) {
      if (s) s.classList.remove('active', 'done');
    });
    if (loadingStatus) loadingStatus.textContent = 'Generating hold notice\u2026';
  }

  function setStage(stage, status, statusText) {
    if (!stage) return;
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

  function renderHoldNotice(text) {
    if (!holdNoticeEl) return;
    holdNoticeEl.textContent = text || '';
  }

  function renderCustodians(custodians) {
    if (!custodianTbody) return;
    custodianTbody.innerHTML = '';
    (custodians || []).forEach(function (c) {
      var tr = document.createElement('tr');
      var dataSources = Array.isArray(c.dataSources) ? c.dataSources.join(', ') : (c.dataSources || '');
      tr.innerHTML =
        '<td>' + esc(c.name) + '</td><td>' + esc(c.department || '') + '</td>' +
        '<td>' + esc(dataSources) + '</td><td>' + esc(c.status || 'Pending') + '</td>';
      custodianTbody.appendChild(tr);
    });
  }

  function renderPreservationPlan(plan) {
    if (!preservationPlanEl) return;
    preservationPlanEl.innerHTML = '';
    (plan || []).forEach(function (p) {
      var item = document.createElement('div');
      item.className = 'preservation-item';
      item.setAttribute('role', 'listitem');
      item.innerHTML =
        '<div class="preservation-header">' + esc(p.dataSource) + '</div>' +
        '<div class="preservation-detail"><strong>Location:</strong> ' + esc(p.location || '') + '</div>' +
        '<div class="preservation-detail"><strong>Method:</strong> ' + esc(p.preservationMethod || '') + '</div>' +
        '<div class="preservation-detail"><strong>Responsible:</strong> ' + esc(p.responsible || '') + '</div>' +
        '<div class="preservation-detail"><strong>Deadline:</strong> ' + esc(p.deadline || '') + '</div>';
      preservationPlanEl.appendChild(item);
    });
  }

  function renderReminderSchedule(schedule) {
    if (!reminderScheduleEl) return;
    reminderScheduleEl.innerHTML = '';
    (schedule || []).forEach(function (r) {
      var item = document.createElement('div');
      item.className = 'reminder-item';
      item.setAttribute('role', 'listitem');
      item.innerHTML =
        '<div class="reminder-date">' + esc(r.date) + '</div>' +
        '<div class="reminder-action">' + esc(r.action || '') + '</div>' +
        '<div class="reminder-recipients">Recipients: ' + esc(r.recipients || '') + '</div>';
      reminderScheduleEl.appendChild(item);
    });
  }

  function renderRiskAssessment(text) {
    if (!riskAssessmentEl) return;
    if (!text) {
      hide(riskAssessmentEl);
      return;
    }
    riskAssessmentEl.innerHTML = '<strong>Risk Assessment</strong><p>' + esc(text) + '</p>';
    show(riskAssessmentEl);
  }

  function displayHold(result) {
    renderHoldNotice(result.holdNotice);
    renderCustodians(result.custodians);
    renderPreservationPlan(result.preservationPlan);
    renderReminderSchedule(result.reminderSchedule);
    renderRiskAssessment(result.riskAssessment);
    showResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderHistoryInto(container, history) {
    if (!container) return;
    container.innerHTML = '';
    if (!history || history.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: #9e9e9e; font-size: 0.9rem; text-align: center; padding: 0.5rem 0;';
      empty.textContent = 'No holds yet. Fill the form and generate a legal hold.';
      container.appendChild(empty);
      return;
    }
    history.forEach(function (h) {
      var item = document.createElement('div');
      item.className = 'history-item';
      item.setAttribute('role', 'listitem');
      var date = new Date(h.createdAt).toLocaleDateString();

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'history-item-delete';
      deleteBtn.setAttribute('aria-label', 'Delete this hold');
      deleteBtn.title = 'Delete';
      deleteBtn.innerHTML = '&#10005;';
      deleteBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!confirm('Delete "' + (h.title || 'Untitled') + '"?')) return;
        deleteHoldFromDb(h.id).then(function () { renderHistory(getHistory()); });
      });

      item.innerHTML =
        '<div class="history-item-name">' + esc(h.title) + '</div>' +
        '<div class="history-meta">' +
          '<span class="history-item-date">' + date + '</span>' +
        '</div>';
      item.appendChild(deleteBtn);

      if (h.data) {
        item.title = 'Click to view this hold';
        item.addEventListener('click', function () { displayHold(h.data); });
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
   * Hold generation pipeline
   * =================================================================== */

  var processing = false;

  function runGenerate(formData) {
    if (processing) return;
    processing = true;

    hide(errorBanner);
    showLoading();
    setStage(stageDraft, 'active', 'Drafting hold notice\u2026');

    generateHold(formData)
      .then(function (result) {
        setStage(stageDraft, 'done');
        setStage(stageCustodians, 'done');
        setStage(stagePlan, 'done');
        setStage(stageRender, 'active', 'Rendering results\u2026');

        displayHold(result);

        saveHoldToDb(result, formData.matterName).then(function () {
          renderHistory(getHistory());
        });
        setStage(stageRender, 'done');
      })
      .catch(function (err) {
        console.error('Hold generation failed:', err);
        showError('Hold generation failed: ' + err.message);
        showLanding();
      })
      .then(function () { processing = false; });
  }

  /* =====================================================================
   * Event listeners
   * =================================================================== */

  if (holdForm) {
    holdForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var formData = {
        matterName: document.getElementById('matter-name') && document.getElementById('matter-name').value,
        matterType: document.getElementById('matter-type') && document.getElementById('matter-type').value,
        custodianNames: document.getElementById('custodian-names') && document.getElementById('custodian-names').value,
        dataSources: document.getElementById('data-sources') && document.getElementById('data-sources').value,
        holdReason: document.getElementById('hold-reason') && document.getElementById('hold-reason').value,
        scopeDescription: document.getElementById('scope-description') && document.getElementById('scope-description').value,
      };
      runGenerate(formData);
    });
  }

  if (btnNewHold) {
    btnNewHold.addEventListener('click', function () {
      if (holdForm) holdForm.reset();
      showLanding();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function handleClearAll() {
    if (!confirm('Delete all recent holds?')) return;
    deleteAllHoldsFromDb().then(function () { renderHistory(getHistory()); });
  }

  if (btnClearHistory) btnClearHistory.addEventListener('click', handleClearAll);
  if (btnClearResultsHistory) btnClearResultsHistory.addEventListener('click', handleClearAll);

  /* =====================================================================
   * Init — load persisted holds from the database
   * =================================================================== */

  loadHistoryFromDb().then(function (history) {
    renderHistory(history);
  });

})();
