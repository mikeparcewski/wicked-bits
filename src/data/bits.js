/**
 * bits.js — the list on the index, newest first. A bit is a folder under public/
 * (public/<slug>/index.html) served as-is; posting one is that folder plus one
 * entry here. Links are built from the slug and the site's base, so they follow
 * a domain switch. The family footer's promo card is separate: LATEST_BIT in
 * wicked-web's src/data/family.js.
 */
export const BITS = [
  {
    slug: 'the-work-factory',
    kind: 'Interactive',
    title: 'The Work: the one-shift factory',
    desc: 'Job in. Crew out. A playable scrolling factory where you can scan jobs, wake temporary AI workers, trip the production line, and teach the next shift.',
  },
];
