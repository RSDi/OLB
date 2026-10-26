# document-scanner

In-browser document scanner: live camera outline, auto-capture, corner adjust, page cleanup, multi-page PDF. Host-neutral — own colors, own icons, no OLB UI imports.

**Package:** `document-scanner` **0.1.0** (private workspace package).

Lives in `packages/document-scanner/` because this repo already uses npm workspaces (`packages/*`) and the same pattern as `packages/reelnotes`. Do not import host `lib/` or `app/` from `src/`.

## API

| Import | What |
|---|---|
| `document-scanner/ui` | `<DocumentScanner />`, `SCAN_MAX_PAGES`, `DocumentScannerProps` |
| `document-scanner` | Scan helpers: `looksLikeHeic`, `heicToJpeg`, `jpegName`, `buildPdf`, `detectDocument`, `applyScanFilter`, geometry, autocapture |

```tsx
import { DocumentScanner } from "document-scanner/ui";
import { looksLikeHeic } from "document-scanner";

<DocumentScanner
  fileName="Handbook signature - Wiley Fisher.pdf"
  maxBytes={10 * 1024 * 1024}
  onDone={(file) => upload(file)}
  onCancel={() => setOpen(false)}
  photo={pickedImage}                 // optional: start from an uploaded photo
  onPhotoUnreadable={(file) => upload(file)}  // optional: HEIC the browser can't open
/>
```

`onDone` receives a PDF `File` (or, with **Upload as is**, the original photo / a JPEG conversion of HEIC). The host uploads it.

## How a host plugs in

1. Peer `react` / `react-dom` ≥ 19 and `next` ≥ 15.
2. Add `document-scanner` to `transpilePackages` (raw TS/TSX source, like reelnotes).
3. Map the package in `tsconfig` paths, or depend on it (see below).
4. Mount `<DocumentScanner />` from a client component. The scanner portals into `document.body` and carries its own colors.

No adapter, no env vars, no schema. HEIC conversion lazy-loads `heic-to`.

## How Ops (or another app) should depend on it

Same package identity (`document-scanner@0.1.0`). Bump the version when either host needs an API change.

**Preferred — git / subdirectory** (Vercel already has GitHub access to `RSDi/OLB`):

```json
"document-scanner": "github:RSDi/OLB#main&path:packages/document-scanner"
```

(or pin a tag / SHA instead of `main`).

**Or** vendor this folder under the host’s `packages/` and add `"workspaces": ["packages/*"]` — same `package.json` name and version. Do not copy files into `app/` or `lib/`; they drift.

If a git dependency needs new deploy keys, park that and vendor the folder instead.

## OLB now

Directory Requirements → **Scan with camera** imports `document-scanner/ui`. Upload-scan photos that look like images (including HEIC) still open the scanner first via `looksLikeHeic`.
