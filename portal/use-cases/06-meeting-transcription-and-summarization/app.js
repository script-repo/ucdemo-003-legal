/**
 * Meeting Transcription & Summarization — Use Case App (self-contained, no ES modules).
 * Supports file upload (TXT/PDF/DOCX) and direct text paste.
 * Sends transcript text to the Nutanix AI endpoint via the local proxy for
 * meeting summarization. Falls back to mock data when AI services are unreachable.
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
   * Inference — meeting summarization via chat completions
   * =================================================================== */

  var SYSTEM_PROMPT =
    'You are a legal meeting summarization AI. Given transcript text and meeting type, return a JSON object containing:\n' +
    '- "meetingTitle": inferred title\n' +
    '- "meetingType": type of meeting\n' +
    '- "date": extracted or estimated date\n' +
    '- "duration": estimated duration\n' +
    '- "participants": array of { "name", "role" }\n' +
    '- "executiveSummary": 2-5 sentence overview\n' +
    '- "keyPoints": array of { "topic", "summary", "importance" (high/medium/low) }\n' +
    '- "actionItems": array of { "action", "assignee", "deadline", "priority" }\n' +
    '- "decisions": array of { "decision", "context", "madeBy" }\n' +
    '- "followUps": array of { "item", "dueDate", "responsible" }\n' +
    '- "matterReferences": any matter or case references mentioned\n' +
    'Only include fields that can be inferred from the transcript. Respond ONLY with valid JSON, no markdown fences.';

  var MOCK_SUMMARY = {
    meetingTitle: 'Acme Corp M&A Strategy Discussion',
    meetingType: 'Client Call',
    date: '2024-03-15',
    duration: '45 minutes',
    participants: [
      { name: 'Sarah Chen', role: 'Partner, M&A' },
      { name: 'Michael Torres', role: 'Associate' },
      { name: 'James Wilson', role: 'Client, Acme Corp CFO' },
    ],
    executiveSummary: 'The team discussed Acme Corp\'s acquisition strategy for Q2 2024. Key focus areas included due diligence timeline, regulatory compliance, and integration planning. The client expressed urgency to close before the fiscal year end. Three action items were assigned with deadlines in the next two weeks.',
    keyPoints: [
      { topic: 'Due diligence timeline', summary: 'Target 6-week DD period; client wants accelerated schedule.', importance: 'high' },
      { topic: 'Regulatory filings', summary: 'HSR notification required; estimated 30-day waiting period.', importance: 'high' },
      { topic: 'Integration planning', summary: 'HR and IT integration teams to be identified by end of month.', importance: 'medium' },
      { topic: 'Valuation assumptions', summary: 'Client provided updated revenue projections for model refresh.', importance: 'low' },
    ],
    actionItems: [
      { action: 'Prepare due diligence checklist and data room index', assignee: 'Michael Torres', deadline: '2024-03-22', priority: 'high' },
      { action: 'File HSR notification with FTC', assignee: 'Sarah Chen', deadline: '2024-03-25', priority: 'high' },
      { action: 'Schedule integration planning kickoff meeting', assignee: 'Michael Torres', deadline: '2024-03-29', priority: 'medium' },
    ],
    decisions: [
      { decision: 'Proceed with formal engagement letter', context: 'Client approved scope and fee structure', madeBy: 'James Wilson' },
      { decision: 'Target signing by April 30', context: 'Aligned with client fiscal year end', madeBy: 'Sarah Chen' },
    ],
    followUps: [
      { item: 'Send updated valuation model', dueDate: '2024-03-20', responsible: 'Michael Torres' },
      { item: 'Client to provide board resolution for engagement', dueDate: '2024-03-18', responsible: 'James Wilson' },
    ],
    matterReferences: ['Matter #2024-0892 Acme Corp Acquisition'],
  };

  function summarizeMeeting(text, meetingType, filename) {
    var userContent;
    if (text && text.length > 50) {
      userContent = 'Meeting type: ' + (meetingType || 'Other') + '\n\nTranscript:\n\n' + text;
    } else {
      userContent = 'Meeting type: ' + (meetingType || 'Other') + '. Transcript file: "' + (filename || 'Unknown') + '". Since the full text is not available, provide a representative meeting summary based on typical legal meeting content.';
    }

    return chatCompletion(
      [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      { maxTokens: 4096 }
    )
      .then(function (response) {
        var raw = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
        if (raw) {
          var cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
          var parsed = JSON.parse(cleaned);
          if (parsed.executiveSummary || parsed.meetingTitle) return parsed;
        }
        console.warn('Inference returned unexpected format, using mock data.');
        return JSON.parse(JSON.stringify(MOCK_SUMMARY));
      })
      .catch(function (err) {
        console.warn('Inference endpoint unavailable, using mock data:', err.message);
        return JSON.parse(JSON.stringify(MOCK_SUMMARY));
      });
  }

  /* =====================================================================
   * Database — in-memory meeting history (mock)
   * =================================================================== */

  var MOCK_MEETINGS = [
    { id: 'mtg-001', title: 'Acme Corp M&A Strategy', type: 'Client Call', summarizedAt: '2024-03-15T14:30:00.000Z', status: 'Summarized' },
    { id: 'mtg-002', title: 'Deposition Prep - Smith v. Jones', type: 'Deposition', summarizedAt: '2024-03-10T09:00:00.000Z', status: 'Summarized' },
    { id: 'mtg-003', title: 'Q1 Board Review', type: 'Board Meeting', summarizedAt: '2024-03-05T16:00:00.000Z', status: 'Summarized' },
  ];

  var localMeetings = MOCK_MEETINGS.slice();
  var nextId = 1000;

  function saveMeeting(meta) {
    var saved = Object.assign({}, meta, { id: 'mtg-' + String(nextId++).padStart(3, '0') });
    localMeetings.unshift(saved);
    return saved;
  }

  function getMeetings() { return localMeetings.slice(); }

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
  var btnNewMeeting = document.getElementById('btn-new-meeting');
  var meetingOverviewEl = document.getElementById('meeting-overview');
  var executiveSummaryEl = document.getElementById('executive-summary');
  var actionItemsList = document.getElementById('action-items-list');
  var decisionsList = document.getElementById('decisions-list');
  var keyPointsList = document.getElementById('key-points-list');
  var followUpsList = document.getElementById('follow-ups-list');
  var historyList = document.getElementById('history-list');
  var errorBanner = document.getElementById('error-banner');

  var selectedFile = null;

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  function showError(msg) {
    if (!errorBanner) return;
    errorBanner.textContent = msg;
    show(errorBanner);
    setTimeout(function () { hide(errorBanner); }, 8000);
  }

  function getMeetingType() {
    var checked = document.querySelector('input[name="meeting-type"]:checked');
    return checked ? checked.value : 'Other';
  }

  /* =====================================================================
   * Rendering helpers
   * =================================================================== */

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function importanceClass(imp) {
    var i = (imp || '').toLowerCase();
    if (i === 'high') return 'importance-high';
    if (i === 'medium') return 'importance-medium';
    return 'importance-low';
  }

  function priorityClass(pri) {
    var p = (pri || '').toLowerCase();
    if (p === 'high') return 'priority-high';
    if (p === 'medium') return 'priority-medium';
    return 'priority-low';
  }

  function renderMeetingOverview(summary) {
    var items = [
      { label: 'Date', value: summary.date || '—' },
      { label: 'Duration', value: summary.duration || '—' },
      { label: 'Type', value: summary.meetingType || '—' },
      { label: 'Participants', value: (summary.participants || []).map(function (p) { return p.name; }).join(', ') || '—' },
    ];
    meetingOverviewEl.innerHTML = items.map(function (item) {
      return '<div class="overview-item"><span class="overview-label">' + esc(item.label) + '</span><span class="overview-value">' + esc(item.value) + '</span></div>';
    }).join('');
  }

  function renderExecutiveSummary(text) {
    executiveSummaryEl.textContent = text || '';
  }

  function renderActionItems(items) {
    actionItemsList.innerHTML = '';
    (items || []).forEach(function (a) {
      var div = document.createElement('div');
      div.className = 'action-item';
      div.setAttribute('role', 'listitem');
      var meta = [];
      if (a.assignee) meta.push('<span class="assignee">' + esc(a.assignee) + '</span>');
      if (a.deadline) meta.push('<span class="deadline">' + esc(a.deadline) + '</span>');
      if (a.priority) meta.push('<span class="priority-badge ' + priorityClass(a.priority) + '">' + esc(a.priority) + '</span>');
      div.innerHTML =
        '<input type="checkbox" aria-label="Mark complete" />' +
        '<div class="action-item-content">' +
          '<p class="action-item-text">' + esc(a.action) + '</p>' +
          '<div class="action-item-meta">' + meta.join('') + '</div>' +
        '</div>';
      actionItemsList.appendChild(div);
    });
  }

  function renderDecisions(items) {
    decisionsList.innerHTML = '';
    (items || []).forEach(function (d) {
      var div = document.createElement('div');
      div.className = 'decision-item';
      div.setAttribute('role', 'listitem');
      div.innerHTML =
        '<p class="decision-text">' + esc(d.decision) + '</p>' +
        (d.context ? '<p class="decision-context">' + esc(d.context) + '</p>' : '') +
        (d.madeBy ? '<p class="decision-by">— ' + esc(d.madeBy) + '</p>' : '');
      decisionsList.appendChild(div);
    });
  }

  function renderKeyPoints(items) {
    keyPointsList.innerHTML = '';
    (items || []).forEach(function (kp) {
      var div = document.createElement('div');
      div.className = 'key-point-item';
      div.setAttribute('role', 'listitem');
      var badge = kp.importance ? '<span class="importance-badge ' + importanceClass(kp.importance) + '">' + esc(kp.importance) + '</span>' : '';
      div.innerHTML =
        '<span class="topic">' + esc(kp.topic || '') + '</span>' +
        '<div><p class="summary">' + esc(kp.summary || '') + '</p>' + badge + '</div>';
      keyPointsList.appendChild(div);
    });
  }

  function renderFollowUps(items) {
    followUpsList.innerHTML = '';
    (items || []).forEach(function (f) {
      var div = document.createElement('div');
      div.className = 'follow-up-item';
      div.setAttribute('role', 'listitem');
      div.innerHTML =
        '<span class="item-text">' + esc(f.item || '') + '</span>' +
        '<span class="due-date">' + esc(f.dueDate || '') + '</span>' +
        '<span class="responsible">' + esc(f.responsible || '') + '</span>';
      followUpsList.appendChild(div);
    });
  }

  function renderHistory(meetings) {
    historyList.innerHTML = '';
    (meetings || []).forEach(function (m) {
      var item = document.createElement('div');
      item.className = 'history-item';
      item.setAttribute('role', 'listitem');
      var date = new Date(m.summarizedAt).toLocaleDateString();
      item.innerHTML =
        '<div class="history-item-name">' + esc(m.title) + '</div>' +
        '<div class="history-meta">' +
          '<span class="history-item-date">' + date + '</span>' +
          '<span class="history-status">' + esc(m.status) + '</span>' +
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
   * Summarization pipeline
   * =================================================================== */

  var processing = false;

  function runSummarization(text, name) {
    if (processing) return;
    processing = true;

    hide(errorBanner);
    showLoading();

    var meetingType = getMeetingType();

    summarizeMeeting(text, meetingType, name)
      .then(function (result) {
        renderMeetingOverview(result);
        renderExecutiveSummary(result.executiveSummary);
        renderActionItems(result.actionItems);
        renderDecisions(result.decisions);
        renderKeyPoints(result.keyPoints);
        renderFollowUps(result.followUps);

        saveMeeting({
          title: result.meetingTitle || name || 'Untitled Meeting',
          type: result.meetingType || meetingType,
          summarizedAt: new Date().toISOString(),
          status: 'Summarized',
        });

        renderHistory(getMeetings());
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

  function handleFileSelect(file) {
    if (!file) {
      selectedFile = null;
      updateSummarizeButton();
      return;
    }
    var ext = (file.name || '').split('.').pop().toLowerCase();
    if (['txt', 'pdf', 'docx'].indexOf(ext) === -1) {
      showError('Unsupported file type ".' + ext + '". Please upload a TXT, PDF, or DOCX file.');
      selectedFile = null;
    } else {
      selectedFile = file;
    }
    updateSummarizeButton();
  }

  function processFile(file) {
    if (!file || processing) return;
    processing = true;
    hide(errorBanner);
    showLoading();

    var ext = (file.name || '').split('.').pop().toLowerCase();
    extractText(file)
      .then(function (text) {
        if (!text || text.trim().length < 20) {
          console.warn('Could not extract meaningful text; using filename.');
          if (!text) showError('Could not extract text from this ' + ext.toUpperCase() + '. Summarizing by filename only.');
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
    if (e.dataTransfer.files.length > 0) handleFileSelect(e.dataTransfer.files[0]);
  });

  // Click to browse — stopPropagation prevents the programmatic click from bubbling back up
  uploadZone.addEventListener('click', function (e) {
    if (e.target === fileInput) return;
    fileInput.click();
  });
  uploadZone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('click', function (e) { e.stopPropagation(); });
  fileInput.addEventListener('change', function () {
    if (fileInput.files.length > 0) {
      handleFileSelect(fileInput.files[0]);
    } else {
      handleFileSelect(null);
    }
  });

  // Paste textarea — enable button when text or file is available
  function updateSummarizeButton() {
    var hasText = pasteInput.value.trim().length >= 10;
    var hasFile = selectedFile !== null;
    btnSummarize.disabled = !hasText && !hasFile;
  }

  pasteInput.addEventListener('input', updateSummarizeButton);

  btnSummarize.addEventListener('click', function () {
    var text = pasteInput.value.trim();
    if (text.length >= 10) {
      runSummarization(text, 'Pasted Transcript');
    } else if (selectedFile) {
      processFile(selectedFile);
    }
  });

  // New meeting button
  btnNewMeeting.addEventListener('click', function () {
    pasteInput.value = '';
    fileInput.value = '';
    selectedFile = null;
    btnSummarize.disabled = true;
    showLanding();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* =====================================================================
   * Init
   * =================================================================== */

  renderHistory(getMeetings());
  updateSummarizeButton();

})();
