# Onepiece Vault สำหรับ Android (APK)

แอปแยกจาก PWA เดิม (ที่ราก repo) · ห่อด้วย Capacitor 7 · รหัสแอป `com.han.onepiecevault` (ติดตั้งคู่กับ PWA/Meowrin ได้)

## หลักการ
- **ไม่คัดลอกวิดีโอ**: คลังเก็บแค่รายการ + ป้าย + ภาพตัวอย่าง (วิดีโอยังอยู่ที่เดิม)
- **จำไฟล์จากเนื้อหา** (`www/js/lib/fingerprint.js` = `native/.../Fingerprint.java`): SHA-256 ของขนาด + 3 ช่วง × 256 KB (ต้น/กลาง/ท้าย) → เปลี่ยนชื่อ/ย้ายโฟลเดอร์แล้วยังเป็นคลิปเดิม ป้ายไม่หาย
- **อ่านอย่างเดียว**: ไม่มีโค้ดย้าย/ลบ/เปลี่ยนชื่อไฟล์ ไม่ขอสิทธิ์เขียนไฟล์ (มี `tests/safety.test.js` เฝ้า) · "แผนย้าย" เป็นแค่ตัวอย่าง
- **ในเครื่องล้วน**: ไม่มีเครือข่าย ไม่มี AI/API เสียเงิน

## โครงสร้าง
```
www/                หน้าเว็บในแอป (ES modules ไม่มี build) · js/lib = ตรรกะล้วน ทดสอบด้วย Node
native/java/        ปลั๊กอิน Android (VaultPlugin: ลิสต์วิดีโอ, ลายนิ้วมือ, ภาพตัวอย่าง, เปิดแอปเล่น, แชร์ไฟล์สำรอง)
scripts/prepare-wrapper.mjs   สร้างโปรเจกต์ Android ใน wrap/ (CI ใช้)
tests/              unit + e2e (Chromium)
```

## คำสั่ง
```bash
npm test                     # unit ทั้ง PWA และแอนดรอยด์ (รวมเทียบ JS/Java ถ้ามี javac)
npm run test:android:e2e     # ต้องมี playwright + ffmpeg
node android/scripts/prepare-wrapper.mjs   # เตรียมโปรเจกต์ (ต้องมีเน็ต) แล้ว cd wrap/android && ./gradlew assembleDebug
```
หรือใช้ GitHub Actions `android-apk` ได้ไฟล์ APK ใน Artifacts

## ที่ยังไม่ได้ทำ / ยังไม่ทดสอบบนมือถือจริง
ดูรายงานท้ายงานใน commit · ตัดฉากอัตโนมัติ (แบบ Meowrin), AI ช่วยติดป้าย, ย้ายไฟล์จริง = ยังไม่ทำโดยตั้งใจ
