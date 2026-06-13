# ─────────────────────────────────────────────────────────────
# Sahrae Entertainment — R8 / ProGuard keep rules (release build).
#
# Goal: shrink + obfuscate the parts that are safe to touch (third-party
# library code), while keeping everything that Capacitor / Cordova / the
# WebView reach via reflection or by name — so the app never breaks.
# ─────────────────────────────────────────────────────────────

# Keep line numbers for readable crash reports, but hide original file names.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,Exceptions

# ── Capacitor core + plugins (discovered & invoked via reflection) ──
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep class com.capacitorjs.** { *; }
-keep public class * extends com.getcapacitor.Plugin { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.annotation.CapacitorPlugin <fields>;
    @com.getcapacitor.PluginMethod public <methods>;
}

# ── Cordova compatibility shims bundled by Capacitor ──
-keep class org.apache.cordova.** { *; }

# ── Our own code: MainActivity is referenced by the manifest and overrides
#    Bridge WebView internals; keep it intact. ──
-keep class com.sahrae.entertainment.** { *; }

# ── WebView JavaScript bridge methods must keep their names ──
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ── Don't fail the build on missing optional references in libraries ──
-dontwarn com.getcapacitor.**
-dontwarn org.apache.cordova.**
-dontwarn javax.**
-dontwarn org.slf4j.**
