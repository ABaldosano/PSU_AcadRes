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
  THEME:    'psu-acadres-theme',
  ROLE:     'psu-acadres-role',
  UPLOADS:  'psu-acadres-uploads',
  PREFS:    'psu-acadres-prefs',
  AI_STATS: 'psu-acadres-ai-stats',
  PANEL:    'psu-acadres-panel',
};

/** API endpoints — FastAPI backend */
const API = {
  BASE:      'http://127.0.0.1:8000',
  UPLOAD:    'http://127.0.0.1:8000/api/upload',
  SUMMARIZE: 'http://127.0.0.1:8000/api/summarize',
  DOCUMENTS: 'http://127.0.0.1:8000/api/documents',
  ADMIN:     'http://127.0.0.1:8000/api/admin/stats',
  HEALTH:    'http://127.0.0.1:8000/api/health',
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

  const iconMap = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.innerHTML = `<span class="toast__icon" aria-hidden="true">${iconMap[type] ?? 'ℹ️'}</span><span class="toast__msg">${escapeHtml(message)}</span>`;

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
        totalUsers:    null,
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
    this.role         = lsGet(LS.ROLE)   || 'Student';
    this.currentPanel = lsGet(LS.PANEL)  || 'hero';
    const raw = lsGet(LS.UPLOADS);
    try { this.uploadedFiles = raw ? JSON.parse(raw) : []; }
    catch { this.uploadedFiles = []; }
    const rawStats = lsGet(LS.AI_STATS);
    try { this.aiStats = rawStats ? JSON.parse(rawStats) : { summaries: 0, flashcards: 0 }; }
    catch { this.aiStats = { summaries: 0, flashcards: 0 }; }
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
    if (icon)  icon.textContent  = theme === 'dark' ? '☀' : '☽';
    if (label) label.textContent = theme === 'dark' ? 'Light' : 'Theme';
  },

  bindEvents() {
    document.getElementById('themeToggle')?.addEventListener('click', () => this.toggle());
  },
};

/* ============================================================
   SECTION F — ROLE SELECTION SYSTEM
   ============================================================ */

