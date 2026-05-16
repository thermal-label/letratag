export type { LabelBitmap, PaletteEntry, RawImageData } from '@mbtech-nl/bitmap';
export { renderImage, renderText } from '@mbtech-nl/bitmap';

export type {
  DeviceEntry,
  DeviceRegistry,
  DeviceSupport,
  MediaDescriptor,
  PreviewOptions,
  PreviewPlane,
  PreviewResult,
  PrintEngine,
  PrintOptions,
  PrinterAdapter,
  PrinterError,
  PrinterStatus,
  RotateDirection,
  SupportStatus,
  Transport,
  TransportType,
} from '@thermal-label/contracts';

export { MediaNotSpecifiedError, pickRotation } from '@thermal-label/contracts';

export { DEVICE_REGISTRY_DATA, DEVICES } from './devices.js';

/**
 * Wire protocols this core's encoder produces correct bytes for.
 * Pair with `DEVICE_REGISTRY_DATA` and `resolveSupportedDevices`
 * from `@thermal-label/contracts` to filter a device list to what
 * this runtime can drive.
 */
export const PROTOCOLS: ReadonlySet<string> = new Set(['letratag-bt']);

export {
  DEFAULT_MEDIA,
  LT_PAPER_WHITE,
  MEDIA,
  MEDIA_LIST,
  findMediaBySku,
} from './media.js';
export { ROTATE_DIRECTION } from './orientation.js';
export {
  BODY_CHUNK,
  CUT_AT_END,
  CUT_SUPPRESS,
  END,
  FORM_FEED,
  MAGIC,
  PRINTABLE_DOTS,
  PROTOCOL_HEAD_FRAME,
  START,
  STATUS,
  buildCut,
  buildHeader,
  buildMediaType,
  buildNumberOfCopies,
  buildPrintData,
  buildPrintPayload,
  chunkPayload,
  encodeBitmap,
  encodeLabel,
  encodeSetCassetteType,
} from './protocol.js';
export {
  STATUS_NOTIFICATION_LENGTH,
  STATUS_REQUEST,
  parseStatus,
} from './status.js';
export { createPreviewOffline } from './preview.js';
export type {
  LetraTagDevice,
  LetraTagMaterial,
  LetraTagMedia,
  LetraTagPrintOptions,
} from './types.js';
