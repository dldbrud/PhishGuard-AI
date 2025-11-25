from pydantic import BaseModel, HttpUrl
from typing import Optional

# --- 평가 API ---

class EvaluateRequest(BaseModel):
    url: HttpUrl
    client_id: Optional[str] = None


class DecisionResponse(BaseModel):
    decision: str  # "BLOCK", "WARN", "SAFE"
    reason: str
    suggested_official_url: Optional[str] = None


# --- 신고 API ---

class ReportRequest(BaseModel):
    url: HttpUrl
    user_token: str  # == client_id (설치당 고유 값)


class ReportResponse(BaseModel):
    message: str
    report_id: Optional[int] = None
