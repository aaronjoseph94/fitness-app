// Owns: the progress photos feature (SPEC §8). Entry points:
// - PhotosPage (/photos): grid by month, compare any two (side by side or slider), the monthly strip, pose filter.
// - PhotoCapturePage (/photos/new): live camera with a faint pose outline, file fallback, upload.
// - PhotosLink: a compact card linking to /photos (latest photo, count) for the Progress tab.
// - photoFromFile + useUploadPhoto (with POSES): a picked file saved as a progress photo from elsewhere (Ask AI).
// Progress photos are private: downscaled and EXIF-stripped on the device, served through short-lived signed links, never
// cached by the service worker, and never sent to any AI.
export { PhotosLibrary as PhotosPage } from './lib/PhotosLibrary'
export { CaptureScreen as PhotoCapturePage } from './lib/CaptureScreen'
export { PhotosLink } from './lib/PhotosLink'
// Ask AI's "Progress photo" tag saves through the same path (and never attaches it to a message).
export { photoFromFile, releasePhoto } from './lib/prepare'
export { POSES, POSE_LABEL, useUploadPhoto } from './lib/data'
