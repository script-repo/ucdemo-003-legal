/**
 * Litigation Strategy & Predictive Analytics — Use Case App (self-contained, no ES modules).
 * Form-based case entry. Sends case details to the Nutanix AI endpoint via the local proxy
 * for strategy analysis and outcome prediction. Results are persisted to the database for history.
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
   * Inference — litigation strategy analysis via chat completions
   * =================================================================== */

  var SYSTEM_PROMPT =
    'You are a litigation strategy AI. Analyze case details and predict outcomes. Respond with JSON: ' +
    'winProbability (1-100), confidenceLevel (Low/Medium/High), summary, ' +
    'strategies (array of {title, description, pros (array), cons (array), recommendedAction}), ' +
    'riskFactors (array of {factor, severity (Low/Medium/High), mitigation}), ' +
    'timeline (array of {phase, duration, description, keyActions}), ' +
    'estimatedCosts (object with {discovery, motions, trial, total}). ' +
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
      '\n\n[... truncated (' + text.length.toLocaleString() + ' chars total) ...]\n\n' +
      text.substring(text.length - tailSize);
  }

  function analyzeCase(formData) {
    var caseType = (formData.caseType || '').trim();
    var jurisdiction = (formData.jurisdiction || '').trim();
    var description = truncateText((formData.description || '').trim(), 2000);
    var keyFacts = truncateText((formData.keyFacts || '').trim(), 2000);
    var opposingCounsel = truncateText((formData.opposingCounsel || '').trim(), 500);
    var desiredOutcome = truncateText((formData.desiredOutcome || '').trim(), 500);

    if (!caseType || !jurisdiction || description.length < 30) {
      return Promise.reject(new Error('Please provide case type, jurisdiction, and at least a brief case description (30+ characters).'));
    }

    var userContent =
      'Case Type: ' + caseType + '\n' +
      'Jurisdiction: ' + jurisdiction + '\n\n' +
      'Case Description:\n' + description + '\n\n' +
      'Key Facts:\n' + (keyFacts || '(none provided)') + '\n\n' +
      'Opposing Counsel Notes:\n' + (opposingCounsel || '(none provided)') + '\n\n' +
      'Desired Outcome:\n' + (desiredOutcome || '(none provided)') + '\n\n' +
      'Analyze this case and provide a litigation strategy with outcome prediction.';

    return chatCompletion(
      [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      { maxTokens: 4096 }
    )
      .then(function (response) {
        var raw = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
        if (!raw) throw new Error('No response content from AI');
        var parsed = parseAiJson(raw);
        if (parsed.winProbability === undefined || !parsed.summary) throw new Error('Response missing required fields');
        return parsed;
      });
  }

  /* =====================================================================
   * Database — persistent analysis storage via /api/db/summaries
   * =================================================================== */

  var DB_API = '/api/db/summaries';
  var USE_CASE = 'uc18';
  var localHistory = [];

  function saveAnalysisToDb(result, name) {
    var title = name || 'Untitled Case';
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
        console.warn('Failed to persist analysis:', err.message);
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

  function deleteAnalysisFromDb(id) {
    return fetch(DB_API + '?use_case=' + USE_CASE + '&id=' + id, { method: 'DELETE' })
      .then(function (res) { return res.json(); })
      .then(function () {
        localHistory = localHistory.filter(function (h) { return h.id !== id; });
      })
      .catch(function (err) { console.warn('Failed to delete analysis:', err.message); });
  }

  function deleteAllAnalysesFromDb() {
    return fetch(DB_API + '?use_case=' + USE_CASE, { method: 'DELETE' })
      .then(function (res) { return res.json(); })
      .then(function () { localHistory = []; })
      .catch(function (err) { console.warn('Failed to clear history:', err.message); });
  }

  /* =====================================================================
   * DOM references
   * =================================================================== */

  var landingSection = document.getElementById('landing-section');
  var caseForm = document.getElementById('case-form');
  var btnAnalyze = document.getElementById('btn-analyze');
  var loadingSection = document.getElementById('loading-section');
  var resultsSection = document.getElementById('results-section');
  var btnNewAnalysis = document.getElementById('btn-new-analysis');
  var winProbabilityEl = document.getElementById('win-probability');
  var confidenceLevelEl = document.getElementById('confidence-level');
  var probabilityDisplay = document.querySelector('.probability-display');
  var summaryEl = document.getElementById('summary-text');
  var strategiesList = document.getElementById('strategies-list');
  var riskFactorsTbody = document.getElementById('risk-factors-tbody');
  var timelineList = document.getElementById('timeline-list');
  var estimatedCostsEl = document.getElementById('estimated-costs');
  var historyList = document.getElementById('history-list');
  var resultsHistoryList = document.getElementById('results-history-list');
  var btnClearHistory = document.getElementById('btn-clear-history');
  var btnClearResultsHistory = document.getElementById('btn-clear-results-history');
  var errorBanner = document.getElementById('error-banner');
  var loadingStatus = document.getElementById('loading-status');
  var stageAnalyze = document.getElementById('stage-analyze');
  var stageResearch = document.getElementById('stage-research');
  var stagePredict = document.getElementById('stage-predict');
  var stageGenerate = document.getElementById('stage-generate');
  var allStages = [stageAnalyze, stageResearch, stagePredict, stageGenerate];

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
    if (loadingStatus) loadingStatus.textContent = 'Analyzing facts\u2026';
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

  function confidenceClass(level) {
    var l = (level || '').toLowerCase();
    if (l === 'high') return 'risk-low';
    if (l === 'medium') return 'risk-medium';
    return 'risk-high';
  }

  function probDisplayClass(prob) {
    var p = parseInt(prob, 10) || 0;
    if (p >= 60) return 'prob-high';
    if (p >= 40) return 'prob-medium';
    return 'prob-low';
  }

  function probBadgeClass(prob) {
    var p = parseInt(prob, 10) || 0;
    if (p >= 60) return 'risk-low';
    if (p >= 40) return 'risk-medium';
    return 'risk-high';
  }

  function severityClass(sev) {
    var l = (sev || '').toLowerCase();
    if (l === 'high') return 'risk-high';
    if (l === 'medium') return 'risk-medium';
    return 'risk-low';
  }

  function renderProbability(prob, confidence) {
    winProbabilityEl.textContent = (prob !== undefined && prob !== null) ? prob : '--';
    confidenceLevelEl.textContent = confidence || '--';
    confidenceLevelEl.className = 'risk-badge ' + confidenceClass(confidence);
    if (probabilityDisplay) {
      probabilityDisplay.className = 'probability-display ' + probDisplayClass(prob);
    }
  }

  function renderSummary(text) { summaryEl.textContent = text || ''; }

  function renderStrategies(strategies) {
    strategiesList.innerHTML = '';
    (strategies || []).forEach(function (s) {
      var card = document.createElement('div');
      card.className = 'strategy-card';
      card.setAttribute('role', 'listitem');
      var prosHtml = Array.isArray(s.pros) && s.pros.length
        ? '<div class="strategy-pros"><strong>Pros:</strong><ul><li>' + s.pros.map(function (p) { return esc(p); }).join('</li><li>') + '</li></ul></div>'
        : '';
      var consHtml = Array.isArray(s.cons) && s.cons.length
        ? '<div class="strategy-cons"><strong>Cons:</strong><ul><li>' + s.cons.map(function (c) { return esc(c); }).join('</li><li>') + '</li></ul></div>'
        : '';
      card.innerHTML =
        '<h4 class="strategy-card-title">' + esc(s.title) + '</h4>' +
        '<p class="strategy-card-desc">' + esc(s.description) + '</p>' +
        prosHtml + consHtml +
        (s.recommendedAction ? '<div class="strategy-action"><strong>Recommended:</strong> ' + esc(s.recommendedAction) + '</div>' : '');
      strategiesList.appendChild(card);
    });
  }

  function renderRiskFactors(factors) {
    riskFactorsTbody.innerHTML = '';
    (factors || []).forEach(function (f) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + esc(f.factor) + '</td>' +
        '<td><span class="risk-badge ' + severityClass(f.severity) + '">' + esc(f.severity || '') + '</span></td>' +
        '<td>' + esc(f.mitigation) + '</td>';
      riskFactorsTbody.appendChild(tr);
    });
  }

  function renderTimeline(timeline) {
    timelineList.innerHTML = '';
    (timeline || []).forEach(function (t) {
      var item = document.createElement('div');
      item.className = 'timeline-item';
      item.setAttribute('role', 'listitem');
      var keyActions = t.keyActions;
      var actionsHtml = '';
      if (keyActions) {
        if (typeof keyActions === 'string') actionsHtml = '<p class="timeline-actions"><strong>Key actions:</strong> ' + esc(keyActions) + '</p>';
        else if (Array.isArray(keyActions)) actionsHtml = '<p class="timeline-actions"><strong>Key actions:</strong> ' + keyActions.map(function (a) { return esc(a); }).join('; ') + '</p>';
      }
      item.innerHTML =
        '<div class="timeline-phase">' + esc(t.phase) + '</div>' +
        '<div class="timeline-duration">' + esc(t.duration) + '</div>' +
        '<div class="timeline-content">' +
          '<p class="timeline-desc">' + esc(t.description) + '</p>' +
          actionsHtml +
        '</div>';
      timelineList.appendChild(item);
    });
  }

  function renderEstimatedCosts(costs) {
    if (!costs || !estimatedCostsEl) return;
    var c = costs;
    var parts = [];
    if (c.discovery != null) parts.push('Discovery: $' + Number(c.discovery).toLocaleString());
    if (c.motions != null) parts.push('Motions: $' + Number(c.motions).toLocaleString());
    if (c.trial != null) parts.push('Trial: $' + Number(c.trial).toLocaleString());
    if (c.total != null) parts.push('<strong>Total: $' + Number(c.total).toLocaleString() + '</strong>');
    if (parts.length === 0) return;
    estimatedCostsEl.classList.remove('hidden');
    estimatedCostsEl.innerHTML = '<h4>Estimated Costs</h4><p>' + parts.join(' &bull; ') + '</p>';
  }

  function displayAnalysis(result) {
    renderProbability(result.winProbability, result.confidenceLevel);
    renderSummary(result.summary);
    renderStrategies(result.strategies);
    renderRiskFactors(result.riskFactors);
    renderTimeline(result.timeline);
    renderEstimatedCosts(result.estimatedCosts);
    showResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderHistoryInto(container, history) {
    container.innerHTML = '';
    if (!history || history.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: #9e9e9e; font-size: 0.9rem; text-align: center; padding: 0.5rem 0;';
      empty.textContent = 'No analyses yet. Enter case details and click Analyze Case to get started.';
      container.appendChild(empty);
      return;
    }
    history.forEach(function (h) {
      var item = document.createElement('div');
      item.className = 'history-item';
      item.setAttribute('role', 'listitem');
      var prob = h.data ? (h.data.winProbability !== undefined ? h.data.winProbability : 0) : 0;
      var date = new Date(h.createdAt).toLocaleDateString();

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'history-item-delete';
      deleteBtn.setAttribute('aria-label', 'Delete this analysis');
      deleteBtn.title = 'Delete';
      deleteBtn.innerHTML = '&#10005;';
      deleteBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!confirm('Delete "' + (h.title || 'Untitled') + '"?')) return;
        deleteAnalysisFromDb(h.id).then(function () { renderHistory(getHistory()); });
      });

      item.innerHTML =
        '<div class="history-item-name">' + esc(h.title) + '</div>' +
        '<div class="history-meta">' +
          '<span class="history-item-date">' + date + '</span>' +
          (prob ? '<span class="risk-badge ' + probBadgeClass(prob) + '">' + prob + '%</span>' : '') +
        '</div>';
      item.appendChild(deleteBtn);

      if (h.data) {
        item.title = 'Click to view this analysis';
        item.addEventListener('click', function () { displayAnalysis(h.data); });
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
   * Analysis pipeline
   * =================================================================== */

  var processing = false;

  function runAnalysis(formData, title) {
    if (processing) return;
    processing = true;

    hide(errorBanner);
    showLoading();

    setStage(stageAnalyze, 'active', 'Analyzing facts\u2026');

    analyzeCase(formData)
      .then(function (result) {
        setStage(stageAnalyze, 'done');
        setStage(stageResearch, 'done');
        setStage(stagePredict, 'active', 'Predicting outcomes\u2026');
        setTimeout(function () {
          setStage(stagePredict, 'done');
          setStage(stageGenerate, 'active', 'Generating strategy\u2026');
          setTimeout(function () {
            setStage(stageGenerate, 'done');
            displayAnalysis(result);
            saveAnalysisToDb(result, title).then(function () {
              renderHistory(getHistory());
            });
          }, 400);
        }, 400);
      })
      .catch(function (err) {
        console.error('Analysis failed:', err);
        showError('Analysis failed: ' + err.message);
        showLanding();
      })
      .then(function () { processing = false; });
  }

  /* =====================================================================
   * Form handling
   * =================================================================== */

  caseForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (processing) return;

    var caseType = document.getElementById('case-type').value;
    var jurisdiction = document.getElementById('jurisdiction').value.trim();
    var description = document.getElementById('case-description').value.trim();
    var keyFacts = document.getElementById('key-facts').value.trim();
    var opposingCounsel = document.getElementById('opposing-counsel').value.trim();
    var desiredOutcome = document.getElementById('desired-outcome').value.trim();

    var formData = {
      caseType: caseType,
      jurisdiction: jurisdiction,
      description: description,
      keyFacts: keyFacts,
      opposingCounsel: opposingCounsel,
      desiredOutcome: desiredOutcome,
    };

    var title = (caseType ? caseType + ' — ' : '') + (jurisdiction || 'Case');
    runAnalysis(formData, title);
  });

  /* =====================================================================
   * New analysis button
   * =================================================================== */

  btnNewAnalysis.addEventListener('click', function () {
    caseForm.reset();
    showLanding();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* =====================================================================
   * Clear history
   * =================================================================== */

  function handleClearAll() {
    if (!confirm('Delete all recent analyses?')) return;
    deleteAllAnalysesFromDb().then(function () { renderHistory(getHistory()); });
  }

  if (btnClearHistory) btnClearHistory.addEventListener('click', handleClearAll);
  if (btnClearResultsHistory) btnClearResultsHistory.addEventListener('click', handleClearAll);

  /* =====================================================================
   * Init — load persisted analyses from the database
   * =================================================================== */

  loadHistoryFromDb().then(function (history) {
    renderHistory(history);
  });

})();
