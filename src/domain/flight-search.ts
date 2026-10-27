// Buscador de passagens: monta o endereço de busca no site de cada programa, já preenchido.
// Não lemos nada desses sites: o usuário abre as abas no próprio navegador e pesquisa lá.
// Os formatos abaixo são os endereços públicos de busca de cada companhia (conferidos em 26/10/2026);
// quando um site não aceita a busca pelo endereço, abrimos a página de busca para preencher à mão.

export type Cabin = "ECONOMY" | "PREMIUM" | "BUSINESS" | "FIRST";
export type SearchParams = {
  origin: string; // IATA
  destination: string;
  departDate: string; // AAAA-MM-DD
  returnDate?: string | null;
  adults: number;
  children: number;
  infants: number;
  cabin: Cabin;
};
export type SearchProgram = { key: string; label: string; group: "nacional" | "internacional" | "manual" | "dinheiro"; build: (p: SearchParams) => string };

export const CABIN_LABELS: Record<Cabin, string> = { ECONOMY: "Econômica", PREMIUM: "Premium Economy", BUSINESS: "Executiva", FIRST: "Primeira classe" };
export const GROUP_LABELS = {
  nacional: "Programas nacionais em milhas",
  internacional: "Programas internacionais em milhas",
  manual: "Busca manual em milhas (você digita as datas no site do programa)",
  dinheiro: "Em dinheiro",
} as const;

