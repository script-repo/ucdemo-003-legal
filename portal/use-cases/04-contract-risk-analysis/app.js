/**
 * Contract Risk Analysis — Use Case App (self-contained, no ES modules).
 * Supports file upload (TXT/PDF/DOCX) and direct text paste.
 * Sends contract text to the Nutanix AI endpoint via the local proxy for
 * risk analysis. Falls back to mock data when AI services are unreachable.
 * Renders risk dashboard: score, heat map, clause risks, regulatory commitments, actions.
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
    defaults: { maxTokens: 2048, stream: false },
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
   * System prompt — risk analysis JSON schema
   * =================================================================== */

  var SYSTEM_PROMPT =
    'You are a contract risk analysis AI. When given contract text and selected risk categories, respond with a JSON object containing:\n' +
    '- "overallRiskScore": integer 1-100\n' +
    '- "overallRiskLevel": "Low", "Medium", or "High"\n' +
    '- "summary": 2-3 sentence plain-language risk overview\n' +
    '- "categoryScores": object with keys financial, operational, compliance, legal, reputational. Each value: { "score" (1-100), "level" (Low/Medium/High), "topIssue" (string) }\n' +
    '- "clauseRisks": array of { "clauseName", "category", "severity" (Low/Medium/High), "description", "recommendedAction", "fallbackLanguage" (optional) }\n' +
    '- "regulatoryCommitments": array of { "obligation", "jurisdiction", "deadline", "riskIfMissed" }\n' +
    '- "recommendedActions": array of { "priority" (High/Medium/Low), "action", "rationale" }\n' +
    'Only include categories that were requested. Respond ONLY with valid JSON, no markdown fences.';

  /* =====================================================================
   * Mock data — realistic risk dashboard
   * =================================================================== */

  var MOCK_ANALYSIS = {
    overallRiskScore: 68,
    overallRiskLevel: 'Medium',
    summary: 'This agreement presents moderate risk across financial, operational, and compliance dimensions. Key concerns include uncapped indemnification, broad liability exposure, and GDPR-related data processing obligations that require immediate attention.',
    categoryScores: {
      financial: { score: 75, level: 'High', topIssue: 'Uncapped indemnification and 2x liability cap' },
      operational: { score: 55, level: 'Medium', topIssue: 'Vague SLA definitions and limited remedy options' },
      compliance: { score: 72, level: 'High', topIssue: 'GDPR data processing terms require DPA review' },
      legal: { score: 60, level: 'Medium', topIssue: 'Foreign governing law and arbitration clause' },
      reputational: { score: 45, level: 'Low', topIssue: 'Standard confidentiality terms' },
    },
    clauseRisks: [
      { clauseName: 'Indemnification', category: 'Financial', severity: 'High', description: 'Unlimited indemnification for third-party claims with no cap.', recommendedAction: 'Cap indemnification at 1x annual contract value', fallbackLanguage: 'Indemnification shall not exceed 100% of fees paid in the 12 months preceding the claim.' },
      { clauseName: 'Limitation of Liability', category: 'Financial', severity: 'Medium', description: 'Liability cap set at 2x contract value.', recommendedAction: 'Negotiate down to 1x contract value', fallbackLanguage: 'Total liability shall not exceed the fees paid in the 12 months preceding the claim.' },
      { clauseName: 'Data Processing', category: 'Compliance', severity: 'High', description: 'GDPR subprocessor terms lack required safeguards.', recommendedAction: 'Execute standard DPA with SCCs', fallbackLanguage: 'Processor shall comply with GDPR Article 28 and use EU-approved SCCs.' },
      { clauseName: 'Termination for Convenience', category: 'Operational', severity: 'Low', description: '30-day notice vs standard 60-day.', recommendedAction: 'Extend notice period to 60 days', fallbackLanguage: 'Either party may terminate with 60 days written notice.' },
      { clauseName: 'Governing Law', category: 'Legal', severity: 'Medium', description: 'Foreign jurisdiction specified.', recommendedAction: 'Change to home jurisdiction', fallbackLanguage: 'This agreement shall be governed by the laws of [Home State].' },
    ],
    regulatoryCommitments: [
      { obligation: 'GDPR compliance review', jurisdiction: 'EU', deadline: 'Before go-live', riskIfMissed: 'Regulatory fines, contract suspension' },
      { obligation: 'Data breach notification within 72 hours', jurisdiction: 'EU', deadline: 'Upon discovery', riskIfMissed: 'GDPR penalties up to 4% revenue' },
      { obligation: 'SOC 2 audit report submission', jurisdiction: 'US', deadline: 'Annually', riskIfMissed: 'Contract termination, audit failure' },
    ],
    recommendedActions: [
      { priority: 'High', action: 'Cap indemnification and negotiate liability cap to 1x', rationale: 'Reduces financial exposure significantly' },
      { priority: 'High', action: 'Execute GDPR-compliant DPA with SCCs', rationale: 'Required for EU data processing' },
      { priority: 'Medium', action: 'Change governing law to home jurisdiction', rationale: 'Reduces litigation risk and cost' },
      { priority: 'Medium', action: 'Extend termination notice to 60 days', rationale: 'Aligns with standard operational practice' },
      { priority: 'Low', action: 'Clarify SLA definitions and remedy options', rationale: 'Improves operational predictability' },
    ],
  };

  /* =====================================================================
   * Inference — risk analysis via chat completions
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

  var MAX_INPUT_CHARS = 8000;

  function truncateText(text, maxChars) {
    if (text.length <= maxChars) return text;
    var headSize = Math.floor(maxChars * 0.6);
    var tailSize = Math.floor(maxChars * 0.3);
    return text.substring(0, headSize) +
      '\n\n[... middle truncated (' + text.length.toLocaleString() + ' chars total) ...]\n\n' +
      text.substring(text.length - tailSize);
  }

  function analyzeRisk(text, categories, filename) {
    var cats = categories && categories.length ? categories : ['financial', 'operational', 'compliance', 'legal', 'reputational'];

    if (!text || text.trim().length < 50) {
      return Promise.reject(new Error('Document text is too short or could not be extracted. Please try a different file or paste the text directly.'));
    }

    var trimmed = truncateText(text.trim(), MAX_INPUT_CHARS);
    var userContent = 'Analyze the following contract for risk. Focus on these categories: ' + cats.join(', ') + '.\n\n' + trimmed;

    return chatCompletion(
      [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      { maxTokens: 4096 }
    )
      .then(function (response) {
        var raw = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
        if (raw) {
          try {
            var parsed = parseAiJson(raw);
            if (parsed.overallRiskScore !== undefined && parsed.categoryScores) return parsed;
          } catch (_) {}
        }
        console.warn('Inference returned unexpected format, using mock data.');
        return JSON.parse(JSON.stringify(MOCK_ANALYSIS));
      })
      .catch(function (err) {
        console.warn('Inference endpoint unavailable, using mock data:', err.message);
        return JSON.parse(JSON.stringify(MOCK_ANALYSIS));
      });
  }

  /* =====================================================================
   * Database — persistent analysis storage via /api/db/summaries
   * =================================================================== */

  var DB_API = '/api/db/summaries';
  var USE_CASE = 'uc04';
  var localHistory = [];

  function saveAnalysisToDb(result, name) {
    var title = name || 'Untitled Contract';
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
      .catch(function (err) { console.warn('Failed to clear analyses:', err.message); });
  }

  /* =====================================================================
   * File content extraction
   * =================================================================== */

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('Failed to read file')); };
      r.readAsText(file);
    });
  }

  function readFileAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('Failed to read file')); };
      r.readAsArrayBuffer(file);
    });
  }

  function extractDocx(file) {
    if (typeof mammoth === 'undefined') return Promise.resolve(null);
    return readFileAsArrayBuffer(file)
      .then(function (buf) { return mammoth.extractRawText({ arrayBuffer: buf }); })
      .then(function (r) { return r.value; })
      .catch(function () { return null; });
  }

  function extractPdf(file) {
    var lib = window.pdfjsLib || null;
    if (!lib) return Promise.resolve(null);
    return readFileAsArrayBuffer(file)
      .then(function (buf) { return lib.getDocument({ data: new Uint8Array(buf) }).promise; })
      .then(function (pdf) {
        var pages = [];
        for (var i = 1; i <= pdf.numPages; i++) {
          pages.push(pdf.getPage(i).then(function (p) { return p.getTextContent(); }).then(function (c) {
            return c.items.map(function (it) { return it.str; }).join(' ');
          }));
        }
        return Promise.all(pages);
      })
      .then(function (t) { return t.join('\n\n'); })
      .catch(function () { return null; });
  }

  function extractText(file) {
    var ext = (file.name || '').split('.').pop().toLowerCase();
    if (ext === 'txt' || file.type === 'text/plain') return readFileAsText(file);
    if (ext === 'docx') return extractDocx(file);
    if (ext === 'pdf') return extractPdf(file);
    return Promise.resolve(null);
  }

  /* =====================================================================
   * DOM references
   * =================================================================== */

  var landingSection = document.getElementById('landing-section');
  var uploadZone = document.getElementById('upload-zone');
  var fileInput = document.getElementById('file-input');
  var pasteInput = document.getElementById('paste-input');
  var taxonomyCbs = document.querySelectorAll('.taxonomy-cb');
  var btnAnalyze = document.getElementById('btn-analyze-risk');
  var loadingSection = document.getElementById('loading-section');
  var resultsSection = document.getElementById('results-section');
  var btnNewAnalysis = document.getElementById('btn-new-analysis');
  var riskScoreDisplay = document.getElementById('risk-score-display');
  var riskScoreEl = document.getElementById('risk-score');
  var riskLevelEl = document.getElementById('risk-level');
  var summaryEl = document.getElementById('summary-text');
  var heatmapGrid = document.getElementById('heatmap-grid');
  var clauseRisksList = document.getElementById('clause-risks-list');
  var regulatoryTbody = document.getElementById('regulatory-tbody');
  var actionsList = document.getElementById('actions-list');
  var historyList = document.getElementById('history-list');
  var resultsHistoryList = document.getElementById('results-history-list');
  var btnClearHistory = document.getElementById('btn-clear-history');
  var btnClearResultsHistory = document.getElementById('btn-clear-results-history');
  var errorBanner = document.getElementById('error-banner');
  var loadingStatus = document.getElementById('loading-status');
  var stageExtract = document.getElementById('stage-extract');
  var stageSend = document.getElementById('stage-send');
  var stageAnalyze = document.getElementById('stage-analyze');
  var stageRender = document.getElementById('stage-render');
  var allStages = [stageExtract, stageSend, stageAnalyze, stageRender];

  var selectedFile = null;

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  function showError(msg) {
    if (!errorBanner) return;
    errorBanner.textContent = msg;
    show(errorBanner);
    setTimeout(function () { hide(errorBanner); }, 8000);
  }

  function resetStages() {
    allStages.forEach(function (s) { s.classList.remove('active', 'done'); });
    if (loadingStatus) loadingStatus.textContent = 'Preparing contract\u2026';
  }

  function setStage(stage, status, statusText) {
    if (status === 'active') { stage.classList.add('active'); stage.classList.remove('done'); }
    else if (status === 'done') { stage.classList.remove('active'); stage.classList.add('done'); }
    if (statusText && loadingStatus) loadingStatus.textContent = statusText;
  }

  function getSelectedCategories() {
    var out = [];
    if (!taxonomyCbs) return ['financial', 'operational', 'compliance', 'legal', 'reputational'];
    taxonomyCbs.forEach(function (cb) {
      if (cb.checked) out.push(cb.getAttribute('data-category'));
    });
    return out.length ? out : ['financial', 'operational', 'compliance', 'legal', 'reputational'];
  }

  function hasInput() {
    return (selectedFile !== null) || (pasteInput && pasteInput.value.trim().length >= 10);
  }

  function hasCategories() {
    return getSelectedCategories().length > 0;
  }

  function updateAnalyzeButton() {
    if (!btnAnalyze) return;
    btnAnalyze.disabled = !(hasInput() && hasCategories());
  }

  /* =====================================================================
   * Rendering helpers
   * =================================================================== */

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function riskClass(level) {
    var l = (level || '').toLowerCase();
    if (l === 'high') return 'risk-high';
    if (l === 'medium') return 'risk-medium';
    return 'risk-low';
  }

  function heatClass(level) {
    var l = (level || '').toLowerCase();
    if (l === 'high') return 'heat-high';
    if (l === 'medium') return 'heat-medium';
    return 'heat-low';
  }

  function renderRiskScore(score, level) {
    riskScoreEl.textContent = score;
    riskLevelEl.textContent = level;
    riskLevelEl.className = 'risk-badge ' + riskClass(level);
    riskScoreDisplay.className = 'risk-score-display ' + riskClass(level);
  }

  function renderSummary(text) { summaryEl.textContent = text; }

  var CATEGORY_LABELS = {
    financial: 'Financial',
    operational: 'Operational',
    compliance: 'Compliance',
    legal: 'Legal',
    reputational: 'Reputational',
  };

  function renderHeatmap(categoryScores) {
    heatmapGrid.innerHTML = '';
    if (!categoryScores) return;

    var cats = ['financial', 'operational', 'compliance', 'legal', 'reputational'];
    cats.forEach(function (key) {
      var data = categoryScores[key];
      if (!data) return;
      var cell = document.createElement('div');
      cell.className = 'heatmap-cell ' + heatClass(data.level);
      cell.setAttribute('role', 'cell');
      cell.innerHTML = '<div>' + esc(CATEGORY_LABELS[key] || key) + '</div>' +
        '<div style="font-size:1.2rem; margin-top:0.25rem;">' + data.score + '</div>' +
        '<div style="font-size:0.8rem; margin-top:0.15rem;">' + esc(data.topIssue || '') + '</div>';
      heatmapGrid.appendChild(cell);
    });
  }

  function renderClauseRisks(clauseRisks) {
    clauseRisksList.innerHTML = '';
    (clauseRisks || []).forEach(function (c) {
      var card = document.createElement('div');
      card.className = 'clause-risk-card severity-' + (c.severity || 'low').toLowerCase();
      card.setAttribute('role', 'listitem');
      card.innerHTML =
        '<div class="clause-risk-header">' +
          '<span class="clause-risk-name">' + esc(c.clauseName) + '</span>' +
          '<span class="risk-badge ' + riskClass(c.category) + '">' + esc(c.category) + '</span>' +
          '<span class="risk-badge ' + riskClass(c.severity) + '">' + esc(c.severity) + '</span>' +
        '</div>' +
        '<p class="clause-risk-desc">' + esc(c.description) + '</p>' +
        '<p class="clause-risk-action"><strong>Recommended:</strong> ' + esc(c.recommendedAction) + '</p>';
      clauseRisksList.appendChild(card);
    });
  }

  function renderRegulatory(commitments) {
    regulatoryTbody.innerHTML = '';
    (commitments || []).forEach(function (c) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + esc(c.obligation) + '</td>' +
        '<td>' + esc(c.jurisdiction) + '</td>' +
        '<td>' + esc(c.deadline) + '</td>' +
        '<td>' + esc(c.riskIfMissed) + '</td>';
      regulatoryTbody.appendChild(tr);
    });
  }

  function renderActions(actions) {
    actionsList.innerHTML = '';
    (actions || []).forEach(function (a) {
      var item = document.createElement('div');
      item.className = 'action-item priority-' + (a.priority || 'low').toLowerCase();
      item.setAttribute('role', 'listitem');
      item.innerHTML =
        '<span class="action-priority risk-badge ' + riskClass(a.priority) + '">' + esc(a.priority) + '</span>' +
        '<div class="action-content">' +
          '<p class="action-text">' + esc(a.action) + '</p>' +
          '<p class="action-rationale">' + esc(a.rationale) + '</p>' +
        '</div>';
      actionsList.appendChild(item);
    });
  }

  function displayAnalysis(result) {
    renderRiskScore(result.overallRiskScore, result.overallRiskLevel);
    renderSummary(result.summary);
    renderHeatmap(result.categoryScores);
    renderClauseRisks(result.clauseRisks);
    renderRegulatory(result.regulatoryCommitments);
    renderActions(result.recommendedActions);
    showResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderHistoryInto(container, history) {
    container.innerHTML = '';
    if (!history || history.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: #9e9e9e; font-size: 0.9rem; text-align: center; padding: 0.5rem 0;';
      empty.textContent = 'No analyses yet. Upload or paste a contract to get started.';
      container.appendChild(empty);
      return;
    }
    history.forEach(function (h) {
      var item = document.createElement('div');
      item.className = 'history-item';
      item.setAttribute('role', 'listitem');
      var score = h.data ? (h.data.overallRiskScore || 0) : 0;
      var level = score >= 70 ? 'High' : (score >= 40 ? 'Medium' : 'Low');
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
          (score ? '<span class="risk-badge ' + riskClass(level) + '">' + score + '</span>' : '') +
        '</div>';
      item.appendChild(deleteBtn);

      if (h.data) {
        item.title = 'Click to view this analysis';
        item.addEventListener('click', function () { displayAnalysis(h.data); });
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

  function runAnalysis(text, name) {
    if (processing) return;
    processing = true;

    hide(errorBanner);
    var alreadyLoading = !loadingSection.classList.contains('hidden');
    if (!alreadyLoading) showLoading();

    setStage(stageSend, 'active', 'Sending contract to AI\u2026');

    var categories = getSelectedCategories();

    analyzeRisk(text, categories, name)
      .then(function (result) {
        setStage(stageSend, 'done');
        setStage(stageAnalyze, 'done');
        setStage(stageRender, 'active', 'Rendering dashboard\u2026');

        renderRiskScore(result.overallRiskScore, result.overallRiskLevel);
        renderSummary(result.summary);
        renderHeatmap(result.categoryScores);
        renderClauseRisks(result.clauseRisks);
        renderRegulatory(result.regulatoryCommitments);
        renderActions(result.recommendedActions);

        saveAnalysisToDb(result, name || 'Pasted Contract').then(function () {
          renderHistory(getHistory());
        });
        setStage(stageRender, 'done');
        showResults();
      })
      .catch(function (err) {
        console.error('Analysis failed:', err);
        showError('Analysis failed: ' + err.message);
        showLanding();
      })
      .then(function () { processing = false; });
  }

  /* =====================================================================
   * File upload handling
   * =================================================================== */

  function showFileLoaded(file) {
    if (!uploadZone) return;
    uploadZone.classList.add('file-loaded');
    var label = uploadZone.querySelector('.upload-label');
    var hint = uploadZone.querySelector('.upload-hint');
    if (label) label.innerHTML = '<strong>' + esc(file.name) + '</strong>';
    if (hint) hint.textContent = 'Click to change file';
  }

  function clearFileLoaded() {
    if (!uploadZone) return;
    uploadZone.classList.remove('file-loaded');
    var label = uploadZone.querySelector('.upload-label');
    var hint = uploadZone.querySelector('.upload-hint');
    if (label) label.innerHTML = 'Drag &amp; drop, or <span class="upload-browse">browse files</span>';
    if (hint) hint.textContent = 'TXT, PDF, DOCX';
  }

  function handleFile(file) {
    if (!file || processing) return;

    var ext = (file.name || '').split('.').pop().toLowerCase();
    if (['txt', 'pdf', 'docx'].indexOf(ext) === -1) {
      showError('Unsupported file type ".' + ext + '". Please upload a TXT, PDF, or DOCX file.');
      return;
    }

    selectedFile = file;
    showFileLoaded(file);
    updateAnalyzeButton();
  }

  function handleAnalyzeClick() {
    if (processing || !hasInput() || !hasCategories()) return;

    if (selectedFile) {
      processing = true;
      hide(errorBanner);
      showLoading();
      setStage(stageExtract, 'active', 'Extracting text from ' + selectedFile.name + '\u2026');

      extractText(selectedFile)
        .then(function (text) {
          setStage(stageExtract, 'done');
          if (!text || text.trim().length < 20) {
            console.warn('Could not extract meaningful text; using filename.');
            if (!text) showError('Could not extract text from this ' + (selectedFile.name || '').split('.').pop().toUpperCase() + '. Analyzing by filename only.');
          }
          processing = false;
          runAnalysis(text, selectedFile.name);
        })
        .catch(function (err) {
          processing = false;
          showError('File read failed: ' + err.message);
          showLanding();
        });
    } else {
      showLoading();
      setStage(stageExtract, 'done');
      runAnalysis(pasteInput.value.trim(), 'Pasted Contract');
    }
  }

  /* =====================================================================
   * Event listeners
   * =================================================================== */

  // Drag and drop
  if (uploadZone) {
    uploadZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      uploadZone.classList.add('dragover');
    });
    uploadZone.addEventListener('dragleave', function () {
      uploadZone.classList.remove('dragover');
    });
    uploadZone.addEventListener('drop', function (e) {
      e.preventDefault();
      uploadZone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });
  }

  if (uploadZone) uploadZone.addEventListener('click', function () {
    fileInput.click();
  });
  if (uploadZone) uploadZone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });

  if (fileInput) {
    fileInput.addEventListener('change', function () {
      if (fileInput.files.length > 0) {
        handleFile(fileInput.files[0]);
      } else {
        selectedFile = null;
        updateAnalyzeButton();
      }
      fileInput.value = '';
    });
  }

  // Paste textarea
  if (pasteInput) {
    pasteInput.addEventListener('input', function () {
      if (selectedFile) selectedFile = null;
      updateAnalyzeButton();
    });
  }

  // Taxonomy checkboxes
  if (taxonomyCbs) {
    taxonomyCbs.forEach(function (cb) {
      cb.addEventListener('change', updateAnalyzeButton);
    });
  }

  // Analyze Risk button
  if (btnAnalyze) btnAnalyze.addEventListener('click', handleAnalyzeClick);

  // New analysis button
  if (btnNewAnalysis) {
    btnNewAnalysis.addEventListener('click', function () {
      selectedFile = null;
      clearFileLoaded();
      if (pasteInput) pasteInput.value = '';
      if (fileInput) fileInput.value = '';
      updateAnalyzeButton();
      showLanding();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

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
  updateAnalyzeButton();

})();
