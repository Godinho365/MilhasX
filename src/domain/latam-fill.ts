// Preencher a tela "Passageiros" da LATAM com os dados que o comprador enviou.
// O MilhasX não consegue mexer em outro site; quem preenche é um favorito ("bookmarklet") que o usuário
// clica na própria tela da LATAM. Ele lê o texto copiado no MilhasX e preenche os campos
// passenger-N_firstName / _lastName / _dateOfBirth (DD/MM/AAAA) / _taxDocument (CPF), como a página
// da LATAM tinha em 30/10/2026. Nada é enviado: o usuário confere e continua.

export type LatamPassenger = { firstName: string; lastName: string; birthDate: string; cpf: string };

/** "Nicolas Eduardo Amaral" → Nome "Nicolas" e Sobrenome "Eduardo Amaral", como a LATAM pede. */
export function splitName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

const toBr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso);

/** Texto que o botão "Copiar para a LATAM" põe na área de transferência (o favorito reconhece pela marca). */
export function latamPayload(passengers: { name: string; cpf: string; birthDate: string }[]) {
  const list: LatamPassenger[] = passengers.map((p) => ({ ...splitName(p.name), birthDate: toBr(p.birthDate), cpf: p.cpf.replace(/\D/g, "") }));
  return JSON.stringify({ milhasx: "latam", passengers: list });
}

/** Código do favorito. Fica numa linha só; usa só o que o navegador já tem (nada é baixado). */
export const LATAM_BOOKMARKLET =
  "javascript:(async()=>{" +
  "if(!/latamairlines\\.com$/.test(location.hostname)){alert('Abra a tela de Passageiros da LATAM e clique de novo.');return}" +
  "let t='';try{t=await navigator.clipboard.readText()}catch(e){}" +
  "if(!t||t.indexOf('\"milhasx\"')<0)t=prompt('Cole aqui os passageiros copiados no MilhasX (botão Copiar para a LATAM):')||'';" +
  "if(!t)return;let d;try{d=JSON.parse(t)}catch(e){alert('O texto colado não veio do MilhasX.');return}" +
  "if(!d||d.milhasx!=='latam'||!Array.isArray(d.passengers)){alert('O texto colado não veio do MilhasX.');return}" +
  "const w=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');" +
  "const s=(el,v)=>{if(!el||v==null)return;el.focus();w.set.call(el,v);['input','change','blur'].forEach(n=>el.dispatchEvent(new Event(n,{bubbles:true})))};" +
  "let ok=0,miss=0;" +
  "d.passengers.forEach((p,i)=>{const g=k=>document.getElementById('passenger-'+i+'_'+k);" +
  "if(!g('firstName')){miss++;return}" +
  "s(g('firstName'),p.firstName);s(g('lastName'),p.lastName);s(g('dateOfBirth'),p.birthDate);s(g('taxDocument'),p.cpf);ok++});" +
  "alert(ok+' passageiro(s) preenchido(s).'+(miss?' '+miss+' sem campos na tela: abra esse passageiro na LATAM e clique no favorito de novo.':'')+' Confira o Sexo e os demais campos antes de continuar.')" +
  "})()";
