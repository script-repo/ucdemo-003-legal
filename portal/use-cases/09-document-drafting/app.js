/**
 * Document Drafting — Use Case App (self-contained, no ES modules).
 * Form-based input: document type, party names, matter description, key dates, special terms.
 * Sends form data to the Nutanix AI endpoint via the local proxy for draft generation.
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
    if (!opts.maxTokens) opts.maxTokens = AI_CONFIG.defaults.maxTokens;
    if (opts.stream === undefined) opts.stream = AI_CONFIG.defaults.stream;
    // Tries Nutanix Enterprise AI first (via the local proxy, or directly
    // with a user-saved key from Settings), then falls back to OpenRouter
    // if configured. See portal/shared/inference-client.js.
    return window.LegalAIInference.chatCompletion(messages, opts, AI_CONFIG);
  }

  /* =====================================================================
   * Inference — document draft generation via chat completions
   * =================================================================== */

  var SYSTEM_PROMPT =
    'You are a legal document drafting AI. When given document type and context (party names, matter description, key dates, special terms), generate a professional first draft. ' +
    'Respond with a JSON object containing:\n' +
    '- "documentType": string (e.g., NDA, Engagement Letter, Notice)\n' +
    '- "title": string (document title)\n' +
    '- "draft": string (the full draft text, properly formatted)\n' +
    '- "keyTerms": array of objects with { "term": string, "value": string } for extracted key terms (parties, dates, etc.)\n' +
    '- "warnings": array of strings for any non-standard items or items requiring attorney review\n' +
    'Use standard legal language. Respond ONLY with valid JSON, no markdown fences.';

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

  function generateDraft(formData) {
    var docType = (formData.docType || '').trim();
    var partyNames = (formData.partyNames || '').trim();
    var matterDesc = (formData.matterDesc || '').trim();
    var keyDates = (formData.keyDates || '').trim();
    var specialTerms = (formData.specialTerms || '').trim();

    if (!docType || !partyNames || !matterDesc) {
      return Promise.reject(new Error('Document type, party names, and matter description are required.'));
    }

    var userContent = 'Generate a ' + docType + ' with the following context:\n\n' +
      'Party Names:\n' + (partyNames || '(not specified)') + '\n\n' +
      'Matter Description:\n' + truncateText(matterDesc, MAX_INPUT_CHARS) + '\n\n' +
      'Key Dates:\n' + (keyDates || '(not specified)') + '\n\n' +
      'Special Terms:\n' + (specialTerms || '(none)');

    return chatCompletion(
      [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      { maxTokens: 4096 }
    )
      .then(function (response) {
        var raw = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
        if (!raw) throw new Error('No response content from AI');
        var parsed = parseAiJson(raw);
        if (!parsed.draft) throw new Error('Response missing draft text');
        return parsed;
      });
  }

  /* =====================================================================
   * Database — persistent draft storage via /api/db/summaries
   * =================================================================== */

  var DB_API = '/api/db/summaries';
  var USE_CASE = 'uc09';
  var localHistory = [];

  function saveToDb(result, name) {
    var title = name || (result.title || result.documentType || 'Untitled Draft');
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
        console.warn('Failed to persist draft:', err.message);
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
      .catch(function (err) { console.warn('Failed to delete draft:', err.message); });
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
  var draftForm = document.getElementById('draft-form');
  var docTypeSelect = document.getElementById('doc-type');
  var partyNamesInput = document.getElementById('party-names');
  var matterDescInput = document.getElementById('matter-desc');
  var keyDatesInput = document.getElementById('key-dates');
  var specialTermsInput = document.getElementById('special-terms');
  var btnGenerate = document.getElementById('btn-generate');
  var loadingSection = document.getElementById('loading-section');
  var resultsSection = document.getElementById('results-section');
  var btnNewDraft = document.getElementById('btn-new-draft');
  var docTypeBadge = document.getElementById('doc-type-badge');
  var draftTextEl = document.getElementById('draft-text');
  var keyTermsList = document.getElementById('key-terms-list');
  var warningsList = document.getElementById('warnings-list');
  var historyList = document.getElementById('history-list');
  var resultsHistoryList = document.getElementById('results-history-list');
  var btnClearHistory = document.getElementById('btn-clear-history');
  var btnClearResultsHistory = document.getElementById('btn-clear-results-history');
  var errorBanner = document.getElementById('error-banner');
  var loadingStatus = document.getElementById('loading-status');
  var stagePrepare = document.getElementById('stage-prepare');
  var stageGenerate = document.getElementById('stage-generate');
  var stageFormat = document.getElementById('stage-format');
  var stageDone = document.getElementById('stage-done');
  var allStages = [stagePrepare, stageGenerate, stageFormat, stageDone];

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
    if (loadingStatus) loadingStatus.textContent = 'Preparing\u2026';
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

  function displayResults(result) {
    docTypeBadge.textContent = result.documentType || result.title || 'Draft';
    docTypeBadge.className = 'risk-badge doc-type-badge';

    draftTextEl.textContent = result.draft || '(No draft text)';

    keyTermsList.innerHTML = '';
    (result.keyTerms || []).forEach(function (kt) {
      var item = document.createElement('div');
      item.className = 'key-term-item';
      item.setAttribute('role', 'listitem');
      item.innerHTML = '<span class="key-term-name">' + esc(kt.term) + '</span><span class="key-term-value">' + esc(kt.value) + '</span>';
      keyTermsList.appendChild(item);
    });

    warningsList.innerHTML = '';
    (result.warnings || []).forEach(function (w) {
      var item = document.createElement('div');
      item.className = 'warning-item';
      item.setAttribute('role', 'listitem');
      item.textContent = w;
      warningsList.appendChild(item);
    });

    if ((result.warnings || []).length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: var(--color-text-muted); font-size: 0.9rem; font-style: italic;';
      empty.textContent = 'No warnings.';
      warningsList.appendChild(empty);
    }

    showResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderHistoryInto(container, history) {
    container.innerHTML = '';
    if (!history || history.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: #9e9e9e; font-size: 0.9rem; text-align: center; padding: 0.5rem 0;';
      empty.textContent = 'No drafts yet. Fill the form and generate a draft to get started.';
      container.appendChild(empty);
      return;
    }
    history.forEach(function (h) {
      var item = document.createElement('div');
      item.className = 'history-item';
      item.setAttribute('role', 'listitem');
      var docType = h.data ? (h.data.documentType || h.data.title) : '';
      var date = new Date(h.createdAt).toLocaleDateString();

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'history-item-delete';
      deleteBtn.setAttribute('aria-label', 'Delete this draft');
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
          (docType ? '<span class="risk-badge doc-type-badge">' + esc(docType) + '</span>' : '') +
        '</div>';
      item.appendChild(deleteBtn);

      if (h.data) {
        item.title = 'Click to view this draft';
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
   * Form validation
   * =================================================================== */

  function isFormValid() {
    var docType = (docTypeSelect && docTypeSelect.value || '').trim();
    var partyNames = (partyNamesInput && partyNamesInput.value || '').trim();
    var matterDesc = (matterDescInput && matterDescInput.value || '').trim();
    return docType.length > 0 && partyNames.length > 0 && matterDesc.length > 0;
  }

  function updateGenerateButton() {
    if (btnGenerate) btnGenerate.disabled = !isFormValid();
  }

  /* =====================================================================
   * Draft generation pipeline
   * =================================================================== */

  var processing = false;

  function runDraftGeneration(formData) {
    if (processing) return;
    processing = true;

    hide(errorBanner);

    var alreadyLoading = !loadingSection.classList.contains('hidden');
    if (!alreadyLoading) showLoading();

    setStage(stagePrepare, 'done');
    setStage(stageGenerate, 'active', 'Generating draft\u2026');

    generateDraft(formData)
      .then(function (result) {
        setStage(stageGenerate, 'done');
        setStage(stageFormat, 'active', 'Formatting\u2026');

        displayResults(result);

        var title = result.title || result.documentType || 'Untitled Draft';
        saveToDb(result, title).then(function () {
          renderHistory(getHistory());
        });
        setStage(stageFormat, 'done');
        setStage(stageDone, 'done');
      })
      .catch(function (err) {
        console.error('Draft generation failed:', err);
        showError('Draft generation failed: ' + err.message);
        showLanding();
      })
      .then(function () { processing = false; });
  }

  /* =====================================================================
   * Event listeners
   * =================================================================== */

  if (draftForm) {
    draftForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (processing || !isFormValid()) return;

      var formData = {
        docType: docTypeSelect.value,
        partyNames: partyNamesInput.value,
        matterDesc: matterDescInput.value,
        keyDates: keyDatesInput.value,
        specialTerms: specialTermsInput.value,
      };

      runDraftGeneration(formData);
    });
  }

  [docTypeSelect, partyNamesInput, matterDescInput, keyDatesInput, specialTermsInput].forEach(function (el) {
    if (el) el.addEventListener('input', updateGenerateButton);
  });
  if (docTypeSelect) docTypeSelect.addEventListener('change', updateGenerateButton);

  if (btnNewDraft) {
    btnNewDraft.addEventListener('click', function () {
      if (draftForm) draftForm.reset();
      updateGenerateButton();
      showLanding();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function handleClearAll() {
    if (!confirm('Delete all recent drafts?')) return;
    deleteAllFromDb().then(function () { renderHistory(getHistory()); });
  }

  if (btnClearHistory) btnClearHistory.addEventListener('click', handleClearAll);
  if (btnClearResultsHistory) btnClearResultsHistory.addEventListener('click', handleClearAll);

  /* =====================================================================
   * Init — load persisted drafts from the database
   * =================================================================== */

  loadHistoryFromDb().then(function (history) {
    renderHistory(history);
  });
  updateGenerateButton();

})();
