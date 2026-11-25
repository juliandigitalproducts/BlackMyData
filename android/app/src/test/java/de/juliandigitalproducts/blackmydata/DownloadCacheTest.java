package de.juliandigitalproducts.blackmydata;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.Collections;
import java.util.Set;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/** B-E4: leftover cache/downloads/*.part files after a killed process, and files restored for the save dialog. */
public class DownloadCacheTest {
    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private File part(File dir, String name, long ageMs, long now) throws IOException {
        File f = new File(dir, name);
        Files.write(f.toPath(), new byte[]{1, 2, 3});
        assertTrue(f.setLastModified(now - ageMs));
        return f;
    }

    @Test
    public void newProcessRemovesEveryLeftoverEvenFreshOnes() throws IOException {
        File dir = tmp.newFolder("downloads");
        long now = System.currentTimeMillis();
        File fresh = part(dir, "bmd1.part", 1000, now);
        File old = part(dir, "bmd2.part", 2 * DownloadCache.STALE_MS, now);
        assertEquals(2, DownloadCache.clean(dir, true, Collections.emptySet(), now));
        assertFalse(fresh.exists());
        assertFalse(old.exists());
    }

    @Test
    public void recreatedActivityKeepsFilesTheOldInstanceMayStillSave() throws IOException {
        File dir = tmp.newFolder("downloads");
        long now = System.currentTimeMillis();
        File fresh = part(dir, "bmd1.part", 1000, now);
        File old = part(dir, "bmd2.part", 2 * DownloadCache.STALE_MS, now);
        assertEquals(1, DownloadCache.clean(dir, false, Collections.emptySet(), now));
        assertTrue(fresh.exists());
        assertFalse(old.exists());
    }

    @Test
    public void filesWaitingForTheSaveDialogStay() throws IOException {
        File dir = tmp.newFolder("downloads");
        long now = System.currentTimeMillis();
        File waiting = part(dir, "bmd1.part", 2 * DownloadCache.STALE_MS, now);
        File other = part(dir, "bmd2.part", 1000, now);
        Set<String> keep = Collections.singleton(waiting.getAbsolutePath());
        assertEquals(1, DownloadCache.clean(dir, true, keep, now));
        assertTrue(waiting.exists());
        assertFalse(other.exists());
    }

    @Test
    public void missingFolderIsNoError() {
        assertEquals(0, DownloadCache.clean(new File(tmp.getRoot(), "none"), true, Collections.emptySet(), 0));
    }

    @Test
    public void onlyExistingFilesInTheDownloadFolderAreRestored() throws IOException {
        File dir = tmp.newFolder("downloads");
        long now = System.currentTimeMillis();
        File waiting = part(dir, "bmd1.part", 0, now);
        File outside = tmp.newFile("elsewhere.part");
        assertTrue(DownloadCache.isRestorable(dir, waiting.getAbsolutePath()));
        assertFalse("removed by the system meanwhile", DownloadCache.isRestorable(dir, new File(dir, "gone.part").getAbsolutePath()));
        assertFalse("not in the download folder", DownloadCache.isRestorable(dir, outside.getAbsolutePath()));
        assertFalse(DownloadCache.isRestorable(dir, dir.getAbsolutePath() + "/../elsewhere.part"));
        assertFalse(DownloadCache.isRestorable(dir, null));
    }
}
