import os
import httpx
from dotenv import load_dotenv

# .env 로드
load_dotenv()

SAFE_BROWSING_API_KEY = os.getenv("SAFE_BROWSING_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")


# ✅ Safe Browsing API - 피싱/악성 URL 탐지
async def check_safe_browsing(url: str):
    if not SAFE_BROWSING_API_KEY:
        raise ValueError("SAFE_BROWSING_API_KEY not set in .env")

    api_url = f"https://safebrowsing.googleapis.com/v4/threatMatches:find?key={SAFE_BROWSING_API_KEY}"
    payload = {
        "client": {"clientId": "phishing-detector", "clientVersion": "1.0"},
        "threatInfo": {
            "threatTypes": [
                "MALWARE",
                "SOCIAL_ENGINEERING",
                "UNWANTED_SOFTWARE",
                "POTENTIALLY_HARMFUL_APPLICATION",
            ],
            "platformTypes": ["ANY_PLATFORM"],
            "threatEntryTypes": ["URL"],
            "threatEntries": [{"url": url}],
        },
    }

    async with httpx.AsyncClient() as client:
        res = await client.post(api_url, json=payload, timeout=10.0)
        res.raise_for_status()
        return res.json()


# ✅ Gemini API - AI 기반 URL 분석
async def analyze_with_gemini(url: str):
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY not set in .env")

    endpoint = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-1.5-flash-latest:generateContent"
    )
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
    }

    # 프롬프트: Gemini에게 URL 피싱 여부를 물어봄
    prompt = f"""
    너는 보안 전문가야. 아래 URL이 피싱 사이트일 가능성을 평가해줘.
    0.0 ~ 1.0 사이의 점수(score)와 이유(reason)를 JSON 형식으로만 출력해.
    예시: {{"score": 0.9, "label": "phishing", "reason": "로그인 유도 링크"}}.

    URL: {url}
    """

    payload = {
        "contents": [{"parts": [{"text": prompt}]}]
    }

    async with httpx.AsyncClient() as client:
        res = await client.post(endpoint, headers=headers, json=payload, timeout=20.0)
        res.raise_for_status()
        data = res.json()

        try:
            text = data["candidates"][0]["content"]["parts"][0]["text"]
        except Exception:
            return {"score": 0.5, "label": "unknown", "reason": "Gemini 응답 없음"}

        # Gemini의 응답이 JSON 문자열일 경우 처리
        import json
        try:
            parsed = json.loads(text)
            return parsed
        except json.JSONDecodeError:
            return {"score": 0.6, "label": "unknown", "reason": text[:200]}
