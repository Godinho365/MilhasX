// Uso: npm run admin:create -- --email voce@dominio.com --name "Seu Nome"
// A senha é pedida no terminal (sem eco) ou lida do stdin quando vier por pipe.
// Se o e-mail já existir, o usuário é promovido a administrador e a senha não muda.
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

if (existsSync(".env")) process.loadEnvFile(".env");

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function readPassword(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    let data = "";
    for await (const chunk of process.stdin) data += chunk;
    return data.split(/\r?\n/)[0] ?? "";
  }
  let muted = false;
  const output = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const email = arg("email");
  if (!email) {
    console.error('Informe --email. Ex.: npm run admin:create -- --email voce@dominio.com --name "Seu Nome"');
    process.exit(1);
  }
  const { prisma } = await import("../src/server/db");
  const { createAdmin } = await import("./create-admin-lib");
  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  let password: string | undefined;
  if (!exists) {
    password = await readPassword("Senha do administrador (mín. 8 caracteres): ");
    if (process.stdin.isTTY) {
      const confirm = await readPassword("Confirme a senha: ");
      if (confirm !== password) throw new Error("As senhas não conferem");
    }
  }
  const { user, created } = await createAdmin({ email, name: arg("name") ?? "Administrador", password });
  console.log(created ? `Administrador criado: ${user.email}` : `Usuário promovido a administrador: ${user.email}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Falha:", e instanceof Error ? e.message : e);
  process.exit(1);
});
