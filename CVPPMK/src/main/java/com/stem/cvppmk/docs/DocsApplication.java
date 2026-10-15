package com.stem.cvppmk.docs;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;

@SpringBootApplication
public class DocsApplication {
    public static void main(String[] args) {
        SpringApplication.run(DocsApplication.class, args);
    }

    // Buka browser default sekali saat start. System property bertahan di JVM yang sama,
    // jadi restart oleh devtools tidak membuka tab baru lagi.
    @EventListener(ApplicationReadyEvent.class)
    public void openBrowser(ApplicationReadyEvent event) {
        if (System.getProperty("docs.browser.opened") != null) return;
        System.setProperty("docs.browser.opened", "true");

        Environment env = event.getApplicationContext().getEnvironment();
        String url = "http://localhost:" + env.getProperty("local.server.port", "8090") + "/";
        try {
            String os = System.getProperty("os.name").toLowerCase();
            if (os.contains("win")) new ProcessBuilder("rundll32", "url.dll,FileProtocolHandler", url).start();
            else if (os.contains("mac")) new ProcessBuilder("open", url).start();
            else new ProcessBuilder("xdg-open", url).start();
        } catch (Exception e) {
            System.out.println("Buka manual: " + url);
        }
    }
}
