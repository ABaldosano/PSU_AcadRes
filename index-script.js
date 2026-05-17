/**
 * ============================================================
 * PSU AcadRes — index-script.js
 * Intelligent Academic Resource Management System
 * Palawan State University · College of Information Technology
 *
 * Frontend Interaction Layer — Prototype Phase
 * Architecture: Modular, scalable, FastAPI/Ollama-ready
 * ============================================================
 */

'use strict';

/* ============================================================
   SECTION A — CONSTANTS & CONFIGURATION
   ============================================================ */

/** Allowed upload MIME types and their display labels */
const ALLOWED_FILE_TYPES = {
  'application/pdf':                                                  'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'text/plain':                                                       'TXT',
};

/** Allowed file extensions (fallback check) */
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.txt'];

/** Max upload size in bytes (50 MB) */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** localStorage keys — centralised to avoid typos */
const LS = {
THEME:             'psu-acadres-theme',
ROLE:              'psu-acadres-role',
UPLOADS:           'psu-acadres-uploads',
PREFS:             'psu-acadres-prefs',
AI_STATS:          'psu-acadres-ai-stats',
PANEL:             'psu-acadres-panel',
STUDENT_YEAR:      'psu-acadres-student-year',
STUDENT_STANDING:  'psu-acadres-student-standing',
STUDENT_SEM:       'psu-acadres-student-sem',
STUDY_PROGRESS:    'psu-acadres-study-progress',
STUDY_SESSIONS:    'psu-acadres-study-sessions',
ACTIVITY_LOG:      'psu-acadres-activity-log',
SESSION_ID:        'psu-acadres-session-id',
};

/** API endpoints — FastAPI backend */
const API = {
  BASE:          'http://127.0.0.1:8000',
  UPLOAD:        'http://127.0.0.1:8000/api/upload',
  SUMMARIZE:     'http://127.0.0.1:8000/api/summarize',
  REPROCESS:     'http://127.0.0.1:8000/api/reprocess',
  DOCUMENTS:     'http://127.0.0.1:8000/api/documents',
  SEARCH:        'http://127.0.0.1:8000/api/search',
  ADMIN:         'http://127.0.0.1:8000/api/admin/stats',
  HEALTH:        'http://127.0.0.1:8000/api/health',
  QUIZ_ATTEMPT:  'http://127.0.0.1:8000/api/quiz-attempt',
  QUIZ_ATTEMPTS: 'http://127.0.0.1:8000/api/quiz-attempts',
};

/* ============================================================
   SECTION B — UTILITY FUNCTIONS
   ============================================================ */

/**
 * Safe localStorage getter — returns null if unavailable or parse fails.
 * @param {string} key
 * @returns {string|null}
 */
function lsGet(key) {
  try { return localStorage.getItem(key); }
  catch { return null; }
}

/**
 * Safe localStorage setter.
 * @param {string} key
 * @param {string} value
 */
function lsSet(key, value) {
  try { localStorage.setItem(key, value); }
  catch { /* storage unavailable — silently skip */ }
}

/**
 * Format bytes into a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Derive extension label from a File object.
 * @param {File} file
 * @returns {string}
 */
function getFileLabel(file) {
  if (ALLOWED_FILE_TYPES[file.type]) return ALLOWED_FILE_TYPES[file.type];
  const ext = file.name.split('.').pop().toUpperCase();
  return ext || 'FILE';
}

/**
 * Check if a File passes type and size validation.
 * Returns an error string or null if valid.
 * @param {File} file
 * @returns {string|null}
 */
function validateFile(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  const typeOk = ALLOWED_FILE_TYPES[file.type] || ALLOWED_EXTENSIONS.includes(ext);
  if (!typeOk) return `File type not allowed. Please upload PDF, DOCX, PPTX, or TXT files.`;
  if (file.size > MAX_FILE_SIZE) return `File too large. Maximum size is 50 MB.`;
  return null;
}

/**
 * Escape HTML to prevent XSS in dynamic content insertion.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Show a transient toast notification.
 * Creates and auto-removes a toast element.
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} [type='info']
 * @param {number} [duration=3500]
 */
function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    Object.assign(container.style, {
      position:  'fixed',
      bottom:    '1.5rem',
      right:     '1.5rem',
      zIndex:    '9999',
      display:   'flex',
      flexDirection: 'column',
      gap:       '0.5rem',
    });
    document.body.appendChild(container);
  }

  const iconMap = {
    info:    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M7 6v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="7" cy="4.5" r="0.75" fill="currentColor"/></svg>',
    success: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M4.5 7.5l2 2 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    warning: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 1.5L13 12H1L7 1.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/><path d="M7 5.5v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="7" cy="10" r="0.75" fill="currentColor"/></svg>',
    error:   '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M5 5l4 4M9 5l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  };
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.innerHTML = `<span class="toast__icon" aria-hidden="true">${iconMap[type] ?? iconMap.info}</span><span class="toast__msg">${escapeHtml(message)}</span>`;

  Object.assign(toast.style, {
    display:       'flex',
    alignItems:    'center',
    gap:           '0.5rem',
    padding:       '0.75rem 1.1rem',
    borderRadius:  'var(--radius-md, 0.625rem)',
    background:    'var(--bg-surface)',
    border:        '1px solid var(--border-default)',
    boxShadow:     'var(--shadow-lg)',
    color:         'var(--text-primary)',
    fontSize:      '0.9rem',
    maxWidth:      '22rem',
    opacity:       '0',
    transform:     'translateY(0.5rem)',
    transition:    'opacity 0.2s ease, transform 0.2s ease',
  });

  container.appendChild(toast);
  // Trigger entrance animation
  requestAnimationFrame(() => {
    toast.style.opacity  = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateY(0.5rem)';
    setTimeout(() => toast.remove(), 220);
  }, duration);
}

/* ============================================================
   SECTION C — API SERVICE LAYER
   Modular fetch wrappers — swap mock returns for real fetch()
   calls once FastAPI backend is available.
   ============================================================ */

const ApiService = {

    /**
     * Upload a file and metadata to the backend.
     * @param {FormData} formData
     * @returns {Promise<{success: boolean, fileId: string, message: string}>}
     */
  async uploadDocument(formData) {
    const response = await fetch(API.UPLOAD, { method: 'POST', body: formData });
    if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
    const json = await response.json();
    if (!json.success) throw new Error(json.message || 'Upload failed');
    return json.data;
  },

  /**
   * Request AI summarization for a document.
   * @param {string} fileId
   * @param {string} mode  'simple' | 'exam-focused' | 'detailed'
   * @returns {Promise<{summary: string, flashcards: Array, quiz: Array}>}
   */
  async summarizeDocument(fileId, mode) {
    const response = await fetch(API.SUMMARIZE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId, mode }),
    });
    if (!response.ok) throw new Error(`Summarization failed: ${response.status}`);
    const json = await response.json();
    if (!json.success) throw new Error(json.message || 'Summarization failed');
    return json.data;
  },

/**
   * Fetch admin-level statistics.
   * Falls back to locally-derived stats when backend is unavailable.
   * @returns {Promise<Object>}
   */
  async fetchAdminStats() {
    const localStats = () => {
      const files    = AppState.uploadedFiles;
      const subjects = [...new Set(files.map(f => f.subject).filter(Boolean))];
      return {
        totalFiles:    files.length,
        totalSubjects: subjects.length,
        aiRuns:        AppState.aiStats.summaries,
      };
    };
    try {
      const response = await fetch(API.ADMIN);
      if (!response.ok) throw new Error(`Admin stats failed: ${response.status}`);
      const json = await response.json();
      return json.data || localStats();
    } catch {
      return localStats();
    }
  },
};

/* ============================================================
   SECTION D — STATE MANAGEMENT
   ============================================================ */

const AppState = {
  theme:          'light',
  role:           'Student',
  currentPanel:   'hero',
  selectedFile:   null,
  uploadedFiles:  [],   // persisted to localStorage
  currentTab:     'summary',
  aiOutputCache:  {},   // keyed by fileId
  isProcessing:   false,
  aiStats:        { summaries: 0, flashcards: 0 },

/** Bootstrap state from localStorage */
  init() {
    this.theme        = lsGet(LS.THEME)  || 'light';
    this.role         = lsGet(LS.ROLE)   || '';
    this.currentPanel = lsGet(LS.PANEL)  || 'hero';
    const raw = lsGet(LS.UPLOADS);
    try { this.uploadedFiles = raw ? JSON.parse(raw) : []; }
    catch { this.uploadedFiles = []; }
    const rawStats = lsGet(LS.AI_STATS);
    try { this.aiStats = rawStats ? JSON.parse(rawStats) : { summaries: 0, flashcards: 0 }; }
    catch { this.aiStats = { summaries: 0, flashcards: 0 }; }

    // Persistent session ID — identifies this browser session for upload ownership
    let sid = lsGet(LS.SESSION_ID);
    if (!sid) {
      sid = 'sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
      lsSet(LS.SESSION_ID, sid);
    }
    this.sessionId = sid;
  },

  /** Persist upload metadata to localStorage */
  saveUploads() {
    lsSet(LS.UPLOADS, JSON.stringify(this.uploadedFiles));
  },

  /** Persist AI processing counters */
  saveAiStats() {
    lsSet(LS.AI_STATS, JSON.stringify(this.aiStats));
  },
};

/* ============================================================
   SECTION F2 — STUDENT PROFILE & ACCESS CONTROLLER
   ============================================================ */

const StudentProfileController = {

  getStudentYear() { return lsGet(LS.STUDENT_YEAR) || ''; },
  getStudentSem()  { return lsGet(LS.STUDENT_SEM)  || ''; },

  save(year, sem) {
    lsSet(LS.STUDENT_YEAR, year);
    lsSet(LS.STUDENT_SEM, sem);
    showToast('Academic profile saved.', 'success');
    ViewerController.refreshDocumentList();
  },

  /**
   * Returns all year/semester combos a student can access
   * based on their stored profile.
   */
  getAccessibleYearSemesters() {
    const YEAR_ORDER = { '1': 1, '2': 2, '3': 3, '4': 4 };
    const SEM_ORDER  = { '1': 1, '2': 2, 'summer': 3 };
    const sy = YEAR_ORDER[this.getStudentYear()] || 0;
    const ss = SEM_ORDER[this.getStudentSem()]   || 0;
    const accessible = [];
    for (const [y, yv] of Object.entries(YEAR_ORDER)) {
      for (const [s, sv] of Object.entries(SEM_ORDER)) {
        if (yv < sy || (yv === sy && sv <= ss)) {
          accessible.push({ year: y, sem: s });
        }
      }
    }
    return accessible;
  },

  isDocAccessible(doc) {
    if (!doc.yearLevel && !doc.year_level) return true;
    const YEAR_ORDER = { '1': 1, '2': 2, '3': 3, '4': 4 };
    const SEM_ORDER  = { '1': 1, '2': 2, 'summer': 3 };
    const sy = YEAR_ORDER[this.getStudentYear()] || 99;
    const ss = SEM_ORDER[this.getStudentSem()]   || 99;
    const dy = YEAR_ORDER[doc.yearLevel || doc.year_level] || 0;
    const ds = SEM_ORDER[doc.semester]                     || 0;
    if (dy === 0 || ds === 0) return true;
    if (dy < sy) return true;
    if (dy === sy && ds <= ss) return true;
    return false;
  },

  bindEvents() {
    // Restore saved profile values into dropdowns
    const yearEl = document.getElementById('profileYearLevel');
    const semEl  = document.getElementById('profileSemester');
    if (yearEl) yearEl.value = this.getStudentYear();
    if (semEl)  semEl.value  = this.getStudentSem();

    document.getElementById('saveStudentProfile')?.addEventListener('click', () => {
      const y = document.getElementById('profileYearLevel')?.value || '';
      const s = document.getElementById('profileSemester')?.value  || '';
      this.save(y, s);
    });
  },

  applyRoleVisibility(role) {
    const facultyFields  = document.getElementById('facultyOnlyFields');
    const studentProfile = document.getElementById('studentProfileFields');
    if (facultyFields)  facultyFields.style.display  = (role === 'Faculty' || role === 'Admin') ? '' : 'none';
    if (studentProfile) studentProfile.style.display = (role === 'Student') ? '' : 'none';
  },
};

