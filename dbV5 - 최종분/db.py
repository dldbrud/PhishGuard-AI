import os
import pymysql
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

def get_connection():
    """
    MySQL 데이터베이스 연결 생성 함수.
    커넥션을 열고 닫는 책임은 호출하는 쪽(service.py 등)에 있음.
    환경변수:
      MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB
    """
    try:
        conn = pymysql.connect(
            host=os.getenv("MYSQL_HOST", "localhost"),
            user=os.getenv("MYSQL_USER", "root"),
            password=os.getenv("MYSQL_PASSWORD", "oJshLtgzPYmkIwNAyIQaIbMXWhFGoqAR"),
            database=os.getenv("MYSQL_DB", "phishing_guard"),
            port=int(os.getenv("MYSQL_PORT", "3306")),  # ✅ Railway 포트 반영
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
            connect_timeout=10
        )
        return conn
    except Exception as e:
        print(f"[DB 연결 오류] {e}")
        return None