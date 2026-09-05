/**
 * Board & Governance Documents — Use Case App (self-contained, no ES modules).
 * Form-based: document type, company, date, attendees, agenda, key decisions.
 * Sends form data to the Nutanix AI endpoint via the local proxy for
 * governance document generation. Results are persisted to the database for history.
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
   * Inference — governance document generation via chat completions
   * =================================================================== */

  var SYSTEM_PROMPT =
    'You are a corporate governance AI. Generate board and governance documents. ' +
    'Respond with JSON: documentType, title, document (full formatted text of the resolution/minutes/charter), ' +
    'attendees (array of {name, title, present (boolean)}), ' +
    'actionItems (array of {action, assignee, deadline, status}), ' +
    'complianceNotes (array of strings), nextSteps (array of strings). ' +
    'Respond ONLY with valid JSON.';

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

  function generateGovernanceDoc(formData) {
    var userContent =
      'Generate a ' + (formData.docType || 'Meeting Minutes') + ' for:\n\n' +
      'Company: ' + (formData.companyName || 'N/A') + '\n' +
      'Meeting Date: ' + (formData.meetingDate || 'N/A') + '\n\n' +
      'Attendees:\n' + (formData.attendees || 'N/A') + '\n\n' +
      'Agenda Items:\n' + (formData.agendaItems || 'N/A') + '\n\n' +
      'Key Decisions:\n' + (formData.keyDecisions || 'N/A');

    return chatCompletion(
      [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      { maxTokens: 4096 }
    )
      .then(function (response) {
        var raw = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
        if (!raw) throw new Error('No response content from AI');
        var parsed = parseAiJson(raw);
        if (!parsed.document) throw new Error('Response missing document field');
        return parsed;
      });
  }

  /* =====================================================================
   * Database — persistent storage via /api/db/summaries
   * =================================================================== */

  var DB_API = '/api/db/summaries';
  var USE_CASE = 'uc29';
  var localHistory = [];

  function saveAnalysisToDb(result, name) {
    var title = name || (result.title || 'Untitled Document');
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
        console.warn('Failed to persist document:', err.message);
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
      .catch(function (err) { console.warn('Failed to delete document:', err.message); });
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
  var governanceForm = document.getElementById('governance-form');
  var btnGenerate = document.getElementById('btn-generate');
  var loadingSection = document.getElementById('loading-section');
  var resultsSection = document.getElementById('results-section');
  var btnNewAnalysis = document.getElementById('btn-new-analysis');
  var documentDisplay = document.getElementById('document-display');
  var attendanceSummary = document.getElementById('attendance-summary');
  var actionItemsList = document.getElementById('action-items-list');
  var complianceNotes = document.getElementById('compliance-notes');
  var historyList = document.getElementById('history-list');
  var resultsHistoryList = document.getElementById('results-history-list');
  var btnClearHistory = document.getElementById('btn-clear-history');
  var btnClearResultsHistory = document.getElementById('btn-clear-results-history');
  var errorBanner = document.getElementById('error-banner');
  var loadingStatus = document.getElementById('loading-status');
  var stageSend = document.getElementById('stage-send');
  var stageGenerate = document.getElementById('stage-generate');
  var stageRender = document.getElementById('stage-render');
  var allStages = [stageSend, stageGenerate, stageRender];

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
    if (loadingStatus) loadingStatus.textContent = 'Generating document\u2026';
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

  function renderDocument(result) {
    documentDisplay.textContent = result.document || '';
  }

  function renderAttendance(attendees) {
    attendanceSummary.innerHTML = '';
    if (!attendees || attendees.length === 0) {
      attendanceSummary.textContent = 'No attendees listed.';
      return;
    }
    var table = document.createElement('table');
    table.innerHTML = '<thead><tr><th scope="col">Name</th><th scope="col">Title</th><th scope="col">Present</th></tr></thead><tbody></tbody>';
    var tbody = table.querySelector('tbody');
    attendees.forEach(function (a) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + esc(a.name || '') + '</td>' +
        '<td>' + esc(a.title || '') + '</td>' +
        '<td>' + (a.present ? 'Yes' : 'No') + '</td>';
      tbody.appendChild(tr);
    });
    attendanceSummary.appendChild(table);
  }

  function renderActionItems(items) {
    actionItemsList.innerHTML = '';
    if (!items || items.length === 0) {
      actionItemsList.textContent = 'No action items.';
      return;
    }
    items.forEach(function (item) {
      var div = document.createElement('div');
      div.className = 'action-item';
      div.setAttribute('role', 'listitem');
      var meta = [];
      if (item.assignee) meta.push('Assignee: ' + item.assignee);
      if (item.deadline) meta.push('Deadline: ' + item.deadline);
      if (item.status) meta.push('Status: ' + item.status);
      div.innerHTML =
        '<div class="action-item-action">' + esc(item.action || '') + '</div>' +
        '<div class="action-item-meta">' +
          meta.map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('') +
        '</div>';
      actionItemsList.appendChild(div);
    });
  }

  function renderComplianceNotes(notes) {
    complianceNotes.innerHTML = '';
    if (!notes || notes.length === 0) {
      complianceNotes.textContent = 'No compliance notes.';
      return;
    }
    notes.forEach(function (note) {
      var div = document.createElement('div');
      div.className = 'compliance-note';
      div.setAttribute('role', 'listitem');
      div.textContent = note;
      complianceNotes.appendChild(div);
    });
  }

  function displayResult(result) {
    renderDocument(result);
    renderAttendance(result.attendees);
    renderActionItems(result.actionItems);
    renderComplianceNotes(result.complianceNotes);
    showResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderHistoryInto(container, history) {
    container.innerHTML = '';
    if (!history || history.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: #9e9e9e; font-size: 0.9rem; text-align: center; padding: 0.5rem 0;';
      empty.textContent = 'No documents yet. Complete the form to get started.';
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
      deleteBtn.setAttribute('aria-label', 'Delete this document');
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
        '</div>';
      item.appendChild(deleteBtn);

      if (h.data) {
        item.title = 'Click to view this document';
        item.addEventListener('click', function () { displayResult(h.data); });
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
   * Generation pipeline
   * =================================================================== */

  var processing = false;

  function runGeneration(formData) {
    if (processing) return;
    processing = true;

    hide(errorBanner);
    showLoading();
    setStage(stageSend, 'active', 'Sending to AI\u2026');

    generateGovernanceDoc(formData)
      .then(function (result) {
        setStage(stageSend, 'done');
        setStage(stageGenerate, 'done');
        setStage(stageRender, 'active', 'Rendering results\u2026');

        displayResult(result);

        var title = (formData.companyName || 'Document') + ' — ' + (formData.docType || '');
        saveAnalysisToDb(result, title).then(function () {
          renderHistory(getHistory());
        });
        setStage(stageRender, 'done');
      })
      .catch(function (err) {
        console.error('Generation failed:', err);
        showError('Generation failed: ' + err.message);
        showLanding();
      })
      .then(function () { processing = false; });
  }

  /* =====================================================================
   * Form handling
   * =================================================================== */

  governanceForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (processing) return;

    var formData = {
      docType: document.getElementById('doc-type').value,
      companyName: document.getElementById('company-name').value.trim(),
      meetingDate: document.getElementById('meeting-date').value,
      attendees: document.getElementById('attendees').value.trim(),
      agendaItems: document.getElementById('agenda-items').value.trim(),
      keyDecisions: document.getElementById('key-decisions').value.trim(),
    };

    if (!formData.docType || !formData.companyName || !formData.meetingDate) {
      showError('Please complete required fields: Document Type, Company Name, and Meeting Date.');
      return;
    }

    runGeneration(formData);
  });

  /* =====================================================================
   * Event listeners
   * =================================================================== */

  btnNewAnalysis.addEventListener('click', function () {
    governanceForm.reset();
    showLanding();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  function handleClearAll() {
    if (!confirm('Delete all recent documents?')) return;
    deleteAllAnalysesFromDb().then(function () { renderHistory(getHistory()); });
  }

  if (btnClearHistory) btnClearHistory.addEventListener('click', handleClearAll);
  if (btnClearResultsHistory) btnClearResultsHistory.addEventListener('click', handleClearAll);

  /* =====================================================================
   * Init — load persisted documents from the database
   * =================================================================== */

  loadHistoryFromDb().then(function (history) {
    renderHistory(history);
  });

})();
