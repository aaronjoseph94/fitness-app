// Owns: reading retail barcodes — the BarcodeDetector API shape from `barcode-detector/ponyfill` (ZXing-C++ as WASM,
// the same reader on iOS and Android), loaded on first use with its WASM served from our own assets (never a CDN),
// the scan loop over a live camera <video>, the rear camera stream, and the GTIN check digit for typed codes.
import type { DetectedBarcode } from 'barcode-detector/ponyfill'

/** Where vite.config.ts serves zxing-wasm's reader (copied into dist at build time). */
const ZXING_WASM_URL = '/wasm/zxing_reader.wasm'
/** Food packaging: EAN-13/8 and UPC-A/E. Fewer formats make every frame cheaper. */
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const
const SCAN_INTERVAL_MS = 180

export interface BarcodeReader {
  detect(source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap | Blob): Promise<DetectedBarcode[]>
}

let reader: Promise<BarcodeReader> | null = null

/** The reader, created once per page. Rejects when the module or its WASM cannot load (offline on first use). */
export function loadBarcodeReader(): Promise<BarcodeReader> {
  reader ??= (async () => {
    const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill')
    await prepareZXingModule({
      overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? ZXING_WASM_URL : prefix + path) },
      fireImmediately: true,
    })
    return new BarcodeDetector({ formats: [...FORMATS] })
  })().catch((error: unknown) => {
    reader = null // let a later attempt retry (e.g. back online)
    throw error
  })
  return reader
}

/** The rear camera, as wide as the phone gives without zoom tricks. Rejects with the browser's DOMException. */
export async function openRearCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('No camera API', 'NotSupportedError')
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
  })
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop())
}

/**
 * Read `video` every ~180 ms until a code is found (then calls `onCode` once and stops) or the returned stop function
 * runs. Frames that fail to decode are skipped.
 */
export function scanVideo(video: HTMLVideoElement, detector: BarcodeReader, onCode: (code: string) => void): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const tick = async () => {
    if (stopped) return
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
      try {
        const found = await detector.detect(video)
        const code = found.map((b) => b.rawValue.trim()).find((v) => /^\d{8,14}$/.test(v))
        if (code && !stopped) {
          stopped = true
          onCode(code)
          return
        }
      } catch {
        // A frame that cannot be read: try the next one.
      }
    }
    if (!stopped) timer = setTimeout(() => void tick(), SCAN_INTERVAL_MS)
  }
  void tick()
  return () => {
    stopped = true
    clearTimeout(timer)
  }
}

/**
 * GTIN check digit (EAN-8, UPC-A, EAN-13, GTIN-14): from the right, excluding the check digit, weights alternate 3, 1;
 * check = (10 − Σ(digit × weight) mod 10) mod 10.
 */
export function isValidGtin(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false
  const digits = [...code].map(Number)
  const check = digits.pop() as number
  const total = digits.reverse().reduce((sum, d, i) => sum + d * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (total % 10)) % 10 === check
}
