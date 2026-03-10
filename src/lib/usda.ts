// ============================================================
// TORVUS — USDA FoodData Central API client
// src/lib/usda.ts
//
// Free API — no user key required (DEMO_KEY for dev).
// Foundation + SR Legacy data types are always per 100g,
// which maps directly to our foods schema.
//
// Register for a free key (1,000 req/hr vs 30 for DEMO_KEY):
// https://fdc.nal.usda.gov/api-key-signup.html
// ============================================================

const API_KEY   = 'LO1i6oItEoZgegXuHr2sL5G36ovFamhiNfDmmAEH';
const BASE_URL  = 'https://api.nal.usda.gov/fdc/v1';
const PAGE_SIZE = 25;

// USDA nutrient IDs we care about (all per 100g for Foundation/SR Legacy)
const NID = {
  ENERGY:   1008,
  PROTEIN:  1003,
  CARBS:    1005,
  FAT:      1004,
  FIBER:    1079,
  SODIUM:   1093,
} as const;

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface UsdaFood {
  fdcId:        number;
  name:         string;
  calories:     number;  // per 100g
  proteinG:     number;
  carbsG:       number;
  fatG:         number;
  fiberG:       number | null;
  sodiumMg:     number | null;
}

interface RawNutrient {
  nutrientId:   number;
  value:        number;
}

interface RawFood {
  fdcId:        number;
  description:  string;
  foodNutrients: RawNutrient[];
}

// ─────────────────────────────────────────────────────────────
// SEARCH
// ─────────────────────────────────────────────────────────────

export async function searchUsda(query: string, signal?: AbortSignal): Promise<UsdaFood[]> {
  const params = new URLSearchParams({
    query,
    dataType:   'Foundation,SR Legacy',
    pageSize:   String(PAGE_SIZE),
    api_key:    API_KEY,
  });

  const res = await fetch(`${BASE_URL}/foods/search?${params}`, { signal });
  if (!res.ok) throw new Error(`USDA ${res.status}`);

  const json = await res.json();
  const foods: RawFood[] = json.foods ?? [];

  return foods.map(mapFood).filter((f): f is UsdaFood => f !== null);
}

// ─────────────────────────────────────────────────────────────
// MAPPER
// ─────────────────────────────────────────────────────────────

function mapFood(raw: RawFood): UsdaFood | null {
  const get = (id: number) =>
    raw.foodNutrients.find(n => n.nutrientId === id)?.value ?? null;

  const calories = get(NID.ENERGY);
  if (calories === null) return null; // skip foods with no energy data

  // Capitalise description for display
  const name = raw.description
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());

  return {
    fdcId:    raw.fdcId,
    name,
    calories,
    proteinG: get(NID.PROTEIN) ?? 0,
    carbsG:   get(NID.CARBS)   ?? 0,
    fatG:     get(NID.FAT)     ?? 0,
    fiberG:   get(NID.FIBER),
    sodiumMg: get(NID.SODIUM),
  };
}
