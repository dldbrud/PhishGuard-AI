from pydantic import BaseModel, HttpUrl
from typing import Optional

# --- 평가 API ---

class EvaluateRequest(BaseModel):
    # 친구분의 코드(HttpUrl)가 더 견고하므로 차용
    url: HttpUrl 

class DecisionResponse(BaseModel):
    # 조율안의 요구사항을 반영한 최종 응답 모델
    decision: str # "BLOCK", "WARN", "SAFE"
    reason: str
    suggested_official_url: Optional[str] = None

# --- 신고 API ---

class ReportRequest(BaseModel):
    # HttpUrl이 아닌 str을 사용 (DB에 저장할 때는 원본 문자열이 나을 수 있음)
    url: str 

class ReportResponse(BaseModel):
    message: str
    report_id: int | None = None