const premium = (c: Cabin) => c === "BUSINESS" || c === "FIRST";
const [y, m, d] = [(s: string) => s.slice(0, 4), (s: string) => s.slice(5, 7), (s: string) => s.slice(8, 10)];
const mmddyyyy = (s?: string | null) => (s ? `${m(s)}/${d(s)}/${y(s)}` : "");
const ddmmyyyy = (s?: string | null) => (s ? `${d(s)}/${m(s)}/${y(s)}` : "");
const noonUtc = (s: string) => `${s}T12%3A00%3A00.000Z`;
const q = (o: Record<string, string | number | boolean | null | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
const roundTrip = (p: SearchParams) => !!p.returnDate;

export const SEARCH_PROGRAMS: SearchProgram[] = [
  {
    key: "smiles", label: "Smiles", group: "nacional",
    build: (p) => `https://www.smiles.com.br/mfe/emissao-passagem?${q({
      tripType: roundTrip(p) ? 1 : 2, originAirport: p.origin, destinationAirport: p.destination,
      departureDate: new Date(`${p.departDate}T12:00:00Z`).getTime(), returnDate: p.returnDate ? new Date(`${p.returnDate}T12:00:00Z`).getTime() : "",
      adults: p.adults, children: p.children, infants: p.infants, searchType: "g3", segments: 1, isFlexibleDateChecked: false,
      cabin: premium(p.cabin) ? "BUSINESS" : "ECONOMIC",
    })}`,
  },
  {
    key: "latam", label: "LATAM Pass", group: "nacional",
    build: (p) => `https://www.latamairlines.com/br/pt/oferta-voos?origin=${p.origin}&outbound=${noonUtc(p.departDate)}&destination=${p.destination}&inbound=${p.returnDate ? noonUtc(p.returnDate) : "null"}&adt=${p.adults}&chd=${p.children}&inf=${p.infants}&trip=${roundTrip(p) ? "RT" : "OW"}&cabin=${premium(p.cabin) ? "Business" : "Economy"}&redemption=true&sort=RECOMMENDED`,
  },
  {
    key: "azul", label: "Azul Fidelidade", group: "nacional",
    build: (p) => {
      let u = `https://www.voeazul.com.br/br/pt/home/selecao-voo?c[0].ds=${p.origin}&c[0].std=${mmddyyyy(p.departDate)}&c[0].as=${p.destination}`;
      if (p.returnDate) u += `&c[1].ds=${p.destination}&c[1].std=${mmddyyyy(p.returnDate)}&c[1].as=${p.origin}`;
      return u; // passageiros e classe são escolhidos no site da Azul
    },
  },
  {
    key: "azul-mundo", label: "Azul pelo Mundo", group: "internacional",
    build: (p) => `https://azulpelomundo.voeazul.com.br/flights/${roundTrip(p) ? "RT" : "OW"}/${p.origin}/${p.destination}/-/-/${p.departDate}/${p.returnDate || "-"}/${p.adults}/${p.children}/${p.infants}/0/0/ALL/F/${premium(p.cabin) ? "BUSINESS" : "ECONOMY"}/-/-/-/-/A/-`,
  },
  {
    key: "iberia", label: "Iberia Plus", group: "internacional",
    build: (p) => {
      const back = p.returnDate || p.departDate;
      return `https://www.iberia.com/flights/?${q({
        market: "US", language: "en", appliesOMB: false, splitEndCity: false, initializedOMB: true, flexible: true, TRIP_TYPE: roundTrip(p) ? 2 : 1, BEGIN_CITY_01: p.origin, END_CITY_01: p.destination,
        BEGIN_DAY_01: d(p.departDate), BEGIN_MONTH_01: `${y(p.departDate)}${m(p.departDate)}`, BEGIN_YEAR_01: y(p.departDate),
        END_DAY_01: d(back), END_MONTH_01: `${y(back)}${m(back)}`, END_YEAR_01: y(back),
        FARE_TYPE: "R", ADT: p.adults, CHD: p.children || "", INF: p.infants || "",
      })}`;
    },
  },
  {
    key: "aadvantage", label: "AAdvantage", group: "internacional",
    build: (p) => {
      const slices = [{ orig: p.origin, origNearby: false, dest: p.destination, destNearby: false, date: p.departDate }];
      if (p.returnDate) slices.push({ orig: p.destination, origNearby: false, dest: p.origin, destNearby: false, date: p.returnDate });
      return `https://www.aa.com.br/booking/search?${q({ locale: "pt_BR", pax: p.adults + p.children + p.infants, adult: p.adults, child: p.children, infantInSeat: p.infants, type: roundTrip(p) ? "RoundTrip" : "OneWay", searchType: "Award", cabin: premium(p.cabin) ? "BUSINESS" : "ECONOMY", carriers: "ALL", travelType: "personal", slices: JSON.stringify(slices) })}`;
    },
  },
  {
    key: "connectmiles", label: "ConnectMiles", group: "internacional",
    build: (p) => `https://shopping.copaair.com/?${q({ roundtrip: roundTrip(p), area1: p.origin, area2: p.destination, date1: p.departDate, date2: p.returnDate ?? "", flexible_dates_v2: false, adults: p.adults, children: p.children, infants: p.infants, isMiles: true, advanced_air_search: false, stopover: false, sf: "br", langid: "pt" })}`,
  },
  {
    key: "mileageplus", label: "MileagePlus", group: "internacional",
    build: (p) => {
      const act = p.cabin === "BUSINESS" || p.cabin === "FIRST" ? "2" : p.cabin === "PREMIUM" ? "1" : "0";
      const base = `https://www.united.com/pt/br/fsr/choose-flights?f=${p.origin}&t=${p.destination}&d=${p.departDate}`;
      return p.returnDate
        ? `${base}&r=${p.returnDate}&at=1&sc=7%2C7&act=${act}&px=${p.adults}%2C0%2C0%2C0%2C${p.children}%2C0%2C0%2C${p.infants}&taxng=1&newHP=True&clm=7&st=bestmatches&tqp=A`
        : `${base}&tt=1&at=1&sc=7&act=${act}&px=${p.adults}%2C0%2C0%2C0%2C${p.children}%2C0%2C0%2C${p.infants}&taxng=1&newHP=True&clm=7&st=bestmatches&tqp=A`;
    },
  },
  {
    key: "aeroplan", label: "Aeroplan", group: "internacional",
    build: (p) => {
      let r = `org0=${p.origin}&dest0=${p.destination}&departureDate0=${p.departDate}`;
      if (p.returnDate) r += `&org1=${p.destination}&dest1=${p.origin}&departureDate1=${p.returnDate}`;
      return `https://www.aircanada.com/aeroplan/redeem/availability/outbound?${r}&ADT=${p.adults}&YTH=0&CHD=${p.children}&INF=${p.infants}&INS=0&lang=en-CA&tripType=${roundTrip(p) ? "R" : "O"}&marketCode=INT`;
    },
  },
  {
    key: "miles-and-more", label: "Miles & More", group: "internacional",
    build: (p) => `https://www.miles-and-more.com/row/en/spend/flights/flight-award.html?${q({ adults: p.adults, bookingclass: premium(p.cabin) ? "BUSINESS" : "ECONOMY", children: p.children, dateformat: "MM/dd/yyyy", destinationcode: p.destination, infants: p.infants, l: "GB", origincode: p.origin, outbounddate: mmddyyyy(p.departDate), returndate: p.returnDate ? mmddyyyy(p.returnDate) : null, travellertype: "M", triptype: roundTrip(p) ? "RT" : "OW", youths: 0 })}`,
  },
  {
    key: "qatar", label: "Qatar Privilege Club", group: "internacional",
    build: (p) => `https://www.qatarairways.com/app/booking/redemption?${q({ widget: "QR", searchType: "F", addTaxToFare: "Y", minPurTime: 0, selLang: "en", tripType: roundTrip(p) ? "R" : "O", fromStation: p.origin, toStation: p.destination, departing: p.departDate, returning: p.returnDate ?? null, bookingClass: premium(p.cabin) ? "B" : "E", adults: p.adults, children: p.children, infants: p.infants, ofw: 0, teenager: 0, flexibleDate: "off", qmilesFlow: true, allowRedemption: "Y" })}`,
  },
  {
    key: "virgin", label: "Virgin Atlantic Flying Club", group: "internacional",
    build: (p) => {
      const parts = [`passengers=a${p.adults}t0c${p.children}i${p.infants}`, `origin=${p.origin}`];
      if (p.returnDate) parts.push(`origin=${p.destination}`);
      parts.push("awardSearch=true", `destination=${p.destination}`);
      if (p.returnDate) parts.push(`destination=${p.origin}`);
      parts.push(`departing=${p.departDate}`);
      if (p.returnDate) parts.push(`departing=${p.returnDate}`);
      return `https://www.virginatlantic.com/en-US/flights/search/slice?${parts.join("&")}`;
    },
  },
  // Sites que não aceitam a busca pelo endereço: abre a página de resgate
  { key: "british", label: "British Airways Club", group: "manual", build: () => "https://www.britishairways.com/travel/redeem/execclub/_gf/en_br" },
  { key: "flying-blue", label: "Flying Blue", group: "manual", build: () => "https://wwws.airfrance.com.br/search/advanced" },
  { key: "tap", label: "TAP Miles&Go", group: "manual", build: () => "https://miles-and-go.flytap.com/pt/award-flight" },
  { key: "lifemiles", label: "LifeMiles", group: "manual", build: () => "https://www.lifemiles.com/fly/find" },
  { key: "qantas", label: "Qantas Frequent Flyer", group: "manual", build: () => "https://www.qantas.com/en-au" },
  // Em dinheiro
  {
    key: "latam-cash", label: "LATAM (em R$)", group: "dinheiro",
    build: (p) => `https://www.latamairlines.com/br/pt/oferta-voos?origin=${p.origin}&outbound=${noonUtc(p.departDate)}&destination=${p.destination}&inbound=${p.returnDate ? noonUtc(p.returnDate) : "null"}&adt=${p.adults}&chd=${p.children}&inf=${p.infants}&trip=${roundTrip(p) ? "RT" : "OW"}&cabin=${premium(p.cabin) ? "Business" : "Economy"}&redemption=false&sort=RECOMMENDED`,
  },
  {
    key: "gol-cash", label: "Gol (em R$)", group: "dinheiro",
    build: (p) => `https://b2c.voegol.com.br/compra/busca-parceiros?${q({ de: p.origin, para: p.destination, ida: ddmmyyyy(p.departDate), volta: p.returnDate ? ddmmyyyy(p.returnDate) : null, ADT: p.adults, ADL: 0, CHD: p.children, INF: p.infants, pv: "br", tipo: "DF" })}`,
  },
  {
    key: "decolar", label: "Decolar", group: "dinheiro",
    build: (p) => {
      const kids = p.children + p.infants;
      const path = p.returnDate
        ? ["roundtrip", p.origin, p.destination, p.departDate, p.returnDate, p.adults, kids, 0]
        : ["oneway", p.origin, p.destination, p.departDate, p.adults, kids, 0];
      return `https://www.decolar.com/shop/flights/results/${path.join("/")}?from=SB&di=${p.adults}`;
    },
  },
  {
    key: "skyscanner", label: "Skyscanner", group: "dinheiro",
    build: (p) => {
      const yymmdd = (s: string) => `${s.slice(2, 4)}${m(s)}${d(s)}`;
      const path = `${p.origin.toLowerCase()}/${p.destination.toLowerCase()}/${yymmdd(p.departDate)}/${p.returnDate ? `${yymmdd(p.returnDate)}/` : ""}`;
      return `https://www.skyscanner.com.br/transporte/passagens-aereas/${path}?${q({ adultsv2: p.adults, cabinclass: premium(p.cabin) ? "business" : "economy", childrenv2: [...Array(p.children).fill("10"), ...Array(p.infants).fill("1")].join("|"), rtn: p.returnDate ? 1 : 0 })}`;
    },
  },
];

export const PROGRAM_BY_KEY = Object.fromEntries(SEARCH_PROGRAMS.map((p) => [p.key, p]));
export const DEFAULT_PROGRAMS = ["smiles", "latam", "azul"];

const IATA = /^[A-Z]{3}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function validateSearch(p: SearchParams): string | null {
  if (!IATA.test(p.origin) || !IATA.test(p.destination)) return "Informe origem e destino (código do aeroporto, ex.: GRU)";
  if (p.origin === p.destination) return "Origem e destino precisam ser diferentes";
  if (!DAY.test(p.departDate)) return "Informe a data de ida";
  if (p.returnDate && (!DAY.test(p.returnDate) || p.returnDate < p.departDate)) return "A volta precisa ser depois da ida";
  if (p.adults < 1 || p.adults + p.children + p.infants > 9) return "De 1 a 9 passageiros, com ao menos 1 adulto";
  if (p.infants > p.adults) return "Cada bebê precisa de um adulto";
  return null;
}
