import type { Metadata } from "next";
import Link from "next/link";
import { Arrow } from "../_components/icons";
import { PageHero } from "../_components/page-hero";

export const metadata: Metadata = {
  title: "Our Story",
  description: "The philosophy, heritage and vision behind ESKAY — an organisation built on experience, knowledge and continuous evolution.",
};

const principles = [
  ["Experiences Matter", "We measure our work by the confidence it builds among the people and partners we serve."],
  ["Design Matters", "Considered design shapes everything we develop, from process to presentation."],
  ["Innovation Matters", "We keep asking how things are made, and how they could be made better."],
  ["Convenience Matters", "Dependable supply and simple, responsive service for every partner in our network."],
  ["Every Day Matters", "Consistency in the everyday is what earns trust over years."],
];

const journey = [
  ["Foundations", "Generations of hands-on business experience laid the groundwork for how ESKAY operates today."],
  ["Capability", "Operational knowledge, manufacturing understanding and market insight grew with every stage."],
  ["Evolution", "Today we are building a modern organisation — design-led, innovation-driven and ready for what comes next."],
];

const values = ["Integrity", "Knowledge", "Quality", "Responsibility", "Continuous Improvement", "Long-Term Thinking"];

export default function OurStory() {
  return (
    <>
      <PageHero
        kicker="Our Story"
        title={<>Every Day Is Made of <em>Moments.</em></>}
        lead="Life is shaped less by what we own and more by what we experience. That belief guides how ESKAY thinks about its people, its partners and the work it does every day."
        jumps={[
          { id: "philosophy", label: "Brand Philosophy" },
          { id: "heritage", label: "Heritage & Evolution" },
          { id: "vision", label: "Vision" },
        ]}
      />

      <section className="section" id="philosophy">
        <div className="container">
          <div className="split">
            <div data-reveal>
              <p className="section-label">Brand philosophy</p>
              <h2>Built Around People.</h2>
              <span className="gold-rule" />
              <p className="lead-copy">The value of any business lies in the relationships it builds and the standards it keeps. Our approach starts with people — the teams who build our capabilities, the partners who extend our reach and the stakeholders who place their trust in us.</p>
            </div>
            <div className="about-feature" data-reveal>
              <div className="feature-lines" aria-hidden="true" />
              <div className="feature-logo"><span>E</span><i /><span>K</span><i /><span>E</span></div>
              <blockquote>“Our work is defined not by what we make,<br />but by how well we make it.”</blockquote>
              <p>The thinking behind ESKAY</p>
            </div>
          </div>
          <div className="principle-row" data-reveal>
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

      <section className="section tint" id="heritage">
        <div className="container">
          <div className="center-heading" data-reveal>
            <p className="section-label centered">Heritage &amp; evolution</p>
            <h2>A Journey Built Over Generations.</h2>
            <p>Our journey is shaped by generations of business experience, continuous learning and an ability to evolve with changing markets. Every stage has contributed to our knowledge, capabilities and approach to business.</p>
          </div>
          <div className="principle-row cols-3" data-reveal>
            {journey.map(([title, copy], index) => (
              <div key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="vision">
        <div className="container">
          <div className="split">
            <div data-reveal>
              <p className="section-label">Vision</p>
              <h2>Our Vision. Our Values.</h2>
              <span className="gold-rule" />
              <p className="lead-copy">Our vision is to build an organisation grounded in knowledge, responsible business practices, operational excellence and continuous evolution. Our values guide how we work — with our people, partners, customers and wider business ecosystem.</p>
              <div className="value-chips">{values.map((value) => <span key={value}>{value}</span>)}</div>
            </div>
            <div className="about-feature" data-reveal>
              <div className="feature-lines" aria-hidden="true" />
              <div className="feature-logo"><span>E</span><i /><span>K</span><i /><span>E</span></div>
              <blockquote>“One organisation bringing together innovation, design, utility and business capability.”</blockquote>
              <p>ESKAY Collective</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section cta-section">
        <div className="container">
          <div className="cta-band" data-reveal>
            <div>
              <p className="aside-label">Continue exploring</p>
              <h2>See how the pieces connect.</h2>
              <p>Discover the ecosystem that brings our product craft, design and partner network together.</p>
            </div>
            <Link className="button button-red" href="/eskay-world"><span>The ESKAY World</span><i><Arrow /></i></Link>
          </div>
        </div>
      </section>
    </>
  );
}
