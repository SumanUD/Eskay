import type { Metadata } from "next";
import Link from "next/link";
import { Arrow, LineIcon, type IconName } from "../_components/icons";
import { PageHero } from "../_components/page-hero";

export const metadata: Metadata = {
  title: "Innovation & Craftsmanship",
  description: "Innovation at ESKAY is a continuous cycle of research, development, testing and refinement, grounded in craftsmanship and defined quality standards.",
};

const studio = [
  ["Insight", "Understanding changing needs through research and feedback from our partner network."],
  ["Concept", "Shaping ideas into clear, testable proposals before any development begins."],
  ["Development", "Turning approved concepts into products through structured, documented work."],
  ["Refinement", "Reviewing results and improving continuously, long after launch."],
];

const areas: { id: string; title: string; copy: string; icon: IconName }[] = [
  { id: "development", title: "Product Development", copy: "Structured development that moves every product from concept to production through defined stages.", icon: "gear" },
  { id: "research", title: "Formulation & Research", copy: "Research-led formulation work, documented and reviewed against defined quality standards.", icon: "flask" },
  { id: "packaging", title: "Packaging & Design", copy: "Packaging developed for protection, clear information and full regulatory compliance.", icon: "package" },
  { id: "future", title: "Future Concepts", copy: "Early exploration of new formats and categories, guided by research and our design standards.", icon: "bulb" },
];

const craftsmanship = [
  ["Precision", "Exacting attention to detail at every stage of production."],
  ["Consistency", "The same result, batch after batch, through controlled methods."],
  ["Testing", "Checks built into the process rather than added at the end."],
  ["Improvement", "Every review is a chance to make the next batch better."],
];

export default function Innovation() {
  return (
    <>
      <PageHero
        kicker="Innovation & Craftsmanship"
        title={<>Where Knowledge Becomes <em>Innovation.</em></>}
        lead="Innovation at ESKAY is a discipline, not an event — a continuous cycle of research, development, testing and refinement."
        jumps={areas.map(({ id, title }) => ({ id, label: title }))}
      />

      <section className="section" id="studio">
        <div className="container">
          <div className="split">
            <div data-reveal>
              <p className="section-label">The innovation studio</p>
              <h2>From Insight to Refinement.</h2>
              <span className="gold-rule" />
              <p className="lead-copy">Our innovation work follows a structured process. Ideas move from insight to concept to development, and every stage is reviewed before the next one begins.</p>
            </div>
            <div className="about-feature" data-reveal>
              <div className="feature-lines" aria-hidden="true" />
              <div className="feature-logo"><span>E</span><i /><span>K</span><i /><span>E</span></div>
              <blockquote>“We keep asking how things are made — and how they could be made better.”</blockquote>
              <p>The innovation studio</p>
            </div>
          </div>
          <div className="principle-row cols-4" data-reveal>
            {studio.map(([title, copy], index) => (
              <div key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section tint">
        <div className="container">
          <div className="center-heading" data-reveal>
            <p className="section-label centered">Areas of focus</p>
            <h2>Four Areas of Work.</h2>
            <p>Innovation at ESKAY spans the whole life of a product, from first research to finished packaging.</p>
          </div>
          <div className="pillar-grid cols-4" data-reveal>
            {areas.map((item, index) => (
              <article className="pillar-card" id={item.id} key={item.id}>
                <span className="card-number">{String(index + 1).padStart(2, "0")}</span>
                <div className="icon-disc"><LineIcon type={item.icon} /></div>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
                <span className="card-line" />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section dark">
        <div className="container">
          <div className="center-heading" data-reveal>
            <p className="section-label centered">Craftsmanship</p>
            <h2>Craftsmanship Meets Process.</h2>
            <p>Generations of manufacturing knowledge, carried into modern, measurable methods.</p>
          </div>
          <div className="principle-row cols-4" data-reveal>
            {craftsmanship.map(([title, copy], index) => (
              <div key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section cta-section">
        <div className="container">
          <div className="cta-band" data-reveal>
            <div>
              <p className="aside-label">Continue exploring</p>
              <h2>Meet our partner network.</h2>
              <p>The distributors and retail partners who carry our standards to market.</p>
            </div>
            <Link className="button button-red" href="/business-network"><span>Business Network</span><i><Arrow /></i></Link>
          </div>
        </div>
      </section>
    </>
  );
}
