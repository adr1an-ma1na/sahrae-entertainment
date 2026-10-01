// The shipped release build type (R8 shrinking + obfuscation on), made debuggable
// and signed with the debug key so the E2E flows can attach over WebView DevTools.
// Test-only: never used for an APK anyone installs.
const fs = require('fs');
const p = 'android/app/build.gradle';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(/minifyEnabled false/g, 'minifyEnabled true');
s = s.replace(/release \{/, 'release {\n            debuggable true\n            signingConfig signingConfigs.debug');
fs.writeFileSync(p, s);
console.log(s.slice(s.indexOf('buildTypes'), s.indexOf('buildTypes') + 400));
