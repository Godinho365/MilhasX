// Coordenadas (latitude, longitude) dos aeroportos e cidades, para o mapa de viagens. Cobre a lista de
// aeroportos do app, os códigos de cidade mais usados (SAO, RIO, NYC...) e destinos comuns. Código sem
// coordenada não entra no mapa (a viagem aparece na lista "sem localização").
import { AIRPORTS } from "./airports";

export const COORDS: Record<string, [lat: number, lon: number]> = {
  // Brasil
  GRU: [-23.43, -46.47], CGH: [-23.63, -46.66], VCP: [-23.01, -47.13], GIG: [-22.81, -43.25], SDU: [-22.91, -43.16],
  BSB: [-15.87, -47.92], CNF: [-19.62, -43.97], PLU: [-19.85, -43.95], SSA: [-12.91, -38.33], REC: [-8.13, -34.92],
  FOR: [-3.78, -38.53], POA: [-29.99, -51.17], CWB: [-25.53, -49.18], FLN: [-27.67, -48.55], NAT: [-5.77, -35.38],
  MCZ: [-9.51, -35.79], JPA: [-7.15, -34.95], AJU: [-10.98, -37.07], BEL: [-1.38, -48.48], MAO: [-3.04, -60.05],
  SLZ: [-2.59, -44.24], THE: [-5.06, -42.82], GYN: [-16.63, -49.22], CGB: [-15.65, -56.12], CGR: [-20.47, -54.67],
  VIX: [-20.26, -40.29], IGU: [-25.6, -54.49], NVT: [-26.88, -48.65], PMW: [-10.29, -48.36], PVH: [-8.71, -63.9],
  RBR: [-9.87, -67.89], MCP: [0.05, -51.07], BVB: [2.85, -60.69], BPS: [-16.44, -39.08], IOS: [-14.82, -39.03],
  FEN: [-3.85, -32.42], JDO: [-7.22, -39.27], LDB: [-23.33, -51.14], MGF: [-23.48, -52.01], UDI: [-18.88, -48.23],
  RAO: [-21.14, -47.78], JOI: [-26.22, -48.8], XAP: [-27.13, -52.66],
  SAO: [-23.55, -46.63], RIO: [-22.91, -43.17], BHZ: [-19.92, -43.94],
  // Américas
  EZE: [-34.82, -58.54], AEP: [-34.56, -58.42], BUE: [-34.6, -58.38], SCL: [-33.39, -70.79], MVD: [-34.84, -56.03],
  PDP: [-34.86, -55.09], LIM: [-12.02, -77.11], CUZ: [-13.54, -71.94], BOG: [4.7, -74.15], MDE: [6.16, -75.42],
  CTG: [10.44, -75.51], ADZ: [12.58, -81.71], UIO: [-0.13, -78.36], LPB: [-16.51, -68.19], ASU: [-25.24, -57.52],
  BRC: [-41.15, -71.16], USH: [-54.84, -68.3], FTE: [-50.28, -72.05], MDZ: [-32.83, -68.79], PTY: [9.07, -79.38],
  SJO: [9.99, -84.21], CUN: [21.04, -86.87], MEX: [19.44, -99.07], PUJ: [18.57, -68.36], HAV: [22.99, -82.41],
  AUA: [12.5, -70.02], CUR: [12.19, -68.96], MIA: [25.79, -80.29], MCO: [28.43, -81.31], FLL: [26.07, -80.15],
  JFK: [40.64, -73.78], EWR: [40.69, -74.17], LGA: [40.78, -73.87], NYC: [40.71, -74.01], ATL: [33.64, -84.43],
  IAH: [29.98, -95.34], DFW: [32.9, -97.04], ORD: [41.98, -87.9], LAS: [36.08, -115.15], LAX: [33.94, -118.41],
  SFO: [37.62, -122.38], YYZ: [43.68, -79.63], YUL: [45.47, -73.74], YVR: [49.19, -123.18],
  // Europa, África e Oriente Médio
  LIS: [38.77, -9.13], OPO: [41.24, -8.68], FAO: [37.01, -7.97], MAD: [40.49, -3.57], BCN: [41.3, 2.08],
  CDG: [49.01, 2.55], ORY: [48.72, 2.38], PAR: [48.86, 2.35], NCE: [43.66, 7.22], LHR: [51.47, -0.45],
  LON: [51.51, -0.13], DUB: [53.43, -6.27], FCO: [41.8, 12.25], ROM: [41.9, 12.5], MXP: [45.63, 8.72],
  MIL: [45.46, 9.19], VCE: [45.51, 12.35], FRA: [50.04, 8.56], MUC: [48.35, 11.79], AMS: [52.31, 4.76],
  BRU: [50.9, 4.48], ZRH: [47.46, 8.55], VIE: [48.11, 16.57], PRG: [50.1, 14.26], ATH: [37.94, 23.94],
  IST: [41.26, 28.74], CAI: [30.12, 31.41], TLV: [32.01, 34.89], DXB: [25.25, 55.36], DOH: [25.27, 51.61],
  JNB: [-26.14, 28.24], CPT: [-33.97, 18.6],
  // Ásia e Oceania
  MLE: [4.19, 73.53], BKK: [13.69, 100.75], SIN: [1.36, 103.99], PEK: [40.08, 116.58], ICN: [37.46, 126.44],
  NRT: [35.77, 140.39], HND: [35.55, 139.78], TYO: [35.68, 139.69], SYD: [-33.95, 151.18], MEL: [-37.67, 144.84],
  AKL: [-37.01, 174.79],
};

