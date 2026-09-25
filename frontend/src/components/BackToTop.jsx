import { useEffect, useState } from 'react';

// Hidden until the customer scrolls down as far as whichever section
// `targetRef` points at (not just some arbitrary pixel count down the
// page), so it isn't sitting over a page's hero. IntersectionObserver on
// that section is the natural fit — it's already tracking exactly the "has
// this section been reached" signal we want, rather than re-deriving it
// from raw scroll position.
export default function BackToTop({ targetRef }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      // Once scrolled past the section further down the page, it's no
      // longer "intersecting" either — but that's exactly where the button
      // should stay visible, not disappear again. Only hide it when the
      // section is below the viewport (scrolled back up above it).
      setVisible(entry.isIntersecting || entry.boundingClientRect.top < 0);
    }, { threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [targetRef]);

  if (!visible) return null;
  return (
    <button
      type="button"
      className="back-to-top"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
        <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
