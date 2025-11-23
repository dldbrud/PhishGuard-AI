from datetime import datetime
import hashlib
from urllib.parse import urlparse, urlunparse
from typing import List, Optional

from db import get_connection


# --------------------------------------------------------
# URL 정규화
# --------------------------------------------------------
def normalize_url(url: str) -> str:
    p = urlparse(url)

    scheme = (p.scheme or "https").lower()
    netloc = p.netloc.lower()

    path = p.path or "/"
    if path != "/":
        path = path.rstrip("/")

    return urlunparse((scheme, netloc, path, "", "", ""))


# SHA256 해시
def _make_url_hash(normalized_url: str) -> bytes:
    return hashlib.sha256(normalized_url.encode("utf-8")).digest()


# --------------------------------------------------------
# user_id 생성
# --------------------------------------------------------
def _get_or_create_user_id(client_id: str) -> int:
    conn = get_connection()
    if not conn:
        raise Exception("[_get_or_create_user_id] DB 연결 실패")

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM users WHERE external_id=%s LIMIT 1",
                (client_id,),
            )
            row = cursor.fetchone()
            if row:
                return row["id"]

            cursor.execute(
                "INSERT INTO users (display_name, external_id, created_at) VALUES (%s,%s,%s)",
                ("", client_id, datetime.now()),
            )
            conn.commit()
            return conn.insert_id() if hasattr(conn, "insert_id") else cursor.lastrowid
    finally:
        conn.close()


# --------------------------------------------------------
# 🔥 전역 차단 등록 (AI 이유 + 추천 URL 저장)
# --------------------------------------------------------
def add_global_block(
    url: str,
    ai_reason: Optional[str] = None,
    suggested_url: Optional[str] = None
) -> bool:
    conn = get_connection()
    if not conn:
        print("[add_global_block] DB 연결 실패")
        return False

    normalized_url = normalize_url(url)
    url_hash = _make_url_hash(normalized_url)


    try:
        with conn.cursor() as cursor:
            sql = """
            INSERT INTO phishing_sites (normalized_url, url_hash, is_blocked, ai_reason, suggested_official_url, created_at)
            VALUES (%s, %s, 1, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                is_blocked = 1,
                ai_reason = VALUES(ai_reason),
                suggested_official_url = VALUES(suggested_official_url),
                created_at = VALUES(created_at)
            """
            cursor.execute(
                sql,
                (normalized_url, url_hash, ai_reason, suggested_url, datetime.now()),
            )
        conn.commit()
        return True
    except Exception as e:
        print("[add_global_block] 에러:", e)
        return False
    finally:
        conn.close()


# --------------------------------------------------------
# URL 차단 여부 확인
#   반환값:
#   2 = 전역 차단 (phishing_sites)
#   1 = 개인 차단 (user_url_overrides, decision=1)
#   0 = 차단 아님 / 허용
# --------------------------------------------------------
def check_url(client_id: str, url: str) -> int:
    normalized_url = normalize_url(url)
    url_hash = _make_url_hash(normalized_url)

    # user 생성 또는 조회
    try:
        user_id = _get_or_create_user_id(client_id)
    except Exception:
        return 0

    conn = get_connection()
    if not conn:
        print("[check_url] DB 연결 실패")
        return 0

    try:
        with conn.cursor() as cursor:
            # 1) 전역 차단 우선 확인
            cursor.execute(
                "SELECT is_blocked FROM phishing_sites WHERE url_hash=%s LIMIT 1",
                (url_hash,),
            )
            row = cursor.fetchone()
            if row and int(row["is_blocked"]) == 1:
                # 전역 차단
                return 2

            # 2) 개인 오버라이드
            cursor.execute(
                """
                SELECT decision
                FROM user_url_overrides
                WHERE user_id=%s AND url_hash=%s
                LIMIT 1
                """,
                (user_id, url_hash),
            )
            row = cursor.fetchone()
            if row is not None:
                # decision: 1=차단, 0=허용
                return int(row["decision"])

            # 3) 기본 허용
            return 0

    except Exception as e:
        print("[check_url] 에러:", e)
        return 0
    finally:
        conn.close()


# --------------------------------------------------------
# 신고 (사용자 → 수동 신고)
# --------------------------------------------------------
def report_url(client_id: str, url: str) -> bool:
    try:
        user_id = _get_or_create_user_id(client_id)
    except Exception:
        return False

    conn = get_connection()
    if not conn:
        print("[report_url] DB 연결 실패")
        return False

    normalized_url = normalize_url(url)
    url_hash = _make_url_hash(normalized_url)

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO reported_urls (reporter_user_id, normalized_url, url_hash, created_at)
                VALUES (%s, %s, %s, %s)
                """,
                (user_id, normalized_url, url_hash, datetime.now()),
            )
        conn.commit()
        return True
    except Exception as e:
        print("[report_url] 에러:", e)
        return False
    finally:
        conn.close()


# --------------------------------------------------------
# 개인 차단
# --------------------------------------------------------
def override_url(client_id: str, normalized_url: str, decision: int) -> bool:
    try:
        user_id = _get_or_create_user_id(client_id)
    except Exception:
        return False

    conn = get_connection()
    if not conn:
        print("[override_url] DB 연결 실패")
        return False

    normalized_url = normalize_url(normalized_url)
    url_hash = _make_url_hash(normalized_url)

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO user_url_overrides (user_id, normalized_url, url_hash, decision, created_at)
                VALUES (%s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    decision = VALUES(decision),
                    normalized_url = VALUES(normalized_url),
                    created_at = VALUES(created_at)
                """,
                (user_id, normalized_url, url_hash, decision, datetime.now()),
            )
        conn.commit()
        return True
    except Exception as e:
        print("[override_url] 에러:", e)
        return False
    finally:
        conn.close()


# --------------------------------------------------------
# 개인 차단 해제
# --------------------------------------------------------
def remove_override_url(client_id: str, normalized_url: str) -> bool:
    try:
        user_id = _get_or_create_user_id(client_id)
    except Exception:
        return False

    conn = get_connection()
    if not conn:
        print("[remove_override_url] DB 연결 실패")
        return False

    normalized_url = normalize_url(normalized_url)
    url_hash = _make_url_hash(normalized_url)

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "DELETE FROM user_url_overrides WHERE user_id=%s AND url_hash=%s",
                (user_id, url_hash),
            )
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        print("[remove_override_url] 에러:", e)
        return False
    finally:
        conn.close()


# --------------------------------------------------------
# 개인 차단 목록
# --------------------------------------------------------
def get_user_blocked_urls(client_id: str) -> List[str]:
    try:
        user_id = _get_or_create_user_id(client_id)
    except Exception:
        return []

    conn = get_connection()
    if not conn:
        print("[get_user_blocked_urls] DB 연결 실패")
        return []

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT normalized_url
                FROM user_url_overrides
                WHERE user_id=%s AND decision=1
                ORDER BY created_at DESC
                """,
                (user_id,),
            )
            rows = cursor.fetchall() or []
            return [row["normalized_url"] for row in rows]
    except Exception as e:
        print("[get_user_blocked_urls] 에러:", e)
        return []
    finally:
        conn.close()
