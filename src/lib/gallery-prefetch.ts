let galleryPagePrefetchStarted = false

/** Prefetch the lazy-loaded gallery page chunk on nav intent. */
export function prefetchGalleryPageChunk() {
  if (galleryPagePrefetchStarted) return
  galleryPagePrefetchStarted = true
  void import('@/pages/GalleryPage')
}
