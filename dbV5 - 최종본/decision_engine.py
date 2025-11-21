import httpx
import service
import safebrowsing_client
import gemini_client

REASON_DB_REPORTED = "USER_REPORTED_BLOCK"
REASON_GSB_MATCH = "GSB_MALWARE_MATCH"
REASON_GEMINI_BLOCK = "GEMINI_HIGH_RISK"
REASON_GEMINI_WARN = "GEMINI_SUSPICIOUS"
REASON_SAFE = "SAFE"

async def get_decision(client_id: str, client: httpx.AsyncClient, url: str) -> dict:
    print(f"[get_decision] URL: {url}, client_id: {client_id}")
    
    # 1️⃣ 개인/전역 차단 DB 확인 (개인 설정이 최우선)
    if client_id:
        db_result = service.check_url(client_id, url)
        print(f"[get_decision] db_result: {db_result}")
        
        # 개인 오버라이드가 있으면 그대로 따름 (차단=1, 허용=0)
        # 특히 decision=0이면 사용자가 명시적으로 허용한 것이므로 추가 검사 없이 통과
        user_override = service.get_user_override_decision(client_id, url)
        print(f"[get_decision] user_override: {user_override}")
        
        if user_override is not None:  # 개인 설정이 있으면
            if user_override == 0:  # 명시적 허용
                print(f"[get_decision] 개인 설정으로 허용: {url}")
                return {
                    "decision": "ALLOW",
                    "reason": REASON_SAFE,
                    "suggested_official_url": None,
                }
            else:  # 명시적 차단
                print(f"[get_decision] 개인 설정으로 차단: {url}")
                return {
                    "decision": "BLOCK",
                    "reason": REASON_DB_REPORTED,
                    "suggested_official_url": None,
                }
        
        # 개인 설정이 없고 전역 차단만 있는 경우
        if db_result == 1:
            print(f"[get_decision] 전역 차단: {url}")
            return {
                "decision": "BLOCK",
                "reason": REASON_DB_REPORTED,
                "suggested_official_url": None,
            }

    # 2️⃣ GSB
    try:
        gsb_status, _ = await safebrowsing_client.check_safe_browsing(url, client)
        if gsb_status == safebrowsing_client.GSB_STATUS_DANGEROUS:
            return {
                "decision": "BLOCK",
                "reason": REASON_GSB_MATCH,
                "suggested_official_url": None,
            }
    except ValueError as e:
        # API 키가 없는 경우 GSB 체크 건너뜀
        print(f"[get_decision] GSB 체크 건너뜀: {e}")

    # 3️⃣ Gemini
    try:
        gemini_result = await gemini_client.analyze_url_with_gemini(url, client)
        score = gemini_result.get("score", 0)
        suggested_url = gemini_result.get("suggested_url")
        reason = gemini_result.get("reason", "No analysis")

        if score >= 80:
            return {
                "decision": "BLOCK",
                "reason": f"{REASON_GEMINI_BLOCK} (Score: {score}, Reason: {reason})",
                "suggested_official_url": suggested_url,
            }
        elif score >= 50:
            return {
                "decision": "WARN",
                "reason": f"{REASON_GEMINI_WARN} (Score: {score}, Reason: {reason})",
                "suggested_official_url": suggested_url,
            }
    except Exception as e:
        # Gemini API 에러 시 안전으로 판단
        print(f"[get_decision] Gemini 체크 건너뜀: {e}")

    return {
        "decision": "SAFE",
        "reason": REASON_SAFE,
        "suggested_official_url": None,
    }
