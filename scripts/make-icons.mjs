// สร้างไอคอน PNG จาก icons/icon.svg ด้วย Playwright (รันเมื่อแก้ไอคอนเท่านั้น)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFile } from 'node:fs/promises';

const svg = await readFile(new URL('../icons/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
async function shot(file, size, pad = 0) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const inner = size - pad * 2;
  await page.setContent(`<body style="margin:0;background:#0b1f14"><div style="padding:${pad}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body>`);
  await page.screenshot({ path: new URL(`../icons/${file}`, import.meta.url).pathname });
  await page.close();
}
await shot('icon-192.png', 192);
await shot('icon-512.png', 512);
await shot('icon-maskable-512.png', 512, 64); // เผื่อขอบสำหรับ maskable
await browser.close();
