import { prisma } from "@/server/db";

const TABLES = [
  "AccountBeneficiary", "OrderAccess", "ContractSignature", "MilesLead", "FlightSearch", "FlightQuote", "OrderEvent", "OrderAttachment", "TravelOrder", "ParityDay", "Subscription", "HolderAccess", "SalesProfile", "PurchaseAttachment", "HolderAttachment", "Simulation", "ProgramLogo", "AccountCredential", "Recurrence", "BonusPurchase", "CardInvoice", "CreditCard", "SupplierAccount", "Supplier", "Promotion", "Guide", "NewsPost",
  "AuditLog", "Notification", "Alert", "FavoriteStore", "StoreOffer", "Store", "SaleAttachment", "SaleItem", "Sale", "Customer", "Entry",
  "Account", "Holder", "UserPreference", "PasswordResetToken", "Session", "LoginAttempt", "AppSetting", "User", "Program",
];

export async function resetDb() {
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
}

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

/** Cliente HTTP em memória: chama os handlers das rotas mantendo o cookie de sessão. */
export class Client {
  cookie = "";
  constructor(public origin?: string) {}

  async call(handler: Handler, method: string, path: string, body?: unknown, params: Record<string, string> = {}) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.cookie) headers.cookie = this.cookie;
    if (this.origin) headers.origin = this.origin;
    const req = new Request(`http://localhost:3100${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    const res = await handler(req, { params: Promise.resolve(params) });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      const pair = setCookie.split(";")[0]!;
      this.cookie = pair.endsWith("=") ? "" : pair;
    }
    const text = await res.text();
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {}
    return { status: res.status, data };
  }
}

export async function seedPrograms() {
  const livelo = await prisma.program.create({ data: { name: "Livelo", code: "LIVELO", kind: "POINTS", marketValueCpmCents: 2800 } });
  const latam = await prisma.program.create({ data: { name: "LATAM Pass", code: "LATAM", kind: "MILES", marketValueCpmCents: 2450 } });
  return { livelo, latam };
}
