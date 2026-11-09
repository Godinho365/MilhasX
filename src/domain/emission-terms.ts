// Termo de emissão: antes de emitir, o comprador confere o print da reserva e autoriza a emissão nestes termos
// (prazo de pagamento, cancelamento, pós-venda). O usuário pode trocar o texto e salvar como padrão
// (UserPreference.emissionTerms; vazio = este).

export const DEFAULT_EMISSION_TERMS = `ATENÇÃO: SUA PASSAGEM ESTÁ PRONTA PARA EMISSÃO! ⚠️

Antes de confirmar, confira atentamente todos os dados da reserva enviados no print (nomes, datas, horários e trechos).

A emissão será realizada conforme os dados conferidos e confirmados por você neste termo.

📌 Informações importantes:

💳 O pagamento deve ser realizado em até 6 horas. Após esse prazo, a reserva poderá ser cancelada automaticamente, sem garantia de disponibilidade ou manutenção da tarifa.

❌ Cancelamentos:
R$ 150,00 por CPF

🧾 Solicitações de pós-venda e alterações estão sujeitas às regras da companhia aérea e à taxa administrativa de R$ 100,00.

📅 Emissões com embarque em até 7 dias não possuem possibilidade de reembolso.

✈️ O acompanhamento de alterações, horários e status do voo após a emissão é de responsabilidade do passageiro.

✅ Ao autorizar a emissão, você declara que conferiu atentamente os dados enviados no print, confirma que todas as informações estão corretas e está ciente de que a emissão será realizada exatamente conforme os dados confirmados neste termo.`;

/** O texto do termo que vale: o salvo pelo usuário ou o padrão. */
export const emissionTermsText = (saved: string | null | undefined) => (saved?.trim() ? saved : DEFAULT_EMISSION_TERMS);
