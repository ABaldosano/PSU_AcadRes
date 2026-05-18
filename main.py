"""
============================================================
PSU AcadRes - main.py
Intelligent Academic Resource Management System
Palawan State University · College of Information Technology

Backend API Server - Prototype Phase
Stack: FastAPI + Ollama (local LLM) + SQLite + pdfplumber
============================================================
"""

import os
import re
import uuid
import json
import logging
import sqlite3
import datetime
import textwrap
import unicodedata
from pathlib import Path
from typing import Optional

import httpx
import pdfplumber
from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ============================================================
# LOGGING
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("psu_acadres")

# ============================================================
# DIRECTORY SETUP
# ============================================================

BASE_DIR       = Path(__file__).parent
UPLOAD_DIR     = BASE_DIR / "uploads"
STORAGE_DIR    = BASE_DIR / "storage"
DB_PATH        = STORAGE_DIR / "acadres.db"

for d in (UPLOAD_DIR, STORAGE_DIR):
    d.mkdir(parents=True, exist_ok=True)

# ============================================================
# CONSTANTS
# ============================================================

ALLOWED_EXTENSIONS = {".pdf", ".txt"}   # DOCX/PPTX: future phase
MAX_FILE_BYTES     = 50 * 1024 * 1024   # 50 MB

OLLAMA_BASE_URL    = "http://localhost:11434"
OLLAMA_GENERATE    = f"{OLLAMA_BASE_URL}/api/generate"
OLLAMA_MODELS      = ["llama3", "phi3:mini", "phi3", "tinyllama"]      # preference order
OLLAMA_TIMEOUT     = 360.0                       # seconds

CHUNK_SIZE_CHARS   = 800    # smaller chunks = less input = more room for output
CHUNK_OVERLAP      = 30     # overlap between chunks for context

# ============================================================
# DATABASE INITIALISATION
# ============================================================

