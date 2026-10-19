"use client";

import { useState } from "react";
import Link from "next/link";
import { Block, Section } from "../../_components/Section";
import { Text } from "../../_components/Text";
import site from "../../_components/site.module.css";
import styles from "../mockups.module.css";
import { cx } from "../../_components/util";

// Exact copy for this click-through. Client state only: nothing is stored.
const ASK =
  "Does your player have any other commitments this season, like football, debate, another sport or activity, that might pull them away from practices or games? We ask because consistent attendance matters to the whole team.";
const YES_FOLLOW_UP =
  "Thanks for letting us know! A coach or board member will review this and reach out to learn more. Is there anything you already know about your schedule that would help us work through it together?";

type Screen = "ask" | "yes-note" | "no-done" | "admin";

export function CommitmentsClickThrough() {
  const [screen, setScreen] = useState<Screen>("ask");
  const [note, setNote] = useState("");

  return (
    <Section height="medium" rows={[2, 2]}>
      <Block m="1/2/3/10" d="1/5/3/21">
        {screen === "ask" && (
          <Text>
            <h2>Registration commitments</h2>
            <h4>{ASK}</h4>
            <div className={styles.actions}>
              <button type="button" className={site.button} onClick={() => setScreen("yes-note")}>
                Yes
              </button>
              <button type="button" className={cx(site.button, styles.outline)} onClick={() => setScreen("no-done")}>
                No
              </button>
            </div>
          </Text>
        )}

        {screen === "yes-note" && (
          <Text>
            <h4>{YES_FOLLOW_UP}</h4>
            <div className={site.field}>
              <label htmlFor="commitments-note" className={site.fieldTitle}>
                Activity name and conflicting days/times <span className={site.required}>(optional)</span>
              </label>
              <textarea
                id="commitments-note"
                className={site.input}
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className={styles.actions}>
              <button type="button" className={site.button} onClick={() => setScreen("admin")}>
                Continue
              </button>
            </div>
            <div className={styles.links}>
              <button type="button" onClick={() => setScreen("ask")}>
                Back
              </button>
            </div>
          </Text>
        )}

        {screen === "no-done" && (
          <Text>
            <h2>That&apos;s all for this mock-up.</h2>
            <p className={styles.note}>No is the end of this path. Nothing was saved.</p>
            <div className={styles.links}>
              <button type="button" onClick={() => setScreen("ask")}>
                Start over
              </button>
              <Link href="/mockups">Back to mock-ups</Link>
            </div>
          </Text>
        )}

        {screen === "admin" && (
          <Text>
            <h2>What staff would see</h2>
            <p className={styles.note}>A sample row on the registrations review, with the commitments flag and note. Buttons here do nothing.</p>
            <article className={styles.admin}>
              <div className={styles.adminHead}>
                <h3 className={styles.adminName}>Alex Example</h3>
                <span className={styles.flag}>Commitments</span>
              </div>
              <p className={styles.adminMeta}>Age 13 · Registered Oct 19, 2026 · New</p>
              <div className={styles.adminNote}>
                <span className={styles.adminNoteLabel}>Note</span>
                {note.trim() || "No details given."}
              </div>
            </article>
            <div className={styles.links}>
              <button
                type="button"
                onClick={() => {
                  setNote("");
                  setScreen("ask");
                }}
              >
                Start over
              </button>
              <Link href="/mockups">Back to mock-ups</Link>
            </div>
          </Text>
        )}
      </Block>
    </Section>
  );
}
