import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../lib/api-spec/package.json", import.meta.url));
const core = require.resolve("@orval/core", { paths: [require.resolve("orval")] });
const micromatch = require.resolve("micromatch", { paths: [core] });
const braces = require(require.resolve("braces", { paths: [micromatch] }));
test("Braces rejects deep input before recursive walkers can exhaust the stack", () => {
  assert.throws(() => braces("{".repeat(1000) + "a,b" + "}".repeat(1000)), TypeError);
  assert.deepEqual(braces.expand("x{a,b}{1..2}"), ["xa1", "xa2", "xb1", "xb2"]);
});
test("Compile and expand reject independently constructed deep ASTs, including cycles", () => {
  let ast: { type: string; nodes?: unknown[] } = { type: "text" };
  for (let i = 0; i < 1000; i++) ast = { type: "brace", nodes: [ast] };
  assert.throws(() => braces.compile(ast), TypeError);
  assert.throws(() => braces.expand(ast), TypeError);
  assert.throws(() => braces.stringify(ast), TypeError);
  const cycle = { type: "brace", nodes: [] as unknown[] }; cycle.nodes.push(cycle);
  assert.throws(() => braces.compile(cycle), TypeError);
});
