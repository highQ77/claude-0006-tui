import { Align, Edge, Gutter, Justify, PositionType, Wrap } from 'yoga-layout';

const ALIGN = {
  auto: Align.Auto,
  start: Align.FlexStart,
  center: Align.Center,
  end: Align.FlexEnd,
  stretch: Align.Stretch,
  baseline: Align.Baseline,
};

const JUSTIFY = {
  start: Justify.FlexStart,
  center: Justify.Center,
  end: Justify.FlexEnd,
  between: Justify.SpaceBetween,
  around: Justify.SpaceAround,
  evenly: Justify.SpaceEvenly,
};

// "12" -> 12, "50%" / "auto" 原樣交給 yoga
export function parseValue(v) {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (s === 'auto' || s.endsWith('%')) return s;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function parseNumber(v, fallback) {
  const n = Number(v);
  return v != null && Number.isFinite(n) ? n : fallback;
}

// padding="8" | "8 16" | "8 16 8 16"（同 CSS）
function parseBox(v) {
  const p = String(v).trim().split(/\s+/).map(parseValue);
  const [t, r = t, b = t, l = r] = p;
  return { t, r, b, l };
}

function applyBox(node, setter, value) {
  const { t, r, b, l } = parseBox(value);
  node[setter](Edge.Top, t);
  node[setter](Edge.Right, r);
  node[setter](Edge.Bottom, b);
  node[setter](Edge.Left, l);
}

const EDGE_ATTRS = [
  ['Top', Edge.Top], ['Right', Edge.Right], ['Bottom', Edge.Bottom], ['Left', Edge.Left],
];

export function applyStyle(node, a) {
  const size = {
    width: 'setWidth', height: 'setHeight',
    minWidth: 'setMinWidth', minHeight: 'setMinHeight',
    maxWidth: 'setMaxWidth', maxHeight: 'setMaxHeight',
    basis: 'setFlexBasis',
  };
  for (const [attr, setter] of Object.entries(size)) {
    const v = parseValue(a[attr]);
    if (v !== undefined) node[setter](v);
  }

  if (a.flex != null) node.setFlex(parseNumber(a.flex, 0));
  if (a.grow != null) node.setFlexGrow(parseNumber(a.grow, 0));
  if (a.shrink != null) node.setFlexShrink(parseNumber(a.shrink, 1));

  if (a.padding != null) applyBox(node, 'setPadding', a.padding);
  if (a.margin != null) applyBox(node, 'setMargin', a.margin);
  for (const [name, edge] of EDGE_ATTRS) {
    if (a[`padding${name}`] != null) node.setPadding(edge, parseValue(a[`padding${name}`]));
    if (a[`margin${name}`] != null) node.setMargin(edge, parseValue(a[`margin${name}`]));
  }

  if (a.gap != null) node.setGap(Gutter.All, parseNumber(a.gap, 0));
  if (a.rowGap != null) node.setGap(Gutter.Row, parseNumber(a.rowGap, 0));
  if (a.columnGap != null) node.setGap(Gutter.Column, parseNumber(a.columnGap, 0));

  if (a.align in ALIGN) node.setAlignItems(ALIGN[a.align]);
  if (a.alignSelf in ALIGN) node.setAlignSelf(ALIGN[a.alignSelf]);
  if (a.alignContent in ALIGN) node.setAlignContent(ALIGN[a.alignContent]);
  if (a.justify in JUSTIFY) node.setJustifyContent(JUSTIFY[a.justify]);
  if (a.wrap === 'true' || a.wrap === 'wrap') node.setFlexWrap(Wrap.Wrap);

  if (a.position === 'absolute') {
    node.setPositionType(PositionType.Absolute);
    for (const [name, edge] of EDGE_ATTRS) {
      const v = parseValue(a[name.toLowerCase()]);
      if (v !== undefined) node.setPosition(edge, v);
    }
  }
}
