# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import base64
import asyncio
import json
import os
import logging
import time
import uuid
import requests
from typing import Dict, Optional, List, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException, Depends
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from dotenv import load_dotenv
from server.recaptcha_validator import RecaptchaValidator
from server.gemini_live import GeminiLive
from server.fingerprint import generate_fingerprint
from server.simple_tracker import simpletrack
from server.config_utils import get_project_id
from server.db import (
    init_db,
    log_lesson,
    get_lesson_history,
    get_learning_profile,
    set_current_level,
    add_flashcards,
    get_due_flashcards,
    review_flashcard,
    get_all_mistakes_and_weak_areas,
)


# Rate Limiting
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

import redis

# Load environment variables
load_dotenv(override=True)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Configuration
PROJECT_ID = get_project_id()
LOCATION = os.getenv("LOCATION", "us-central1")
MODEL = os.getenv("MODEL", "gemini-live-2.5-flash-native-audio")
# Use a generous timeout for 1-on-1 lessons (15 minutes)
SESSION_TIME_LIMIT = int(os.getenv("SESSION_TIME_LIMIT", "900"))
RECAPTCHA_SITE_KEY = os.getenv("RECAPTCHA_SITE_KEY")
RECAPTCHA_SCORE_THRESHOLD = float(os.getenv("RECAPTCHA_SCORE_THRESHOLD", "0.5"))
REDIS_URL = os.getenv("REDIS_URL")
GLOBAL_RATE_LIMIT = os.getenv("GLOBAL_RATE_LIMIT", "1000 per hour")
PER_USER_RATE_LIMIT = os.getenv("PER_USER_RATE_LIMIT", "2 per minute")
DEV_MODE = os.getenv("DEV_MODE", "true") == "true"

# Initialize FastAPI
app = FastAPI()

# Initialize Recaptcha Validator
recaptcha_validator = RecaptchaValidator(
    project_id=PROJECT_ID,
    recaptcha_key=RECAPTCHA_SITE_KEY or "",
    score_threshold=RECAPTCHA_SCORE_THRESHOLD
)

def get_fingerprint_key(request: Request):
    return generate_fingerprint(request)

def get_global_key(request: Request):
    return "global"

# Initialize Rate Limiter
if DEV_MODE:
    logger.info("🔧 DEV_MODE enabled: Rate limiting disabled (using memory storage)")
    limiter = Limiter(key_func=get_global_key) # Defaults to memory
elif not REDIS_URL:
    logger.warning("⚠️ REDIS_URL not set: Using memory storage for rate limiting (not suitable for multi-instance)")
    limiter = Limiter(key_func=get_fingerprint_key)
else:
    limiter = Limiter(key_func=get_fingerprint_key, storage_uri=REDIS_URL)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.on_event("startup")
async def startup_event():
    """Initialize SQLite DB and test Redis connection on startup."""
    init_db()
    logger.info("✅ SQLite learning database initialized")
    if REDIS_URL and not DEV_MODE:
        try:
            logger.info(f"Testing Redis connection to: {REDIS_URL.split('@')[-1] if '@' in REDIS_URL else REDIS_URL}")
            
            r = redis.from_url(REDIS_URL)
            r.ping()
            logger.info("✅ Redis connection successful")
        except Exception as e:
            logger.error(f"❌ Redis connection failed: {e}")
            logger.error("Ensure Cloud Run is configured with a VPC Connector if using a private IP.")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files
# app.mount("/static", StaticFiles(directory="frontend"), name="static")

# Mount assets and other static directories from dist
if os.path.exists("dist/assets"):
    app.mount("/assets", StaticFiles(directory="dist/assets"), name="assets")
if os.path.exists("dist/audio-processors"):
    app.mount("/audio-processors", StaticFiles(directory="dist/audio-processors"), name="audio-processors")
# In-memory storage for valid session tokens (Token -> Timestamp)
valid_tokens: Dict[str, float] = {}
TOKEN_EXPIRY_SECONDS = 30

def cleanup_tokens():
    """Remove expired tokens."""
    current_time = time.time()
    expired = [token for token, ts in valid_tokens.items() if current_time - ts > TOKEN_EXPIRY_SECONDS]
    for token in expired:
        del valid_tokens[token]

@app.get("/api/status")
async def get_status():
    """Returns the current configuration mode (Simple vs Production)."""
    missing = []
    if not RECAPTCHA_SITE_KEY:
        missing.append("recaptcha")
    if not REDIS_URL:
        missing.append("redis")
    
    mode = "simple" if missing else "production"
    
    return {
        "mode": mode,
        "missing": missing
    }