def get_db() -> sqlite3.Connection:
    """Return a new SQLite connection with row_factory."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create tables if they don't exist."""
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS documents (
                id            TEXT PRIMARY KEY,
                filename      TEXT NOT NULL,
                safe_filename TEXT NOT NULL,
                subject       TEXT DEFAULT 'Untagged',
                year_level    TEXT DEFAULT '',
                semester      TEXT DEFAULT '',
                description   TEXT DEFAULT '',
                ai_mode       TEXT DEFAULT 'simple',
                file_size     INTEGER DEFAULT 0,
                file_type     TEXT DEFAULT '',
                ai_status     TEXT DEFAULT 'pending',
                uploaded_at   TEXT NOT NULL,
                course_code   TEXT DEFAULT '',
                competency    TEXT DEFAULT '',
                uploader_role TEXT DEFAULT 'student',
                uploader_id   TEXT DEFAULT '',
                visibility    TEXT DEFAULT 'private_student'
            );

            CREATE TABLE IF NOT EXISTS ai_outputs (
                id            TEXT PRIMARY KEY,
                document_id   TEXT NOT NULL,
                summary       TEXT DEFAULT '',
                flashcards    TEXT DEFAULT '[]',
                quiz          TEXT DEFAULT '[]',
                glossary      TEXT DEFAULT '[]',
                created_at    TEXT NOT NULL,
                FOREIGN KEY (document_id) REFERENCES documents(id)
            );

            CREATE TABLE IF NOT EXISTS quiz_attempts (
                id                TEXT PRIMARY KEY,
                document_id       TEXT NOT NULL,
                score             INTEGER NOT NULL,
                max_score         INTEGER NOT NULL,
                confidence_rating INTEGER DEFAULT 0,
                attempted_at      TEXT NOT NULL,
                FOREIGN KEY (document_id) REFERENCES documents(id)
            );

            CREATE INDEX IF NOT EXISTS idx_docs_subject   ON documents(subject);
            CREATE INDEX IF NOT EXISTS idx_docs_status    ON documents(ai_status);
            CREATE INDEX IF NOT EXISTS idx_ai_doc_id      ON ai_outputs(document_id);
            CREATE INDEX IF NOT EXISTS idx_quiz_doc_id    ON quiz_attempts(document_id);
        """)

        # Migration-safe: add new columns if upgrading an existing database
        for col, definition in [
            ("course_code",   "TEXT DEFAULT ''"),
            ("competency",    "TEXT DEFAULT ''"),
            ("uploader_role", "TEXT DEFAULT 'student'"),
            ("uploader_id",   "TEXT DEFAULT ''"),
            ("visibility",    "TEXT DEFAULT 'private_student'"),
        ]:
            try:
                conn.execute(f"ALTER TABLE documents ADD COLUMN {col} {definition}")
            except Exception:
                pass

        # ai_outputs migration
        for col, definition in [
            ("glossary", "TEXT DEFAULT '[]'"),
        ]:
            try:
                conn.execute(f"ALTER TABLE ai_outputs ADD COLUMN {col} {definition}")
            except Exception:
                pass

        # documents difficulty migration
        for col, definition in [
            ("difficulty",           "TEXT DEFAULT ''"),
            ("difficulty_rationale", "TEXT DEFAULT ''"),
        ]:
            try:
                conn.execute(f"ALTER TABLE documents ADD COLUMN {col} {definition}")
            except Exception:
                pass

    log.info("Database initialised at %s", DB_PATH)


# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI(
    title="PSU AcadRes API",
    description="Backend for the PSU Intelligent Academic Resource Management System",
    version="1.0.0-prototype",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # prototype - tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded files at /files/<filename>
app.mount("/files", StaticFiles(directory=str(UPLOAD_DIR)), name="files")

@app.on_event("startup")
async def startup_event():
    init_db()
    log.info("PSU AcadRes backend started.")

# ============================================================
# UTILITY FUNCTIONS
# ============================================================

def make_safe_filename(original: str) -> str:
    """
    Sanitise a filename: strip non-ASCII, replace spaces,
    prepend a short UUID to guarantee uniqueness.
    """
    stem = Path(original).stem
    ext  = Path(original).suffix.lower()
    # Normalise unicode, keep only safe chars
    normalised = unicodedata.normalize("NFKD", stem)
    safe_stem  = re.sub(r"[^\w\-]", "_", normalised)[:60]
    short_id   = uuid.uuid4().hex[:8]
    return f"{short_id}_{safe_stem}{ext}"


def extract_text_from_pdf(path: Path) -> str:
    """Extract plain text from a PDF using pdfplumber."""
    pages_text = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages_text.append(text)
    return "\n\n".join(pages_text)


def extract_text_from_txt(path: Path) -> str:
    """Read plain text from a .txt file."""
    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            return path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            continue
    return path.read_bytes().decode("utf-8", errors="replace")


def extract_text(path: Path) -> str:
    """Route text extraction by file extension."""
    ext = path.suffix.lower()
    if ext == ".pdf":
        return extract_text_from_pdf(path)
    if ext == ".txt":
        return extract_text_from_txt(path)
    return ""


MAX_CHUNKS = 3  # hard cap - 3 chunks max for speed

def chunk_text(text: str, size: int = CHUNK_SIZE_CHARS, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """
    Split text into overlapping chunks.
    Tries to break at sentence boundaries first.
    Caps at MAX_CHUNKS to prevent MemoryError on large documents.
    """
    text = text.strip()
    if not text:
        return []

    # Hard truncate to prevent MemoryError: cap total input at size * MAX_CHUNKS
    max_input = size * MAX_CHUNKS
    if len(text) > max_input:
        log.warning("Document truncated from %d to %d chars to prevent MemoryError.", len(text), max_input)
        text = text[:max_input]

    if len(text) <= size:
        return [text]

    chunks: list[str] = []
    start = 0
    while start < len(text) and len(chunks) < MAX_CHUNKS:
        end = min(start + size, len(text))
        if end < len(text):
            boundary_search = text[end - size // 5 : end]
            last_period = max(
                boundary_search.rfind(". "),
                boundary_search.rfind(".\n"),
                boundary_search.rfind("! "),
                boundary_search.rfind("? "),
            )
            if last_period != -1:
                end = end - size // 5 + last_period + 2

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        next_start = end - overlap
        if next_start <= start:          # guard against infinite loop
            next_start = end
        start = next_start

    return chunks


def normalize_text(text: str) -> str:
    """Light cleanup: collapse excess whitespace."""
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


# ============================================================
# OLLAMA INTEGRATION
# ============================================================

async def pick_ollama_model() -> Optional[str]:
    """
    Check which Ollama models are available; return the first
    preferred model found, or None if Ollama is unreachable.
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            if resp.status_code != 200:
                return None
            data = resp.json()
            # Keep full names (e.g. "phi3:mini") AND base names (e.g. "phi3") for matching
            raw_names  = {m["name"] for m in data.get("models", [])}
            base_names = {n.split(":")[0] for n in raw_names}
            all_names  = raw_names | base_names
            log.info("Ollama models available: %s", raw_names)
            for preferred in OLLAMA_MODELS:
                if preferred in all_names or preferred.split(":")[0] in all_names:
                    # Return the full tag if it exists, else base name
                    if preferred in raw_names:
                        return preferred
                    return preferred.split(":")[0]
            # Fallback: use whatever is available
            if raw_names:
                return next(iter(raw_names))
    except Exception as exc:
        log.warning("Ollama health-check failed: %s", exc)
    return None


