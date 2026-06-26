export type DestinationKind = "air" | "sea";

export type RegisteredDestination = {
  label: string;
  country?: string | null;
  kind?: DestinationKind | null;
};

export type DestinationRegistryEntry = {
  label: string;
  country: string;
  kind: DestinationKind;
  aliases: string[];
};

/** 등록 목적항 메타 — label은 드롭다운 등록명과 일치하거나 aliases로 매칭 */
const DESTINATION_CATALOG: Array<{
  labels: string[];
  country: string;
  kind: DestinationKind;
  aliases?: string[];
}> = [
  // 필리핀
  {
    labels: ["NAIA", "마닐라 NAIA", "마닐라(NAIA)", "Ninoy Aquino", "마닐라공항"],
    country: "필리핀",
    kind: "air",
    aliases: ["naia", "ninoy aquino", "manila airport", "manila naia", "마닐라 공항"]
  },
  {
    labels: ["마닐라", "마닐라항", "Manila Port", "Manila"],
    country: "필리핀",
    kind: "sea",
    aliases: ["manila port", "manila harbour", "manila harbor", "metro manila port"]
  },
  {
    labels: ["세부", "세부항", "Cebu Port"],
    country: "필리핀",
    kind: "sea",
    aliases: ["cebu", "cebu port"]
  },
  {
    labels: ["세부공항", "Mactan Cebu", "CEB"],
    country: "필리핀",
    kind: "air",
    aliases: ["cebu airport", "mactan"]
  },
  // 베트남
  {
    labels: ["호치민", "호치민항", "Ho Chi Minh Port", "Saigon Port"],
    country: "베트남",
    kind: "sea",
    aliases: ["ho chi minh port", "saigon", "hcm port"]
  },
  {
    labels: ["호치민공항", "Tan Son Nhat", "SGN"],
    country: "베트남",
    kind: "air",
    aliases: ["ho chi minh airport", "tan son nhat", "saigon airport"]
  },
  {
    labels: ["하노이공항", "Noi Bai", "HAN"],
    country: "베트남",
    kind: "air",
    aliases: ["hanoi airport", "noi bai"]
  },
  {
    labels: ["하이퐁항", "Haiphong Port"],
    country: "베트남",
    kind: "sea",
    aliases: ["haiphong", "hai phong port"]
  },
  // 태국
  {
    labels: ["방콕공항", "Suvarnabhumi", "BKK", "Don Mueang"],
    country: "태국",
    kind: "air",
    aliases: ["bangkok airport", "suvarnabhumi", "don mueang"]
  },
  {
    labels: ["방콕항", "Laem Chabang", "Bangkok Port"],
    country: "태국",
    kind: "sea",
    aliases: ["bangkok port", "laem chabang"]
  },
  // 인도네시아
  {
    labels: ["자카르타공항", "Soekarno-Hatta", "CGK"],
    country: "인도네시아",
    kind: "air",
    aliases: ["jakarta airport", "soekarno", "soekarno hatta"]
  },
  {
    labels: ["자카르타항", "Jakarta Port", "Tanjung Priok"],
    country: "인도네시아",
    kind: "sea",
    aliases: ["jakarta port", "tanjung priok"]
  },
  // 몽골
  {
    labels: ["울란바토르공항", "Ulaanbaatar Airport", "Chinggis Khaan", "UB Airport"],
    country: "몽골",
    kind: "air",
    aliases: ["ulaanbaatar", "ulan bator", "ulan-bator", "ub airport", "chinggis khaan"]
  },
  {
    labels: ["울란바토르항", "Ulaanbaatar Port"],
    country: "몽골",
    kind: "sea",
    aliases: ["ulaanbaatar port", "ulan bator port"]
  },
  // 미얀마
  {
    labels: ["양곤공항", "Yangon Airport", "RGN"],
    country: "미얀마",
    kind: "air",
    aliases: ["yangon airport", "rangoon airport"]
  },
  {
    labels: ["양곤항", "Yangon Port"],
    country: "미얀마",
    kind: "sea",
    aliases: ["yangon port", "rangoon port"]
  },
  // 방글라데시
  {
    labels: ["Dhaka Airport", "다카공항", "DAC"],
    country: "방글라데시",
    kind: "air",
    aliases: ["dhaka airport", "dac airport"]
  },
  {
    labels: ["Chittagong Port", "치타공항", "Chattogram Port"],
    country: "방글라데시",
    kind: "sea",
    aliases: ["chittagong", "chattogram port"]
  },
  // 국내(출발/참고용 등록)
  {
    labels: ["인천공항", "ICN"],
    country: "한국",
    kind: "air",
    aliases: ["incheon airport", "incheon"]
  },
  {
    labels: ["부산항", "Busan Port"],
    country: "한국",
    kind: "sea",
    aliases: ["busan port", "busan"]
  },
  {
    labels: ["평택항", "Pyeongtaek Port"],
    country: "한국",
    kind: "sea",
    aliases: ["pyeongtaek", "pyongtaek port"]
  }
];

