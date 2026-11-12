// สร้างโปรเจกต์ Android (Capacitor 7) ในโฟลเดอร์ wrap/ จากโค้ดใน android/ — ไม่แตะ PWA เดิมที่ราก repo
// ใช้ใน GitHub Actions (.github/workflows/android.yml) และรันเองได้: node android/scripts/prepare-wrapper.mjs
// ตัวแปรเสริม: RUN_NUMBER (เลขเวอร์ชันแอป) · ANDROID_KEYSTORE_B64/ANDROID_KEYSTORE_PASSWORD/ANDROID_KEY_ALIAS (กุญแจเซ็นคงที่)
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const wrap = join(repo, 'wrap');
const APP_ID = 'com.han.onepiecevault';
const sh = (cmd, cwd = wrap) => execSync(cmd, { cwd, stdio: 'inherit' });
const edit = (file, fn) => { const s = readFileSync(file, 'utf8'); const out = fn(s); if (out === s) throw new Error(`แก้ไฟล์ไม่เข้า: ${file}`); writeFileSync(file, out); };

rmSync(wrap, { recursive: true, force: true });
mkdirSync(wrap, { recursive: true });
cpSync(join(repo, 'android/www'), join(wrap, 'www'), { recursive: true });
sh('npm init -y');
sh('npm install --no-audit --no-fund @capacitor/core@7 @capacitor/cli@7 @capacitor/android@7');
writeFileSync(join(wrap, 'capacitor.config.json'), JSON.stringify({
  appId: APP_ID, appName: 'Onepiece Vault', webDir: 'www', backgroundColor: '#07140d',
  android: { adjustMarginsForEdgeToEdge: 'force' },
}, null, 2));
sh('npx cap add android');

const app = join(wrap, 'android/app');
const javaDir = join(app, 'src/main/java', ...APP_ID.split('.'));
mkdirSync(javaDir, { recursive: true });
for (const f of ['Fingerprint.java', 'VaultPlugin.java']) cpSync(join(repo, 'android/native/java', ...APP_ID.split('.'), f), join(javaDir, f));
writeFileSync(join(javaDir, 'MainActivity.java'), `package ${APP_ID};

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VaultPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`);

// สิทธิ์: อ่านวิดีโออย่างเดียว (ไม่ขอสิทธิ์เขียน/จัดการไฟล์ทั้งเครื่อง)
edit(join(app, 'src/main/AndroidManifest.xml'), (s) => s.replace('<application',
  '<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />\n    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />\n    <application'));

const run = process.env.RUN_NUMBER || '1';
edit(join(app, 'build.gradle'), (s) => s.replace(/versionCode \d+/, `versionCode ${run}`).replace(/versionName "[^"]*"/, `versionName "0.1.${run}"`));

if (process.env.ANDROID_KEYSTORE_B64) {
  writeFileSync(join(app, 'opv.keystore'), Buffer.from(process.env.ANDROID_KEYSTORE_B64, 'base64'));
  const q = (v) => JSON.stringify(v);
  edit(join(app, 'build.gradle'), (s) => s.replace('\nandroid {\n', `\nandroid {\n    signingConfigs {\n        debug {\n            storeFile file("opv.keystore")\n            storePassword ${q(process.env.ANDROID_KEYSTORE_PASSWORD || '')}\n            keyAlias ${q(process.env.ANDROID_KEY_ALIAS || 'opv')}\n            keyPassword ${q(process.env.ANDROID_KEYSTORE_PASSWORD || '')}\n        }\n    }\n`));
  console.log('ใช้กุญแจเซ็นคงที่จาก secret');
} else {
  console.log('ไม่มีกุญแจเซ็นคงที่: APK จะเซ็นด้วยกุญแจ debug ชั่วคราวของเครื่องสร้าง (ติดตั้งทับเวอร์ชันก่อนหน้าไม่ได้)');
}
sh('npx cap sync android');
console.log('เตรียมโปรเจกต์ Android เสร็จ: wrap/android');