async def ollama_generate(prompt: str, model: str, max_tokens: int = 900) -> str:
    """
    Send a prompt to Ollama and return the generated text.
    Uses non-streaming mode for simplicity.
    """
    payload = {
        "model":  model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature":    0.1,
            "num_predict":    max_tokens,
            "top_p":          0.9,
            "num_ctx":        4096,
            "num_thread":     6,
            "repeat_penalty": 1.1,
            "top_k":          40,
        },
    }
    async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as client:
        resp = await client.post(OLLAMA_GENERATE, json=payload)
        resp.raise_for_status()
        return resp.json().get("response", "").strip()

# ============================================================
# AI PROMPT BUILDERS
# ============================================================

def build_summary_prompt(text: str, mode: str) -> str:
    mode_instructions = {
        "simple": "Summarize the most important ideas in plain language for undergraduates.",
        "exam-focused": "Extract exam-critical definitions and facts a student must memorize.",
        "detailed": "Extract the major arguments, processes, and conclusions from the document.",
    }
    instruction = mode_instructions.get(mode, mode_instructions["simple"])

    return textwrap.dedent(f"""
        You are an academic summarizer. {instruction}
        Use ONLY facts from the document. Be concise. No filler. No preamble.

        Respond in EXACTLY this format:

        ## Key Concepts
        - [concept]: [one sentence]
        - [concept]: [one sentence]
        - [concept]: [one sentence]

        ## Simplified Explanation
        [One short paragraph of 3-4 sentences describing the main ideas.]

        ## Important Terms
        - [term] - [definition]
        - [term] - [definition]
        - [term] - [definition]
        - [term] - [definition]

        DOCUMENT TEXT:
        {text}

        Start with ## Key Concepts now:
    """).strip()


def build_flashcard_prompt(text: str) -> str:
    return textwrap.dedent(f"""
        Create 5 flashcards from the text. Output ONLY a JSON array, nothing else.
        Rules: use real facts from the text, no generic questions, max 1 sentence per answer.

        [
          {{"front": "question?", "back": "answer."}},
          {{"front": "question?", "back": "answer."}},
          {{"front": "question?", "back": "answer."}},
          {{"front": "question?", "back": "answer."}},
          {{"front": "question?", "back": "answer."}}
        ]

        TEXT:
        {text}

        JSON:
    """).strip()


def build_quiz_prompt(text: str) -> str:
    return textwrap.dedent(f"""
        Create 10 multiple-choice questions from the text. Output ONLY a JSON array, nothing else.
        Rules: real facts only, no questions about file type or document structure, 4 options each, answer is 0-3 index.

        [
          {{"question": "question about the text?", "options": ["correct", "wrong", "wrong", "wrong"], "answer": 0}},
          {{"question": "question about the text?", "options": ["wrong", "correct", "wrong", "wrong"], "answer": 1}},
          {{"question": "question about the text?", "options": ["wrong", "wrong", "correct", "wrong"], "answer": 2}},
          {{"question": "question about the text?", "options": ["wrong", "wrong", "wrong", "correct"], "answer": 3}},
          {{"question": "question about the text?", "options": ["correct", "wrong", "wrong", "wrong"], "answer": 0}},
          {{"question": "question about the text?", "options": ["wrong", "correct", "wrong", "wrong"], "answer": 1}},
          {{"question": "question about the text?", "options": ["wrong", "wrong", "correct", "wrong"], "answer": 2}},
          {{"question": "question about the text?", "options": ["wrong", "wrong", "wrong", "correct"], "answer": 3}},
          {{"question": "question about the text?", "options": ["correct", "wrong", "wrong", "wrong"], "answer": 0}},
          {{"question": "question about the text?", "options": ["wrong", "correct", "wrong", "wrong"], "answer": 1}}
        ]

        TEXT:
        {text}

        JSON:
    """).strip()

def build_glossary_prompt(text: str) -> str:
    return textwrap.dedent(f"""
        Extract up to 10 key academic terms from the text. Output ONLY a JSON array, nothing else.
        Rules: use only terms that appear in the text, alphabetical order, one-sentence definitions.

        [
          {{"term": "Term Name", "definition": "One sentence definition."}}
        ]

        TEXT:
        {text}

        JSON:
    """).strip()

def build_difficulty_prompt(text: str) -> str:
    return textwrap.dedent(f"""
        Classify the academic difficulty of the following text. Choose ONE of:
        Introductory, Intermediate, Advanced

        Then write ONE sentence explaining why.

        Respond ONLY in this exact JSON format, nothing else:
        {{"difficulty": "Intermediate", "rationale": "The text assumes prior knowledge of algebra."}}

        TEXT:
        {text}

        JSON:
    """).strip()

