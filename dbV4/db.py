import os
import pymysql
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

def get_connection():
    """
    MySQL 데이터베이스 연결 생성 함수.
    커넥션을 열고 닫는 책임은 호출하는 쪽(service.py 등)에 있음.
    """
    try:
        conn = pymysql.connect(
            host=os.getenv("MYSQL_HOST", "localhost"),
            user=os.getenv("MYSQL_USER", "root"),
            password=os.getenv("MYSQL_PASSWORD", ""),
            database=os.getenv("MYSQL_DB", "phishing_guard"),
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor
        )
        return conn
    except Exception as e:
        print(f"[DB 연결 오류] {e}")
        return None

#보안성을 위해 env파일 별도 생성함.