const RoleController = {

  apply(role) {
    const normalised = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
    AppState.role = normalised;
    lsSet(LS.ROLE, normalised);
    this._updateIndicator(normalised);
    this._updateRoleCardStates(role.toLowerCase());
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

  bindEvents() {
    // Role card clicks (the whole card or the button inside)
    document.querySelectorAll('.role-card').forEach(card => {
      const btn = card.querySelector('button');

      const select = () => {
        this.apply(card.dataset.role);
        PanelController.show('dashboard');
        showToast(`Logged in as ${AppState.role}`, 'success');
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
    if (panelId === 'admin') AdminController.refresh();
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

  /** Restore the last active panel on load; fall back to hero on first visit */
  init() {
    document.querySelectorAll('.panel').forEach(p => {
      p.style.display = 'none';
      p.setAttribute('aria-hidden', 'true');
    });

    const saved = AppState.currentPanel || 'hero';

    // Validate the saved panel actually exists in the DOM;
    // fall back to hero if it was removed (e.g. search panel).
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
      const iconMap = { PDF: '📄', DOCX: '📝', PPTX: '📊', TXT: '📃' };
      const label   = getFileLabel(file);
      thumb.textContent = iconMap[label] || '📁';
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

    const subject   = document.getElementById('subjectTag')?.value.trim()  || 'Untagged';
    const yearLevel = document.getElementById('yearLevel')?.value           || '';
    const semester  = document.getElementById('semester')?.value            || '';
    const desc      = document.getElementById('docDescription')?.value.trim() || '';
    const aiMode    = document.querySelector('input[name="aiMode"]:checked')?.value || 'simple';

    AppState.isProcessing = true;
    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.textContent = '⏳ Uploading…'; }

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

      this._setProgressBar(50);
      const result = await ApiService.uploadDocument(formData);

      const fileId = result.fileId;

      const entry = {
        id:        fileId,
        name:      this._file.name,
        type:      getFileLabel(this._file),
        size:      formatBytes(this._file.size),
        subject,
        yearLevel,
        semester,
        aiMode,
        uploadedAt: new Date().toISOString(),
        aiStatus:  'pending',
      };
      AppState.uploadedFiles.unshift(entry);
      AppState.saveUploads();

      this._setProgressBar(80);
      this._setProgressLabel('Refreshing document list…');

      await ViewerController.refreshDocumentList();

      this._setProgressBar(100);
      this._setProgressLabel('Upload complete!');

  this._clearUpload();

      if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.innerHTML = '⬆️ Upload &amp; Process with AI'; }

      PanelController.show('viewer');
      await ViewerController.refreshDocumentList();
      const sel = document.getElementById('viewerDocSelect');
      if (sel) sel.value = fileId;
      showToast('File uploaded! AI is now processing…', 'success');
      await ViewerController._triggerAiProcess(fileId);

    } catch (err) {
      console.error('[Upload Error]', err);
      showToast('Upload failed. Please try again.', 'error');
      this._setProgressLabel('Upload failed.');
      this._setProgressBar(0);
    } finally {
      AppState.isProcessing = false;
      if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.innerHTML = '⬆️ Upload &amp; Process with AI'; }
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
    const select = document.getElementById('viewerDocSelect');
    if (!select) return;
    try {
      const response = await fetch(API.DOCUMENTS);
      if (!response.ok) throw new Error(`Failed to fetch documents: ${response.status}`);
      const json = await response.json();
      const docs = json.data?.documents || [];
      select.innerHTML = `<option value="">— Select a Document —</option>`;
      docs.forEach(doc => {
        const opt = document.createElement('option');
        opt.value = doc.id;
        opt.textContent = `${doc.filename} [${doc.subject || 'Untagged'}]`;
        select.appendChild(opt);
      });
    } catch {
      // Backend unavailable — use locally-tracked uploads
      select.innerHTML = `<option value="">— Select a Document —</option>`;
      AppState.uploadedFiles.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = `${f.name} [${f.subject || 'Untagged'}]`;
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
    const body = document.getElementById('sourceDocBody');
    if (!body) return;

    body.innerHTML = `<div style="padding:1rem;color:var(--text-secondary);"><p>⏳ Loading document…</p></div>`;

    try {
      const response = await fetch(`${API.DOCUMENTS}/${encodeURIComponent(docId)}`);
      if (!response.ok) throw new Error(`Failed to load document: ${response.status}`);
      const json = await response.json();
      const doc  = json.data || {};

      const metaText = `File: ${doc.filename || docId}\nSubject: ${doc.subject || 'Untagged'}\nStatus: ${doc.ai_status || 'unknown'}`;
      body.innerHTML = `<div style="padding:1rem;line-height:1.8;white-space:pre-wrap;color:var(--text-primary);font-size:0.9rem;">${escapeHtml(metaText)}</div>`;

      if (doc.aiOutput?.summary)             this._renderSummary(doc.aiOutput.summary);
      if (doc.aiOutput?.flashcards?.length)  this._renderFlashcards(doc.aiOutput.flashcards);
      if (doc.aiOutput?.quiz?.length)        this._renderQuiz(doc.aiOutput.quiz);

    } catch (err) {
      console.error('[Load Document Error]', err);
      body.innerHTML = `<div style="padding:1rem;color:var(--clr-danger-500);">⚠ Failed to load document. Is the backend running?</div>`;
    }
  },

async _triggerAiProcess(docId) {
    const btn = document.getElementById('reprocessBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Processing…'; }

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
      const aiMode = document.querySelector('input[name="aiMode"]:checked')?.value || 'simple';

      const result = await ApiService.summarizeDocument(docId, aiMode);

      if (result.summary)            this._renderSummary(result.summary);
      if (result.flashcards?.length) this._renderFlashcards(result.flashcards);
      if (result.quiz?.length)       this._renderQuiz(result.quiz);

      AppState.aiOutputCache[docId] = result;

      // Update real AI stats
      AppState.aiStats.summaries++;
      if (result.flashcards?.length) AppState.aiStats.flashcards += result.flashcards.length;
      AppState.saveAiStats();

      // Update aiStatus on the corresponding upload entry
      const entry = AppState.uploadedFiles.find(f => f.id === docId);
      if (entry) { entry.aiStatus = 'complete'; AppState.saveUploads(); }

      showToast('AI processing complete!', 'success');
      DashboardController.refresh();

    } catch (err) {
      console.error('[AI Process Error]', err);
      showToast('AI processing failed. Is Ollama running?', 'error');
    } finally {
      AppState.isProcessing = false;
      if (btn) { btn.disabled = false; btn.innerHTML = '🧠 Re-process with AI'; }
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
      .replace(/^- \*\*(.+?)\*\*:/gm, '<li style="margin-bottom:0.4rem;"><strong>$1:</strong>')
      .replace(/^- (.+)$/gm, '<li style="margin-bottom:0.4rem;">$1</li>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n{2,}/g, '</p><p style="margin:0.5rem 0;">')
      .replace(/\n/g, '<br>');

    output.innerHTML = `<div class="summary-text" style="line-height:1.8;font-size:0.92rem;padding:0.5rem 0;"><p style="margin:0;">${html}</p></div>`;
  },

_renderFlashcards(cards) {
    const deck = document.getElementById('flashcardDeck');
    if (!deck) return;
    if (!cards?.length) {
      deck.innerHTML = `<div class="viewer-placeholder"><span>📋</span><p>No flashcards generated.</p></div>`;
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
      container.innerHTML = `<div class="viewer-placeholder"><span>❓</span><p>No quiz generated.</p></div>`;
      return;
    }

    const validQ = questions.filter(q =>
      q.question && Array.isArray(q.options) && q.options.length === 4 && typeof q.answer === 'number'
    ).slice(0, 10);

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
          feedback.textContent   = isRight ? '✅ Correct!' : `❌ Wrong. Correct answer: ${String.fromCharCode(65 + correct)}. ${escapeHtml(validQ[qi].options[correct])}`;
          feedback.style.color   = isRight ? '#22c55e' : '#ef4444';
          feedback.style.background = isRight ? '#22c55e11' : '#ef444411';
        }

        const scoreEl = document.getElementById('quizScoreDisplay');
        if (scoreEl) scoreEl.textContent = `Score: ${score} / ${validQ.length}`;

        if (answered === validQ.length) {
          const pct    = Math.round((score / validQ.length) * 100);
          const remark = pct >= 80 ? '🎉 Excellent!' : pct >= 60 ? '👍 Good job!' : '📚 Keep reviewing!';
          const final  = document.getElementById('quizFinalResult');
          if (final) {
            final.style.display    = 'block';
            final.textContent      = `${remark} You scored ${score} out of ${validQ.length} (${pct}%)`;
            final.style.background = pct >= 60 ? '#22c55e22' : '#ef444422';
            final.style.color      = pct >= 60 ? '#22c55e'   : '#ef4444';
            final.style.border     = `1.5px solid ${pct >= 60 ? '#22c55e' : '#ef4444'}`;
          }
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
  },

  _renderStats() {
    const files    = AppState.uploadedFiles;
    const subjects = [...new Set(files.map(f => f.subject).filter(Boolean))];
    const map = {
      statTotalDocs:  files.length,
      statSummaries:  AppState.aiStats.summaries,
      statSubjects:   subjects.length,
      statFlashcards: AppState.aiStats.flashcards,
    };
    Object.entries(map).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    });
  },

  _renderRecentMaterials() {
    const list = document.getElementById('recentMaterialsList');
    if (!list) return;

    if (!AppState.uploadedFiles.length) {
      list.innerHTML = `<li style="padding:1rem;color:var(--text-secondary);font-size:0.875rem;">No materials uploaded yet.</li>`;
      return;
    }

    const typeIcon = { PDF: '📄', DOCX: '📝', PPTX: '📊', TXT: '📃' };
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

    list.innerHTML = AppState.uploadedFiles.slice(0, 5).map(f => `
      <li class="material-item">
        <span class="material-item__icon" aria-hidden="true">${typeIcon[f.type] || '📁'}</span>
        <div class="material-item__info">
          <span class="material-item__title">${escapeHtml(f.name)}</span>
          <span class="material-item__meta">${escapeHtml(f.subject || 'Untagged')} &bull; ${relativeTime(f.uploadedAt)}</span>
        </div>
        <span class="material-item__badge ${f.aiStatus === 'complete' ? '' : 'material-item__badge--pending'}">
          ${f.aiStatus === 'complete' ? 'Summarized' : 'Pending AI'}
        </span>
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
                data-panel="viewer">&#128065;</button>
      </article>
    `).join('');
    list.innerHTML = items;
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
      adminTotalUsers:    stats.totalUsers ?? '--',
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
        <td><span class="status-badge ${f.aiStatus === 'complete' ? 'status-badge--done' : 'status-badge--pending'}">${f.aiStatus === 'complete' ? 'Summarized' : 'Pending'}</span></td>
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
    tbody.addEventListener('click', e => {
      const btn = e.target.closest('.btn--delete-file');
      if (!btn) return;
      const fileId = btn.dataset.fileId;
      AppState.uploadedFiles = AppState.uploadedFiles.filter(f => f.id !== fileId);
      AppState.saveUploads();
      this._populateFileTable();
      DashboardController.refresh();
      showToast('File removed.', 'info');
    });
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

    // Re-render on range change
    document.getElementById('adminChartRange')?.addEventListener('change', () => {
      this._initCharts();
    });
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
      ['psu-acadres-role', 'psu-acadres-uploads', 'psu-acadres-ai-stats', 'psu-acadres-panel'].forEach(k => {
        try { localStorage.removeItem(k); } catch {}
      });
      AppState.uploadedFiles = [];
      AppState.aiStats       = { summaries: 0, flashcards: 0 };
      AppState.currentPanel  = 'hero';
      AppState.role          = 'Student';
      RoleController.apply('student');
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

  // 1. Restore persisted state
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
  DropdownController.bindEvents();
  KeyboardController.bindEvents();
  AiToolsController.bindEvents();

  // Admin file filter (standalone — no SearchController)
  document.getElementById('adminFileFilter')?.addEventListener('input', e => {
    AdminController.filterFileTable(e.target.value);
  });

  ViewerController.refreshDocumentList();

  // 5. Console signature (prototype)
  console.info(
    '%c🎓 PSU AcadRes — Frontend Interaction Layer loaded.',
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