# ============================================================
# AI PROCESSING PIPELINE
# ============================================================

def parse_json_from_llm(raw: str) -> list:
    """
    Robustly extract a JSON array from LLM output.
    Handles truncated output by recovering complete objects.
    """
    # Strip markdown fences and backticks
    raw = re.sub(r"```(?:json)?|```", "", raw).strip()

    # Find array boundaries
    start = raw.find("[")
    if start == -1:
        return []

    # Try full parse first
    end = raw.rfind("]")
    if end != -1:
        try:
            return json.loads(raw[start : end + 1])
        except json.JSONDecodeError:
            pass

    # LLM truncated the output - recover all complete {...} objects manually
    recovered = []
    depth = 0
    obj_start = None
    i = start
    while i < len(raw):
        ch = raw[i]
        if ch == '{':
            if depth == 0:
                obj_start = i
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0 and obj_start is not None:
                try:
                    obj = json.loads(raw[obj_start : i + 1])
                    recovered.append(obj)
                except json.JSONDecodeError:
                    pass
                obj_start = None
        i += 1

    return recovered


async def generate_summary_from_chunks(chunks: list[str], mode: str, model: str) -> str:
    """
    Summarise using only the first chunk - tight input so output doesn't get cut off.
    """
    combined_text = chunks[0][:1000]
    prompt = build_summary_prompt(combined_text, mode)
    return await ollama_generate(prompt, model, max_tokens=900)


async def generate_flashcards_from_chunks(chunks: list[str], model: str) -> list[dict]:
    """Generate flashcards - auto-correct common LLM JSON mistakes."""
    combined = chunks[0][:1000]
    prompt = build_flashcard_prompt(combined)
    raw    = await ollama_generate(prompt, model, max_tokens=1000)
    log.info("Flashcard raw output: %s", raw[:400])
    cards  = parse_json_from_llm(raw)
    valid = []
    for c in cards:
        if not isinstance(c, dict):
            continue
        front = str(c.get("front") or c.get("question") or "").strip()
        back  = str(c.get("back")  or c.get("answer")   or "").strip()
        if len(front) > 10 and len(back) > 10:
            valid.append({"front": front, "back": back})
    return valid[:5] if valid else _fallback_flashcards()


async def generate_quiz_from_chunks(chunks: list[str], model: str) -> list[dict]:
    """Generate quiz - auto-correct string answers, pad short option lists."""
    combined  = chunks[0][:1000]
    prompt    = build_quiz_prompt(combined)
    raw       = await ollama_generate(prompt, model, max_tokens=2400)
    log.info("Quiz raw output (%d chars): %s", len(raw), raw[:500])
    questions = parse_json_from_llm(raw)
    valid = []
    skip_phrases = ["type of document", "file format", "what kind of file",
                    "purpose of this document", "document was processed"]
    for q in questions:
        if not isinstance(q, dict):
            continue
        question = str(q.get("question") or "").strip()
        options  = q.get("options") or []
        answer   = q.get("answer")

        if len(question) < 10:
            continue
        if any(skip in question.lower() for skip in skip_phrases):
            continue

        # Auto-correct string answer to int
        if isinstance(answer, str):
            try:
                answer = int(answer)
            except ValueError:
                letter_map = {"a": 0, "b": 1, "c": 2, "d": 3}
                answer = letter_map.get(answer.strip().lower(), 0)

        if not isinstance(answer, int) or not (0 <= answer <= 3):
            continue

        # Filter out nulls and non-strings from options
        options = [str(o).strip() for o in options if o is not None and str(o).strip()]

        # Pad to exactly 4 if short
        while len(options) < 4:
            options.append("N/A")

        options = options[:4]

        valid.append({"question": question, "options": options, "answer": answer})

    log.info("Quiz valid questions recovered: %d", len(valid))
    return valid[:10] if valid else _fallback_quiz()

async def generate_glossary_from_chunks(chunks: list[str], model: str) -> list[dict]:
    """Generate a key terms glossary from document text."""
    combined = chunks[0][:1000]
    prompt   = build_glossary_prompt(combined)
    raw      = await ollama_generate(prompt, model, max_tokens=800)
    log.info("Glossary raw output: %s", raw[:300])
    terms    = parse_json_from_llm(raw)
    valid    = []
    for t in terms:
        if not isinstance(t, dict): continue
        term = str(t.get("term") or "").strip()
        defn = str(t.get("definition") or "").strip()
        if len(term) > 1 and len(defn) > 10:
            valid.append({"term": term, "definition": defn})
    valid.sort(key=lambda x: x["term"].lower())
    return valid[:10]

