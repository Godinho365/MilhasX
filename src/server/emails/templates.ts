import type { EmailContent } from "./layout";

/** Textos de cada e-mail. Só conteúdo: o visual fica em layout.ts. */

const first = (name: string) => name.trim().split(/\s+/)[0] || name.trim();
const hello = (name?: string | null) => (name?.trim() ? `Olá, ${first(name)}!` : "Olá!");

const dateTime = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dateOnly = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long" });

export function signupCodeEmail(p: { appName: string; code: string; minutes: number }): EmailContent {
  return {
    subject: `${p.code} é o seu código de verificação do ${p.appName}`,
    preheader: `Use este código para confirmar o seu e-mail. Ele vale por ${p.minutes} minutos.`,
    heading: "Confirme o seu e-mail",
    paragraphs: [`Use o código abaixo para confirmar o seu e-mail e terminar o cadastro no ${p.appName}.`],
    code: p.code,
    note: `O código vale por **${p.minutes} minutos** e só pode ser usado uma vez. Se você não tentou criar uma conta, pode ignorar este e-mail: nenhuma conta foi criada.`,
    reason: `alguém pediu para criar uma conta no ${p.appName} com este endereço`,
  };
}

export function welcomeEmail(p: { appName: string; name: string; appUrl: string; trialDays?: number }): EmailContent {
  const trial = p.trialDays && p.trialDays > 0 ? ` Você tem **${p.trialDays} dias** para testar todos os recursos, sem compromisso.` : "";
  return {
    subject: `Boas-vindas ao ${p.appName}`,
    preheader: "Sua conta está pronta. Veja como começar a organizar suas milhas em poucos minutos.",
    heading: `${hello(p.name)} Sua conta está pronta.`,
    paragraphs: [`Que bom ter você no ${p.appName}. A partir de agora, seus pontos, milhas e custos ficam organizados num lugar só.${trial}`, "Para começar bem:"],
    steps: [
      { title: "Cadastre seus programas", text: "Adicione as contas de pontos e milhas que você usa, como Livelo, Esfera, Smiles e LATAM Pass." },
      { title: "Informe os saldos", text: "Lance o saldo atual e quanto pagou por ele: o app calcula o seu custo do milheiro." },
      { title: "Simule antes de transferir", text: "Use o simulador para ver se uma transferência bonificada vale a pena." },
    ],
    button: { label: "Acessar minha conta", url: `${p.appUrl}/app` },
    note: "Precisa de ajuda para começar? É só responder este e-mail.",
    reason: `você criou uma conta no ${p.appName}`,
  };
}

export function passwordResetEmail(p: { appName: string; link: string }): EmailContent {
  return {
    subject: `Redefinição de senha do ${p.appName}`,
    preheader: "Recebemos um pedido para redefinir a sua senha. O link vale por 1 hora.",
    heading: "Redefina a sua senha",
    paragraphs: [`Recebemos um pedido para criar uma nova senha para a sua conta no ${p.appName}. Clique no botão abaixo para continuar.`],
    button: { label: "Criar nova senha", url: p.link },
    note: "O link vale por **1 hora** e só pode ser usado uma vez. Se você não pediu a troca, ignore este e-mail: a sua senha continua a mesma.",
    reason: `foi pedida a redefinição da senha da sua conta no ${p.appName}`,
  };
}

export function passwordChangedEmail(p: { appName: string; name: string; appUrl: string; when: Date; viaReset: boolean }): EmailContent {
  return {
    subject: `Sua senha do ${p.appName} foi alterada`,
    preheader: "Aviso de segurança: a senha da sua conta acabou de ser alterada.",
    heading: "Sua senha foi alterada",
    paragraphs: [
      `${hello(p.name)} A senha da sua conta no ${p.appName} foi alterada em **${dateTime(p.when)}** (horário de Brasília)${p.viaReset ? ", pelo link de redefinição de senha" : ""}.`,
      p.viaReset ? "Por segurança, encerramos as sessões abertas em outros aparelhos." : "Se foi você, está tudo certo e não precisa fazer nada.",
    ],
    button: { label: "Não fui eu: redefinir a senha", url: `${p.appUrl}/forgot-password` },
    note: "Se você não reconhece esta alteração, redefina a senha agora e responda este e-mail para avisarmos a nossa equipe.",
    reason: `a senha da sua conta no ${p.appName} foi alterada`,
  };
}

