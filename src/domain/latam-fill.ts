// Preencher a tela "Passageiros" da LATAM com os dados que o comprador enviou.
// O MilhasX não consegue mexer em outro site; quem preenche é um favorito ("bookmarklet") que o usuário
// clica na própria tela da LATAM. Ele lê o texto copiado no MilhasX e preenche os campos
// passenger-N_firstName / _lastName / _dateOfBirth (DD/MM/AAAA) / _taxDocument (CPF), o Sexo (lista
// passenger-N_gender, opções "Feminino"/"Masculino") e o contato passenger-N_passengerInfo_email /
// _passengerInfo_number (DDD + número; o +55 já vem escolhido), como a página da LATAM tinha em
// 30/10/2026. Nada é enviado: o usuário confere e continua.

export type LatamPassenger = { firstName: string; lastName: string; birthDate: string; cpf: string; gender?: "Masculino" | "Feminino"; email?: string; phone?: string };

/** Telefone para o campo da LATAM: só DDD + número (tira o +55 do começo). */
export function latamPhone(v?: string | null) {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
}

/** "Nicolas Eduardo Amaral" → Nome "Nicolas" e Sobrenome "Eduardo Amaral", como a LATAM pede. */
export function splitName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

const toBr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso);

/** Texto que o botão "Copiar para a LATAM" põe na área de transferência (o favorito reconhece pela marca). */
export function latamPayload(passengers: { name: string; firstName?: string | null; lastName?: string | null; cpf: string; birthDate: string; gender?: string | null; email?: string | null; phone?: string | null }[]) {
  const list: LatamPassenger[] = passengers.map((p) => ({
    ...(p.firstName && p.lastName ? { firstName: p.firstName, lastName: p.lastName } : splitName(p.name)),
    birthDate: toBr(p.birthDate),
    cpf: p.cpf.replace(/\D/g, ""),
    ...(p.gender === "M" ? { gender: "Masculino" as const } : p.gender === "F" ? { gender: "Feminino" as const } : {}),
    ...(p.email ? { email: p.email.trim() } : {}),
    ...(latamPhone(p.phone) ? { phone: latamPhone(p.phone) } : {}),
  }));
  return JSON.stringify({ milhasx: "latam", passengers: list });
}

/** Código do favorito. Fica numa linha só; usa só o que o navegador já tem (nada é baixado). */
export const LATAM_BOOKMARKLET =
  "javascript:(async()=>{" +
  // só o domínio da LATAM (e subdomínios) por HTTPS: um site falso como falso-latamairlines.com não recebe os dados
  "if(location.protocol!=='https:'||!/(^|\\.)latamairlines\\.com$/.test(location.hostname)){alert('Abra a tela de Passageiros da LATAM e clique de novo.');return}" +
  "let t='';try{t=await navigator.clipboard.readText()}catch(e){}" +
  "if(!t||t.indexOf('\"milhasx\"')<0)t=prompt('Cole aqui os passageiros copiados no MilhasX (botão Copiar para a LATAM):')||'';" +
  "if(!t)return;let d;try{d=JSON.parse(t)}catch(e){alert('O texto colado não veio do MilhasX.');return}" +
  "if(!d||d.milhasx!=='latam'||!Array.isArray(d.passengers)){alert('O texto colado não veio do MilhasX.');return}" +
  "const w=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');" +
  "const s=(el,v)=>{if(!el||v==null)return;el.focus();w.set.call(el,v);['input','change','blur'].forEach(n=>el.dispatchEvent(new Event(n,{bubbles:true})))};" +
  "const c=el=>['mousedown','mouseup','click'].forEach(t=>el.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window})));" +
  "const wait=ms=>new Promise(r=>setTimeout(r,ms));" +
  "const pick=async(box,label)=>{if(!box||!label||box.innerText.trim()===label)return;c(box);await wait(300);const o=[...document.querySelectorAll('[role=option]')].find(x=>x.innerText.trim()===label);if(o)c(o);await wait(200)};" +
  "let ok=0,miss=0;" +
  "for(const [i,p] of d.passengers.entries()){const g=k=>document.getElementById('passenger-'+i+'_'+k);" +
  "if(!g('firstName')){miss++;continue}" +
  "s(g('firstName'),p.firstName);s(g('lastName'),p.lastName);s(g('dateOfBirth'),p.birthDate);s(g('taxDocument'),p.cpf);" +
  "await pick(document.querySelector('[data-testid=\"passenger-'+i+'_gender-container\"]'),p.gender);" +
  "if(p.email)s(g('passengerInfo_email'),p.email);if(p.phone)s(g('passengerInfo_number'),p.phone);ok++}" +
  "alert(ok+' passageiro(s) preenchido(s).'+(miss?' '+miss+' sem campos na tela: abra esse passageiro na LATAM e clique no favorito de novo.':'')+' Confira os dados antes de continuar.')" +
  "})()";