const StudentSetupController = {

  bindEvents() {
    const confirmBtn = document.getElementById('confirmStudentSetupBtn');
    const backBtn    = document.getElementById('backToRoleSelectBtn');

    confirmBtn?.addEventListener('click', () => {
      const year     = document.getElementById('setupYearLevel')?.value    || '';
      const standing = document.getElementById('setupYearStanding')?.value || '';
      const sem      = document.getElementById('setupSemester')?.value     || '';

      if (!year || !sem) {
        showToast('Please select your Year Level and Semester.', 'warning');
        return;
      }

      lsSet(LS.STUDENT_YEAR,     year);
      lsSet(LS.STUDENT_STANDING, standing || year);
      lsSet(LS.STUDENT_SEM,      sem);

      const profileYearEl = document.getElementById('profileYearLevel');
      const profileSemEl  = document.getElementById('profileSemester');
      if (profileYearEl) profileYearEl.value = year;
      if (profileSemEl)  profileSemEl.value  = sem;

      PanelController.show('dashboard');
      showToast(`Profile saved. Welcome, ${year}Y / ${sem}S Student!`, 'success');
      ActivityController.log(`Student profile set: Year ${year} / Sem ${sem}`, 'info');
      ViewerController.refreshDocumentList();
    });

    backBtn?.addEventListener('click', () => PanelController.show('role-select'));

    // Pre-fill if returning
    const yearEl     = document.getElementById('setupYearLevel');
    const standingEl = document.getElementById('setupYearStanding');
    const semEl      = document.getElementById('setupSemester');
    if (yearEl)     yearEl.value     = lsGet(LS.STUDENT_YEAR)     || '';
    if (standingEl) standingEl.value = lsGet(LS.STUDENT_STANDING) || '';
    if (semEl)      semEl.value      = lsGet(LS.STUDENT_SEM)      || '';
  },
};

/* ============================================================
   SECTION F3 — STUDY PLANNER CONTROLLER
   ============================================================ */

const PlannerController = {

  _getProgress() {
    try { return JSON.parse(lsGet(LS.STUDY_PROGRESS) || '{}'); }
    catch { return {}; }
  },

  _saveProgress(data) {
    lsSet(LS.STUDY_PROGRESS, JSON.stringify(data));
  },

  _toggle(docId, field) {
    const data = this._getProgress();
    if (!data[docId]) data[docId] = { summary: false, flashcards: false, quiz: false };
    data[docId][field] = !data[docId][field];
    this._saveProgress(data);
    this.render();
  },

  _computeProgress() {
    const data  = this._getProgress();
    const files = AppState.uploadedFiles;
    if (!files.length) return { total: 0, done: 0, pct: 0 };
    let total = 0; let done = 0;
    files.forEach(f => {
      const p = data[f.id] || {};
      total += 3;
      done  += [p.summary, p.flashcards, p.quiz].filter(Boolean).length;
    });
    return { total, done, pct: total ? Math.round(done / total * 100) : 0 };
  },

  render() {
    const container = document.getElementById('plannerContainer');
    if (!container) return;

    const files    = AppState.uploadedFiles;
    const data     = this._getProgress();
    const progress = this._computeProgress();

    if (!files.length) {
      container.innerHTML = `<p style="padding:1rem;color:var(--text-secondary);font-size:0.875rem;">No documents uploaded yet.</p>`;
      return;
    }

    // Group by subject
    const bySubject = files.reduce((acc, f) => {
      const s = f.subject || 'Untagged';
      if (!acc[s]) acc[s] = [];
      acc[s].push(f);
      return acc;
    }, {});

    const subjectPct = (subFiles) => {
      let t = 0; let d = 0;
      subFiles.forEach(f => {
        const p = data[f.id] || {};
        t += 3;
        d += [p.summary, p.flashcards, p.quiz].filter(Boolean).length;
      });
      return t ? Math.round(d / t * 100) : 0;
    };

    container.innerHTML = `
      <div style="margin-bottom:1rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.35rem;">
          <span style="font-size:0.83rem;font-weight:600;color:var(--text-primary);">Overall Completion</span>
          <span style="font-size:0.83rem;color:var(--clr-primary-500,#1a5ef9);font-weight:700;">${progress.pct}%</span>
        </div>
        <div style="height:8px;border-radius:999px;background:var(--border-default);overflow:hidden;">
          <div style="height:100%;width:${progress.pct}%;background:var(--clr-primary-500,#1a5ef9);border-radius:999px;transition:width 0.4s ease;"></div>
        </div>
      </div>
      ${Object.entries(bySubject).map(([subject, subFiles]) => {
        const spct = subjectPct(subFiles);
        return `
          <div class="planner-subject" style="margin-bottom:0.75rem;border:1px solid var(--border-default);border-radius:0.625rem;overflow:hidden;">
            <div class="planner-subject__header" data-subject="${escapeHtml(subject)}"
                 style="display:flex;align-items:center;justify-content:space-between;padding:0.65rem 1rem;background:var(--bg-surface-2);cursor:pointer;user-select:none;">
              <span style="font-weight:600;font-size:0.88rem;">${escapeHtml(subject)}</span>
              <div style="display:flex;align-items:center;gap:0.75rem;">
                <span style="font-size:0.78rem;color:var(--clr-primary-500,#1a5ef9);font-weight:700;">${spct}%</span>
                <span class="planner-toggle-icon" style="font-size:0.75rem;">▼</span>
              </div>
            </div>
            <div class="planner-subject__body" style="padding:0.5rem 1rem 0.75rem;">
              <div style="height:4px;border-radius:999px;background:var(--border-default);overflow:hidden;margin-bottom:0.6rem;">
                <div style="height:100%;width:${spct}%;background:#22c55e;border-radius:999px;transition:width 0.4s ease;"></div>
              </div>
              ${subFiles.map(f => {
                const p = data[f.id] || {};
                return `
                  <div style="display:flex;align-items:center;gap:0.75rem;padding:0.4rem 0;border-bottom:1px solid var(--border-default);">
                    <span style="flex:1;font-size:0.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
                    <label title="Summary read" style="cursor:pointer;display:flex;align-items:center;gap:0.25rem;font-size:0.75rem;color:var(--text-secondary);">
                      <input type="checkbox" data-doc-id="${escapeHtml(f.id)}" data-field="summary" ${p.summary ? 'checked' : ''} style="cursor:pointer;" />
                      Sum
                    </label>
                    <label title="Flashcards done" style="cursor:pointer;display:flex;align-items:center;gap:0.25rem;font-size:0.75rem;color:var(--text-secondary);">
                      <input type="checkbox" data-doc-id="${escapeHtml(f.id)}" data-field="flashcards" ${p.flashcards ? 'checked' : ''} style="cursor:pointer;" />
                      Cards
                    </label>
                    <label title="Quiz taken" style="cursor:pointer;display:flex;align-items:center;gap:0.25rem;font-size:0.75rem;color:var(--text-secondary);">
                      <input type="checkbox" data-doc-id="${escapeHtml(f.id)}" data-field="quiz" ${p.quiz ? 'checked' : ''} style="cursor:pointer;" />
                      Quiz
                    </label>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }).join('')}
    `;

    // Bind checkboxes
    container.querySelectorAll('input[type="checkbox"][data-doc-id]').forEach(cb => {
      cb.addEventListener('change', () => this._toggle(cb.dataset.docId, cb.dataset.field));
    });

    // Bind collapsible headers
    container.querySelectorAll('.planner-subject__header').forEach(header => {
      header.addEventListener('click', () => {
        const body = header.nextElementSibling;
        const icon = header.querySelector('.planner-toggle-icon');
        if (!body) return;
        const isHidden = body.style.display === 'none';
        body.style.display = isHidden ? '' : 'none';
        if (icon) icon.textContent = isHidden ? '▼' : '▶';
      });
    });
  },
};

/* ============================================================
   SECTION F1 — STUDY SESSION TIMER
   ============================================================ */

const StudyTimerController = {

  _interval:   null,
  _startTime:  null,
  _docId:      null,
  _docName:    null,
  _elapsed:    0,

  start(docId, docName) {
    this.stop();  // stop any previous session
    this._docId   = docId;
    this._docName = docName;
    this._startTime = Date.now();
    this._elapsed   = 0;

    const badge = document.getElementById('studyTimerBadge');
    if (badge) badge.style.display = '';

    this._interval = setInterval(() => {
      this._elapsed = Math.floor((Date.now() - this._startTime) / 1000);
      this._updateBadge();
    }, 1000);
  },

  stop() {
    if (!this._interval) return;
    clearInterval(this._interval);
    this._interval = null;
    if (this._docId && this._elapsed > 5) {
      this._logSession();
    }
    this._elapsed  = 0;
    this._docId    = null;
    this._docName  = null;
    const badge = document.getElementById('studyTimerBadge');
    if (badge) { badge.style.display = 'none'; badge.textContent = '0:00'; }
  },

  /** Discard session — no analytics recorded */
  cancel() {
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
    this._elapsed  = 0;
    this._docId    = null;
    this._docName  = null;
    const badge = document.getElementById('studyTimerBadge');
    if (badge) { badge.style.display = 'none'; badge.textContent = '0:00'; }
    document.getElementById('stopTimerBtn')?.style && (document.getElementById('stopTimerBtn').style.display = 'none');
    document.getElementById('cancelStudyBtn')?.remove();
  },

  _updateBadge() {
    const badge = document.getElementById('studyTimerBadge');
    if (!badge) return;
    const mins = Math.floor(this._elapsed / 60);
    const secs = this._elapsed % 60;
    badge.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
  },

  _logSession() {
    let sessions = [];
    try { sessions = JSON.parse(lsGet(LS.STUDY_SESSIONS) || '[]'); } catch {}
    sessions.unshift({
      docId:    this._docId,
      docName:  this._docName,
      duration: this._elapsed,
      date:     new Date().toISOString(),
    });
    if (sessions.length > 50) sessions = sessions.slice(0, 50);
    lsSet(LS.STUDY_SESSIONS, JSON.stringify(sessions));
    ActivityController.log(`Studied "${this._docName}" for ${Math.floor(this._elapsed / 60)}m ${this._elapsed % 60}s`, 'session');
    DashboardController.refresh();
  },

  getTotalStudySeconds() {
    try {
      const sessions = JSON.parse(lsGet(LS.STUDY_SESSIONS) || '[]');
      return sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
    } catch { return 0; }
  },

  getBySubject() {
    try {
      const sessions = JSON.parse(lsGet(LS.STUDY_SESSIONS) || '[]');
      return sessions.reduce((acc, s) => {
        const f = AppState.uploadedFiles.find(f => f.id === s.docId);
        const subj = f?.subject || 'Untagged';
        acc[subj] = (acc[subj] || 0) + (s.duration || 0);
        return acc;
      }, {});
    } catch { return {}; }
  },
};

/* ============================================================
   SECTION F7 — ACTIVITY FEED CONTROLLER
   ============================================================ */

const ActivityController = {

  _iconMap: {
    upload:  '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 8.5V2M3.5 4.5L6 2l2.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M1.5 9.5v.5a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5v-.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    ai:      '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M4 6.5l1.5 1.5 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    quiz:    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M4 6.5l1.5 1.5 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    delete:  '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 3h8M5 3V2h2v1M5 5.5v3M7 5.5v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><rect x="3" y="3" width="6" height="7.5" rx="1" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>',
    session: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="6" cy="6.5" r="4" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M6 4.5v2l1.25.75" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M4.5 1.5h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    info:    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M6 5.5v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="6" cy="4" r="0.65" fill="currentColor"/></svg>',
  },

  log(message, type = 'info') {
    let log = [];
    try { log = JSON.parse(lsGet(LS.ACTIVITY_LOG) || '[]'); } catch {}
    log.unshift({
      icon:      this._iconMap[type] || this._iconMap.info,
      message,
      type,
      timestamp: new Date().toISOString(),
    });
    if (log.length > 20) log = log.slice(0, 20);
    lsSet(LS.ACTIVITY_LOG, JSON.stringify(log));
    this.render();
  },

  clear() {
    lsSet(LS.ACTIVITY_LOG, '[]');
    this.render();
  },

  render() {
    const feed = document.getElementById('activityFeed');
    if (!feed) return;
    let log = [];
    try { log = JSON.parse(lsGet(LS.ACTIVITY_LOG) || '[]'); } catch {}

    if (!log.length) {
      feed.innerHTML = `<li style="padding:0.75rem 1rem;font-size:0.83rem;color:var(--text-secondary);">No recent activity.</li>`;
      return;
    }

    const relTime = iso => {
      const diff = Date.now() - new Date(iso).getTime();
      const m = Math.floor(diff / 60000);
      const h = Math.floor(diff / 3600000);
      if (m < 1)  return 'just now';
      if (m < 60) return `${m}m ago`;
      return `${h}h ago`;
    };

    feed.innerHTML = log.map(entry => `
      <li style="display:flex;align-items:flex-start;gap:0.6rem;padding:0.5rem 0;border-bottom:1px solid var(--border-default);">
        <span style="font-size:1rem;flex-shrink:0;">${entry.icon}</span>
        <div style="flex:1;min-width:0;">
          <span style="font-size:0.83rem;color:var(--text-primary);display:block;line-height:1.4;">${escapeHtml(entry.message)}</span>
          <span style="font-size:0.73rem;color:var(--text-secondary);">${relTime(entry.timestamp)}</span>
        </div>
      </li>
    `).join('');
  },
};

/* ============================================================
   SECTION E — THEME SYSTEM
   ============================================================ */

const ThemeController = {

  /** Apply a theme by setting data-theme on <body> */
  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    AppState.theme = theme;
    lsSet(LS.THEME, theme);
    this._updateToggleLabel(theme);
  },

  /** Toggle between light and dark */
  toggle() {
    const next = AppState.theme === 'light' ? 'dark' : 'light';
    this.apply(next);
  },

  /** Restore theme from localStorage on page load */
  restore() {
    this.apply(AppState.theme);
  },

  _updateToggleLabel(theme) {
    const icon  = document.querySelector('#themeToggle .theme-icon');
    const label = document.querySelector('#themeToggle .theme-label');
    if (icon)  icon.innerHTML = theme === 'dark'
      ? '<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="7.5" cy="7.5" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M7.5 1v1.5M7.5 12.5V14M1 7.5h1.5M12.5 7.5H14M3.1 3.1l1.06 1.06M10.84 10.84l1.06 1.06M3.1 11.9l1.06-1.06M10.84 4.16l1.06-1.06" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
      : '<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.5 9.5A6 6 0 0 1 5.5 2.5a6 6 0 1 0 7 7z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>';
    if (label) label.textContent = theme === 'dark' ? 'Light' : 'Theme';
  },

  bindEvents() {
    document.getElementById('themeToggle')?.addEventListener('click', () => this.toggle());
  },
};

/* ============================================================
   SECTION F — ROLE SELECTION SYSTEM
   ============================================================ */

   /* ============================================================
   SECTION F0 — ACCESS CONTROL FILTER
   ============================================================ */

const AccessController = {

  /**
   * Filter documents by role, ownership, and visibility.
   * @param {Array}  docs
   * @param {string} role       'Student' | 'Faculty' | 'Admin'
   * @param {string} sessionId
   * @returns {Array}
   */
  filterDocuments(docs, role, sessionId) {
    if (!docs || !docs.length) return [];
    const r = (role || 'Student').toLowerCase();

    if (r === 'admin') return docs;

    if (r === 'faculty') {
      return docs.filter(doc => {
        const vis       = doc.visibility  || '';
        const uploaderR = (doc.uploaderRole || doc.uploader_role || '').toLowerCase();
        const uploaderI = doc.uploaderId   || doc.uploader_id   || '';
        if (uploaderI === sessionId && sessionId) return true;
        if (vis === 'public_academic') return true;
        if (uploaderR === 'faculty' && vis !== 'private_faculty') return true;
        return false;
      });
    }

    // Student — public_academic faculty docs filtered by student's year/semester
    return docs.filter(doc => {
      const vis       = doc.visibility  || '';
      const uploaderR = (doc.uploaderRole || doc.uploader_role || '').toLowerCase();
      const uploaderI = doc.uploaderId   || doc.uploader_id   || '';
      if (vis === 'private_faculty' || vis === 'private_admin') return false;
      if (uploaderR === 'student' && uploaderI !== sessionId)   return false;
      // Own uploads always visible regardless of year/sem tagging
      if (uploaderI === sessionId && sessionId) return true;
      // Faculty public_academic: enforce year/semester gating
      if (vis === 'public_academic' && uploaderR === 'faculty') return StudentProfileController.isDocAccessible(doc);
      if (vis === 'public_academic') return StudentProfileController.isDocAccessible(doc);
      return false;
    });
  },
};

const RoleController = {

apply(role) {
    const normalised = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
    AppState.role = normalised;
    lsSet(LS.ROLE, normalised);
    this._updateIndicator(normalised);
    this._updateRoleCardStates(role.toLowerCase());
    StudentProfileController.applyRoleVisibility(normalised);
    this._updateNavVisibility(normalised);
  },

  restore() {
    this.apply(AppState.role);
  },

  _updateIndicator(role) {
    const el = document.getElementById('activeRole');
    if (el) el.textContent = role;
  },

  _updateRoleCardStates(roleKey) {
    document.querySelectorAll('.role-card').forEach(card => {
      const isActive = card.dataset.role === roleKey;
      card.classList.toggle('role-card--selected', isActive);
      card.setAttribute('aria-pressed', String(isActive));
    });
  },

  _updateNavVisibility(role) {
    const nav = document.getElementById('mainNav');
    if (nav) nav.style.display = role ? '' : 'none';

    const adminBtn = document.querySelector('.nav-item--admin-only');
    if (adminBtn) adminBtn.style.display = (role === 'Admin') ? '' : 'none';

    const visField = document.getElementById('visibilityField');
    if (visField) visField.style.display = (role === 'Faculty' || role === 'Admin') ? '' : 'none';

    const visEl = document.getElementById('uploadVisibility');
      if (visEl && role === 'Admin') {
        visEl.innerHTML = '<option value="private_admin">Private Admin Material (admin only)</option>';
      } else if (visEl && role === 'Faculty') {
        visEl.innerHTML = `
        <option value="public_academic">Public Academic Material (visible to all students &amp; faculty)</option>
        <option value="private_faculty">Private Faculty Material (visible to uploader &amp; admin only)</option>`;

        // Show/hide year+semester fields based on visibility selection
        const _syncFacultyYearSem = () => {
          const isPublic = visEl.value === 'public_academic';
          const ylf = document.getElementById('yearLevelField');
          const smf = document.getElementById('semesterField');
          if (ylf) ylf.style.display = isPublic ? '' : 'none';
          if (smf) smf.style.display = isPublic ? '' : 'none';
        };
        _syncFacultyYearSem();
        // Remove previous listener if re-applying role
        const freshVis = visEl.cloneNode(true);
        visEl.replaceWith(freshVis);
        freshVis.addEventListener('change', _syncFacultyYearSem);
        // Re-attach so the cloned element also syncs on first paint
        freshVis.dispatchEvent(new Event('change'));
      }
  },

  bindEvents() {
    // Role card clicks (the whole card or the button inside)
    document.querySelectorAll('.role-card').forEach(card => {
      const btn = card.querySelector('button');

      const select = () => {
        const selectedRole = card.dataset.role;
        this.apply(selectedRole);

        if (selectedRole === 'student') {
          const savedYear = lsGet(LS.STUDENT_YEAR);
          const savedSem  = lsGet(LS.STUDENT_SEM);
          if (savedYear && savedSem) {
            PanelController.show('dashboard');
            showToast(`Welcome back, Student (${savedYear}Y / ${savedSem}S)`, 'success');
          } else {
            PanelController.show('student-setup');
            showToast('Please complete your academic profile to continue.', 'info');
          }
        } else {
          PanelController.show('dashboard');
          showToast(`Logged in as ${AppState.role}`, 'success');
        }
      };

      card.addEventListener('click', select);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); }
      });
      btn?.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        select();
      });
    });
  },
};

