/**
 * Policy Drafting & Gap Analysis — Use Case App (self-contained, no ES modules).
 * Form-based input with optional file upload or paste for existing policy.
 * Sends form data and policy text to the Nutanix AI endpoint via the local proxy.
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
   * Inference — policy drafting and gap analysis
   * =================================================================== */

  var SYSTEM_PROMPT =
    'You are a policy drafting AI. Draft organizational policies and identify gaps. Respond with JSON: ' +
    'coverageScore (1-100), title, summary, policyDraft (full policy text), sections (array of {heading, content}), ' +
    'gaps (array of {area, requirement, currentState, severity (Critical/High/Medium/Low), recommendation}), ' +
    'complianceNotes (array of strings). Respond ONLY with valid JSON.';

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

  function generatePolicy(formData, existingPolicyText) {
    var userContent = 'Draft a policy with the following inputs:\n\n' +
      'Policy Type: ' + (formData.policyType || '') + '\n' +
      'Regulatory Framework: ' + (formData.framework || '') + '\n' +
      'Organization Description: ' + (formData.orgDescription || '') + '\n' +
      'Specific Requirements: ' + (formData.requirements || '') + '\n';

    if (existingPolicyText && existingPolicyText.trim().length >= 20) {
      var trimmed = truncateText(existingPolicyText.trim(), MAX_INPUT_CHARS);
      userContent += '\n\nExisting policy to analyze for gaps:\n\n' + trimmed;
    }

    return chatCompletion(
      [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      { maxTokens: 4096 }
    )
      .then(function (response) {
        var raw = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
        if (!raw) throw new Error('No response content from AI');
        var parsed = parseAiJson(raw);
        if (!parsed.coverageScore && parsed.coverageScore !== 0) parsed.coverageScore = 75;
        if (!parsed.policyDraft) parsed.policyDraft = parsed.summary || 'No draft generated.';
        if (!parsed.gaps) parsed.gaps = [];
        if (!parsed.complianceNotes) parsed.complianceNotes = [];
        return parsed;
      });
  }

  /* =====================================================================
   * Database — persistent storage via /api/db/summaries
   * =================================================================== */

  var DB_API = '/api/db/summaries';
  var USE_CASE = 'uc24';
  var localHistory = [];

  function saveAnalysisToDb(result, name) {
    var title = name || (result.title || 'Untitled Policy');
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
        console.warn('Failed to persist policy:', err.message);
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
      .catch(function (err) { console.warn('Failed to delete policy:', err.message); });
  }

  function deleteAllAnalysesFromDb() {
    return fetch(DB_API + '?use_case=' + USE_CASE, { method: 'DELETE' })
      .then(function (res) { return res.json(); })
      .then(function () { localHistory = []; })
      .catch(function (err) { console.warn('Failed to clear history:', err.message); });
  }

  /* =====================================================================
   * File content extraction (identical to UC-01)
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
  var policyForm = document.getElementById('policy-form');
  var policyType = document.getElementById('policy-type');
  var framework = document.getElementById('framework');
  var orgDescription = document.getElementById('org-description');
  var fileInput = document.getElementById('file-input');
  var uploadZone = document.getElementById('upload-zone');
  var pasteExisting = document.getElementById('paste-existing');
  var requirements = document.getElementById('requirements');
  var btnGenerate = document.getElementById('btn-generate');
  var loadingSection = document.getElementById('loading-section');
  var resultsSection = document.getElementById('results-section');
  var btnNewAnalysis = document.getElementById('btn-new-analysis');
  var coverageScoreEl = document.getElementById('coverage-score');
  var coverageLabelEl = document.getElementById('coverage-label');
  var summaryEl = document.getElementById('summary-text');
  var policyDraftEl = document.getElementById('policy-draft');
  var gapsTbody = document.getElementById('gaps-tbody');
  var complianceNotesEl = document.getElementById('compliance-notes');
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
    if (loadingStatus) loadingStatus.textContent = 'Preparing request\u2026';
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

  function severityClass(sev) {
    var s = (sev || '').toLowerCase();
    if (s === 'critical') return 'severity-critical';
    if (s === 'high') return 'risk-high';
    if (s === 'medium') return 'risk-medium';
    return 'risk-low';
  }

  function coverageClass(score) {
    if (score >= 80) return 'risk-low';
    if (score >= 50) return 'risk-medium';
    return 'risk-high';
  }

  function renderCoverageScore(score) {
    var cls = coverageClass(score);
    coverageScoreEl.textContent = score;
    coverageScoreEl.className = 'risk-score-number ' + cls;
    coverageLabelEl.textContent = 'Coverage';
    coverageLabelEl.className = 'risk-badge ' + cls;
    var parent = coverageScoreEl && coverageScoreEl.parentElement;
    if (parent) {
      parent.classList.remove('risk-high', 'risk-medium', 'risk-low');
      parent.classList.add(cls);
    }
  }

  function renderSummary(text) { summaryEl.textContent = text || ''; }

  function renderPolicyDraft(draft, sections) {
    if (draft) {
      policyDraftEl.textContent = draft;
    } else if (sections && sections.length > 0) {
      var html = '';
      sections.forEach(function (sec) {
        html += '<h4>' + esc(sec.heading || '') + '</h4>' + esc(sec.content || '');
      });
      policyDraftEl.innerHTML = html;
    } else {
      policyDraftEl.textContent = 'No policy draft available.';
    }
  }

  function renderGaps(gaps) {
    gapsTbody.innerHTML = '';
    (gaps || []).forEach(function (g) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + esc(g.area) + '</td><td>' + esc(g.requirement) + '</td>' +
        '<td>' + esc(g.currentState) + '</td>' +
        '<td><span class="risk-badge ' + severityClass(g.severity) + '">' + esc(g.severity) + '</span></td>' +
        '<td>' + esc(g.recommendation) + '</td>';
      gapsTbody.appendChild(tr);
    });
  }

  function renderComplianceNotes(notes) {
    complianceNotesEl.innerHTML = '';
    (notes || []).forEach(function (note) {
      var card = document.createElement('div');
      card.className = 'deviation-item severity-low';
      card.setAttribute('role', 'listitem');
      card.innerHTML = '<p class="deviation-desc">' + esc(note) + '</p>';
      complianceNotesEl.appendChild(card);
    });
  }

  function displayResults(result) {
    renderCoverageScore(result.coverageScore);
    renderSummary(result.summary);
    renderPolicyDraft(result.policyDraft, result.sections);
    renderGaps(result.gaps);
    renderComplianceNotes(result.complianceNotes);
    showResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderHistoryInto(container, history) {
    container.innerHTML = '';
    if (!history || history.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: #9e9e9e; font-size: 0.9rem; text-align: center; padding: 0.5rem 0;';
      empty.textContent = 'No policies yet. Fill the form and generate a policy to get started.';
      container.appendChild(empty);
      return;
    }
    history.forEach(function (h) {
      var item = document.createElement('div');
      item.className = 'history-item';
      item.setAttribute('role', 'listitem');
      var score = h.data ? (h.data.coverageScore != null ? h.data.coverageScore : 0) : 0;
      var date = new Date(h.createdAt).toLocaleDateString();

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'history-item-delete';
      deleteBtn.setAttribute('aria-label', 'Delete this policy');
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
          (score ? '<span class="risk-badge ' + coverageClass(score) + '">' + score + '%</span>' : '') +
        '</div>';
      item.appendChild(deleteBtn);

      if (h.data) {
        item.title = 'Click to view this policy';
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
   * Policy generation pipeline
   * =================================================================== */

  var processing = false;

  function runGeneration(formData, existingPolicyText, title) {
    if (processing) return;
    processing = true;

    hide(errorBanner);

    var alreadyLoading = !loadingSection.classList.contains('hidden');
    if (!alreadyLoading) showLoading();

    setStage(stageSend, 'active', 'Sending to AI\u2026');

    generatePolicy(formData, existingPolicyText)
      .then(function (result) {
        setStage(stageSend, 'done');
        setStage(stageAnalyze, 'done');
        setStage(stageRender, 'active', 'Rendering results\u2026');

        displayResults(result);

        saveAnalysisToDb(result, title).then(function () {
          renderHistory(getHistory());
        });
        setStage(stageRender, 'done');
      })
      .catch(function (err) {
        console.error('Policy generation failed:', err);
        showError('Policy generation failed: ' + err.message);
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
        processing = false;
        if (text && text.trim().length >= 20) {
          pasteExisting.value = text.trim();
        } else if (!text) {
          showError('Could not extract text from this ' + ext.toUpperCase() + '. Try pasting the policy text instead.');
        }
      })
      .catch(function (err) {
        processing = false;
        showError('File read failed: ' + err.message);
      })
      .then(function () {
        if (processing === false) showLanding();
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
  });

  policyForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (processing) return;

    var formData = {
      policyType: policyType.value,
      framework: framework.value.trim(),
      orgDescription: orgDescription.value.trim(),
      requirements: requirements.value.trim(),
    };

    if (!formData.policyType || !formData.framework || !formData.orgDescription) {
      showError('Please fill in Policy Type, Regulatory Framework, and Organization Description.');
      return;
    }

    var existingPolicyText = pasteExisting.value.trim();
    var file = fileInput.files && fileInput.files[0];

    if (file) {
      processing = true;
      hide(errorBanner);
      showLoading();
      setStage(stageExtract, 'active', 'Extracting text from ' + file.name + '\u2026');

      extractText(file)
        .then(function (text) {
          setStage(stageExtract, 'done');
          if (text && text.trim().length >= 20) {
            existingPolicyText = text.trim();
          }
          var title = formData.policyType + ' Policy (' + formData.framework + ')';
          runGeneration(formData, existingPolicyText, title);
        })
        .catch(function (err) {
          processing = false;
          showError('File read failed: ' + err.message);
          showLanding();
        });
    } else {
      var title = formData.policyType + ' Policy (' + formData.framework + ')';
      runGeneration(formData, existingPolicyText, title);
    }
  });

  btnNewAnalysis.addEventListener('click', function () {
    policyForm.reset();
    fileInput.value = '';
    pasteExisting.value = '';
    clearFileLoaded();
    showLanding();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  function handleClearAll() {
    if (!confirm('Delete all recent policies?')) return;
    deleteAllAnalysesFromDb().then(function () { renderHistory(getHistory()); });
  }

  if (btnClearHistory) btnClearHistory.addEventListener('click', handleClearAll);
  if (btnClearResultsHistory) btnClearResultsHistory.addEventListener('click', handleClearAll);

  /* =====================================================================
   * Init
   * =================================================================== */

  loadHistoryFromDb().then(function (history) {
    renderHistory(history);
  });

})();
