// Gateway do Chat Balcões: a conexão permanente de uma conta do Telegram. Recebe os eventos (mensagem nova, editada,
// apagada) e lê o histórico para a recuperação depois de uma queda. Nos testes, um Telegram simulado faz o papel.
import { Api, utils } from "telegram";
import { NewMessage, type NewMessageEvent } from "telegram/events";
import { EditedMessage, type EditedMessageEvent } from "telegram/events/EditedMessage";
import { DeletedMessage, type DeletedMessageEvent } from "telegram/events/DeletedMessage";
import { inputPeer, newGramClient, toMessage, wrapGram, type TgClient, type TgMessage, type TgPeer } from "@/server/services/telegram";

/** Mensagem como o gateway grava: a do app mais a data da última edição e o id de quem mandou. */
export type LiveMessage = TgMessage & { editDate: string | null; senderId: string | null };

/** peerId: o id do chat no Telegram com a marca de tipo (supergrupo "-100…", grupo pequeno "-…", pessoa sem sinal),
 *  o mesmo formato de TelegramGroup.groupId e TelegramDm.peerId. Exclusão sem peerId = privado ou grupo pequeno
 *  (lá o número da mensagem é único na conta inteira). */
export type LiveEvent =
  | { kind: "new" | "edit"; peerId: string; message: LiveMessage; receivedAt: number }
  | { kind: "delete"; peerId: string | null; ids: number[]; receivedAt: number };

export interface LiveClient {
  /** O mesmo cliente para os pedidos do site (mandar, editar, baixar...). */
  tg: TgClient;
  /** Conecta, confirma a sessão e passa a entregar os eventos. */
  start(onEvent: (e: LiveEvent) => void): Promise<void>;
  /** Pergunta barata para ver se a conexão está viva. */
  ping(): Promise<void>;
  /** Histórico do chat em ordem crescente: as `limit` mais novas, ou (reverse) as primeiras depois de minId. */
  history(peer: TgPeer, opts: { limit: number; minId?: number; reverse?: boolean }): Promise<LiveMessage[]>;
  stop(): Promise<void>;
}
export type LiveFactory = (session: string) => LiveClient;

/** Id do chat com a marca de tipo, a partir do jeito de chegar nele. */
export function peerKey(p: TgPeer) {
  return p.kind === "channel" ? `-100${p.id}` : p.kind === "chat" ? `-${p.id}` : p.id;
}

/** A conexão de verdade, pelo GramJS. */
export function gramLive(session: string): LiveClient {
  // reconecta sozinho na rede (o gateway ainda vigia com ping e recria se precisar)
  const c = newGramClient(session, { connectionRetries: 10 });
  const tg = wrapGram(c);
  const live = async (m: Api.Message): Promise<LiveMessage> => {
    // em atualização curta o GramJS às vezes não traz o autor junto: busca (fica em cache dele)
    if (!m.sender && !m.out) await m.getSender().catch(() => undefined);
    const senderId = m.fromId instanceof Api.PeerUser ? m.fromId.userId.toString() : !m.fromId && m.peerId instanceof Api.PeerUser && !m.out ? m.peerId.userId.toString() : null;
    return { ...toMessage(m), editDate: m.editDate ? new Date(m.editDate * 1000).toISOString() : null, senderId };
  };
  const handlers: [(e: never) => unknown, NewMessage | EditedMessage | DeletedMessage][] = [];
  return {
    tg,
    async start(onEvent) {
      await c.connect();
      await c.getMe(); // sessão autorizada: a partir daqui o Telegram empurra os updates desta conta
      const onNew = async (e: NewMessageEvent) => {
        if (!(e.message instanceof Api.Message)) return;
        const receivedAt = Date.now();
        onEvent({ kind: "new", peerId: utils.getPeerId(e.message.peerId), message: await live(e.message), receivedAt });
      };
      const onEdit = async (e: EditedMessageEvent) => {
        if (!(e.message instanceof Api.Message)) return;
        const receivedAt = Date.now();
        onEvent({ kind: "edit", peerId: utils.getPeerId(e.message.peerId), message: await live(e.message), receivedAt });
      };
      const onDelete = (e: DeletedMessageEvent) => {
        onEvent({ kind: "delete", peerId: e.peer ? utils.getPeerId(e.peer) : null, ids: e.deletedIds, receivedAt: Date.now() });
      };
      const list: [(e: never) => unknown, NewMessage | EditedMessage | DeletedMessage][] = [
        [onNew as (e: never) => unknown, new NewMessage({})],
        [onEdit as (e: never) => unknown, new EditedMessage({})],
        [onDelete as (e: never) => unknown, new DeletedMessage({})],
      ];
      for (const [h, b] of list) {
        c.addEventHandler(h as never, b);
        handlers.push([h, b]);
      }
    },
    async ping() {
      await c.invoke(new Api.updates.GetState());
    },
    async history(peer, { limit, minId, reverse }) {
      const list = await c.getMessages(inputPeer(peer), { limit, ...(minId ? { minId } : {}), ...(reverse ? { reverse: true } : {}) });
      const msgs = await Promise.all(list.filter((m): m is Api.Message => m instanceof Api.Message).map(live));
      return reverse ? msgs : msgs.reverse();
    },
    async stop() {
      for (const [h, b] of handlers.splice(0)) c.removeEventHandler(h as never, b);
      await c.destroy().catch(() => {});
    },
  };
}
