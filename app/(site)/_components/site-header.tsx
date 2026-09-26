"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Arrow } from "./icons";
import { primaryNav, siteNav } from "./site-nav";

// At or below this width the inline navigation no longer fits between the logo and the
// header button, so the menu toggle takes over. Kept in step with globals.css.
const INLINE_NAV_BREAKPOINT = 1120;

export function SiteHeader() {
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);
  // The menu remembers the page it was opened on, so it closes by itself on navigation
  // (including back and forward) without an effect having to reset it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const menuOpen = openOn === pathname;
  const closeMenu = () => setOpenOn(null);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  useEffect(() => {
    let frame = 0;

    const updateHeader = () => {
      const header = headerRef.current;
      if (!header) return;

      const viewport = window.innerWidth;
      const distance = Math.max(280, Math.min(window.innerHeight * 0.52, 480));
      const raw = Math.min(Math.max(window.scrollY / distance, 0), 1);
      const progress = raw * raw * (3 - 2 * raw);
      const fullWidth = Math.min(1240, viewport - (viewport <= 720 ? 28 : 48));
      const compactWidth = viewport <= 720 ? 196 : 222;
      const width = fullWidth - (fullWidth - compactWidth) * progress;
      const expandedHeight = viewport <= 720 ? 70 : 82;
      const height = expandedHeight - (expandedHeight - 64) * progress;
      const fullOpacity = Math.max(0, 1 - progress * 2.2);
      const menuOpacity = viewport <= INLINE_NAV_BREAKPOINT ? 1 : Math.min(1, Math.max(0, (progress - 0.28) / 0.28));

      header.style.setProperty("--nav-width", `${width}px`);
      header.style.setProperty("--nav-height", `${height}px`);
      header.style.setProperty("--nav-progress", progress.toFixed(3));
      header.style.setProperty("--full-opacity", fullOpacity.toFixed(3));
      header.style.setProperty("--menu-opacity", menuOpacity.toFixed(3));
      header.style.setProperty("--nav-radius", `${24 * progress}px`);
      header.style.setProperty("--nav-blur", `${18 * progress}px`);
      header.style.setProperty("--nav-bg", `rgba(255, 255, 255, ${0.94 * progress})`);
      header.style.setProperty("--nav-border", `rgba(32, 25, 19, ${0.12 * progress})`);
      header.style.setProperty("--nav-shadow", `0 16px 45px rgba(28, 18, 10, ${0.16 * progress})`);
      header.classList.toggle("is-condensed", raw > 0.34);
    };

    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateHeader);
    };

    updateHeader();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
    // A route change resets scroll position, so the header has to be measured again.
  }, [pathname]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenOn(null);
    };
    document.body.classList.toggle("menu-visible", menuOpen);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.classList.remove("menu-visible");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  return (
    <>
      <a className="skip-link" href="#content">Skip to content</a>
      <div className="top-accent" />
      <header className="site-header" ref={headerRef}>
        <div className="header-inner">
          <Link className="brand" href="/" aria-label="ESKAY home" onClick={closeMenu}>
            <Image src="/logo.png" alt="ESKAY" width={1263} height={592} loading="eager" />
          </Link>
          <nav className="nav" aria-label="Main navigation">
            {primaryNav.map((item) => (
              <Link key={item.href} href={item.href} className={isActive(item.href) ? "active" : undefined} aria-current={isActive(item.href) ? "page" : undefined}>
                {item.short}
              </Link>
            ))}
          </nav>
          <Link className="button button-red header-button" href="/contact"><span>Get in touch</span><i><Arrow /></i></Link>
          <button className={menuOpen ? "menu-toggle is-open" : "menu-toggle"} type="button" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setOpenOn((current) => (current === pathname ? null : pathname))}>
            <span /><span />
          </button>
        </div>
      </header>

      <button className={menuOpen ? "menu-backdrop is-open" : "menu-backdrop"} type="button" aria-label="Close navigation menu" tabIndex={menuOpen ? 0 : -1} onClick={closeMenu} />
      {/* `inert` keeps the closed menu's links out of the tab order and the accessibility tree. */}
      <div className={menuOpen ? "menu-dropdown is-open" : "menu-dropdown"} inert={!menuOpen}>
        <div className="menu-heading">
          <span>Explore ESKAY</span>
          <p>Corporate information and stakeholder services</p>
        </div>
        <nav aria-label="Expanded navigation">
          {siteNav.map((item, index) => (
            <Link key={item.href} href={item.href} className={isActive(item.href) ? "active" : undefined} aria-current={isActive(item.href) ? "page" : undefined} onClick={closeMenu}>
              <small>{String(index + 1).padStart(2, "0")}</small><strong>{item.label}</strong><i><Arrow diagonal /></i>
            </Link>
          ))}
        </nav>
        <Link className="menu-partner" href="/login" onClick={closeMenu}>Registered partner? <strong>Sign in to the partner portal</strong><Arrow /></Link>
        <div className="menu-footer"><span>Experience</span><span>Knowledge</span><span>Evolution</span></div>
      </div>
    </>
  );
}
