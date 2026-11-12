import { Prisma } from "@prisma/client";
import { prisma, log } from "../db";
import { sendEmail } from "../mailer";
import { brandFromEnv } from "./layout";
import { trialEndingEmail } from "./templates";
import { notifyPrefs } from "@/domain/plans";
import { pushIfWanted } from "../push";

const HOUR = 3_600_000;
const TRIAL_BODY = "Escolha um plano em Configurações › Assinatura para continuar com todos os recursos.";

/**
 * Avisos do fim do teste grátis: um quando faltam até 3 dias e outro nas últimas 24 horas.
 * Pode rodar quantas vezes quiser: cada aviso fica registrado (EmailDispatch) e não sai de novo.
 */
export async function sendTrialReminders(now = new Date()) {
  const b = brandFromEnv();
  if (!b.appUrl) return { sent: 0 };
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      plan: "PESSOAL",
      workspaceOwnerId: null,
      trialEndsAt: { gt: now, lte: new Date(now.getTime() + 72 * HOUR) },
    },
    select: { id: true, email: true, name: true, trialEndsAt: true, createdAt: true, preference: { select: { notifications: true } } },
  });

  let sent = 0;
  for (const u of users) {
    const ends = u.trialEndsAt!;
    const left = ends.getTime() - now.getTime();
    const stage = left <= 24 * HOUR ? "1d" : "3d";
    // Teste curto (ex.: criado faz pouco): sem o aviso de 3 dias, só o do último dia
    if (stage === "3d" && ends.getTime() - u.createdAt.getTime() < 6 * 24 * HOUR) continue;
    const key = `trial:${stage}:${u.id}:${ends.toISOString()}`;
    try {
      await prisma.emailDispatch.create({ data: { userId: u.id, kind: `trial_${stage}`, key } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue; // já enviado
      throw e;
    }
    const daysLeft = stage === "1d" ? 1 : Math.ceil(left / (24 * HOUR));
    const content = trialEndingEmail({ ...b, name: u.name, endsAt: ends, daysLeft });
    // Aviso no sino do app sempre; o e-mail só se a pessoa deixou "Assinatura" ligada em Notificações
    await prisma.notification.upsert({
      where: { userId_key: { userId: u.id, key } },
      create: { userId: u.id, key, category: "billing", title: content.heading, body: TRIAL_BODY },
      update: {},
    });
    await pushIfWanted(u.id, "billing", { title: content.heading, body: TRIAL_BODY, url: "/app/settings?tab=billing", tag: "trial" }).catch(() => 0);
    if (!notifyPrefs(u.preference?.notifications).billing.email) continue;
    const ok = await sendEmail(u.email, content);
    if (ok) sent++;
    else {
      await prisma.emailDispatch.delete({ where: { key } }).catch(() => {}); // tenta de novo na próxima rodada
    }
  }
  if (sent) log("info", "mail.trial_reminders", { sent });
  return { sent };
}

/** Roda os avisos agendados. Chamado de hora em hora pelo servidor (src/instrumentation.ts). */
export async function runEmailJobs(now = new Date()) {
  try {
    await sendTrialReminders(now);
  } catch (e) {
    log("error", "mail.jobs_failed", { err: String(e) });
  }
}
