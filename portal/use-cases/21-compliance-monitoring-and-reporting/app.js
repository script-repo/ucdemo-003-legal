/**
 * Compliance Monitoring and Reporting — Use Case App (self-contained, no ES modules).
 * Form-based input: organization, framework, period, known issues, recent changes.
 * Sends to Nutanix AI for compliance assessment. Results: score, gaps, action items.
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
   * Inference — compliance assessment via chat completions
   * =================================================================== */

  var SYSTEM_PROMPT =
    'You are a compliance monitoring AI. Assess organizational compliance. Respond with JSON: ' +
    'complianceScore (1-100), complianceStatus (Compliant/Partial/Non-Compliant), summary, ' +
    'gaps (array of {area, requirement, currentState, severity (Critical/High/Medium/Low), recommendation}), ' +
    'actionItems (array of {title, priority (Urgent/High/Medium/Low), deadline, owner, description}), ' +
    'overallRisk (string). Respond ONLY with valid JSON.';

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

  function runComplianceAssessment(formData) {
    var org = (formData.organization || '').trim();
    var framework = (formData.framework || '').trim();
    var period = (formData.period || '').trim();
    var knownIssues = (formData.knownIssues || '').trim();
    var recentChanges = (formData.recentChanges || '').trim();

    if (!org || !framework || !period) {
      return Promise.reject(new Error('Organization, framework, and reporting period are required.'));
    }

    var userContent = 'Assess compliance for:\n\n' +
      'Organization/Department: ' + org + '\n' +
      'Compliance Framework: ' + framework + '\n' +
      'Reporting Period: ' + period + '\n\n';

    if (knownIssues) {
      userContent += 'Known Issues:\n' + truncateText(knownIssues, 2000) + '\n\n';
    }
    if (recentChanges) {
      userContent += 'Recent Changes:\n' + truncateText(recentChanges, 2000) + '\n\n';
    }

    return chatCompletion(
      [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      { maxTokens: 4096 }
    )
      .then(function (response) {
        var raw = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
        if (!raw) throw new Error('No response content from AI');
        var parsed = parseAiJson(raw);
        if (parsed.complianceScore === undefined || !parsed.summary) throw new Error('Response missing required fields');
        return parsed;
      });
  }

  /* =====================================================================
   * Database — persistent assessment storage via /api/db/summaries
   * =================================================================== */

  var DB_API = '/api/db/summaries';
  var USE_CASE = 'uc21';
  var localHistory = [];

  function saveAssessmentToDb(result, name) {
    var title = name || 'Untitled Assessment';
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
        console.warn('Failed to persist assessment:', err.message);
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

  function deleteAssessmentFromDb(id) {
    return fetch(DB_API + '?use_case=' + USE_CASE + '&id=' + id, { method: 'DELETE' })
      .then(function (res) { return res.json(); })
      .then(function () {
        localHistory = localHistory.filter(function (h) { return h.id !== id; });
      })
      .catch(function (err) { console.warn('Failed to delete assessment:', err.message); });
  }

  function deleteAllAssessmentsFromDb() {
    return fetch(DB_API + '?use_case=' + USE_CASE, { method: 'DELETE' })
      .then(function (res) { return res.json(); })
      .then(function () { localHistory = []; })
      .catch(function (err) { console.warn('Failed to clear history:', err.message); });
  }

  /* =====================================================================
   * DOM references
   * =================================================================== */

  var landingSection = document.getElementById('landing-section');
  var complianceForm = document.getElementById('compliance-form');
  var btnAssess = document.getElementById('btn-assess');
  var loadingSection = document.getElementById('loading-section');
  var resultsSection = document.getElementById('results-section');
  var btnNewAnalysis = document.getElementById('btn-new-analysis');
  var complianceScoreEl = document.getElementById('compliance-score');
  var complianceStatusEl = document.getElementById('compliance-status');
  var summaryEl = document.getElementById('summary-text');
  var overallRiskText = document.getElementById('overall-risk-text');
  var overallRiskCard = document.getElementById('overall-risk-card');
  var gapTbody = document.getElementById('gap-tbody');
  var actionItemsList = document.getElementById('action-items-list');
  var historyList = document.getElementById('history-list');
  var resultsHistoryList = document.getElementById('results-history-list');
  var btnClearHistory = document.getElementById('btn-clear-history');
  var btnClearResultsHistory = document.getElementById('btn-clear-results-history');
  var errorBanner = document.getElementById('error-banner');
  var loadingStatus = document.getElementById('loading-status');
  var stageSend = document.getElementById('stage-send');
  var stageAnalyze = document.getElementById('stage-analyze');
  var stageRender = document.getElementById('stage-render');
  var allStages = [stageSend, stageAnalyze, stageRender];

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
    if (loadingStatus) loadingStatus.textContent = 'Preparing assessment\u2026';
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

  function statusClass(status) {
    var s = (status || '').toLowerCase();
    if (s === 'compliant') return 'status-compliant';
    if (s === 'partial') return 'status-partial';
    return 'status-non-compliant';
  }

  function severityClass(sev) {
    var s = (sev || '').toLowerCase();
    if (s === 'critical') return 'severity-critical';
    if (s === 'high') return 'severity-high';
    if (s === 'medium') return 'severity-medium';
    return 'severity-low';
  }

  function priorityClass(pri) {
    var p = (pri || '').toLowerCase();
    if (p === 'urgent') return 'priority-urgent';
    if (p === 'high') return 'priority-high';
    if (p === 'medium') return 'priority-medium';
    return 'priority-low';
  }

  function renderComplianceScore(score, status) {
    complianceScoreEl.textContent = score;
    complianceStatusEl.textContent = status || 'Unknown';
    var container = complianceScoreEl.closest('.compliance-score-display');
    if (container) container.className = 'compliance-score-display ' + statusClass(status);
    complianceStatusEl.className = 'compliance-status-badge ' + statusClass(status);
  }

  function renderSummary(text) { summaryEl.textContent = text; }

  function renderOverallRisk(text) {
    if (!overallRiskText) return;
    overallRiskText.textContent = text || '';
    if (overallRiskCard) {
      if (text) overallRiskCard.classList.remove('hidden');
      else overallRiskCard.classList.add('hidden');
    }
  }

  function renderGaps(gaps) {
    gapTbody.innerHTML = '';
    (gaps || []).forEach(function (g) {
      var tr = document.createElement('tr');
      var sev = (g.severity || 'Low').toLowerCase();
      var badgeClass = 'severity-' + sev;
      tr.innerHTML =
        '<td>' + esc(g.area) + '</td>' +
        '<td>' + esc(g.requirement) + '</td>' +
        '<td>' + esc(g.currentState) + '</td>' +
        '<td><span class="risk-badge ' + badgeClass + '">' + esc(g.severity) + '</span></td>' +
        '<td>' + esc(g.recommendation) + '</td>';
      gapTbody.appendChild(tr);
    });
  }

  function renderActionItems(items) {
    actionItemsList.innerHTML = '';
    (items || []).forEach(function (a) {
      var card = document.createElement('div');
      card.className = 'action-item-card ' + priorityClass(a.priority);
      card.setAttribute('role', 'listitem');
      var meta = [];
      if (a.priority) meta.push('<span class="risk-badge ' + priorityClass(a.priority) + '">' + esc(a.priority) + '</span>');
      if (a.deadline) meta.push('Deadline: ' + esc(a.deadline));
      if (a.owner) meta.push('Owner: ' + esc(a.owner));
      card.innerHTML =
        '<div class="action-item-header">' +
          '<h4 class="action-item-title">' + esc(a.title) + '</h4>' +
        '</div>' +
        (meta.length ? '<div class="action-item-meta">' + meta.join(' &bull; ') + '</div>' : '') +
        '<p class="action-item-desc">' + esc(a.description) + '</p>';
      actionItemsList.appendChild(card);
    });
  }

  function displayAssessment(result) {
    renderComplianceScore(result.complianceScore, result.complianceStatus);
    renderSummary(result.summary);
    renderOverallRisk(result.overallRisk);
    renderGaps(result.gaps);
    renderActionItems(result.actionItems);
    showResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderHistoryInto(container, history) {
    container.innerHTML = '';
    if (!history || history.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: #9e9e9e; font-size: 0.9rem; text-align: center; padding: 0.5rem 0;';
      empty.textContent = 'No assessments yet. Complete the form to run an assessment.';
      container.appendChild(empty);
      return;
    }
    history.forEach(function (h) {
      var item = document.createElement('div');
      item.className = 'history-item';
      item.setAttribute('role', 'listitem');
      var score = h.data ? (h.data.complianceScore || 0) : 0;
      var status = h.data ? (h.data.complianceStatus || '') : '';
      var date = new Date(h.createdAt).toLocaleDateString();

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'history-item-delete';
      deleteBtn.setAttribute('aria-label', 'Delete this assessment');
      deleteBtn.title = 'Delete';
      deleteBtn.innerHTML = '&#10005;';
      deleteBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!confirm('Delete "' + (h.title || 'Untitled') + '"?')) return;
        deleteAssessmentFromDb(h.id).then(function () { renderHistory(getHistory()); });
      });

      item.innerHTML =
        '<div class="history-item-name">' + esc(h.title) + '</div>' +
        '<div class="history-meta">' +
          '<span class="history-item-date">' + date + '</span>' +
          (score ? '<span class="compliance-status-badge ' + statusClass(status) + '">' + score + '</span>' : '') +
        '</div>';
      item.appendChild(deleteBtn);

      if (h.data) {
        item.title = 'Click to view this assessment';
        item.addEventListener('click', function () { displayAssessment(h.data); });
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
   * Assessment pipeline
   * =================================================================== */

  var processing = false;

  function runAssessment(formData) {
    if (processing) return;
    processing = true;

    hide(errorBanner);

    var alreadyLoading = !loadingSection.classList.contains('hidden');
    if (!alreadyLoading) showLoading();

    setStage(stageSend, 'active', 'Sending to AI\u2026');

    runComplianceAssessment(formData)
      .then(function (result) {
        setStage(stageSend, 'done');
        setStage(stageAnalyze, 'done');
        setStage(stageRender, 'active', 'Rendering results\u2026');

        displayAssessment(result);

        var title = formData.organization + ' — ' + formData.framework + ' (' + formData.period + ')';
        saveAssessmentToDb(result, title).then(function () {
          renderHistory(getHistory());
        });
        setStage(stageRender, 'done');
      })
      .catch(function (err) {
        console.error('Assessment failed:', err);
        showError('Assessment failed: ' + err.message);
        showLanding();
      })
      .then(function () { processing = false; });
  }

  /* =====================================================================
   * Event listeners
   * =================================================================== */

  complianceForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var formData = {
      organization: document.getElementById('org-input').value,
      framework: document.getElementById('framework-select').value,
      period: document.getElementById('period-input').value,
      knownIssues: document.getElementById('known-issues').value,
      recentChanges: document.getElementById('recent-changes').value,
    };
    runAssessment(formData);
  });

  btnNewAnalysis.addEventListener('click', function () {
    complianceForm.reset();
    showLanding();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  function handleClearAll() {
    if (!confirm('Delete all recent assessments?')) return;
    deleteAllAssessmentsFromDb().then(function () { renderHistory(getHistory()); });
  }

  if (btnClearHistory) btnClearHistory.addEventListener('click', handleClearAll);
  if (btnClearResultsHistory) btnClearResultsHistory.addEventListener('click', handleClearAll);

  /* =====================================================================
   * Init — load persisted assessments from the database
   * =================================================================== */

  loadHistoryFromDb().then(function (history) {
    renderHistory(history);
  });

})();