class LessonLogPayload(BaseModel):
    lesson_id: str
    level: str
    title: str
    topic: str = ""
    grammar_focus: str = ""
    mode: str = "preply_tutor"
    score: int = Field(ge=1, le=5)
    estimated_cefr: str = ""
    cefr_score_0_100: int = 0
    level_reasoning: str = ""
    went_well: List[str] = Field(default_factory=list)
    needs_work: List[Any] = Field(default_factory=list)
    weak_areas: List[str] = Field(default_factory=list)
    homework: str = ""
    summary_note: str = ""
    transcript_summary: str = ""
    duration_seconds: int = 0


class LevelUpdatePayload(BaseModel):
    level: str


class FlashcardReviewPayload(BaseModel):
    rating: str = Field(pattern="^(again|hard|good|easy)$")


class EvaluateTranscriptPayload(BaseModel):
    lesson_id: str
    level: str
    title: str
    topic: str = ""
    grammar_focus: str = ""
    mode: str = "preply_tutor"
    native_language: str = "Portuguese"
    transcript: List[Dict[str, str]] = Field(default_factory=list)
    duration_seconds: int = 0


@app.get("/api/lessons/history")
async def api_lesson_history(limit: int = 50):
    """Return past lesson feedback logs and aggregated learning profile."""
    return {
        "history": get_lesson_history(limit=limit),
        "profile": get_learning_profile(),
    }


@app.get("/api/lessons/profile")
async def api_lesson_profile():
    """Return aggregated weakness profile for adaptive prompt injection."""
    return get_learning_profile()


@app.post("/api/lessons/profile/level")
async def api_set_level(payload: LevelUpdatePayload):
    """Update the student's current CEFR level."""
    set_current_level(payload.level)
    return {"status": "ok", "current_level": payload.level}


async def _generate_flashcards_from_mistakes(
    mistakes: List[Any],
    weak_areas: List[str],
    level: str = "A2",
    native_language: str = "Portuguese",
    source_lesson_id: str = "",
    transcript_excerpts: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """Generate Anki-style active-recall flashcards from all mistakes/transcripts, avoiding existing cards."""
    if not mistakes and not weak_areas:
        return []

    import google.genai as genai
    from google.genai import types

    with_existing = get_due_flashcards(limit=100)
    # Also fetch all cards (including non-due) via db if needed, or due_cards
    existing_summary = [
        f"- {c['front']} => {c['back_answer']}"
        for c in with_existing.get("due_cards", [])[:30]
    ]
    existing_block = "\n".join(existing_summary) if existing_summary else "None yet."

    mistakes_text = json.dumps(mistakes, ensure_ascii=False)
    areas_text = ", ".join(weak_areas)
    excerpts_text = "\n".join(transcript_excerpts or [])

    prompt = f"""You are an expert Anki flashcard designer for an English learner (CEFR {level}, native language: {native_language}).
Create 4 to 5 NEW active-recall flashcards to test what they struggle with, drawing from ALL their recorded mistakes, weak areas, and transcript excerpts below.

All Recorded Mistakes: {mistakes_text}
Weak Areas: {areas_text}
Transcript Excerpts:
{excerpts_text}

ALREADY EXISTING FLASHCARDS (DO NOT DUPLICATE OR REPHRASE THESE):
{existing_block}

Rules:
- NEVER repeat or rephrase any of the existing flashcards above!
- Pick DIFFERENT mistakes from the list, OR create fresh new practice sentences/challenges targeting their weak areas (e.g., new sentences for prepositions, past simple, verb patterns, question formation).
- Each card's "front" MUST be an active-recall prompt in {native_language} or fill-in-the-blank in English.
- "back_answer": The exact natural English phrase/answer.
- "back_explanation": Concise 1-sentence explanation in {native_language}.
- "category": "Grammar", "Vocabulary/Phrasing", or "Pronunciation/Fluency".
- "weak_area": short kebab-case tag.

Return a JSON array of objects with keys: "front", "back_answer", "back_explanation", "category", "weak_area"."""

    api_key = os.getenv("GEMINI_API_KEY")
    http_opts = types.HttpOptions(timeout=10000)
    client = (
        genai.Client(api_key=api_key, http_options=http_opts)
        if api_key and api_key != "your-api-key"
        else genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION, http_options=http_opts)
    )

    cards_data = None
    for model_name in ["gemini-flash-lite-latest", os.getenv("EVAL_MODEL", "gemini-3.5-flash")]:
        try:
            resp = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.3,
                    ),
                ),
                timeout=10.0,
            )
            parsed = json.loads(resp.text)
            if isinstance(parsed, list) and parsed:
                cards_data = parsed
                break
        except Exception as e:
            logger.warning(f"Flashcard generation with {model_name} failed: {e}")

    if not cards_data:
        cards_data = []
        for idx, m in enumerate(mistakes):
            if isinstance(m, dict) and m.get("quote") and m.get("correction"):
                cards_data.append({
                    "front": f"Corrija para o inglês natural: \"{m['quote']}\"",
                    "back_answer": m["correction"],
                    "back_explanation": m.get("explanation", ""),
                    "category": m.get("category", "Grammar"),
                    "weak_area": weak_areas[idx % len(weak_areas)] if weak_areas else "general",
                })

    return add_flashcards(cards_data, source_lesson_id=source_lesson_id)


