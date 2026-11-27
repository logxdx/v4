// Rehype plugin: emphasise numbers in article prose.
//   measured values with a unit, percentages and dollar amounts -> <strong>
//   speedups and multipliers ("3.2x", "about 4x")               -> <strong><em>
// Plain counts and years stay as they are. Code, maths, headings, tables,
// links and text that is already bold or italic are left alone.

const NUM = String.raw`(?:~|≈)?\d[\d,]*(?:\.\d+)?`;
const RANGE = String.raw`${NUM}(?:\s?(?:–|to)\s?${NUM})?`;
const WORD_UNITS = String.raw`(?:ms|s|µs|GB|MB|MiB|KB|TFLOPS|tok\/s|pages\/s|q\/s|px|points|tokens)`;
const PATTERN = new RegExp(
  String.raw`(?<![\w.$\\])(?:` +
    String.raw`\$${NUM}(?:\s?(?:–|to)\s?\$${NUM})?` + // $3.09, $3.09 to $0.53
    String.raw`|${RANGE}(?:x|%)` + // 3.2x, 90.72%, 20 to 26%
    String.raw`|${RANGE}\s${WORD_UNITS}` + // 30 ms, 1.6 to 3.3 s, ~64 pages/s
    String.raw`|${NUM}[KM]` + // 95K, 1.5M
    String.raw`)(?![\w/])`,
  "g"
);

const SKIP_TAGS = new Set([
  "code", "pre", "kbd", "samp", "script", "style",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "a", "strong", "b", "em", "i", "sup", "sub", "svg", "math",
]);

function skipElement(node) {
  if (SKIP_TAGS.has(node.tagName)) return true;
  const cls = node.properties?.className;
  const list = Array.isArray(cls) ? cls : typeof cls === "string" ? cls.split(" ") : [];
  return list.some((c) => String(c).startsWith("katex"));
}

function splitText(value) {
  const out = [];
  let last = 0;
  PATTERN.lastIndex = 0;
  for (const m of value.matchAll(PATTERN)) {
    const text = m[0];
    if (m.index > last) out.push({ type: "text", value: value.slice(last, m.index) });
    const isRatio = /\dx$/.test(text);
    const strong = { type: "element", tagName: "strong", properties: { className: ["num"] }, children: [] };
    if (isRatio) {
      strong.properties.className = ["num", "num-ratio"];
      strong.children.push({ type: "element", tagName: "em", properties: {}, children: [{ type: "text", value: text }] });
    } else {
      strong.children.push({ type: "text", value: text });
    }
    out.push(strong);
    last = m.index + text.length;
  }
  if (out.length === 0) return null;
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

function walk(node) {
  if (!node.children) return;
  const next = [];
  for (const child of node.children) {
    if (child.type === "text") {
      const parts = splitText(child.value);
      if (parts) next.push(...parts);
      else next.push(child);
    } else {
      if (child.type === "element" && !skipElement(child)) walk(child);
      next.push(child);
    }
  }
  node.children = next;
}

export default function rehypeEmphasizeNumbers() {
  return (tree) => walk(tree);
}
