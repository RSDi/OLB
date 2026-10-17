import { test } from "node:test";
import assert from "node:assert/strict";
import { copyText, copyTextFallback } from "../../lib/copy-text.ts";

type FakeEl = {
  value: string;
  contentEditable: string;
  readOnly: boolean;
  style: Record<string, string>;
  setAttribute: (name: string, value: string) => void;
  focus: () => void;
  select: () => void;
  setSelectionRange: (start: number, end: number) => void;
};

function setGlobal(name: "navigator" | "document", value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, value });
}

function installDom(opts?: { execOk?: boolean; throwExec?: boolean }) {
  const created: FakeEl[] = [];
  const body = {
    appended: [] as FakeEl[],
    removed: [] as FakeEl[],
    appendChild(el: FakeEl) {
      this.appended.push(el);
    },
    removeChild(el: FakeEl) {
      this.removed.push(el);
    },
  };
  const execOk = opts?.execOk ?? true;
  setGlobal("document", {
    body,
    createElement(tag: string) {
      assert.equal(tag, "textarea");
      const el: FakeEl = {
        value: "",
        contentEditable: "false",
        readOnly: true,
        style: {},
        setAttribute() {},
        focus() {},
        select() {},
        setSelectionRange() {},
      };
      created.push(el);
      return el;
    },
    execCommand(cmd: string) {
      if (opts?.throwExec) throw new Error("exec failed");
      assert.equal(cmd, "copy");
      return execOk;
    },
  });
  return { created, body };
}

test("copyText uses navigator.clipboard when it works", async () => {
  let written = "";
  setGlobal("navigator", {
    clipboard: {
      writeText(text: string) {
        written = text;
        return Promise.resolve();
      },
    },
  });
  setGlobal("document", undefined);
  assert.equal(await copyText("https://olb.example.org/t/14u-white"), true);
  assert.equal(written, "https://olb.example.org/t/14u-white");
});

test("copyText falls back to textarea/execCommand when clipboard rejects", async () => {
  setGlobal("navigator", {
    clipboard: {
      writeText() {
        return Promise.reject(new Error("denied"));
      },
    },
  });
  const { created, body } = installDom();
  assert.equal(await copyText("https://olb.example.org/t/14u-white"), true);
  assert.equal(created[0]?.value, "https://olb.example.org/t/14u-white");
  assert.equal(created[0]?.contentEditable, "true");
  assert.equal(created[0]?.readOnly, false);
  assert.equal(body.appended.length, 1);
  assert.equal(body.removed.length, 1);
});

test("copyText falls back when clipboard is missing", async () => {
  setGlobal("navigator", {});
  const { created } = installDom();
  assert.equal(await copyText("https://olb.example.org/t/16u-black"), true);
  assert.equal(created[0]?.value, "https://olb.example.org/t/16u-black");
});

test("copyTextFallback returns false if execCommand fails", () => {
  setGlobal("navigator", {});
  installDom({ execOk: false });
  assert.equal(copyTextFallback("https://olb.example.org/t/14u-white"), false);
});