/* ============================================================
   SECTION G — PANEL / NAVIGATION SYSTEM
   ============================================================ */

const PanelController = {

  /** All panel IDs mapped to their section elements */
  _panels: null,

  _getPanel(id) {
    return document.getElementById(`panel-${id}`);
  },

  /** Show a named panel, hiding all others */
  show(panelId) {

    // Block navigation away from viewer while AI is processing
    if (AppState.isProcessing && AppState.currentPanel === 'viewer' && panelId !== 'viewer') {
      return;
    }

    const target = this._getPanel(panelId);

    // Prevent blank screen if panel doesn't exist
    if (!target) {
      console.error(`Panel not found: panel-${panelId}`);
      showToast(`Panel "${panelId}" does not exist.`, 'error');
      return;
    }

    const all = document.querySelectorAll('.panel');

    all.forEach(p => {
      p.classList.remove('panel--active');
      p.setAttribute('aria-hidden', 'true');
      p.style.display = 'none';
    });

    target.classList.add('panel--active');
    target.removeAttribute('aria-hidden');
    target.style.display = ''; 

    AppState.currentPanel = panelId;
    lsSet(LS.PANEL, panelId);

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });

    this._updateNavActiveState(panelId);

    if (panelId === 'dashboard') DashboardController.refresh();
    if (panelId === 'admin')     AdminController.refresh();
    if (panelId !== 'viewer')    StudyTimerController.cancel();
  },

  _updateNavActiveState(panelId) {
    document.querySelectorAll('.nav-item[data-panel]').forEach(btn => {
      let btnPanel = btn.dataset.panel;
      if (btnPanel.startsWith('panel-')) btnPanel = btnPanel.slice('panel-'.length);
      const isActive = btnPanel === panelId;
      btn.classList.toggle('active', isActive);
      if (isActive) btn.setAttribute('aria-current', 'page');
      else          btn.removeAttribute('aria-current');
    });
  },

  bindEvents() {
    // All elements with data-panel attribute navigate to that panel
    document.addEventListener('click', e => {
      const trigger = e.target.closest('[data-panel]');
      if (!trigger) return;

      // Block ALL panel navigation while AI is processing
      if (AppState.isProcessing) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Never navigate away from viewer via data-panel if currently in viewer during processing
      const panelBtnIds = ['reprocessBtn', 'uploadBtn', 'exportAiPDF', 'copyAiOutput'];
      if (panelBtnIds.some(id => e.target.closest(`#${id}`))) {
        return;
      }

      e.preventDefault();
      let panelId = trigger.dataset.panel;
      if (panelId.startsWith('panel-')) panelId = panelId.slice('panel-'.length);
      if (panelId) this.show(panelId);
    });

    // Footer anchor links (#panel-xxx)
    document.querySelectorAll('a[href^="#panel-"]').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        const id = a.getAttribute('href').replace('#panel-', '');
        this.show(id);
      });
    });
  },

  /** Restore the last active panel on load; fall back to hero if no role set */
  init() {
    document.querySelectorAll('.panel').forEach(p => {
      p.style.display = 'none';
      p.setAttribute('aria-hidden', 'true');
    });

    const saved = AppState.currentPanel || 'hero';
    const role  = AppState.role || '';

    if (!role) {
      this.show('hero');
      return;
    }

    if (saved === 'admin' && role !== 'Admin') {
      this.show('dashboard');
      return;
    }

    const target = document.getElementById(`panel-${saved}`);
    this.show(target ? saved : 'hero');
  },
};

/* ============================================================
   SECTION H — UPLOAD INTERFACE
   ============================================================ */

