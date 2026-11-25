package de.juliandigitalproducts.blackmydata;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.json.JSONObject;
import java.util.ArrayDeque;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;

public class MainActivity extends AppCompatActivity {

    /** The app's own origin (WebViewAssetLoader). Only pages from here get the download hook and bridge. */
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String APP_ORIGIN = "https://" + APP_HOST;
    /** Files are streamed in chunks to a temporary file (M11), so only the free storage limits the size. */
    private static final long MAX_DOWNLOAD_BYTES = 2048L * 1024 * 1024;

    /** False until the first activity of this process starts (B-E4: then no older instance can still be saving). */
    private static boolean processStarted = false;

    private static final String STATE_PENDING_PATHS = "bmd.pending.paths";
    private static final String STATE_PENDING_NAMES = "bmd.pending.names";
    private static final String STATE_PENDING_MIMES = "bmd.pending.mimes";
    private static final String STATE_SAVE_DIALOG_OPEN = "bmd.saveDialogOpen";

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private WebView webView;
    /** B-E1: covers the status bar area in the header colour; the root's background shows behind the navigation bar. */
    private View statusBarScrim;
    private FrameLayout root;
    private ValueCallback<Uri[]> filePathCallback;

    /**
     * WebView ignores downloads of blob: URLs, which is how the web app hands out
     * redacted PDFs and ZIPs. An injected script catches clicks on <a download>,
     * reads the blob and passes it here; the user then picks the target with the
     * system save dialog (no storage permission needed). Several downloads are
     * queued and saved one after another.
     */
    private static final class PendingFile {
        final File file;
        final String name;
        final String mime;

        PendingFile(File file, String name, String mime) {
            this.file = file;
            this.name = name;
            this.mime = mime;
        }
    }

    /** A download being received chunk by chunk. Only touched on the [io] thread. */
    private static final class Incoming {
        final File file;
        final OutputStream out;
        final String name;
        final String mime;
        long written = 0;

        Incoming(File file, OutputStream out, String name, String mime) {
            this.file = file;
            this.out = out;
            this.name = name;
            this.mime = mime;
        }
    }

    private final Map<String, Incoming> incoming = new HashMap<>();

    private final ArrayDeque<PendingFile> pendingFiles = new ArrayDeque<>();
    private boolean saveDialogOpen = false;

    /*
     * BMD-N4 back pressure: with WebMessageListener the app answers every chunk with {id, ok}; the page sends the next
     * chunk only after ok:true and stops on ok:false (write error, too large). The legacy bridge has no reply channel
     * and keeps sending without waiting (the app then ignores chunks of an aborted download).
     */
    private static final String DOWNLOAD_HOOK =
            "(function(){if(window.__bmdDownloadHook)return;window.__bmdDownloadHook=true;var W={},L=false;"
            + "document.addEventListener('click',function(e){"
            + "var a=e.target&&e.target.closest?e.target.closest('a[download]'):null;"
            + "if(!a||!/^(blob|data):/.test(a.href))return;"
            + "e.preventDefault();e.stopPropagation();"
            + "var name=a.getAttribute('download')||'BlackMyData.pdf';"
            + "var B=window.BlackMyDataAndroid;if(!B)return;"
            + "var acks=!!(B.postMessage&&B.addEventListener);"
            + "if(acks&&!L){L=true;B.addEventListener('message',function(ev){"
            + "try{var r=JSON.parse(ev.data),w=W[r.id];if(w){delete W[r.id];w(r);}}catch(err){}});}"
            + "var send=function(o){var s=JSON.stringify(o);if(B.postMessage)B.postMessage(s);else B.message(s);};"
            + "var id=String(Date.now())+Math.random().toString(36).slice(2);"
            + "var x=new XMLHttpRequest();x.open('GET',a.href);x.responseType='blob';"
            + "x.onload=function(){var b=x.response;"
            + "if(b.size>" + MAX_DOWNLOAD_BYTES + "){send({op:'fail',msg:'Datei zu gro\u00df ('+Math.round(b.size/1048576)+' MB)'});return;}"
            + "send({op:'begin',id:id,name:name,mime:b.type||'application/octet-stream',size:b.size});"
            + "var CH=393216,off=0;"
            + "var next=function(){if(off>=b.size){send({op:'end',id:id});return;}"
            + "b.slice(off,off+CH).arrayBuffer().then(function(buf){var u=new Uint8Array(buf),s='';"
            + "for(var i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));"
            + "off+=CH;if(acks)W[id]=function(r){if(r.ok)next();};"
            + "send({op:'chunk',id:id,data:btoa(s)});if(!acks)setTimeout(next,0);})"
            + "['catch'](function(){send({op:'fail',id:id,msg:'Datei konnte nicht gelesen werden'});});};next();};"
            + "x.onerror=function(){send({op:'fail',id:id,msg:'Datei konnte nicht gelesen werden'});};x.send();"
            + "},true);})();";

