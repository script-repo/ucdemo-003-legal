/**
 * Legal Intake & Triage — Use Case App (self-contained, no ES modules).
 * Submits intake requests to Nutanix AI via the local proxy for triage classification.
 * Returns matter type, jurisdiction, urgency, risk, routing, timeline, similar matters.
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
   * System prompt — legal intake triage JSON output
   * =================================================================== */

  var SYSTEM_PROMPT =
    'You are a legal intake triage AI. Given request details (description, urgency, practice area), return ONLY a valid JSON object with no markdown fences. Include:\n' +
    '- "matterType": classified type (e.g., "Contract Dispute", "Employment Claim", "IP Filing")\n' +
    '- "jurisdiction": detected or suggested jurisdiction\n' +
    '- "urgencyAssessment": { "level": "Low"|"Medium"|"High"|"Critical", "reasoning": string }\n' +
    '- "riskLevel": { "score": 1-10, "factors": string[] }\n' +
    '- "routing": { "team": string, "assigneeSuggestion": string, "reasoning": string }\n' +
    '- "estimatedResponse": estimated timeline string\n' +
    '- "similarMatters": [{ "title": string, "similarity": string, "outcome": string }]\n' +
    '- "nextSteps": string[] of recommended next actions\n' +
    '- "conflictFlags": string[] of potential conflict indicators (empty if none)\n' +
    'Respond ONLY with valid JSON.';

  var MOCK_TRIAGE = {
    matterType: 'Contract Dispute',
    jurisdiction: 'California, USA',
    urgencyAssessment: { level: 'High', reasoning: 'Contract termination deadline in 14 days; potential revenue impact.' },
    riskLevel: { score: 6, factors: ['Termination clause ambiguity', 'Potential breach claim', 'Multi-party involvement'] },
    routing: {
      team: 'Commercial Litigation',
      assigneeSuggestion: 'Senior associate with contract dispute experience',
      reasoning: 'Matter involves vendor contract termination and potential breach; commercial litigation team handles similar matters.',
    },
    estimatedResponse: 'Within 2 business days',
    similarMatters: [
      { title: 'Acme Corp v. TechVendor — Contract Termination', similarity: '92%', outcome: 'Settled favorably' },
      { title: 'XYZ Inc — Vendor Breach Claim', similarity: '85%', outcome: 'Mediation resolved' },
      { title: 'Global Services — Multi-party Contract Dispute', similarity: '78%', outcome: 'Ongoing' },
    ],
    nextSteps: [
      'Confirm receipt with requestor within 24 hours',
      'Gather contract documents and termination notice',
      'Schedule internal triage call with commercial litigation lead',
      'Run conflict check on all parties',
    ],
    conflictFlags: [],
  };

  function runTriage(formData) {
    var userContent =
      'Intake request:\n' +
      '- Requestor: ' + (formData.requestorName || 'Unknown') + '\n' +
      '- Department: ' + (formData.department || 'Not specified') + '\n' +
      '- Urgency (stated): ' + (formData.urgency || 'Not specified') + '\n' +
      '- Practice area (preferred): ' + (formData.practiceArea || 'Not specified') + '\n' +
      '- Description: ' + (formData.matterDescription || 'No description provided');

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
            if (parsed.matterType && parsed.routing) return parsed;
          } catch (_) {}
        }
        console.warn('Inference returned unexpected format, using mock data.');
        return JSON.parse(JSON.stringify(MOCK_TRIAGE));
      })
      .catch(function (err) {
        console.warn('Inference endpoint unavailable, using mock data:', err.message);
        return JSON.parse(JSON.stringify(MOCK_TRIAGE));
      });
  }

  /* =====================================================================
   * Intake history — in-memory mock
   * =================================================================== */

  var MOCK_INTAKES = [
    { id: 'intake-001', requestor: 'Jane Doe', matterType: 'Contract Dispute', submittedAt: '2024-01-15T10:30:00.000Z', urgency: 'High' },
    { id: 'intake-002', requestor: 'John Smith', matterType: 'Employment Claim', submittedAt: '2024-02-20T14:45:00.000Z', urgency: 'Medium' },
    { id: 'intake-003', requestor: 'Sarah Lee', matterType: 'IP Filing', submittedAt: '2024-03-01T09:00:00.000Z', urgency: 'Low' },
  ];

  var localIntakes = MOCK_INTAKES.slice();
  var nextId = 1000;

  function saveIntake(meta) {
    var saved = Object.assign({}, meta, { id: 'intake-' + String(nextId++).padStart(3, '0') });
    localIntakes.unshift(saved);
    return saved;
  }

  function getIntakes() { return localIntakes.slice(); }

  /* =====================================================================
   * DOM references
   * =================================================================== */

  var landingSection = document.getElementById('landing-section');
  var intakeForm = document.getElementById('intake-form');
  var btnSubmit = document.getElementById('btn-submit');
  var loadingSection = document.getElementById('loading-section');
  var resultsSection = document.getElementById('results-section');
  var btnNewRequest = document.getElementById('btn-new-request');
  var matterTypeBadge = document.getElementById('matter-type-badge');
  var jurisdictionText = document.getElementById('jurisdiction-text');
  var urgencyIndicator = document.getElementById('urgency-indicator');
  var urgencyValue = document.getElementById('urgency-value');
  var riskIndicator = document.getElementById('risk-indicator');
  var riskValue = document.getElementById('risk-value');
  var routingContent = document.getElementById('routing-content');
  var estimatedTimeline = document.getElementById('estimated-timeline');
  var similarMattersList = document.getElementById('similar-matters-list');
  var nextStepsList = document.getElementById('next-steps-list');
  var conflictFlagsSection = document.getElementById('conflict-flags-section');
  var conflictFlagsContent = document.getElementById('conflict-flags-content');
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

  function urgencyClass(level) {
    var l = (level || '').toLowerCase();
    if (l === 'critical') return 'urgency-critical';
    if (l === 'high') return 'urgency-high';
    if (l === 'medium') return 'urgency-medium';
    return 'urgency-low';
  }

  function riskClass(score) {
    if (score >= 8) return 'risk-critical';
    if (score >= 6) return 'risk-high';
    if (score >= 4) return 'risk-medium';
    return 'risk-low';
  }

  function renderResults(triage) {
    matterTypeBadge.textContent = triage.matterType || '--';
    jurisdictionText.textContent = triage.jurisdiction ? 'Jurisdiction: ' + triage.jurisdiction : '';

    var urgencyLevel = (triage.urgencyAssessment && triage.urgencyAssessment.level) || '--';
    urgencyValue.textContent = urgencyLevel;
    urgencyIndicator.className = 'urgency-indicator ' + urgencyClass(urgencyLevel);

    var riskScore = (triage.riskLevel && triage.riskLevel.score) != null ? triage.riskLevel.score : '--';
    riskValue.textContent = typeof riskScore === 'number' ? riskScore + '/10' : riskScore;
    riskIndicator.className = 'risk-indicator ' + (typeof riskScore === 'number' ? riskClass(riskScore) : '');

    if (triage.routing) {
      routingContent.innerHTML =
        '<p><strong>Team:</strong> ' + esc(triage.routing.team) + '</p>' +
        '<p><strong>Assignee suggestion:</strong> ' + esc(triage.routing.assigneeSuggestion || 'N/A') + '</p>' +
        '<p>' + esc(triage.routing.reasoning || '') + '</p>';
    } else {
      routingContent.textContent = 'No routing recommendation available.';
    }

    estimatedTimeline.textContent = triage.estimatedResponse || 'Not estimated';

    similarMattersList.innerHTML = '';
    (triage.similarMatters || []).forEach(function (m) {
      var li = document.createElement('li');
      li.innerHTML = esc(m.title) + ' <span class="similarity-badge">(' + esc(m.similarity) + ' — ' + esc(m.outcome || 'N/A') + ')</span>';
      similarMattersList.appendChild(li);
    });
    if ((triage.similarMatters || []).length === 0) {
      var empty = document.createElement('li');
      empty.textContent = 'No similar matters found.';
      similarMattersList.appendChild(empty);
    }

    nextStepsList.innerHTML = '';
    (triage.nextSteps || []).forEach(function (step) {
      var li = document.createElement('li');
      li.textContent = step;
      nextStepsList.appendChild(li);
    });
    if ((triage.nextSteps || []).length === 0) {
      var emptyStep = document.createElement('li');
      emptyStep.textContent = 'Await assignment.';
      nextStepsList.appendChild(emptyStep);
    }

    if (triage.conflictFlags && triage.conflictFlags.length > 0) {
      show(conflictFlagsSection);
      conflictFlagsContent.innerHTML = '<ul><li>' + triage.conflictFlags.map(function (f) { return esc(f); }).join('</li><li>') + '</li></ul>';
    } else {
      hide(conflictFlagsSection);
    }
  }

  function renderHistory(intakes) {
    historyList.innerHTML = '';
    (intakes || []).forEach(function (i) {
      var item = document.createElement('div');
      item.className = 'history-item';
      item.setAttribute('role', 'listitem');
      var date = new Date(i.submittedAt).toLocaleDateString();
      item.innerHTML =
        '<div class="history-item-name">' + esc(i.matterType || i.requestor) + '</div>' +
        '<div class="history-meta">' +
          '<span class="history-item-date">' + date + '</span>' +
          '<span class="urgency-value ' + urgencyClass(i.urgency) + '">' + esc(i.urgency || '') + '</span>' +
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
   * Triage pipeline
   * =================================================================== */

  var processing = false;

  function runTriagePipeline(formData) {
    if (processing) return;
    processing = true;

    hide(errorBanner);
    showLoading();

    runTriage(formData)
      .then(function (result) {
        renderResults(result);

        saveIntake({
          requestor: formData.requestorName,
          matterType: result.matterType,
          submittedAt: new Date().toISOString(),
          urgency: (result.urgencyAssessment && result.urgencyAssessment.level) || formData.urgency,
        });

        renderHistory(getIntakes());
        showResults();
      })
      .catch(function (err) {
        console.error('Triage failed:', err);
        showError('Triage failed: ' + err.message);
        showLanding();
      })
      .then(function () { processing = false; });
  }

  /* =====================================================================
   * Form handling
   * =================================================================== */

  function getFormData() {
    var form = intakeForm;
    if (!form) return {};
    var fd = new FormData(form);
    var data = {};
    fd.forEach(function (v, k) { data[k] = v; });
    return data;
  }

  function validateForm() {
    var name = document.getElementById('requestor-name');
    var email = document.getElementById('requestor-email');
    var desc = document.getElementById('matter-description');
    var valid = name && name.value.trim().length > 0 &&
      email && email.value.trim().length > 0 &&
      desc && desc.value.trim().length >= 20;
    btnSubmit.disabled = !valid;
  }

  /* =====================================================================
   * Event listeners
   * =================================================================== */

  intakeForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = getFormData();
    var urgencyRadio = intakeForm.querySelector('input[name="urgency"]:checked');
    if (urgencyRadio) data.urgency = urgencyRadio.value;
    data.practiceArea = document.getElementById('practice-area').value;
    runTriagePipeline(data);
  });

  intakeForm.addEventListener('input', validateForm);
  intakeForm.addEventListener('change', validateForm);

  btnNewRequest.addEventListener('click', function () {
    intakeForm.reset();
    validateForm();
    showLanding();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* =====================================================================
   * Init
   * =================================================================== */

  validateForm();
  renderHistory(getIntakes());

})();
