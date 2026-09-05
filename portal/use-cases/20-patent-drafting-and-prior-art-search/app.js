/**
 * Patent Drafting & Prior Art — Use Case App (self-contained, no ES modules).
 * Form-based input for invention details. Sends to Nutanix AI for draft claims
 * and prior art analysis. Results persisted to database for history.
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
   * Inference — patent draft generation via chat completions
   * =================================================================== */

  var SYSTEM_PROMPT =
    'You are a patent drafting AI. Generate patent claims and identify prior art. ' +
    'Respond with JSON containing: ' +
    '"noveltyScore" (integer 1-100), "title" (string), "abstract" (2-3 sentences), ' +
    '"claims" (array of { "number", "type" ("independent" or "dependent"), "text", "dependsOn" (number or null) }), ' +
    '"priorArt" (array of { "title", "patentNumber", "applicant", "date", "relevanceScore" (0-100), "overlap", "distinction" }), ' +
    '"suggestions" (array of strings for improving claims), ' +
    '"technologyClassification" (string). ' +
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

  var MAX_INPUT_CHARS = 8000;

  function truncateText(text, maxChars) {
    if (!text || text.length <= maxChars) return text || '';
    var headSize = Math.floor(maxChars * 0.6);
    var tailSize = Math.floor(maxChars * 0.3);
    return text.substring(0, headSize) +
      '\n\n[... truncated (' + text.length.toLocaleString() + ' chars) ...]\n\n' +
      text.substring(text.length - tailSize);
  }

  function generatePatentDraft(formData) {
    var title = (formData.title || '').trim();
    var techField = (formData.techField || '').trim();
    var description = truncateText((formData.description || '').trim(), MAX_INPUT_CHARS);
    var features = truncateText((formData.features || '').trim(), 2000);
    var priorArt = truncateText((formData.knownPriorArt || '').trim(), 1500);

    if (!title || title.length < 3) {
      return Promise.reject(new Error('Please enter an invention title (at least 3 characters).'));
    }
    if (!techField) {
      return Promise.reject(new Error('Please select a technology field.'));
    }
    if (!description || description.length < 50) {
      return Promise.reject(new Error('Please provide an invention description (at least 50 characters).'));
    }

    var userContent = 'Generate patent claims and prior art analysis for the following invention:\n\n' +
      '**Title:** ' + title + '\n\n' +
      '**Technology Field:** ' + techField + '\n\n' +
      '**Description:**\n' + description + '\n\n';
    if (features) userContent += '**Key Features/Claims:**\n' + features + '\n\n';
    if (priorArt) userContent += '**Known Prior Art:**\n' + priorArt;

    return chatCompletion(
      [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      { maxTokens: 4096 }
    )
      .then(function (response) {
        var raw = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
        if (!raw) throw new Error('No response content from AI');
        var parsed = parseAiJson(raw);
        if (parsed.noveltyScore === undefined || !parsed.claims) throw new Error('Response missing required fields (noveltyScore, claims)');
        return parsed;
      });
  }

  /* =====================================================================
   * Database — persistent draft storage via /api/db/summaries
   * =================================================================== */

  var DB_API = '/api/db/summaries';
  var USE_CASE = 'uc20';
  var localHistory = [];

  function saveAnalysisToDb(result, name) {
    var title = name || 'Untitled Draft';
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

  function deleteAnalysisFromDb(id) {
    return fetch(DB_API + '?use_case=' + USE_CASE + '&id=' + id, { method: 'DELETE' })
      .then(function (res) { return res.json(); })
      .then(function () {
        localHistory = localHistory.filter(function (h) { return h.id !== id; });
      })
      .catch(function (err) { console.warn('Failed to delete draft:', err.message); });
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
  var patentForm = document.getElementById('patent-form');
  var btnGenerate = document.getElementById('btn-generate');
  var loadingSection = document.getElementById('loading-section');
  var resultsSection = document.getElementById('results-section');
  var btnNewDraft = document.getElementById('btn-new-draft');
  var noveltyScoreEl = document.getElementById('novelty-score');
  var noveltyHintEl = document.getElementById('novelty-hint');
  var noveltyDisplay = noveltyScoreEl ? noveltyScoreEl.closest('.novelty-score-display') : null;
  var abstractEl = document.getElementById('abstract-text');
  var claimsList = document.getElementById('claims-list');
  var priorArtList = document.getElementById('prior-art-list');
  var suggestionsList = document.getElementById('suggestions-list');
  var historyList = document.getElementById('history-list');
  var resultsHistoryList = document.getElementById('results-history-list');
  var btnClearHistory = document.getElementById('btn-clear-history');
  var btnClearResultsHistory = document.getElementById('btn-clear-results-history');
  var errorBanner = document.getElementById('error-banner');
  var loadingStatus = document.getElementById('loading-status');
  var stageAnalyze = document.getElementById('stage-analyze');
  var stageDraft = document.getElementById('stage-draft');
  var stageSearch = document.getElementById('stage-search');
  var stageRender = document.getElementById('stage-render');
  var allStages = [stageAnalyze, stageDraft, stageSearch, stageRender];

  function show(el) { if (el) el.classList.remove('hidden'); }
  function hide(el) { if (el) el.classList.add('hidden'); }

  function showError(msg) {
    if (!errorBanner) return;
    errorBanner.textContent = msg;
    show(errorBanner);
    setTimeout(function () { hide(errorBanner); }, 8000);
  }

  function resetStages() {
    (allStages || []).forEach(function (s) {
      if (s) s.classList.remove('active', 'done');
    });
    if (loadingStatus) loadingStatus.textContent = 'Analyzing invention\u2026';
  }

  function setStage(stage, status, statusText) {
    if (!stage) return;
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

  function noveltyClass(score) {
    if (score >= 70) return 'novelty-high';
    if (score >= 40) return 'novelty-medium';
    return 'novelty-low';
  }

  function relevanceClass(score) {
    if (score >= 70) return 'relevance-high';
    if (score >= 40) return 'relevance-medium';
    return 'relevance-low';
  }

  function renderNoveltyScore(score) {
    if (!noveltyScoreEl) return;
    noveltyScoreEl.textContent = score;
    noveltyScoreEl.className = 'novelty-score-number';
    if (noveltyDisplay) {
      noveltyDisplay.className = 'novelty-score-display ' + noveltyClass(score);
    }
    var hint = score >= 70 ? 'Strong novelty' : (score >= 40 ? 'Moderate novelty' : 'Lower novelty — consider strengthening claims');
    if (noveltyHintEl) noveltyHintEl.textContent = hint;
  }

  function renderAbstract(text) {
    if (abstractEl) abstractEl.textContent = text || '';
  }

  function renderClaims(claims) {
    if (!claimsList) return;
    claimsList.innerHTML = '';
    (claims || []).forEach(function (c) {
      var li = document.createElement('li');
      var typeClass = (c.type || 'independent').toLowerCase() === 'dependent' ? 'dependent' : '';
      var depText = c.dependsOn ? ' (depends on claim ' + c.dependsOn + ')' : '';
      li.innerHTML =
        '<span class="claim-type ' + typeClass + '">' + esc(c.type || 'independent') + '</span>' + depText +
        '<span class="claim-text">' + esc(c.text || '') + '</span>';
      claimsList.appendChild(li);
    });
  }

  function renderPriorArt(priorArt) {
    if (!priorArtList) return;
    priorArtList.innerHTML = '';
    (priorArt || []).forEach(function (pa) {
      var card = document.createElement('div');
      var relScore = pa.relevanceScore != null ? pa.relevanceScore : 50;
      card.className = 'prior-art-card ' + relevanceClass(relScore);
      card.setAttribute('role', 'listitem');
      card.innerHTML =
        '<div class="prior-art-card-header">' +
          '<h4 class="prior-art-card-title">' + esc(pa.title || 'Unknown') + '</h4>' +
          '<span class="prior-art-relevance ' + relevanceClass(relScore) + '">' + relScore + '%</span>' +
        '</div>' +
        '<div class="prior-art-meta">' +
          (pa.patentNumber ? esc(pa.patentNumber) + ' &bull; ' : '') +
          (pa.applicant ? esc(pa.applicant) + ' &bull; ' : '') +
          (pa.date ? esc(pa.date) : '') +
        '</div>' +
        (pa.overlap ? '<p class="prior-art-overlap"><strong>Overlap:</strong> ' + esc(pa.overlap) + '</p>' : '') +
        (pa.distinction ? '<p class="prior-art-distinction"><strong>Distinction:</strong> ' + esc(pa.distinction) + '</p>' : '');
      priorArtList.appendChild(card);
    });
  }

  function renderSuggestions(suggestions) {
    if (!suggestionsList) return;
    suggestionsList.innerHTML = '';
    (suggestions || []).forEach(function (s) {
      var li = document.createElement('li');
      li.textContent = s;
      suggestionsList.appendChild(li);
    });
  }

  function displayDraft(result) {
    renderNoveltyScore(result.noveltyScore);
    renderAbstract(result.abstract);
    renderClaims(result.claims);
    renderPriorArt(result.priorArt || []);
    renderSuggestions(result.suggestions || []);
    showResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderHistoryInto(container, history) {
    if (!container) return;
    container.innerHTML = '';
    if (!history || history.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: #9e9e9e; font-size: 0.9rem; text-align: center; padding: 0.5rem 0;';
      empty.textContent = 'No drafts yet. Complete the form to generate a draft.';
      container.appendChild(empty);
      return;
    }
    history.forEach(function (h) {
      var item = document.createElement('div');
      item.className = 'history-item';
      item.setAttribute('role', 'listitem');
      var score = h.data ? (h.data.noveltyScore != null ? h.data.noveltyScore : 0) : 0;
      var date = new Date(h.createdAt).toLocaleDateString();

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'history-item-delete';
      deleteBtn.setAttribute('aria-label', 'Delete this draft');
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
          (score ? '<span class="novelty-score-number" style="font-size:0.85rem;">' + score + '</span>' : '') +
        '</div>';
      item.appendChild(deleteBtn);

      if (h.data) {
        item.title = 'Click to view this draft';
        item.addEventListener('click', function () { displayDraft(h.data); });
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
   * Draft generation pipeline
   * =================================================================== */

  var processing = false;

  function runDraft(formData) {
    if (processing) return;
    processing = true;

    hide(errorBanner);

    var alreadyLoading = loadingSection && !loadingSection.classList.contains('hidden');
    if (!alreadyLoading) showLoading();

    setStage(stageAnalyze, 'active', 'Analyzing invention\u2026');

    generatePatentDraft(formData)
      .then(function (result) {
        setStage(stageAnalyze, 'done');
        setStage(stageDraft, 'active', 'Drafting claims\u2026');
        setStage(stageDraft, 'done');
        setStage(stageSearch, 'active', 'Searching prior art\u2026');
        setStage(stageSearch, 'done');
        setStage(stageRender, 'active', 'Rendering\u2026');

        displayDraft(result);

        saveAnalysisToDb(result, formData.title || 'Untitled Draft').then(function () {
          renderHistory(getHistory());
        });
        setStage(stageRender, 'done');
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

  if (patentForm) {
    patentForm.addEventListener('submit', function (e) {
      e.preventDefault();

      var formData = {
        title: document.getElementById('invention-title').value.trim(),
        techField: document.getElementById('tech-field').value,
        description: document.getElementById('invention-description').value.trim(),
        features: document.getElementById('key-features').value.trim(),
        knownPriorArt: document.getElementById('known-prior-art').value.trim(),
      };

      if (!formData.title || formData.title.length < 3) {
        showError('Please enter an invention title (at least 3 characters).');
        return;
      }
      if (!formData.techField) {
        showError('Please select a technology field.');
        return;
      }
      if (!formData.description || formData.description.length < 50) {
        showError('Please provide an invention description (at least 50 characters).');
        return;
      }

      runDraft(formData);
    });
  }

  if (btnNewDraft) {
    btnNewDraft.addEventListener('click', function () {
      var titleInput = document.getElementById('invention-title');
      var techInput = document.getElementById('tech-field');
      var descInput = document.getElementById('invention-description');
      var featuresInput = document.getElementById('key-features');
      var priorArtInput = document.getElementById('known-prior-art');
      if (titleInput) titleInput.value = '';
      if (techInput) techInput.value = '';
      if (descInput) descInput.value = '';
      if (featuresInput) featuresInput.value = '';
      if (priorArtInput) priorArtInput.value = '';
      showLanding();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* =====================================================================
   * Clear history
   * =================================================================== */

  function handleClearAll() {
    if (!confirm('Delete all recent drafts?')) return;
    deleteAllAnalysesFromDb().then(function () { renderHistory(getHistory()); });
  }

  if (btnClearHistory) btnClearHistory.addEventListener('click', handleClearAll);
  if (btnClearResultsHistory) btnClearResultsHistory.addEventListener('click', handleClearAll);

  /* =====================================================================
   * Init — load persisted drafts from the database
   * =================================================================== */

  loadHistoryFromDb().then(function (history) {
    renderHistory(history);
  });

})();