const UploadController = {

  _file: null,

  bindEvents() {
    const dropzone  = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');
    const clearBtn  = document.querySelector('.upload-actions .btn--ghost');
    const aiModeRadios = document.querySelectorAll('input[name="aiMode"]');

    // Drag-and-drop events
    if (dropzone) {
      ['dragenter', 'dragover'].forEach(evt =>
        dropzone.addEventListener(evt, e => {
          e.preventDefault();
          dropzone.classList.add('dropzone--active');
        })
      );
      ['dragleave', 'dragend'].forEach(evt =>
        dropzone.addEventListener(evt, () => dropzone.classList.remove('dropzone--active'))
      );
      dropzone.addEventListener('drop', e => {
        e.preventDefault();
        dropzone.classList.remove('dropzone--active');
        const files = e.dataTransfer?.files;
        if (files?.length) this._handleFileSelection(files[0]);
      });
    }

    // File input change
    fileInput?.addEventListener('change', e => {
      if (e.target.files?.length) this._handleFileSelection(e.target.files[0]);
    });

    // AI mode changes — update preview badge
    aiModeRadios.forEach(r => r.addEventListener('change', () => this._updateAiModePreview()));

    // Upload button
    uploadBtn?.addEventListener('click', () => this._handleUpload());

    // Clear button
    clearBtn?.addEventListener('click', () => this._clearUpload());
  },

  _handleFileSelection(file) {
    const error = validateFile(file);
    if (error) {
      showToast(error, 'error');
      return;
    }
    this._file = file;
    AppState.selectedFile = file;
    this._renderPreview(file);
  },

  _renderPreview(file) {
    const emptyState = document.querySelector('.file-preview-card__empty');
    const details    = document.getElementById('filePreviewDetails');
    const thumb      = document.getElementById('fileThumb');
    const nameEl     = document.getElementById('prevFileName');
    const typeEl     = document.getElementById('prevFileType');
    const sizeEl     = document.getElementById('prevFileSize');

    if (emptyState) emptyState.style.display = 'none';
    if (details)    details.classList.remove('hidden');

    if (nameEl) nameEl.textContent = file.name;
    if (typeEl) typeEl.textContent = getFileLabel(file);
    if (sizeEl) sizeEl.textContent = formatBytes(file.size);

    if (thumb) {
      const svgIcons = {
        PDF:  '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="2" width="20" height="24" rx="2.5" stroke="currentColor" stroke-width="1.75" fill="none"/><path d="M8 9h12M8 13h9M8 17h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/></svg>',
        DOCX: '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="2" width="20" height="24" rx="2.5" stroke="currentColor" stroke-width="1.75" fill="none"/><path d="M8 9h12M8 13h9M8 17h10M8 21h7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/></svg>',
        PPTX: '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="5" width="22" height="16" rx="2.5" stroke="currentColor" stroke-width="1.75" fill="none"/><path d="M7 10h6M7 14h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/><path d="M14 21v3M10 24h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
        TXT:  '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="2" width="20" height="24" rx="2.5" stroke="currentColor" stroke-width="1.75" fill="none"/><path d="M8 9h12M8 13h12M8 17h12M8 21h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/></svg>',
      };
      const label   = getFileLabel(file);
      thumb.innerHTML = svgIcons[label] || '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="2" width="20" height="24" rx="2.5" stroke="currentColor" stroke-width="1.75" fill="none"/></svg>';
      thumb.style.fontSize = '2.5rem';
    }

    this._updateAiModePreview();
    this._setProgressLabel('File selected — ready to upload.');
  },

  _updateAiModePreview() {
    const checked = document.querySelector('input[name="aiMode"]:checked');
    const el      = document.getElementById('prevAiMode');
    if (el && checked) {
      const labelMap = { 'simple': 'Simple', 'exam-focused': 'Exam-Focused', 'detailed': 'Detailed' };
      el.textContent = labelMap[checked.value] || checked.value;
    }
  },

  _setProgressLabel(text) {
    const label = document.getElementById('uploadProgressLabel');
    if (label) label.textContent = text;
  },

  _setProgressBar(pct) {
    const fill = document.getElementById('uploadProgressFill');
    const bar  = fill?.closest('[role="progressbar"]');
    if (fill) fill.style.width = `${pct}%`;
    if (bar)  bar.setAttribute('aria-valuenow', String(pct));
  },

  async _handleUpload() {
    if (!this._file) {
      showToast('Please select a file before uploading.', 'warning');
      return;
    }
    if (AppState.isProcessing) return;

    const subject = document.getElementById('subjectTag')?.value.trim() || 'Untagged';
    const role    = AppState.role || 'Student';

    // Students: always use their profile year/semester — never let them override
    let yearLevel, semester;
    if (role === 'Student') {
      yearLevel = lsGet(LS.STUDENT_YEAR) || '';
      semester  = lsGet(LS.STUDENT_SEM)  || '';
    } else {
      yearLevel = document.getElementById('yearLevel')?.value || '';
      semester  = document.getElementById('semester')?.value  || '';
    }
    const desc      = document.getElementById('docDescription')?.value.trim() || '';
    const aiMode    = document.querySelector('input[name="aiMode"]:checked')?.value || 'simple';

    AppState.isProcessing = true;
    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.textContent = 'Uploading…'; }

    this._setProgressLabel('Uploading to server…');
    this._setProgressBar(20);

    try {
      const formData = new FormData();
      formData.append('file',     this._file);
      formData.append('subject',  subject);
      formData.append('year',     yearLevel);
      formData.append('semester', semester);
      formData.append('desc',     desc);
      formData.append('aiMode',   aiMode);

      const courseCode = document.getElementById('courseCode')?.value.trim()         || '';
      const competency = document.getElementById('learningCompetency')?.value.trim() || '';
      const sessionId  = AppState.sessionId || lsGet(LS.SESSION_ID) || 'unknown';

      let visibility = 'private_student';
      if (role === 'Faculty') {
        visibility = document.getElementById('uploadVisibility')?.value || 'public_academic';
      } else if (role === 'Admin') {
        visibility = 'private_admin';
      }

      formData.append('course_code',    courseCode);
      formData.append('competency',     competency);
      formData.append('uploader_role',  role.toLowerCase());
      formData.append('uploader_id',    sessionId);
      formData.append('visibility',     visibility);

      this._setProgressBar(50);
      const result = await ApiService.uploadDocument(formData);

      const fileId = result.fileId;

      const entry = {
        id:           fileId,
        name:         this._file.name,
        type:         getFileLabel(this._file),
        size:         formatBytes(this._file.size),
        subject,
        yearLevel,
        semester,
        aiMode,
        courseCode,
        competency,
        uploadedAt:   new Date().toISOString(),
        aiStatus:     'pending',
        uploaderRole: (AppState.role || 'Student').toLowerCase(),
        uploaderId:   AppState.sessionId || lsGet(LS.SESSION_ID) || 'unknown',
        visibility:   (() => {
          const r = AppState.role || 'Student';
          if (r === 'Faculty') return document.getElementById('uploadVisibility')?.value || 'public_academic';
          if (r === 'Admin')   return 'private_admin';
          return 'private_student';
        })(),
      };
      AppState.uploadedFiles.unshift(entry);
      AppState.saveUploads();

      this._setProgressBar(80);
      this._setProgressLabel('Refreshing document list…');

      await ViewerController.refreshDocumentList();

      this._setProgressBar(100);
      this._setProgressLabel('Upload complete! Starting AI processing…');

      const uploadedFileName = this._file.name;
      this._clearUpload();

      // Route to viewer and auto-select the new doc BEFORE AI processing
      PanelController.show('viewer');
      const sel = document.getElementById('viewerDocSelect');
      if (sel) {
        sel.value = fileId;
        // Trigger load to show doc metadata while AI runs
        await ViewerController._loadDocument(fileId);
      }

      showToast('File uploaded! AI is now processing…', 'success');
      ActivityController.log(`Uploaded "${uploadedFileName}"`, 'upload');

      // Release upload-button lock before long AI call
      AppState.isProcessing = false;
      if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:inline-block;vertical-align:-2px;margin-right:0.35rem;"><path d="M7.5 10V2M4 5l3.5-3.5L11 5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 11.5v1a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5v-1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Upload &amp; Process with AI'; }

      // Auto-trigger full AI pipeline immediately
      await ViewerController._triggerAiProcess(fileId);

    } catch (err) {
      console.error('[Upload Error]', err);
      showToast('Upload failed. Please try again.', 'error');
      this._setProgressLabel('Upload failed.');
      this._setProgressBar(0);
      AppState.isProcessing = false;
      if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:inline-block;vertical-align:-2px;margin-right:0.35rem;"><path d="M7.5 10V2M4 5l3.5-3.5L11 5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 11.5v1a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5v-1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Upload &amp; Process with AI'; }
    }
  },

  _clearUpload() {
    this._file = null;
    AppState.selectedFile = null;

    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';

    const emptyState = document.querySelector('.file-preview-card__empty');
    const details    = document.getElementById('filePreviewDetails');
    if (emptyState) emptyState.style.display = '';
    if (details)    details.classList.add('hidden');

    this._setProgressBar(0);
    this._setProgressLabel('Ready to upload');

    // Reset form fields
    ['subjectTag', 'docDescription'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    ['yearLevel', 'semester'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.selectedIndex = 0;
    });
    const simpleRadio = document.getElementById('modeSimple');
    if (simpleRadio) simpleRadio.checked = true;
  },
};

/* ============================================================
   SECTION I — DOCUMENT VIEWER & AI TAB SYSTEM
   ============================================================ */

