import httpx
import os
from dotenv import load_dotenv

# .env 로드 (API 키 준비)
load_dotenv()
GOOGLE_API_KEY = os.environ.get("GOOGLE_SAFE_BROWSING_API_KEY")

# --- 내부 상태값 정의 ---
# decision_engine.py와 공유할 상수 (constant)
GSB_STATUS_DANGEROUS = "DANGEROUS"
GSB_STATUS_SAFE = "SAFE"

async def check_safe_browsing(url: str, client: httpx.AsyncClient) -> tuple[str, dict | None]:
    """
    Google Safe Browsing API를 호출하고, 내부용으로 정제된 상태를 반환합니다.
    (반환값: 상태, 원본 응답)
    """
    if not GOOGLE_API_KEY:
        raise ValueError("GOOGLE_SAFE_BROWSING_API_KEY가 .env에 설정되지 않았습니다.")

    api_url = f"https://safebrowsing.googleapis.com/v4/threatMatches:find?key={GOOGLE_API_KEY}"
    payload = {
        "client": {"clientId": "phishguard-ai", "clientVersion": "1.0.0"},
        "threatInfo": {
            "threatTypes": ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"],
            "platformTypes": ["ANY_PLATFORM"],
            "threatEntryTypes": ["URL"],
            "threatEntries": [{"url": url}]
        }
    }
    
    try:
        response = await client.post(api_url, json=payload, timeout=5.0)
        response.raise_for_status() 
        data = response.json()
        
        if data.get('matches'):
            return (GSB_STATUS_DANGEROUS, data) # '위험' 상태와 원본 데이터 반환
        else:
            return (GSB_STATUS_SAFE, None) # '안전' 상태 반환

    except httpx.RequestError as e:
        print(f"Google Safe Browsing API 오류: {e}")
        # 에러가 나면 기본값을 반환하지 않고, 에러를 그대로 발생시켜
        # decision_engine이나 main.py가 처리하도록 함
        raise e