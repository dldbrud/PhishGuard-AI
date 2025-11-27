-- URL 분석 결과 캐싱 테이블
CREATE TABLE IF NOT EXISTS url_analysis_cache (
    url_hash BINARY(32) PRIMARY KEY COMMENT 'URL의 SHA256 해시',
    url VARCHAR(500) NOT NULL COMMENT '원본 URL (디버깅용)',
    decision VARCHAR(20) NOT NULL COMMENT 'SAFE, BLOCK, WARN',
    reason TEXT NOT NULL COMMENT '분석 이유',
    score INT DEFAULT NULL COMMENT 'Gemini 분석 점수 (0-100)',
    suggested_url VARCHAR(500) DEFAULT NULL COMMENT '올바른 URL 제안',
    created_at DATETIME NOT NULL COMMENT '생성 시간',
    expires_at DATETIME NOT NULL COMMENT '만료 시간',
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='URL 분석 결과 캐시 (24시간 유효)';
