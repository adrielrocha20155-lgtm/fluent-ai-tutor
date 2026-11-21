import json
import os
import sqlite3
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

DB_PATH = os.getenv("LEARNING_DB_PATH", os.path.join("data", "learning.db"))


def _get_connection() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create database tables and migrate missing columns if needed."""
    with _get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_profile (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                current_level TEXT NOT NULL DEFAULT 'A2',
                estimated_level TEXT NOT NULL DEFAULT 'A2',
                estimated_subscore INTEGER NOT NULL DEFAULT 25,
                level_reasoning TEXT NOT NULL DEFAULT '',
                native_language TEXT NOT NULL DEFAULT 'Portuguese',
                updated_at TEXT NOT NULL
            )
            """
        )
        profile_cols = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(user_profile)").fetchall()
        }
        if "estimated_level" not in profile_cols:
            conn.execute("ALTER TABLE user_profile ADD COLUMN estimated_level TEXT NOT NULL DEFAULT 'A2'")
        if "estimated_subscore" not in profile_cols:
            conn.execute("ALTER TABLE user_profile ADD COLUMN estimated_subscore INTEGER NOT NULL DEFAULT 25")
        if "level_reasoning" not in profile_cols:
            conn.execute("ALTER TABLE user_profile ADD COLUMN level_reasoning TEXT NOT NULL DEFAULT ''")

        conn.execute(
            """
            INSERT OR IGNORE INTO user_profile (id, current_level, estimated_level, estimated_subscore, level_reasoning, native_language, updated_at)
            VALUES (1, 'A2', 'A2', 25, '', 'Portuguese', ?)
            """,
            (datetime.now(timezone.utc).isoformat(),),
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS lesson_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                lesson_id TEXT NOT NULL,
                level TEXT NOT NULL,
                title TEXT NOT NULL,
                topic TEXT DEFAULT '',
                grammar_focus TEXT DEFAULT '',
                mode TEXT DEFAULT 'preply_tutor',
                score INTEGER NOT NULL,
                estimated_cefr TEXT DEFAULT '',
                cefr_score_0_100 INTEGER DEFAULT 0,
                level_reasoning TEXT DEFAULT '',
                went_well TEXT NOT NULL,
                needs_work TEXT NOT NULL,
                weak_areas TEXT NOT NULL,
                homework TEXT DEFAULT '',
                summary_note TEXT DEFAULT '',
                transcript_summary TEXT DEFAULT '',
                duration_seconds INTEGER DEFAULT 0
            )
            """
        )
        existing_cols = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(lesson_logs)").fetchall()
        }
        if "homework" not in existing_cols:
            conn.execute("ALTER TABLE lesson_logs ADD COLUMN homework TEXT DEFAULT ''")
        if "transcript_summary" not in existing_cols:
            conn.execute("ALTER TABLE lesson_logs ADD COLUMN transcript_summary TEXT DEFAULT ''")
        if "estimated_cefr" not in existing_cols:
            conn.execute("ALTER TABLE lesson_logs ADD COLUMN estimated_cefr TEXT DEFAULT ''")
        if "cefr_score_0_100" not in existing_cols:
            conn.execute("ALTER TABLE lesson_logs ADD COLUMN cefr_score_0_100 INTEGER DEFAULT 0")
        if "level_reasoning" not in existing_cols:
            conn.execute("ALTER TABLE lesson_logs ADD COLUMN level_reasoning TEXT DEFAULT ''")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS flashcards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                source_lesson_id TEXT DEFAULT '',
                weak_area TEXT DEFAULT 'general',
                category TEXT DEFAULT 'Grammar',
                front TEXT NOT NULL,
                back_answer TEXT NOT NULL,
                back_explanation TEXT DEFAULT '',
                repetitions INTEGER NOT NULL DEFAULT 0,
                interval_days INTEGER NOT NULL DEFAULT 0,
                ease_factor REAL NOT NULL DEFAULT 2.5,
                next_review_at TEXT NOT NULL,
                last_reviewed_at TEXT DEFAULT ''
            )
            """
        )
        conn.commit()


