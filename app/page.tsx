import Image from "next/image";
import Link from "next/link";
import { ContactSection } from "./_components/contact-section";
import { Arrow, LineIcon, type IconName } from "./_components/icons";

const pillars: { number: string; title: string; copy: string; icon: IconName; href: string }[] = [
  { number: "01", title: "Experience", copy: "Generations of business experience that build strength, stability and perspective.", icon: "experience", href: "/our-story" },
  { number: "02", title: "Knowledge", copy: "Operational understanding that supports informed decisions and continuous improvement.", icon: "knowledge", href: "/innovation" },
  { number: "03", title: "Evolution", copy: "A commitment to strengthening people, processes, technology and market understanding.", icon: "evolution", href: "/eskay-world" },
];

const strengths = [
  ["Experience-led", "Built on generations of learning"],
  ["People first", "Partners in long-term progress"],
  ["Operational focus", "Processes shaped by knowledge"],
  ["Responsible business", "Integrity in every relationship"],
];

const explore: { title: string; copy: string; icon: IconName; href: string }[] = [
  { title: "Our Story", copy: "The philosophy, heritage and vision behind ESKAY.", icon: "knowledge", href: "/our-story" },
  { title: "The ESKAY World", copy: "One organisation, working as a connected ecosystem.", icon: "globe", href: "/eskay-world" },
  { title: "Collections", copy: "A portfolio organised into three consistently managed lines.", icon: "layers", href: "/collections" },
  { title: "Accessories", copy: "Practical products developed around function and responsible use.", icon: "grid", href: "/accessories" },
  { title: "Innovation & Craftsmanship", copy: "Research, development and the discipline of making things well.", icon: "bulb", href: "/innovation" },
  { title: "Business Network", copy: "Distribution, retail and partnership across our markets.", icon: "business", href: "/business-network" },
];

const supportTypes: { title: string; copy: string; icon: IconName }[] = [
  { title: "General enquiry", copy: "Corporate information and general questions about ESKAY.", icon: "conversation" },
  { title: "Customer care", copy: "Questions, feedback, suggestions or concerns routed to the right team.", icon: "support" },
  { title: "Business support", copy: "Dealer, distributor, vendor and other business-related enquiries.", icon: "business" },
];

export default function Home() {
  return (
    <>
      <section className="hero" id="home">
        <Image className="hero-background" src="/bg.png" alt="" fill sizes="100vw" preload />
        <div className="hero-overlay" />
        <div className="container hero-inner">
          <div className="hero-content" data-reveal>
            <p className="hero-kicker">ESKAY · Corporate information</p>
            <h1>Experience.<br />Knowledge.<br /><em>Evolution.</em></h1>
            <p className="hero-copy">A business built on experience, strengthened by knowledge and continuously evolving through people, processes, technology and market understanding.</p>
            <div className="hero-actions">
              <a className="button button-red" href="#about"><span>Learn more</span><i><Arrow /></i></a>
              <a className="button button-outline" href="#contact"><span>Contact us</span><i><Arrow /></i></a>
            </div>
          </div>
        </div>
        <div className="hero-caption"><span>Experience</span><i /><span>Knowledge</span><i /><span>Evolution</span></div>
      </section>

      <section className="about section" id="about">
        <div className="container">
          <div className="about-lead">
            <div data-reveal>
              <p className="section-label">Who we are</p>
              <h2>Built on Experience.<br />Driven by Knowledge.</h2>
              <span className="gold-rule" />
              <p className="lead-copy">ESKAY is a business shaped by experience, operational knowledge and an evolving understanding of markets. Our approach brings together people, processes, manufacturing capabilities and business expertise to build a strong foundation for sustainable growth.</p>
            </div>
            <div className="about-feature" data-reveal>
              <div className="feature-lines" aria-hidden="true" />
              <div className="feature-logo"><span>E</span><i /><span>K</span><i /><span>E</span></div>
              <blockquote>“Experience shapes us.<br />Knowledge strengthens us.<br />Evolution moves us forward.”</blockquote>
              <p>A journey built over generations</p>
            </div>
          </div>

          <div className="pillar-grid" data-reveal>
            {pillars.map((pillar) => (
              <article className="pillar-card" key={pillar.title}>
                <span className="card-number">{pillar.number}</span>
                <div className="icon-disc"><LineIcon type={pillar.icon} /></div>
                <h3>{pillar.title}</h3>
                <p>{pillar.copy}</p>
                <span className="card-line" />
                <Link href={pillar.href} aria-label={`Learn more about ${pillar.title}`}><Arrow diagonal /></Link>
              </article>
            ))}
          </div>

          <div className="strength-strip" data-reveal>
            {strengths.map(([title, copy], index) => (
              <div key={title}><span>{String(index + 1).padStart(2, "0")}</span><strong>{title}</strong><p>{copy}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="section dark" id="explore">
        <div className="container">
          <div className="center-heading" data-reveal>
            <p className="section-label centered">Explore ESKAY</p>
            <h2>One Organisation. Many Dimensions.</h2>
            <p>From our philosophy to our partner network, discover how the parts of ESKAY fit together.</p>
          </div>
          <div className="pillar-grid" data-reveal>
            {explore.map((item, index) => (
              <article className="pillar-card" key={item.href}>
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

      <section className="support section" id="support">
        <div className="support-wave wave-left" aria-hidden="true" />
        <div className="support-wave wave-right" aria-hidden="true" />
        <div className="container">
          <div className="center-heading" data-reveal>
            <p className="section-label centered">Customer support</p>
            <h2>We&apos;re Here to Help</h2>
            <p>Have a question, suggestion or concern? We&apos;ll connect you with the right support.</p>
          </div>
          <div className="support-panel" data-reveal>
            <div className="support-grid">
              {supportTypes.map((item, index) => (
                <article key={item.title}>
                  <span className="support-index">0{index + 1}</span>
                  <div className="icon-disc large"><LineIcon type={item.icon} /></div>
                  <h3>{item.title}</h3>
                  <p>{item.copy}</p>
                </article>
              ))}
            </div>
            <a className="button button-red support-cta" href="#enquiry-form"><span>Open enquiry form</span><i><Arrow /></i></a>
          </div>
        </div>
      </section>

      <ContactSection />
    </>
  );
}