@app.get("/api/flashcards/due")
async def api_get_due_flashcards(limit: int = 30):
    """Return due flashcards and spaced-repetition stats."""
    return get_due_flashcards(limit=limit)


@app.post("/api/flashcards/generate")
async def api_generate_flashcards():
    """Generate NEW non-duplicate flashcards from all lesson mistakes and transcripts in SQLite."""
    profile = get_learning_profile()
    all_data = get_all_mistakes_and_weak_areas(limit_lessons=50)
    created = await _generate_flashcards_from_mistakes(
        mistakes=all_data.get("mistakes", []),
        weak_areas=all_data.get("weak_areas", []),
        level=profile.get("estimated_level", "A2"),
        native_language="Portuguese",
        source_lesson_id="history-sync",
        transcript_excerpts=all_data.get("transcript_excerpts", []),
    )
    due_info = get_due_flashcards()
    return {"status": "ok", "created_count": len(created), **due_info}


@app.post("/api/flashcards/{card_id}/review")
async def api_review_flashcard(card_id: int, payload: FlashcardReviewPayload):
    """Record an Anki-style SM-2 review rating for a flashcard."""
    updated = review_flashcard(card_id, payload.rating)
    if "error" in updated:
        raise HTTPException(status_code=404, detail=updated["error"])
    return {"status": "ok", "card": updated, **get_due_flashcards()}


@app.post("/api/lessons/log")
async def api_log_lesson(payload: LessonLogPayload):
    """Save a structured post-lesson feedback log to SQLite."""
    record = log_lesson(
        lesson_id=payload.lesson_id,
        level=payload.level,
        title=payload.title,
        topic=payload.topic,
        grammar_focus=payload.grammar_focus,
        mode=payload.mode,
        score=payload.score,
        estimated_cefr=payload.estimated_cefr,
        cefr_score_0_100=payload.cefr_score_0_100,
        level_reasoning=payload.level_reasoning,
        went_well=payload.went_well,
        needs_work=payload.needs_work,
        weak_areas=payload.weak_areas,
        homework=payload.homework,
        summary_note=payload.summary_note,
        transcript_summary=payload.transcript_summary,
        duration_seconds=payload.duration_seconds,
    )
    await _generate_flashcards_from_mistakes(
        mistakes=payload.needs_work,
        weak_areas=payload.weak_areas,
        level=payload.level,
        native_language="Portuguese",
        source_lesson_id=payload.lesson_id,
    )
    await _generate_flashcards_from_mistakes(
        mistakes=data.get("needs_work", []),
        weak_areas=data.get("weak_areas", []),
        level=data.get("estimated_cefr", prev_profile.get("estimated_level", "A2")),
        native_language=payload.native_language,
        source_lesson_id=payload.lesson_id,
    )
    return {"status": "ok", "record": record, "profile": get_learning_profile()}