/** 영문 국가명 → 수출국(한글) */
const ENGLISH_COUNTRY_MAP: Record<string, string> = {
  ghana: "가나",
  guatemala: "과테말라",
  nigeria: "나이지리아",
  kenya: "케냐",
  ethiopia: "에티오피아",
  tanzania: "탄자니아",
  uganda: "우간다",
  zambia: "잠비아",
  zimbabwe: "짐바브웨",
  mozambique: "모잠비크",
  angola: "앙골라",
  cameroon: "카메룬",
  senegal: "세네갈",
  ivory: "코트디부아르",
  "cote d'ivoire": "코트디부아르",
  "côte d'ivoire": "코트디부아르",
  philippines: "필리핀",
  philippine: "필리핀",
  vietnam: "베트남",
  thailand: "태국",
  indonesia: "인도네시아",
  mongolia: "몽골",
  ulaanbaatar: "몽골",
  "ulan bator": "몽골",
  myanmar: "미얀마",
  yangon: "미얀마",
  bangladesh: "방글라데시",
  dhaka: "방글라데시",
  chittagong: "방글라데시",
  chattogram: "방글라데시",
  pakistan: "파키스탄",
  india: "인도",
  sri: "스리랑카",
  "sri lanka": "스리랑카",
  nepal: "네팔",
  cambodia: "캄보디아",
  laos: "라오스",
  malaysia: "말레이시아",
  singapore: "싱가포르",
  china: "중국",
  taiwan: "대만",
  japan: "일본",
  korea: "한국",
  mexico: "멕시코",
  brazil: "브라질",
  argentina: "아르헨티나",
  chile: "칠레",
  colombia: "콜롬비아",
  peru: "페루",
  ecuador: "에콰도르",
  bolivia: "볼리비아",
  paraguay: "파라과이",
  uruguay: "우루과이",
  venezuela: "베네수엘라",
  honduras: "온두라스",
  nicaragua: "니카라과",
  "costa rica": "코스타리카",
  "el salvador": "엘살바도르",
  panama: "파나마",
  "dominican": "도미니카",
  "dominican republic": "도미니카",
  haiti: "아이티",
  jamaica: "자메이카",
  trinidad: "트리니다드",
  egypt: "이집트",
  morocco: "모로코",
  tunisia: "튀니지",
  algeria: "알제리",
  libya: "리비아",
  sudan: "수단",
  rwanda: "르완다",
  congo: "콩고",
  drc: "콩고",
  gabon: "가봉",
  benin: "베닌",
  togo: "토고",
  mali: "말리",
  niger: "니제르",
  burkina: "부르키나파소",
  "burkina faso": "부르키나파소",
  guinea: "기니",
  liberia: "라이베리아",
  sierra: "시에라리온",
  "sierra leone": "시에라리온",
  gambia: "감비아",
  namibia: "나미비아",
  botswana: "보츠와나",
  malawi: "말라위",
  madagascar: "마다가스카르",
  mauritius: "모리셔스",
  afghanistan: "아프가니스탄",
  iraq: "이라크",
  iran: "이란",
  jordan: "요르단",
  lebanon: "레바논",
  israel: "이스라엘",
  uae: "UAE",
  "united arab emirates": "UAE",
  saudi: "사우디",
  "saudi arabia": "사우디",
  qatar: "카타르",
  kuwait: "쿠웨이트",
  oman: "오만",
  bahrain: "바레인",
  kazakhstan: "카자흐스탄",
  uzbekistan: "우즈베키스탄",
  georgia: "조지아",
  azerbaijan: "아제르바이잔",
  uk: "영국",
  "united kingdom": "영국",
  france: "프랑스",
  germany: "독일",
  italy: "이탈리아",
  spain: "스페인",
  portugal: "포르투갈",
  netherlands: "네덜란드",
  belgium: "벨기에",
  poland: "폴란드",
  romania: "루마니아",
  bulgaria: "불가리아",
  greece: "그리스",
  turkey: "터키",
  russia: "러시아",
  ukraine: "우크라이나",
  australia: "호주",
  "new zealand": "뉴질랜드",
  canada: "캐나다",
  usa: "미국",
  "united states": "미국",
  america: "미국"
};

function normalizeLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function lookupEnglishCountry(text: string) {
  const normalized = normalizeLabel(text);
  if (ENGLISH_COUNTRY_MAP[normalized]) return ENGLISH_COUNTRY_MAP[normalized];
  for (const [english, korean] of Object.entries(ENGLISH_COUNTRY_MAP)) {
    if (english.length < 4) continue;
    if (normalized.includes(english)) return korean;
  }
  return "";
}

function catalogMatchScore(registeredLabel: string, catalogLabel: string) {
  const registered = normalizeLabel(registeredLabel);
  const catalog = normalizeLabel(catalogLabel);
  if (registered === catalog) return 100;
  if (catalog.length < 4 || registered.length < 4) return 0;
  if (registered.includes(catalog) || catalog.includes(registered)) return 85;
  return 0;
}

function findCatalogEntry(registeredLabel: string) {
  let best: (typeof DESTINATION_CATALOG)[number] | null = null;
  let bestScore = 0;

  for (const entry of DESTINATION_CATALOG) {
    for (const label of entry.labels) {
      const score = catalogMatchScore(registeredLabel, label);
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }
  }

  return bestScore >= 85 ? best : null;
}

function inferKind(label: string): DestinationKind {
  if (/\bairports?\b/i.test(label)) return "air";
  if (/공항/i.test(label)) return "air";
  if (/\bports?\b|\bharbours?\b|\bharbors?\b/i.test(label)) return "sea";
  if (/항/.test(label) && !/공항/.test(label)) return "sea";
  if (
    /\b(naia|ninoy|icn|sgn|cgk|rgn|dac|mactan|chinggis|soekarno|noi bai|suvarnabhumi|don mueang|tan son nhat)\b/i.test(
      label
    ) ||
    (/\([A-Z]{3}\)/.test(label) && /\b(AIRPORT|AIR)\b/i.test(label))
  ) {
    return "air";
  }
  return "sea";
}

function inferCountryFromLabel(label: string): string {
  const normalized = normalizeLabel(label);
  const firstToken = label.trim().split(/\s+/)[0] ?? "";
  const fromFirst = lookupEnglishCountry(firstToken);
  if (fromFirst) return fromFirst;

  const fromMap = lookupEnglishCountry(normalized);
  if (fromMap) return fromMap;

  let bestCountry = "";
  let bestLen = 0;
  for (const entry of DESTINATION_CATALOG) {
    for (const term of [...entry.labels, ...(entry.aliases ?? []), entry.country]) {
      const token = normalizeLabel(term);
      if (token.length < 4) continue;
      if (normalized.includes(token) && token.length > bestLen) {
        bestLen = token.length;
        bestCountry = entry.country;
      }
    }
  }
  return bestCountry;
}

export function destinationKindLabel(kind: string | null | undefined) {
  if (kind === "air") return "공항";
  if (kind === "sea") return "항구";
  return "-";
}

export function resolveDestinationMetadata(label: string): { country: string; kind: DestinationKind } {
  const catalog = findCatalogEntry(label);
  return {
    country: catalog?.country || inferCountryFromLabel(label),
    kind: catalog?.kind || inferKind(label)
  };
}

/** DB에 저장할 목적항 메타 — label에서 자동 추론 */
export function inferDestinationFields(label: string) {
  return resolveDestinationMetadata(label);
}

