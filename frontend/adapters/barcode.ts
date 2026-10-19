// Barcode scanning + product lookup.
// Scanning uses the browser's BarcodeDetector where it exists (e.g. Chrome on Android).
// Lookup searches foods stored on this device; a product-database adapter
// (e.g. Open Food Facts) can implement BarcodeLookup later.

import type { Food } from '../domain/types';
import { foods } from '../data/repositories';

export interface BarcodeLookup {
  readonly sourceLabel: string;
  lookup(code: string): Promise<Food | null>;
}

export const localBarcodeLookup: BarcodeLookup = {
  sourceLabel: 'foods saved on this device',
  async lookup(code) {
    await new Promise((r) => setTimeout(r, 450));
    return foods.byBarcode(code.trim()) ?? null;
  },
};

export const barcodeLookup: BarcodeLookup = localBarcodeLookup;

export function isValidBarcode(code: string): boolean {
  return /^\d{8}$|^\d{12,14}$/.test(code.trim());
}

// Minimal typing for the experimental BarcodeDetector API.
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

export function getBarcodeDetector(): BarcodeDetectorLike | null {
  const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
  } catch {
    return null;
  }
}

export const cameraSupported = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && getBarcodeDetector() !== null;
