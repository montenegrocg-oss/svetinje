export interface CoordinatePair {
  latitude: number;
  longitude: number;
}

export type CoordinateInputResult =
  | { kind: "empty" }
  | { kind: "incomplete" }
  | { kind: "invalid"; field: "latitude" | "longitude" }
  | { kind: "valid"; pair: CoordinatePair };

const finiteInRange = (value: number, minimum: number, maximum: number) =>
  Number.isFinite(value) && value >= minimum && value <= maximum;

export function parseCoordinateInputs(latitudeValue: string, longitudeValue: string): CoordinateInputResult {
  const latitudeText = latitudeValue.trim();
  const longitudeText = longitudeValue.trim();
  if (!latitudeText && !longitudeText) return { kind: "empty" };
  if (!latitudeText || !longitudeText) return { kind: "incomplete" };
  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  if (!finiteInRange(latitude, -90, 90)) return { kind: "invalid", field: "latitude" };
  if (!finiteInRange(longitude, -180, 180)) return { kind: "invalid", field: "longitude" };
  return { kind: "valid", pair: { latitude, longitude } };
}

export class CoordinatePickerState {
  #pair: CoordinatePair | undefined;

  constructor(initial?: CoordinatePair) {
    this.#pair = initial ? { ...initial } : undefined;
  }

  get pair(): CoordinatePair | undefined {
    return this.#pair ? { ...this.#pair } : undefined;
  }

  setFromMap(longitude: number, latitude: number): CoordinatePair {
    if (!finiteInRange(latitude, -90, 90) || !finiteInRange(longitude, -180, 180)) {
      throw new RangeError("Map coordinate is outside WGS84 bounds");
    }
    this.#pair = { latitude, longitude };
    return this.pair!;
  }

  setFromInputs(latitudeValue: string, longitudeValue: string): CoordinateInputResult {
    const result = parseCoordinateInputs(latitudeValue, longitudeValue);
    if (result.kind === "valid") this.#pair = { ...result.pair };
    if (result.kind === "empty") this.#pair = undefined;
    return result;
  }

  clear(): void {
    this.#pair = undefined;
  }
}
