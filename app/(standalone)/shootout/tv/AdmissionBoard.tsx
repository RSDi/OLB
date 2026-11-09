"use client";
// The admission screen for a TV at the door (/shootout/tv/admission): the
// tournament's graphic and the prices from the plan's Admission text, with
// the QR for live scores. Checks for price changes every few minutes.

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { AdmissionData } from "../../../../lib/hosted/live";
import { admissionPrices } from "../../../../lib/hosted/live-view";
import art from "./shootout-logo.webp";
import { useFitStage, useFullscreenOnPress, useWakeLock } from "./tv-hooks";
import s from "./tv.module.css";

export function AdmissionBoard({ data, dates, qr }: { data: AdmissionData | null; dates: string; qr: string }) {
  const router = useRouter();
  const stage = useFitStage();
  useWakeLock();
  const fsHint = useFullscreenOnPress();
  useEffect(() => {
    const check = setInterval(() => router.refresh(), 5 * 60_000);
    const reload = setTimeout(() => window.location.reload(), 3 * 60 * 60 * 1000);
    return () => {
      clearInterval(check);
      clearTimeout(reload);
    };
  }, [router]);

  const { prices, notes } = admissionPrices(data?.admission ?? null);
  const where = data?.facility?.split("\n")[0];
  return (
    <div className={s.tv}>
      <div ref={stage} className={`${s.stage} ${s.adm}`}>
        <div className={s.admArt}>
          <Image src={art} alt={data?.event ?? "Missouri River Shootout"} priority sizes="1060px" />
        </div>
        <div className={`${s.admEyebrow} ${s.display}`}>Admission</div>
        {prices.length > 0 ? (
          <div className={`${s.admPrices} ${prices.length > 4 ? s.admMany : ""}`}>
            {prices.map((p) => (
              <div key={p.label} className={s.admPrice}>
                <span className={`${s.admAmount} ${s.display}`}>{p.price}</span>
                <span className={s.admLabel}>{p.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className={s.admNone}>{notes.length ? null : "Prices at the table."}</div>
        )}
        <div className={s.admFoot}>
          <div className={s.admNotes}>
            {notes.map((n) => (
              <b key={n}>{n}</b>
            ))}
            <span>{[dates, where].filter(Boolean).join("  ·  ")}</span>
          </div>
          <div className={s.phone}>
            <div className={s.phoneText}>
              <b>Live scores on your phone</b>
              omahalightningbasketball.com/shootout
            </div>
            <div className={s.qr} dangerouslySetInnerHTML={{ __html: qr }} />
          </div>
        </div>
        {fsHint && <div className={s.fsHint}>Press OK on the remote (or click) for full screen</div>}
      </div>
    </div>
  );
}