@app.post("/api/lessons/evaluate")
async def api_evaluate_lesson(payload: EvaluateTranscriptPayload):
    """Generate a structured post-lesson evaluation from transcript and save it."""
    import google.genai as genai
    from google.genai import types

    transcript_text = "\n".join(
        f"{item.get('speaker', 'User')}: {item.get('text', '')}"
        for item in payload.transcript
        if item.get("text", "").strip()
    )

    if not transcript_text.strip():
        record = log_lesson(
            lesson_id=payload.lesson_id,
            level=payload.level,
            title=payload.title,
            topic=payload.topic,
            grammar_focus=payload.grammar_focus,
            mode=payload.mode,
            score=3,
            went_well=["Started the speaking session and practiced live interaction."],
            needs_work=[
                {
                    "category": "Fluency",
                    "quote": "(Short session)",
                    "correction": "Try speaking at least 4-5 full sentences in your next session.",
                    "explanation": "Longer turns help your tutor evaluate grammar and pronunciation.",
                }
            ],
            weak_areas=["fluency-hesitation"],
            homework="Practice 5 sentences aloud using today's target structure.",
            summary_note="Session ended early before full evaluation.",
            transcript_summary="",
            duration_seconds=payload.duration_seconds,
        )
        await _generate_flashcards_from_mistakes(
        mistakes=payload.needs_work,
        weak_areas=payload.weak_areas,
        level=payload.level,
        native_language="Portuguese",
        source_lesson_id=payload.lesson_id,
    )
    await _generate_flashcards_from_mistakes(
        mistakes=data.get("needs_work", []),
        weak_areas=data.get("weak_areas", []),
        level=data.get("estimated_cefr", prev_profile.get("estimated_level", "A2")),
        native_language=payload.native_language,
        source_lesson_id=payload.lesson_id,
    )
    return {"status": "ok", "record": record, "profile": get_learning_profile()}

    prev_profile = get_learning_profile()
    prompt = f"""You are an expert Preply English tutor evaluating a 1-on-1 speaking lesson.
Lesson: {payload.title} (Target CEFR Level: {payload.level})
Grammar Focus: {payload.grammar_focus}
Topic: {payload.topic}
Student Native Language: {payload.native_language}
Previous AI-Estimated CEFR Level: {prev_profile.get('estimated_level', 'A2')} ({prev_profile.get('estimated_subscore', 25)}/100)
Previous Top Weak Areas: {', '.join(w['area'] for w in prev_profile.get('top_weak_areas', []))}

Transcript:
{transcript_text}

IMPORTANT STT / ASR EVALUATION RULE (PAST SIMPLE -ed & PHONETIC NEAR-HOMOPHONES):
- Live speech-to-text (STT) frequently drops unstressed word-final '-ed' sounds (/t/, /d/, /ɪd/), transcribing e.g. "cooked" as "cook" or "worked" as "work", and occasionally mishears acoustically similar words (e.g. "cook" -> "took", "cold" -> "code", "farofa" -> "favorable").
- If the surrounding temporal context is clearly in the past (e.g., "yesterday", "last weekend", "on Sunday", or other past verbs like "went", "was", "did" in the same story), DO NOT penalize a missing '-ed' in the transcript as a definite grammar mistake!
- Similarly, if a single word looks like a bizarre/illogical verb choice that is acoustically 1 consonant away from a logical word in context (e.g. "didn't took" when talking about cooking -> likely "didn't cook"), do NOT flag it as a grammar error.
- Focus grammar corrections on unambiguous errors (e.g., wrong verb choice "make questions", missing subject "is a holiday", wrong word order). You may mention '-ed' pronunciation only as a gentle reminder if helpful.

Return a JSON object with:
- "score": integer 1 to 5 (1=needs heavy support, 3=solid for level, 5=mastered)
- "estimated_cefr": string, your updated estimate of the student's true spoken English level ("A1", "A2", "B1", "B2", "C1", or "C2") based on grammar accuracy, vocabulary range, and fluency in this transcript + previous profile
- "cefr_score_0_100": integer 0 to 100 on the CEFR proficiency scale (A1: 1-16, A2: 17-33, B1: 34-50, B2: 51-67, C1: 68-84, C2: 85-100)
- "level_reasoning": 1-2 sentences in {payload.native_language} explaining why you estimate this CEFR level right now
- "went_well": array of 2-3 specific compliments quoting good phrases/grammar the student used (in {payload.native_language}, quoting English phrases)
- "needs_work": array of 2-4 objects, each with:
  - "category": one of "Grammar", "Vocabulary/Phrasing", "Pronunciation/Fluency"
  - "quote": exact quote of what the student said
  - "correction": natural corrected English version
  - "explanation": short friendly explanation in {payload.native_language}
- "weak_areas": array of 2-4 short lowercase kebab-case tags (e.g. "subject-verb-agreement", "past-simple-did", "prepositions-in-on-at", "article-usage", "question-formation")
- "homework": 1 actionable 5-minute practice task for before the next lesson (in {payload.native_language})
- "summary_note": 1-2 sentence encouraging wrap-up and focus for next class (in {payload.native_language})
"""

    api_key = os.getenv("GEMINI_API_KEY")
    http_opts = types.HttpOptions(timeout=12000)
    if api_key and api_key != "your-api-key":
        client = genai.Client(api_key=api_key, http_options=http_opts)
    else:
        client = genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION, http_options=http_opts)

    eval_models = [
        os.getenv("EVAL_MODEL", "gemini-3.5-flash"),
        "gemini-flash-lite-latest",
        "gemini-3.8-flash",
    ]
    data = None
    last_err = None
    for eval_model in eval_models:
        try:
            resp = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=eval_model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.3,
                    ),
                ),
                timeout=12.0,
            )
            data = json.loads(resp.text)
            break
        except Exception as e:
            last_err = e
            logger.warning(f"Evaluation with {eval_model} failed/timed out: {e}")

    if data is None:
        logger.error(f"All evaluation models failed: {last_err}")
        data = {
            "score": 3,
            "estimated_cefr": prev_profile.get("estimated_level", "A2"),
            "cefr_score_0_100": prev_profile.get("estimated_subscore", 25),
            "level_reasoning": "Avaliação automática temporariamente indisponível; nível mantido com base no histórico.",
            "went_well": ["Participou ativamente da aula de conversação em inglês."],
            "needs_work": [
                {
                    "category": "Grammar",
                    "quote": "Transcrição salva para revisão",
                    "correction": "Continue praticando frases completas com o foco da aula.",
                    "explanation": f"Foco recomendado: {payload.grammar_focus or payload.title}.",
                }
            ],
            "weak_areas": ["fluency-practice"],
            "homework": f"Revisar as expressões-chave de: {payload.title}.",
            "summary_note": "Boa prática! A transcrição foi salva no seu histórico.",
        }

    record = log_lesson(
        lesson_id=payload.lesson_id,
        level=payload.level,
        title=payload.title,
        topic=payload.topic,
        grammar_focus=payload.grammar_focus,
        mode=payload.mode,
        score=max(1, min(5, int(data.get("score", 3)))),
        estimated_cefr=data.get("estimated_cefr", prev_profile.get("estimated_level", "A2")),
        cefr_score_0_100=int(data.get("cefr_score_0_100", prev_profile.get("estimated_subscore", 25)) or 25),
        level_reasoning=data.get("level_reasoning", ""),
        went_well=data.get("went_well", []),
        needs_work=data.get("needs_work", []),
        weak_areas=data.get("weak_areas", []),
        homework=data.get("homework", ""),
        summary_note=data.get("summary_note", ""),
        transcript_summary=transcript_text[:2000],
        duration_seconds=payload.duration_seconds,
    )
    await _generate_flashcards_from_mistakes(
        mistakes=payload.needs_work,
        weak_areas=payload.weak_areas,
        level=payload.level,
        native_language="Portuguese",
        source_lesson_id=payload.lesson_id,
    )
    await _generate_flashcards_from_mistakes(
        mistakes=data.get("needs_work", []),
        weak_areas=data.get("weak_areas", []),
        level=data.get("estimated_cefr", prev_profile.get("estimated_level", "A2")),
        native_language=payload.native_language,
        source_lesson_id=payload.lesson_id,
    )
    return {"status": "ok", "record": record, "profile": get_learning_profile()}


