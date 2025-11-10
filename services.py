from sqlalchemy.orm import Session
from database import Report # database.py에 Report 모델이 있다고 가정

# --- 조회 서비스 ---

def get_report_by_url(db: Session, url: str) -> Report | None:
    """
    신고된 URL이 DB에 있는지 확인합니다.
    (main.py의 0단계 로직)
    """
    return db.query(Report).filter(Report.url == url).first()

# --- 생성 서비스 ---

def create_report(db: Session, url: str) -> Report:
    """
    새로운 URL을 신고 DB에 저장합니다.
    (main.py의 /api/report 로직)
    """
    # 중복 체크
    existing_report = get_report_by_url(db, url)
    if existing_report:
        return existing_report # 이미 존재하면 해당 객체 반환

    # 새로 생성
    new_report = Report(url=url)
    db.add(new_report)
    db.commit()
    db.refresh(new_report)
    
    return new_report