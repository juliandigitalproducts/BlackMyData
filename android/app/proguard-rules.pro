# R8 is off for now (minifyEnabled false). If it is switched on: the JavaScript bridge methods are called by name
# from the web app and must survive (LegacyBridge: fallback for WebViews without WEB_MESSAGE_LISTENER).
-keepclassmembers class de.juliandigitalproducts.blackmydata.MainActivity$LegacyBridge {
    @android.webkit.JavascriptInterface <methods>;
}
