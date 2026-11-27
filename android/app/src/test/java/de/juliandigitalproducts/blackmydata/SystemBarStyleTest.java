// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Julian Digital Products

package de.juliandigitalproducts.blackmydata;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** B-E1: status bar colours and icon contrast follow the web app's theme. */
public class SystemBarStyleTest {

    @Test
    public void parsesOnlyHexColours() {
        assertEquals(Integer.valueOf(0xFF1E293B), SystemBarStyle.parseHexColor("#1e293b"));
        assertEquals(Integer.valueOf(0xFFFFFFFF), SystemBarStyle.parseHexColor("#FFFFFF"));
        assertNull(SystemBarStyle.parseHexColor(""));
        assertNull(SystemBarStyle.parseHexColor(null));
        assertNull(SystemBarStyle.parseHexColor("rgb(1, 2, 3)"));
        assertNull(SystemBarStyle.parseHexColor("#12345"));
    }

    @Test
    public void lightThemeGetsDarkIcons() {
        SystemBarStyle light = SystemBarStyle.from("light", "#ffffff", "#f8fafc");
        assertTrue("dark status bar icons on the white header", light.lightTop);
        assertTrue(light.lightBottom);
        assertEquals(0xFFFFFFFF, light.top);
        assertEquals(0xFFF8FAFC, light.bottom);
    }

    @Test
    public void darkThemeGetsLightIcons() {
        SystemBarStyle dark = SystemBarStyle.from("dark", "#1e293b", "#0f172a");
        assertFalse(dark.lightTop);
        assertFalse(dark.lightBottom);
    }

    @Test
    public void brokenColoursFallBackToTheTheme() {
        SystemBarStyle light = SystemBarStyle.from("light", "", "nonsense");
        assertEquals(SystemBarStyle.DEFAULT_LIGHT.top, light.top);
        assertEquals(SystemBarStyle.DEFAULT_LIGHT.bottom, light.bottom);
        assertTrue(light.lightTop);
        SystemBarStyle unknown = SystemBarStyle.from(null, null, null);
        assertEquals(SystemBarStyle.DEFAULT_DARK.top, unknown.top);
        assertFalse(unknown.lightTop);
    }

    @Test
    public void defaultsMatchStyleCss() throws Exception {
        String css = new String(java.nio.file.Files.readAllBytes(repo().resolve("app/static/style.css")), "UTF-8");
        String root = css.substring(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
        String light = css.substring(css.indexOf("[data-theme=\"light\"] {"), css.indexOf("}", css.indexOf("[data-theme=\"light\"] {")));
        assertTrue(root.contains("--bg-secondary: #1e293b") && root.contains("--bg-primary: #0f172a"));
        assertTrue(light.contains("--bg-secondary: #ffffff") && light.contains("--bg-primary: #f8fafc"));
    }

    private static java.nio.file.Path repo() {
        String root = System.getProperty("bmd.repoRoot");
        return root != null ? java.nio.file.Paths.get(root)
                : java.nio.file.Paths.get("").toAbsolutePath().getParent().getParent();
    }
}
