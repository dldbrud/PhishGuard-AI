package com.example.phishingserver;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.nio.file.*;
import java.time.Instant;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*") // 개발 중엔 편하게 허용. 운영에선 제한 필요
public class ReportController {

    private static final Path FILE = Paths.get("reports.csv");

    @PostMapping("/report")
    public ResponseEntity<String> receiveReport(@RequestBody UrlReport report) {
        if (report == null || report.getUrl() == null) {
            return ResponseEntity.badRequest().body("missing url");
        }
        String line = String.format("\"%s\",%s%n", report.getUrl().replace("\"","\"\""), Instant.now().toString());
        try {
            synchronized (ReportController.class) {
                Files.writeString(FILE, line, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
            }
            System.out.println("Saved: " + report.getUrl());
            return ResponseEntity.ok("saved");
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body("error: " + e.getMessage());
        }
    }
}
