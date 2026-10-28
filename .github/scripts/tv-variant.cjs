// Turns the generated Android project into Sahrae TV: its own app id (so it
// installs beside the phone app), its own name, landscape only, and declared
// as a television app. Run after the native overlay is applied.
const fs = require('fs');

const must = (cond, what) => { if (!cond) { console.error(`tv-variant: ${what}`); process.exit(1); } };

// 1. App id and version name.
const gradle = 'android/app/build.gradle';
let g = fs.readFileSync(gradle, 'utf8');
must(/applicationId "com\.sahrae\.entertainment"/.test(g), 'applicationId not found');
g = g.replace(/applicationId "com\.sahrae\.entertainment"/, 'applicationId "com.sahrae.entertainment.tv"');
g = g.replace(/versionName "([^"]+)"/, (m, v) => `versionName "${v}-tv"`);
fs.writeFileSync(gradle, g);

// 2. Name on the TV home screen.
const strings = 'android/app/src/main/res/values/strings.xml';
let x = fs.readFileSync(strings, 'utf8');
x = x.replace(/(<string name="app_name">)[^<]*(<\/string>)/, '$1Sahrae TV$2')
     .replace(/(<string name="title_activity_main">)[^<]*(<\/string>)/, '$1Sahrae TV$2');
must(x.includes('>Sahrae TV<'), 'app name not set');
fs.writeFileSync(strings, x);

// 3. Manifest: landscape, and a TV app (Play lists it for TVs only).
const manifest = 'android/app/src/main/AndroidManifest.xml';
let m = fs.readFileSync(manifest, 'utf8');
must(m.includes('android:name="com.sahrae.entertainment.MainActivity"'), 'MainActivity not found');
m = m.replace('android:name="com.sahrae.entertainment.MainActivity"',
  'android:name="com.sahrae.entertainment.MainActivity"\n            android:screenOrientation="landscape"');
m = m.replace('<uses-feature android:name="android.software.leanback" android:required="false" />',
  '<uses-feature android:name="android.software.leanback" android:required="true" />');
must(m.includes('android.software.leanback" android:required="true"'), 'leanback feature not set');
must(m.includes('android.intent.category.LEANBACK_LAUNCHER'), 'TV launcher entry missing');
fs.writeFileSync(manifest, m);

// 4. Fit a wider page to the screen. The page asks for a layout wider than the
//    TV reports (90% by default, src/tv/tvViewport.ts); the WebView honours it only with
//    useWideViewPort, and loadWithOverviewMode scales it to fit the screen.
const activity = 'android/app/src/main/java/com/sahrae/entertainment/MainActivity.java';
let j = fs.readFileSync(activity, 'utf8');
const anchor = 'webView.getSettings().setMediaPlaybackRequiresUserGesture(false);';
must(j.includes(anchor), 'WebView settings anchor not found');
j = j.replace(anchor, anchor + '\n        webView.getSettings().setUseWideViewPort(true);\n        webView.getSettings().setLoadWithOverviewMode(true);');
must(j.includes('setLoadWithOverviewMode(true)'), 'wide viewport not set');
fs.writeFileSync(activity, j);

console.log('Sahrae TV: com.sahrae.entertainment.tv, landscape, leanback required, wide page');
