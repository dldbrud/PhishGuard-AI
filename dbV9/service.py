from datetime import datetime
import hashlib
from urllib.parse import urlparse, urlunparse
from typing import List, Optional

from db import get_connection


# --------------------------------------------------------
# URL 정규화 함수 분리
# --------------------------------------------------------

# ✅ 개인 차단용: 쿼리 제거 (블로그 개별 페이지 정도만 구분)
def normalize_url_for_override(url: str) -> str:
    p = urlparse(url)

    scheme = (p.scheme or "https").lower()
    netloc = p.netloc.lower()

    path = p.path or "/"
    if path != "/":
        path = path.rstrip("/")

    # 쿼리는 버림
    return urlunparse((scheme, netloc, path, "", "", ""))


# ✅ AI 캐시 / 전역 차단용 해시: 쿼리 포함 (검색어별로 구분)
def normalize_url_for_cache(url: str) -> str:
    p = urlparse(url)

    scheme = (p.scheme or "https").lower()
    netloc = p.netloc.lower()

    path = p.path or "/"
    if path != "/":
        path = path.rstrip("/")

    query = p.query or ""

    return urlunparse((scheme, netloc, path, "", query, ""))


# ✅ 기존 코드 호환용 (개인 오버라이드 기준)
def normalize_url(url: str) -> str:
    return normalize_url_for_override(url)


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
#   ※ URL 단위 전역 차단 (도메인 전역 차단은 별도 INSERT 로 처리)
# --------------------------------------------------------
def add_global_block(
    url: str,
    ai_reason: Optional[str] = None,
    suggested_url: Optional[str] = None,
) -> bool:
    conn = get_connection()
    if not conn:
        print("[add_global_block] DB 연결 실패")
        return False

    # ✅ DB에는 짧은 버전 (쿼리 제거) 저장
    normalized_db = normalize_url_for_override(url)
    # ✅ 해시는 쿼리 포함 버전으로 생성 → 검색어별로 분리
    normalized_for_hash = normalize_url_for_cache(url)
    url_hash = _make_url_hash(normalized_for_hash)

    try:
        with conn.cursor() as cursor:
            sql = """
            INSERT INTO phishing_sites (
                normalized_url,
                url_hash,
                is_blocked,
                ai_reason,
                suggested_official_url,
                created_at
            )
            VALUES (%s, %s, 1, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                is_blocked = 1,
                ai_reason = VALUES(ai_reason),
                suggested_official_url = VALUES(suggested_official_url),
                created_at = VALUES(created_at)
            """
            cursor.execute(
                sql,
                (normalized_db, url_hash, ai_reason, suggested_url, datetime.now()),
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
#   2 = 전역 차단 (phishing_sites: 도메인/URL)
#   1 = 개인 차단 (user_url_overrides, decision=1)
#   0 = 차단 아님 / 허용
# --------------------------------------------------------
def check_url(client_id: str, url: str) -> int:
    # ✅ 두 가지 기준으로 따로 정규화
    normalized_override = normalize_url_for_override(url)     # 개인 오버라이드용 (쿼리 X)
    url_hash_override = _make_url_hash(normalized_override)

    normalized_cache = normalize_url_for_cache(url)           # 전역/캐시용 (쿼리 O)
    url_hash_cache = _make_url_hash(normalized_cache)

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
            # 0) 전역 도메인 차단 먼저 확인
            host = urlparse(normalized_cache).netloc.lower()  # 예: www.naver.com

            cursor.execute(
                """
                SELECT 1
                FROM phishing_sites
                WHERE is_domain_block = 1
                  AND (
                        domain = %s
                     OR %s LIKE CONCAT('%%.', domain)
                  )
                LIMIT 1
                """,
                (host, host),
            )
            row = cursor.fetchone()
            if row:
                # 도메인 전체 전역 차단
                return 2

            # 1) 전역 URL 차단 (AI/GEMINI/GSB가 막은 페이지, 쿼리 포함 기준)
            cursor.execute(
                "SELECT is_blocked FROM phishing_sites WHERE url_hash=%s LIMIT 1",
                (url_hash_cache,),
            )
            row = cursor.fetchone()
            if row and int(row["is_blocked"]) == 1:
                # 전역 차단
                return 2

            # 2) 개인 오버라이드 (사용자 전용 차단/허용, 쿼리 제거 기준)
            cursor.execute(
                """
                SELECT decision
                FROM user_url_overrides
                WHERE user_id=%s AND url_hash=%s
                LIMIT 1
                """,
                (user_id, url_hash_override),
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

    # 신고는 override 기준 정규화로 묶어주는 정도면 충분
    normalized_url = normalize_url_for_override(url)
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

    # ✅ 여기서는 override 기준 정규화 (쿼리 제거)
    normalized_url = normalize_url_for_override(normalized_url)
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

    normalized_url = normalize_url_for_override(normalized_url)
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


# --------------------------------------------------------
# AI / GSB 캐시 조회 (최대 max_age_days 일까지 유효)
#   반환: dict(gsb_status, ai_score, ai_reason, suggested_official_url) 또는 None
# --------------------------------------------------------
def get_ai_cache(url: str, max_age_days: int = 30) -> Optional[dict]:
    conn = get_connection()
    if not conn:
        print("[get_ai_cache] DB 연결 실패")
        return None

    # ✅ 캐시는 검색어까지 포함해서 구분 (하지만 DB normalized_url은 안 씀)
    normalized_for_hash = normalize_url_for_cache(url)
    url_hash = _make_url_hash(normalized_for_hash)

    try:
        with conn.cursor() as cursor:
            sql = """
            SELECT
                gsb_status,
                ai_score,
                ai_reason,
                suggested_official_url,
                updated_at
            FROM ai_cache
            WHERE url_hash = %s
              AND updated_at >= (NOW() - INTERVAL %s DAY)
            LIMIT 1
            """
            cursor.execute(sql, (url_hash, max_age_days))
            row = cursor.fetchone()
            if not row:
                return None

            return {
                "gsb_status": row["gsb_status"],
                "ai_score": row["ai_score"],
                "ai_reason": row["ai_reason"],
                "suggested_official_url": row["suggested_official_url"],
            }
    except Exception as e:
        print("[get_ai_cache] 에러:", e)
        return None
    finally:
        conn.close()


# --------------------------------------------------------
# AI / GSB 캐시 저장 or 갱신
#   gsb_status: safebrowsing_client.GSB_STATUS_* 값 또는 None
#   ai_score: Gemini 점수 또는 None
# --------------------------------------------------------
def upsert_ai_cache(
    url: str,
    gsb_status: Optional[int] = None,
    ai_score: Optional[int] = None,
    ai_reason: Optional[str] = None,
    suggested_url: Optional[str] = None,
) -> bool:
    conn = get_connection()
    if not conn:
        print("[upsert_ai_cache] DB 연결 실패")
        return False

    # ✅ DB에는 짧은 버전 저장
    normalized_db = normalize_url_for_override(url)
    # ✅ 해시는 쿼리 포함 버전 기준
    normalized_for_hash = normalize_url_for_cache(url)
    url_hash = _make_url_hash(normalized_for_hash)
    now = datetime.now()

    # gsb_status 문자열 들어와도 안전하게 숫자로 변환
    gsb_value: Optional[int]
    if isinstance(gsb_status, str):
        upper = gsb_status.upper()
        if upper == "SAFE":
            gsb_value = 0
        elif upper in ("DANGEROUS", "UNSAFE", "MALICIOUS"):
            gsb_value = 1
        else:
            gsb_value = None
    else:
        gsb_value = gsb_status

    try:
        with conn.cursor() as cursor:
            sql = """
            INSERT INTO ai_cache (
                normalized_url,
                url_hash,
                gsb_status,
                ai_score,
                ai_reason,
                suggested_official_url,
                updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                gsb_status = VALUES(gsb_status),
                ai_score = VALUES(ai_score),
                ai_reason = VALUES(ai_reason),
                suggested_official_url = VALUES(suggested_official_url),
                updated_at = VALUES(updated_at)
            """
            cursor.execute(
                sql,
                (normalized_db, url_hash, gsb_value, ai_score, ai_reason, suggested_url, now),
            )
        conn.commit()
        return True
    except Exception as e:
        print("[upsert_ai_cache] 에러:", e)
        return False
    finally:
        conn.close()
