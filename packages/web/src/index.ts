export { LetraTagPrinter } from './printer.js';
export { decodeAdvertisementManufacturerData, requestPrinter } from './discovery.js';
export type { PairResult, RequestPrinterOptions } from './discovery.js';

export {
  ADVERTISING_STATUS_LENGTH,
  CASSETTE_WIDTH_MM,
  DEFAULT_MEDIA,
  DEVICES,
  LT_PAPER_WHITE,
  MEDIA,
  MEDIA_LIST,
  PROTOCOLS,
  advertisingToPrinterStatus,
  encodeLabel,
  findMediaBySku,
  parseAdvertisingStatus,
  parseStatus,
} from '@thermal-label/letratag-core';

export type {
  AdvertisingStatus,
  CassetteId,
  LetraTagDevice,
  LetraTagMaterial,
  LetraTagMedia,
  LetraTagPrintOptions,
} from '@thermal-label/letratag-core';

export type {
  PrinterAdapter,
  PrinterError,
  PrinterStatus,
  Transport,
} from '@thermal-label/contracts';
