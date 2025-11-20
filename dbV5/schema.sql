-- PhishGuard-AI Database Schema

-- 1. 사용자 테이블
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    display_name VARCHAR(255) DEFAULT '',
    external_id VARCHAR(255) NOT NULL UNIQUE,
    created_at DATETIME NOT NULL,
    INDEX idx_external_id (external_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. 전역 피싱 사이트 테이블
CREATE TABLE phishing_sites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    normalized_url VARCHAR(2048) NOT NULL,
    url_hash BINARY(32) NOT NULL UNIQUE,
    is_blocked TINYINT(1) DEFAULT 1,
    created_at DATETIME NOT NULL,
    INDEX idx_url_hash (url_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. 신고된 URL 테이블
CREATE TABLE reported_urls (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reporter_user_id INT NOT NULL,
    normalized_url VARCHAR(2048) NOT NULL,
    url_hash BINARY(32) NOT NULL,
    created_at DATETIME NOT NULL,
    FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_url_hash (url_hash),
    INDEX idx_reporter (reporter_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. 사용자별 개인 차단/허용 오버라이드 테이블
CREATE TABLE user_url_overrides (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    normalized_url VARCHAR(2048) NOT NULL,
    url_hash BINARY(32) NOT NULL,
    decision TINYINT(1) NOT NULL COMMENT '1=차단, 0=허용',
    created_at DATETIME NOT NULL,
    UNIQUE KEY unique_user_url (user_id, url_hash),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_decision (user_id, decision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
