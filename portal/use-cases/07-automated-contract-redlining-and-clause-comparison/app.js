/**
 * Automated Contract Redlining & Clause Comparison — Use Case App (self-contained, no ES modules).
 * Supports dual file upload (counterparty draft + firm standard) or text paste for both.
 * Sends both documents to the Nutanix AI endpoint via the local proxy for clause-by-clause
 * comparison with redline markup. Falls back to mock data when AI services are unreachable.
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
    if (!opts.maxTokens) opts.maxTokens = AI_CONFIG.defaults.maxTokens;
    if (opts.stream === undefined) opts.stream = AI_CONFIG.defaults.stream;
    // Tries Nutanix Enterprise AI first (via the local proxy, or directly
    // with a user-saved key from Settings), then falls back to OpenRouter
    // if configured. See portal/shared/inference-client.js.
    return window.LegalAIInference.chatCompletion(messages, opts, AI_CONFIG);
  }

  /* =====================================================================
   * Inference — redline comparison via chat completions
   * =================================================================== */

  var SYSTEM_PROMPT =
    'You are a legal contract redlining AI. Given two contract texts (counterparty draft and firm standard) and contract type, respond with a JSON object containing:\n' +
    '- "contractType": string (identified contract type)\n' +
    '- "overallRisk": { "level": "Low"|"Medium"|"High"|"Critical", "score": number 1-10 }\n' +
    '- "summary": { "clausesCompared": number, "deviationsFound": number, "criticalIssues": number, "acceptableAsIs": number }\n' +
    '- "clauses": array of { "heading", "standardText", "counterpartyText", "deviationType": "Added"|"Removed"|"Modified"|"Unchanged", "severity": "Minor"|"Moderate"|"Major"|"Critical", "analysis", "suggestedLanguage", "recommendation": "Accept"|"Reject"|"Negotiate" }\n' +
    '- "missingClauses": array of clause headings in standard but missing from draft\n' +
    '- "addedClauses": array of clause headings in draft but not in standard\n' +
    '- "recommendations": array of overall recommendation strings\n' +
    'Only include clauses that are present. Respond ONLY with valid JSON, no markdown fences.';

  var MOCK_REDLINE = {
    contractType: 'NDA',
    overallRisk: { level: 'Medium', score: 6 },
    summary: {
      clausesCompared: 8,
      deviationsFound: 4,
      criticalIssues: 1,
      acceptableAsIs: 4,
    },
    clauses: [
      {
        heading: 'Definition of Confidential Information',
        standardText: 'Confidential Information means all non-public information disclosed by the Disclosing Party.',
        counterpartyText: 'Confidential Information means all information disclosed by the Disclosing Party, whether or not marked as confidential.',
        deviationType: 'Modified',
        severity: 'Major',
        analysis: 'Counterparty broadens definition to include non-marked information, increasing risk of inadvertent disclosure claims.',
        suggestedLanguage: 'Confidential Information means all non-public information disclosed by the Disclosing Party.',
        recommendation: 'Accept',
      },
      {
        heading: 'Termination',
        standardText: 'Either party may terminate this Agreement upon 30 days prior written notice.',
        counterpartyText: 'Either party may terminate this Agreement upon 14 days prior written notice.',
        deviationType: 'Modified',
        severity: 'Moderate',
        analysis: 'Shorter notice period reduces flexibility for orderly wind-down.',
        suggestedLanguage: 'Either party may terminate this Agreement upon 30 days prior written notice.',
        recommendation: 'Negotiate',
      },
      {
        heading: 'Survival',
        standardText: 'Sections 7, 8, and 9 shall survive termination for 5 years.',
        counterpartyText: 'Sections 7, 8, and 9 shall survive termination for 3 years.',
        deviationType: 'Modified',
        severity: 'Minor',
        analysis: 'Shorter survival period; may be acceptable depending on business needs.',
        suggestedLanguage: 'Sections 7, 8, and 9 shall survive termination for 5 years.',
        recommendation: 'Negotiate',
      },
      {
        heading: 'Governing Law',
        standardText: 'This Agreement shall be governed by the laws of the State of Delaware.',
        counterpartyText: 'This Agreement shall be governed by the laws of the State of New York.',
        deviationType: 'Modified',
        severity: 'Major',
        analysis: 'Different jurisdiction may affect dispute resolution and enforceability.',
        suggestedLanguage: 'This Agreement shall be governed by the laws of the State of Delaware.',
        recommendation: 'Reject',
      },
      {
        heading: 'Confidentiality',
        standardText: 'The Receiving Party shall not disclose Confidential Information to third parties.',
        counterpartyText: 'The Receiving Party shall not disclose Confidential Information to third parties.',
        deviationType: 'Unchanged',
        severity: 'Minor',
        analysis: 'Standard language — no deviation.',
        suggestedLanguage: 'N/A',
        recommendation: 'Accept',
      },
    ],
    missingClauses: ['Return of Materials', 'Injunctive Relief'],
    addedClauses: ['Force Majeure'],
    recommendations: [
      'Negotiate the Definition of Confidential Information to narrow scope.',
      'Push back on termination notice period (14 vs 30 days).',
      'Request governing law change to Delaware.',
      'Consider adding Return of Materials and Injunctive Relief clauses.',
    ],
  };

  function compareContracts(draftText, standardText, contractType) {
    var userContent =
      'Contract type: ' + (contractType || 'Other') + '\n\n' +
      'Counterparty draft:\n' + (draftText || '(no text)') + '\n\n' +
      'Firm standard:\n' + (standardText || '(no text)');

    return chatCompletion(
      [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      { maxTokens: 4096 }
    )
      .then(function (response) {
        var raw = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
        if (raw) {
          var cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
          var parsed = JSON.parse(cleaned);
          if (parsed.clauses && Array.isArray(parsed.clauses)) return parsed;
        }
        console.warn('Inference returned unexpected format, using mock data.');
        return JSON.parse(JSON.stringify(MOCK_REDLINE));
      })
      .catch(function (err) {
        console.warn('Inference endpoint unavailable, using mock data:', err.message);
        return JSON.parse(JSON.stringify(MOCK_REDLINE));
      });
  }

  /* =====================================================================
   * Database — in-memory comparison history (mock)
   * =================================================================== */

  var MOCK_COMPARISONS = [
    { id: 'comp-001', name: 'NDA - Acme Corp vs Draft', uploadedAt: '2024-01-15T10:30:00.000Z', riskLevel: 'Medium', status: 'Reviewed' },
    { id: 'comp-002', name: 'MSA - TechVendor Comparison', uploadedAt: '2024-02-20T14:45:00.000Z', riskLevel: 'High', status: 'Pending' },
    { id: 'comp-003', name: 'SaaS Agreement - StartupXYZ', uploadedAt: '2024-03-01T09:00:00.000Z', riskLevel: 'Low', status: 'Approved' },
  ];

  var localComparisons = MOCK_COMPARISONS.slice();
  var nextId = 1000;

  function saveComparison(meta) {
    var saved = Object.assign({}, meta, { id: 'comp-' + String(nextId++).padStart(3, '0') });
    localComparisons.unshift(saved);
    return saved;
  }

  function getComparisons() { return localComparisons.slice(); }

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
  var uploadZoneDraft = document.getElementById('upload-zone-draft');
  var uploadZoneStandard = document.getElementById('upload-zone-standard');
  var fileInputDraft = document.getElementById('file-input-draft');
  var fileInputStandard = document.getElementById('file-input-standard');
  var pasteInputDraft = document.getElementById('paste-input-draft');
  var pasteInputStandard = document.getElementById('paste-input-standard');
  var contractTypeSelect = document.getElementById('contract-type-select');
  var btnCompare = document.getElementById('btn-compare');
  var loadingSection = document.getElementById('loading-section');
  var resultsSection = document.getElementById('results-section');
  var btnNewComparison = document.getElementById('btn-new-comparison');
  var summaryStats = document.getElementById('summary-stats');
  var riskAssessmentCard = document.getElementById('risk-assessment-card');
  var clauseComparisonList = document.getElementById('clause-comparison-list');
  var missingClausesList = document.getElementById('missing-clauses-list');
  var addedClausesList = document.getElementById('added-clauses-list');
  var recommendationsList = document.getElementById('recommendations-list');
  var historyList = document.getElementById('history-list');
  var errorBanner = document.getElementById('error-banner');

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  function showError(msg) {
    if (!errorBanner) return;
    errorBanner.textContent = msg;
    show(errorBanner);
    setTimeout(function () { hide(errorBanner); }, 8000);
  }

  /* =====================================================================
   * Rendering helpers
   * =================================================================== */

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function severityClass(level) {
    var l = (level || '').toLowerCase();
    if (l === 'critical') return 'risk-critical';
    if (l === 'major') return 'risk-high';
    if (l === 'moderate') return 'risk-medium';
    if (l === 'minor') return 'risk-minor';
    return 'risk-low';
  }

  function renderSummaryStats(summary) {
    if (!summaryStats) return;
    summaryStats.innerHTML = '';
    var items = [
      { label: 'Clauses Compared', value: summary.clausesCompared || 0 },
      { label: 'Deviations Found', value: summary.deviationsFound || 0 },
      { label: 'Critical Issues', value: summary.criticalIssues || 0 },
      { label: 'Acceptable As-Is', value: summary.acceptableAsIs || 0 },
    ];
    items.forEach(function (item) {
      var div = document.createElement('div');
      div.className = 'summary-stat';
      div.innerHTML = '<div class="summary-stat-label">' + esc(item.label) + '</div><div class="summary-stat-value">' + esc(String(item.value)) + '</div>';
      summaryStats.appendChild(div);
    });
  }

  function renderRiskAssessment(overallRisk) {
    if (!riskAssessmentCard) return;
    var level = overallRisk && overallRisk.level ? overallRisk.level : 'Unknown';
    var score = overallRisk && overallRisk.score !== undefined ? overallRisk.score : '--';
    riskAssessmentCard.className = 'risk-assessment-card ' + severityClass(level);
    riskAssessmentCard.innerHTML =
      '<div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;">' +
        '<span class="risk-badge ' + severityClass(level) + '">' + esc(level) + '</span>' +
        '<span style="font-size:1.5rem;font-weight:700;">Risk Score: ' + esc(String(score)) + '/10</span>' +
      '</div>';
  }

  function renderClauseComparison(clauses) {
    if (!clauseComparisonList) return;
    clauseComparisonList.innerHTML = '';
    (clauses || []).forEach(function (c) {
      var card = document.createElement('div');
      card.className = 'clause-card severity-' + (c.severity || 'minor').toLowerCase();
      card.setAttribute('role', 'listitem');

      var standardHtml = '<div class="clause-text-block clause-text-standard"><div class="clause-text-label">Firm Standard</div><div>' + esc(c.standardText || '') + '</div></div>';
      var counterpartyHtml = '<div class="clause-text-block clause-text-counterparty"><div class="clause-text-label">Counterparty</div><div>' + esc(c.counterpartyText || '') + '</div></div>';
      var analysisHtml = c.analysis ? '<div class="clause-analysis">' + esc(c.analysis) + '</div>' : '';
      var suggestedHtml = c.suggestedLanguage && c.suggestedLanguage !== 'N/A' ? '<div class="clause-suggested"><div class="clause-suggested-label">Suggested Language</div>' + esc(c.suggestedLanguage) + '</div>' : '';
      var badgeHtml = '<span class="risk-badge ' + severityClass(c.severity) + '">' + esc(c.severity || '') + '</span>';

      card.innerHTML =
        '<div class="clause-card-header">' +
          '<h4 class="clause-card-heading">' + esc(c.heading || '') + '</h4>' +
          badgeHtml +
        '</div>' +
        standardHtml +
        counterpartyHtml +
        analysisHtml +
        suggestedHtml +
        '<div class="clause-actions">' +
          '<button type="button" class="clause-btn clause-btn-accept">Accept</button>' +
          '<button type="button" class="clause-btn clause-btn-reject">Reject</button>' +
          '<button type="button" class="clause-btn clause-btn-modify">Modify</button>' +
        '</div>';
      clauseComparisonList.appendChild(card);
    });
  }

  function renderMissingClauses(clauses) {
    if (!missingClausesList) return;
    missingClausesList.innerHTML = '';
    (clauses || []).forEach(function (c) {
      var item = document.createElement('div');
      item.className = 'missing-clause-item';
      item.setAttribute('role', 'listitem');
      item.textContent = typeof c === 'string' ? c : (c.heading || c);
      missingClausesList.appendChild(item);
    });
  }

  function renderAddedClauses(clauses) {
    if (!addedClausesList) return;
    addedClausesList.innerHTML = '';
    (clauses || []).forEach(function (c) {
      var item = document.createElement('div');
      item.className = 'added-clause-item';
      item.setAttribute('role', 'listitem');
      item.textContent = typeof c === 'string' ? c : (c.heading || c);
      addedClausesList.appendChild(item);
    });
  }

  function renderRecommendations(clauses) {
    if (!recommendationsList) return;
    recommendationsList.innerHTML = '';
    (clauses || []).forEach(function (c) {
      var item = document.createElement('div');
      item.className = 'recommendation-item';
      item.setAttribute('role', 'listitem');
      item.textContent = typeof c === 'string' ? c : (c.text || c);
      recommendationsList.appendChild(item);
    });
  }

  function renderHistory(comparisons) {
    if (!historyList) return;
    historyList.innerHTML = '';
    (comparisons || []).forEach(function (c) {
      var item = document.createElement('div');
      item.className = 'history-item';
      item.setAttribute('role', 'listitem');
      var date = new Date(c.uploadedAt).toLocaleDateString();
      item.innerHTML =
        '<div class="history-item-name">' + esc(c.name) + '</div>' +
        '<div class="history-meta">' +
          '<span class="history-item-date">' + date + '</span>' +
          '<span class="risk-badge ' + severityClass(c.riskLevel) + '">' + esc(c.riskLevel) + '</span>' +
          '<span class="history-status">' + esc(c.status) + '</span>' +
        '</div>';
      historyList.appendChild(item);
    });
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
    show(loadingSection);
    hide(resultsSection);
  }

  function showResults() {
    hide(landingSection);
    hide(loadingSection);
    show(resultsSection);
  }

  /* =====================================================================
   * Validation — enable Compare button when both inputs have content
   * =================================================================== */

  function ensureTextsAndCompare() {
    var draftText = getDraftText();
    var standardText = getStandardText();
    if (!draftText || !standardText) {
      showError('Please provide both counterparty draft and firm standard (upload or paste).');
      return;
    }
    var contractType = contractTypeSelect ? contractTypeSelect.value : 'Other';
    runComparison(draftText, standardText, contractType, getDraftName(), getStandardName());
  }

  function updateCompareButton() {
    if (!btnCompare) return;
    var draft = (pasteInputDraft && pasteInputDraft.value.trim()) || (fileInputDraft && fileInputDraft.files && fileInputDraft.files.length > 0);
    var standard = (pasteInputStandard && pasteInputStandard.value.trim()) || (fileInputStandard && fileInputStandard.files && fileInputStandard.files.length > 0);
    btnCompare.disabled = !(draft && standard);
  }

  /* =====================================================================
   * Comparison pipeline
   * =================================================================== */

  var processing = false;
  var draftTextCache = '';
  var standardTextCache = '';

  function runComparison(draftText, standardText, contractType, draftName, standardName) {
    if (processing) return;
    processing = true;

    hide(errorBanner);
    showLoading();

    compareContracts(draftText, standardText, contractType)
      .then(function (result) {
        renderSummaryStats(result.summary || {});
        renderRiskAssessment(result.overallRisk || {});
        renderClauseComparison(result.clauses || []);
        renderMissingClauses(result.missingClauses || []);
        renderAddedClauses(result.addedClauses || []);
        renderRecommendations(result.recommendations || []);

        saveComparison({
          name: (draftName || 'Draft') + ' vs ' + (standardName || 'Standard'),
          uploadedBy: 'current-user',
          uploadedAt: new Date().toISOString(),
          riskLevel: result.overallRisk && result.overallRisk.level ? result.overallRisk.level : 'Unknown',
          status: 'Reviewed',
        });

        renderHistory(getComparisons());
        showResults();
      })
      .catch(function (err) {
        console.error('Comparison failed:', err);
        showError('Comparison failed: ' + err.message);
        showLanding();
      })
      .then(function () { processing = false; });
  }

  /* =====================================================================
   * File upload handling
   * =================================================================== */

  function handleFileDraft(file) {
    if (!file || processing) return;
    var ext = (file.name || '').split('.').pop().toLowerCase();
    if (['txt', 'pdf', 'docx'].indexOf(ext) === -1) {
      showError('Unsupported file type ".' + ext + '". Please upload a TXT, PDF, or DOCX file.');
      return;
    }
    extractText(file)
      .then(function (text) {
        draftTextCache = text || '';
        updateCompareButton();
      })
      .catch(function (err) {
        showError('File read failed: ' + err.message);
      });
  }

  function handleFileStandard(file) {
    if (!file || processing) return;
    var ext = (file.name || '').split('.').pop().toLowerCase();
    if (['txt', 'pdf', 'docx'].indexOf(ext) === -1) {
      showError('Unsupported file type ".' + ext + '". Please upload a TXT, PDF, or DOCX file.');
      return;
    }
    extractText(file)
      .then(function (text) {
        standardTextCache = text || '';
        updateCompareButton();
      })
      .catch(function (err) {
        showError('File read failed: ' + err.message);
      });
  }

  function getDraftText() {
    return pasteInputDraft && pasteInputDraft.value.trim() ? pasteInputDraft.value.trim() : draftTextCache;
  }

  function getStandardText() {
    return pasteInputStandard && pasteInputStandard.value.trim() ? pasteInputStandard.value.trim() : standardTextCache;
  }

  function getDraftName() {
    if (fileInputDraft && fileInputDraft.files && fileInputDraft.files.length > 0) return fileInputDraft.files[0].name;
    return 'Pasted Draft';
  }

  function getStandardName() {
    if (fileInputStandard && fileInputStandard.files && fileInputStandard.files.length > 0) return fileInputStandard.files[0].name;
    return 'Pasted Standard';
  }

  /* =====================================================================
   * Event listeners
   * =================================================================== */

  // Drag and drop — Draft
  if (uploadZoneDraft) {
    uploadZoneDraft.addEventListener('dragover', function (e) {
      e.preventDefault();
      uploadZoneDraft.classList.add('dragover');
    });
    uploadZoneDraft.addEventListener('dragleave', function () {
      uploadZoneDraft.classList.remove('dragover');
    });
    uploadZoneDraft.addEventListener('drop', function (e) {
      e.preventDefault();
      uploadZoneDraft.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) handleFileDraft(e.dataTransfer.files[0]);
    });
    uploadZoneDraft.addEventListener('click', function (e) {
      if (e.target === fileInputDraft) return;
      fileInputDraft.click();
    });
    uploadZoneDraft.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputDraft.click(); }
    });
  }
  if (fileInputDraft) {
    fileInputDraft.addEventListener('click', function (e) { e.stopPropagation(); });
    fileInputDraft.addEventListener('change', function () {
      if (fileInputDraft.files.length > 0) handleFileDraft(fileInputDraft.files[0]);
      fileInputDraft.value = '';
    });
  }

  // Drag and drop — Standard
  if (uploadZoneStandard) {
    uploadZoneStandard.addEventListener('dragover', function (e) {
      e.preventDefault();
      uploadZoneStandard.classList.add('dragover');
    });
    uploadZoneStandard.addEventListener('dragleave', function () {
      uploadZoneStandard.classList.remove('dragover');
    });
    uploadZoneStandard.addEventListener('drop', function (e) {
      e.preventDefault();
      uploadZoneStandard.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) handleFileStandard(e.dataTransfer.files[0]);
    });
    uploadZoneStandard.addEventListener('click', function (e) {
      if (e.target === fileInputStandard) return;
      fileInputStandard.click();
    });
    uploadZoneStandard.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputStandard.click(); }
    });
  }
  if (fileInputStandard) {
    fileInputStandard.addEventListener('click', function (e) { e.stopPropagation(); });
    fileInputStandard.addEventListener('change', function () {
      if (fileInputStandard.files.length > 0) handleFileStandard(fileInputStandard.files[0]);
      fileInputStandard.value = '';
    });
  }

  // Paste textareas — enable Compare when both have content
  if (pasteInputDraft) pasteInputDraft.addEventListener('input', updateCompareButton);
  if (pasteInputStandard) pasteInputStandard.addEventListener('input', updateCompareButton);

  // Compare button
  if (btnCompare) {
    btnCompare.addEventListener('click', function () {
      ensureTextsAndCompare();
    });
  }

  // New comparison button
  if (btnNewComparison) {
    btnNewComparison.addEventListener('click', function () {
      pasteInputDraft.value = '';
      pasteInputStandard.value = '';
      draftTextCache = '';
      standardTextCache = '';
      if (fileInputDraft) fileInputDraft.value = '';
      if (fileInputStandard) fileInputStandard.value = '';
      updateCompareButton();
      showLanding();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* =====================================================================
   * Init
   * =================================================================== */

  renderHistory(getComparisons());
  updateCompareButton();

})();
