// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Julian Digital Products

package de.juliandigitalproducts.blackmydata;

/**
 * B-E1: colours of the status bar (top, like the page header) and navigation bar (bottom, like the page) and whether
 * their icons must be dark. The web app sends {op:"theme", theme, top:"#rrggbb", bottom:"#rrggbb"} on every theme
 * change. Plain Java so it runs in JVM unit tests.
 */
final class SystemBarStyle {
    /** Colours of the dark theme (style.css :root --bg-secondary / --bg-primary), used until the page reports. */
    static final SystemBarStyle DEFAULT_DARK = new SystemBarStyle(0xFF1E293B, 0xFF0F172A);
    /** Colours of the light theme ([data-theme="light"] --bg-secondary / --bg-primary). */
    static final SystemBarStyle DEFAULT_LIGHT = new SystemBarStyle(0xFFFFFFFF, 0xFFF8FAFC);

    final int top;
    final int bottom;
    final boolean lightTop;
    final boolean lightBottom;

    SystemBarStyle(int top, int bottom) {
        this.top = top;
        this.bottom = bottom;
        this.lightTop = isLight(top);
        this.lightBottom = isLight(bottom);
    }

    /** Colours sent by the page; a missing or broken colour falls back to the theme's default. */
    static SystemBarStyle from(String theme, String top, String bottom) {
        SystemBarStyle fallback = "light".equals(theme) ? DEFAULT_LIGHT : DEFAULT_DARK;
        Integer t = parseHexColor(top);
        Integer b = parseHexColor(bottom);
        return new SystemBarStyle(t != null ? t : fallback.top, b != null ? b : fallback.bottom);
    }

    /** "#rrggbb" → opaque ARGB colour, anything else → null. */
    static Integer parseHexColor(String value) {
        if (value == null || !value.matches("#[0-9a-fA-F]{6}")) return null;
        return 0xFF000000 | Integer.parseInt(value.substring(1), 16);
    }

    /** Light background (relative luminance above the middle), so the bar icons must be dark to stay readable. */
    static boolean isLight(int color) {
        double r = channel((color >> 16) & 0xFF);
        double g = channel((color >> 8) & 0xFF);
        double b = channel(color & 0xFF);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179;
    }

    private static double channel(int c) {
        double s = c / 255.0;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    }
}
