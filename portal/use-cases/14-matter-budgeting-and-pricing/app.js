/**
 * Matter Budgeting & Pricing — Use Case App (self-contained, no ES modules).
 * Form-based: matter type, complexity, scope, jurisdiction, duration, special considerations.
 * Sends form data to the Nutanix AI endpoint via the local proxy for budget generation.
 * Results are persisted to the database for history.
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
   * Inference — matter budgeting via chat completions
   * =================================================================== */

  var SYSTEM_PROMPT =
    'You are a legal matter budgeting AI. Generate detailed budget estimates for legal matters. ' +
    'Respond with a JSON object containing: ' +
    '"totalBudget" (number, total estimated cost in dollars), ' +
    '"summary" (2-3 sentence plain-language summary of the budget), ' +
    '"phases" (array of objects with "name", "description", "tasks" (array of { "task", "hours", "rate", "amount" }), "subtotal"), ' +
    '"assumptions" (array of strings describing key assumptions), ' +
    '"risks" (array of objects with "risk", "impact", "mitigation"). ' +
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

  function generateBudget(formData) {
    var parts = [];
    parts.push('Matter type: ' + (formData.matterType || 'Not specified'));
    parts.push('Complexity: ' + (formData.complexity || 'Not specified'));
    var scope = (formData.scope || '').trim();
    if (scope) parts.push('Scope: ' + scope);
    var jurisdiction = (formData.jurisdiction || '').trim();
    if (jurisdiction) parts.push('Jurisdiction: ' + jurisdiction);
    var duration = (formData.duration || '').trim();
    if (duration) parts.push('Estimated duration: ' + duration);
    var special = (formData.specialConsiderations || '').trim();
    if (special) parts.push('Special considerations: ' + special);

    var userContent = 'Generate a budget for the following matter:\n\n' + parts.join('\n');

    return chatCompletion(
      [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      { maxTokens: 4096 }
    )
      .then(function (response) {
        var raw = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
        if (!raw) throw new Error('No response content from AI');
        var parsed = parseAiJson(raw);
        if (parsed.totalBudget === undefined) throw new Error('Response missing totalBudget');
        return parsed;
      });
  }

  /* =====================================================================
   * Database — persistent budget storage via /api/db/summaries
   * =================================================================== */

  var DB_API = '/api/db/summaries';
  var USE_CASE = 'uc14';
  var localHistory = [];

  function saveAnalysisToDb(result, name) {
    var title = name || 'Untitled Budget';
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
        console.warn('Failed to persist budget:', err.message);
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
      .catch(function (err) { console.warn('Failed to delete budget:', err.message); });
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
  var budgetForm = document.getElementById('budget-form');
  var btnGenerate = document.getElementById('btn-generate');
  var loadingSection = document.getElementById('loading-section');
  var resultsSection = document.getElementById('results-section');
  var btnNewBudget = document.getElementById('btn-new-budget');
  var budgetTotalEl = document.getElementById('budget-total');
  var summaryEl = document.getElementById('summary-text');
  var phasesTbody = document.getElementById('phases-tbody');
  var assumptionsList = document.getElementById('assumptions-list');
  var risksList = document.getElementById('risks-list');
  var historyList = document.getElementById('history-list');
  var resultsHistoryList = document.getElementById('results-history-list');
  var btnClearHistory = document.getElementById('btn-clear-history');
  var btnClearResultsHistory = document.getElementById('btn-clear-results-history');
  var errorBanner = document.getElementById('error-banner');
  var loadingStatus = document.getElementById('loading-status');
  var stageAnalyze = document.getElementById('stage-analyze');
  var stagePhases = document.getElementById('stage-phases');
  var stagePricing = document.getElementById('stage-pricing');
  var stageRender = document.getElementById('stage-render');
  var allStages = [stageAnalyze, stagePhases, stagePricing, stageRender];

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
    if (loadingStatus) loadingStatus.textContent = 'Analyzing scope\u2026';
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

  function formatCurrency(n) {
    if (typeof n !== 'number' || isNaN(n)) return '--';
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function renderBudgetTotal(total) {
    budgetTotalEl.textContent = formatCurrency(total);
  }

  function renderSummary(text) { summaryEl.textContent = text || ''; }

  function renderPhases(phases) {
    phasesTbody.innerHTML = '';
    (phases || []).forEach(function (phase) {
      var tasks = phase.tasks || [];
      if (tasks.length > 0) {
        tasks.forEach(function (t, idx) {
          var tr = document.createElement('tr');
          var phaseCell = idx === 0 ? '<td rowspan="' + tasks.length + '">' + esc(phase.name) + '</td>' : '';
          tr.innerHTML =
            phaseCell +
            '<td>' + esc(t.task || '') + '</td>' +
            '<td>' + esc(String(t.hours != null ? t.hours : '')) + '</td>' +
            '<td>' + (t.rate != null ? esc(formatCurrency(t.rate)) : '') + '</td>' +
            '<td>' + (t.amount != null ? esc(formatCurrency(t.amount)) : '') + '</td>';
          phasesTbody.appendChild(tr);
        });
      } else {
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + esc(phase.name) + '</td>' +
          '<td>' + esc(phase.description || '') + '</td>' +
          '<td></td><td></td>' +
          '<td>' + (phase.subtotal != null ? esc(formatCurrency(phase.subtotal)) : '') + '</td>';
        phasesTbody.appendChild(tr);
      }
    });
  }

  function renderAssumptions(assumptions) {
    assumptionsList.innerHTML = '';
    (assumptions || []).forEach(function (a) {
      var li = document.createElement('div');
      li.className = 'assumption-item';
      li.setAttribute('role', 'listitem');
      li.textContent = a;
      assumptionsList.appendChild(li);
    });
  }

  function renderRisks(risks) {
    risksList.innerHTML = '';
    (risks || []).forEach(function (r) {
      var card = document.createElement('div');
      card.className = 'risk-item';
      card.setAttribute('role', 'listitem');
      card.innerHTML =
        '<div class="risk-header">' + esc(r.risk || '') + '</div>' +
        '<div class="risk-impact">' + esc(r.impact || '') + '</div>' +
        '<div class="risk-mitigation"><strong>Mitigation:</strong> ' + esc(r.mitigation || '') + '</div>';
      risksList.appendChild(card);
    });
  }

  function displayBudget(result) {
    renderBudgetTotal(result.totalBudget);
    renderSummary(result.summary);
    renderPhases(result.phases);
    renderAssumptions(result.assumptions);
    renderRisks(result.risks);
    showResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderHistoryInto(container, history) {
    container.innerHTML = '';
    if (!history || history.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: #9e9e9e; font-size: 0.9rem; text-align: center; padding: 0.5rem 0;';
      empty.textContent = 'No budgets yet. Enter matter details to generate a budget.';
      container.appendChild(empty);
      return;
    }
    history.forEach(function (h) {
      var item = document.createElement('div');
      item.className = 'history-item';
      item.setAttribute('role', 'listitem');
      var total = h.data ? (h.data.totalBudget || 0) : 0;
      var date = new Date(h.createdAt).toLocaleDateString();

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'history-item-delete';
      deleteBtn.setAttribute('aria-label', 'Delete this budget');
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
          (total ? '<span>' + formatCurrency(total) + '</span>' : '') +
        '</div>';
      item.appendChild(deleteBtn);

      if (h.data) {
        item.title = 'Click to view this budget';
        item.addEventListener('click', function () { displayBudget(h.data); });
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
   * Budget generation pipeline
   * =================================================================== */

  var processing = false;

  function runBudgetGeneration(formData) {
    if (processing) return;
    processing = true;

    hide(errorBanner);
    showLoading();
    setStage(stageAnalyze, 'active', 'Analyzing scope\u2026');

    generateBudget(formData)
      .then(function (result) {
        setStage(stageAnalyze, 'done');
        setStage(stagePhases, 'done');
        setStage(stagePricing, 'active', 'Calculating pricing\u2026');
        setStage(stagePricing, 'done');
        setStage(stageRender, 'active', 'Rendering\u2026');

        displayBudget(result);

        var title = (formData.matterType || 'Budget') + ' - ' + (formData.complexity || '');
        saveAnalysisToDb(result, title).then(function () {
          renderHistory(getHistory());
        });
        setStage(stageRender, 'done');
      })
      .catch(function (err) {
        console.error('Budget generation failed:', err);
        showError('Budget generation failed: ' + err.message);
        showLanding();
      })
      .then(function () { processing = false; });
  }

  /* =====================================================================
   * Event listeners
   * =================================================================== */

  budgetForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (processing) return;

    var matterType = document.getElementById('matter-type').value;
    var complexity = document.getElementById('complexity').value;
    var scope = document.getElementById('scope').value.trim();
    if (!matterType || !complexity || !scope) {
      showError('Please select matter type, complexity, and enter a scope description.');
      return;
    }

    var formData = {
      matterType: matterType,
      complexity: complexity,
      scope: scope,
      jurisdiction: document.getElementById('jurisdiction').value.trim(),
      duration: document.getElementById('duration').value.trim(),
      specialConsiderations: document.getElementById('special-considerations').value.trim(),
    };

    runBudgetGeneration(formData);
  });

  btnNewBudget.addEventListener('click', function () {
    budgetForm.reset();
    showLanding();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* =====================================================================
   * Clear history
   * =================================================================== */

  function handleClearAll() {
    if (!confirm('Delete all recent budgets?')) return;
    deleteAllAnalysesFromDb().then(function () { renderHistory(getHistory()); });
  }

  if (btnClearHistory) btnClearHistory.addEventListener('click', handleClearAll);
  if (btnClearResultsHistory) btnClearResultsHistory.addEventListener('click', handleClearAll);

  /* =====================================================================
   * Init — load persisted budgets from the database
   * =================================================================== */

  loadHistoryFromDb().then(function (history) {
    renderHistory(history);
  });

})();
