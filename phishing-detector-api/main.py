from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, HttpUrl
import os
from dotenv import load_dotenv
from providers import check_safe_browsing, analyze_with_gemini

load_dotenv()

app = FastAPI(title="Phishing Detector API")

class EvaluateRequest(BaseModel):
    url: HttpUrl
    source: str | None = "extension"

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/evaluate")
async def evaluate(req: EvaluateRequest):
    url = str(req.url).strip()

    try:
        sb_res = await check_safe_browsing(url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SafeBrowsing error: {e}")

    if sb_res and "matches" in sb_res:
        return {
            "url": url,
            "label": "phishing",
            "score": 1.0,
            "reason": "listed_in_safe_browsing",
            "provider": "SafeBrowsing",
            "raw": sb_res,
        }

    try:
        gemini_res = await analyze_with_gemini(url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini error: {e}")

    score = float(gemini_res.get("score", 0.5))
    label = gemini_res.get("label", "unknown")
    reason = gemini_res.get("reason", "")

    return {
        "url": url,
        "label": label,
        "score": score,
        "reason": reason,
        "provider": "Gemini",
        "raw": gemini_res,
    }