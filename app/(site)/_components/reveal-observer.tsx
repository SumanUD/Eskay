"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Fades `[data-reveal]` elements in as they scroll into view. It lives in the root layout,
// which does not re-render on navigation, so it keys off the pathname to pick up each new
// page's elements.
export function RevealObserver() {
  const pathname = usePathname();

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    // Wait a frame so the incoming page has been painted before it is scanned.
    const frame = requestAnimationFrame(() => {
      document.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-visible)").forEach((element) => observer.observe(element));
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
