"use client";

import { FormEvent, useState } from "react";
import { Arrow } from "./icons";

const contactEndpoint = process.env.NEXT_PUBLIC_CONTACT_API_URL ?? "https://eskay.sumitkumardas.xyz/v1/contact";

// `pattern` only blocks submission, it never stops the keystroke, so a field would still show
// rejected characters until the user pressed send. Drop them as they are typed instead.
function filterInput(event: FormEvent<HTMLInputElement>, disallowed: RegExp) {
  const input = event.currentTarget;
  const cleaned = input.value.replace(disallowed, "");
  if (cleaned !== input.value) input.value = cleaned;
}
// An Indian number is 10 digits. A +91 country code and a leading trunk 0 are prefixes around
// that number, not part of it, so they are discounted before the 10 digits are counted.
function significantPhoneDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}
// `pattern` cannot count digits separated by spaces or hyphens, so the length rule is a custom
// validity message instead; the browser blocks submission on it exactly as it would on a pattern.
function handlePhoneInput(event: FormEvent<HTMLInputElement>) {
  filterInput(event, /[^0-9+() -]/g);
  const input = event.currentTarget;
  input.setCustomValidity(significantPhoneDigits(input.value).length === 10 ? "" : "Enter a 10-digit phone number.");
}
// Names are letters in any script, plus the separators real names actually carry: S. K. Das,
// D'Souza, Anne-Marie. U+2019 is included because iOS and Word autocorrect ' into it.
const stripNameInput = (event: FormEvent<HTMLInputElement>) => filterInput(event, /[^\p{L}\p{M} '’\-.]/gu);

/** The enquiry form and its routing panel, shared by the home page and the contact page. */
export function ContactSection({ heading = true }: { heading?: boolean }) {
  const [formState, setFormState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [formError, setFormError] = useState("");

  async function submitEnquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    setFormError("");
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

      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { error?: string } | null;
        setFormError(response.status === 429
          ? "You have sent several enquiries recently. Please wait a few minutes before trying again."
          : detail?.error ?? "We could not send your enquiry. Please check your details and try again shortly.");
        setFormState("error");
        return;
      }

      form.reset();
      setFormState("success");
    } catch {
      setFormError("We could not reach the server. Please check your connection and try again.");
      setFormState("error");
    }
  }

  return (
    <section className="contact section" id="contact">
      <div className="contact-pattern" aria-hidden="true" />
      <div className="container">
        {heading && (
          <div className="center-heading" data-reveal>
            <p className="section-label centered">Contact us</p>
            <h2>Connect with ESKAY</h2>
            <p>For corporate, dealer, distributor and business-related enquiries, reach the appropriate team.</p>
          </div>
        )}
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
            <label><span>Full name<b className="req" aria-hidden="true">*</b></span><input name="name" type="text" autoComplete="name" minLength={2} maxLength={100} required pattern="[\p{L}\p{M}][\p{L}\p{M} '’\-.]{1,99}" title="Letters, spaces, apostrophes, hyphens and full stops only." onInput={stripNameInput} /></label>
            <label><span>Organisation<b className="req" aria-hidden="true">*</b></span><input name="organisation" type="text" autoComplete="organization" minLength={2} maxLength={120} required /></label>
            <label><span>Work email<b className="req" aria-hidden="true">*</b></span><input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
            <label><span>Phone number<b className="req" aria-hidden="true">*</b></span><input name="phone" type="tel" autoComplete="tel" inputMode="tel" pattern="[0-9+\(\)\- ]{10,20}" maxLength={20} required title="Enter a 10-digit phone number." onInput={handlePhoneInput} /></label>
            <label className="wide"><span>Enquiry type<b className="req" aria-hidden="true">*</b></span><select name="type" defaultValue="" required><option value="" disabled>Select one</option><option>Corporate enquiry</option><option>Dealer or distributor enquiry</option><option>Customer care</option><option>Other business enquiry</option></select></label>
            <label className="wide"><span>Your message<b className="req" aria-hidden="true">*</b></span><textarea name="message" rows={5} minLength={3} required /></label>
            <label className="consent wide"><input name="consent" type="checkbox" required /><span>I agree that ESKAY may use these details to respond to my enquiry.<b className="req" aria-hidden="true">*</b></span></label>
            <label className="form-trap" aria-hidden="true"><span>Website</span><input name="website" type="text" tabIndex={-1} autoComplete="off" /></label>
            <button className="button button-red submit-button wide" type="submit" disabled={formState === "submitting"} aria-busy={formState === "submitting"}><span>{formState === "submitting" ? "Sending…" : "Send message"}</span><i><Arrow /></i></button>
            <p className={formState === "idle" ? "form-status wide" : formState === "error" ? "form-status is-visible is-error wide" : "form-status is-visible wide"} role="status" aria-live="polite">
              {formState === "submitting" && "Sending your enquiry securely…"}
              {formState === "success" && "Thank you. Your enquiry has been sent, and a confirmation is on its way to your email."}
              {formState === "error" && formError}
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}
