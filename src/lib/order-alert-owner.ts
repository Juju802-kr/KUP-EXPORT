import { findRegisteredProduct, type ExportProductOption } from "@/lib/order-pi-import";

export type BuyerCountryRef = {
  exportCountry: string;
  salesOwner: string | null;
};

export type BuyerOwnerRef = BuyerCountryRef & {
  buyerName: string;
};

export function ownerCountriesFromBuyers(buyers: BuyerCountryRef[], owner: string) {
  return [
    ...new Set(
      buyers
        .filter((buyer) => buyer.salesOwner === owner)
        .map((buyer) => buyer.exportCountry.trim())
        .filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b, "ko"));
}

export function ownerBuyerNamesFromBuyers(buyers: BuyerOwnerRef[], owner: string) {
  return [
    ...new Set(
      buyers
        .filter((buyer) => buyer.salesOwner === owner)
        .map((buyer) => buyer.buyerName.trim())
        .filter(Boolean)
    )
  ];
}

/** OrderEntry / SalesRegistration: follow current buyer-master owner (not historical stamp alone). */
export function orderManagementOwnerScope(owner: string, buyers: BuyerOwnerRef[]) {
  const buyerNames = ownerBuyerNamesFromBuyers(buyers, owner);
  const countries = ownerCountriesFromBuyers(buyers, owner);
  const blankOwnerDraft = {
    salesOwner: owner,
    AND: [{ OR: [{ buyer: null }, { buyer: "" }] }, { OR: [{ exportCountry: null }, { exportCountry: "" }] }]
  };

  const clauses: Array<Record<string, unknown>> = [];
  if (buyerNames.length) clauses.push({ buyer: { in: buyerNames } });
  if (countries.length) clauses.push({ exportCountry: { in: countries } });
  if (!clauses.length) return blankOwnerDraft;
  return { OR: [...clauses, blankOwnerDraft] };
}

/** Aggregate scope for overseas sales team leader ("해외영업 전체"). */
export function orderManagementTeamScope(teamNames: string[], buyers: BuyerOwnerRef[]) {
  const names = [...new Set(teamNames.map((name) => name.trim()).filter(Boolean))];
  if (!names.length) return { id: "__none__" };
  const buyerNames = [
    ...new Set(
      buyers
        .filter((buyer) => names.includes(buyer.salesOwner ?? ""))
        .map((buyer) => buyer.buyerName.trim())
        .filter(Boolean)
    )
  ];
  const countries = [
    ...new Set(
      buyers
        .filter((buyer) => names.includes(buyer.salesOwner ?? ""))
        .map((buyer) => buyer.exportCountry.trim())
        .filter(Boolean)
    )
  ];
  const clauses: Array<Record<string, unknown>> = [{ salesOwner: { in: names } }];
  if (buyerNames.length) clauses.push({ buyer: { in: buyerNames } });
  if (countries.length) clauses.push({ exportCountry: { in: countries } });
  return { OR: clauses };
}

/**
 * Shipments / payments keep historical salesOwner on their own records.
 * Order management aggregates by current buyer-master ownership only.
 */
export function orderManagementLinkedRecordScope(owner: string, buyers: BuyerOwnerRef[]) {
  const buyerNames = ownerBuyerNamesFromBuyers(buyers, owner);
  const countries = ownerCountriesFromBuyers(buyers, owner);
  const clauses: Array<Record<string, unknown>> = [];
  if (buyerNames.length) clauses.push({ buyer: { in: buyerNames } });
  if (countries.length) clauses.push({ exportCountry: { in: countries } });
  if (!clauses.length) return { id: "__none__" };
  return { OR: clauses };
}

