from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import httpx

from schemas import EvaluateRequest, DecisionResponse, ReportRequest, ReportResponse
import service
import decision_engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with httpx.AsyncClient() as client:
        app.state.http_client = client
        yield


app = FastAPI(title="PhishGuard-AI Unified API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_http_client(request: Request) -> httpx.AsyncClient:
    return request.app.state.http_client


@app.get("/health")
async def health():
    return {"status": "ok"}


# ------------------------------------------------------------
# 🔍 URL 평가 (DB → GSB → Gemini)
# ------------------------------------------------------------
@app.post("/api/evaluate", response_model=DecisionResponse)
async def evaluate_url(
    body: EvaluateRequest,
    client: httpx.AsyncClient = Depends(get_http_client),
):
    try:
        url_str = str(body.url).strip()
        client_id = (body.client_id or "").strip() if hasattr(body, "client_id") else ""
        decision_data = await decision_engine.get_decision(client_id, client, url_str)
        return DecisionResponse(**decision_data)
    except Exception as e:
        print("[/api/evaluate] error:", e)
        raise HTTPException(status_code=500, detail="Internal Server Error")


# ------------------------------------------------------------
# 📣 신고
# ------------------------------------------------------------
@app.post("/api/report", response_model=ReportResponse)
async def report_url(body: ReportRequest):
    # ✅ 더 이상 token_A 고정 아님: popup/background에서 보내준 user_token 사용
    ok = service.report_url(body.user_token, str(body.url))
    if not ok:
        raise HTTPException(status_code=500, detail="Report failed")
    return ReportResponse(message="신고가 접수되었습니다.", report_id=None)


# ------------------------------------------------------------
# 🧍 개인 차단 설정
# ------------------------------------------------------------
@app.post("/api/override")
async def override_api(body: dict):
    client_id = body.get("client_id")
    url = body.get("url")
    decision = body.get("decision")
    if not client_id or not url or decision is None:
        raise HTTPException(status_code=400, detail="invalid body")
    ok = service.override_url(client_id, url, int(decision))
    return {"success": ok}


# ------------------------------------------------------------
# 🧍 개인 차단 해제
# ------------------------------------------------------------
@app.post("/api/remove-override")
async def remove_override_api(body: dict):
    client_id = body.get("client_id")
    url = body.get("url")
    if not client_id or not url:
        raise HTTPException(status_code=400, detail="invalid body")
    ok = service.remove_override_url(client_id, url)
    return {"success": ok}


# ------------------------------------------------------------
# 📂 내 차단 목록 조회
# ------------------------------------------------------------
@app.post("/api/my-blocked-urls")
async def my_blocked_urls(body: dict):
    client_id = body.get("client_id")
    if not client_id:
        raise HTTPException(status_code=400, detail="invalid body")
    urls = service.get_user_blocked_urls(client_id)
    return {"urls": urls}


# ============================================================
# ⭐ 전역 차단 정보 조회 API (ai_cache 기반)
# blocked.js에서 점수/AI 이유/공식 URL 가져올 때 사용
# ============================================================
@app.post("/api/global-info")
async def get_global_info(body: dict):
    url = body.get("url")
    if not url:
        raise HTTPException(status_code=400, detail="url required")

    # ai_cache에서 캐시된 정보 조회 (최대 1년)
    cache = service.get_ai_cache(url, max_age_days=365)
    if not cache:
        return {
            "ai_reason": None,
            "ai_score": None,
            "official_url": None,
        }

    return {
        "ai_reason": cache.get("ai_reason"),
        "ai_score": cache.get("ai_score"),
        "official_url": cache.get("suggested_official_url"),
    }
