import type { Metadata } from "next";
import Link from "next/link";
import { Arrow, LineIcon, type IconName } from "../_components/icons";
import { PageHero } from "../_components/page-hero";

export const metadata: Metadata = {
  title: "Business Network",
  description: "ESKAY's distribution, retail and partnership network, and how to begin a business enquiry.",
};

const channels: { id: string; title: string; copy: string; icon: IconName }[] = [
  { id: "distributors", title: "Distributors", copy: "We work with distribution partners who share our commitment to reliable supply, compliant operations and long-term relationships.", icon: "truck" },
  { id: "retail", title: "Retail Partners", copy: "We support retail partners with consistent supply, clear communication and responsive service.", icon: "store" },
  { id: "quick-commerce", title: "Quick Commerce", copy: "Our network continues to evolve alongside modern distribution channels, including quick-commerce platforms.", icon: "bolt" },
];

// Capability areas as set out in the approved corporate content structure.
const capabilities = [
  ["Operations", "Structured systems that keep the network running reliably."],
  ["Manufacturing", "Production knowledge built over generations."],
  ["Technology", "Tools that make supply and service more dependable."],
  ["Market Understanding", "Insight into the markets our partners serve."],
  ["Sales & Distribution", "Coverage and coordination across our network."],
];

const reasons = [
  ["Experience", "Generations of business knowledge behind every partnership."],
  ["Reliability", "Consistent supply supported by structured operations."],
  ["Partnership", "Relationships built for the long term, not the single order."],
];

export default function BusinessNetwork() {
  return (
    <>
      <PageHero
        kicker="Business Network"
        title={<>Building Stronger Business <em>Networks.</em></>}
        lead="Our business ecosystem is supported by structured operations, market understanding and relationships across our wider network of partners."
        jumps={[
          ...channels.map(({ id, title }) => ({ id, label: title })),
          { id: "enquiries", label: "Business Enquiries" },
        ]}
      />

      <section className="section">
        <div className="container">
          <div className="center-heading" data-reveal>
            <p className="section-label centered">Our network</p>
            <h2>How We Reach the Market.</h2>
            <p>We continue to develop our capabilities across markets while strengthening the systems and processes that support business growth.</p>
          </div>
          <div className="pillar-grid" data-reveal>
            {channels.map((item, index) => (
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
          <div className="center-heading" data-reveal>
            <p className="section-label centered">Capabilities</p>
            <h2>Knowledge in Action.</h2>
            <p>Our capabilities bring together operational experience, manufacturing knowledge, process understanding, technology and market intelligence.</p>
          </div>
          <div className="principle-row" data-reveal>
            {capabilities.map(([title, copy], index) => (
              <div key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section dark">
        <div className="container">
          <div className="center-heading" data-reveal>
            <p className="section-label centered">Why partner with ESKAY</p>
            <h2>A Partner for the Long Term.</h2>
            <p>What our partners value most is not a single capability, but the dependability of the whole.</p>
          </div>
          <div className="principle-row cols-3" data-reveal>
            {reasons.map(([title, copy], index) => (
              <div key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section cta-section" id="enquiries">
        <div className="container">
          <div className="cta-band" data-reveal>
            <div>
              <p className="aside-label">Business enquiries</p>
              <h2>Start a partnership conversation.</h2>
              <p>For dealer, distributor, retail and vendor enquiries, share a few details and we will route your message to the right team.</p>
            </div>
            <Link className="button button-red" href="/contact#enquiry-form"><span>Make an enquiry</span><i><Arrow /></i></Link>
          </div>
        </div>
      </section>
    </>
  );
}
