"use client";

import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";

const pillars = [
  { number: "01", title: "Experience", copy: "Generations of business experience that build strength, stability and perspective.", icon: "experience" },
  { number: "02", title: "Knowledge", copy: "Operational understanding that supports informed decisions and continuous improvement.", icon: "knowledge" },
  { number: "03", title: "Evolution", copy: "A commitment to strengthening people, processes, technology and market understanding.", icon: "evolution" },
];

const strengths = [
  ["Experience-led", "Built on generations of learning"],
  ["People first", "Partners in long-term progress"],
  ["Operational focus", "Processes shaped by knowledge"],
  ["Responsible business", "Integrity in every relationship"],
];

const supportTypes = [
  { title: "General enquiry", copy: "Corporate information and general questions about ESKAY.", icon: "conversation" },
  { title: "Customer care", copy: "Questions, feedback, suggestions or concerns routed to the right team.", icon: "support" },
  { title: "Business support", copy: "Dealer, distributor, vendor and other business-related enquiries.", icon: "business" },
];

const contactEndpoint = process.env.NEXT_PUBLIC_CONTACT_API_URL ?? "https://eskay.sumitkumardas.xyz/v1/contact";

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d={diagonal ? "M6 18 18 6M8 6h10v10" : "M5 12h14M14 7l5 5-5 5"} />
    </svg>
  );
}