export function googleLinkedEmail(p: { appName: string; name: string; appUrl: string; when: Date }): EmailContent {
  return {
    subject: `Conta Google conectada ao ${p.appName}`,
    preheader: "Aviso de segurança: agora você também pode entrar com o Google.",
    heading: "Conta Google conectada",
    paragraphs: [
      `${hello(p.name)} Em **${dateTime(p.when)}** (horário de Brasília), a sua conta no ${p.appName} foi conectada a uma conta Google com este mesmo e-mail.`,
      "A partir de agora, você pode entrar com o botão **Continuar com Google**. A sua senha continua valendo.",
    ],
    button: { label: "Acessar minha conta", url: `${p.appUrl}/app` },
    note: "Se não foi você, redefina a sua senha e responda este e-mail. Você também pode remover o acesso em myaccount.google.com/connections.",
    reason: `uma conta Google foi conectada à sua conta no ${p.appName}`,
  };
}

export function teamInviteEmail(p: { appName: string; name: string; agencyName: string; roleLabel: string; link: string; days: number }): EmailContent {
  return {
    subject: `Convite para a equipe ${p.agencyName} no ${p.appName}`,
    preheader: `Você foi convidado para entrar na equipe ${p.agencyName}.`,
    heading: `Você foi convidado para a equipe ${p.agencyName}`,
    paragraphs: [`${hello(p.name)} A equipe **${p.agencyName}** convidou você para trabalhar junto no ${p.appName}, com a função **${p.roleLabel}**.`, "Para aceitar, crie a sua senha pelo botão abaixo."],
    button: { label: "Aceitar convite", url: p.link },
    note: `O convite vale por **${p.days} dias**. Se você não conhece esta equipe, pode ignorar este e-mail.`,
    reason: `a equipe ${p.agencyName} convidou você para o ${p.appName}`,
  };
}

export function holderAccessEmail(p: { appName: string; name: string; link: string; hours: number }): EmailContent {
  return {
    subject: `Seus pontos no ${p.appName}`,
    preheader: "Acompanhe os saldos das suas contas de pontos e milhas.",
    heading: "Acompanhe os seus pontos",
    paragraphs: [`${hello(p.name)} Você recebeu acesso para acompanhar os saldos das suas contas de pontos e milhas no ${p.appName}.`],
    button: { label: "Ver meus saldos", url: p.link },
    note: `O link vale por **${p.hours} horas** e só pode ser usado uma vez. Se você não esperava este e-mail, pode ignorá-lo.`,
    reason: `quem administra as suas contas de pontos liberou o seu acesso no ${p.appName}`,
  };
}

export function trialEndingEmail(p: { appName: string; name: string; appUrl: string; endsAt: Date; daysLeft: number }): EmailContent {
  const lastDay = p.daysLeft <= 1;
  return {
    subject: lastDay ? `Último dia do seu teste grátis no ${p.appName}` : `Seu teste grátis no ${p.appName} termina em ${p.daysLeft} dias`,
    preheader: lastDay ? "Escolha um plano para continuar com todos os recursos." : `Aproveite os próximos ${p.daysLeft} dias e escolha o plano ideal para você.`,
    heading: lastDay ? "Último dia do seu teste grátis" : `Seu teste grátis termina em ${p.daysLeft} dias`,
    paragraphs: [
      `${hello(p.name)} O seu período de teste com todos os recursos do ${p.appName} vai até **${dateOnly(p.endsAt)}**.`,
      "Depois disso, a sua conta passa para o plano **Pessoal**, que é grátis. Os seus dados continuam guardados, mas os recursos dos planos pagos ficam bloqueados até você assinar.",
    ],
    button: { label: "Ver planos", url: `${p.appUrl}/app/settings?tab=billing` },
    note: "Ficou com alguma dúvida sobre os planos? Responda este e-mail que a gente ajuda.",
    reason: `você está no período de teste grátis do ${p.appName}`,
  };
}

/** Mensagem avulsa no modelo padrão (ex.: teste de envio). */
export function plainEmail(p: { subject: string; text: string; reason: string }): EmailContent {
  const paragraphs = p.text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  return { subject: p.subject, preheader: paragraphs[0] ?? p.subject, heading: p.subject, paragraphs, reason: p.reason };
}
