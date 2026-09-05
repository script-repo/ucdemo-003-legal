/**
 * Document Summarization — Use Case App (self-contained, no ES modules).
 * Supports file upload (TXT/PDF/DOCX) and direct text paste.
 * Sends document text to the Nutanix AI endpoint via the local proxy for
 * summarization. Falls back to mock data when AI services are unreachable.
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
   * Inference — document summarization via chat completions
   * =================================================================== */

  var DETAIL_CONFIGS = {
    brief: {
      maxTokens: 1024,
      prompt:
        'You are a legal document summarization AI. Produce a BRIEF summary.\n' +
        'Respond with a JSON object containing:\n' +
        '- "title": document title or best guess\n' +
        '- "documentType": type of document (contract, deposition, brief, etc.)\n' +
        '- "executiveSummary": 1-2 sentences only, the absolute essentials\n' +
        '- "keyFacts": array of 3-4 most critical facts only, each { "category" (date/party/issue/term/obligation), "value", "context" }\n' +
        '- "sections": OMIT this field entirely for brief summaries\n' +
        '- "wordCount": original word count estimate\n' +
        '- "summaryWordCount": summary word count\n' +
        'Keep the entire response under 200 words. Respond ONLY with valid JSON, no markdown fences.',
    },
    standard: {
      maxTokens: 2048,
      prompt:
        'You are a legal document summarization AI. Produce a STANDARD summary.\n' +
        'Respond with a JSON object containing:\n' +
        '- "title": document title or best guess\n' +
        '- "documentType": type of document (contract, deposition, brief, etc.)\n' +
        '- "executiveSummary": 3-5 sentence overview covering key points and risks\n' +
        '- "keyFacts": array of 5-8 important facts, each { "category" (date/party/issue/term/obligation), "value", "context" }\n' +
        '- "sections": array of { "heading", "summary" } for major sections (1-2 sentences each)\n' +
        '- "wordCount": original word count estimate\n' +
        '- "summaryWordCount": summary word count\n' +
        'Respond ONLY with valid JSON, no markdown fences.',
    },
    detailed: {
      maxTokens: 4096,
      prompt:
        'You are a legal document summarization AI. Produce a DETAILED, comprehensive summary.\n' +
        'Respond with a JSON object containing:\n' +
        '- "title": document title or best guess\n' +
        '- "documentType": type of document (contract, deposition, brief, etc.)\n' +
        '- "executiveSummary": 5-8 sentence thorough overview covering all major points, risks, obligations, and notable provisions\n' +
        '- "keyFacts": array of 8-15 facts capturing every significant date, party, issue, term, and obligation, each { "category" (date/party/issue/term/obligation), "value", "context" }\n' +
        '- "sections": array of { "heading", "summary" } for EVERY section in the document (3-5 sentences per section summary, include specific figures, deadlines, and legal language)\n' +
        '- "wordCount": original word count estimate\n' +
        '- "summaryWordCount": summary word count\n' +
        'Be thorough. Do not omit any section. Respond ONLY with valid JSON, no markdown fences.',
    },
  };

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

  var INPUT_LIMITS = { brief: 12000, standard: 8000, detailed: 4000 };

  function truncateText(text, maxChars) {
    if (text.length <= maxChars) return text;
    var headSize = Math.floor(maxChars * 0.6);
    var tailSize = Math.floor(maxChars * 0.3);
    return text.substring(0, headSize) +
      '\n\n[... middle truncated (' + text.length.toLocaleString() + ' chars total) ...]\n\n' +
      text.substring(text.length - tailSize);
  }

  function summarizeDocument(text, detailLevel, filename) {
    var config = DETAIL_CONFIGS[detailLevel] || DETAIL_CONFIGS.standard;

    if (!text || text.trim().length < 50) {
      return Promise.reject(new Error('Document text is too short or could not be extracted. Please try a different file or paste the text directly.'));
    }

    var charLimit = INPUT_LIMITS[detailLevel] || INPUT_LIMITS.standard;
    var trimmed = truncateText(text.trim(), charLimit);
    var userContent = 'Summarize the following document:\n\n' + trimmed;

    return chatCompletion(
      [{ role: 'system', content: config.prompt }, { role: 'user', content: userContent }],
      { maxTokens: config.maxTokens }
    )
      .then(function (response) {
        var raw = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
        if (!raw) throw new Error('No response content from AI');
        var parsed = parseAiJson(raw);
        if (!parsed.executiveSummary) throw new Error('AI response missing required fields');
        return parsed;
      });
  }

  /* =====================================================================
   * Database — persistent summary storage via /api/db/summaries
   * =================================================================== */

  var DB_API = '/api/db/summaries';
  var USE_CASE = 'uc03';
  var localSummaries = [];

  function saveSummaryToDb(result) {
    var title = result.title || 'Untitled';
    return fetch(DB_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ use_case: USE_CASE, title: title, data: result }),
    })
      .then(function (res) { return res.json(); })
      .then(function (saved) {
        localSummaries.unshift({
          id: saved.id,
          title: title,
          createdAt: saved.createdAt,
          data: result,
        });
        if (localSummaries.length > 10) localSummaries = localSummaries.slice(0, 10);
        return saved;
      })
      .catch(function (err) {
        console.warn('Failed to persist summary:', err.message);
        localSummaries.unshift({
          id: 'local-' + Date.now(),
          title: title,
          createdAt: new Date().toISOString(),
          data: result,
        });
      });
  }

  function loadSummariesFromDb() {
    return fetch(DB_API + '?use_case=' + USE_CASE + '&limit=10')
      .then(function (res) { return res.json(); })
      .then(function (rows) {
        localSummaries = rows;
        return rows;
      })
      .catch(function (err) {
        console.warn('Failed to load summaries:', err.message);
        return localSummaries;
      });
  }

  function getSummaries() { return localSummaries.slice(); }

  function deleteSummaryFromDb(id) {
    return fetch(DB_API + '?use_case=' + USE_CASE + '&id=' + id, { method: 'DELETE' })
      .then(function (res) { return res.json(); })
      .then(function () {
        localSummaries = localSummaries.filter(function (s) { return s.id !== id; });
      })
      .catch(function (err) { console.warn('Failed to delete summary:', err.message); });
  }

  function deleteAllSummariesFromDb() {
    return fetch(DB_API + '?use_case=' + USE_CASE, { method: 'DELETE' })
      .then(function (res) { return res.json(); })
      .then(function () { localSummaries = []; })
      .catch(function (err) { console.warn('Failed to clear summaries:', err.message); });
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
  var btnSummarize = document.getElementById('btn-summarize');
  var loadingSection = document.getElementById('loading-section');
  var resultsSection = document.getElementById('results-section');
  var btnNewSummary = document.getElementById('btn-new-summary');
  var summaryTitleCard = document.getElementById('summary-title-card');
  var executiveSummary = document.getElementById('executive-summary');
  var keyFactsList = document.getElementById('key-facts-list');
  var sectionsList = document.getElementById('sections-list');
  var wordCountBar = document.getElementById('word-count-bar');
  var historyList = document.getElementById('history-list');
  var resultsHistoryList = document.getElementById('results-history-list');
  var btnClearHistory = document.getElementById('btn-clear-history');
  var btnClearResultsHistory = document.getElementById('btn-clear-results-history');
  var errorBanner = document.getElementById('error-banner');
  var loadingStatus = document.getElementById('loading-status');
  var stageExtract = document.getElementById('stage-extract');
  var stageSend = document.getElementById('stage-send');
  var stageSummarize = document.getElementById('stage-summarize');
  var stageRender = document.getElementById('stage-render');
  var allStages = [stageExtract, stageSend, stageSummarize, stageRender];

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

  function getDetailLevel() {
    var checked = document.querySelector('input[name="summary-length"]:checked');
    return (checked && checked.value) || 'standard';
  }

  /* =====================================================================
   * Rendering helpers
   * =================================================================== */

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  var DETAIL_LABELS = { brief: 'Brief', standard: 'Standard', detailed: 'Detailed' };

  function renderTitleCard(title, documentType, detailLevel) {
    var levelBadge = detailLevel ? '<span class="detail-badge detail-' + detailLevel + '">' + esc(DETAIL_LABELS[detailLevel] || detailLevel) + '</span>' : '';
    summaryTitleCard.innerHTML =
      '<h2 class="summary-title">' + esc(title || 'Untitled Document') + '</h2>' +
      '<p class="summary-doc-type">' + esc(documentType || 'Document') + ' ' + levelBadge + '</p>';
  }

  function renderExecutiveSummary(text) {
    executiveSummary.innerHTML = '<p>' + esc(text || '') + '</p>';
  }

  function renderKeyFacts(facts) {
    keyFactsList.innerHTML = '';
    (facts || []).forEach(function (f) {
      var tag = document.createElement('span');
      tag.className = 'key-fact-tag';
      tag.setAttribute('role', 'listitem');
      tag.innerHTML =
        '<span class="fact-category">' + esc((f.category || '').toLowerCase()) + ':</span> ' +
        '<span class="fact-value">' + esc(f.value || '') + '</span>';
      if (f.context) tag.innerHTML += ' <span class="fact-context">(' + esc(f.context) + ')</span>';
      keyFactsList.appendChild(tag);
    });
  }

  function renderSections(sections) {
    sectionsList.innerHTML = '';
    (sections || []).forEach(function (s) {
      var item = document.createElement('div');
      item.className = 'section-item';
      item.setAttribute('role', 'listitem');
      item.innerHTML =
        '<h4 class="section-item-heading">' + esc(s.heading || '') + '</h4>' +
        '<p class="section-summary">' + esc(s.summary || '') + '</p>';
      sectionsList.appendChild(item);
    });
  }

  function renderWordCount(original, summary) {
    wordCountBar.innerHTML =
      '<div class="word-count-item">Original: <span class="word-count-value">' + (original || 0).toLocaleString() + '</span> words</div>' +
      '<div class="word-count-item">Summary: <span class="word-count-value">' + (summary || 0).toLocaleString() + '</span> words</div>';
  }

  function displaySummary(result) {
    renderTitleCard(result.title, result.documentType, result.detailLevel);
    renderExecutiveSummary(result.executiveSummary);
    renderKeyFacts(result.keyFacts);
    renderSections(result.sections);
    renderWordCount(result.wordCount, result.summaryWordCount);
    showResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderHistoryInto(container, summaries) {
    container.innerHTML = '';
    if (!summaries || summaries.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: #9e9e9e; font-size: 0.9rem; text-align: center; padding: 0.5rem 0;';
      empty.textContent = 'No summaries yet. Upload or paste a document to get started.';
      container.appendChild(empty);
      return;
    }
    summaries.forEach(function (s) {
      var item = document.createElement('div');
      item.className = 'history-item';
      item.setAttribute('role', 'listitem');
      var date = new Date(s.createdAt).toLocaleDateString();
      var level = s.data && s.data.detailLevel ? s.data.detailLevel : '';
      var levelBadge = level ? '<span class="detail-badge detail-' + level + '">' + esc(DETAIL_LABELS[level] || level) + '</span>' : '';

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'history-item-delete';
      deleteBtn.setAttribute('aria-label', 'Delete this summary');
      deleteBtn.title = 'Delete';
      deleteBtn.innerHTML = '&#10005;';
      deleteBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!confirm('Delete "' + (s.title || 'Untitled') + '"?')) return;
        deleteSummaryFromDb(s.id).then(function () { renderHistory(getSummaries()); });
      });

      item.innerHTML =
        '<div class="history-item-name">' + esc(s.title) + '</div>' +
        '<div class="history-meta">' +
          '<span class="history-item-date">' + date + '</span>' +
          levelBadge +
        '</div>';
      item.appendChild(deleteBtn);

      if (s.data) {
        item.title = 'Click to view this summary';
        item.addEventListener('click', function () {
          displaySummary(s.data);
        });
      } else {
        item.classList.add('no-data');
      }
      container.appendChild(item);
    });
  }

  function toggleClearButtons(hasSummaries) {
    if (btnClearHistory) {
      if (hasSummaries) btnClearHistory.classList.remove('hidden');
      else btnClearHistory.classList.add('hidden');
    }
    if (btnClearResultsHistory) {
      if (hasSummaries) btnClearResultsHistory.classList.remove('hidden');
      else btnClearResultsHistory.classList.add('hidden');
    }
  }

  function renderHistory(summaries) {
    renderHistoryInto(historyList, summaries);
    if (resultsHistoryList) renderHistoryInto(resultsHistoryList, summaries);
    toggleClearButtons(summaries && summaries.length > 0);
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
   * Summarization pipeline
   * =================================================================== */

  var processing = false;

  function runSummarization(text, name) {
    if (processing) return;
    processing = true;

    var detailLevel = getDetailLevel();
    hide(errorBanner);

    var alreadyLoading = !loadingSection.classList.contains('hidden');
    if (!alreadyLoading) showLoading();

    setStage(stageSend, 'active', 'Sending document to AI\u2026');

    summarizeDocument(text, detailLevel, name)
      .then(function (result) {
        setStage(stageSend, 'done');
        setStage(stageSummarize, 'done');
        setStage(stageRender, 'active', 'Rendering results\u2026');

        if (!result.title) result.title = name || 'Pasted Text';
        result.detailLevel = detailLevel;
        renderTitleCard(result.title, result.documentType, result.detailLevel);
        renderExecutiveSummary(result.executiveSummary);
        renderKeyFacts(result.keyFacts);
        renderSections(result.sections);
        renderWordCount(result.wordCount, result.summaryWordCount);

        saveSummaryToDb(result).then(function () {
          renderHistory(getSummaries());
        });
        setStage(stageRender, 'done');
        showResults();
      })
      .catch(function (err) {
        console.error('Summarization failed:', err);
        showError('Summarization failed: ' + err.message);
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
        if (!text || text.trim().length < 50) {
          processing = false;
          showError('Could not extract text from this ' + ext.toUpperCase() + ' file. Please try pasting the text directly.');
          showLanding();
          return;
        }
        processing = false;
        runSummarization(text, file.name);
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

  function updateSummarizeButton() {
    var hasFile = fileInput.files && fileInput.files.length > 0;
    var hasPaste = pasteInput.value.trim().length >= 10;
    btnSummarize.disabled = !(hasFile || hasPaste);
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
    updateSummarizeButton();
  });

  // Paste textarea — enable button when text is entered
  pasteInput.addEventListener('input', updateSummarizeButton);

  btnSummarize.addEventListener('click', function () {
    var text = pasteInput.value.trim();
    var file = fileInput.files && fileInput.files[0];
    if (file) {
      handleFile(file);
    } else if (text.length >= 10) {
      showLoading();
      setStage(stageExtract, 'done');
      runSummarization(text, 'Pasted Document');
    } else {
      showError('Please upload a file or paste at least 10 characters of text.');
    }
  });

  // New summary button
  btnNewSummary.addEventListener('click', function () {
    pasteInput.value = '';
    fileInput.value = '';
    clearFileLoaded();
    btnSummarize.disabled = true;
    showLanding();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* =====================================================================
   * Clear history
   * =================================================================== */

  function handleClearAll() {
    if (!confirm('Delete all recent summaries?')) return;
    deleteAllSummariesFromDb().then(function () { renderHistory(getSummaries()); });
  }

  if (btnClearHistory) btnClearHistory.addEventListener('click', handleClearAll);
  if (btnClearResultsHistory) btnClearResultsHistory.addEventListener('click', handleClearAll);

  /* =====================================================================
   * Init — load persisted summaries from the database
   * =================================================================== */

  loadSummariesFromDb().then(function (summaries) {
    renderHistory(summaries);
  });

})();
