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
    프롬프트를 통해 JSON 응답 형식과 '한국어 설명'을 강제합니다.
    """
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY가 .env에 설정되지 않았습니다.")
        
    # Gemini 2.5 Flash 모델 사용
    api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
    
    # ✅ 한국어 응답 강제 및 정밀 분석을 위한 프롬프트
    prompt = f"""
    당신은 세계 최고의 피싱 사이트 탐지 보안 전문가 AI입니다. 
    다음 URL을 정밀 분석하고 결과를 요청한 JSON 형식으로만 응답해 주세요.

    [중요 요청사항]
    1. 분석 결과에 대한 설명(reason)은 **반드시 '한국어(Korean)'로 작성**해 주세요.
    2. 전문적인 보안 용어는 사용하되, 설명은 비전공자도 이해하기 쉽게 명확하게 작성하세요.
    3. JSON 형식을 엄격하게 지켜주세요.

    [분석 기준]
    1. score: 피싱 의심 점수 (0~100) 
       - 0: 매우 안전
       - 100: 확실한 피싱/악성 사이트
    2. is_typosquatting: 유명 사이트(예: naver, kakao, google, facebook, banks)를 교묘하게 모방한 오타 도메인인지 (true/false)
    3. suggested_url: 오타 도메인(true)일 경우, 원래 접속하려 했던 공식 URL. 아니라면 null
    4. reason: 해당 점수를 부여한 구체적인 근거 및 분석 내용을 간략하게 설명(**반드시 한국어로 작성**)

    [분석할 URL]   
    {url}

    [응답 형식 (JSON Only)]
    {{
      "score": (0~100 사이 정수),
      "is_typosquatting": (true/false),
      "suggested_url": "(공식 URL 문자열 또는 null)",
      "reason": "(한국어로 된 분석 결과 요약)"
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
        # 비동기 요청 (타임아웃 10초)
        response = await client.post(api_url, json=payload, timeout=10.0)
        response.raise_for_status()
        
        # 응답 파싱
        gemini_response_text = response.json()['candidates'][0]['content']['parts'][0]['text']
        
        # 텍스트를 JSON 객체로 변환하여 반환
        return json.loads(gemini_response_text) 

    except Exception as e:
        print(f"Gemini API 오류: {e}")
        # 에러 발생 시 상위 모듈(decision_engine)에서 처리하도록 예외를 던짐
        raise e