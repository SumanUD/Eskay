import type { Metadata } from "next";
import Link from "next/link";
import { Arrow, LineIcon, type IconName } from "../_components/icons";
import { PageHero } from "../_components/page-hero";

export const metadata: Metadata = {
  title: "Accessories",
  description: "ESKAY's accessories, developed around a practical purpose: function, safety, durability and responsible use.",
};

// Framed on utility, safety and responsible disposal. Icons stay abstract so the page carries
// no consumption imagery.
const accessories: { id: string; title: string; copy: string; icon: IconName }[] = [
  { id: "lighters", title: "Lighters", copy: "Developed with attention to reliability, safe operation and dependable build quality.", icon: "shield" },
  { id: "ashtrays", title: "Portable Ashtrays", copy: "A practical way to dispose of waste responsibly on the move, helping keep public spaces clean.", icon: "leaf" },
  { id: "utility", title: "Holders & Utility", copy: "Everyday utility items designed for durability and simple, practical use.", icon: "grid" },
  { id: "future", title: "Future Products", copy: "New utility categories, explored through research and held to our design standards.", icon: "compass" },
];

const principles = [
  ["Function", "Every accessory starts with a clear, practical purpose."],
  ["Safety", "Designed and checked for safe, dependable operation."],
  ["Durability", "Built from materials chosen to last in everyday use."],
  ["Responsibility", "Developed with care for users and the spaces around them."],
];

export default function Accessories() {
  return (
    <>
      <PageHero
        kicker="Accessories"
        title={<>Designed Around <em>Utility.</em></>}
        lead="ESKAY's accessories are developed with a practical purpose in mind: function, safety, durability and responsible use."
        jumps={accessories.map(({ id, title }) => ({ id, label: title }))}
      />

      <section className="section">
        <div className="container">
          <div className="center-heading" data-reveal>
            <p className="section-label centered">The range</p>
            <h2>Practical by Design.</h2>
            <p>A focused range of accessories, each developed around a clear everyday function.</p>
          </div>
          <div className="pillar-grid cols-4" data-reveal>
            {accessories.map((item, index) => (
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

      <section className="section tint">
        <div className="container">
          <div className="split">
            <div data-reveal>
              <p className="section-label">Design principles</p>
              <h2>Four Principles Behind Every Accessory.</h2>
              <span className="gold-rule" />
              <p className="lead-copy">The same discipline that shapes our wider work applies here. Each accessory is reviewed against four simple principles before it is developed further.</p>
            </div>
            <div className="about-feature" data-reveal>
              <div className="feature-lines" aria-hidden="true" />
              <div className="feature-logo"><span>E</span><i /><span>K</span><i /><span>E</span></div>
              <blockquote>“Useful first. Everything else follows.”</blockquote>
              <p>Accessory design at ESKAY</p>
            </div>
          </div>
          <div className="principle-row cols-4" data-reveal>
            {principles.map(([title, copy], index) => (
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
          <div className="trade-note" data-reveal>
            <div className="icon-disc"><LineIcon type="business" /></div>
            <div>
              <h3>Availability for trade partners</h3>
              <p>Information on the accessory range is shared with distributors and retail partners through our partner portal. <Link className="inline-link" href="/login">Registered partners can sign in here.</Link></p>
            </div>
            <Link className="button button-red" href="/business-network"><span>Business network</span><i><Arrow /></i></Link>
          </div>
        </div>
      </section>
    </>
  );
}
