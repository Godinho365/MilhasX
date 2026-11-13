// Pedidos de titulares de dados (LGPD, art. 18): os tipos que a pessoa escolhe no formulário público.

export const PRIVACY_REQUEST_KINDS = [
  { key: "ACCESS", label: "Confirmar se tratam meus dados e acessar uma cópia" },
  { key: "CORRECTION", label: "Corrigir dados incompletos, inexatos ou desatualizados" },
  { key: "DELETION", label: "Eliminar meus dados" },
  { key: "PORTABILITY", label: "Portabilidade dos meus dados" },
  { key: "SHARING", label: "Saber com quem meus dados foram compartilhados" },
  { key: "REVOKE", label: "Revogar um consentimento" },
  { key: "OBJECTION", label: "Me opor a um tratamento ou pedir anonimização/bloqueio" },
  { key: "OTHER", label: "Outro assunto de privacidade" },
] as const;

export type PrivacyRequestKind = (typeof PRIVACY_REQUEST_KINDS)[number]["key"];
export const PRIVACY_REQUEST_KEYS = PRIVACY_REQUEST_KINDS.map((k) => k.key) as [PrivacyRequestKind, ...PrivacyRequestKind[]];
