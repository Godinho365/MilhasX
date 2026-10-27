// Diagnóstico local: lista elementos que passam da largura da tela. Uso: node e2e/.debug-overflow.mjs app/sales 768
import { chromium } from "@playwright/test";
const [, , path = "app", w = "768"] = process.argv;
const base = "http://localhost:3100";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: Number(w), height: 900 } });
await p.request.post(`${base}/api/auth/login`, { data: { email: "demo@milheiro.local", password: "demo12345" } });
await p.goto(`${base}/${path.split("/").filter(Boolean).join("/")}`, { waitUntil: "networkidle" });
const out = await p.evaluate(() => {
  const cw = document.documentElement.clientWidth;
  const els = [...document.querySelectorAll("body *")]
    .filter((e) => e.getBoundingClientRect().right > cw + 1)
    .slice(0, 8)
    .map((e) => `${e.tagName}.${String(e.className).slice(0, 80)} r=${Math.round(e.getBoundingClientRect().right)}`);
  return { sw: document.documentElement.scrollWidth, cw, els };
});
console.log(JSON.stringify(out, null, 1));
await b.close();