@app.get("/{full_path:path}")
@simpletrack("page_view")
async def serve_spa(full_path: str):
    dist_dir = os.path.realpath("dist")
    file_path = os.path.realpath(os.path.join(dist_dir, full_path))
    if full_path and file_path.startswith(dist_dir + os.sep) and os.path.isfile(file_path):
        return FileResponse(file_path)

    return FileResponse("dist/index.html")

@app.post("/api/auth")
@simpletrack("session_start")
@limiter.limit(GLOBAL_RATE_LIMIT, key_func=get_global_key)
@limiter.limit(PER_USER_RATE_LIMIT, key_func=get_fingerprint_key)
async def authenticate(request: Request):
    """
    Validates ReCAPTCHA and issues a temporary session token for WebSocket connection.
    """
    try:
        data = await request.json()
        recaptcha_token = data.get("recaptcha_token")
        
        # Check if ReCAPTCHA is configured
        if not RECAPTCHA_SITE_KEY:
             logger.warning("⚠️ RECAPTCHA_SITE_KEY not set: Skipping validation (Simple Mode)")
             # Proceed without validation
        else:
            if not recaptcha_token:
                raise HTTPException(status_code=400, detail="Missing ReCAPTCHA token")

            if DEV_MODE:
                logger.info("🔧 DEV_MODE enabled: Skipping ReCAPTCHA validation")
                validation_result = {'valid': True, 'passes_threshold': True}
            else:
                validation_result = recaptcha_validator.validate_token(
                    token=recaptcha_token,
                    recaptcha_action="LOGIN"
                )
            
            if not validation_result['valid']:
                logger.warning(f"ReCAPTCHA failed: {validation_result.get('error')}")
                raise HTTPException(status_code=403, detail="ReCAPTCHA validation failed")
                
            if not validation_result['passes_threshold']:
                logger.warning(f"ReCAPTCHA score too low: {validation_result.get('score')}")
                raise HTTPException(status_code=403, detail="ReCAPTCHA score too low")

        session_token = str(uuid.uuid4())
        cleanup_tokens()
        valid_tokens[session_token] = time.time()
        
        return {"session_token": session_token, "session_time_limit": SESSION_TIME_LIMIT}
        
    except Exception as e:
        logger.error(f"Auth error: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail="Internal server error")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: Optional[str] = None):
    """
    WebSocket endpoint for Gemini Live.
    Requires a valid session token generated via /api/auth.
    """
    await websocket.accept()
    
    # Validate Token
    if not token or token not in valid_tokens:
        logger.warning("Invalid or missing session token")
        await websocket.close(code=4003, reason="Unauthorized")
        return
        
    # Remove token (one-time use)
    del valid_tokens[token]
    
    logger.info("WebSocket connection accepted and authenticated")

    # Wait for initial setup message
    setup_config = None
    try:
        # We expect the first message to be the setup JSON
        message = await websocket.receive_text()
        initial_data = json.loads(message)
        if "setup" in initial_data:
            setup_config = initial_data["setup"]
            logger.info("Received setup configuration from client")
    except Exception as e:
        logger.warning(f"Error receiving setup config: {e}")

    audio_input_queue = asyncio.Queue()
    video_input_queue = asyncio.Queue()
    text_input_queue = asyncio.Queue()

    async def audio_output_callback(data):
        await websocket.send_bytes(data)

    async def audio_interrupt_callback():
        # The event queue handles the JSON message, but we might want to do something else here
        pass

    gemini_client = GeminiLive(
        project_id=PROJECT_ID,
        location=LOCATION,
        model=MODEL,
        input_sample_rate=16000
    )

    async def receive_from_client():
        try:
            while True:
                message = await websocket.receive()
                
                if "bytes" in message and message["bytes"]:
                    await audio_input_queue.put(message["bytes"])
                elif "text" in message and message["text"]:
                    text = message["text"]
                    try:
                        payload = json.loads(text)
                        if isinstance(payload, dict) and payload.get("type") == "image":
                            # Handle base64 image
                            image_data = base64.b64decode(payload["data"])
                            await video_input_queue.put(image_data)
                            continue
                        elif isinstance(payload, dict) and "realtime_input" in payload:
                             # Forward realtime input (audio/video chunks)
                             # The SDK JS sends 'realtime_input' for generic media chunks
                             # For now we handle simpler case or adapt GeminiLive class
                             pass
                    except json.JSONDecodeError:
                        pass
                    
                    await text_input_queue.put(text)
        except WebSocketDisconnect:
            logger.info("WebSocket disconnected")
        except Exception as e:
            logger.error(f"Error receiving from client: {e}")

    receive_task = asyncio.create_task(receive_from_client())

    async def run_session():
        async for event in gemini_client.start_session(
            audio_input_queue=audio_input_queue,
            video_input_queue=video_input_queue,
            text_input_queue=text_input_queue,
            audio_output_callback=audio_output_callback,
            audio_interrupt_callback=audio_interrupt_callback,
            setup_config=setup_config
        ):
            if event:
                # Forward events (transcriptions, etc) to client
                await websocket.send_json(event)

    try:
        await asyncio.wait_for(run_session(), timeout=SESSION_TIME_LIMIT)
    except asyncio.TimeoutError:
        logger.info("Session time limit reached")
        await websocket.close(code=1000, reason="Session time limit reached")
    except Exception as e:
        logger.error(f"Error in Gemini session: {e}")
    finally:
        receive_task.cancel()
        # Ensure websocket is closed if not already
        try:
            await websocket.close()
        except:
            pass

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
