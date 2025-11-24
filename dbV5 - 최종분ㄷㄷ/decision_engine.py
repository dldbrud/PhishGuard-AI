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
    # 1️⃣ 개인/전역 차단 DB 확인
    if client_id:
        is_blocked = service.check_url(client_id, url)
        if is_blocked == 1:
            return {
                "decision": "BLOCK",
                "reason": REASON_DB_REPORTED,
                "suggested_official_url": None,
            }

    # 2️⃣ GSB
    gsb_status, _ = await safebrowsing_client.check_safe_browsing(url, client)
    if gsb_status == safebrowsing_client.GSB_STATUS_DANGEROUS:
        return {
            "decision": "BLOCK",
            "reason": REASON_GSB_MATCH,
            "suggested_official_url": None,
        }

    # 3️⃣ Gemini
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

    return {
        "decision": "SAFE",
        "reason": REASON_SAFE,
        "suggested_official_url": suggested_url,
    }
