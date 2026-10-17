"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { FormError } from "../../_components/AuthForm";
import auth from "../../_components/auth.module.css";
import styles from "../../_components/site.module.css";
import { cx } from "../../_components/util";
import pair from "./phone-pair.module.css";

type Phase = "loading" | "ready" | "expired" | "denied" | "signing-in" | "error";

export function PhonePairScreen({
  demo,
}: {
  demo?: { userCode: string; pairUrl: string; qrSvg: string };
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [userCode, setUserCode] = useState("");
  const [pairUrl, setPairUrl] = useState("");
  const [qrSvg, setQrSvg] = useState("");
  const [left, setLeft] = useState(180);

  const start = useCallback(async () => {
    setPhase("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/auth/pair/start", { method: "POST" });
      const data = (await res.json()) as {
        id?: string;
        user_code?: string;
        expires_in?: number;
        pair_url?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok || !data.id || !data.user_code || !data.pair_url) {
        setPhase("error");
        setMessage(data.message ?? "Couldn't start a sign-in. Try again.");
        return;
      }
      const svg = await QRCode.toString(data.pair_url, {
        type: "svg",
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#00000000" },
      });
      setUserCode(data.user_code);
      setPairUrl(data.pair_url);
      setQrSvg(svg);
      setLeft(data.expires_in ?? 180);
      setPhase("ready");
    } catch {
      setPhase("error");
      setMessage("Couldn't start a sign-in. Try again.");
    }
  }, []);

  useEffect(() => {
    if (demo) {
      setUserCode(demo.userCode);
      setPairUrl(demo.pairUrl);
      setQrSvg(demo.qrSvg);
      setLeft(180);
      setPhase("ready");
      return;
    }
    void start();
  }, [start, demo]);

  useEffect(() => {
    if (phase !== "ready" && phase !== "signing-in") return;
    const t = setInterval(() => {
      setLeft((n) => {
        if (n <= 1) {
          setPhase("expired");
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase, userCode]);

  useEffect(() => {
    if (phase !== "ready" || demo) return;
    const id = pairUrl.split("/pair/")[1];
    if (!id) return;
    let wait = 3000;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      try {
        const res = await fetch("/api/auth/pair/poll", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const data = (await res.json()) as { status?: string; error?: string; interval?: number };
        if (data.status === "success") {
          setPhase("signing-in");
          router.push("/portal");
          router.refresh();
          return;
        }
        if (data.error === "access_denied") {
          setPhase("denied");
          return;
        }
        if (data.error === "expired_token") {
          setPhase("expired");
          return;
        }
        if (data.error === "slow_down") wait = (data.interval ?? 5) * 1000;
        else wait = 3000;
      } catch {
        wait = 3000;
      }
      timer = setTimeout(() => void tick(), wait);
    };

    timer = setTimeout(() => void tick(), 3000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [phase, pairUrl, router]);

  const primary = cx(styles.button, auth.action);
  const minutes = Math.floor(left / 60);
  const seconds = String(left % 60).padStart(2, "0");

  return (
    <div className={pair.wrap} data-tour="phone-pair">
      {phase === "loading" && <p className={auth.note}>Getting a code…</p>}

      {(phase === "ready" || phase === "signing-in") && (
        <>
          <p className={auth.note}>Scan this with your phone, then pick the code you see here.</p>
          <div className={pair.qr} aria-hidden="true" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <p className={pair.code} aria-label={`Code ${userCode}`}>
            {userCode}
          </p>
          <p className={pair.countdown}>
            {phase === "signing-in" ? "Signing in…" : `${minutes}:${seconds} left`}
          </p>
          <p className={auth.hint}>Not you? Close this page.</p>
        </>
      )}

      {phase === "expired" && (
        <>
          <Status title="That code expired">
            Codes last 3 minutes. Get a new one and scan it again.
          </Status>
          <button type="button" className={primary} onClick={() => void start()}>
            Get a new code
          </button>
        </>
      )}

      {phase === "denied" && (
        <>
          <Status title="Sign-in was denied">
            The phone said no, or the wrong code was picked. Get a new code to try again.
          </Status>
          <button type="button" className={primary} onClick={() => void start()}>
            Get a new code
          </button>
        </>
      )}

      {phase === "error" && (
        <>
          {message && <FormError>{message}</FormError>}
          <button type="button" className={primary} onClick={() => void start()}>
            Try again
          </button>
        </>
      )}

      <div className={auth.more}>
        <Link href="/login" className={auth.link}>
          Back to sign in
        </Link>
      </div>
    </div>
  );
}

function Status({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.text}>
      <h3 className={auth.statusTitle}>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
