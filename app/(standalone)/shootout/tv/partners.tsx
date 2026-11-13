// Our partners for the tournament, in versions made for a dark screen, and
// the "Thank you to our partners" strip the TV screens show along the
// bottom. Each logo has a height that makes the two look the same size.

import Image from "next/image";
import dundee from "./partners/dundee.png";
import nelson from "./partners/nelson.png";
import s from "./tv.module.css";

export const PARTNERS = [
  { name: "Dundee Mergers and Acquisitions", logo: dundee, strip: 50, big: 180 },
  { name: "Nelson Produce + Farm", logo: nelson, strip: 76, big: 290 },
];

export function PartnerStrip() {
  return (
    <div className={s.strip}>
      <span className={s.stripLabel}>
        Thank you
        <br />
        to our partners
      </span>
      {PARTNERS.map((p, i) => (
        <span key={p.name} className={s.stripItem}>
          {i > 0 && <i className={s.stripRule} />}
          <Image src={p.logo} alt={p.name} style={{ height: p.strip, width: "auto" }} sizes="300px" />
        </span>
      ))}
    </div>
  );
}
