// Records the deployed board in use (flow: ack-incident, with the incident panel) and prints what
// happened, with mm:ss in the video.   usage: node scripts/record.mjs <board url> <out dir>
import { chromium } from 'playwright';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
const [url, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } }, locale: 'pl-PL', timezoneId: 'Europe/Warsaw' });
const t0 = Date.now();
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
const at = () => { const s = Math.floor((Date.now() - t0) / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const events = [];
const log = (what, extra = {}) => { const e = { at: at(), ms: Date.now() - t0, what, ...extra }; events.push(e); console.log(JSON.stringify(e)); };
// a visible pointer, so the recording shows where the click goes
await page.addInitScript(() => addEventListener('DOMContentLoaded', () => {
  const dot = document.createElement('div');
  dot.style.cssText = 'position:fixed;z-index:99999;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(220,0,60,.55);border:2px solid #b00020;pointer-events:none;left:-50px;top:-50px';
  document.documentElement.appendChild(dot);
  addEventListener('mousemove', (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
  addEventListener('mousedown', () => { dot.style.background = 'rgba(220,0,60,1)'; setTimeout(() => (dot.style.background = 'rgba(220,0,60,.55)'), 400); }, true);
}));
let ackReply = null;
page.on('response', async (r) => { if (r.url().includes('/api/ack')) ackReply = { status: r.status(), body: await r.json().catch(() => null) }; });
const topId = () => page.locator('[data-testid="incident-row"]').first().getAttribute('data-id');
const panelId = () => page.locator('[data-testid="incident-panel"]').getAttribute('data-id');
const center = async (sel) => { const b = await page.locator(sel).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const arrival = (id) => page.waitForFunction((id) => document.querySelector('[data-testid="incident-row"]')?.dataset.id !== id, id);

await page.goto(url, { waitUntil: 'commit' });
log('open-board', { loader: await page.locator('[data-testid="loader"]').count() });
await page.waitForSelector('[data-testid="incident-row"]');
log('incidents on screen', { rows: await page.locator('[data-testid="incident-row"]').count(), top: await topId(), rowAckButtons: await page.locator('[data-testid="incident-row"] [data-testid="ack"]').count(), sha: await page.locator('[data-testid="build-sha"]').textContent() });
await arrival(await topId());
const target = await topId();
log('new incident arrived at the top without a reload; on-call picks it', { target });
await page.waitForTimeout(3500);
const [x, y] = await center(`[data-id="${target}"]`);
await page.mouse.move(400, 500);
await page.mouse.move(x, y, { steps: 40 });
log('pointer is on the target row', { target });
// same race as in the step-1 recording: the next arrival pushes every row down, then the click goes out
await arrival(target);
await page.waitForTimeout(150);
await page.mouse.click(x, y);
await page.waitForSelector('[data-testid="incident-panel"]');
log('click landed after the list moved; a panel opened, nothing was acked', { aimedAt: target, panelNames: await panelId(), acksSent: ackReply ? 1 : 0 });
await page.waitForTimeout(2500);
// on-call reads the panel, sees it is not the one, and picks the right row
const [x2, y2] = await center(`[data-id="${target}"]`);
await page.mouse.move(x2, y2, { steps: 25 });
await page.mouse.click(x2, y2);
await page.waitForSelector(`[data-testid="incident-panel"][data-id="${target}"]`);
log('picked the target row; the panel now names it', { panelNames: await panelId() });
// the panel holds still while the list keeps moving: wait for one more arrival, then ack
const [x3, y3] = await center('[data-testid="panel-ack"]');
await page.mouse.move(x3, y3, { steps: 25 });
await arrival(await topId());
log('another incident arrived; the panel did not move', { top: await topId(), panelNames: await panelId() });
await page.waitForTimeout(800);
await page.mouse.click(x3, y3);
await page.waitForSelector(`[data-id="${target}"] [data-testid="acked"]`);
log('Ack in the panel: the target is acked', { expected: target, got: ackReply?.body?.id, ackReply });
await page.waitForTimeout(5000);
log('end', { rows: await page.locator('[data-testid="incident-row"]').count(), ackedRows: await page.locator('[data-testid="acked"]').count() });
const video = page.video();
await ctx.close();
renameSync(await video.path(), `${out}/recording.webm`);
writeFileSync(`${out}/events.json`, JSON.stringify(events, null, 2));
await browser.close();
