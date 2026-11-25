package de.juliandigitalproducts.blackmydata;

import java.io.File;
import java.util.Set;

/**
 * Temporary download files (cache/downloads/*.part) between the web app's download and the system save dialog.
 * Plain Java so it runs in JVM unit tests.
 */
final class DownloadCache {
    static final long STALE_MS = 60 * 60 * 1000L;

    private DownloadCache() { }

    /**
     * BMD-N9/B-E4: removes leftovers of a reload, a closed activity or a killed process. Files in [keep] still wait for
     * the save dialog (restored after the process was killed while it was open) and stay. In a new process nothing else
     * can be writing, so every other file goes; when only the activity is recreated in the same process, the previous
     * instance may still be saving one, so only files older than an hour go.
     *
     * @return number of deleted files
     */
    static int clean(File dir, boolean newProcess, Set<String> keep, long now) {
        File[] files = dir.listFiles();
        if (files == null) return 0;
        int deleted = 0;
        for (File f : files) {
            if (keep.contains(f.getAbsolutePath())) continue;
            if ((newProcess || f.lastModified() < now - STALE_MS) && f.delete()) deleted++;
        }
        return deleted;
    }

    /** A restored pending file is only used if it still exists and lies in the download folder (not any path). */
    static boolean isRestorable(File dir, String path) {
        if (path == null) return false;
        File f = new File(path);
        File parent = f.getParentFile();
        return parent != null && parent.getAbsolutePath().equals(dir.getAbsolutePath()) && f.isFile();
    }
}
