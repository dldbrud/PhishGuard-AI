from fastapi import FastAPI
from pydantic import BaseModel
from service import check_url, report_url, override_url, remove_override_url

app = FastAPI()

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

# 이건 그냥 main파일 이라 생각하면 될듯? 