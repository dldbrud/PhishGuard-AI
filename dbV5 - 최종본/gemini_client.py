import httpx
import os
import json
from dotenv import load_dotenv

# .env 로드
load_dotenv()
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

async def analyze_url_with_gemini(url: str, client: httpx.AsyncClient) -> dict:
    """
    Gemini API를 호출하여 URL의 문맥적 위험도를 분석합니다.
    '조율안'의 요구사항에 맞춰 프롬프트를 수정했습니다.
    """
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY가 .env에 설정되지 않았습니다.")
        
    api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    
    prompt = f"""
    당신은 피싱 사이트 탐지 전문 AI입니다. 다음 URL을 분석하고 요청 형식에 맞춰 응답해 주세요.

    [분석 기준]
    1. score: 피싱 의심 점수 (0~100)
    2. is_typosquatting: 유명 사이트(예: naver, kakao)를 교묘하게 모방한 오타(Typosquatting)인지 (true/false),
    3. suggested_url: 만약 is_typosquatting이 true라면, 올바른 공식 URL. 없다면 null
    4. reason: 분석 근거 요약

    [URL]   
    {url}

    [응답 형식]
    반드시 다음 JSON 형식으로만 응답해 주세요.
    {{
      "score": (0에서 100 사이의 피싱 의심 점수),
      "is_typosquatting": (true 또는 false),
      "suggested_url": "(올바른 URL 또는 null)",
      "reason": "(분석 근거 요약)"
    }}
    """

    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }],
        "generationConfig": {
            "responseMimeType": "application/json", # JSON 응답 강제
        }
    }

    try:
        response = await client.post(api_url, json=payload, timeout=10.0)
        response.raise_for_status()
        
        gemini_response_text = response.json()['candidates'][0]['content']['parts'][0]['text']
        
        return json.loads(gemini_response_text) 

    except Exception as e:
        print(f"Gemini API 오류: {e}")
        # 에러 발생 시 decision_engine이 처리하도록 예외 발생
        raise e