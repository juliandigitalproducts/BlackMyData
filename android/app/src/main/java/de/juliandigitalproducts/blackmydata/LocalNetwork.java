// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Julian Digital Products

package de.juliandigitalproducts.blackmydata;

import java.util.Locale;

/**
 * BMD-N10: plain http:// is only for AI servers on this device or in the home network (Ollama, LM Studio ...). The
 * web app checks this itself (isPlainHttpAllowed in strato_app.js); the app enforces the same rule natively, so a
 * bug or injected script in the page cannot send documents unencrypted over the internet. Keep both lists equal.
 */
final class LocalNetwork {
    private LocalNetwork() { }

    static boolean isPlainHttpAllowed(String host) {
        if (host == null) return false;
        String h = host.toLowerCase(Locale.ROOT);
        if (h.startsWith("[") && h.endsWith("]")) h = h.substring(1, h.length() - 1);
        if (h.isEmpty()) return false;
        if (h.equals("localhost") || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".lan")
                || h.endsWith(".home.arpa") || h.endsWith(".ts.net")) {
            return true;
        }
        if (h.matches("\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}")) {
            String[] p = h.split("\\.");
            int a = Integer.parseInt(p[0]);
            int b = Integer.parseInt(p[1]);
            return a == 127 || a == 10 || (a == 192 && b == 168) || (a == 172 && b >= 16 && b <= 31)
                    || (a == 169 && b == 254) || (a == 100 && b >= 64 && b <= 127);
        }
        if (!h.contains(":")) return false;
        return h.equals("::1") || h.startsWith("fe80:") || h.matches("f[cd][0-9a-f]{2}:.*");
    }
}