async def generate_difficulty_from_chunks(chunks: list[str], model: str) -> tuple[str, str]:
    """Classify document difficulty using the LLM."""
    combined = chunks[0][:800]
    prompt   = build_difficulty_prompt(combined)
    raw      = await ollama_generate(prompt, model, max_tokens=150)
    raw      = re.sub(r"```(?:json)?|```", "", raw).strip()
    try:
        start = raw.find("{")
        end   = raw.rfind("}")
        if start != -1 and end != -1:
            obj = json.loads(raw[start:end+1])
            diff = str(obj.get("difficulty", "")).strip()
            rat  = str(obj.get("rationale", "")).strip()
            if diff in ("Introductory", "Intermediate", "Advanced"):
                return diff, rat
    except Exception:
        pass
    return "Intermediate", "Unable to classify difficulty automatically."

def _fallback_flashcards() -> list[dict]:
    """Return generic flashcards when LLM output cannot be parsed."""
    return [
        {"front": "What are the key topics in this document?",
         "back":  "Review the document's main sections and headings for core topics."},
        {"front": "What is the purpose of this academic material?",
         "back":  "To introduce foundational concepts relevant to the subject area."},
    ]


def _fallback_quiz() -> list[dict]:
    """Return empty list - never show generic fallback quiz."""
    return []


# ============================================================
# RESPONSE HELPERS
# ============================================================

def ok(data: dict = None, message: str = "Success") -> dict:
    return {"success": True, "message": message, "data": data or {}}


def err(message: str, status_code: int = 400) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"success": False, "message": message, "data": {}},
    )


# ============================================================
# API ROUTES
# ============================================================

# ---- Health Check ----

@app.get("/api/health", tags=["System"])
async def health_check():
    """Check backend and Ollama availability."""
    model = await pick_ollama_model()
    return ok({
        "backend":  "online",
        "aiProvider": "online" if model else "offline",
        "model":    model or "none",
        "providerUrl": OLLAMA_BASE_URL,
    }, "Backend is running.")


# ---- Upload ----

