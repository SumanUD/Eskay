import Image from "next/image";
import Link from "next/link";
import { Arrow } from "./icons";
import { siteNav } from "./site-nav";

const exploreLinks = siteNav.filter((item) => item.href !== "/" && item.href !== "/contact");

export function SiteFooter() {
  return (
    <footer>
      <div className="container footer-grid">
        <div className="footer-about">
          <Link className="footer-brand" href="/" aria-label="ESKAY home"><Image src="/logo.png" alt="ESKAY" width={1263} height={592} /></Link>
          <p>A business built on experience, strengthened by knowledge and continuously evolving.</p>
        </div>
        <div>
          <h3>Explore</h3>
          {exploreLinks.map((item) => <Link key={item.href} href={item.href}>{item.label} <Arrow /></Link>)}
        </div>
        <div>
          <h3>Enquiries</h3>
          <Link href="/login">Partner login <Arrow /></Link>
          <Link href="/contact#enquiry-form">Corporate enquiries <Arrow /></Link>
          <Link href="/business-network#enquiries">Business network <Arrow /></Link>
          <Link href="/contact#enquiry-form">Customer care <Arrow /></Link>
        </div>
        <div><h3>Business approach</h3><p>Integrity<br />Knowledge<br />Quality<br />Responsibility</p></div>
      </div>
      <div className="container footer-bottom">
        <p>&copy; {new Date().getFullYear()} ESKAY. All rights reserved.</p>
        <p>Corporate information only. This website does not advertise, promote or offer tobacco products for sale. Final publication remains subject to legal and compliance review.</p>
      </div>
    </footer>
  );
}
