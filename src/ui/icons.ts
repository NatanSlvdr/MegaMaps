const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const icons = {
  map: svg(
    '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15M15 6v15"/>',
  ),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  arrow: svg('<path d="m15 5-7 7 7 7"/>'),
  fit: svg(
    '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/><rect x="7" y="7" width="10" height="10" rx="1"/>',
  ),
  trash: svg('<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>'),
  check: svg('<path d="m5 12 4 4L19 6"/>'),
  folder: svg(
    '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  ),
};
