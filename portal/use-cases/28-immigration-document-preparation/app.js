/**
 * Immigration Document Preparation — Use Case App (self-contained, no ES modules).
 * Form-based input for visa petition preparation. Sends form data to the Nutanix AI
 * endpoint via the local proxy. Results include petition outline, document checklist,
 * evidence recommendations, timeline, and warnings.
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
   * Inference — immigration petition preparation via chat completions
   * =================================================================== */

  var SYSTEM_PROMPT =
    'You are an immigration document preparation AI. Assist with visa petition preparation. ' +
    'Respond with JSON containing: ' +
    '"visaType", "petitionTitle", "summary", ' +
    '"petitionOutline" (array of { "section", "content" }), ' +
    '"requiredDocuments" (array of { "document", "source", "status" (Required/Recommended/Optional), "notes" }), ' +
    '"evidenceRecommendations" (array of { "category", "description", "strengthLevel" (Strong/Moderate/Weak), "tips" }), ' +
    '"processingTimeline" (array of { "step", "estimatedDuration", "description" }), ' +
    '"warnings" (array of strings). ' +
    'Respond ONLY with valid JSON, no markdown fences.';

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

  function preparePetition(formData) {
    var userContent = 'Prepare an immigration petition with the following information:\n\n' +
      'Visa Type: ' + (formData.visaType || 'Not specified') + '\n' +
      'Beneficiary Name: ' + (formData.beneficiaryName || '') + '\n' +
      'Beneficiary Nationality: ' + (formData.beneficiaryNationality || '') + '\n' +
      'Beneficiary Education: ' + (formData.beneficiaryEducation || '') + '\n' +
      'Beneficiary Experience: ' + (formData.beneficiaryExperience || '') + '\n' +
      'Petitioner Name: ' + (formData.petitionerName || '') + '\n' +
      'Petitioner Info: ' + (formData.petitionerInfo || '') + '\n' +
      'Job Title/Description: ' + (formData.jobDescription || '') + '\n' +
      'Special Qualifications: ' + (formData.specialQualifications || '');

    return chatCompletion(
      [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      { maxTokens: 4096 }
    )
      .then(function (response) {
        var raw = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
        if (!raw) throw new Error('No response content from AI');
        var parsed = parseAiJson(raw);
        if (!parsed.visaType && !parsed.petitionOutline) throw new Error('Response missing required fields');
        return parsed;
      });
  }

  /* =====================================================================
   * Database — persistent storage via /api/db/summaries
   * =================================================================== */

  var DB_API = '/api/db/summaries';
  var USE_CASE = 'uc28';
  var localHistory = [];

  function saveAnalysisToDb(result, name) {
    var title = name || 'Untitled Petition';
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
   * DOM references
   * =================================================================== */

  var landingSection = document.getElementById('landing-section');
  var petitionForm = document.getElementById('petition-form');
  var btnPrepare = document.getElementById('btn-prepare');
  var loadingSection = document.getElementById('loading-section');
  var resultsSection = document.getElementById('results-section');
  var btnNewAnalysis = document.getElementById('btn-new-analysis');
  var petitionTitleEl = document.getElementById('petition-title');
  var petitionSummaryEl = document.getElementById('petition-summary');
  var petitionOutlineEl = document.getElementById('petition-outline');
  var checklistTbody = document.getElementById('checklist-tbody');
  var evidenceRecommendationsEl = document.getElementById('evidence-recommendations');
  var processingTimelineEl = document.getElementById('processing-timeline');
  var warningsListEl = document.getElementById('warnings-list');
  var historyList = document.getElementById('history-list');
  var resultsHistoryList = document.getElementById('results-history-list');
  var btnClearHistory = document.getElementById('btn-clear-history');
  var btnClearResultsHistory = document.getElementById('btn-clear-results-history');
  var errorBanner = document.getElementById('error-banner');
  var loadingStatus = document.getElementById('loading-status');
  var stageSend = document.getElementById('stage-send');
  var stageAnalyze = document.getElementById('stage-analyze');
  var stageRender = document.getElementById('stage-render');
  var allStages = [stageSend, stageAnalyze, stageRender];

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
    if (loadingStatus) loadingStatus.textContent = 'Preparing petition\u2026';
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
    var s = (status || '').toLowerCase();
    if (s === 'required') return 'status-required';
    if (s === 'recommended') return 'status-recommended';
    return 'status-optional';
  }

  function strengthClass(level) {
    var l = (level || '').toLowerCase();
    if (l === 'strong') return 'strong';
    if (l === 'moderate') return 'moderate';
    return 'weak';
  }

  function renderPetitionOutline(outline) {
    petitionOutlineEl.innerHTML = '';
    (outline || []).forEach(function (item) {
      var div = document.createElement('div');
      div.className = 'outline-item';
      div.setAttribute('role', 'listitem');
      div.innerHTML =
        '<div class="outline-section">' + esc(item.section) + '</div>' +
        '<p class="outline-content">' + esc(item.content) + '</p>';
      petitionOutlineEl.appendChild(div);
    });
  }

  function renderChecklist(docs) {
    checklistTbody.innerHTML = '';
    (docs || []).forEach(function (d) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + esc(d.document) + '</td><td>' + esc(d.source || '') + '</td>' +
        '<td class="' + statusClass(d.status) + '">' + esc(d.status || '') + '</td>' +
        '<td>' + esc(d.notes || '') + '</td>';
      checklistTbody.appendChild(tr);
    });
  }

  function renderEvidence(recs) {
    evidenceRecommendationsEl.innerHTML = '';
    (recs || []).forEach(function (r) {
      var card = document.createElement('div');
      card.className = 'evidence-card strength-' + strengthClass(r.strengthLevel);
      card.setAttribute('role', 'listitem');
      card.innerHTML =
        '<div class="evidence-category">' + esc(r.category) + '</div>' +
        '<span class="evidence-strength ' + strengthClass(r.strengthLevel) + '">' + esc(r.strengthLevel || '') + '</span>' +
        '<p class="evidence-desc">' + esc(r.description) + '</p>' +
        (r.tips ? '<p class="evidence-tips">' + esc(r.tips) + '</p>' : '');
      evidenceRecommendationsEl.appendChild(card);
    });
  }

  function renderTimeline(timeline) {
    processingTimelineEl.innerHTML = '';
    (timeline || []).forEach(function (t) {
      var item = document.createElement('div');
      item.className = 'timeline-item';
      item.setAttribute('role', 'listitem');
      item.innerHTML =
        '<span class="timeline-step">' + esc(t.step) + '</span>' +
        '<span class="timeline-duration">' + esc(t.estimatedDuration || '') + '</span>' +
        '<p class="timeline-desc">' + esc(t.description) + '</p>';
      processingTimelineEl.appendChild(item);
    });
  }

  function renderWarnings(warnings) {
    warningsListEl.innerHTML = '';
    (warnings || []).forEach(function (w) {
      var item = document.createElement('div');
      item.className = 'warning-item';
      item.setAttribute('role', 'listitem');
      item.textContent = w;
      warningsListEl.appendChild(item);
    });
  }

  function displayResults(result) {
    petitionTitleEl.textContent = result.petitionTitle || result.visaType + ' Petition';
    petitionSummaryEl.textContent = result.summary || '';
    renderPetitionOutline(result.petitionOutline);
    renderChecklist(result.requiredDocuments);
    renderEvidence(result.evidenceRecommendations);
    renderTimeline(result.processingTimeline);
    renderWarnings(result.warnings);
    showResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderHistoryInto(container, history) {
    container.innerHTML = '';
    if (!history || history.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: #9e9e9e; font-size: 0.9rem; text-align: center; padding: 0.5rem 0;';
      empty.textContent = 'No petitions yet. Complete the form to get started.';
      container.appendChild(empty);
      return;
    }
    history.forEach(function (h) {
      var item = document.createElement('div');
      item.className = 'history-item';
      item.setAttribute('role', 'listitem');
      var date = new Date(h.createdAt).toLocaleDateString();

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'history-item-delete';
      deleteBtn.setAttribute('aria-label', 'Delete this petition');
      deleteBtn.title = 'Delete';
      deleteBtn.innerHTML = '&#10005;';
      deleteBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!confirm('Delete "' + (h.title || 'Untitled') + '"?')) return;
        deleteAnalysisFromDb(h.id).then(function () { renderHistory(getHistory()); });
      });

      item.innerHTML =
        '<div class="history-item-name">' + esc(h.title) + '</div>' +
        '<div class="history-meta"><span class="history-item-date">' + date + '</span></div>';
      item.appendChild(deleteBtn);

      if (h.data) {
        item.title = 'Click to view this petition';
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
   * Form handling
   * =================================================================== */

  var processing = false;

  function getFormData() {
    return {
      visaType: document.getElementById('visa-type').value,
      beneficiaryName: document.getElementById('beneficiary-name').value,
      beneficiaryNationality: document.getElementById('beneficiary-nationality').value,
      beneficiaryEducation: document.getElementById('beneficiary-education').value,
      beneficiaryExperience: document.getElementById('beneficiary-experience').value,
      petitionerName: document.getElementById('petitioner-name').value,
      petitionerInfo: document.getElementById('petitioner-info').value,
      jobDescription: document.getElementById('job-description').value,
      specialQualifications: document.getElementById('special-qualifications').value,
    };
  }

  function runPreparation() {
    if (processing) return;
    var formData = getFormData();
    if (!formData.visaType) {
      showError('Please select a visa type.');
      return;
    }

    processing = true;
    hide(errorBanner);
    showLoading();
    setStage(stageSend, 'active', 'Sending to AI\u2026');

    preparePetition(formData)
      .then(function (result) {
        setStage(stageSend, 'done');
        setStage(stageAnalyze, 'done');
        setStage(stageRender, 'active', 'Rendering results\u2026');

        displayResults(result);

        var title = formData.visaType + ' - ' + (formData.beneficiaryName || 'Beneficiary');
        saveAnalysisToDb(result, title).then(function () {
          renderHistory(getHistory());
        });
        setStage(stageRender, 'done');
      })
      .catch(function (err) {
        console.error('Preparation failed:', err);
        showError('Preparation failed: ' + err.message);
        showLanding();
      })
      .then(function () { processing = false; });
  }

  /* =====================================================================
   * Event listeners
   * =================================================================== */

  petitionForm.addEventListener('submit', function (e) {
    e.preventDefault();
    runPreparation();
  });

  btnNewAnalysis.addEventListener('click', function () {
    petitionForm.reset();
    showLanding();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  function handleClearAll() {
    if (!confirm('Delete all recent petitions?')) return;
    deleteAllAnalysesFromDb().then(function () { renderHistory(getHistory()); });
  }

  if (btnClearHistory) btnClearHistory.addEventListener('click', handleClearAll);
  if (btnClearResultsHistory) btnClearResultsHistory.addEventListener('click', handleClearAll);

  /* =====================================================================
   * Init — load persisted petitions from the database
   * =================================================================== */

  loadHistoryFromDb().then(function (history) {
    renderHistory(history);
  });

})();