const ViewerController = {


async refreshDocumentList() {
    const select    = document.getElementById('viewerDocSelect');
    if (!select) return;
    const role      = AppState.role || 'Student';
    const sessionId = AppState.sessionId || lsGet(LS.SESSION_ID) || '';

    try {
      const url = new URL(API.DOCUMENTS);
      url.searchParams.set('role',        role.toLowerCase());
      url.searchParams.set('uploader_id', sessionId);

      const response = await fetch(url.toString());
      if (!response.ok) throw new Error(`Failed to fetch documents: ${response.status}`);
      const json = await response.json();
      let docs = json.data?.documents || [];

      docs = AccessController.filterDocuments(docs, role, sessionId);

      select.innerHTML = `<option value="">— Select a Document —</option>`;
      docs.forEach(doc => {
        const opt = document.createElement('option');
        opt.value = doc.id;
        const courseTag = doc.course_code ? ` · ${doc.course_code}` : '';
        opt.textContent = `${doc.filename} [${doc.subject || 'Untagged'}${courseTag}]`;
        select.appendChild(opt);
      });
    } catch {
      select.innerHTML = `<option value="">— Select a Document —</option>`;
      const local = AccessController.filterDocuments(AppState.uploadedFiles, role, sessionId);
      local.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        const courseTag = f.courseCode ? ` · ${f.courseCode}` : '';
        opt.textContent = `${f.name} [${f.subject || 'Untagged'}${courseTag}]`;
        select.appendChild(opt);
      });
    }
  },

  bindEvents() {
    // Tab switching
    document.querySelectorAll('.viewer-tab').forEach(tab => {
      tab.addEventListener('click', () => this._switchTab(tab.dataset.tab));
    });

    // Document selector dropdown
    document.getElementById('viewerDocSelect')?.addEventListener('change', e => {
      this._loadDocument(e.target.value);
    });

    // Print study sheet button
    document.getElementById('printStudySheetBtn')?.addEventListener('click', () => {
      const sel = document.getElementById('viewerDocSelect');
      if (!sel?.value) { showToast('Please select a document first.', 'warning'); return; }
      this._buildPrintSheet(sel.value);
    });

    // Stop timer button
    document.getElementById('stopTimerBtn')?.addEventListener('click', () => {
      StudyTimerController.stop();
      document.getElementById('stopTimerBtn').style.display = 'none';
    });

    // Show stop button when timer badge appears
    const timerBadge = document.getElementById('studyTimerBadge');
    if (timerBadge) {
      const observer = new MutationObserver(() => {
        const stopBtn = document.getElementById('stopTimerBtn');
        if (stopBtn) stopBtn.style.display = timerBadge.style.display === 'none' ? 'none' : '';
      });
      observer.observe(timerBadge, { attributes: true, attributeFilter: ['style'] });
    }

    // Re-process button
    document.getElementById('reprocessBtn')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sel = document.getElementById('viewerDocSelect');
      if (!sel?.value) { showToast('Please select a document first.', 'warning'); return; }
      if (AppState.isProcessing) { showToast('Already processing. Please wait.', 'warning'); return; }
      await this._triggerAiProcess(sel.value);
    });

    // AI Output panel — collapsible cards
    document.querySelectorAll('.ai-output-card__toggle').forEach(btn => {
      btn.addEventListener('click', () => this._toggleOutputCard(btn));
    });

    // Export / copy buttons
    document.getElementById('exportAiPDF')?.addEventListener('click', () => this._exportToPDF());
    document.getElementById('copyAiOutput')?.addEventListener('click', () => this._copyOutput());

    // Viewer copy text button
    document.querySelector('.viewer-pane--source .btn--icon')?.addEventListener('click', () => {
      const body = document.getElementById('sourceDocBody');
      if (body) {
        navigator.clipboard?.writeText(body.innerText)
          .then(() => showToast('Text copied to clipboard.', 'success'))
          .catch(()  => showToast('Copy failed — please select text manually.', 'warning'));
      }

      
    });
    
  },

  _switchTab(tabId) {
    AppState.currentTab = tabId;

    // Update tab buttons
    document.querySelectorAll('.viewer-tab').forEach(t => {
      const isActive = t.dataset.tab === tabId;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', String(isActive));
    });

    // Show/hide panels
    document.querySelectorAll('.tab-panel').forEach(p => {
      const isTarget = p.id === `tab-${tabId}`;
      p.classList.toggle('tab-panel--active', isTarget);
      if (isTarget) p.removeAttribute('hidden');
      else          p.setAttribute('hidden', '');
    });
  },

  async _loadDocument(docId) {
    if (!docId) return;

    // Stop any active timer for previous doc (no analytics — user changed doc, not stopped)
    StudyTimerController.cancel();

    const body = document.getElementById('sourceDocBody');
    if (!body) return;

    // Clear stale AI output
    const summaryPlaceholder = document.getElementById('summaryPlaceholder');
    const summaryOutput      = document.getElementById('summaryOutput');
    if (summaryPlaceholder) summaryPlaceholder.style.display = '';
    if (summaryOutput)      { summaryOutput.classList.add('hidden'); summaryOutput.innerHTML = ''; }
    const flashcardDeck  = document.getElementById('flashcardDeck');
    if (flashcardDeck)   flashcardDeck.innerHTML = '';
    const quizContainer  = document.getElementById('quizContainer');
    if (quizContainer)   quizContainer.innerHTML = '';
    const glossaryOutput = document.getElementById('glossaryOutput');
    if (glossaryOutput)  glossaryOutput.innerHTML = '';
    const quizFinal = document.getElementById('quizFinalResult');
    if (quizFinal) { quizFinal.style.display = 'none'; quizFinal.textContent = ''; }
    const confPanel = document.getElementById('confidenceRatingPanel');
    if (confPanel) confPanel.style.display = 'none';
    const diffBadge = document.getElementById('difficultyBadge');
    if (diffBadge) diffBadge.style.display = 'none';
    const quizHistoryBar = document.getElementById('quizHistoryBar');
    if (quizHistoryBar) quizHistoryBar.style.display = 'none';

    body.innerHTML = `<div style="padding:1rem;color:var(--text-secondary);"><p>Loading document…</p></div>`;

    // Remove any existing study prompt in the AI pane
    document.getElementById('studyTimerPrompt')?.remove();

    try {
      const response = await fetch(`${API.DOCUMENTS}/${encodeURIComponent(docId)}`);
      if (!response.ok) throw new Error(`Failed to load document: ${response.status}`);
      const json = await response.json();
      const doc  = json.data || {};

      const metaLines = [
        `File: ${doc.filename || docId}`,
        `Subject: ${doc.subject || 'Untagged'}`,
        `Year Level: ${doc.year_level || '—'}`,
        `Semester: ${doc.semester || '—'}`,
        `AI Mode: ${doc.ai_mode || '—'}`,
        `Status: ${doc.ai_status || 'unknown'}`,
        `Uploaded: ${doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleString() : '—'}`,
      ].join('\n');
      body.innerHTML = `<div style="padding:1rem;line-height:1.8;white-space:pre-wrap;color:var(--text-primary);font-size:0.9rem;">${escapeHtml(metaLines)}</div>`;

      // Sync aiStatus
      const localEntry = AppState.uploadedFiles.find(f => f.id === docId);
      if (localEntry && doc.ai_status && localEntry.aiStatus !== doc.ai_status) {
        localEntry.aiStatus = doc.ai_status;
        AppState.saveUploads();
      }

      const aiStatus = doc.ai_status || 'pending';

      // If AI is still running, show processing message and block study UI
      if (aiStatus === 'pending' || aiStatus === 'processing') {
        this._showAiProcessingState(doc.filename || docId);
        return;
      }

      // AI complete — render difficulty badge
      if (doc.difficulty) {
        this._renderDifficultyBadge(docId, doc.difficulty, doc.difficultyRationale || doc.difficulty_rationale);
      }

      // Show "Start Study Timer?" prompt before revealing AI outputs
      this._showStudyTimerPrompt(docId, doc);

    } catch (err) {
      console.error('[Load Document Error]', err);
      body.innerHTML = `<div style="padding:1rem;color:var(--clr-danger-500);">Failed to load document. Is the backend running?</div>`;
    }
  },

  _showAiProcessingState(docName) {
    // Clear AI pane; show processing message
    const summaryPlaceholder = document.getElementById('summaryPlaceholder');
    const summaryOutput      = document.getElementById('summaryOutput');
    if (summaryPlaceholder) summaryPlaceholder.style.display = 'none';
    if (summaryOutput) { summaryOutput.classList.remove('hidden'); summaryOutput.innerHTML =
      `<div style="padding:1.5rem;text-align:center;color:var(--text-secondary);">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-bottom:0.75rem;opacity:0.5;"><circle cx="14" cy="14" r="11" stroke="currentColor" stroke-width="2" fill="none"/><path d="M14 8v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <p style="margin:0;font-size:0.9rem;">AI is processing the uploaded file.</p>
        <p style="margin:0.4rem 0 0;font-size:0.8rem;opacity:0.7;">Summary, flashcards, quiz, and glossary will appear when ready.</p>
      </div>`; }
  },

  _showStudyTimerPrompt(docId, doc) {
    const aiPane = document.querySelector('.viewer-pane--ai .viewer-pane__body');
    if (!aiPane) return;

    // Build prompt overlay at top of AI pane
    const existing = document.getElementById('studyTimerPrompt');
    if (existing) existing.remove();

    const prompt = document.createElement('div');
    prompt.id = 'studyTimerPrompt';
    prompt.style.cssText = 'position:absolute;inset:0;z-index:10;background:var(--bg-surface);padding:0 1.5rem 4rem;display:flex;align-items:center;justify-content:center;';
    prompt.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;gap:1.25rem;text-align:center;">
        <div>
          <p style="margin:0;font-weight:700;font-size:1rem;">Start Study Timer?</p>
          <p style="margin:0.35rem 0 0;font-size:0.85rem;color:var(--text-secondary);">Timer tracks your study session analytics.</p>
        </div>
        <div style="display:flex;gap:0.75rem;">
          <button id="studyTimerStartBtn" class="btn btn--sm" type="button">Yes</button>
          <button id="studyTimerCancelBtn" class="btn btn--sm" type="button">No</button>
        </div>
      </div>`;
    aiPane.prepend(prompt);
    aiPane.style.position = 'relative';

    const startBtn  = document.getElementById('studyTimerStartBtn');
    const cancelBtn = document.getElementById('studyTimerCancelBtn');

    startBtn?.addEventListener('click', () => {
      prompt.remove();
      StudyTimerController.start(docId, doc.filename || docId);
      this._showStudyControls(docId, doc);
      // Now reveal AI outputs
      this._renderAiOutputs(doc);
    });

    cancelBtn?.addEventListener('click', () => {
      prompt.remove();
      // Still show AI outputs, just no timer
      this._renderAiOutputs(doc);
    });
  },

  _showStudyControls(docId, doc) {
    const badge   = document.getElementById('studyTimerBadge');
    const stopBtn = document.getElementById('stopTimerBtn');
    if (badge)   badge.style.display = '';

    // Replace stop button with Stop Timer + Cancel Study
    const timerArea = stopBtn?.parentElement;
    if (timerArea) {
      stopBtn.style.display = '';
      // Add Cancel Study button if not already present
      if (!document.getElementById('cancelStudyBtn')) {
        const cancelStudy = document.createElement('button');
        cancelStudy.id        = 'cancelStudyBtn';
        cancelStudy.type      = 'button';
        cancelStudy.className = 'btn btn--ghost btn--sm';
        cancelStudy.style.fontSize = '0.75rem';
        cancelStudy.textContent = '✕ Cancel Study';
        timerArea.appendChild(cancelStudy);
        cancelStudy.addEventListener('click', () => {
          StudyTimerController.cancel();
          cancelStudy.remove();
          if (stopBtn) stopBtn.style.display = 'none';
          if (badge)   badge.style.display   = 'none';
        });
      }
    }

    // Stop Timer logs analytics
    const freshStop = stopBtn?.cloneNode(true);
    if (freshStop && stopBtn) {
      stopBtn.replaceWith(freshStop);
      freshStop.addEventListener('click', () => {
        StudyTimerController.stop();
        freshStop.style.display = 'none';
        if (badge) badge.style.display = 'none';
        document.getElementById('cancelStudyBtn')?.remove();
      });
    }
  },

  _renderAiOutputs(doc) {
    if (doc.aiOutput?.summary)            this._renderSummary(doc.aiOutput.summary);
    if (doc.aiOutput?.flashcards?.length) this._renderFlashcards(doc.aiOutput.flashcards);
    if (doc.aiOutput?.quiz?.length)       this._renderQuiz(doc.aiOutput.quiz);
    if (doc.aiOutput?.glossary?.length)   this._renderGlossary(doc.aiOutput.glossary);
    if (doc.id) this._loadQuizHistory(doc.id);
  },

async _triggerAiProcess(docId) {
    const btn = document.getElementById('reprocessBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }

    const summaryPlaceholder = document.getElementById('summaryPlaceholder');
    const summaryOutput      = document.getElementById('summaryOutput');
    if (summaryPlaceholder) summaryPlaceholder.style.display = '';
    if (summaryOutput)      summaryOutput.classList.add('hidden');

    this._switchTab('summary');

    // Ensure viewer panel stays visible during processing
    if (AppState.currentPanel !== 'viewer') {
      PanelController.show('viewer');
      const sel = document.getElementById('viewerDocSelect');
      if (sel && !sel.value) sel.value = docId;
    }

    AppState.isProcessing = true;

    try {
      // Prefer the document's stored ai_mode from backend cache; fall back to upload form or 'simple'
      const cachedEntry = AppState.uploadedFiles.find(f => f.id === docId);
      const aiMode = cachedEntry?.aiMode
        || document.querySelector('input[name="aiMode"]:checked')?.value
        || 'simple';

      const result = await ApiService.summarizeDocument(docId, aiMode);

      // Cache result and show study timer prompt for the completed doc
      AppState.aiOutputCache[docId] = result;

      // Show study timer prompt now that AI is done; clear processing message first
      const sel = document.getElementById('viewerDocSelect');
      if (sel && sel.value === docId) {
        // Re-load doc to trigger proper study timer prompt with fresh AI data
        await this._loadDocument(docId);
      } else {
        // Doc not currently selected — just render outputs silently
        if (result.summary)            this._renderSummary(result.summary);
        if (result.flashcards?.length) this._renderFlashcards(result.flashcards);
        if (result.quiz?.length)       this._renderQuiz(result.quiz);
        if (result.glossary?.length)   this._renderGlossary(result.glossary);
      }
      // Cache difficulty on the local file entry
      const diffEntry = AppState.uploadedFiles.find(f => f.id === docId);
      if (diffEntry && result.difficulty) {
        diffEntry.difficulty          = result.difficulty;
        diffEntry.difficultyRationale = result.difficultyRationale || '';
        AppState.saveUploads();
      }
      this._renderDifficultyBadge(docId, result.difficulty, result.difficultyRationale);

      // Update real AI stats
      AppState.aiStats.summaries++;
      if (result.flashcards?.length) AppState.aiStats.flashcards += result.flashcards.length;
      AppState.saveAiStats();

      // Update aiStatus on the corresponding upload entry — 'summarized' matches backend value
      const entry = AppState.uploadedFiles.find(f => f.id === docId);
      if (entry) { entry.aiStatus = 'summarized'; AppState.saveUploads(); }

      showToast('AI processing complete!', 'success');
      ActivityController.log(`AI processing complete for "${AppState.uploadedFiles.find(f=>f.id===docId)?.name || docId}"`, 'ai');
      DashboardController.refresh();

    } catch (err) {
      console.error('[AI Process Error]', err);
      const msg = err?.message || 'Unknown error';
      showToast(`AI processing failed: ${msg}`, 'error');
    } finally {
      AppState.isProcessing = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Re-process with AI'; }
    }
  },

  _renderSummary(text) {
    const placeholder = document.getElementById('summaryPlaceholder');
    const output      = document.getElementById('summaryOutput');
    if (!output) return;
    if (placeholder) placeholder.style.display = 'none';
    output.classList.remove('hidden');

    // Convert markdown headings and bullet points to styled HTML
    const html = text
      .replace(/^## (.+)$/gm, '<h3 style="margin:1.2rem 0 0.4rem;font-size:1rem;font-weight:700;color:var(--clr-primary-500,#1a5ef9);">$1</h3>')
      .replace(/^- \*\*(.+?)\*\*:/gm, '<li style="margin-bottom:0.4rem;margin-left:0.25rem;"><strong>$1:</strong>')
      .replace(/^- (.+)$/gm, '<li style="margin-bottom:0.4rem;margin-left:0.25rem;">$1</li>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n{2,}/g, '</p><p style="margin:0.5rem 0;">')
      .replace(/\n/g, '<br>');

    output.innerHTML = `<div class="summary-text" style="line-height:1.8;font-size:0.92rem;padding:0.5rem 0.25rem;"><p style="margin:0;">${html}</p></div>`;
  },

_renderFlashcards(cards) {
    const deck = document.getElementById('flashcardDeck');
    if (!deck) return;
    if (!cards?.length) {
      deck.innerHTML = `<div class="viewer-placeholder"><span><svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="8" width="26" height="16" rx="2.5" stroke="currentColor" stroke-width="1.75" fill="none"/><path d="M8 15h16M8 19h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/></svg></span><p>No flashcards generated.</p></div>`;
      return;
    }

    const limited = cards.slice(0, 5);

    deck.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:0.75rem;">
        ${limited.map((c, i) => `
          <div class="flashcard-item" data-index="${i}" data-flipped="false"
               style="border:1.5px solid var(--border-default);border-radius:0.75rem;overflow:hidden;cursor:pointer;user-select:none;transition:box-shadow 0.15s;"
               tabindex="0" role="button" aria-label="Flashcard ${i + 1}, click to flip">
            <div class="fc-front" style="padding:1rem 1.25rem;background:var(--bg-surface-2);">
              <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
                <span style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;padding:0.2rem 0.55rem;border-radius:999px;background:#1a5ef922;color:#1a5ef9;">Card ${i + 1} of ${limited.length}</span>
                <span style="font-size:0.68rem;color:var(--text-secondary);">Click to reveal answer ▼</span>
              </div>
              <p style="margin:0;font-weight:600;font-size:0.95rem;line-height:1.55;color:var(--text-primary);">${escapeHtml(c.front || c.question || '')}</p>
            </div>
            <div class="fc-back" style="display:none;padding:1rem 1.25rem;background:#0d9e5515;border-top:1.5px solid #0d9e5530;">
              <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
                <span style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;padding:0.2rem 0.55rem;border-radius:999px;background:#22c55e22;color:#22c55e;">Answer ▲</span>
              </div>
              <p style="margin:0;font-size:0.93rem;line-height:1.6;color:var(--text-primary);">${escapeHtml(c.back || c.answer || '')}</p>
            </div>
          </div>
        `).join('')}
      </div>`;

    deck.querySelectorAll('.flashcard-item').forEach(card => {
      const flip = () => {
          const flipped = card.dataset.flipped === 'true';
          card.dataset.flipped = String(!flipped);
          const front = card.querySelector('.fc-front');
          const back  = card.querySelector('.fc-back');
          front.style.display  = flipped ? 'block' : 'none';
          back.style.display   = flipped ? 'none'  : 'block';
          card.style.boxShadow = flipped ? '' : '0 0 0 2px #22c55e55';
        };
      card.addEventListener('click', flip);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
      });
    });
  },

_renderQuiz(questions) {
    const container = document.getElementById('quizContainer');
    if (!container) return;
    if (!questions?.length) {
      container.innerHTML = `<div class="viewer-placeholder"><span><svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="12" stroke="currentColor" stroke-width="1.75" fill="none"/><path d="M12 13a4 4 0 0 1 8 0c0 2.5-4 3.5-4 6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><circle cx="16" cy="22.5" r="1.25" fill="currentColor"/></svg></span><p>No quiz generated.</p></div>`;
      return;
    }

    const validQ = questions
      .filter(q =>
        q.question &&
        Array.isArray(q.options) &&
        q.options.length >= 2 &&
        typeof q.answer === 'number' &&
        q.answer >= 0 && q.answer < q.options.length
      )
      .map(q => {
        // Pad options to exactly 4 if the backend sent fewer
        const opts = [...q.options];
        while (opts.length < 4) opts.push('N/A');
        return { ...q, options: opts.slice(0, 4) };
      })
      .slice(0, 10);

    let score = 0;
    let answered = 0;

    container.innerHTML = `
      <div style="margin-bottom:1rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;">
        <span style="font-size:0.85rem;color:var(--text-secondary);">${validQ.length} questions — select an answer for each</span>
        <span id="quizScoreDisplay" style="font-size:0.85rem;font-weight:600;color:var(--clr-primary-500,#1a5ef9);">Score: 0 / ${validQ.length}</span>
      </div>
      ${validQ.map((q, qi) => `
        <div class="quiz-question" data-qi="${qi}" data-answered="false"
             style="margin-bottom:1rem;padding:1.1rem 1.25rem;border-radius:0.75rem;background:var(--bg-surface-2);border:1.5px solid var(--border-default);">
          <p style="font-weight:600;margin:0 0 0.8rem;font-size:0.95rem;line-height:1.5;">${qi + 1}. ${escapeHtml(q.question)}</p>
          <div style="display:flex;flex-direction:column;gap:0.4rem;">
            ${q.options.map((opt, oi) => `
              <button class="quiz-option" data-qi="${qi}" data-oi="${oi}" type="button"
                      style="text-align:left;width:100%;padding:0.6rem 0.9rem;border-radius:0.5rem;border:1.5px solid var(--border-default);background:var(--bg-surface);cursor:pointer;font-size:0.88rem;line-height:1.4;transition:background 0.15s,border-color 0.15s;color:var(--text-primary);">
                <strong>${String.fromCharCode(65 + oi)}.</strong> ${escapeHtml(opt)}
              </button>
            `).join('')}
          </div>
          <div class="quiz-feedback" style="display:none;margin-top:0.6rem;font-size:0.85rem;font-weight:600;padding:0.4rem 0.6rem;border-radius:0.4rem;"></div>
        </div>
      `).join('')}
      <div id="quizFinalResult" style="display:none;margin-top:1rem;padding:1rem 1.25rem;border-radius:0.75rem;text-align:center;font-weight:700;font-size:1rem;"></div>`;

    container.querySelectorAll('.quiz-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const qi     = parseInt(btn.dataset.qi, 10);
        const oi     = parseInt(btn.dataset.oi, 10);
        const qBlock = container.querySelector(`.quiz-question[data-qi="${qi}"]`);
        if (!qBlock || qBlock.dataset.answered === 'true') return;

        const correct = typeof validQ[qi].answer === 'number'
          ? validQ[qi].answer
          : validQ[qi].answer.charCodeAt(0) - 65;
        const isRight = oi === correct;

        qBlock.dataset.answered = 'true';
        answered++;
        if (isRight) score++;

        qBlock.querySelectorAll('.quiz-option').forEach((b, idx) => {
          b.disabled = true;
          b.style.cursor = 'default';
          if (idx === correct) {
            b.style.background    = '#22c55e22';
            b.style.borderColor   = '#22c55e';
            b.style.color         = '#22c55e';
            b.style.fontWeight    = '700';
          }
          if (idx === oi && !isRight) {
            b.style.background    = '#ef444422';
            b.style.borderColor   = '#ef4444';
            b.style.color         = '#ef4444';
          }
        });

        const feedback = qBlock.querySelector('.quiz-feedback');
        if (feedback) {
          feedback.style.display = 'block';
          feedback.textContent   = isRight ? 'Correct!' : `Wrong. Correct answer: ${String.fromCharCode(65 + correct)}. ${escapeHtml(validQ[qi].options[correct])}`;
          feedback.style.color   = isRight ? '#22c55e' : '#ef4444';
          feedback.style.background = isRight ? '#22c55e11' : '#ef444411';
        }

        const scoreEl = document.getElementById('quizScoreDisplay');
        if (scoreEl) scoreEl.textContent = `Score: ${score} / ${validQ.length}`;

        if (answered === validQ.length) {
          const pct    = Math.round((score / validQ.length) * 100);
          const remark = pct >= 80 ? 'Excellent!' : pct >= 60 ? 'Good job!' : 'Keep reviewing!';
          const final  = document.getElementById('quizFinalResult');
          if (final) {
            final.style.display    = 'block';
            final.textContent      = `${remark} You scored ${score} out of ${validQ.length} (${pct}%)`;
            final.style.background = pct >= 60 ? '#22c55e22' : '#ef444422';
            final.style.color      = pct >= 60 ? '#22c55e'   : '#ef4444';
            final.style.border     = `1.5px solid ${pct >= 60 ? '#22c55e' : '#ef4444'}`;
          }
          // Show confidence rating panel + auto-submit score
          ViewerController._showConfidencePanel(score, validQ.length, pct);
          ViewerController._submitQuizAttempt(score, validQ.length, 0);
        }
      });
    });
  },

  _toggleOutputCard(btn) {
    const targetId = btn.getAttribute('aria-controls');
    const body     = document.getElementById(targetId);
    if (!body) return;
    const isExpanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!isExpanded));
    btn.setAttribute('aria-label', (isExpanded ? 'Expand' : 'Collapse') + btn.getAttribute('aria-label').replace(/Collapse |Expand /g, ''));
    btn.textContent = isExpanded ? '▼' : '▲';
    body.style.display = isExpanded ? 'none' : '';
  },

  _exportToPDF() {
    showToast('Exporting AI output to PDF… (requires jsPDF — production ready)', 'info');
    // PRODUCTION: wire up jsPDF here using window.jspdf.jsPDF
  },

