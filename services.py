from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
import os

# 1. DB 설정
# .env 파일에서 DATABASE_URL을 읽거나, 없으면 SQLite를 기본값으로 사용
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./phishguard.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# 2. DB 모델 (Report)
# (중요!) 'database.py'에서 가져오는 게 아니라, 여기에 직접 정의합니다.
class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True, index=True)
    url = Column(String, unique=True, index=True)

# 3. DB 초기화 함수 (main.py가 앱 시작 시 호출)
def init_db():
    Base.metadata.create_all(bind=engine)

# 4. DB 세션 의존성 주입 함수 (FastAPI가 사용)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 5. 신고 DB 로직 (Decision Engine이 사용)
class ReportService:
    def __init__(self, db: Session):
        self.db = db

    def get_reported_url(self, url: str) -> Report | None:
        """신고된 URL이 있는지 확인"""
        return self.db.query(Report).filter(Report.url == url).first()

    def report_url(self, url: str) -> Report:
        """새 URL 신고"""
        # 이미 신고됐는지 확인 (선택 사항이지만, 있으면 좋음)
        existing = self.get_reported_url(url)
        if existing:
            return existing
            
        db_report = Report(url=url)
        self.db.add(db_report)
        self.db.commit()
        self.db.refresh(db_report)
        return db_report