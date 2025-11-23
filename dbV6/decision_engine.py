import httpx
import service
import safebrowsing_client
import gemini_client

REASON_DB_REPORTED = "USER_REPORTED_BLOCK"      # 개인이 직접 차단
REASON_GLOBAL_DB_BLOCK = "GLOBAL_DB_BLOCK"      # 전역 DB에 의해 차단
REASON_GSB_MATCH = "GSB_MALWARE_MATCH"
REASON_GEMINI_BLOCK = "GEMINI_HIGH_RISK"
REASON_GEMINI_WARN = "GEMINI_SUSPICIOUS"
REASON_SAFE = "SAFE"


async def get_decision(client_id: str, client: httpx.AsyncClient, url: str) -> dict:
    # 1) DB 우선 확인 (전역 → 개인 순서)
    if client_id:
        flag = service.check_url(client_id, url)
        if flag == 2:
            # 🔥 전역 차단 DB에 이미 등록된 URL
            return {
                "decision": "BLOCK",
                "reason": REASON_GLOBAL_DB_BLOCK,
                "suggested_official_url": None,
            }
        elif flag == 1:
            # 🔥 사용자 개인이 차단한 URL
            return {
                "decision": "BLOCK",
                "reason": REASON_DB_REPORTED,
                "suggested_official_url": None,
            }

    # 2) Google Safe Browsing
    gsb_status, _ = await safebrowsing_client.check_safe_browsing(url, client)

    if gsb_status == safebrowsing_client.GSB_STATUS_DANGEROUS:
        # GSB에서 위험으로 본 것은 전역 차단 테이블에 기록
        service.add_global_block(
            url,
            ai_reason="Google Safe Browsing: Malware/Social Engineering",
            suggested_url=None,
        )
        return {
            "decision": "BLOCK",
            "reason": REASON_GSB_MATCH,
            "suggested_official_url": None,
        }

    # 3) Gemini 분석
    gemini_result = await gemini_client.analyze_url_with_gemini(url, client)

    score = gemini_result.get("score", 0)
    ai_reason = gemini_result.get("reason")
    suggested_url = gemini_result.get("suggested_url")

    # HIGH RISK → 전역 차단 + BLOCK
    if score >= 80:
        service.add_global_block(url, ai_reason=ai_reason, suggested_url=suggested_url)
        return {
            "decision": "BLOCK",
            "reason": f"{REASON_GEMINI_BLOCK} (Score: {score}, Reason: {ai_reason})",
            "suggested_official_url": suggested_url,
        }

    # 중간 위험 → WARN
    if score >= 50:
        return {
            "decision": "WARN",
            "reason": f"{REASON_GEMINI_WARN} (Score: {score}, Reason: {ai_reason})",
            "suggested_official_url": suggested_url,
        }

    # SAFE
    return {
        "decision": "SAFE",
        "reason": REASON_SAFE,
        "suggested_official_url": suggested_url,
    }
