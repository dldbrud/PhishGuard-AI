from sqlalchemy.orm import Session
import httpx

import services
import safebrowsing_client
import gemini_client

# --- 결정 이유 코드 (Reason Codes) ---
REASON_DB_REPORTED = "USER_REPORTED_BLOCK"
REASON_GSB_MATCH = "GSB_MALWARE_MATCH"
REASON_GEMINI_BLOCK = "GEMINI_HIGH_RISK"
REASON_GEMINI_WARN = "GEMINI_SUSPICIOUS"
REASON_SAFE = "SAFE"

async def get_decision(db: Session, client: httpx.AsyncClient, url: str) -> dict:
    """
    요구사항대로 모든 로직을 종합하여 최종 결정을 내립니다.
    """
    
    # 1. DB 확인 (services.py 호출)
    db_report = services.get_report_by_url(db, url)
    if db_report:
        return {
            "decision": "BLOCK",
            "reason": REASON_DB_REPORTED,
            "suggested_official_url": None
        }

    # 2. GSB 확인 (safebrowsing_client.py 호출)
    (gsb_status, gsb_data) = await safebrowsing_client.check_safe_browsing(url, client)
    
    if gsb_status == safebrowsing_client.GSB_STATUS_DANGEROUS:
        return {
            "decision": "BLOCK",
            "reason": REASON_GSB_MATCH,
            "suggested_official_url": None
        }

    # 3. Gemini 확인 (gemini_client.py 호출)
    gemini_result = await gemini_client.analyze_url_with_gemini(url, client)

    # 4. 최종 결정
    score = gemini_result.get("score", 0) # 기본값 0
    suggested_url = gemini_result.get("suggested_url")
    reason = gemini_result.get("reason", "No analysis")

    if score >= 80:
        return {
            "decision": "BLOCK",
            "reason": f"{REASON_GEMINI_BLOCK} (Score: {score}, Reason: {reason})",
            "suggested_official_url": suggested_url
        }
    elif score >= 50:
        return {
            "decision": "WARN",
            "reason": f"{REASON_GEMINI_WARN} (Score: {score}, Reason: {reason})",
            "suggested_official_url": suggested_url
        }
    
    # 모두 통과
    return {
        "decision": "SAFE",
        "reason": REASON_SAFE,
        "suggested_official_url": suggested_url
    }