from pydantic import BaseModel, HttpUrl
from typing import Optional

# --- 평가 API ---

class EvaluateRequest(BaseModel):
    url: HttpUrl 

class DecisionResponse(BaseModel):
    decision: str # "BLOCK", "WARN", "SAFE"
    reason: str
    suggested_official_url: Optional[str] = None

# --- 신고 API ---

class ReportRequest(BaseModel):
    url: str 

class ReportResponse(BaseModel):
    message: str
    report_id: int | None = None