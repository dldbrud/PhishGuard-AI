from fastapi import FastAPI, Depends, HTTPException, Request
from sqlalchemy.orm import Session
import httpx
from contextlib import asynccontextmanager

# 내부 모듈 임포트
import services
import decision_engine
from schemas import EvaluateRequest, DecisionResponse, ReportRequest, ReportResponse
from database import get_db, create_db_tables, Report

# --- App Lifespan (앱 생명주기) ---
# 앱 시작 시 httpx.AsyncClient를 1개만 생성하고, 종료 시 닫습니다.
# (매번 생성하는 것보다 훨씬 효율적)
@asynccontextmanager
async def lifespan(app: FastAPI):
    async with httpx.AsyncClient() as client:
        app.state.http_client = client # 앱 상태에 클라이언트 저장
        yield
    # 앱 종료 시 자동 정리

app = FastAPI(title="PhishGuard-Ai API (Refactored)", lifespan=lifespan)

# --- 의존성 주입 (Dependency Injection) ---
def get_http_client(request: Request) -> httpx.AsyncClient:
    # 앱 상태에 저장된 클라이언트를 가져옴
    return request.app.state.http_client

# --- 서버 시작 이벤트 ---
@app.on_event("startup")
def on_startup():
    create_db_tables()

# --- 엔드포인트 ---

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/api/evaluate", response_model=DecisionResponse)
async def evaluate_url(
    request: EvaluateRequest,
    db: Session = Depends(get_db),
    client: httpx.AsyncClient = Depends(get_http_client)
):
    """
    API 컨트롤러는 오직 '조율'만 담당합니다.
    모든 로직은 decision_engine에 위임합니다.
    """
    try:
        url_str = str(request.url).strip()
        
        # '두뇌'인 decision_engine에게 모든 결정을 맡김
        decision_data = await decision_engine.get_decision(db, client, url_str)
        
        return DecisionResponse(**decision_data) # dict를 Pydantic 모델로 변환

    except Exception as e:
        # GSB나 Gemini API에서 에러가 발생하면 500 에러 반환 (친구 코드 장점)
        print(f"Evaluate Error: {e}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {e}")

@app.post("/api/report", response_model=ReportResponse)
async def report_url(
    request: ReportRequest, 
    db: Session = Depends(get_db)
):
    """
    DB 로직을 services에 위임합니다.
    """
    existing_report = services.get_report_by_url(db, request.url)
    if existing_report:
        return ReportResponse(message="이미 신고된 URL입니다.", report_id=existing_report.id)
    
    new_report = services.create_report(db, request.url)
    
    return ReportResponse(message="신고가 성공적으로 접수되었습니다.", report_id=new_report.id)