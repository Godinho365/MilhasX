"use client";
// Aviso de cookies e central de preferências, em todas as páginas (layout raiz). Até a pessoa escolher, só os
// necessários valem: navegar ou fechar não conta como aceite. Qualquer elemento com o atributo
// data-cookie-preferences (o link do rodapé, por exemplo) reabre a central, até em componentes do servidor.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Cookie } from "lucide-react";
import { Modal } from "@/components/ui";
import { Switch } from "@/components/form-parts";
import { CONSENT_CATEGORIES, CONSENT_VERSION, allows, decodeConsent, encodeConsent, newConsent, type Consent, type OptionalCategory } from "@/domain/consent";
import { setConsentState } from "./store";
import { autoloadAllowed, clearNotAllowed, loadedCategories, THIRD_PARTY_SCRIPTS } from "./registry";

const SYNC_FLAG = "mx_consent_sync";
type Choice = { analytics: boolean; marketing: boolean };
const NONE: Choice = { analytics: false, marketing: false };
const ALL: Choice = { analytics: true, marketing: true };

/** Abre a central de preferências de qualquer lugar (por exemplo, de um botão nas Configurações). */
export const openCookiePreferences = () => window.dispatchEvent(new Event("mx:cookie-preferences"));

export function ConsentProvider({ initial, signedIn }: { initial: Consent | null; signedIn: boolean }) {
  const [consent, setConsent] = useState<Consent | null>(initial);
  // logado sem escolha neste aparelho: espera a escolha da conta antes de mostrar o aviso (evita piscar)
  const [waiting, setWaiting] = useState(signedIn && !initial);
  const [embedded, setEmbedded] = useState(false);
  const [center, setCenter] = useState(false);
  const [draft, setDraft] = useState<Choice>(NONE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const consentRef = useRef(consent);
  consentRef.current = consent;

  const apply = useCallback((c: Consent | null) => {
    setConsent(c);
    setConsentState(c);
    clearNotAllowed(c);
    autoloadAllowed(c);
  }, []);

  // a escolha que veio do servidor (cookie); muda só se o servidor mandar outra
  const initialKey = initial ? encodeConsent(initial) : "";
  useEffect(() => {
    apply(decodeConsent(initialKey));
    // dentro da prévia do editor (iframe) o aviso não aparece: a escolha é da página de verdade
    try { setEmbedded(window.self !== window.top); } catch { setEmbedded(true); }
  }, [apply, initialKey]);

  // Logado: junta a escolha deste navegador com a da conta, uma vez por sessão do navegador
  useEffect(() => {
    if (!signedIn) return;
    let done = false;
    try { done = sessionStorage.getItem(SYNC_FLAG) === "1"; } catch { /* sem armazenamento */ }
    if (done) { setWaiting(false); return; }
    const timer = setTimeout(() => setWaiting(false), 3000);
    fetch("/api/consent/sync", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { consent?: Consent | null } | null) => {
        if (d && d.consent !== undefined && d.consent?.version === CONSENT_VERSION) apply(d.consent);
        try { sessionStorage.setItem(SYNC_FLAG, "1"); } catch { /* sem armazenamento */ }
      })
      .catch(() => {})
      .finally(() => { clearTimeout(timer); setWaiting(false); });
    return () => clearTimeout(timer);
  }, [signedIn, apply]);

  const openCenter = useCallback(() => {
    const c = consentRef.current;
    setDraft(c ? { analytics: c.analytics, marketing: c.marketing } : NONE);
    setError("");
    setCenter(true);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-cookie-preferences]");
      if (!el) return;
      e.preventDefault();
      openCenter();
    };
    document.addEventListener("click", onClick);
    window.addEventListener("mx:cookie-preferences", openCenter);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("mx:cookie-preferences", openCenter);
    };
  }, [openCenter]);

  async function save(choice: Choice) {
    const prev = consentRef.current;
    const local = newConsent(choice);
    // scripts de uma categoria retirada já rodaram nesta página: recarregar é o único jeito de pará-los
    const mustReload = [...loadedCategories()].some((cat) => cat !== "necessary" && allows(prev, cat) && !choice[cat as OptionalCategory]);
    setSaving(true);
    setError("");
    apply(local); // vale já nesta página, mesmo se a gravação falhar
    try {
      const r = await fetch("/api/consent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(choice) });
      const d = (await r.json().catch(() => null)) as { consent?: Consent } | null;
      if (!r.ok || !d?.consent) throw new Error();
      apply(d.consent);
      setCenter(false);
      if (mustReload) window.location.reload();
    } catch {
      setError("Não foi possível guardar sua escolha. Ela vale nesta página; tente salvar de novo.");
      setCenter(true);
      setDraft(choice);
    } finally {
      setSaving(false);
    }
  }

  const showBanner = !consent && !waiting && !embedded && !center;

  return (
    <>
      {showBanner && (
        <section
          role="region"
          aria-label="Aviso de cookies"
          className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-4"
        >
          <div className="card mx-auto flex max-w-3xl flex-col gap-4 p-4 shadow-2xl shadow-black/40 sm:p-5">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-semibold"><Cookie className="h-4 w-4 text-accent-light" />Sua privacidade</p>
              <p className="mt-1 text-sm text-muted">
                Usamos cookies necessários para o site funcionar. Cookies analíticos e de marketing só são usados se você permitir.
                Você pode mudar a escolha quando quiser em &quot;Preferências de cookies&quot;, no rodapé do site
                {signedIn ? " ou em Configurações › Preferências" : ""}.{" "}
                <Link href="/privacidade" className="underline">Política de Privacidade</Link>
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button type="button" className="btn-ghost" disabled={saving} onClick={() => save(NONE)}>Rejeitar não essenciais</button>
              <button type="button" className="btn-ghost" disabled={saving} onClick={openCenter}>Personalizar</button>
              <button type="button" className="btn-ghost" disabled={saving} onClick={() => save(ALL)}>Aceitar todos</button>
            </div>
          </div>
        </section>
      )}

      <Modal
        open={center}
        onClose={() => setCenter(false)}
        title="Preferências de cookies"
        icon={<Cookie className="h-5 w-5 text-accent-light" />}
        footer={
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
            <button type="button" className="btn-ghost" disabled={saving} onClick={() => save(NONE)}>Rejeitar não essenciais</button>
            <button type="button" className="btn-ghost" disabled={saving} onClick={() => save(draft)}>Salvar minhas escolhas</button>
            <button type="button" className="btn-ghost" disabled={saving} onClick={() => save(ALL)}>Aceitar todos</button>
          </div>
        }
      >
        <p className="text-sm text-muted">
          Escolha o que pode ser usado neste navegador. As categorias opcionais começam desligadas e só são ativadas com a sua permissão.
          {" "}Se você estiver logado, a escolha também vale nos seus outros aparelhos.
        </p>
        <div className="mt-4 space-y-3">
          {CONSENT_CATEGORIES.map((cat) => {
            const tools = THIRD_PARTY_SCRIPTS.filter((s) => s.category === cat.key);
            return (
              <div key={cat.key} className="rounded-xl border border-line p-4">
                {cat.required ? (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-semibold">{cat.title}</span>
                    <span className="shrink-0 text-xs font-medium text-muted">Sempre ativos</span>
                  </div>
                ) : (
                  <Switch
                    id={`consent-${cat.key}`}
                    label={cat.title}
                    checked={draft[cat.key as OptionalCategory]}
                    onChange={(v) => setDraft((d) => ({ ...d, [cat.key]: v }))}
                  />
                )}
                <p className="mt-2 text-xs text-muted">{cat.description}</p>
                <p className="mt-1 text-xs text-muted">
                  {tools.length ? <>Ferramentas de terceiros: {tools.map((t) => `${t.vendor} (${t.purpose})`).join("; ")}</> : !cat.required ? "Nenhuma ferramenta de terceiros desta categoria está instalada hoje." : null}
                </p>
              </div>
            );
          })}
        </div>
        {consent && (
          <p className="mt-4 text-xs text-muted">
            Escolha atual registrada em {new Date(consent.decidedAt).toLocaleString("pt-BR")} (versão do aviso {consent.version}).
          </p>
        )}
        {error && <p className="mt-3 text-sm text-red-400" role="alert">{error}</p>}
        <p className="mt-3 text-xs text-muted">
          Saiba mais na <Link href="/privacidade" className="underline">Política de Privacidade</Link>.
        </p>
      </Modal>
    </>
  );
}
