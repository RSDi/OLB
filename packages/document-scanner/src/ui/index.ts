// Document-scanner UI entry — the <DocumentScanner /> client component
// (camera, corners, review, attach PDF). Mount it with a file name, a size
// cap, and onDone / onCancel. Optional `photo` starts from an already-picked
// image instead of the camera.

export { DocumentScanner, SCAN_MAX_PAGES } from "./DocumentScanner";
export type { DocumentScannerProps } from "./DocumentScanner";