@app.post("/api/upload", tags=["Documents"])
async def upload_document(
    file:          UploadFile = File(...),
    subject:       str        = Form(default="Untagged"),
    year:          str        = Form(default=""),
    semester:      str        = Form(default=""),
    desc:          str        = Form(default=""),
    aiMode:        str        = Form(default="simple"),
    course_code:   str        = Form(default=""),
    competency:    str        = Form(default=""),
    uploader_role: str        = Form(default="student"),
    uploader_id:   str        = Form(default=""),
    visibility:    str        = Form(default="private_student"),
):
    """
    Receive an uploaded file, validate it, store it,
    and register metadata in the database.
    """
    # --- Validation ---
    original_name = file.filename or "unnamed"
    ext = Path(original_name).suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        return err(
            f"File type '{ext}' is not supported. "
            "Please upload a PDF or TXT file.",
            415,
        )

    content = await file.read()
    if len(content) > MAX_FILE_BYTES:
        return err("File exceeds the 50 MB size limit.", 413)

    if len(content) == 0:
        return err("Uploaded file is empty.", 400)

    # --- Save to disk ---
    safe_name = make_safe_filename(original_name)
    dest_path = UPLOAD_DIR / safe_name
    dest_path.write_bytes(content)
    log.info("File saved: %s (%d bytes)", safe_name, len(content))

    # --- Register in DB ---
    doc_id = f"doc-{uuid.uuid4().hex[:12]}"
    now    = datetime.datetime.utcnow().isoformat()

    allowed_visibilities = {"private_student", "public_academic", "private_faculty", "private_admin"}
    if visibility not in allowed_visibilities:
        visibility = "private_student"
    if uploader_role == "admin":
        visibility = "private_admin"
    if uploader_role == "student":
        visibility = "private_student"

    with get_db() as conn:
        conn.execute(
            """INSERT INTO documents
               (id, filename, safe_filename, subject, year_level, semester,
                description, ai_mode, file_size, file_type, ai_status, uploaded_at,
                course_code, competency, uploader_role, uploader_id, visibility)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                doc_id, original_name, safe_name,
                subject or "Untagged", year, semester,
                desc, aiMode, len(content), ext.lstrip("."),
                "pending", now,
                course_code, competency,
                uploader_role.lower(), uploader_id, visibility,
            ),
        )

    return ok(
        {
            "fileId":       doc_id,
            "filename":     original_name,
            "subject":      subject,
            "fileSize":     len(content),
            "aiStatus":     "pending",
            "uploadedAt":   now,
            "courseCode":   course_code,
            "competency":   competency,
            "uploaderRole": uploader_role,
            "uploaderId":   uploader_id,
            "visibility":   visibility,
        },
        "File uploaded successfully. AI processing queued.",
    )


# ---- Summarise ----

_processing_lock: set[str] = set()

@app.post("/api/summarize", tags=["AI"])
async def summarize_document(payload: dict):
    """
    Trigger AI summarisation for a given document.

    Expects JSON body: { "fileId": "...", "mode": "simple|exam-focused|detailed" }
    Returns: { summary, flashcards, quiz }
    """
    file_id = payload.get("fileId", "").strip()
    mode    = payload.get("mode", "simple").strip()

    if not file_id:
        return err("fileId is required.")

    # Block duplicate concurrent processing of the same document
    if file_id in _processing_lock:
        return err("Document is already being processed. Please wait.", 409)
    _processing_lock.add(file_id)

    try:
        return await _do_summarize(file_id, mode)
    finally:
        _processing_lock.discard(file_id)


async def _do_summarize(file_id: str, mode: str):
    # Look up document
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM documents WHERE id = ?", (file_id,)
        ).fetchone()

    if not row:
        return err(f"Document '{file_id}' not found.", 404)

    doc_path = UPLOAD_DIR / row["safe_filename"]
    if not doc_path.exists():
        return err("Document file not found on server.", 404)

    # Check AI provider availability
    model = await pick_ollama_model()
    if not model:
        return err(
            "No AI model is available. "
            "Please start Ollama and ensure at least one model from the preferred list "
            f"({', '.join(OLLAMA_MODELS)}) is installed, or run: ollama pull llama3",
            503,
        )

    # Extract text
    try:
        raw_text = extract_text(doc_path)
        raw_text = normalize_text(raw_text)
    except Exception as exc:
        log.error("Text extraction failed for %s: %s", file_id, exc)
        return err("Failed to extract text from document.", 422)

    if not raw_text or len(raw_text) < 30:
        return err(
            "Could not extract readable text from the document. "
            "Ensure the PDF contains selectable text (not a scanned image).",
            422,
        )

    # Chunk text
    chunks = chunk_text(raw_text)
    log.info("Document %s split into %d chunk(s) for AI processing.", file_id, len(chunks))

    # Mark as processing
    with get_db() as conn:
        conn.execute(
            "UPDATE documents SET ai_status = 'processing' WHERE id = ?", (file_id,)
        )

    try:
        summary              = await generate_summary_from_chunks(chunks, mode, model)
        flashcards           = await generate_flashcards_from_chunks(chunks, model)
        quiz                 = await generate_quiz_from_chunks(chunks, model)
        glossary             = await generate_glossary_from_chunks(chunks, model)
        difficulty, diff_rat = await generate_difficulty_from_chunks(chunks, model)
    except httpx.ConnectError:
        with get_db() as conn:
            conn.execute(
                "UPDATE documents SET ai_status = 'failed' WHERE id = ?", (file_id,)
            )
        return err(
            f"Could not connect to the AI provider at {OLLAMA_BASE_URL}. "
            "Make sure Ollama is running and a compatible model is installed.",
            503,
        )
    except httpx.TimeoutException:
        with get_db() as conn:
            conn.execute(
                "UPDATE documents SET ai_status = 'failed' WHERE id = ?", (file_id,)
            )
        return err(
            "AI request timed out. The document may be too large or the model too slow. "
            "Try a shorter document or a faster model.",
            504,
        )
    except Exception as exc:
        log.error("AI generation error for %s: %s", file_id, exc)
        with get_db() as conn:
            conn.execute(
                "UPDATE documents SET ai_status = 'failed' WHERE id = ?", (file_id,)
            )
        return err(f"AI processing error: {exc}", 500)

    # Store AI output
    output_id = f"out-{uuid.uuid4().hex[:12]}"
    now       = datetime.datetime.utcnow().isoformat()

    with get_db() as conn:
        # Upsert: remove old output for this doc if any
        conn.execute("DELETE FROM ai_outputs WHERE document_id = ?", (file_id,))
        conn.execute(
            """INSERT INTO ai_outputs
               (id, document_id, summary, flashcards, quiz, glossary, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                output_id, file_id,
                summary,
                json.dumps(flashcards),
                json.dumps(quiz),
                json.dumps(glossary),
                now,
            ),
        )
        conn.execute(
            "UPDATE documents SET ai_status = 'summarized', difficulty = ?, difficulty_rationale = ? WHERE id = ?",
            (difficulty, diff_rat, file_id),
        )

    log.info("AI output stored for document %s.", file_id)

    return ok(
        {
            "fileId":              file_id,
            "model":               model,
            "summary":             summary,
            "flashcards":          flashcards,
            "quiz":                quiz,
            "glossary":            glossary,
            "difficulty":          difficulty,
            "difficultyRationale": diff_rat,
        },
        "AI summarisation complete.",
    )

