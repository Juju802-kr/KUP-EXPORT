import {
  buildDestinationRegistry,
  pickDestinationByCountry,
  pickDestinationBySimilarity,
  type DestinationRegistryEntry
} from "@/lib/destination-registry";

const INCOTERM_PATTERN = /\b(EXW|FCA|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\b/i;
const TRANSPORT_PATTERN = /\b(sea|air)\b/i;

const COUNTRY_ALIASES: Record<string, string[]> = {
  필리핀: ["philippines", "philippiness", "philippine", "ph", "필리핀"],
  베트남: ["vietnam", "viet nam", "vn", "베트남"],
  태국: ["thailand", "thai", "태국"],
  인도네시아: ["indonesia", "indonesian", "인도네시아"],
  몽골: ["mongolia", "mongolian", "몽골", "ulaanbaatar", "ulan bator", "ulan-bator"],
  미얀마: ["myanmar", "burma", "미얀마", "yangon", "rangoon"],
  방글라데시: ["bangladesh", "bangladeshi", "방글라데시", "dhaka", "chittagong", "chattogram"],
  한국: ["korea", "south korea", "republic of korea", "한국", "대한민국"]
};

export type PiDestinationContext = {
  exportCountry?: string;
  transport?: string;
  registeredDestinations?: string[];
};

function normalizeLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeTransport(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "sea") return "SEA";
  if (trimmed === "air") return "AIR";
  if (trimmed === "특송") return "특송";
  return value.trim().toUpperCase();
}

function isSeaTransport(transport: string) {
  return normalizeTransport(transport) === "SEA";
}

function isAirTransport(transport: string) {
  return normalizeTransport(transport) === "AIR";
}

function isGenericAnyPortAirport(text: string) {
  return /any\s+(?:port|airport)/i.test(text);
}

function extractInLocation(text: string) {
  const match = text.match(/\bin\s+([A-Za-z가-힣][A-Za-z가-힣\s-]*?)(?:\s*$|[,.])/i);
  return match?.[1]?.trim() ?? "";
}

export function detectCountryKey(text: string) {
  const normalized = normalizeLabel(text);
  if (!normalized) return "";

  for (const [country, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (aliases.some((alias) => normalized.includes(normalizeLabel(alias)))) {
      return country;
    }
  }

  return "";
}

function hasSpecificPlace(text: string) {
  if (isGenericAnyPortAirport(text)) return false;

  const inLocation = extractInLocation(text);
  if (inLocation && !detectCountryKey(inLocation)) return true;

  const stripped = extractPiDestinationQuery(text);
  if (stripped && !detectCountryKey(stripped)) return true;

  return false;
}

/** PI destination 원문에서 장소 검색어 추출 */
export function extractPiDestinationQuery(raw: string) {
  const text = raw.trim();
  if (!text) return "";

  if (isGenericAnyPortAirport(text)) {
    return extractInLocation(text);
  }

  const inLocation = extractInLocation(text);
  if (inLocation) return inLocation;

  return text
    .replace(/^any\s+(?:port|airport)\s+(?:or\s+(?:port|airport)\s+)?in\s+/i, "")
    .replace(/\b(?:any\s+)?(?:port|airport|ports|airports)\b/gi, " ")
    .replace(/\bin\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveFromRegistry(
  destinationText: string,
  transport: string,
  exportCountry: string,
  registry: DestinationRegistryEntry[]
) {
  const text = destinationText.trim();
  const countryFromExport = exportCountry.trim();

  if (text) {
    const countryFromText = detectCountryKey(text);
    const query = extractPiDestinationQuery(text);
    const specificPlace = hasSpecificPlace(text);

    if (specificPlace) {
      const matched = pickDestinationBySimilarity(query || text, transport, registry, countryFromExport);
      if (matched) return matched;
    }

    if (isGenericAnyPortAirport(text) || (countryFromText && !specificPlace)) {
      const country = countryFromText || countryFromExport;
      const byCountry = pickDestinationByCountry(country, transport, registry);
      if (byCountry) return byCountry;
    }

    if (countryFromText) {
      const byCountry = pickDestinationByCountry(countryFromText, transport, registry);
      if (byCountry) return byCountry;
    }

    const matched = pickDestinationBySimilarity(query || text, transport, registry, countryFromExport);
    if (matched) return matched;
  }

  if (countryFromExport) {
    return pickDestinationByCountry(countryFromExport, transport, registry);
  }

  return "";
}

export function resolveDestinationPort(
  destinationText: string,
  transport: string,
  context: PiDestinationContext = {}
) {
  const registered = context.registeredDestinations ?? [];
  const exportCountry = context.exportCountry?.trim() ?? "";
  const normalizedTransport = normalizeTransport(context.transport || transport);

  if (!registered.length) {
    return buildLegacyCandidate(destinationText, normalizedTransport);
  }

  const registry = buildDestinationRegistry(registered);
  return resolveFromRegistry(destinationText, normalizedTransport, exportCountry, registry);
}

function buildLegacyCandidate(raw: string, transport: string) {
  const text = raw.trim();
  if (!text) return "";

  const location = extractInLocation(text) || extractPiDestinationQuery(text);
  if (!location) return text;

  if (isAirTransport(transport)) return `${location} airport`;
  if (isSeaTransport(transport)) return `${location} port`;
  return location;
}

/** "FOB Sea or FCA air" → 첫 번째 조항 기준 { incoterms: "FOB", transport: "SEA" } */
export function parsePiTermsText(raw: string) {
  const text = raw.trim();
  if (!text) return { incoterms: "", transport: "" };

  const firstClause = text.split(/\s+or\s+/i)[0]?.trim() ?? text;
  const incotermsMatch = firstClause.match(INCOTERM_PATTERN);
  const transportMatch = firstClause.match(TRANSPORT_PATTERN);

  return {
    incoterms: incotermsMatch?.[1]?.toUpperCase() ?? "",
    transport: transportMatch ? normalizeTransport(transportMatch[1]) : ""
  };
}

export function parsePiDestination(raw: string, transport: string) {
  return buildLegacyCandidate(raw, transport);
}

export function resolvePiShipmentTerms(
  termsText: string,
  destinationText: string,
  context: PiDestinationContext = {}
) {
  const { incoterms, transport } = parsePiTermsText(termsText);
  const destinationPort = resolveDestinationPort(destinationText, transport, {
    ...context,
    transport
  });
  return { incoterms, transport, destinationPort };
}
