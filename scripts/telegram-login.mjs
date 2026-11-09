// Login da sua conta do Telegram (uma vez), para o leitor do grupo do balcão.
//
// Uso: npm run telegram:login
// Precisa no .env: TELEGRAM_API_ID e TELEGRAM_API_HASH (gerados em my.telegram.org).
// Você digita o número, o código que chega no Telegram e a senha de duas etapas (se tiver). A chave de sessão
// vai direto para o .env (TELEGRAM_SESSION) e não aparece na tela: ela dá acesso à sua conta, como uma senha.
// No servidor, copie o mesmo valor para as variáveis de ambiente de lá.
// Com a sessão já salva, o script só lista os seus grupos, para você escolher o do balcão (TELEGRAM_GROUP_ID).
// O script não envia mensagem nenhuma.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const require = createRequire(import.meta.url);
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");

const ENV = ".env";
if (existsSync(ENV)) process.loadEnvFile(ENV);
const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH?.trim();
if (!apiId || !apiHash) {
  console.error("Coloque TELEGRAM_API_ID e TELEGRAM_API_HASH no .env (gerados em my.telegram.org) e rode de novo.");
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
// senha sem aparecer na tela
let muted = false;
const write = rl._writeToOutput.bind(rl);
rl._writeToOutput = (s) => { if (!muted) write(s); };
const ask = (q) => rl.question(q);
async function askHidden(q) {
  process.stdout.write(q);
  muted = true;
  try { return await rl.question(""); } finally { muted = false; process.stdout.write("\n"); }
}

/** Grava (ou troca) uma linha CHAVE=valor no .env, mantendo o resto do arquivo. */
function saveEnv(key, value) {
  const raw = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);
  const i = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (i >= 0) lines[i] = `${key}=${value}`;
  else {
    while (lines.length && lines.at(-1) === "") lines.pop();
    lines.push(`${key}=${value}`, "");
  }
  writeFileSync(ENV, lines.join(eol));
}

const saved = process.env.TELEGRAM_SESSION?.trim() ?? "";
const client = new TelegramClient(new StringSession(saved), apiId, apiHash, { connectionRetries: 5 });
client.setLogLevel("error");

try {
  if (saved) {
    await client.connect();
    if (!(await client.checkAuthorization())) throw new Error("A sessão salva não vale mais: apague TELEGRAM_SESSION do .env e rode de novo para entrar.");
  } else {
    await client.start({
      phoneNumber: () => ask("Seu número com DDI (ex.: +5511999998888): "),
      phoneCode: () => ask("Código que chegou no Telegram: "),
      password: () => askHidden("Senha de duas etapas: "),
      onError: (e) => console.error(`Erro: ${e.message}`),
    });
    saveEnv("TELEGRAM_SESSION", client.session.save());
    console.log("\nPronto: sessão salva no .env (TELEGRAM_SESSION). Não envie esse valor para ninguém.");
  }
  const me = await client.getMe();
  console.log(`\nConectado como ${[me.firstName, me.lastName].filter(Boolean).join(" ")}${me.username ? ` (@${me.username})` : ""}.`);

  const dialogs = await client.getDialogs({ limit: 300 });
  const groups = dialogs.filter((d) => d.isGroup || d.isChannel);
  console.log("\nSeus grupos e canais (copie o número do grupo do balcão para TELEGRAM_GROUP_ID no .env):\n");
  for (const d of groups) console.log(`  ${String(d.id).padStart(16)}  ${d.title ?? "(sem nome)"}${d.isChannel && !d.isGroup ? "  [canal]" : ""}`);
  if (!groups.length) console.log("  Nenhum grupo encontrado.");
} catch (e) {
  console.error(`\n${e.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
  await client.disconnect().catch(() => {});
  process.exit(process.exitCode ?? 0);
}
