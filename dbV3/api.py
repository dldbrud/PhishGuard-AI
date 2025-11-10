from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from service import (
    check_url,
    report_url,
    override_url,
    remove_override_url,
    get_user_blocked_urls,  # ✅ 새로 추가
)

app = FastAPI()

# ✅ CORS 허용 (크롬 확장에서 접근 가능하도록)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # 개발 중이니 전체 허용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 요청 모델 정의 ---

class CheckRequest(BaseModel):
    client_id: str
    url: str

class ReportRequest(BaseModel):
    client_id: str
    url: str

class OverrideRequest(BaseModel):
    client_id: str
    url: str
    decision: int

class RemoveOverrideRequest(BaseModel):
    client_id: str
    url: str

class ClientRequest(BaseModel):  # ✅ 내 차단 목록 조회용
    client_id: str


# --- API 엔드포인트 ---

@app.post("/check-url")
async def check(req: CheckRequest):
    is_blocked = check_url(req.client_id, req.url)
    return {"is_blocked": is_blocked}


@app.post("/report")
async def report(req: ReportRequest):
    ok = report_url(req.client_id, req.url)
    return {"success": ok}


@app.post("/override")
async def override(req: OverrideRequest):
    ok = override_url(req.client_id, req.url, req.decision)
    return {"success": ok}


@app.post("/remove-override")
async def remove_override(req: RemoveOverrideRequest):
    ok = remove_override_url(req.client_id, req.url)
    return {"success": ok}


# ✅ 내 차단 목록 조회 (플로팅 "내 차단 목록" 버튼용)
@app.post("/my-blocked-urls")
async def my_blocked_urls(req: ClientRequest):
    urls = get_user_blocked_urls(req.client_id)
    return {"urls": urls}
