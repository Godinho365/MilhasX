/** E-mail de contato mostrado nos Termos e na Política de Privacidade (opcional). */
export const contactEmail = () => {
  const v = process.env.CONTACT_EMAIL?.trim() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : "";
};
