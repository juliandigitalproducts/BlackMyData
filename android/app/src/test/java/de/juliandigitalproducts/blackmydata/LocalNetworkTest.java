package de.juliandigitalproducts.blackmydata;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import org.junit.Test;

/**
 * BMD-R8: the native home-network rule for plain http:// (BMD-N10) against the same case list as the web app's
 * isPlainHttpAllowed (tests/fixtures/plain_http_hosts.txt), so both implementations cannot drift apart.
 */
public class LocalNetworkTest {

    private static Path cases() {
        String root = System.getProperty("bmd.repoRoot");
        Path dir = root != null ? Paths.get(root) : Paths.get("").toAbsolutePath().getParent().getParent();
        return dir.resolve("tests/fixtures/plain_http_hosts.txt");
    }

    @Test
    public void sharedCaseList() throws IOException {
        List<String> lines = Files.readAllLines(cases(), StandardCharsets.UTF_8);
        int checked = 0;
        for (String raw : lines) {
            String line = raw.trim();
            if (line.isEmpty() || line.startsWith("#")) continue;
            String[] parts = line.split("\\s+");
            assertEquals("bad line: " + raw, 2, parts.length);
            boolean expected;
            if (parts[0].equals("allow")) expected = true;
            else if (parts[0].equals("block")) expected = false;
            else throw new AssertionError("bad line: " + raw);
            assertEquals(parts[1], expected, LocalNetwork.isPlainHttpAllowed(parts[1]));
            checked++;
        }
        assertTrue("case list is empty", checked > 20);
    }

    @Test
    public void hostsWithoutBracketsAndEdgeCases() {
        assertTrue(LocalNetwork.isPlainHttpAllowed("::1"));
        assertTrue(LocalNetwork.isPlainHttpAllowed("fe80::abcd"));
        assertFalse(LocalNetwork.isPlainHttpAllowed(null));
        assertFalse(LocalNetwork.isPlainHttpAllowed(""));
        assertFalse(LocalNetwork.isPlainHttpAllowed("[]"));
        assertFalse(LocalNetwork.isPlainHttpAllowed("999.1.1.1"));
    }
}