def log_lesson(
    lesson_id: str,
    level: str,
    title: str,
    score: int,
    went_well: List[str],
    needs_work: List[Any],
    weak_areas: List[str],
    topic: str = "",
    grammar_focus: str = "",
    mode: str = "preply_tutor",
    homework: str = "",
    summary_note: str = "",
    transcript_summary: str = "",
    duration_seconds: int = 0,
    estimated_cefr: str = "",
    cefr_score_0_100: int = 0,
    level_reasoning: str = "",
) -> Dict[str, Any]:
    """Persist a completed lesson feedback log and update AI-estimated CEFR level."""
    init_db()
    created_at = datetime.now(timezone.utc).isoformat()
    normalized_areas = [
        a.strip().lower().replace(" ", "-") for a in weak_areas if a and a.strip()
    ]

    with _get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO lesson_logs (
                created_at, lesson_id, level, title, topic, grammar_focus,
                mode, score, estimated_cefr, cefr_score_0_100, level_reasoning,
                went_well, needs_work, weak_areas,
                homework, summary_note, transcript_summary, duration_seconds
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                created_at,
                lesson_id,
                level,
                title,
                topic,
                grammar_focus,
                mode,
                int(score),
                estimated_cefr,
                int(cefr_score_0_100 or 0),
                level_reasoning,
                json.dumps(went_well, ensure_ascii=False),
                json.dumps(needs_work, ensure_ascii=False),
                json.dumps(normalized_areas, ensure_ascii=False),
                homework,
                summary_note,
                transcript_summary,
                int(duration_seconds or 0),
            ),
        )
        if estimated_cefr:
            conn.execute(
                """
                UPDATE user_profile
                SET estimated_level = ?, estimated_subscore = ?, level_reasoning = ?, updated_at = ?
                WHERE id = 1
                """,
                (estimated_cefr, int(cefr_score_0_100 or 25), level_reasoning, created_at),
            )
        conn.commit()
        row_id = cursor.lastrowid

    return {
        "id": row_id,
        "created_at": created_at,
        "lesson_id": lesson_id,
        "level": level,
        "title": title,
        "topic": topic,
        "grammar_focus": grammar_focus,
        "mode": mode,
        "score": int(score),
        "estimated_cefr": estimated_cefr,
        "cefr_score_0_100": int(cefr_score_0_100 or 0),
        "level_reasoning": level_reasoning,
        "went_well": went_well,
        "needs_work": needs_work,
        "weak_areas": normalized_areas,
        "homework": homework,
        "summary_note": summary_note,
        "transcript_summary": transcript_summary,
        "duration_seconds": int(duration_seconds or 0),
    }


def update_lesson_evaluation(
    row_id: int,
    score: int,
    went_well: List[str],
    needs_work: List[Any],
    weak_areas: List[str],
    homework: str,
    summary_note: str,
    estimated_cefr: str,
    cefr_score_0_100: int,
    level_reasoning: str,
) -> None:
    """Update an existing lesson log with refined AI evaluation."""
    init_db()
    normalized_areas = [
        a.strip().lower().replace(" ", "-") for a in weak_areas if a and a.strip()
    ]
    now = datetime.now(timezone.utc).isoformat()
    with _get_connection() as conn:
        conn.execute(
            """
            UPDATE lesson_logs
            SET score = ?, went_well = ?, needs_work = ?, weak_areas = ?,
                homework = ?, summary_note = ?, estimated_cefr = ?,
                cefr_score_0_100 = ?, level_reasoning = ?
            WHERE id = ?
            """,
            (
                int(score),
                json.dumps(went_well, ensure_ascii=False),
                json.dumps(needs_work, ensure_ascii=False),
                json.dumps(normalized_areas, ensure_ascii=False),
                homework,
                summary_note,
                estimated_cefr,
                int(cefr_score_0_100 or 0),
                level_reasoning,
                row_id,
            ),
        )
        if estimated_cefr:
            conn.execute(
                """
                UPDATE user_profile
                SET estimated_level = ?, estimated_subscore = ?, level_reasoning = ?, updated_at = ?
                WHERE id = 1
                """,
                (estimated_cefr, int(cefr_score_0_100 or 25), level_reasoning, now),
            )
        conn.commit()


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    keys = row.keys()
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "lesson_id": row["lesson_id"],
        "level": row["level"],
        "title": row["title"],
        "topic": row["topic"],
        "grammar_focus": row["grammar_focus"],
        "mode": row["mode"],
        "score": row["score"],
        "estimated_cefr": row["estimated_cefr"] if "estimated_cefr" in keys else "",
        "cefr_score_0_100": row["cefr_score_0_100"] if "cefr_score_0_100" in keys else 0,
        "level_reasoning": row["level_reasoning"] if "level_reasoning" in keys else "",
        "went_well": json.loads(row["went_well"] or "[]"),
        "needs_work": json.loads(row["needs_work"] or "[]"),
        "weak_areas": json.loads(row["weak_areas"] or "[]"),
        "homework": row["homework"] or "",
        "summary_note": row["summary_note"] or "",
        "transcript_summary": row["transcript_summary"] or "",
        "duration_seconds": row["duration_seconds"] or 0,
    }


