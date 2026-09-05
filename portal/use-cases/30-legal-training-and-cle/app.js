/**
 * Legal Training & CLE — Use Case App (self-contained, no ES modules).
 * Form-based: topic, practice area, audience level, format, focus areas.
 * Sends form data to the Nutanix AI endpoint via the local proxy for
 * training content generation. Results are persisted to the database for history.
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
   * Inference — training content generation via chat completions
   * =================================================================== */

  var SYSTEM_PROMPT =
    'You are a legal training AI. Generate CLE and training content. Respond with JSON: title, summary, learningObjectives (array of strings), sections (array of {heading, content, keyPoints (array)}), assessmentQuestions (array of {question, options (array of strings), correctAnswer (number 0-based index), explanation}), keyTakeaways (array of strings), recommendedResources (array of {title, type, description}), estimatedDuration (string). Respond ONLY with valid JSON.';

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

  function generateTraining(formData) {
    var userContent =
      'Generate legal training content with these parameters:\n' +
      '- Topic: ' + (formData.topic || 'General legal training') + '\n' +
      '- Practice Area: ' + (formData.practiceArea || 'Corporate') + '\n' +
      '- Audience Level: ' + (formData.audienceLevel || 'All') + '\n' +
      '- Format: ' + (formData.format || 'CLE Presentation') + '\n' +
      '- Specific Focus Areas: ' + (formData.focusAreas || 'None specified');

    return chatCompletion(
      [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      { maxTokens: 4096 }
    )
      .then(function (response) {
        var raw = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
        if (!raw) throw new Error('No response content from AI');
        var parsed = parseAiJson(raw);
        if (!parsed.title || !parsed.sections) throw new Error('Response missing required fields (title, sections)');
        return parsed;
      });
  }

  /* =====================================================================
   * Database — persistent storage via /api/db/summaries
   * =================================================================== */

  var DB_API = '/api/db/summaries';
  var USE_CASE = 'uc30';
  var localHistory = [];

  function saveAnalysisToDb(result, name) {
    var title = name || result.title || 'Untitled Training';
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
        console.warn('Failed to persist training:', err.message);
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
      .catch(function (err) { console.warn('Failed to delete training:', err.message); });
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
  var trainingForm = document.getElementById('training-form');
  var btnGenerate = document.getElementById('btn-generate');
  var loadingSection = document.getElementById('loading-section');
  var resultsSection = document.getElementById('results-section');
  var btnNewAnalysis = document.getElementById('btn-new-analysis');
  var trainingTitleEl = document.getElementById('training-title');
  var trainingSummaryEl = document.getElementById('training-summary');
  var trainingDurationEl = document.getElementById('training-duration');
  var learningObjectivesList = document.getElementById('learning-objectives-list');
  var trainingSectionsEl = document.getElementById('training-sections');
  var keyTakeawaysList = document.getElementById('key-takeaways-list');
  var assessmentQuestionsEl = document.getElementById('assessment-questions');
  var recommendedResourcesEl = document.getElementById('recommended-resources');
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
    if (loadingStatus) loadingStatus.textContent = 'Generating training content\u2026';
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

  function renderLearningObjectives(arr) {
    learningObjectivesList.innerHTML = '';
    (arr || []).forEach(function (obj) {
      var li = document.createElement('li');
      li.textContent = typeof obj === 'string' ? obj : (obj.text || obj);
      learningObjectivesList.appendChild(li);
    });
  }

  function renderSections(sections) {
    trainingSectionsEl.innerHTML = '';
    (sections || []).forEach(function (sec) {
      var div = document.createElement('div');
      div.className = 'training-section';
      var heading = sec.heading || sec.title || 'Section';
      var content = sec.content || sec.body || '';
      var keyPoints = sec.keyPoints || sec.keypoints || [];
      var keyPointsHtml = '';
      if (keyPoints.length > 0) {
        keyPointsHtml = '<ul class="training-section-key-points">' +
          keyPoints.map(function (kp) { return '<li>' + esc(typeof kp === 'string' ? kp : (kp.text || kp)) + '</li>'; }).join('') +
          '</ul>';
      }
      div.innerHTML =
        '<h4 class="training-section-heading">' + esc(heading) + '</h4>' +
        '<div class="training-section-content">' + esc(content) + '</div>' +
        keyPointsHtml;
      trainingSectionsEl.appendChild(div);
    });
  }

  function renderKeyTakeaways(arr) {
    keyTakeawaysList.innerHTML = '';
    (arr || []).forEach(function (obj) {
      var li = document.createElement('li');
      li.textContent = typeof obj === 'string' ? obj : (obj.text || obj);
      keyTakeawaysList.appendChild(li);
    });
  }

  function renderAssessmentQuestions(questions) {
    assessmentQuestionsEl.innerHTML = '';
    (questions || []).forEach(function (q) {
      var div = document.createElement('div');
      div.className = 'assessment-question';
      var options = q.options || [];
      var correctIdx = typeof q.correctAnswer === 'number' ? q.correctAnswer : 0;
      var optionsHtml = options.map(function (opt, i) {
        var cls = i === correctIdx ? ' correct' : '';
        return '<li class="' + cls + '">' + esc(opt) + (i === correctIdx ? ' (Correct)' : '') + '</li>';
      }).join('');
      var expl = q.explanation ? '<p class="assessment-question-explanation"><strong>Explanation:</strong> ' + esc(q.explanation) + '</p>' : '';
      div.innerHTML =
        '<p class="assessment-question-text">' + esc(q.question) + '</p>' +
        '<ul class="assessment-question-options">' + optionsHtml + '</ul>' +
        expl;
      assessmentQuestionsEl.appendChild(div);
    });
  }

  function renderRecommendedResources(resources) {
    recommendedResourcesEl.innerHTML = '';
    (resources || []).forEach(function (r) {
      var div = document.createElement('div');
      div.className = 'recommended-resource';
      div.innerHTML =
        '<div class="recommended-resource-title">' + esc(r.title) + '</div>' +
        '<div class="recommended-resource-type">' + esc(r.type || 'Resource') + '</div>' +
        '<p class="recommended-resource-desc">' + esc(r.description || '') + '</p>';
      recommendedResourcesEl.appendChild(div);
    });
  }

  function displayTraining(result) {
    trainingTitleEl.textContent = result.title || 'Training Content';
    trainingSummaryEl.textContent = result.summary || '';
    trainingDurationEl.textContent = result.estimatedDuration ? 'Estimated duration: ' + result.estimatedDuration : '';
    renderLearningObjectives(result.learningObjectives || []);
    renderSections(result.sections || []);
    renderKeyTakeaways(result.keyTakeaways || []);
    renderAssessmentQuestions(result.assessmentQuestions || []);
    renderRecommendedResources(result.recommendedResources || []);
    showResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderHistoryInto(container, history) {
    container.innerHTML = '';
    if (!history || history.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color: #9e9e9e; font-size: 0.9rem; text-align: center; padding: 0.5rem 0;';
      empty.textContent = 'No training generated yet. Fill out the form to get started.';
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
      deleteBtn.setAttribute('aria-label', 'Delete this training');
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
        item.title = 'Click to view this training';
        item.addEventListener('click', function () { displayTraining(h.data); });
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

    generateTraining(formData)
      .then(function (result) {
        setStage(stageSend, 'done');
        setStage(stageGenerate, 'done');
        setStage(stageRender, 'active', 'Rendering results\u2026');

        displayTraining(result);

        saveAnalysisToDb(result, formData.topic).then(function () {
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
   * Event listeners
   * =================================================================== */

  trainingForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var formData = {
      topic: document.getElementById('topic-input').value.trim(),
      practiceArea: document.getElementById('practice-area').value,
      audienceLevel: document.getElementById('audience-level').value,
      format: document.getElementById('format').value,
      focusAreas: document.getElementById('focus-areas').value.trim(),
    };
    if (!formData.topic) {
      showError('Please enter a topic.');
      return;
    }
    runGeneration(formData);
  });

  btnNewAnalysis.addEventListener('click', function () {
    trainingForm.reset();
    showLanding();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* =====================================================================
   * Clear history
   * =================================================================== */

  function handleClearAll() {
    if (!confirm('Delete all recent training?')) return;
    deleteAllAnalysesFromDb().then(function () { renderHistory(getHistory()); });
  }

  if (btnClearHistory) btnClearHistory.addEventListener('click', handleClearAll);
  if (btnClearResultsHistory) btnClearResultsHistory.addEventListener('click', handleClearAll);

  /* =====================================================================
   * Init — load persisted training from the database
   * =================================================================== */

  loadHistoryFromDb().then(function (history) {
    renderHistory(history);
  });

})();