    private final ActivityResultLauncher<Intent> saveFileLauncher =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
                PendingFile file = pendingFiles.poll();
                saveDialogOpen = false;
                if (file != null && result.getResultCode() == RESULT_OK && result.getData() != null
                        && result.getData().getData() != null) {
                    Uri target = result.getData().getData();
                    // Writing a large ZIP on the UI thread froze the app (B11).
                    runIo(() -> {
                        String message;
                        try (OutputStream out = getContentResolver().openOutputStream(target, "wt");
                             InputStream in = new FileInputStream(file.file)) {
                            if (out == null) throw new IllegalStateException("Ziel kann nicht geöffnet werden");
                            byte[] buf = new byte[64 * 1024];
                            int n;
                            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                            message = "Gespeichert: " + file.name;
                        } catch (Exception e) {
                            // B-E4: no empty or cut-off file stays behind in the chosen folder.
                            deleteCreatedDocument(target, false);
                            message = "Speichern fehlgeschlagen: " + e.getMessage() + ". Bitte erneut herunterladen.";
                        } finally {
                            //noinspection ResultOfMethodCallIgnored
                            file.file.delete();
                        }
                        String shown = message;
                        runOnUiThread(() -> Toast.makeText(this, shown, Toast.LENGTH_LONG).show());
                    });
                }
                else if (file != null) {
                    // Cancelled: the temporary copy is not kept.
                    runIo(file.file::delete);
                }
                else if (result.getResultCode() == RESULT_OK && result.getData() != null
                        && result.getData().getData() != null) {
                    // B-E4: the file to save is gone (e.g. the system removed the cache while the dialog was open).
                    // The dialog already created an empty file: remove it and tell the user.
                    Uri target = result.getData().getData();
                    runIo(() -> {
                        deleteCreatedDocument(target, true);
                        runOnUiThread(() -> Toast.makeText(this,
                                "Speichern nicht möglich: Die Datei war nicht mehr vorhanden. Bitte erneut herunterladen.",
                                Toast.LENGTH_LONG).show());
                    });
                }
                showNextSaveDialog();
            });

    /**
     * Removes a document the save dialog created when nothing (or not everything) could be written into it. With
     * [onlyIfEmpty] a file that already has content is left alone. Only on the [io] thread.
     */
    private void deleteCreatedDocument(Uri target, boolean onlyIfEmpty) {
        try {
            if (onlyIfEmpty) {
                try (Cursor c = getContentResolver().query(target, new String[]{OpenableColumns.SIZE}, null, null, null)) {
                    if (c == null || !c.moveToFirst() || c.isNull(0) || c.getLong(0) != 0) return;
                }
            }
            DocumentsContract.deleteDocument(getContentResolver(), target);
        } catch (Exception ignored) {
            // provider without delete support: the file stays, the toast tells the user
        }
    }

    private void showNextSaveDialog() {
        PendingFile next = pendingFiles.peek();
        if (next == null || saveDialogOpen) return;
        saveDialogOpen = true;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(next.mime);
        intent.putExtra(Intent.EXTRA_TITLE, next.name);
        saveFileLauncher.launch(intent);
    }

    /**
     * Messages of the download hook: begin / chunk / end / fail. Chunks are written straight to a file in the cache
     * folder in arrival order (single [io] thread), so a large ZIP never sits in memory as one Base64 string.
     * BMD-N4: any error (storage full, over 2 GB, bad data) aborts the download for good: the partial file is deleted,
     * later chunks and "end" of that id are ignored, so a truncated file is never offered for saving.
     */
    private void onBridgeMessage(String json, JavaScriptReplyProxy reply) {
        // B-E1: theme messages are tiny; chunks (up to 512 KB of Base64) are never parsed on the calling thread.
        if (json.length() < 512 && json.contains("\"theme\"")) {
            try {
                JSONObject m = new JSONObject(json);
                if ("theme".equals(m.optString("op"))) {
                    SystemBarStyle style = SystemBarStyle.from(m.optString("theme"), m.optString("top"), m.optString("bottom"));
                    runOnUiThread(() -> applySystemBarStyle(style));
                    return;
                }
            } catch (Exception ignored) {
                // not a theme message after all
            }
        }
        runIo(() -> {
            String op = "";
            String id = "";
            try {
                JSONObject m = new JSONObject(json);
                op = m.optString("op");
                id = m.optString("id");
                switch (op) {
                    case "begin": {
                        if (m.optLong("size", 0) > MAX_DOWNLOAD_BYTES) throw new IllegalStateException("Datei zu groß (über 2 GB)");
                        abort(id);
                        File dir = downloadDir();
                        //noinspection ResultOfMethodCallIgnored
                        dir.mkdirs();
                        File f = File.createTempFile("bmd", ".part", dir);
                        String name = m.optString("name", "BlackMyData.pdf").replaceAll("[\\\\/:*?\"<>|]", "_");
                        try {
                            incoming.put(id, new Incoming(f, new FileOutputStream(f), name, m.optString("mime", "application/octet-stream")));
                        } catch (Exception e) {
                            //noinspection ResultOfMethodCallIgnored
                            f.delete();
                            throw e;
                        }
                        break;
                    }
                    case "chunk": {
                        Incoming in = incoming.get(id);
                        if (in == null) {   // aborted earlier (or unknown): tell the page to stop
                            ack(reply, id, false);
                            return;
                        }
                        byte[] bytes = Base64.decode(m.optString("data"), Base64.DEFAULT);
                        if (in.written + bytes.length > MAX_DOWNLOAD_BYTES) throw new IllegalStateException("Datei zu groß (über 2 GB)");
                        in.out.write(bytes);
                        in.written += bytes.length;
                        ack(reply, id, true);
                        break;
                    }
                    case "end": {
                        Incoming in = incoming.get(id);
                        if (in == null) return;   // aborted: nothing to save
                        in.out.close();           // a failing close (storage full) aborts in the catch below
                        incoming.remove(id);
                        PendingFile pf = new PendingFile(in.file, in.name, in.mime);
                        runOnUiThread(() -> {
                            if (isDestroyed()) {   // io is shut down; the next start cleans up anyway
                                //noinspection ResultOfMethodCallIgnored
                                pf.file.delete();
                                return;
                            }
                            pendingFiles.add(pf);
                            showNextSaveDialog();
                        });
                        break;
                    }
                    default: {
                        abort(id);
                        String msg = m.optString("msg", "unbekannter Fehler");
                        runOnUiThread(() -> Toast.makeText(MainActivity.this, "Download fehlgeschlagen: " + msg, Toast.LENGTH_LONG).show());
                    }
                }
            } catch (Exception | OutOfMemoryError e) {
                abort(id);
                if ("chunk".equals(op)) ack(reply, id, false);
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Download fehlgeschlagen: " + e.getMessage(), Toast.LENGTH_LONG).show());
            }
        });
    }

    private File downloadDir() {
        return new File(getCacheDir(), "downloads");
    }

    /** Closes and deletes a download in progress. Only on the [io] thread. */
    private void abort(String id) {
        Incoming in = incoming.remove(id);
        if (in == null) return;
        try { in.out.close(); } catch (Exception ignored) { }
        //noinspection ResultOfMethodCallIgnored
        in.file.delete();
    }

    /**
     * Answers a chunk (back pressure, see DOWNLOAD_HOOK). JavaScriptReplyProxy must be used on the UI thread. A reply
     * proxy only exists when WEB_MESSAGE_LISTENER is supported (the legacy bridge passes null), hence the lint
     * suppression.
     */
    @SuppressLint("RequiresFeature")
    private void ack(JavaScriptReplyProxy reply, String id, boolean ok) {
        if (reply == null) return;
        String msg = "{\"id\":" + JSONObject.quote(id) + ",\"ok\":" + ok + "}";
        runOnUiThread(() -> {
            try {
                reply.postMessage(msg);
            } catch (Exception ignored) {
                // page gone
            }
        });
    }

    /** B-E1: colours the area behind the status and navigation bars and picks readable (dark or light) bar icons. */
    private void applySystemBarStyle(SystemBarStyle style) {
        if (root == null || statusBarScrim == null) return;
        statusBarScrim.setBackgroundColor(style.top);
        root.setBackgroundColor(style.bottom);
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(style.lightTop);
        bars.setAppearanceLightNavigationBars(style.lightBottom);
    }

    /**
     * B-E4: files waiting for the save dialog survive a killed process: the paths go into the saved state, and the
     * dialog's result (delivered to the new process) then saves the file as usual.
     */
    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        ArrayList<String> paths = new ArrayList<>();
        ArrayList<String> names = new ArrayList<>();
        ArrayList<String> mimes = new ArrayList<>();
        for (PendingFile pf : pendingFiles) {
            paths.add(pf.file.getAbsolutePath());
            names.add(pf.name);
            mimes.add(pf.mime);
        }
        outState.putStringArrayList(STATE_PENDING_PATHS, paths);
        outState.putStringArrayList(STATE_PENDING_NAMES, names);
        outState.putStringArrayList(STATE_PENDING_MIMES, mimes);
        outState.putBoolean(STATE_SAVE_DIALOG_OPEN, saveDialogOpen);
    }

    /** Takes back the files that still wait for the save dialog; returns their paths (kept by the cleanup). */
    private Set<String> restorePendingFiles(Bundle state) {
        Set<String> keep = new HashSet<>();
        if (state == null) return keep;
        ArrayList<String> paths = state.getStringArrayList(STATE_PENDING_PATHS);
        ArrayList<String> names = state.getStringArrayList(STATE_PENDING_NAMES);
        ArrayList<String> mimes = state.getStringArrayList(STATE_PENDING_MIMES);
        if (paths == null || names == null || mimes == null
                || paths.size() != names.size() || paths.size() != mimes.size()) return keep;
        File dir = downloadDir();
        for (int i = 0; i < paths.size(); i++) {
            if (!DownloadCache.isRestorable(dir, paths.get(i))) continue;
            pendingFiles.add(new PendingFile(new File(paths.get(i)), names.get(i), mimes.get(i)));
            keep.add(new File(paths.get(i)).getAbsolutePath());
        }
        // The open dialog's result arrives in this instance; until then no second dialog.
        saveDialogOpen = state.getBoolean(STATE_SAVE_DIALOG_OPEN, false);
        return keep;
    }

    /** Fallback for WebViews without WEB_MESSAGE_LISTENER (only reachable from the app's own page, see onCreate). */
    private final class LegacyBridge {
        @JavascriptInterface
        public void message(String json) {
            onBridgeMessage(json, null);
        }
    }

    private final ActivityResultLauncher<Intent> fileChooserLauncher =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
                if (filePathCallback != null) {
                    Uri[] results = null;
                    if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                        Intent data = result.getData();
                        if (data.getClipData() != null) {
                            int count = data.getClipData().getItemCount();
                            results = new Uri[count];
                            for (int i = 0; i < count; i++) {
                                results[i] = data.getClipData().getItemAt(i).getUri();
                            }
                        } else if (data.getData() != null) {
                            results = new Uri[]{data.getData()};
                        }
                    }
                    filePathCallback.onReceiveValue(results);
                    filePathCallback = null;
                }
            });

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        final boolean newProcess = !processStarted;
        processStarted = true;
        final Set<String> keep = restorePendingFiles(savedInstanceState);
        final File dir = downloadDir();
        runIo(() -> DownloadCache.clean(dir, newProcess, keep, System.currentTimeMillis()));

        webView = new WebView(this);
        // M10/B-E1: targetSdk 35 draws edge-to-edge. Padding on the WebView itself does not move the page (the
        // emulator test found the header under the status bar), so the WebView sits in a container that leaves the
        // bars and the keyboard free; a scrim in the header colour fills the status bar area.
        root = new FrameLayout(this);
        statusBarScrim = new View(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(statusBarScrim, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, Gravity.TOP));
        setContentView(root);
        applySystemBarStyle(SystemBarStyle.DEFAULT_DARK);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, 0, bars.right, Math.max(bars.bottom, ime.bottom));
            FrameLayout.LayoutParams web = (FrameLayout.LayoutParams) webView.getLayoutParams();
            web.topMargin = bars.top;
            webView.setLayoutParams(web);
            FrameLayout.LayoutParams scrim = (FrameLayout.LayoutParams) statusBarScrim.getLayoutParams();
            scrim.height = bars.top;
            statusBarScrim.setLayoutParams(scrim);
            return WindowInsetsCompat.CONSUMED;
        });

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        // The app is served from https://appassets.androidplatform.net (WebViewAssetLoader), not
        // file://: under file:// the page has origin "null" and WebView refuses to start the
        // Web Workers that OCR (Tesseract) and PDF.js need. No direct file access is required.
        settings.setAllowFileAccess(false);
        // N5: content:// URLs are never loaded by the page (picked files reach it through the file chooser).
        settings.setAllowContentAccess(false);
        settings.setDatabaseEnabled(true);
        // B29: the page is https, a local AI server in the LAN (Ollama http://192.168.x.x:11434) is plain http.
        // That needs mixed content here and usesCleartextTraffic in the manifest (a network security config cannot
        // list private IP ranges). BMD-N10: shouldInterceptRequest below blocks http:// to anything outside the device
        // and the home network, the same rule as isPlainHttpAllowed in strato_app.js.
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        // B9/B28: bridge, download hook and the platform flag only for the app's own origin. The flag tells the
        // web app that this build ships unpacked language data (the build tool unpacks *.gz assets) instead of
        // guessing from the host name.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(webView,
                    "window.__bmdHost={platform:'android',plainLanguageData:true};" + DOWNLOAD_HOOK,
                    Collections.singleton(APP_ORIGIN));
        }
        // N5: the bridge object exists only for the app's own origin (addJavascriptInterface would expose it to any
        // page the WebView ever shows).
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, "BlackMyDataAndroid", Collections.singleton(APP_ORIGIN),
                    (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                        if (isMainFrame && message.getData() != null) onBridgeMessage(message.getData(), replyProxy);
                    });
        } else {
            webView.addJavascriptInterface(new LegacyBridge(), "BlackMyDataAndroid");
        }
        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("http".equalsIgnoreCase(url.getScheme()) && !LocalNetwork.isPlainHttpAllowed(url.getHost())) {
                    return new WebResourceResponse("text/plain", "utf-8", 403, "Forbidden",
                            Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
                }
                return assetLoader.shouldInterceptRequest(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // B9: links to other sites (website, GitHub, Ollama download) open in the browser, not in this
                // WebView with the app's bridge.
                Uri url = request.getUrl();
                if (APP_HOST.equals(url.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Link kann nicht geöffnet werden", Toast.LENGTH_SHORT).show();
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                // Fallback for old WebViews without document-start scripts; only on the app's own pages.
                if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
                        && url != null && url.startsWith(APP_ORIGIN)) {
                    view.evaluateJavascript(DOWNLOAD_HOOK, null);
                }
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;

                Intent intent = fileChooserParams.createIntent();
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    fileChooserLauncher.launch(intent);
                } catch (Exception e) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            private boolean backInProgress = false;
            private long lastBackTime = 0;

            @Override
            public void handleOnBackPressed() {
                long now = System.currentTimeMillis();
                if (now - lastBackTime < 350 || backInProgress) {
                    return; // Ignore rapid double-tap race condition
                }
                lastBackTime = now;

                if (webView.canGoBack()) {
                    webView.goBack();
                    return;
                }

                backInProgress = true;
                webView.evaluateJavascript(
                        "(function(){ return (typeof window.handleAppBack === 'function') ? window.handleAppBack() : false; })();",
                        value -> {
                            backInProgress = false;
                            if (!"true".equalsIgnoreCase(value) && !"\"true\"".equalsIgnoreCase(value)) {
                                // Hand the press to the system once. From Android 12 on the root activity is only
                                // moved to the back, so the callback must be active again when the user returns.
                                setEnabled(false);
                                try {
                                    getOnBackPressedDispatcher().onBackPressed();
                                } finally {
                                    setEnabled(true);
                                }
                            }
                        });
            }
        });

        webView.loadUrl(APP_ORIGIN + "/assets/index.html");
        // B-E4: a file restored without an open dialog (killed in between) is offered again.
        showNextSaveDialog();
    }

    @Override
    protected void onDestroy() {
        // BMD-N9: downloads in progress are not kept; files still waiting for the save dialog only stay when the
        // activity comes back (rotation, system recreation: they are in the saved state, B-E4).
        List<PendingFile> waiting = isFinishing() ? new ArrayList<>(pendingFiles) : new ArrayList<>();
        if (isFinishing()) pendingFiles.clear();
        runIo(() -> {
            for (String id : new ArrayList<>(incoming.keySet())) abort(id);
            for (PendingFile pf : waiting) {
                //noinspection ResultOfMethodCallIgnored
                pf.file.delete();
            }
        });
        io.shutdown();
        if (webView != null) {
            webView.stopLoading();
            ViewParent parent = webView.getParent();
            if (parent instanceof ViewGroup) ((ViewGroup) parent).removeView(webView);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    /**
     * Runs a task on the [io] thread. Callbacks (bridge messages, save dialog results) can still arrive after
     * onDestroy has shut the executor down; those are dropped, the next start cleans the download folder anyway.
     */
    private void runIo(Runnable task) {
        if (io.isShutdown()) return;
        try {
            io.execute(task);
        } catch (RejectedExecutionException ignored) {
            // shut down between the check and execute()
        }
    }
}
