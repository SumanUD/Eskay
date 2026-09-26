import type { Metadata } from "next";
import { ContactSection } from "../_components/contact-section";
import { PageHero } from "../_components/page-hero";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact ESKAY for corporate, dealer, distributor and business-related enquiries, or for customer care.",
};

export default function Contact() {
  return (
    <>
      <PageHero
        kicker="Contact"
        title={<>Connect with <em>ESKAY.</em></>}
        lead="For corporate, dealer, distributor and business-related enquiries, share a few details and we will route your message to the appropriate team."
      />
      {/* The hero already carries this page's heading, so the section's own is suppressed. */}
      <ContactSection heading={false} />
    </>
  );
}
