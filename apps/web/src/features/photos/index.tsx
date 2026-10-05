// Owns: the progress photos feature (SPEC §8). Entry points:
// - PhotosPage (/photos): grid by month, compare any two (side by side or slider), the monthly strip, pose filter.
// - PhotoCapturePage (/photos/new): live camera with a faint pose outline, file fallback, upload.
// - PhotosLink: a compact card linking to /photos (latest photo, count) for the Progress tab.
// Progress photos are private: downscaled and EXIF-stripped on the phone, served through short-lived signed links, never
// cached by the service worker, and never sent to any AI.
export { PhotosLibrary as PhotosPage } from './lib/PhotosLibrary'
export { CaptureScreen as PhotoCapturePage } from './lib/CaptureScreen'
export { PhotosLink } from './lib/PhotosLink'