def get_lesson_history(limit: int = 50) -> List[Dict[str, Any]]:
    """Return recent lesson logs ordered newest first."""
    init_db()
    with _get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM lesson_logs ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def set_current_level(level: str) -> None:
    """Update user's selected CEFR level."""
    init_db()
    with _get_connection() as conn:
        conn.execute(
            "UPDATE user_profile SET current_level = ?, updated_at = ? WHERE id = 1",
            (level, datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()


def _format_needs_work_item(item: Any) -> str:
    if isinstance(item, dict):
        cat = item.get("category", "General")
        quote = item.get("quote", "")
        corr = item.get("correction", "")
        if quote and corr:
            return f"[{cat}] \"{quote}\" -> \"{corr}\""
        return corr or quote or str(item)
    return str(item)


def get_learning_profile() -> Dict[str, Any]:
    """Aggregate student progress, AI-estimated CEFR level, and recurring difficulties."""
    init_db()
    with _get_connection() as conn:
        profile_row = conn.execute(
            "SELECT current_level, estimated_level, estimated_subscore, level_reasoning, native_language FROM user_profile WHERE id = 1"
        ).fetchone()
    current_level = profile_row["current_level"] if profile_row else "A2"
    estimated_level = profile_row["estimated_level"] if profile_row else "A2"
    estimated_subscore = profile_row["estimated_subscore"] if profile_row else 25
    level_reasoning = profile_row["level_reasoning"] if profile_row else ""

    history = get_lesson_history(limit=100)
    if not history:
        return {
            "current_level": current_level,
            "estimated_level": estimated_level,
            "estimated_subscore": estimated_subscore,
            "level_reasoning": level_reasoning,
            "total_lessons": 0,
            "completed_lesson_ids": [],
            "average_score": 0,
            "level_stats": {},
            "top_weak_areas": [],
            "recent_needs_work": [],
            "detailed_mistakes": [],
            "recent_went_well": [],
            "recent_homework": "",
        }

    weak_counter: Counter = Counter()
    level_scores: Dict[str, List[int]] = {}
    completed_ids = set()
    recent_needs_work: List[str] = []
    detailed_mistakes: List[Dict[str, Any]] = []
    recent_went_well: List[str] = []
    recent_homework = history[0].get("homework", "") if history else ""

    for idx, entry in enumerate(history):
        completed_ids.add(entry["lesson_id"])
        lvl = entry["level"]
        level_scores.setdefault(lvl, []).append(entry["score"])
        for area in entry["weak_areas"]:
            weak_counter[area] += 1
        if idx < 5:
            for nw in entry["needs_work"][:3]:
                recent_needs_work.append(_format_needs_work_item(nw))
                if isinstance(nw, dict):
                    detailed_mistakes.append(nw)
            for ww in entry["went_well"][:2]:
                recent_went_well.append(str(ww))

    level_stats = {
        lvl: {
            "count": len(scores),
            "avg_score": round(sum(scores) / len(scores), 2),
        }
        for lvl, scores in level_scores.items()
    }

    all_scores = [e["score"] for e in history]
    top_weak_areas = [
        {"area": area, "count": count}
        for area, count in weak_counter.most_common(8)
    ]

    return {
        "current_level": current_level,
        "estimated_level": estimated_level,
        "estimated_subscore": estimated_subscore,
        "level_reasoning": level_reasoning,
        "total_lessons": len(history),
        "completed_lesson_ids": sorted(completed_ids),
        "average_score": round(sum(all_scores) / len(all_scores), 2),
        "level_stats": level_stats,
        "top_weak_areas": top_weak_areas,
        "recent_needs_work": recent_needs_work[:6],
        "detailed_mistakes": detailed_mistakes[:6],
        "recent_went_well": recent_went_well[:4],
        "recent_homework": recent_homework,
    }


def get_all_mistakes_and_weak_areas(limit_lessons: int = 50) -> Dict[str, Any]:
    """Collect all mistakes, weak areas, and transcript excerpts across all logged lessons."""
    history = get_lesson_history(limit=limit_lessons)
    all_mistakes: List[Any] = []
    all_weak_areas: List[str] = []
    transcript_excerpts: List[str] = []

    for entry in history:
        for nw in entry.get("needs_work", []):
            all_mistakes.append(nw)
        for wa in entry.get("weak_areas", []):
            if wa not in all_weak_areas:
                all_weak_areas.append(wa)
        if entry.get("transcript_summary"):
            transcript_excerpts.append(
                f"[{entry.get('level', '')} - {entry.get('title', '')}]: {entry['transcript_summary'][:500]}"
            )

    return {
        "mistakes": all_mistakes,
        "weak_areas": all_weak_areas,
        "transcript_excerpts": transcript_excerpts[:6],
    }


def add_flashcards(cards: List[Dict[str, Any]], source_lesson_id: str = "") -> List[Dict[str, Any]]:
    """Insert new AI-generated flashcards, avoiding duplicate fronts or duplicate answers."""
    init_db()
    now = datetime.now(timezone.utc).isoformat()
    inserted = []

    with _get_connection() as conn:
        rows = conn.execute("SELECT front, back_answer FROM flashcards").fetchall()
        existing_fronts = {row["front"].strip().lower() for row in rows}
        existing_answers = {row["back_answer"].strip().lower() for row in rows}
        for c in cards:
            front = (c.get("front") or "").strip()
            back_answer = (c.get("back_answer") or "").strip()
            if (
                not front
                or not back_answer
                or front.lower() in existing_fronts
                or back_answer.lower() in existing_answers
            ):
                continue
            existing_fronts.add(front.lower())
            existing_answers.add(back_answer.lower())
            weak_area = (c.get("weak_area") or "general").strip().lower().replace(" ", "-")
            category = (c.get("category") or "Grammar").strip()
            back_explanation = (c.get("back_explanation") or "").strip()
            cursor = conn.execute(
                """
                INSERT INTO flashcards (
                    created_at, source_lesson_id, weak_area, category,
                    front, back_answer, back_explanation,
                    repetitions, interval_days, ease_factor, next_review_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 2.5, ?)
                """,
                (now, source_lesson_id, weak_area, category, front, back_answer, back_explanation, now),
            )
            inserted.append({
                "id": cursor.lastrowid,
                "front": front,
                "back_answer": back_answer,
                "back_explanation": back_explanation,
                "weak_area": weak_area,
                "category": category,
            })
        conn.commit()
    return inserted


def get_due_flashcards(limit: int = 30) -> Dict[str, Any]:
    """Return flashcards due for spaced-repetition review plus overall stats."""
    init_db()
    now = datetime.now(timezone.utc).isoformat()
    with _get_connection() as conn:
        due_rows = conn.execute(
            """
            SELECT * FROM flashcards
            WHERE next_review_at <= ?
            ORDER BY interval_days ASC, id ASC
            LIMIT ?
            """,
            (now, limit),
        ).fetchall()
        total_count = conn.execute("SELECT COUNT(*) AS cnt FROM flashcards").fetchone()["cnt"]
        due_count = conn.execute(
            "SELECT COUNT(*) AS cnt FROM flashcards WHERE next_review_at <= ?", (now,)
        ).fetchone()["cnt"]
        mastered_count = conn.execute(
            "SELECT COUNT(*) AS cnt FROM flashcards WHERE interval_days >= 7"
        ).fetchone()["cnt"]

    return {
        "due_cards": [dict(r) for r in due_rows],
        "total_cards": total_count,
        "due_count": due_count,
        "mastered_count": mastered_count,
    }


def review_flashcard(card_id: int, rating: str) -> Dict[str, Any]:
    """Apply Anki-style SM-2 spaced repetition update to a flashcard."""
    init_db()
    quality_map = {"again": 1, "hard": 3, "good": 4, "easy": 5}
    q = quality_map.get(rating.lower(), 4)
    now_dt = datetime.now(timezone.utc)

    with _get_connection() as conn:
        row = conn.execute("SELECT * FROM flashcards WHERE id = ?", (card_id,)).fetchone()
        if not row:
            return {"error": "Flashcard not found"}

        reps = row["repetitions"]
        interval = row["interval_days"]
        ef = row["ease_factor"]

        if q < 3:
            reps = 0
            interval = 0
            next_dt = now_dt + timedelta(minutes=1)
        else:
            if reps == 0:
                interval = 1 if q < 5 else 4
            elif reps == 1:
                interval = 6 if q >= 4 else 3
            else:
                multiplier = 1.3 if q == 5 else (1.0 if q == 4 else 0.8)
                interval = max(1, round(interval * ef * multiplier))
            reps += 1
            ef = max(1.3, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
            next_dt = now_dt + timedelta(days=interval)

        conn.execute(
            """
            UPDATE flashcards
            SET repetitions = ?, interval_days = ?, ease_factor = ?,
                next_review_at = ?, last_reviewed_at = ?
            WHERE id = ?
            """,
            (reps, interval, round(ef, 2), next_dt.isoformat(), now_dt.isoformat(), card_id),
        )
        conn.commit()
        updated = dict(conn.execute("SELECT * FROM flashcards WHERE id = ?", (card_id,)).fetchone())

    return updated
