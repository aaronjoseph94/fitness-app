// Owns: the data feature (SPEC §8 "Export and backup"). Entry point:
// - DataPage (/settings/data): "Export everything" builds the zip in the browser (CSV per table, full.json, photos,
//   scan sheets and report PDFs); "Restore from export" reads a zip and pages it into a fresh instance; a note on the
//   monthly per-table backup the Worker writes to R2.
export { DataPage } from './lib/DataPage'
