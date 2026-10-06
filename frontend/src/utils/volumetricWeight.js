import { parsePresetWeightKg } from './weightOptions';

// Standard international air-freight volumetric divisor (cm3/kg) — matches
// the pricing engine's default, used here only to preview the max size a
// customer could pack at their chosen weight before it costs more than the
// actual-weight price (final pricing still runs server-side).
export const STANDARD_DIVISOR = 5000;

export function maxDimsHint(weightPreset) {
  if (!weightPreset || weightPreset === 'Not sure' || weightPreset === 'NOT_SURE') return null;
  const weightKg = parsePresetWeightKg(weightPreset);
  if (!weightKg) return null;
  const side = Math.cbrt(weightKg * STANDARD_DIVISOR);
  const sumCm = Math.round(side * 3 * 10) / 10;
  return `${sumCm} cm (Length + Width + Height)`;
}

// Mirrors pricingEngine.js's calcVolumetricWeightKg exactly (ceil to the
// nearest whole kg — standard courier billing convention) so this preview
// matches the price actually quoted server-side.
export function volumetricWeightNote({ showDims, weightPreset, lengthCm, widthCm, heightCm }) {
  if (!showDims || !weightPreset || weightPreset === 'Not sure' || weightPreset === 'NOT_SURE') return null;
  const l = Number(lengthCm), w = Number(widthCm), h = Number(heightCm);
  const actualWeightKg = parsePresetWeightKg(weightPreset);
  if (!l || !w || !h || !actualWeightKg) return null;
  const volumetricWeightKg = Math.ceil((l * w * h) / STANDARD_DIVISOR);
  if (volumetricWeightKg <= actualWeightKg) return null;
  return { l, w, h, actualWeightKg, volumetricWeightKg };
}