# ---- Quiz Attempts ----

class QuizAttemptPayload(BaseModel):
    document_id:       str
    score:             int
    max_score:         int
    confidence_rating: int = 0


@app.post("/api/quiz-attempt", tags=["Quiz"])
async def save_quiz_attempt(payload: QuizAttemptPayload):
    """Record a student quiz attempt with optional confidence rating."""
    attempt_id = f"qa-{uuid.uuid4().hex[:12]}"
    now        = datetime.datetime.utcnow().isoformat()

    with get_db() as conn:
        conn.execute(
            """INSERT INTO quiz_attempts
               (id, document_id, score, max_score, confidence_rating, attempted_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (attempt_id, payload.document_id, payload.score,
             payload.max_score, payload.confidence_rating, now),
        )

    return ok({"attemptId": attempt_id}, "Quiz attempt recorded.")


@app.get("/api/quiz-attempts/{doc_id}", tags=["Quiz"])
async def get_quiz_attempts(doc_id: str):
    """Return all quiz attempts for a given document."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM quiz_attempts WHERE document_id = ? ORDER BY attempted_at ASC",
            (doc_id,),
        ).fetchall()

    attempts = [dict(r) for r in rows]
    if not attempts:
        return ok({"attempts": [], "bestScore": 0, "latestScore": 0, "count": 0})

    scores     = [a["score"] for a in attempts]
    max_scores = [a["max_score"] for a in attempts]
    best_pct   = round(max(s / m * 100 for s, m in zip(scores, max_scores)))
    latest_pct = round(scores[-1] / max_scores[-1] * 100)

    return ok({
        "attempts":    attempts,
        "bestScore":   best_pct,
        "latestScore": latest_pct,
        "count":       len(attempts),
    })

# ---- Re-process ----

@app.post("/api/reprocess", tags=["AI"])
async def reprocess_document(payload: dict):
    """
    Re-trigger AI processing for an already-uploaded document.
    Identical to /api/summarize - provided as a separate endpoint
    to match the frontend's REPROCESS constant.
    """
    return await summarize_document(payload)


# ---- Search ----

@app.get("/api/search", tags=["Search"])
async def search_documents(
    q:        str = Query(default="", alias="q"),
    subject:  str = Query(default=""),
    year:     str = Query(default=""),
    type:     str = Query(default=""),
    aiStatus: str = Query(default=""),
):
    """
    Search uploaded documents by filename, subject tag,
    and other optional filters. Returns structured results.
    """
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM documents").fetchall()

    results = []
    q_lower = q.lower().strip()

    for row in rows:
        doc = dict(row)

        # Text match on filename
        if q_lower and q_lower not in doc["filename"].lower():
            continue
        if subject and doc["subject"].lower() != subject.lower():
            continue
        if year and doc["year_level"] != year:
            continue
        if type and doc["file_type"].lower() != type.lower():
            continue
        if aiStatus and doc["ai_status"].lower() != aiStatus.lower():
            continue

        results.append({
            "id":        doc["id"],
            "title":     doc["filename"],
            "subject":   doc["subject"],
            "year":      doc["year_level"],
            "type":      doc["file_type"],
            "aiStatus":  doc["ai_status"],
            "uploadedAt": doc["uploaded_at"],
            "excerpt":   f"Uploaded {doc['uploaded_at'][:10]} · {doc['file_size']} bytes",
        })

    return ok({"results": results, "count": len(results)}, f"{len(results)} result(s) found.")


# ---- Document list (for viewer dropdown) ----

