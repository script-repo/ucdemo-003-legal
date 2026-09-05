/**
 * Contract Lifecycle Management — Use Case App (self-contained, no ES modules).
 * Supports file upload (TXT/PDF/DOCX) and direct text paste.
 * Sends contract text to the Nutanix AI endpoint via the local proxy for
 * lifecycle analysis. Results are persisted to the database for history.
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
   * Inference — contract lifecycle analysis via chat completions
   * =================================================================== */

  var SYSTEM_PROMPT =
    'You are a contract lifecycle management AI. Analyze contracts for lifecycle tracking. Respond with JSON: ' +
    'lifecycleStatus (Active/Expiring Soon/Expired/Pending Renewal), summary, ' +
    'keyDates (array of {event, date, importance (Critical/Important/Routine), daysUntil}), ' +
    'obligations (array of {party, obligation, deadline, status (Pending/Due Soon/Overdue/Complete), frequency}), ' +
    'renewalTerms ({autoRenew (boolean), noticePeriod, renewalDate, terms}), ' +
    'actionItems (array of {action, deadline, priority (Urgent/High/Medium/Low), assignee}), ' +
    'financialSummary ({totalValue, paymentSchedule, remainingValue}). ' +
    'Respond ONLY with valid JSON.';

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

  function analyzeLifecycle(text, filename) {
    if (!text || text.trim().length < 50) {
      return Promise.reject(new Error('Document text is too short or could not be extracted. Please try a different file or paste the text directly.'));
    }

    var trimmed = truncateText(text.trim(), MAX_INPUT_CHARS);
    var userContent = 'Analyze the following contract for lifecycle tracking:\n\n' + trimmed;

    return chatCompletion(
      [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      { maxTokens: 4096 }
    )
      .then(function (response) {
        var raw = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
        if (!raw) throw new Error('No response content from AI');
        var parsed = parseAiJson(raw);
        if (!parsed.lifecycleStatus && !parsed.summary) throw new Error('Response missing required fields');
        return parsed;
      });
  }

  /* =====================================================================
   * Database — persistent analysis storage via /api/db/summaries
   * =================================================================== */

  var DB_API = '/api/db/summaries';
  var USE_CASE = 'uc27';
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
      .catch(function (err) { console.warn('Failed to clear history:', err.message); });
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
  var btnAnalyze = document.getElementById('btn-analyze');
  var loadingSection = document.getElementById('loading-section');
  var resultsSection = document.getElementById('results-section');
  var btnNewAnalysis = document.getElementById('btn-new-analysis');
  var lifecycleStatusEl = document.getElementById('lifecycle-status');
  var lifecycleStatusDisplay = document.querySelector('.lifecycle-status-display');
  var summaryEl = document.getElementById('summary-text');
  var keyDatesTimeline = document.getElementById('key-dates-timeline');
  var obligationsTracker = document.getElementById('obligations-tracker');
  var renewalAlerts = document.getElementById('renewal-alerts');
  var actionItemsList = document.getElementById('action-items-list');
  var financialSummary = document.getElementById('financial-summary');
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
    if (loadingStatus) loadingStatus.textContent = 'Preparing document\u2026';
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
    var s = (status || '').toLowerCase().replace(/\s+/g, '-');
    return 'status-' + s;
  }

  function renderLifecycleStatus(status) {
    if (!lifecycleStatusEl) return;
    lifecycleStatusEl.textContent = status || 'Unknown';
    if (lifecycleStatusDisplay) {
      lifecycleStatusDisplay.className = 'lifecycle-status-display ' + statusClass(status);
    }
  }

  function renderSummary(text) { if (summaryEl) summaryEl.textContent = text || ''; }

  function renderKeyDates(keyDates) {
    if (!keyDatesTimeline) return;
    keyDatesTimeline.innerHTML = '';
    (keyDates || []).forEach(function (d) {
      var item = document.createElement('div');
      item.className = 'timeline-item importance-' + ((d.importance || 'routine').toLowerCase());
      item.setAttribute('role', 'listitem');
      item.innerHTML =
        '<span class="timeline-date">' + esc(d.date) + '</span>' +
        '<div class="timeline-content">' +
          '<div class="timeline-event">' + esc(d.event) + '</div>' +
          '<div class="timeline-meta">' +
            (d.daysUntil != null ? 'Days until: ' + d.daysUntil + ' &bull; ' : '') +
            esc(d.importance || '') +
          '</div>' +
        '</div>';
      keyDatesTimeline.appendChild(item);
    });
    if (!keyDates || keyDates.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: var(--color-text-muted); font-size: 0.9rem;';
      empty.textContent = 'No key dates extracted.';
      keyDatesTimeline.appendChild(empty);
    }
  }

  function renderObligations(obligations) {
    if (!obligationsTracker) return;
    obligationsTracker.innerHTML = '';
    (obligations || []).forEach(function (o) {
      var item = document.createElement('div');
      item.className = 'obligation-item status-' + ((o.status || 'pending').toLowerCase().replace(/\s+/g, '-'));
      item.setAttribute('role', 'listitem');
      item.innerHTML =
        '<div><span class="obligation-party">' + esc(o.party) + '</span>' +
        '<div class="obligation-desc">' + esc(o.obligation) + '</div></div>' +
        '<span class="obligation-deadline">' + esc(o.deadline || '') + '</span>' +
        '<span class="obligation-status-badge">' + esc(o.status || '') + '</span>';
      obligationsTracker.appendChild(item);
    });
    if (!obligations || obligations.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: var(--color-text-muted); font-size: 0.9rem;';
      empty.textContent = 'No obligations extracted.';
      obligationsTracker.appendChild(empty);
    }
  }

  function renderRenewalTerms(renewalTerms) {
    if (!renewalAlerts) return;
    renewalAlerts.innerHTML = '';
    var rt = renewalTerms || {};
    var rows = [];
    if (rt.autoRenew !== undefined) rows.push({ label: 'Auto-renew', value: rt.autoRenew ? 'Yes' : 'No' });
    if (rt.noticePeriod) rows.push({ label: 'Notice period', value: rt.noticePeriod });
    if (rt.renewalDate) rows.push({ label: 'Renewal date', value: rt.renewalDate });
    if (rt.terms) rows.push({ label: 'Terms', value: rt.terms });
    rows.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'renewal-row';
      row.innerHTML = '<span class="renewal-label">' + esc(r.label) + ':</span>' + esc(r.value);
      renewalAlerts.appendChild(row);
    });
    if (rows.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: var(--color-text-muted); font-size: 0.9rem;';
      empty.textContent = 'No renewal terms extracted.';
      renewalAlerts.appendChild(empty);
    }
  }

  function renderActionItems(actionItems) {
    if (!actionItemsList) return;
    actionItemsList.innerHTML = '';
    (actionItems || []).forEach(function (a) {
      var item = document.createElement('div');
      item.className = 'action-item priority-' + ((a.priority || 'medium').toLowerCase());
      item.setAttribute('role', 'listitem');
      item.innerHTML =
        '<div><div class="action-text">' + esc(a.action) + '</div>' +
        '<div class="action-meta">' +
          (a.deadline ? 'Due: ' + esc(a.deadline) + ' &bull; ' : '') +
          (a.assignee ? 'Assignee: ' + esc(a.assignee) : '') +
        '</div></div>';
      actionItemsList.appendChild(item);
    });
    if (!actionItems || actionItems.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: var(--color-text-muted); font-size: 0.9rem;';
      empty.textContent = 'No action items extracted.';
      actionItemsList.appendChild(empty);
    }
  }

  function renderFinancialSummary(financialSummaryData) {
    if (!financialSummary) return;
    financialSummary.innerHTML = '';
    var fs = financialSummaryData || {};
    var rows = [];
    if (fs.totalValue) rows.push({ label: 'Total value', value: fs.totalValue });
    if (fs.paymentSchedule) rows.push({ label: 'Payment schedule', value: fs.paymentSchedule });
    if (fs.remainingValue) rows.push({ label: 'Remaining value', value: fs.remainingValue });
    rows.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'financial-row';
      row.innerHTML = '<span class="financial-label">' + esc(r.label) + ':</span>' + esc(r.value);
      financialSummary.appendChild(row);
    });
    if (rows.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: var(--color-text-muted); font-size: 0.9rem;';
      empty.textContent = 'No financial summary extracted.';
      financialSummary.appendChild(empty);
    }
  }

  function displayAnalysis(result) {
    renderLifecycleStatus(result.lifecycleStatus);
    renderSummary(result.summary);
    renderKeyDates(result.keyDates);
    renderObligations(result.obligations);
    renderRenewalTerms(result.renewalTerms);
    renderActionItems(result.actionItems);
    renderFinancialSummary(result.financialSummary);
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
      var status = h.data ? (h.data.lifecycleStatus || '') : '';
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
          (status ? '<span class="lifecycle-status-badge">' + esc(status) + '</span>' : '') +
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

  function runAnalysis(text, name) {
    if (processing) return;
    processing = true;

    hide(errorBanner);

    var alreadyLoading = !loadingSection.classList.contains('hidden');
    if (!alreadyLoading) showLoading();

    setStage(stageSend, 'active', 'Sending contract to AI\u2026');

    analyzeLifecycle(text, name)
      .then(function (result) {
        setStage(stageSend, 'done');
        setStage(stageAnalyze, 'done');
        setStage(stageRender, 'active', 'Rendering results\u2026');

        displayAnalysis(result);

        saveAnalysisToDb(result, name).then(function () {
          renderHistory(getHistory());
        });
        setStage(stageRender, 'done');
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

  function handleFile(file) {
    if (!file || processing) return;

    var ext = (file.name || '').split('.').pop().toLowerCase();
    if (['txt', 'pdf', 'docx'].indexOf(ext) === -1) {
      showError('Unsupported file type ".' + ext + '". Please upload a TXT, PDF, or DOCX file.');
      return;
    }

    processing = true;
    hide(errorBanner);
    showLoading();
    setStage(stageExtract, 'active', 'Extracting text from ' + file.name + '\u2026');

    extractText(file)
      .then(function (text) {
        setStage(stageExtract, 'done');
        if (!text || text.trim().length < 20) {
          console.warn('Could not extract meaningful text; using filename.');
          if (!text) showError('Could not extract text from this ' + ext.toUpperCase() + '. Analyzing by filename only.');
        }
        processing = false;
        runAnalysis(text, file.name);
      })
      .catch(function (err) {
        processing = false;
        showError('File read failed: ' + err.message);
        showLanding();
      });
  }

  /* =====================================================================
   * Event listeners
   * =================================================================== */

  function showFileLoaded(name) {
    uploadZone.classList.add('file-loaded');
    var label = uploadZone.querySelector('.upload-label');
    var hint = uploadZone.querySelector('.upload-hint');
    if (label) label.innerHTML = '<strong>' + esc(name) + '</strong>';
    if (hint) hint.textContent = 'Click to change file';
  }

  function clearFileLoaded() {
    uploadZone.classList.remove('file-loaded');
    var label = uploadZone.querySelector('.upload-label');
    var hint = uploadZone.querySelector('.upload-hint');
    if (label) label.innerHTML = 'Drag &amp; drop, or <span class="upload-browse">browse files</span>';
    if (hint) hint.textContent = 'TXT, PDF, DOCX';
  }

  function updateAnalyzeButton() {
    var hasFile = fileInput.files && fileInput.files.length > 0;
    var hasPaste = pasteInput.value.trim().length >= 10;
    btnAnalyze.disabled = !(hasFile || hasPaste);
  }

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

  uploadZone.addEventListener('click', function () {
    fileInput.click();
  });
  uploadZone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files.length > 0) {
      showFileLoaded(fileInput.files[0].name);
    } else {
      clearFileLoaded();
    }
    updateAnalyzeButton();
  });

  pasteInput.addEventListener('input', updateAnalyzeButton);

  btnAnalyze.addEventListener('click', function () {
    var text = pasteInput.value.trim();
    var file = fileInput.files && fileInput.files[0];
    if (file) {
      handleFile(file);
    } else if (text.length >= 10) {
      showLoading();
      setStage(stageExtract, 'done');
      runAnalysis(text, 'Pasted Contract');
    } else {
      showError('Please upload a file or paste at least 10 characters of text.');
    }
  });

  btnNewAnalysis.addEventListener('click', function () {
    pasteInput.value = '';
    fileInput.value = '';
    clearFileLoaded();
    btnAnalyze.disabled = true;
    showLanding();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  function handleClearAll() {
    if (!confirm('Delete all recent analyses?')) return;
    deleteAllAnalysesFromDb().then(function () { renderHistory(getHistory()); });
  }

  if (btnClearHistory) btnClearHistory.addEventListener('click', handleClearAll);
  if (btnClearResultsHistory) btnClearResultsHistory.addEventListener('click', handleClearAll);

  loadHistoryFromDb().then(function (history) {
    renderHistory(history);
  });
  updateAnalyzeButton();

})();
