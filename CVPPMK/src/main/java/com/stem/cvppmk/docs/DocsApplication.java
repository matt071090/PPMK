package com.stem.cvppmk.docs;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.web.servlet.support.SpringBootServletInitializer;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;

/**
 * Dua cara jalan:
 * - main() (VS Code / java -jar): mode dev, Mode edit aktif dan browser dibuka otomatis.
 * - cvppmk.war di Tomcat (configure()): web final, read-only, tanpa buka browser.
 */
@SpringBootApplication
public class DocsApplication extends SpringBootServletInitializer {
    public static void main(String[] args) {
        SpringApplication.run(DocsApplication.class, args);
    }

    @Override
    protected SpringApplicationBuilder configure(SpringApplicationBuilder builder) {
        return builder.sources(DocsApplication.class)
                .properties("docs.edit.enabled=false", "docs.open-browser=false");
    }

    // Buka browser default sekali saat start. System property bertahan di JVM yang sama,
    // jadi restart oleh devtools tidak membuka tab baru lagi.
    @EventListener(ApplicationReadyEvent.class)
    public void openBrowser(ApplicationReadyEvent event) {
        Environment env = event.getApplicationContext().getEnvironment();
        if (!env.getProperty("docs.open-browser", Boolean.class, true)) return;
        if (System.getProperty("docs.browser.opened") != null) return;
        System.setProperty("docs.browser.opened", "true");

        String url = "http://localhost:" + env.getProperty("local.server.port", "8090")
                + env.getProperty("server.servlet.context-path", "") + "/";
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
