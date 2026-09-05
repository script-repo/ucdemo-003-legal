/**
 * M&A Due Diligence — Use Case App (self-contained, no ES modules).
 * Supports file upload (TXT/PDF/DOCX) and direct text paste.
 * Sends deal document text to the Nutanix AI endpoint via the local proxy for
 * clause extraction and diligence analysis. Results are persisted to the database for history.
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
   * Inference — M&A due diligence analysis via chat completions
   * =================================================================== */

  var SYSTEM_PROMPT =
    'You are an M&A due diligence AI. When given document text from a deal, respond with JSON containing:\n' +
    '- "riskScore": integer 1-100\n' +
    '- "riskLevel": "Low", "Medium", or "High"\n' +
    '- "summary": 2-3 sentences\n' +
    '- "keyTerms": array of { "clause", "type" (change-of-control/assignment/consent/indemnification/termination/IP), "risk" (Low/Medium/High), "excerpt", "implication" }\n' +
    '- "issues": array of { "title", "severity" (Low/Medium/High), "description", "recommendation" }\n' +
    '- "parties": array of party names found\n' +
    'Analyze every material clause. Respond ONLY with valid JSON, no markdown fences.';

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

  function analyzeDeal(text, filename) {
    if (!text || text.trim().length < 50) {
      return Promise.reject(new Error('Document text is too short or could not be extracted. Please try a different file or paste the text directly.'));
    }

    var trimmed = truncateText(text.trim(), MAX_INPUT_CHARS);
    var userContent = 'Analyze the following deal document(s) for M&A due diligence:\n\n' + trimmed;

    return chatCompletion(
      [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      { maxTokens: 4096 }
    )
      .then(function (response) {
        var raw = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
        if (!raw) throw new Error('No response content from AI');
        var parsed = parseAiJson(raw);
        if (!parsed.riskScore || !parsed.keyTerms) throw new Error('Response missing required fields');
        return parsed;
      });
  }

  /* =====================================================================
   * Database — persistent analysis storage via /api/db/summaries
   * =================================================================== */

  var DB_API = '/api/db/summaries';
  var USE_CASE = 'uc10';
  var localHistory = [];

  function saveAnalysisToDb(result, name) {
    var title = name || 'Untitled Document';
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
  var riskScoreEl = document.getElementById('risk-score');
  var riskLevelEl = document.getElementById('risk-level');
  var summaryEl = document.getElementById('summary-text');
  var clauseTbody = document.getElementById('clause-tbody');
  var issuesList = document.getElementById('issues-list');
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

  function riskClass(level) {
    var l = (level || '').toLowerCase();
    if (l === 'high') return 'risk-high';
    if (l === 'medium') return 'risk-medium';
    return 'risk-low';
  }

  function renderRiskScore(score, level) {
    riskScoreEl.textContent = score;
    riskScoreEl.className = 'risk-score-number ' + riskClass(level);
    riskLevelEl.textContent = level;
    riskLevelEl.className = 'risk-badge ' + riskClass(level);
  }

  function renderSummary(text) { summaryEl.textContent = text; }

  function renderKeyTerms(terms, sourceDoc) {
    clauseTbody.innerHTML = '';
    (terms || []).forEach(function (t) {
      var tr = document.createElement('tr');
      var source = t.sourceDocument || t.excerpt || sourceDoc || '—';
      tr.innerHTML =
        '<td>' + esc(t.clause) + '</td><td>' + esc(t.type) + '</td>' +
        '<td><span class="risk-badge ' + riskClass(t.risk) + '">' + esc(t.risk) + '</span></td>' +
        '<td>' + esc(source) + '</td>';
      clauseTbody.appendChild(tr);
    });
  }

  function renderIssues(issues) {
    issuesList.innerHTML = '';
    (issues || []).forEach(function (i) {
      var card = document.createElement('div');
      card.className = 'deviation-item severity-' + (i.severity || 'low').toLowerCase();
      card.setAttribute('role', 'listitem');
      card.innerHTML =
        '<div class="deviation-header"><strong>' + esc(i.title) + '</strong>' +
        '<span class="risk-badge ' + riskClass(i.severity) + '">' + esc(i.severity) + '</span></div>' +
        '<p class="deviation-desc">' + esc(i.description) + '</p>' +
        '<p class="deviation-rec"><strong>Recommendation:</strong> ' + esc(i.recommendation) + '</p>';
      issuesList.appendChild(card);
    });
  }

  function displayAnalysis(result, sourceDoc) {
    renderRiskScore(result.riskScore, result.riskLevel);
    renderSummary(result.summary);
    renderKeyTerms(result.keyTerms, sourceDoc);
    renderIssues(result.issues);
    showResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderHistoryInto(container, history) {
    container.innerHTML = '';
    if (!history || history.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: #9e9e9e; font-size: 0.9rem; text-align: center; padding: 0.5rem 0;';
      empty.textContent = 'No analyses yet. Upload or paste documents to get started.';
      container.appendChild(empty);
      return;
    }
    history.forEach(function (h) {
      var item = document.createElement('div');
      item.className = 'history-item';
      item.setAttribute('role', 'listitem');
      var score = h.data ? (h.data.riskScore || 0) : 0;
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
        item.addEventListener('click', function () { displayAnalysis(h.data, h.title); });
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

    setStage(stageSend, 'active', 'Analyzing clauses\u2026');

    analyzeDeal(text, name)
      .then(function (result) {
        setStage(stageSend, 'done');
        setStage(stageAnalyze, 'done');
        setStage(stageRender, 'active', 'Rendering results\u2026');

        displayAnalysis(result, name);

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

  // Drag and drop
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

  // Paste textarea — enable button when text is entered
  pasteInput.addEventListener('input', updateAnalyzeButton);

  btnAnalyze.addEventListener('click', function () {
    var text = pasteInput.value.trim();
    var file = fileInput.files && fileInput.files[0];
    if (file) {
      handleFile(file);
    } else if (text.length >= 10) {
      showLoading();
      setStage(stageExtract, 'done');
      runAnalysis(text, 'Pasted Document');
    } else {
      showError('Please upload a file or paste at least 10 characters of text.');
    }
  });

  // New analysis button
  btnNewAnalysis.addEventListener('click', function () {
    pasteInput.value = '';
    fileInput.value = '';
    clearFileLoaded();
    btnAnalyze.disabled = true;
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
  updateAnalyzeButton();

})();
