export { LetraTagPrinter } from './printer.js';
/* eslint-disable @typescript-eslint/no-deprecated -- legacy debug helper re-exported during plan-10 transition */
export {
  devicesForTransport,
  DeviceIdentificationRequiredError,
  requestPrinter,
  requestPrinters,
} from './discovery.js';
/* eslint-enable @typescript-eslint/no-deprecated */
export type { PairResult, RequestPrinterOptions } from './discovery.js';
export type { ConnectOptions, PrinterAdapterMap } from '@thermal-label/contracts';

export {
  DEFAULT_MEDIA,
  DEVICES,
  LT_PAPER_WHITE,
  MEDIA,
  MEDIA_LIST,
  PROTOCOLS,
  encodeLabel,
  findMediaBySku,
  parseStatus,
} from '@thermal-label/letratag-core';

export type {
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
