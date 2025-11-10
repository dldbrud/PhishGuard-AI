from datetime import datetime
import hashlib
from db import get_connection

# URL 해시 생성 (BINARY(32)로 저장 가정)
def _make_url_hash(normalized_url: str) -> bytes:
    return hashlib.sha256(normalized_url.encode("utf-8")).digest()

# client_id 기준으로 user 생성/조회
def _get_or_create_user_id(client_id: str) -> int:
    conn = get_connection()
    if not conn:
        raise Exception("[_get_or_create_user_id] DB 연결 실패")

    try:
        with conn.cursor() as cursor:
            # 기존 유저 조회
            sql_select = """
            SELECT id
            FROM users
            WHERE external_id = %s
            LIMIT 1
            """
            cursor.execute(sql_select, (client_id,))
            row = cursor.fetchone()
            if row:
                return row["id"]

            # 없으면 생성
            sql_insert = """
            INSERT INTO users (display_name, external_id, created_at)
            VALUES (%s, %s, %s)
            """
            cursor.execute(sql_insert, ("", client_id, datetime.now()))
            conn.commit()
            return cursor.lastrowid

    except Exception as e:
        print("[_get_or_create_user_id] 에러:", e)
        raise
    finally:
        conn.close()


# URL 차단 여부 확인
# phishing_sites (전역) → user_url_overrides(개인) 순서로 확인
# 1: 차단, 0: 허용
def check_url(client_id: str, normalized_url: str) -> int:
    try:
        user_id = _get_or_create_user_id(client_id)
    except Exception:
        return 0

    conn = get_connection()
    if not conn:
        print("[check_url] DB 연결 실패")
        return 0

    url_hash = _make_url_hash(normalized_url)

    try:
        with conn.cursor() as cursor:
            # 1) 전역 차단 우선
            sql_global = """
            SELECT is_blocked
            FROM phishing_sites
            WHERE url_hash = %s
            LIMIT 1
            """
            cursor.execute(sql_global, (url_hash,))
            g = cursor.fetchone()
            if g:
                return int(g["is_blocked"])  # 1이면 전역 차단

            # 2) 개인 오버라이드 체크
            sql_override = """
            SELECT decision
            FROM user_url_overrides
            WHERE user_id = %s AND url_hash = %s
            LIMIT 1
            """
            cursor.execute(sql_override, (user_id, url_hash))
            o = cursor.fetchone()
            if o:
                return int(o["decision"])  # 1이면 개인 차단

            # 3) 기본 허용
            return 0

    except Exception as e:
        print("[check_url] 에러:", e)
        return 0
    finally:
        conn.close()


# 신고 기록 (항상 누적)
def report_url(client_id: str, normalized_url: str) -> bool:
    try:
        user_id = _get_or_create_user_id(client_id)
    except Exception:
        return False

    conn = get_connection()
    if not conn:
        print("[report_url] DB 연결 실패")
        return False

    url_hash = _make_url_hash(normalized_url)

    try:
        with conn.cursor() as cursor:
            sql = """
            INSERT INTO reported_urls (reporter_user_id, normalized_url, url_hash, created_at)
            VALUES (%s, %s, %s, %s)
            """
            cursor.execute(sql, (user_id, normalized_url, url_hash, datetime.now()))
        conn.commit()
        return True
    except Exception as e:
        print("[report_url] 에러:", e)
        return False
    finally:
        conn.close()


# 개인 차단 설정 (UPsert)
# decision: 1 = 차단, 0 = 허용(또는 무효화 용도)
def override_url(client_id: str, normalized_url: str, decision: int) -> bool:
    try:
        user_id = _get_or_create_user_id(client_id)
    except Exception:
        return False

    conn = get_connection()
    if not conn:
        print("[override_url] DB 연결 실패")
        return False

    url_hash = _make_url_hash(normalized_url)

    try:
        with conn.cursor() as cursor:
            # user_id + url_hash에 UNIQUE 인덱스가 있다고 가정하고 UPSERT
            sql = """
            INSERT INTO user_url_overrides (user_id, normalized_url, url_hash, decision, created_at)
            VALUES (%s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                decision = VALUES(decision),
                normalized_url = VALUES(normalized_url),
                created_at = VALUES(created_at)
            """
            cursor.execute(sql, (user_id, normalized_url, url_hash, decision, datetime.now()))
        conn.commit()
        return True
    except Exception as e:
        print("[override_url] 에러:", e)
        return False
    finally:
        conn.close()


# 개인 차단 해제 (override 삭제)
def remove_override_url(client_id: str, normalized_url: str) -> bool:
    try:
        user_id = _get_or_create_user_id(client_id)
    except Exception:
        return False

    conn = get_connection()
    if not conn:
        print("[remove_override_url] DB 연결 실패")
        return False

    url_hash = _make_url_hash(normalized_url)

    try:
        with conn.cursor() as cursor:
            sql = """
            DELETE FROM user_url_overrides
            WHERE user_id = %s AND url_hash = %s
            """
            cursor.execute(sql, (user_id, url_hash))
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        print("[remove_override_url] 에러:", e)
        return False
    finally:
        conn.close()


# ✅ 개인 차단 목록 조회 (플로팅 "내 차단 목록" 용)
# client_id 기준으로 decision=1 인 URL들만 반환
def get_user_blocked_urls(client_id: str) -> list[str]:
    try:
        user_id = _get_or_create_user_id(client_id)
    except Exception:
        return []

    conn = get_connection()
    if not conn:
        print("[get_user_blocked_urls] DB 연결 실패")
        return []

    urls: list[str] = []

    try:
        with conn.cursor() as cursor:
            sql = """
            SELECT normalized_url
            FROM user_url_overrides
            WHERE user_id = %s
              AND decision = 1
            ORDER BY created_at DESC
            """
            cursor.execute(sql, (user_id,))
            rows = cursor.fetchall() or []
            urls = [row["normalized_url"] for row in rows]
        return urls
    except Exception as e:
        print("[get_user_blocked_urls] 에러:", e)
        return []
    finally:
        conn.close()