@app.get("/api/documents", tags=["Documents"])
async def list_documents(
    role:        str = Query(default="student"),
    uploader_id: str = Query(default=""),
):
    """Return documents filtered by caller role and visibility."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, filename, subject, ai_status, uploaded_at, "
            "course_code, year_level, semester, uploader_role, uploader_id, visibility "
            "FROM documents ORDER BY uploaded_at DESC"
        ).fetchall()

    all_docs = [dict(r) for r in rows]
    r = (role or "student").lower()

    if r == "admin":
        filtered = all_docs
    elif r == "faculty":
        filtered = [
            d for d in all_docs
            if d.get("uploader_id") == uploader_id
            or d.get("visibility") == "public_academic"
            or (
                d.get("uploader_role") == "faculty"
                and d.get("visibility") not in ("private_faculty", "private_admin")
            )
        ]
    else:
        filtered = [
            d for d in all_docs
            if (d.get("uploader_id") == uploader_id and uploader_id)
            or d.get("visibility") == "public_academic"
        ]
        filtered = [
            d for d in filtered
            if not (
                d.get("uploader_role") == "student"
                and d.get("uploader_id") != uploader_id
            )
        ]

    return ok({"documents": filtered, "count": len(filtered)})


# ---- Document detail + AI output ----

@app.get("/api/documents/{doc_id}", tags=["Documents"])
async def get_document(doc_id: str):
    """Return metadata and AI output for a single document."""
    with get_db() as conn:
        doc = conn.execute(
            "SELECT * FROM documents WHERE id = ?", (doc_id,)
        ).fetchone()
        if not doc:
            return err(f"Document '{doc_id}' not found.", 404)

        ai_out = conn.execute(
            "SELECT * FROM ai_outputs WHERE document_id = ?", (doc_id,)
        ).fetchone()

    result: dict = dict(doc)
    result["aiOutput"] = None

    if ai_out:
        result["aiOutput"] = {
            "summary":    ai_out["summary"],
            "flashcards": json.loads(ai_out["flashcards"]),
            "quiz":       json.loads(ai_out["quiz"]),
            "glossary":   json.loads(ai_out["glossary"] or "[]"),
            "createdAt":  ai_out["created_at"],
        }
    result["difficulty"]          = result.get("difficulty", "")
    result["difficultyRationale"] = result.get("difficulty_rationale", "")

    return ok(result)

@app.delete("/api/documents/{doc_id}", tags=["Documents"])
async def delete_document(doc_id: str):
    """Delete a document and its AI output from the database and disk."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT safe_filename FROM documents WHERE id = ?", (doc_id,)
        ).fetchone()
        if not row:
            return err(f"Document '{doc_id}' not found.", 404)

        # Remove file from disk
        file_path = UPLOAD_DIR / row["safe_filename"]
        if file_path.exists():
            file_path.unlink()
            log.info("Deleted file: %s", file_path)

        conn.execute("DELETE FROM quiz_attempts WHERE document_id = ?", (doc_id,))
        conn.execute("DELETE FROM ai_outputs    WHERE document_id = ?", (doc_id,))
        conn.execute("DELETE FROM documents     WHERE id = ?",          (doc_id,))

    return ok({}, f"Document '{doc_id}' deleted successfully.")


# ---- Admin Stats ----

@app.get("/api/admin/stats", tags=["Admin"])
async def admin_stats():
    """Return aggregate statistics for the admin dashboard."""
    with get_db() as conn:
        total_files    = conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
        total_subjects = conn.execute(
            "SELECT COUNT(DISTINCT subject) FROM documents"
        ).fetchone()[0]
        ai_runs        = conn.execute(
            "SELECT COUNT(*) FROM documents WHERE ai_status = 'summarized'"
        ).fetchone()[0]
        pending        = conn.execute(
            "SELECT COUNT(*) FROM documents WHERE ai_status = 'pending'"
        ).fetchone()[0]

        # Per-subject breakdown
        subject_rows = conn.execute(
            "SELECT subject, COUNT(*) as cnt FROM documents GROUP BY subject"
        ).fetchall()

    role_rows = conn.execute(
            "SELECT uploader_role, COUNT(*) as cnt FROM documents GROUP BY uploader_role"
        ).fetchall()

    subject_breakdown = {r["subject"]: r["cnt"] for r in subject_rows}
    role_breakdown = {(r["uploader_role"] or "unknown"): r["cnt"] for r in role_rows}

    return ok({
        "totalFiles":        total_files,
        "totalSubjects":     total_subjects,
        "aiRuns":            ai_runs,
        "pendingDocuments":  pending,
        "subjectBreakdown":  subject_breakdown,
        "roleBreakdown":     role_breakdown,
    })

# ---- Admin: list all documents ----

@app.get("/api/admin/documents", tags=["Admin"])
async def admin_list_documents(
    page:     int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
):
    """Paginated full document list for the admin file management table."""
    offset = (page - 1) * per_page

    with get_db() as conn:
        total = conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
        rows  = conn.execute(
            "SELECT * FROM documents ORDER BY uploaded_at DESC LIMIT ? OFFSET ?",
            (per_page, offset),
        ).fetchall()

    return ok({
        "documents": [dict(r) for r in rows],
        "total":     total,
        "page":      page,
        "perPage":   per_page,
        "totalPages": (total + per_page - 1) // per_page,
    })


# ============================================================
# ENTRYPOINT
# ============================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,          # keep False - reload=True restarts the server when
                               # acadres.db is written after AI output is saved,
                               # which drops the in-flight summarize fetch and
                               # causes the browser to reload the page.
                               # Run with: uvicorn main:app --reload  only for
                               # pure code changes during dev, never during AI use.
        log_level="info",
    )