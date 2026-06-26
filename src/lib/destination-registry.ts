export type DestinationKind = "air" | "sea";

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

function normalizeLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function catalogMatchScore(registeredLabel: string, catalogLabel: string) {
  const registered = normalizeLabel(registeredLabel);
  const catalog = normalizeLabel(catalogLabel);
  if (registered === catalog) return 100;
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
  if (/공항|airport|naia|ninoy|tan son nhat|suvarnabhumi|don mueang|soekarno|noi bai|mactan|chinggis|icn|sgn|han|cgk|rgn|dac/i.test(label)) {
    return "air";
  }
  return "sea";
}

function inferCountryFromLabel(label: string): string {
  const normalized = normalizeLabel(label);
  for (const entry of DESTINATION_CATALOG) {
    const terms = [...entry.labels, ...(entry.aliases ?? []), entry.country].map(normalizeLabel);
    if (terms.some((term) => normalized.includes(term) || term.includes(normalized))) {
      return entry.country;
    }
  }
  return "";
}

export function listDestinationCatalogForCountry(country: string) {
  return DESTINATION_CATALOG.filter((entry) => entry.country === country);
}

export function buildDestinationRegistry(registeredLabels: string[]): DestinationRegistryEntry[] {
  return registeredLabels.map((label) => {
    const catalog = findCatalogEntry(label);
    if (catalog) {
      return {
        label,
        country: catalog.country,
        kind: catalog.kind,
        aliases: [...new Set([...(catalog.aliases ?? []), ...catalog.labels])]
      };
    }

    return {
      label,
      country: inferCountryFromLabel(label),
      kind: inferKind(label),
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