/** Nome da cidade do código (da lista de aeroportos), ou o próprio código. */
export function placeName(code: string | null | undefined) {
  if (!code) return null;
  return AIRPORTS.find((a) => a.code === code)?.city ?? CITY_CODES[code] ?? code;
}
const CITY_CODES: Record<string, string> = {
  SAO: "São Paulo", RIO: "Rio de Janeiro", BHZ: "Belo Horizonte", BUE: "Buenos Aires", NYC: "Nova York", PAR: "Paris", LON: "Londres",
  ROM: "Roma", MIL: "Milão", TYO: "Tóquio", PDP: "Punta del Este", CUZ: "Cusco", MDE: "Medellín", CTG: "Cartagena", ADZ: "San Andrés",
  UIO: "Quito", LPB: "La Paz", ASU: "Assunção", BRC: "Bariloche", USH: "Ushuaia", FTE: "El Calafate", MDZ: "Mendoza", SJO: "San José",
  PUJ: "Punta Cana", HAV: "Havana", AUA: "Aruba", CUR: "Curaçao", LGA: "Nova York", ORD: "Chicago", LAS: "Las Vegas", SFO: "São Francisco",
  YUL: "Montreal", YVR: "Vancouver", FAO: "Faro", NCE: "Nice", DUB: "Dublin", VCE: "Veneza", BRU: "Bruxelas", VIE: "Viena", PRG: "Praga",
  ATH: "Atenas", CAI: "Cairo", TLV: "Tel Aviv", CPT: "Cidade do Cabo", MLE: "Maldivas", BKK: "Bangkok", SIN: "Singapura", PEK: "Pequim",
  ICN: "Seul", MEL: "Melbourne", AKL: "Auckland",
};

/* Projeção do mapa (Mercator recortado de -60° a 84° de latitude), igual à usada para gerar /maps/world.json. */
export const MAP_W = 1000;
const LAT_TOP = 84, LAT_BOT = -60;
const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (Math.max(LAT_BOT, Math.min(LAT_TOP, lat)) * Math.PI) / 360));
const K = MAP_W / (2 * Math.PI);
const Y0 = merc(LAT_TOP);
export const MAP_H = Math.round((Y0 - merc(LAT_BOT)) * K * 10) / 10;
export function project(lat: number, lon: number): [x: number, y: number] {
  return [((lon + 180) / 360) * MAP_W, (Y0 - merc(lat)) * K];
}
/** Ponto do mapa de um código de aeroporto/cidade (ou nulo se não houver coordenada). */
export function pointOf(code: string | null | undefined): [x: number, y: number] | null {
  const c = code ? COORDS[code] : undefined;
  return c ? project(c[0], c[1]) : null;
}