_copyOutput() {
    const cards = document.querySelector('.ai-output-grid');
    if (cards) {
      navigator.clipboard?.writeText(cards.innerText)
        .then(() => showToast('AI output copied to clipboard.', 'success'))
        .catch(() => showToast('Copy failed.', 'warning'));
    }
  },

  _renderGlossary(terms) {
    const container = document.getElementById('glossaryOutput');
    if (!container) return;
    if (!terms?.length) {
      container.innerHTML = `<div class="viewer-placeholder"><span><svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="3" width="16" height="22" rx="2" stroke="currentColor" stroke-width="1.75" fill="none"/><rect x="12" y="7" width="16" height="22" rx="2" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.4"/><path d="M8 10h8M8 14h6M8 18h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></span><p>No glossary terms generated.</p></div>`;
      return;
    }
    const sorted = [...terms].sort((a, b) => a.term.localeCompare(b.term));
    container.innerHTML = `
      <dl style="display:flex;flex-direction:column;gap:0.6rem;padding-bottom:3rem;">
        ${sorted.map(t => `
          <div style="padding:0.75rem 1rem;border-radius:0.625rem;background:var(--bg-surface-2);border:1px solid var(--border-default);">
            <dt style="font-weight:700;font-size:0.92rem;color:var(--clr-primary-500,#1a5ef9);margin-bottom:0.2rem;">${escapeHtml(t.term)}</dt>
            <dd style="margin:0;font-size:0.88rem;line-height:1.6;color:var(--text-primary);">${escapeHtml(t.definition)}</dd>
          </div>
        `).join('')}
      </dl>`;

    // Copy all terms button — replace element to strip stale listeners
    const copyBtn = document.getElementById('copyGlossaryBtn');
    if (copyBtn) {
      const freshBtn = copyBtn.cloneNode(true);
      copyBtn.replaceWith(freshBtn);
      freshBtn.addEventListener('click', () => {
        const text = sorted.map(t => `${t.term}: ${t.definition}`).join('\n');
        navigator.clipboard?.writeText(text)
          .then(() => showToast('Glossary copied to clipboard.', 'success'))
          .catch(() => showToast('Copy failed.', 'warning'));
      });
    }
  },

  async _buildPrintSheet(docId) {
    // Use the body-level #printSheet (not the viewer panel one)
    let sheet = document.getElementById('printSheet');
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'printSheet';
      document.body.appendChild(sheet);
    }

    // Always fetch fresh data from backend so print works after page reload
    let cached = AppState.aiOutputCache[docId] || null;
    let file   = AppState.uploadedFiles.find(f => f.id === docId) || {};

    if (!cached) {
      try {
        const resp = await fetch(`${API.DOCUMENTS}/${encodeURIComponent(docId)}`);
        if (resp.ok) {
          const json = await resp.json();
          const doc  = json.data || {};
          cached = doc.aiOutput || {};
          if (!file.name) file = { name: doc.filename, subject: doc.subject, difficulty: doc.difficulty };
        }
      } catch { /* print with whatever is available */ }
    }
    cached = cached || {};

    const subject    = file.subject    || 'Untagged';
    const difficulty = file.difficulty || cached.difficulty || '';
    let html = `<h1>${escapeHtml(file.name || docId)}</h1>`;
    html += `<p class="ps-meta">Subject: ${escapeHtml(subject)}`;
    if (difficulty) html += ` &bull; Difficulty: ${escapeHtml(difficulty)}`;
    html += ` &bull; Generated: ${new Date().toLocaleDateString()} &bull; Printed: ${new Date().toLocaleString()}</p>`;

    if (cached.summary) {
      const printSummary = cached.summary
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/^## (.+)$/gm, '<h3 style="font-size:1rem;margin:1rem 0 0.3rem;">$1</h3>')
        .replace(/^- \*\*(.+?)\*\*:/gm, '<li><strong>$1:</strong>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n{2,}/g, '</p><p style="margin:0.4rem 0;">')
        .replace(/\n/g, '<br>');
      html += `<h2>Summary</h2><div style="font-size:0.9rem;line-height:1.7;"><p style="margin:0;">${printSummary}</p></div>`;
    }
    if (cached.glossary?.length) {
      html += `<h2>Key Terms Glossary</h2><dl>`;
      cached.glossary.forEach(t => {
        html += `<div class="ps-term"><dt>${escapeHtml(t.term)}</dt><dd>${escapeHtml(t.definition)}</dd></div>`;
      });
      html += `</dl>`;
    }
    if (cached.flashcards?.length) {
      html += `<h2>Flashcards</h2>`;
      cached.flashcards.forEach((c, i) => {
        html += `<div class="ps-fc"><strong>Q${i+1}: ${escapeHtml(c.front || c.question || '')}</strong>${escapeHtml(c.back || c.answer || '')}</div>`;
      });
    }

    if (!cached.summary && !cached.flashcards?.length && !cached.glossary?.length) {
      html += `<p style="color:#888;">No AI output available for this document yet. Run AI processing first.</p>`;
    }

    // Inject into body-level sheet; CSS @media print hides everything else
    sheet.innerHTML = html;
    sheet.style.display = 'block';
    sheet.removeAttribute('aria-hidden');

    // Brief delay so DOM settles before browser print dialog opens
    setTimeout(() => {
      window.print();
      // After print dialog closes, hide the sheet again
      setTimeout(() => {
        sheet.style.display = 'none';
        sheet.setAttribute('aria-hidden', 'true');
      }, 500);
    }, 120);
  },

  _renderDifficultyBadge(docId, difficulty, rationale) {
    const colourMap = {
      'Introductory': { bg: '#22c55e22', color: '#15803d', border: '#22c55e55' },
      'Intermediate': { bg: '#f59e0b22', color: '#92400e', border: '#f59e0b55' },
      'Advanced':     { bg: '#ef444422', color: '#991b1b', border: '#ef444455' },
    };
    const style = colourMap[difficulty] || colourMap['Intermediate'];
    const badge  = document.getElementById('difficultyBadge');
    if (badge) {
      badge.style.display    = '';
      badge.textContent      = difficulty || '—';
      badge.style.background = style.bg;
      badge.style.color      = style.color;
      badge.style.border     = `1px solid ${style.border}`;
      badge.title            = rationale || '';
    }
  },

  _currentQuizDocId: null,
  _pendingQuizScore: 0,
  _pendingQuizMax:   0,

  async _loadQuizHistory(docId) {
    this._currentQuizDocId = docId;
    const bar = document.getElementById('quizHistoryBar');
    try {
      const resp = await fetch(`${API.QUIZ_ATTEMPTS}/${encodeURIComponent(docId)}`);
      if (!resp.ok) throw new Error();
      const json = await resp.json();
      const d = json.data;
      if (d.count === 0) { if (bar) bar.style.display = 'none'; return; }
      if (bar) bar.style.display = '';
      const countEl  = document.getElementById('quizAttemptCount');
      const bestEl   = document.getElementById('quizBestScore');
      const latestEl = document.getElementById('quizLatestScore');
      if (countEl)  countEl.textContent  = d.count;
      if (bestEl)   bestEl.textContent   = `${d.bestScore}%`;
      if (latestEl) latestEl.textContent = `${d.latestScore}%`;
      // Mini progression chart
      const canvas = document.getElementById('quizProgressChart');
      if (canvas && window.Chart && d.attempts?.length) {
        if (this._quizProgressChart) this._quizProgressChart.destroy();
        const labels = d.attempts.map((_, i) => `#${i + 1}`);
        const pcts   = d.attempts.map(a => Math.round(a.score / a.max_score * 100));
        this._quizProgressChart = new window.Chart(canvas.getContext('2d'), {
          type: 'line',
          data: {
            labels,
            datasets: [{ label: 'Score %', data: pcts, borderColor: '#1a5ef9', backgroundColor: 'rgba(26,94,249,0.08)', fill: true, tension: 0.3, pointRadius: 3 }],
          },
          options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { min: 0, max: 100, ticks: { callback: v => v + '%' } } },
          },
        });
      }
    } catch { if (bar) bar.style.display = 'none'; }
  },

  async _submitQuizAttempt(score, maxScore, confidence) {
    this._pendingQuizScore = score;
    this._pendingQuizMax   = maxScore;
    const docId = this._currentQuizDocId;
    if (!docId) return;
    try {
      await fetch(API.QUIZ_ATTEMPT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id:       docId,
          score:             score,
          max_score:         maxScore,
          confidence_rating: confidence,
        }),
      });
      ActivityController.log('Quiz completed — score submitted.', 'quiz');
    } catch { /* silent */ }
  },