export function orderManagementLinkedTeamScope(teamNames: string[], buyers: BuyerOwnerRef[]) {
  const names = [...new Set(teamNames.map((name) => name.trim()).filter(Boolean))];
  if (!names.length) return { id: "__none__" };
  const buyerNames = [
    ...new Set(
      buyers
        .filter((buyer) => names.includes(buyer.salesOwner ?? ""))
        .map((buyer) => buyer.buyerName.trim())
        .filter(Boolean)
    )
  ];
  const countries = [
    ...new Set(
      buyers
        .filter((buyer) => names.includes(buyer.salesOwner ?? ""))
        .map((buyer) => buyer.exportCountry.trim())
        .filter(Boolean)
    )
  ];
  const clauses: Array<Record<string, unknown>> = [];
  if (buyerNames.length) clauses.push({ buyer: { in: buyerNames } });
  if (countries.length) clauses.push({ exportCountry: { in: countries } });
  if (!clauses.length) return { id: "__none__" };
  return { OR: clauses };
}

function normalizeProductKey(productName: string) {
  return productName.split(" · ")[0]?.trim() || productName.trim();
}

export function uniqueProductsForOwnerCountries(ownerCountries: string[], products: ExportProductOption[]) {
  const countrySet = new Set(ownerCountries);
  const seen = new Set<string>();
  const result: ExportProductOption[] = [];
  for (const product of products) {
    if (!countrySet.has(product.exportCountry)) continue;
    if (seen.has(product.productName)) continue;
    seen.add(product.productName);
    result.push(product);
  }
  return result.sort((a, b) => a.productName.localeCompare(b.productName, "ko"));
}

export function countriesForOwnerProduct(
  ownerCountries: string[],
  productName: string,
  products: ExportProductOption[]
) {
  const query = normalizeProductKey(productName);
  if (!query || !ownerCountries.length) return [];

  const matched = new Set<string>();
  for (const country of ownerCountries) {
    const found = findRegisteredProduct(country, query, products);
    if (found) matched.add(country);
  }

  for (const product of products) {
    if (!ownerCountries.includes(product.exportCountry)) continue;
    if (product.productName === query || normalizeProductKey(product.productName) === query) {
      matched.add(product.exportCountry);
    }
  }

  return [...matched].sort((a, b) => a.localeCompare(b, "ko"));
}

export function productsForOwnerCountry(
  exportCountry: string,
  ownerCountries: string[],
  products: ExportProductOption[]
) {
  if (!exportCountry || !ownerCountries.includes(exportCountry)) return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const product of products) {
    if (product.exportCountry !== exportCountry) continue;
    if (seen.has(product.productName)) continue;
    seen.add(product.productName);
    names.push(product.productName);
  }
  return names.sort((a, b) => a.localeCompare(b, "ko"));
}

export function buildOrderAlertTargets(
  exportCountry: string,
  productName: string,
  ownerCountries: string[],
  products: ExportProductOption[]
) {
  const country = exportCountry.trim();
  const product = normalizeProductKey(productName);

  if (!country && !product) return [];

  if (country && product) {
    const canonicalName = canonicalProductName(country, product, products);
    return canonicalName ? [{ exportCountry: country, productName: canonicalName }] : [];
  }

  if (country) {
    return productsForOwnerCountry(country, ownerCountries, products).map((name) => ({
      exportCountry: country,
      productName: name
    }));
  }

  return countriesForOwnerProduct(ownerCountries, product, products)
    .map((targetCountry) => {
      const canonicalName = canonicalProductName(targetCountry, product, products);
      return canonicalName ? { exportCountry: targetCountry, productName: canonicalName } : null;
    })
    .filter((target): target is { exportCountry: string; productName: string } => target !== null);
}

export function canonicalProductName(
  exportCountry: string,
  productName: string,
  products: ExportProductOption[]
) {
  const query = normalizeProductKey(productName);
  if (!query) return "";
  const matched = exportCountry
    ? findRegisteredProduct(exportCountry, query, products)
    : products.find((product) => product.productName === query || normalizeProductKey(product.productName) === query);
  return matched?.productName ?? query;
}
