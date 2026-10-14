// Gera docs/manual-futebol-da-missao.pdf a partir de docs/manual/manual.html
// usando o Edge ou o Chrome instalado (modo sem janela). Uso: npm run manual
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const here = resolve(import.meta.dirname);
const html = join(here, "manual.html");
const out = resolve(here, "..", "manual-futebol-da-missao.pdf");

const candidates = [
  process.env.CHROME_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const browser = candidates.find((p) => existsSync(p));
if (!browser) {
  console.error("Não achei Edge nem Chrome. Defina CHROME_PATH com o caminho do navegador.");
  process.exit(1);
}

const profile = mkdtempSync(join(tmpdir(), "manual-pdf-"));
try {
  execFileSync(browser, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-pdf-header-footer",
    `--user-data-dir=${profile}`,
    `--print-to-pdf=${out}`,
    pathToFileURL(html).href,
  ], { stdio: "ignore" });
} finally {
  rmSync(profile, { recursive: true, force: true });
}
console.log(`PDF gerado: ${out}`);
