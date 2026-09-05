/**
 * E-Discovery & Document Review — Use Case App (self-contained, no ES modules).
 * Supports file upload (TXT/PDF/DOCX) and direct text paste.
 * Sends document text to Nutanix AI via local proxy for e-discovery analysis.
 * Falls back to mock data when AI services are unreachable.
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
    if (!opts.maxTokens) opts.maxTokens = AI_CONFIG.defaults.maxTokens;
    if (opts.stream === undefined) opts.stream = AI_CONFIG.defaults.stream;
    // Tries Nutanix Enterprise AI first (via the local proxy, or directly
    // with a user-saved key from Settings), then falls back to OpenRouter
    // if configured. See portal/shared/inference-client.js.
    return window.LegalAIInference.chatCompletion(messages, opts, AI_CONFIG);
  }

  /* =====================================================================
   * System prompt — e-discovery document review JSON schema
   * =================================================================== */

  var SYSTEM_PROMPT =
    'You are an e-discovery document review AI. Given document text, matter context, and review scope, return a JSON object with:\n' +
    '- "documents": array of objects, each with:\n' +
    '  - "documentTitle": identified or inferred title\n' +
    '  - "documentType": type (email, memo, contract, report, etc.)\n' +
    '  - "classification": { "status": "Responsive"|"Non-Responsive"|"Potentially Responsive", "confidence": 0-100 }\n' +
    '  - "relevanceScore": 0-100\n' +
    '  - "privilegeAnalysis": { "isPrivileged": boolean, "type": "Attorney-Client"|"Work Product"|"Joint Defense"|"None", "indicators": [], "recommendation": string }\n' +
    '  - "isHotDocument": boolean\n' +
    '  - "hotDocumentReason": string (if hot)\n' +
    '  - "themes": array of { "theme": string, "relevance": "high"|"medium"|"low" }\n' +
    '  - "keyEntities": array of { "name": string, "type": "person"|"org"|"date"|"location", "context": string }\n' +
    '  - "summary": 2-5 sentence summary\n' +
    '  - "keyPassages": array of { "text": string, "relevance": string, "page": number }\n' +
    '  - "recommendation": { "action": "Produce"|"Withhold"|"Further Review", "reasoning": string }\n' +
    '  - "reviewNotes": string\n' +
    '- "thematicSummary": key themes across all documents\n' +
    'Respond ONLY with valid JSON, no markdown fences.';

  /* =====================================================================
   * Mock data — realistic e-discovery review results
   * =================================================================== */

  var MOCK_REVIEW = {
    documents: [
      {
        documentTitle: 'Email re: Acme Corp Settlement - Smith to Jones',
        documentType: 'email',
        classification: { status: 'Responsive', confidence: 92 },
        relevanceScore: 88,
        privilegeAnalysis: {
          isPrivileged: false,
          type: 'None',
          indicators: [],
          recommendation: 'No privilege indicators detected.' 
        },
        isHotDocument: true,
        hotDocumentReason: 'Contains direct discussion of settlement negotiations and key terms.',
        themes: [
          { theme: 'Settlement negotiations', relevance: 'high' },
          { theme: 'Liability terms', relevance: 'high' },
          { theme: 'Confidentiality', relevance: 'medium' }
        ],
        keyEntities: [
          { name: 'John Smith', type: 'person', context: 'Author, discussing settlement' },
          { name: 'Acme Corp', type: 'org', context: 'Counterparty in dispute' },
          { name: '2024-03-15', type: 'date', context: 'Settlement discussion date' }
        ],
        summary: 'Email thread between John Smith and Sarah Jones discussing settlement negotiations with Acme Corp. The document outlines proposed liability caps, confidentiality terms, and payment schedules. Key evidence for deposition prep and trial exhibits.',
        keyPassages: [
          { text: 'We agreed to cap liability at 2x annual contract value.', relevance: 'high', page: 1 },
          { text: 'Acme will not disclose settlement terms for 12 months.', relevance: 'medium', page: 1 }
        ],
        recommendation: { action: 'Produce', reasoning: 'Responsive and non-privileged. Contains key evidence.' },
        reviewNotes: 'Flag for deposition prep. Consider exhibit designation.'
      },
      {
        documentTitle: 'Internal Memo - Legal Strategy Draft',
        documentType: 'memo',
        classification: { status: 'Potentially Responsive', confidence: 65 },
        relevanceScore: 72,
        privilegeAnalysis: {
          isPrivileged: true,
          type: 'Work Product',
          indicators: ['Prepared for litigation', 'Attorney mental impressions'],
          recommendation: 'Withhold. Work product doctrine applies.'
        },
        isHotDocument: false,
        hotDocumentReason: '',
        themes: [
          { theme: 'Litigation strategy', relevance: 'high' },
          { theme: 'Witness preparation', relevance: 'medium' }
        ],
        keyEntities: [
          { name: 'Jane Doe', type: 'person', context: 'Associate attorney' },
          { name: 'Smith & Jones LLP', type: 'org', context: 'Law firm' }
        ],
        summary: 'Internal attorney memo outlining litigation strategy and witness preparation approach. Contains attorney mental impressions and work product. May be subject to privilege assertion.',
        keyPassages: [
          { text: 'We should focus on Smith\'s testimony regarding the timeline.', relevance: 'high', page: 1 }
        ],
        recommendation: { action: 'Withhold', reasoning: 'Work product doctrine. Privilege log required.' },
        reviewNotes: 'Prepare privilege log entry. Consider redaction for non-privileged portions.'
      },
      {
        documentTitle: 'Quarterly Report - Q4 2024',
        documentType: 'report',
        classification: { status: 'Non-Responsive', confidence: 95 },
        relevanceScore: 12,
        privilegeAnalysis: {
          isPrivileged: false,
          type: 'None',
          indicators: [],
          recommendation: 'No privilege.'
        },
        isHotDocument: false,
        hotDocumentReason: '',
        themes: [
          { theme: 'Financial performance', relevance: 'low' },
          { theme: 'Operational metrics', relevance: 'low' }
        ],
        keyEntities: [
          { name: 'Q4 2024', type: 'date', context: 'Reporting period' }
        ],
        summary: 'Standard quarterly financial report. No connection to matter. Contains general operational metrics and revenue figures.',
        keyPassages: [],
        recommendation: { action: 'Produce', reasoning: 'Non-responsive but low burden. No relevance to matter.' },
        reviewNotes: 'Exclude from production set. Mark as non-responsive.'
      },
      {
        documentTitle: 'Contract Amendment - Smith & Acme',
        documentType: 'contract',
        classification: { status: 'Responsive', confidence: 98 },
        relevanceScore: 95,
        privilegeAnalysis: {
          isPrivileged: false,
          type: 'None',
          indicators: [],
          recommendation: 'No privilege.'
        },
        isHotDocument: true,
        hotDocumentReason: 'Core contract amendment at issue in dispute.',
        themes: [
          { theme: 'Contract terms', relevance: 'high' },
          { theme: 'Amendment provisions', relevance: 'high' },
          { theme: 'Termination rights', relevance: 'high' }
        ],
        keyEntities: [
          { name: 'Acme Corp', type: 'org', context: 'Counterparty' },
          { name: 'Smith Industries', type: 'org', context: 'Client' },
          { name: '2024-01-15', type: 'date', context: 'Amendment effective date' }
        ],
        summary: 'Contract amendment modifying termination rights, liability caps, and indemnification. Central document to dispute. Highly relevant for deposition and trial.',
        keyPassages: [
          { text: 'Either party may terminate with 30 days written notice.', relevance: 'high', page: 2 },
          { text: 'Liability cap increased to 3x annual fees.', relevance: 'high', page: 3 }
        ],
        recommendation: { action: 'Produce', reasoning: 'Core contract. Essential for case.' },
        reviewNotes: 'Flag as hot document. Key exhibit for trial.'
      }
    ],
    thematicSummary: 'Key themes across documents: settlement negotiations, contract amendments, litigation strategy, privilege considerations. Focus on liability terms and termination provisions.'
  };

  /* =====================================================================
   * Inference — e-discovery analysis via chat completions
   * =================================================================== */

  function analyzeDocuments(text, matterContext, scope, filename) {
    var userContent = 'Matter context: ' + (matterContext || 'Not provided') + '\n\n';
    userContent += 'Review scope: ' + (scope.join(', ') || 'All') + '\n\n';
    userContent += 'Document text to analyze:\n\n' + (text || 'No text provided.');

    if (!text || text.trim().length < 20) {
      userContent = 'Analyze documents for "' + (filename || 'Unknown') + '". Matter: ' + (matterContext || 'General') + '. Scope: ' + (scope.join(', ') || 'All') + '. Provide e-discovery analysis.';
    }

    return chatCompletion(
      [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      { maxTokens: 4096 }
    )
      .then(function (response) {
        var raw = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
        if (raw) {
          var cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
          try {
            var parsed = JSON.parse(cleaned);
            if (parsed.documents && Array.isArray(parsed.documents) && parsed.documents.length > 0) {
              return parsed;
            }
          } catch (_) {}
        }
        console.warn('Inference returned unexpected format, using mock data.');
        return JSON.parse(JSON.stringify(MOCK_REVIEW));
      })
      .catch(function (err) {
        console.warn('Inference endpoint unavailable, using mock data:', err.message);
        return JSON.parse(JSON.stringify(MOCK_REVIEW));
      });
  }

  /* =====================================================================
   * Review history — in-memory mock
   * =================================================================== */

  var MOCK_REVIEWS = [
    { id: 'rev-001', name: 'Acme Corp - Production Set 1', uploadedAt: '2024-01-15T10:30:00.000Z', docCount: 12, responsive: 8, privileged: 2, hot: 3 },
    { id: 'rev-002', name: 'Smith v. Jones - Initial Review', uploadedAt: '2024-02-20T14:45:00.000Z', docCount: 45, responsive: 28, privileged: 5, hot: 7 },
  ];

  var localReviews = MOCK_REVIEWS.slice();
  var nextId = 1000;

  function saveReview(meta) {
    var saved = Object.assign({}, meta, { id: 'rev-' + String(nextId++).padStart(3, '0') });
    localReviews.unshift(saved);
    return saved;
  }

  function getReviews() { return localReviews.slice(); }

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
  var matterContext = document.getElementById('matter-context');
  var scopeResponsiveness = document.getElementById('scope-responsiveness');
  var scopePrivilege = document.getElementById('scope-privilege');
  var scopeKeyDocs = document.getElementById('scope-key-docs');
  var scopeHotDocs = document.getElementById('scope-hot-docs');
  var btnAnalyze = document.getElementById('btn-analyze');
  var loadingSection = document.getElementById('loading-section');
  var resultsSection = document.getElementById('results-section');
  var btnNewReview = document.getElementById('btn-new-review');
  var reviewDashboard = document.getElementById('review-dashboard');
  var documentCards = document.getElementById('document-cards');
  var thematicAnalysis = document.getElementById('thematic-analysis');
  var reviewMetrics = document.getElementById('review-metrics');
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

  function getScope() {
    var scope = [];
    if (scopeResponsiveness && scopeResponsiveness.checked) scope.push('Responsiveness');
    if (scopePrivilege && scopePrivilege.checked) scope.push('Privilege');
    if (scopeKeyDocs && scopeKeyDocs.checked) scope.push('Key Documents');
    if (scopeHotDocs && scopeHotDocs.checked) scope.push('Hot Documents');
    return scope;
  }

  function canAnalyze() {
    var hasText = (pasteInput && pasteInput.value.trim().length >= 10) ||
      (fileInput && fileInput.files && fileInput.files.length > 0);
    return !!hasText;
  }

  function updateAnalyzeButton() {
    if (btnAnalyze) btnAnalyze.disabled = !canAnalyze();
  }

  function classificationClass(status) {
    var s = (status || '').toLowerCase().replace(/\s+/g, '-');
    if (s === 'responsive') return 'responsive';
    if (s === 'non-responsive') return 'non-responsive';
    if (s === 'privileged') return 'privileged';
    if (s === 'potentially-responsive') return 'potentially-responsive';
    return 'non-responsive';
  }

  function docCardClass(doc) {
    if (doc.isHotDocument) return 'doc-hot';
    if (doc.privilegeAnalysis && doc.privilegeAnalysis.isPrivileged) return 'doc-privileged';
    var status = doc.classification && doc.classification.status;
    if (status === 'Responsive') return 'doc-responsive';
    if (status === 'Non-Responsive') return 'doc-non-responsive';
    return 'doc-responsive';
  }

  function renderDashboard(docs) {
    var total = docs.length;
    var responsive = docs.filter(function (d) { return (d.classification && d.classification.status) === 'Responsive'; }).length;
    var privileged = docs.filter(function (d) { return d.privilegeAnalysis && d.privilegeAnalysis.isPrivileged; }).length;
    var hot = docs.filter(function (d) { return d.isHotDocument; }).length;

    reviewDashboard.innerHTML =
      '<div class="dashboard-stat"><span class="dashboard-stat-value">' + total + '</span><span class="dashboard-stat-label">Total Docs</span></div>' +
      '<div class="dashboard-stat"><span class="dashboard-stat-value">' + responsive + '</span><span class="dashboard-stat-label">Responsive</span></div>' +
      '<div class="dashboard-stat"><span class="dashboard-stat-value">' + privileged + '</span><span class="dashboard-stat-label">Privileged</span></div>' +
      '<div class="dashboard-stat"><span class="dashboard-stat-value">' + hot + '</span><span class="dashboard-stat-label">Hot Docs</span></div>';
  }

  function renderDocumentCard(doc) {
    var card = document.createElement('div');
    card.className = 'doc-card ' + docCardClass(doc);

    var status = doc.classification && doc.classification.status;
    var badgeClass = classificationClass(status);
    var badgeHtml = '<span class="class-badge ' + badgeClass + '">' + esc(status) + '</span>';
    if (doc.isHotDocument) {
      badgeHtml += ' <span class="class-badge hot">Hot Document</span>';
    }

    var privilegeHtml = '';
    if (doc.privilegeAnalysis && doc.privilegeAnalysis.isPrivileged && doc.privilegeAnalysis.type !== 'None') {
      privilegeHtml = '<div class="privilege-flags"><span class="privilege-tag">' + esc(doc.privilegeAnalysis.type) + '</span></div>';
    }

    var themesHtml = '';
    if (doc.themes && doc.themes.length) {
      themesHtml = '<div class="theme-tags">';
      doc.themes.forEach(function (t) {
        themesHtml += '<span class="theme-tag ' + (t.relevance || 'low') + '">' + esc(t.theme) + '</span>';
      });
      themesHtml += '</div>';
    }

    var recHtml = '';
    if (doc.recommendation) {
      recHtml = '<div class="doc-recommendation"><strong>' + esc(doc.recommendation.action) + ':</strong> ' + esc(doc.recommendation.reasoning) + '</div>';
    }

    card.innerHTML =
      '<div class="doc-card-header">' +
        '<span class="doc-card-title">' + esc(doc.documentTitle || 'Untitled') + '</span>' +
        badgeHtml +
      '</div>' +
      '<div class="relevance-bar-wrap">' +
        '<div class="relevance-bar-label"><span>Relevance</span><span>' + (doc.relevanceScore || 0) + '%</span></div>' +
        '<div class="relevance-bar"><div class="relevance-bar-fill" style="width:' + (doc.relevanceScore || 0) + '%"></div></div>' +
      '</div>' +
      privilegeHtml +
      themesHtml +
      '<div class="doc-summary">' + esc(doc.summary || '') + '</div>' +
      recHtml;

    return card;
  }

  function renderDocumentCards(docs) {
    documentCards.innerHTML = '';
    (docs || []).forEach(function (doc) {
      documentCards.appendChild(renderDocumentCard(doc));
    });
  }

  function renderThematicAnalysis(docs, thematicSummary) {
    var summary = thematicSummary || 'Key themes extracted from document review.';
    var allThemes = [];
    (docs || []).forEach(function (doc) {
      (doc.themes || []).forEach(function (t) {
        if (t.theme && allThemes.indexOf(t.theme) === -1) allThemes.push(t.theme);
      });
    });

    thematicAnalysis.innerHTML =
      '<h4>Key Themes Across Documents</h4>' +
      '<p>' + esc(summary) + '</p>' +
      (allThemes.length ? '<div class="theme-list">' + allThemes.map(function (t) {
        return '<div class="theme-item"><span class="theme-tag">' + esc(t) + '</span></div>';
      }).join('') + '</div>' : '');
  }

  function renderReviewMetrics(docs) {
    var total = docs.length;
    var produce = docs.filter(function (d) { return d.recommendation && d.recommendation.action === 'Produce'; }).length;
    var withhold = docs.filter(function (d) { return d.recommendation && d.recommendation.action === 'Withhold'; }).length;
    var further = docs.filter(function (d) { return d.recommendation && d.recommendation.action === 'Further Review'; }).length;

    reviewMetrics.innerHTML =
      '<div class="metric-card"><h4>Production</h4><p>' + produce + ' documents recommended for production</p></div>' +
      '<div class="metric-card"><h4>Withhold</h4><p>' + withhold + ' documents recommended for withhold</p></div>' +
      '<div class="metric-card"><h4>Further Review</h4><p>' + further + ' documents need further review</p></div>';
  }

  function renderHistory(reviews) {
    historyList.innerHTML = '';
    (reviews || []).forEach(function (r) {
      var item = document.createElement('div');
      item.className = 'history-item';
      item.setAttribute('role', 'listitem');
      var date = new Date(r.uploadedAt).toLocaleDateString();
      item.innerHTML =
        '<div class="history-item-name">' + esc(r.name) + '</div>' +
        '<div class="history-meta">' +
          '<span class="history-item-date">' + date + '</span>' +
          '<span>' + (r.docCount || 0) + ' docs</span>' +
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
   * Analysis pipeline
   * =================================================================== */

  var processing = false;

  function runAnalysis(text, name) {
    if (processing) return;
    processing = true;

    hide(errorBanner);
    showLoading();

    var matter = matterContext ? matterContext.value.trim() : '';
    var scope = getScope();

    analyzeDocuments(text, matter || 'General matter', scope, name)
      .then(function (result) {
        var docs = result.documents || [];
        renderDashboard(docs);
        renderDocumentCards(docs);
        renderThematicAnalysis(docs, result.thematicSummary);
        renderReviewMetrics(docs);

        saveReview({
          name: name || 'Pasted Text',
          uploadedAt: new Date().toISOString(),
          docCount: docs.length,
          responsive: docs.filter(function (d) { return (d.classification && d.classification.status) === 'Responsive'; }).length,
          privileged: docs.filter(function (d) { return d.privilegeAnalysis && d.privilegeAnalysis.isPrivileged; }).length,
          hot: docs.filter(function (d) { return d.isHotDocument; }).length,
        });

        renderHistory(getReviews());
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

    extractText(file)
      .then(function (text) {
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

  // Click to browse — stopPropagation prevents double file dialog
  uploadZone.addEventListener('click', function (e) {
    if (e.target === fileInput) return;
    fileInput.click();
  });
  uploadZone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('click', function (e) { e.stopPropagation(); });
  fileInput.addEventListener('change', function () {
    if (fileInput.files.length > 0) handleFile(fileInput.files[0]);
    fileInput.value = '';
    updateAnalyzeButton();
  });

  // Paste textarea — enable button when text is entered
  pasteInput.addEventListener('input', updateAnalyzeButton);

  btnAnalyze.addEventListener('click', function () {
    var text = pasteInput ? pasteInput.value.trim() : '';
    if (text.length >= 10) {
      runAnalysis(text, 'Pasted Document');
      return;
    }
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
      handleFile(fileInput.files[0]);
      return;
    }
    showError('Please upload a file or paste at least 10 characters of text.');
  });

  // New review button
  btnNewReview.addEventListener('click', function () {
    pasteInput.value = '';
    fileInput.value = '';
    updateAnalyzeButton();
    showLanding();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* =====================================================================
   * Init
   * =================================================================== */

  renderHistory(getReviews());
  updateAnalyzeButton();

})();