function LineIcon({ type }: { type: string }) {
  const paths: Record<string, React.ReactNode> = {
    experience: <><circle cx="10" cy="8" r="4" /><path d="M3 21c0-4 3-7 7-7 2 0 3.6.6 5 1.8M17 13l1.4 2.2 2.6.5-1.8 2 .3 2.7-2.5-1.1-2.4 1.1.3-2.7-1.9-2 2.7-.5L17 13Z" /></>,
    knowledge: <><path d="M3 5.5c3-1.5 6-1 9 1v14c-3-2-6-2.5-9-1V5.5ZM21 5.5c-3-1.5-6-1-9 1v14c3-2 6-2.5 9-1V5.5Z" /></>,
    evolution: <><path d="M4 20V11M10 20V7M16 20V3M2 20h20M3 8l5-4 4 2 8-5" /><path d="M16 1h4v4" /></>,
    conversation: <><path d="M4 17.5 2 22l5-2c1.3.6 2.8 1 4.5 1 5.2 0 9.5-3.6 9.5-8s-4.3-8-9.5-8S2 8.6 2 13c0 1.7.7 3.2 2 4.5Z" /><path d="M8 12h7M8 15h4" /></>,
    support: <><path d="M4 13v-2a8 8 0 0 1 16 0v2M4 13a2 2 0 0 0 0 4h2v-6H4v2ZM20 13a2 2 0 0 1 0 4h-2v-6h2v2ZM18 18c-1 2-3 3-6 3" /></>,
    business: <><rect x="3" y="7" width="18" height="13" rx="1" /><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2" /></>,
  };
  return <svg aria-hidden="true" className="line-icon" viewBox="0 0 24 24">{paths[type]}</svg>;
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [formState, setFormState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

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
      const menuOpacity = viewport <= 980 ? 1 : Math.min(1, Math.max(0, (progress - 0.28) / 0.28));

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
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.body.classList.toggle("menu-visible", menuOpen);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.classList.remove("menu-visible");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  async function submitEnquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    setFormState("submitting");

    try {
      const response = await fetch(contactEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          organisation: formData.get("organisation"),
          email: formData.get("email"),
          phone: formData.get("phone"),
          type: formData.get("type"),
          message: formData.get("message"),
          consent: formData.get("consent") === "on",
          website: formData.get("website"),
        }),
      });

      if (!response.ok) throw new Error("Unable to submit enquiry");

      form.reset();
      setFormState("success");
    } catch {
      setFormState("error");
    }
  }

  return (
    <main>
      <a className="skip-link" href="#content">Skip to content</a>
      <div className="top-accent" />
      <header className="site-header" ref={headerRef}>
        <div className="header-inner">
          <a className="brand" href="#home" aria-label="ESKAY home">
            <Image src="/logo.png" alt="ESKAY" width={1263} height={592} loading="eager" />
          </a>
          <nav className="nav" aria-label="Main navigation">
            <a className="active" href="#home" onClick={() => setMenuOpen(false)}>Home</a>
            <a href="#about" onClick={() => setMenuOpen(false)}>Corporate</a>
            <a href="#support" onClick={() => setMenuOpen(false)}>Support</a>
            <a href="#contact" onClick={() => setMenuOpen(false)}>Contact</a>
          </nav>
          <a className="button button-red header-button" href="#contact"><span>Get in touch</span><i><Arrow /></i></a>
          <button className={menuOpen ? "menu-toggle is-open" : "menu-toggle"} type="button" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            <span /><span />
          </button>
        </div>
      </header>

      <button
        className={menuOpen ? "menu-backdrop is-open" : "menu-backdrop"}
        type="button"
        aria-label="Close navigation menu"
        onClick={() => setMenuOpen(false)}
      />
      <div className={menuOpen ? "menu-dropdown is-open" : "menu-dropdown"} aria-hidden={!menuOpen}>
        <div className="menu-heading">
          <span>Explore ESKAY</span>
          <p>Corporate information and stakeholder services</p>
        </div>
        <nav aria-label="Expanded navigation">
          <a href="#home" onClick={() => setMenuOpen(false)}><small>01</small><strong>Home</strong><i><Arrow diagonal /></i></a>
          <a href="#about" onClick={() => setMenuOpen(false)}><small>02</small><strong>Corporate</strong><i><Arrow diagonal /></i></a>
          <a href="#support" onClick={() => setMenuOpen(false)}><small>03</small><strong>Customer support</strong><i><Arrow diagonal /></i></a>
          <a href="#contact" onClick={() => setMenuOpen(false)}><small>04</small><strong>Contact</strong><i><Arrow diagonal /></i></a>
        </nav>
        <div className="menu-footer"><span>Experience</span><span>Knowledge</span><span>Evolution</span></div>
      </div>

      <section className="hero" id="home">
        <Image className="hero-background" src="/bg.png" alt="" fill sizes="100vw" preload />
        <div className="hero-overlay" />
        <div className="container hero-inner" id="content">
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
                <a href="#contact" aria-label={"Enquire about " + pillar.title}><Arrow diagonal /></a>
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

      <section className="contact section" id="contact">
        <div className="contact-pattern" aria-hidden="true" />
        <div className="container">
          <div className="center-heading" data-reveal>
            <p className="section-label centered">Contact us</p>
            <h2>Connect with ESKAY</h2>
            <p>For corporate, dealer, distributor and business-related enquiries, reach the appropriate team.</p>
          </div>
          <div className="contact-shell" data-reveal>
            <aside>
              <p className="aside-label">Enquiry routing</p>
              <h3>Start the right conversation.</h3>
              <p className="aside-copy">Share a few details and your message will be directed to the appropriate ESKAY team.</p>
              <ul>
                <li><span>01</span><div><b>Corporate</b><small>Institutional and general requests</small></div></li>
                <li><span>02</span><div><b>Business network</b><small>Dealer, distributor and vendor enquiries</small></div></li>
                <li><span>03</span><div><b>Customer care</b><small>Questions, feedback and concerns</small></div></li>
              </ul>
              <p className="compliance-chip">Corporate information only</p>
            </aside>
            <form id="enquiry-form" onSubmit={submitEnquiry}>
              <label><span>Full name</span><input name="name" type="text" autoComplete="name" required /></label>
              <label><span>Organisation</span><input name="organisation" type="text" autoComplete="organization" /></label>
              <label><span>Work email</span><input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
              <label><span>Phone number</span><input name="phone" type="tel" autoComplete="tel" inputMode="tel" pattern="[0-9+() -]{7,20}" maxLength={20} title="Enter a valid phone number with 7 to 15 digits." /></label>
              <label className="wide"><span>Enquiry type</span><select name="type" defaultValue="" required><option value="" disabled>Select one</option><option>Corporate enquiry</option><option>Dealer or distributor enquiry</option><option>Customer care</option><option>Other business enquiry</option></select></label>
              <label className="wide"><span>Your message</span><textarea name="message" rows={5} required /></label>
              <label className="consent wide"><input name="consent" type="checkbox" required /><span>I agree that ESKAY may use these details to respond to my enquiry.</span></label>
              <label className="form-trap" aria-hidden="true"><span>Website</span><input name="website" type="text" tabIndex={-1} autoComplete="off" /></label>
              <button className="button button-red submit-button wide" type="submit" disabled={formState === "submitting"} aria-busy={formState === "submitting"}><span>{formState === "submitting" ? "Sending…" : "Send message"}</span><i><Arrow /></i></button>
              <p className={formState === "idle" ? "form-status wide" : formState === "error" ? "form-status is-visible is-error wide" : "form-status is-visible wide"} role="status" aria-live="polite">
                {formState === "submitting" && "Sending your enquiry securely…"}
                {formState === "success" && "Thank you. Your enquiry has been sent, and a confirmation is on its way to your email."}
                {formState === "error" && "We could not send your enquiry. Please check your details and try again shortly."}
              </p>
            </form>
          </div>
        </div>
      </section>

      <footer>
        <div className="container footer-grid">
          <div className="footer-about">
            <a className="footer-brand" href="#home" aria-label="ESKAY home"><Image src="/logo.png" alt="ESKAY" width={1263} height={592} /></a>
            <p>A business built on experience, strengthened by knowledge and continuously evolving.</p>
          </div>
          <div><h3>Quick links</h3><a href="#home">Home <Arrow /></a><a href="#about">Corporate <Arrow /></a><a href="#support">Support <Arrow /></a><a href="#contact">Contact <Arrow /></a></div>
          <div><h3>Enquiries</h3><a href="#enquiry-form">Corporate enquiries <Arrow /></a><a href="#enquiry-form">Business network <Arrow /></a><a href="#enquiry-form">Customer care <Arrow /></a></div>
          <div><h3>Business approach</h3><p>Integrity<br />Knowledge<br />Quality<br />Responsibility</p></div>
        </div>
        <div className="container footer-bottom">
          <p>&copy; {new Date().getFullYear()} ESKAY. All rights reserved.</p>
          <p>Corporate information only. This website does not advertise, promote or offer tobacco products for sale. Final publication remains subject to legal and compliance review.</p>
        </div>
      </footer>
    </main>
  );
}
