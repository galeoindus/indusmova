/* Site-wide image error handling. Loaded in <head> so even static article
   pages have a listener before their first image request can fail. */
document.addEventListener('error', (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) return;

  // The Article of the Day runs a retry strategy which selects a different
  // article image; do not replace its failing URL before that handler runs.
  if (image.closest('.aotd-media')) return;

  // Brand and people tiles have a deliberate initials fallback underneath.
  if (image.closest('.credit-avatar, .credit-person-avatar, .credit-tile, .src-brand-mark')) {
    image.remove();
    return;
  }

  if (image.dataset.fallbackApplied === 'true') return;
  image.dataset.failedSrc = image.currentSrc || image.src || '';
  image.dataset.fallbackApplied = 'true';
  image.classList.add('image-fallback');
  image.src = '/assets/img/image-fallback.svg';
}, true);
