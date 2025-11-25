import os
import pymysql
from dotenv import load_dotenv

load_dotenv()

def get_connection():
    host = os.getenv("MYSQL_HOST")
    user = os.getenv("MYSQL_USER")
    password = os.getenv("MYSQL_PASSWORD")
    db = os.getenv("MYSQL_DB")
    port = os.getenv("MYSQL_PORT")

    # 필수 값 체크 (안 들어오면 즉시 에러)
    if not all([host, user, password, db, port]):
        raise RuntimeError("[DB 설정 오류] 환경변수 누락됨")

    try:
        return pymysql.connect(
            host=host,
            user=user,
            password=password,
            database=db,
            port=int(port),
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
            connect_timeout=20
        )
    except Exception as e:
        print("[DB 연결 오류]", e)
        return None