export function backfillDestinationPortMetadata(
  rows: Array<{ id: string; label: string; destinationCountry: string | null; destinationKind: string | null }>
) {
  return rows
    .map((row) => {
      const inferred = inferDestinationFields(row.label);
      const destinationCountry = inferred.country || row.destinationCountry?.trim() || null;
      const destinationKind = inferred.kind;
      if (
        destinationCountry === (row.destinationCountry?.trim() || null) &&
        destinationKind === (row.destinationKind?.trim() || null)
      ) {
        return null;
      }
      return { id: row.id, destinationCountry, destinationKind };
    })
    .filter((row): row is { id: string; destinationCountry: string | null; destinationKind: DestinationKind } => row !== null);
}

/** 추론값으로 전체 목적항 메타를 덮어씀 */
export function rebuildDestinationPortMetadata(
  rows: Array<{ id: string; label: string }>
) {
  return rows.map((row) => {
    const inferred = inferDestinationFields(row.label);
    return {
      id: row.id,
      destinationCountry: inferred.country || null,
      destinationKind: inferred.kind
    };
  });
}

export function listDestinationCatalogForCountry(country: string) {
  return DESTINATION_CATALOG.filter((entry) => entry.country === country);
}

export function buildDestinationRegistry(registered: RegisteredDestination[]): DestinationRegistryEntry[] {
  return registered.map((item) => {
    const label = item.label.trim();
    const catalog = findCatalogEntry(label);
    const country = item.country?.trim() || catalog?.country || inferCountryFromLabel(label);
    const kind = item.kind || catalog?.kind || inferKind(label);

    if (catalog) {
      return {
        label,
        country,
        kind,
        aliases: [...new Set([label, ...(catalog.aliases ?? []), ...catalog.labels])]
      };
    }

    return {
      label,
      country,
      kind,
      aliases: [label]
    };
  });
}

function transportKind(transport: string): DestinationKind | null {
  const normalized = transport.trim().toUpperCase();
  if (normalized === "AIR") return "air";
  if (normalized === "SEA") return "sea";
  return null;
}

export function pickDestinationByCountry(
  country: string,
  transport: string,
  registry: DestinationRegistryEntry[]
) {
  const kind = transportKind(transport);
  if (!country || !kind) return "";

  const matches = registry.filter((entry) => entry.country === country && entry.kind === kind);
  if (matches.length === 1) return matches[0].label;
  if (matches.length > 1) {
    return matches.sort((left, right) => left.label.length - right.label.length)[0].label;
  }
  return "";
}

function tokenize(value: string) {
  return normalizeLabel(value)
    .split(/[^a-z0-9가-힣]+/)
    .filter(Boolean);
}

function similarityScore(query: string, entry: DestinationRegistryEntry) {
  const q = normalizeLabel(query);
  if (!q) return 0;

  const terms = [entry.label, ...entry.aliases].map(normalizeLabel);
  let best = 0;

  for (const term of terms) {
    if (!term) continue;
    if (term === q) best = Math.max(best, 100);
    else if (term.includes(q) || q.includes(term)) {
      best = Math.max(best, 80 + Math.min(q.length, term.length));
    } else {
      const qTokens = tokenize(q);
      const tTokens = tokenize(term);
      const shared = qTokens.filter((token) => tTokens.some((other) => other.includes(token) || token.includes(other)));
      if (shared.length) best = Math.max(best, 50 + shared.length * 10);

      let prefix = 0;
      const limit = Math.min(q.length, term.length);
      while (prefix < limit && q[prefix] === term[prefix]) prefix += 1;
      if (prefix >= 4) best = Math.max(best, 40 + prefix);
    }
  }

  return best;
}

const SIMILARITY_THRESHOLD = 45;

export function pickDestinationBySimilarity(
  query: string,
  transport: string,
  registry: DestinationRegistryEntry[],
  exportCountry = ""
) {
  const kind = transportKind(transport);
  if (!query.trim() || !kind) return "";

  const pool = registry.filter((entry) => entry.kind === kind);
  let bestLabel = "";
  let bestScore = 0;

  for (const entry of pool) {
    let score = similarityScore(query, entry);
    if (exportCountry && entry.country === exportCountry) score += 8;
    if (score > bestScore) {
      bestScore = score;
      bestLabel = entry.label;
    }
  }

  return bestScore >= SIMILARITY_THRESHOLD ? bestLabel : "";
}
