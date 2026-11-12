// Gateway do Chat Balcões: a conexão permanente de uma conta do Telegram. Recebe os eventos (mensagem nova, editada,
// apagada) e lê o histórico para a recuperação depois de uma queda. Nos testes, um Telegram simulado faz o papel.
import { Api, utils } from "telegram";
import { returnBigInt } from "telegram/Helpers";
import { NewMessage, Raw, type NewMessageEvent } from "telegram/events";
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
  | { kind: "delete"; peerId: string | null; ids: number[]; receivedAt: number }
  /** A pessoa leu as suas mensagens no privado até maxId (os checks verdes). */
  | { kind: "read"; peerId: string; maxId: number; receivedAt: number };

/** O que mudou num supergrupo desde um contador (pts): mensagens novas, editadas e apagadas, o novo contador e a espera
 *  que o Telegram sugere até perguntar de novo (timeout, em segundos). tooLong = ficou atrás demais: reler o chat. */
export type ChannelDiff = { pts: number; timeout: number | null; final: boolean; tooLong: boolean; newMessages: LiveMessage[]; edits: LiveMessage[]; deleted: number[] };

export interface LiveClient {
  /** O mesmo cliente para os pedidos do site (mandar, editar, baixar...). */
  tg: TgClient;
  /** Conecta, confirma a sessão e passa a entregar os eventos. */
  start(onEvent: (e: LiveEvent) => void): Promise<void>;
  /** Pergunta barata para ver se a conexão está viva. */
  ping(): Promise<void>;
  /** Histórico do chat em ordem crescente: as `limit` mais novas, ou (reverse) as primeiras depois de minId. */
  history(peer: TgPeer, opts: { limit: number; minId?: number; reverse?: boolean }): Promise<LiveMessage[]>;
  /** Supergrupo: o contador atual de mudanças (pts) do chat; null = não deu para saber. */
  channelPts?(peer: TgPeer): Promise<number | null>;
  /** Supergrupo: o que mudou desde pts. Em supergrupo grande o Telegram não empurra tudo para quem está conectado;
   *  os apps oficiais pedem esta diferença do chat aberto, no ritmo que o próprio Telegram indica. */
  channelDiff?(peer: TgPeer, pts: number): Promise<ChannelDiff>;
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
  const handlers: [(e: never) => unknown, NewMessage | EditedMessage | DeletedMessage | Raw][] = [];
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
      const onRead = (u: Api.UpdateReadHistoryOutbox) => {
        if (u.peer instanceof Api.PeerUser) onEvent({ kind: "read", peerId: utils.getPeerId(u.peer), maxId: u.maxId, receivedAt: Date.now() });
      };
      const list: [(e: never) => unknown, NewMessage | EditedMessage | DeletedMessage | Raw][] = [
        [onNew as (e: never) => unknown, new NewMessage({})],
        [onEdit as (e: never) => unknown, new EditedMessage({})],
        [onDelete as (e: never) => unknown, new DeletedMessage({})],
        [onRead as (e: never) => unknown, new Raw({ types: [Api.UpdateReadHistoryOutbox] })],
      ];
      for (const [h, b] of list) {
        c.addEventHandler(h as never, b);
        handlers.push([h, b]);
      }
    },
    async ping() {
      await c.invoke(new Api.updates.GetState());
    },
    async channelPts(peer) {
      const r = await c.invoke(new Api.messages.GetPeerDialogs({ peers: [new Api.InputDialogPeer({ peer: inputPeer(peer) })] }));
      const d = r.dialogs.find((x) => x instanceof Api.Dialog);
      return d instanceof Api.Dialog && d.pts != null ? d.pts : null;
    },
    async channelDiff(peer, pts) {
      if (peer.kind !== "channel") throw new Error("diferença só de supergrupo/canal");
      const channel = new Api.InputChannel({ channelId: returnBigInt(peer.id), accessHash: returnBigInt(peer.hash) });
      const r = await c.invoke(new Api.updates.GetChannelDifference({ channel, filter: new Api.ChannelMessagesFilterEmpty(), pts, limit: 100, force: false }));
      if (r instanceof Api.updates.ChannelDifferenceEmpty) return { pts: r.pts, timeout: r.timeout ?? null, final: !!r.final, tooLong: false, newMessages: [], edits: [], deleted: [] };
      // autores e chats vêm à parte na resposta: liga cada mensagem a eles (para o nome de quem mandou)
      const entities = new Map<string, Api.TypeUser | Api.TypeChat>([...r.users, ...r.chats].map((e) => [utils.getPeerId(e), e]));
      const prep = (m: Api.TypeMessage) => {
        if (!(m instanceof Api.Message)) return null;
        m._finishInit(c, entities as never, inputPeer(peer));
        return m;
      };
      if (r instanceof Api.updates.ChannelDifferenceTooLong) {
        const pts2 = r.dialog instanceof Api.Dialog && r.dialog.pts != null ? r.dialog.pts : pts;
        return { pts: pts2, timeout: r.timeout ?? null, final: !!r.final, tooLong: true, newMessages: [], edits: [], deleted: [] };
      }
      const newMessages = await Promise.all(r.newMessages.map(prep).filter((m): m is Api.Message => !!m).map(live));
      const edits: LiveMessage[] = [];
      const deleted: number[] = [];
      for (const u of r.otherUpdates) {
        if (u instanceof Api.UpdateEditChannelMessage || u instanceof Api.UpdateNewChannelMessage) {
          const m = prep(u.message);
          if (m) (u instanceof Api.UpdateEditChannelMessage ? edits : newMessages).push(await live(m));
        } else if (u instanceof Api.UpdateDeleteChannelMessages) deleted.push(...u.messages);
      }
      return { pts: r.pts, timeout: r.timeout ?? null, final: !!r.final, tooLong: false, newMessages, edits, deleted };
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
