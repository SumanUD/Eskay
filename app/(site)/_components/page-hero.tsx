import Link from "next/link";
import { Fragment, type ReactNode } from "react";

type Jump = { id: string; label: string };

type PageHeroProps = {
  kicker: string;
  title: ReactNode;
  lead: string;
  /** Sections of this page, shown as in-page jump links along the bottom of the hero. */
  jumps?: Jump[];
};

export function PageHero({ kicker, title, lead, jumps }: PageHeroProps) {
  return (
    <section className="page-hero">
      <div className="page-hero-grid" aria-hidden="true" />
      <div className="feature-lines page-hero-rings" aria-hidden="true" />
      <div className="container page-hero-inner">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{kicker}</span>
        </nav>
        {/* The breadcrumb already names the page, so no separate kicker repeats it. */}
        <div data-reveal>
          <h1>{title}</h1>
          <p className="page-hero-lead">{lead}</p>
        </div>
      </div>
      {jumps && (
        <nav className="hero-caption page-jumps" aria-label="On this page">
          {/* Separators sit beside the links as direct flex children, as on the home hero. */}
          {jumps.map((jump, index) => (
            <Fragment key={jump.id}>
              {index > 0 && <i aria-hidden="true" />}
              <a href={`#${jump.id}`}>{jump.label}</a>
            </Fragment>
          ))}
        </nav>
      )}
    </section>
  );
}