_showConfidencePanel(score, maxScore, pct) {
    const panel = document.getElementById('confidenceRatingPanel');
    if (!panel) return;
    panel.style.display = '';
    const advisory = document.getElementById('confidenceAdvisory');
    if (advisory) { advisory.style.display = 'none'; advisory.textContent = ''; }

    // Clone each button to strip all previously attached listeners before re-binding
    panel.querySelectorAll('.conf-btn').forEach(btn => {
      const fresh = btn.cloneNode(true);
      btn.replaceWith(fresh);
    });

    panel.querySelectorAll('.conf-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const conf = parseInt(btn.dataset.conf, 10);
        panel.querySelectorAll('.conf-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Update the already-submitted attempt with confidence rating
        await this._submitQuizAttempt(this._pendingQuizScore, this._pendingQuizMax, conf);
        // Divergence analysis
        if (advisory) {
          advisory.style.display = '';
          if (conf >= 4 && pct <= 50) {
            advisory.textContent      = 'Your confidence is high but your score suggests this topic needs more review. Consider re-reading the material.';
            advisory.style.background = '#f59e0b22';
            advisory.style.color      = '#b45309';
          } else if (conf <= 2 && pct >= 80) {
            advisory.textContent      = 'You performed great! Your score suggests you know this better than you think.';
            advisory.style.background = '#22c55e22';
            advisory.style.color      = '#15803d';
          } else {
            advisory.textContent      = 'Thank you for your self-assessment.';
            advisory.style.background = 'var(--bg-surface-2)';
            advisory.style.color      = 'var(--text-secondary)';
          }
        }
        // Disable all buttons after selection
        panel.querySelectorAll('.conf-btn').forEach(b => { b.disabled = true; });
        // Reload history
        if (this._currentQuizDocId) this._loadQuizHistory(this._currentQuizDocId);
      });
    });
  },
};

/* ============================================================
   SECTION J — DASHBOARD CONTROLLER
   ============================================================ */

const DashboardController = {

  _chartInstance: null,

  refresh() {
    this._renderStats();
    this._renderRecentMaterials();
    this._renderMyUploads();
    this._initChart();
    PlannerController.render();
  },

  _renderStats() {
    const files    = AppState.uploadedFiles;
    const subjects = [...new Set(files.map(f => f.subject).filter(Boolean))];
    const totalSec = StudyTimerController.getTotalStudySeconds();
    const mins     = Math.floor(totalSec / 60);
    const hrs      = Math.floor(mins / 60);
    const studyLabel = hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;

    const map = {
      statTotalDocs:      files.length,
      statSummaries:      AppState.aiStats.summaries,
      statSubjects:       subjects.length,
      statFlashcards:     AppState.aiStats.flashcards,
      statTotalStudyTime: studyLabel || '0m',
    };
    Object.entries(map).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    });
  },

  async _renderRecentMaterials() {
    const list = document.getElementById('recentMaterialsList');
    if (!list) return;

    if (!AppState.uploadedFiles.length) {
      list.innerHTML = `<li style="padding:1rem;color:var(--text-secondary);font-size:0.875rem;">No materials uploaded yet.</li>`;
      return;
    }

    // Sync aiStatus from backend for all local entries
    try {
      const resp = await fetch(API.DOCUMENTS);
      if (resp.ok) {
        const json = await resp.json();
        const backendDocs = json.data?.documents || [];
        let changed = false;
        backendDocs.forEach(bd => {
          const local = AppState.uploadedFiles.find(f => f.id === bd.id);
          if (local && local.aiStatus !== bd.ai_status) {
            local.aiStatus = bd.ai_status;
            changed = true;
          }
        });
        if (changed) AppState.saveUploads();
      }
    } catch { /* backend unavailable — use cached statuses */ }

    const typeIcon = { PDF: '[PDF]', DOCX: '[DOCX]', PPTX: '[PPTX]', TXT: '[TXT]' };
    const relativeTime = iso => {
      const diff = Date.now() - new Date(iso).getTime();
      const mins  = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days  = Math.floor(diff / 86400000);
      if (mins < 2)   return 'just now';
      if (mins < 60)  return `${mins} min ago`;
      if (hours < 24) return `${hours} hr ago`;
      return `${days} day${days !== 1 ? 's' : ''} ago`;
    };

    const badgeHtml = status => {
      switch (status) {
        case 'summarized':
          return `<span class="material-item__badge" style="background:#22c55e22;color:#15803d;border-color:#22c55e55;">Processed</span>`;
        case 'processing':
          return `<span class="material-item__badge material-item__badge--pending" style="background:#f59e0b22;color:#b45309;border-color:#f59e0b55;">Processing…</span>`;
        case 'failed':
          return `<span class="material-item__badge material-item__badge--pending" style="background:#ef444422;color:#b91c1c;border-color:#ef444455;">Failed</span>`;
        default:
          return `<span class="material-item__badge material-item__badge--pending">Pending AI</span>`;
      }
    };

    list.innerHTML = AppState.uploadedFiles.slice(0, 5).map(f => `
      <li class="material-item">
        <span class="material-item__icon" aria-hidden="true" style="font-size:0.7rem;font-weight:700;letter-spacing:-0.02em;opacity:0.6;">${typeIcon[f.type] || '[FILE]'}</span>
        <div class="material-item__info">
          <span class="material-item__title">${escapeHtml(f.name)}</span>
          <span class="material-item__meta">${escapeHtml(f.subject || 'Untagged')} &bull; ${relativeTime(f.uploadedAt)}</span>
        </div>
        ${badgeHtml(f.aiStatus)}
        ${f.difficulty ? `<span class="course-code-badge" title="${escapeHtml(f.difficultyRationale || '')}" style="margin-left:0.3rem;">${escapeHtml(f.difficulty)}</span>` : ''}
      </li>
    `).join('');
  },

  _renderMyUploads() {
    const list = document.getElementById('myUploadsList');
    if (!list) return;

    if (!AppState.uploadedFiles.length) {
      list.innerHTML = `
        <p class="empty-state">
          No uploaded documents yet.
        </p>
      `;
      return;
    }

    const recent = AppState.uploadedFiles.slice(0, 5);
    const items  = recent.map(f => `
      <article class="upload-preview-card">
        <span class="upload-preview-card__type">${escapeHtml(f.type)}</span>
        <div class="upload-preview-card__info">
          <span class="upload-preview-card__name">${escapeHtml(f.name)}</span>
          <span class="upload-preview-card__size">${escapeHtml(f.size)}</span>
        </div>
        <button class="btn btn--icon" type="button" aria-label="View document"
                data-view-doc-id="${escapeHtml(f.id)}">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="7.5" cy="7.5" rx="6" ry="4.5" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="7.5" cy="7.5" r="1.75" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>
        </button>
      </article>
    `).join('');
    list.innerHTML = items;

    // Bind view buttons to auto-open doc in viewer
    list.querySelectorAll('[data-view-doc-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const docId = btn.dataset.viewDocId;
        PanelController.show('viewer');
        const sel = document.getElementById('viewerDocSelect');
        if (sel) {
          sel.value = docId;
          await ViewerController._loadDocument(docId);
        }
      });
    });
  },

  _initChart() {
    const canvas = document.getElementById('dashboardChart');
    if (!canvas || !window.Chart) return;

    if (this._chartInstance) {
      this._chartInstance.destroy();
      this._chartInstance = null;
    }

    const subjectCounts = AppState.uploadedFiles.reduce((acc, f) => {
      const s = f.subject || 'Untagged';
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    const labels = Object.keys(subjectCounts);
    const data   = Object.values(subjectCounts);
    const palette = [
      'rgba(26,94,249,0.7)','rgba(6,182,212,0.7)','rgba(245,158,11,0.7)',
      'rgba(34,197,94,0.7)','rgba(239,68,68,0.7)','rgba(168,85,247,0.7)',
    ];

    const ctx = canvas.getContext('2d');
    this._chartInstance = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels.length ? labels : ['No data'],
        datasets: [{
          label: 'Documents Uploaded',
          data:  data.length  ? data  : [0],
          backgroundColor: labels.map((_, i) => palette[i % palette.length]),
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 2 } },
        },
      },
    });
  },
};

/* ============================================================
   SECTION K2 — VIEW ALL UPLOADS MODAL + DELETE
   ============================================================ */

