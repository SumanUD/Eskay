import type { Metadata } from "next";
import Link from "next/link";
import { Arrow, LineIcon, type IconName } from "../_components/icons";
import { PageHero } from "../_components/page-hero";

export const metadata: Metadata = {
  title: "The ESKAY World",
  description: "How ESKAY operates as one connected ecosystem — product craft, design, innovation and a wide business network, each strengthening the others.",
};

const ecosystem: { title: string; copy: string; icon: IconName; href: string }[] = [
  { title: "Product Craft", copy: "Developed through structured processes, defined standards and continuous review.", icon: "flask", href: "/innovation" },
  { title: "Portfolio", copy: "A portfolio organised into clear lines, each managed with the same care.", icon: "layers", href: "/collections" },
  { title: "Accessories", copy: "Practical products developed around function, safety and responsible use.", icon: "grid", href: "/accessories" },
  { title: "Business Network", copy: "Distribution and retail partners who carry our standards to market.", icon: "business", href: "/business-network" },
];

const craft = [
  ["Sourcing", "Materials selected and checked against defined specifications."],
  ["Formulation", "Documented methods that keep every batch consistent."],
  ["Production", "Controlled processes run by experienced teams."],
  ["Quality Review", "Inspection at each stage before anything leaves our facilities."],
];

const difference = [
  ["Experience-led", "Generations of operating knowledge inform the decisions we make today."],
  ["Design-minded", "We consider how things are made, not only what is made."],
  ["Partnership-driven", "We grow alongside the partners who make up our network."],
];

export default function EskayWorld() {
  return (
    <>
      <PageHero
        kicker="The ESKAY World"
        title={<>One Organisation. A Connected <em>Ecosystem.</em></>}
        lead="ESKAY brings together product development, design, utility and a wide business network — each part informing and strengthening the others."
        jumps={[
          { id: "ecosystem", label: "The Ecosystem" },
          { id: "craft", label: "Product Craft" },
          { id: "design", label: "Design & Innovation" },
          { id: "difference", label: "The ESKAY Difference" },
        ]}
      />

      <section className="section" id="ecosystem">
        <div className="container">
          <div className="center-heading" data-reveal>
            <p className="section-label centered">The ecosystem</p>
            <h2>Every Part Connected.</h2>
            <p>Rather than a set of separate activities, ESKAY works as one ecosystem. Improvements in one area strengthen the whole.</p>
          </div>
          <div className="pillar-grid cols-4" data-reveal>
            {ecosystem.map((item, index) => (
              <article className="pillar-card" key={item.title}>
                <span className="card-number">{String(index + 1).padStart(2, "0")}</span>
                <div className="icon-disc"><LineIcon type={item.icon} /></div>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
                <span className="card-line" />
                <Link href={item.href} aria-label={`Explore ${item.title}`}><Arrow diagonal /></Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section tint" id="craft">
        <div className="container">
          <div className="split">
            <div data-reveal>
              <p className="section-label">Product craft</p>
              <h2>Made With Discipline.</h2>
              <span className="gold-rule" />
              <p className="lead-copy">Every product begins with process. Our teams work to defined standards across sourcing, formulation, production and quality review, so that what reaches our partners is consistent, dependable and made with care.</p>
            </div>
            <div className="about-feature" data-reveal>
              <div className="feature-lines" aria-hidden="true" />
              <div className="feature-logo"><span>E</span><i /><span>K</span><i /><span>E</span></div>
              <blockquote>“Consistency is not an accident. It is a process, repeated well.”</blockquote>
              <p>Standards in practice</p>
            </div>
          </div>
          <div className="principle-row cols-4" data-reveal>
            {craft.map(([title, copy], index) => (
              <div key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="design">
        <div className="container">
          <div className="split reverse">
            <div data-reveal>
              <p className="section-label">Design &amp; innovation</p>
              <h2>Always Exploring What Comes Next.</h2>
              <span className="gold-rule" />
              <p className="lead-copy">We continuously explore new formats, packaging, convenience and product evolution — guided by research, partner feedback and a commitment to doing things better than before.</p>
              <Link className="text-link" href="/innovation">Inside our innovation work <Arrow /></Link>
            </div>
            <div className="about-feature" data-reveal>
              <div className="feature-lines" aria-hidden="true" />
              <div className="feature-logo"><span>E</span><i /><span>K</span><i /><span>E</span></div>
              <blockquote>“Innovation is a discipline, not an event.”</blockquote>
              <p>Research · Develop · Refine</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section dark" id="difference">
        <div className="container">
          <div className="center-heading" data-reveal>
            <p className="section-label centered">The ESKAY difference</p>
            <h2>Experience-Led. Design-Minded. Built to Last.</h2>
            <p>What sets ESKAY apart is not any single capability, but how they work together.</p>
          </div>
          <div className="principle-row cols-3" data-reveal>
            {difference.map(([title, copy], index) => (
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
              <h2>See our portfolio.</h2>
              <p>Three lines, developed and reviewed to the same standards of quality and care.</p>
            </div>
            <Link className="button button-red" href="/collections"><span>Collections</span><i><Arrow /></i></Link>
          </div>
        </div>
      </section>
    </>
  );
}
