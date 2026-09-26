import type { Metadata } from "next";
import Link from "next/link";
import { Arrow, LineIcon } from "../_components/icons";
import { PageHero } from "../_components/page-hero";

export const metadata: Metadata = {
  title: "Collections",
  description: "How ESKAY's portfolio is organised into three lines, each developed, produced and reviewed to the same standards.",
};

// Corporate description only: the lines are named, but no product, flavour or experience claims
// are made about them, in keeping with the site's COTPA-conscious content guardrails.
const collections = [
  {
    id: "signature",
    mark: "S",
    name: "Signature Collection",
    copy: "Our signature line reflects ESKAY's most current thinking in development and design. It brings together refined processes, considered packaging and the standards that define the ESKAY name.",
    tags: ["Current development", "Considered packaging", "Quality review"],
  },
  {
    id: "flavoured",
    mark: "F",
    name: "Flavoured Collection",
    copy: "Developed through a structured research and formulation process. Every variant is documented, tested and held to the same quality review as each ESKAY line.",
    tags: ["Structured research", "Documented formulation", "Quality review"],
  },
  {
    id: "classic",
    mark: "C",
    name: "Classic Collection",
    copy: "Grounded in long-established methods and generations of manufacturing knowledge, the classic line reflects the consistency on which ESKAY was built.",
    tags: ["Established methods", "Manufacturing knowledge", "Consistent production"],
  },
];

export default function Collections() {
  return (
    <>
      <PageHero
        kicker="Collections"
        title={<>A Portfolio Built on <em>Consistency.</em></>}
        lead="ESKAY's portfolio is organised into three distinct lines. Each is developed, produced and reviewed to the same standards of quality and care."
        jumps={collections.map(({ id, name }) => ({ id, label: name }))}
      />

      <section className="section">
        <div className="container">
          <div className="center-heading" data-reveal>
            <p className="section-label centered">Our portfolio</p>
            <h2>Three Lines. One Standard.</h2>
            <p>Whatever the line, the same development discipline and quality review apply from the first stage to the last.</p>
          </div>
          <div className="collection-list">
            {collections.map((collection, index) => (
              <article className="collection-row" id={collection.id} key={collection.id} data-reveal>
                <div className="collection-mark" aria-hidden="true">
                  <span>Line {String(index + 1).padStart(2, "0")}</span>
                  <b>{collection.mark}</b>
                </div>
                <div className="collection-body">
                  <h3>{collection.name}</h3>
                  <p>{collection.copy}</p>
                  <div className="collection-tags">{collection.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                </div>
              </article>
            ))}
          </div>

          <div className="trade-note" data-reveal>
            <div className="icon-disc"><LineIcon type="business" /></div>
            <div>
              <h3>Portfolio information for trade partners</h3>
              <p>Detailed portfolio information is shared with registered distributors and retail partners through our partner portal. <Link className="inline-link" href="/login">Registered partners can sign in here.</Link></p>
            </div>
            <Link className="button button-red" href="/business-network"><span>Business network</span><i><Arrow /></i></Link>
          </div>
        </div>
      </section>
    </>
  );
}