const ViewAllController = {

  _pendingDeleteId: null,

  bindEvents() {
    document.getElementById('viewAllUploadsBtn')?.addEventListener('click', () => this._openModal());
    document.getElementById('viewAllModalClose')?.addEventListener('click', () => this._closeModal());
    document.getElementById('viewAllModal')?.addEventListener('click', e => {
      if (e.target === document.getElementById('viewAllModal')) this._closeModal();
    });
    document.getElementById('deleteConfirmCancel')?.addEventListener('click', () => this._closeDeleteConfirm());
    document.getElementById('deleteConfirmOk')?.addEventListener('click', () => this._executeDelete());
  },

  _openModal() {
    const modal = document.getElementById('viewAllModal');
    const list  = document.getElementById('viewAllUploadsList');
    if (!modal || !list) return;

    const files = AppState.uploadedFiles;
    if (!files.length) {
      list.innerHTML = `<li style="padding:1rem;color:var(--text-secondary);font-size:0.875rem;">No uploads yet.</li>`;
    } else {
      const relativeTime = iso => {
        const diff = Date.now() - new Date(iso).getTime();
        const m = Math.floor(diff / 60000);
        const h = Math.floor(diff / 3600000);
        const d = Math.floor(diff / 86400000);
        if (m < 2) return 'just now';
        if (m < 60) return `${m}m ago`;
        if (h < 24) return `${h}h ago`;
        return `${d}d ago`;
      };
      list.innerHTML = files.map(f => `
        <li style="display:flex;align-items:center;gap:0.75rem;padding:0.7rem 0.85rem;border-radius:0.625rem;background:var(--bg-surface-2);border:1px solid var(--border-default);">
          <span style="font-size:0.68rem;font-weight:700;opacity:0.6;min-width:2.5rem;">${escapeHtml(f.type || 'FILE')}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:0.88rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(f.name)}</div>
            <div style="font-size:0.76rem;color:var(--text-secondary);">${escapeHtml(f.subject || 'Untagged')} &bull; ${relativeTime(f.uploadedAt)} &bull; ${escapeHtml(f.size || '')}</div>
          </div>
          <button type="button" class="view-all__delete-btn" data-file-id="${escapeHtml(f.id)}" aria-label="Delete ${escapeHtml(f.name)}"
                  style="background:none;border:none;cursor:pointer;padding:0.25rem;color:var(--text-secondary);flex-shrink:0;opacity:0.65;transition:opacity 0.15s;">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2.5 3.5h10M6 3.5V2h3v1.5M6 6.5v4M9 6.5v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              <rect x="3.5" y="3.5" width="8" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4" fill="none"/>
            </svg>
          </button>
        </li>
      `).join('');
    }

    list.querySelectorAll('.view-all__delete-btn').forEach(btn => {
      btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; btn.style.color = '#ef4444'; });
      btn.addEventListener('mouseleave', () => { btn.style.opacity = '0.65'; btn.style.color = 'var(--text-secondary)'; });
      btn.addEventListener('click', () => this._confirmDelete(btn.dataset.fileId));
    });

    modal.style.display = '';
  },

  _closeModal() {
    const modal = document.getElementById('viewAllModal');
    if (modal) modal.style.display = 'none';
  },

  _confirmDelete(fileId) {
    this._pendingDeleteId = fileId;
    const modal = document.getElementById('deleteConfirmModal');
    if (modal) modal.style.display = '';
  },

  _closeDeleteConfirm() {
    this._pendingDeleteId = null;
    const modal = document.getElementById('deleteConfirmModal');
    if (modal) modal.style.display = 'none';
  },

  async _executeDelete() {
    const fileId = this._pendingDeleteId;
    if (!fileId) return;
    this._closeDeleteConfirm();
    this._closeModal();

    // Remove from local state
    AppState.uploadedFiles = AppState.uploadedFiles.filter(f => f.id !== fileId);
    AppState.saveUploads();
    DashboardController.refresh();
    showToast('Upload deleted.', 'info');
    ActivityController.log(`Deleted file ID: ${fileId}`, 'delete');

    // Delete from backend
    try {
      const resp = await fetch(`${API.DOCUMENTS}/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
      if (!resp.ok) console.warn('[Delete] Backend:', resp.status);
      await ViewerController.refreshDocumentList();
    } catch (e) {
      console.warn('[Delete] Backend unreachable:', e);
    }
  },
};

/* ============================================================
   SECTION L — ADMIN DASHBOARD CONTROLLER
   ============================================================ */

const AdminController = {

  _moderationBound: false,
  _analyticsChart: null,
  _subjectChart:   null,
  _allRows:        [],

  async refresh() {
    const stats = await ApiService.fetchAdminStats();
    this._renderStats(stats);
    this._initCharts();
    this._cacheFileRows();
    this._bindModerationActions();
  },

_renderStats(stats) {
    const map = {
      adminTotalFiles:    stats.totalFiles,
      adminTotalSubjects: stats.totalSubjects,
      adminAiRuns:        stats.aiRuns,
    };
    Object.entries(map).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    });
    this._populateFileTable();
  },

  _populateFileTable() {
    const tbody = document.getElementById('adminFileTableBody');
    if (!tbody) return;
    if (!AppState.uploadedFiles.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:1rem;color:var(--text-secondary);">No files uploaded yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = AppState.uploadedFiles.map(f => `
      <tr>
        <td>${escapeHtml(f.name)}</td>
        <td>${escapeHtml(f.subject || 'Untagged')}</td>
        <td>${escapeHtml(AppState.role)}</td>
        <td>${escapeHtml(f.size)}</td>
        <td><span class="status-badge ${f.aiStatus === 'summarized' ? 'status-badge--done' : 'status-badge--pending'}">${f.aiStatus === 'summarized' ? 'Summarized' : 'Pending'}</span></td>
        <td>
          <button class="btn btn--icon" type="button" aria-label="View file" data-panel="viewer">&#128065;</button>
          <button class="btn btn--icon btn--delete-file" type="button" aria-label="Delete file" data-file-id="${escapeHtml(f.id)}">&#128465;</button>
        </td>
      </tr>
    `).join('');
    this._allRows = Array.from(tbody.querySelectorAll('tr'));
    this._bindDeleteActions(tbody);
  },

  _bindDeleteActions(tbody) {
    // Use a single delegated listener keyed to this tbody instance.
    // Remove any previously attached listener to prevent stacking.
    if (tbody._deleteHandler) {
      tbody.removeEventListener('click', tbody._deleteHandler);
    }
    tbody._deleteHandler = async e => {
      const btn = e.target.closest('.btn--delete-file');
      if (!btn) return;
      const fileId = btn.dataset.fileId;
      // Optimistically remove from local state immediately
      AppState.uploadedFiles = AppState.uploadedFiles.filter(f => f.id !== fileId);
      AppState.saveUploads();
      this._populateFileTable();
      DashboardController.refresh();
      showToast('File removed.', 'info');
      ActivityController.log(`Deleted file ID: ${fileId}`, 'delete');
      // Also remove from backend database & disk
      try {
        const resp = await fetch(`${API.DOCUMENTS}/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
        if (!resp.ok) {
          const json = await resp.json().catch(() => ({}));
          console.warn('[Delete] Backend removal failed:', json.message || resp.status);
        }
        // Refresh viewer dropdown to reflect deletion
        await ViewerController.refreshDocumentList();
      } catch (err) {
        console.warn('[Delete] Could not reach backend to delete file:', err);
      }
    };
    tbody.addEventListener('click', tbody._deleteHandler);
  },

  _initCharts() {
    if (!window.Chart) return;

    // Analytics overview chart
    const analyticsCanvas = document.getElementById('adminAnalyticsChart');
    if (analyticsCanvas) {
      if (this._analyticsChart) { this._analyticsChart.destroy(); }
      const ctx = analyticsCanvas.getContext('2d');
      // Build upload activity from real data (group by upload date)
      const uploadsByDay = AppState.uploadedFiles.reduce((acc, f) => {
        const day = f.uploadedAt ? new Date(f.uploadedAt).toLocaleDateString() : 'Unknown';
        acc[day] = (acc[day] || 0) + 1;
        return acc;
      }, {});
      const actLabels = Object.keys(uploadsByDay);
      const actData   = Object.values(uploadsByDay);

      this._analyticsChart = new window.Chart(ctx, {
        type: 'line',
        data: {
          labels: actLabels.length ? actLabels : ['No uploads yet'],
          datasets: [{
            label: 'Uploads',
            data:  actData.length  ? actData  : [0],
            borderColor: 'rgba(26, 94, 249, 0.9)',
            backgroundColor: 'rgba(26, 94, 249, 0.1)',
            fill: true,
            tension: 0.4,
          }],
        },
        options: { responsive: true, plugins: { legend: { display: false } } },
      });
    }

    // Subject breakdown doughnut chart
    const subjectCanvas = document.getElementById('adminSubjectChart');
    if (subjectCanvas) {
      if (this._subjectChart) { this._subjectChart.destroy(); }
      const subjectCounts = AppState.uploadedFiles.reduce((acc, f) => {
        const s = f.subject || 'Untagged';
        acc[s] = (acc[s] || 0) + 1;
        return acc;
      }, {});
      const sLabels = Object.keys(subjectCounts);
      const sData   = Object.values(subjectCounts);
      const palette = [
        'rgba(26,94,249,0.75)','rgba(6,182,212,0.75)',
        'rgba(245,158,11,0.75)','rgba(34,197,94,0.75)',
        'rgba(239,68,68,0.75)','rgba(168,85,247,0.75)',
      ];
      const ctx2 = subjectCanvas.getContext('2d');
      this._subjectChart = new window.Chart(ctx2, {
        type: 'doughnut',
        data: {
          labels: sLabels.length ? sLabels : ['No data'],
          datasets: [{ data: sData.length ? sData : [1], backgroundColor: sLabels.map((_, i) => palette[i % palette.length]) }],
        },
        options: { responsive: true },
      });
    }

    // Re-render on range change — bind only once
    const rangeEl = document.getElementById('adminChartRange');
    if (rangeEl && !rangeEl._chartRangeBound) {
      rangeEl._chartRangeBound = true;
      rangeEl.addEventListener('change', () => { this._initCharts(); });
    }
  },

  _cacheFileRows() {
    const tbody = document.getElementById('adminFileTableBody');
    if (tbody) {
      this._allRows = Array.from(tbody.querySelectorAll('tr'));
    }
  },

  filterFileTable(query) {
    const q = query.toLowerCase().trim();
    this._allRows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = (!q || text.includes(q)) ? '' : 'none';
    });
  },

  

  _bindModerationActions() {

    if (this._moderationBound) return;
    this._moderationBound = true;
    const list = document.getElementById('moderationList');
    if (!list) return;

    list.addEventListener('click', e => {
      const approveBtn = e.target.closest('.btn--approve');
      const rejectBtn  = e.target.closest('.btn--reject');
      if (!approveBtn && !rejectBtn) return;

      const item = e.target.closest('.moderation-item');
      const name = item?.querySelector('strong')?.textContent || 'item';

      if (approveBtn) showToast(`"${name}" approved.`, 'success');
      if (rejectBtn)  showToast(`"${name}" removed.`, 'info');

      item?.remove();
      this._updateModerationCount();
    });
  },

  _updateModerationCount() {
    const list   = document.getElementById('moderationList');
    const badge  = document.getElementById('moderationCount');
    const count  = list?.querySelectorAll('.moderation-item').length || 0;
    if (badge) badge.textContent = count ? `${count} pending` : 'All clear';
  },
};

/* ============================================================
   SECTION M — DROPDOWN & PROFILE MENU
   ============================================================ */

const DropdownController = {

  bindEvents() {
    const dropdown = document.getElementById('profileDropdown');
    if (!dropdown) return;

    const close = () => {
      dropdown.classList.remove('dropdown--open');
      dropdown.setAttribute('aria-expanded', 'false');
    };
    const open = () => {
      dropdown.classList.add('dropdown--open');
      dropdown.setAttribute('aria-expanded', 'true');
    };

    // Toggle on click
    dropdown.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('dropdown--open');
      isOpen ? close() : open();
    });

    // Keyboard navigation
    dropdown.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dropdown.click(); }
      if (e.key === 'Escape') close();
    });

    // Prevent clicks inside dropdown-content from closing it immediately
    dropdown.querySelector('.dropdown-content')?.addEventListener('click', e => e.stopPropagation());

    // Close when clicking outside
    document.addEventListener('click', () => close());

    // Logout: clear localStorage and return to hero
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      [
        'psu-acadres-role',
        'psu-acadres-uploads',
        'psu-acadres-ai-stats',
        'psu-acadres-panel',
        'psu-acadres-student-year',
        'psu-acadres-student-standing',
        'psu-acadres-student-sem',
      ].forEach(k => { try { localStorage.removeItem(k); } catch {} });

      AppState.uploadedFiles = [];
      AppState.aiStats       = { summaries: 0, flashcards: 0 };
      AppState.currentPanel  = 'hero';
      AppState.role          = '';

      const nav = document.getElementById('mainNav');
      if (nav) nav.style.display = 'none';

      const roleEl = document.getElementById('activeRole');
      if (roleEl) roleEl.textContent = '—';

      PanelController.show('hero');
      close();
      showToast('Logged out successfully.', 'success');
    });
  },
};

/* ============================================================
   SECTION N — GLOBAL KEYBOARD SHORTCUTS
   ============================================================ */

const KeyboardController = {

  bindEvents() {
    document.addEventListener('keydown', e => {
      // Escape: close dropdowns, return to dashboard if on deep panel
      if (e.key === 'Escape') {
        document.querySelector('.dropdown--open')?.classList.remove('dropdown--open');
      }

      // Alt + T: toggle theme
      if (e.altKey && e.key === 't') {
        e.preventDefault();
        ThemeController.toggle();
      }
    });
  },
};

/* ============================================================
   SECTION O — AI TOOL QUICK-LAUNCH BUTTONS (Dashboard)
   ============================================================ */

const AiToolsController = {

  bindEvents() {
    const aiItems = document.querySelectorAll('.ai-tool-item .btn--sm');
    if (!aiItems.length) return;

    const toolNames = ['Auto Summarize', 'Flashcard Generator', 'Quiz Builder'];
    aiItems.forEach((btn, i) => {
      btn.addEventListener('click', () => {
        PanelController.show('viewer');
        const tab = ['summary', 'flashcards', 'quiz'][i] || 'summary';
        ViewerController._switchTab(tab);
        showToast(`${toolNames[i]} ready — select a document to begin.`, 'info');
      });
    });

    // "Create Flashcards" is now the last quick-action (Search removed)
    const flashcardBtn = document.querySelector('.quick-action-btn:last-child');
    if (flashcardBtn && !flashcardBtn.dataset.panel) {
      flashcardBtn.addEventListener('click', () => {
        PanelController.show('viewer');
        ViewerController._switchTab('flashcards');
      });
    }
  },
};

/* ============================================================
   SECTION P — APPLICATION BOOTSTRAP
   ============================================================ */

function initApp() {
  // Prevent ALL form submissions from reloading the page
  document.addEventListener('submit', e => e.preventDefault());

  // Restore persisted state
  AppState.init();

  // 2. Apply theme & role immediately to prevent flash
  ThemeController.restore();
  RoleController.restore();

  // 3. Set up panel system & show initial view
  PanelController.init();

// 4. Bind all controllers
  ThemeController.bindEvents();
  RoleController.bindEvents();
  PanelController.bindEvents();
  UploadController.bindEvents();
  ViewerController.bindEvents();
  ViewAllController.bindEvents();
  DropdownController.bindEvents();
  KeyboardController.bindEvents();
  AiToolsController.bindEvents();
  StudentProfileController.bindEvents();
  StudentSetupController.bindEvents();

  // Hide year/semester upload fields for students — auto-filled from profile
  const _applyUploadFieldVisibility = () => {
    const isStudent = (AppState.role || 'Student') === 'Student';
    const ylField  = document.getElementById('yearLevelField');
    const semField = document.getElementById('semesterField');
    if (ylField)  ylField.style.display  = isStudent ? 'none' : '';
    if (semField) semField.style.display = isStudent ? 'none' : '';
  };
  _applyUploadFieldVisibility();
  // Re-apply whenever role changes
  document.querySelectorAll('.role-card').forEach(card => {
    card.addEventListener('click', () => setTimeout(_applyUploadFieldVisibility, 50));
  });
  PlannerController.render();
  ActivityController.render();
  document.getElementById('clearActivityBtn')?.addEventListener('click', () => ActivityController.clear());

  // Admin file filter (standalone — no SearchController)
  document.getElementById('adminFileFilter')?.addEventListener('input', e => {
    AdminController.filterFileTable(e.target.value);
  });

  ViewerController.refreshDocumentList();

  // 5. Console signature (prototype)
  console.info(
    '%cPSU AcadRes — Frontend Interaction Layer loaded.',
    'color:#1a5ef9;font-weight:600;'
  );
  console.info('State:', AppState);
}

// Boot after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}