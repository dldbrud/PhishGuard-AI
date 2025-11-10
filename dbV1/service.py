from datetime import datetime
import hashlib
from db import get_connection

#url hash값 반환. 내가 알기론 속도면에서 유리?

def _make_url_hash(normalized_url: str) -> bytes:
    return hashlib.sha256(normalized_url.encode("utf-8")).digest()

#사용자 생성. 
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
        

#url check. phishing_sites 부터 overrides 까지 . 피싱사이트 발견시 1
def check_url(client_id: str, normalized_url: str) -> int:
    # client_id -> user_id 매핑
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

#신고 시 무조건 올라가는 테이블
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

#개인 차단
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
            sql = """
            INSERT INTO user_url_overrides (user_id, normalized_url, url_hash, decision, created_at)
            VALUES (%s, %s, %s, %s, %s)
            """
            cursor.execute(sql, (user_id, normalized_url, url_hash, decision, datetime.now()))
        conn.commit()
        return True
    except Exception as e:
        print("[override_url] 에러:", e)
        return False
    finally:
        conn.close()

#개인 차단 해제
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
