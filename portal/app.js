/**
 * Legal AI Portal — Navigation, card rendering, and use-case toggle logic.
 */
(function () {
  'use strict';

  /* =====================================================================
   * Use-case catalogue — all 30 use cases
   * =================================================================== */

  var ICONS = [
    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>',
    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M16 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/></svg>',
    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 7V4a2 2 0 012-2h8.5L20 7.5V20a2 2 0 01-2 2H4"/><path d="M8 12h8"/><path d="M8 16h8"/><polyline points="14 2 14 8 20 8"/></svg>',
    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>',
  ];

  var USE_CASES = [
    { id: 1,  slug: '01-contract-review-and-analysis', title: 'Contract Review & Analysis', desc: 'Upload contracts for AI-powered clause analysis, risk scoring, and deviation detection against firm playbooks.', live: true },
    { id: 2,  slug: '02-legal-research', title: 'Legal Research', desc: 'AI-assisted legal research across case law, statutes, and regulations with citation verification.', live: true },
    { id: 3,  slug: '03-document-summarization', title: 'Document Summarization', desc: 'Automatically summarize lengthy legal documents, briefs, and filings into concise, actionable digests.', live: true },
    { id: 4,  slug: '04-contract-risk-analysis', title: 'Contract Risk Analysis', desc: 'Identify and quantify contractual risks with AI-driven analysis of obligation, liability, and compliance exposure.', live: true },
    { id: 5,  slug: '05-legal-intake-and-triage', title: 'Legal Intake & Triage', desc: 'Streamline client intake with intelligent form routing, matter classification, and priority assignment.', live: true },
    { id: 6,  slug: '06-meeting-transcription-and-summarization', title: 'Meeting Transcription & Summarization', desc: 'Transcribe and summarize legal meetings, depositions, and client calls with key action items.', live: true },
    { id: 7,  slug: '07-automated-contract-redlining-and-clause-comparison', title: 'Automated Contract Redlining', desc: 'Compare contract versions, detect clause changes, and generate redline mark-ups automatically.', live: true },
    { id: 8,  slug: '08-e-discovery-and-document-review', title: 'E-Discovery & Document Review', desc: 'Accelerate e-discovery with AI-powered document review, relevance scoring, and privilege detection.', live: true },
    { id: 9,  slug: '09-document-drafting', title: 'Document Drafting', desc: 'Draft legal documents from templates with AI-assisted clause selection and language generation.', live: true },
    { id: 10, slug: '10-ma-due-diligence', title: 'M&A Due Diligence', desc: 'Automate due diligence document review for mergers and acquisitions with risk flagging and gap analysis.', live: true },
    { id: 11, slug: '11-client-communication-and-status-updates', title: 'Client Communication & Updates', desc: 'Generate professional client status updates, letters, and communications from matter data.', live: true },
    { id: 12, slug: '12-timekeeping-and-time-entry', title: 'Timekeeping & Time Entry', desc: 'AI-assisted time capture and narrative generation for accurate, compliant billing entries.', live: true },
    { id: 13, slug: '13-ebilling-and-compliance-review', title: 'E-Billing & Compliance Review', desc: 'Review billing entries for guideline compliance, flag exceptions, and suggest corrections.', live: true },
    { id: 14, slug: '14-matter-budgeting-and-pricing', title: 'Matter Budgeting & Pricing', desc: 'Generate data-driven matter budgets and pricing proposals using historical matter analytics.', live: true },
    { id: 15, slug: '15-conflicts-clearance', title: 'Conflicts Clearance', desc: 'Accelerate conflict checks with AI-powered entity matching, relationship mapping, and risk assessment.', live: true },
    { id: 16, slug: '16-knowledge-management-and-precedent-search', title: 'Knowledge Management', desc: 'Search firm knowledge bases and precedent documents using semantic, meaning-based retrieval.', live: true },
    { id: 17, slug: '17-regulatory-change-monitoring', title: 'Regulatory Change Monitoring', desc: 'Monitor regulatory updates across jurisdictions and assess impact on client matters and compliance.', live: true },
    { id: 18, slug: '18-litigation-strategy-and-predictive-analytics', title: 'Litigation Strategy & Prediction', desc: 'Predict case outcomes, analyze judge tendencies, and optimize litigation strategy with AI analytics.', live: true },
    { id: 19, slug: '19-deposition-and-transcript-analysis', title: 'Deposition & Transcript Analysis', desc: 'Analyze deposition transcripts for key testimony, contradictions, and impeachment opportunities.', live: true },
    { id: 20, slug: '20-patent-drafting-and-prior-art-search', title: 'Patent Drafting & Prior Art', desc: 'Draft patent applications and perform comprehensive prior art searches with AI assistance.', live: true },
    { id: 21, slug: '21-compliance-monitoring-and-reporting', title: 'Compliance Monitoring & Reporting', desc: 'Continuous compliance monitoring with automated reporting and alert generation.', live: true },
    { id: 22, slug: '22-lease-and-real-estate-document-review', title: 'Lease & Real Estate Review', desc: 'Review commercial leases and real estate documents for key terms, risks, and market deviations.', live: true },
    { id: 23, slug: '23-employment-agreement-and-hr-document-review', title: 'Employment & HR Document Review', desc: 'Analyze employment agreements, policies, and HR documents for compliance and risk.', live: true },
    { id: 24, slug: '24-policy-drafting-and-gap-analysis', title: 'Policy Drafting & Gap Analysis', desc: 'Draft corporate policies and identify compliance gaps against regulatory frameworks.', live: true },
    { id: 25, slug: '25-subpoena-and-information-request-response', title: 'Subpoena & Info Request Response', desc: 'Streamline responses to subpoenas and information requests with document identification and review.', live: true },
    { id: 26, slug: '26-legal-hold-management', title: 'Legal Hold Management', desc: 'Automate legal hold issuance, tracking, and compliance monitoring across custodians.', live: true },
    { id: 27, slug: '27-contract-lifecycle-management', title: 'Contract Lifecycle Management', desc: 'End-to-end contract management from drafting through renewal with AI-powered tracking and alerts.', live: true },
    { id: 28, slug: '28-immigration-document-preparation', title: 'Immigration Document Preparation', desc: 'Prepare immigration applications and supporting documents with AI-guided form completion.', live: true },
    { id: 29, slug: '29-board-and-governance-document-preparation', title: 'Board & Governance Documents', desc: 'Generate board resolutions, minutes, and governance documents from meeting data and templates.', live: true },
    { id: 30, slug: '30-legal-training-and-cle', title: 'Legal Training & CLE', desc: 'AI-powered CLE content generation, training materials, and knowledge assessment tools.', live: true },
  ];

  var DEFAULT_VISIBLE = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30];
  var STORAGE_KEY = 'legalAiPortal_visibleCases';

  /* =====================================================================
   * State helpers — localStorage
   * =================================================================== */

  function loadVisible() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        var parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return DEFAULT_VISIBLE.slice();
  }

  function saveVisible(ids) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch (_) {}
  }

  var visibleIds = loadVisible();

  /* =====================================================================
   * Card rendering
   * =================================================================== */

  var cardsGrid = document.getElementById('cards-grid');

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function cardHref(uc) {
    if (uc.live) return 'use-cases/' + uc.slug + '/index.html';
    return 'use-cases/' + uc.slug + '/PRD.md';
  }

  function renderCards() {
    cardsGrid.innerHTML = '';
    USE_CASES.forEach(function (uc) {
      if (visibleIds.indexOf(uc.id) === -1) return;

      var href = cardHref(uc);
      var icon = ICONS[(uc.id - 1) % ICONS.length];
      var badge = uc.live ? '' : '<span class="card-badge">Coming Soon</span>';
      var linkText = uc.live ? 'Launch' : 'View PRD';

      var a = document.createElement('a');
      a.href = href;
      a.className = 'card' + (uc.live ? '' : ' card--coming-soon');
      a.id = 'use-case-' + uc.id;
      a.setAttribute('aria-label', uc.title);
      a.innerHTML =
        '<div class="card-icon" aria-hidden="true">' + icon + '</div>' +
        badge +
        '<h3 class="card-title">' + esc(uc.title) + '</h3>' +
        '<p class="card-text">' + esc(uc.desc) + '</p>' +
        '<span class="card-link" aria-hidden="true">' + linkText + '</span>';
      cardsGrid.appendChild(a);
    });
  }

  /* =====================================================================
   * Toggle list rendering (off-canvas nav)
   * =================================================================== */

  var toggleList = document.getElementById('toggle-list');
  var btnShowAll = document.getElementById('btn-show-all');
  var btnShowDefault = document.getElementById('btn-show-default');

  function renderToggleList() {
    toggleList.innerHTML = '';
    USE_CASES.forEach(function (uc) {
      var li = document.createElement('li');
      li.className = 'toggle-item';

      var label = document.createElement('label');
      label.className = 'toggle-label';

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'toggle-checkbox';
      cb.checked = visibleIds.indexOf(uc.id) !== -1;
      cb.setAttribute('data-uc-id', String(uc.id));

      var num = document.createElement('span');
      num.className = 'toggle-num';
      num.textContent = String(uc.id).padStart(2, '0');

      var name = document.createElement('span');
      name.className = 'toggle-name';
      name.textContent = uc.title;

      label.appendChild(cb);
      label.appendChild(num);
      label.appendChild(name);

      if (uc.live) {
        var liveDot = document.createElement('span');
        liveDot.className = 'toggle-live-dot';
        liveDot.setAttribute('aria-label', 'Live');
        liveDot.title = 'Live';
        label.appendChild(liveDot);
      }
      li.appendChild(label);
      toggleList.appendChild(li);
    });
  }

  function syncFromCheckboxes() {
    var boxes = toggleList.querySelectorAll('.toggle-checkbox');
    visibleIds = [];
    boxes.forEach(function (cb) {
      if (cb.checked) visibleIds.push(Number(cb.getAttribute('data-uc-id')));
    });
    saveVisible(visibleIds);
    renderCards();
  }

  toggleList.addEventListener('change', function (e) {
    if (e.target.classList.contains('toggle-checkbox')) {
      syncFromCheckboxes();
    }
  });

  btnShowAll.addEventListener('click', function () {
    visibleIds = USE_CASES.map(function (uc) { return uc.id; });
    saveVisible(visibleIds);
    renderToggleList();
    renderCards();
  });

  btnShowDefault.addEventListener('click', function () {
    visibleIds = DEFAULT_VISIBLE.slice();
    saveVisible(visibleIds);
    renderToggleList();
    renderCards();
  });

  /* =====================================================================
   * Off-canvas navigation
   * =================================================================== */

  var nav = document.getElementById('offcanvas-nav');
  var backdrop = document.querySelector('.offcanvas-backdrop');
  var toggle = document.querySelector('.nav-toggle');
  var closeBtn = document.querySelector('.offcanvas-close');

  function openNav() {
    nav.classList.add('is-open');
    nav.removeAttribute('hidden');
    if (backdrop) {
      backdrop.classList.add('is-visible');
      backdrop.removeAttribute('hidden');
    }
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
    if (closeBtn) closeBtn.focus();
    document.body.style.overflow = 'hidden';
  }

  function closeNav() {
    nav.classList.remove('is-open');
    nav.setAttribute('hidden', '');
    if (backdrop) {
      backdrop.classList.remove('is-visible');
      backdrop.setAttribute('hidden', '');
    }
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    toggle.focus();
    document.body.style.overflow = '';
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      nav.classList.contains('is-open') ? closeNav() : openNav();
    });
  }

  if (closeBtn) closeBtn.addEventListener('click', closeNav);
  if (backdrop) backdrop.addEventListener('click', closeNav);

  nav.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeNav();
  });

  /* =====================================================================
   * Init
   * =================================================================== */

  renderToggleList();
  renderCards();

})();
