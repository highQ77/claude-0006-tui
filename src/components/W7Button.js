import { SRGBColorSpace } from 'three';
import { W7Node } from './W7Node.js';

// 在 sRGB 空間調整亮度（預設的 offsetHSL 在 linear 空間，會讓顏色偏移）
function shiftLightness(color, amount) {
  const hsl = color.getHSL({}, SRGBColorSpace);
  const l = Math.min(1, Math.max(0, hsl.l + amount));
  return color.clone().setHSL(hsl.h, hsl.s, l, SRGBColorSpace);
}
import { W7Label } from './W7Label.js';

const DEFAULTS = {
  padding: '10 22',
  bg: '#7c83ff',
  bgTo: '#5b48f0',
  radius: '12',
  borderColor: '#ffffff',
  borderOpacity: '0.18',
  align: 'center',
  justify: 'center',
};
const LABEL_ATTRS = ['fontSize', 'color', 'bold', 'weight', 'font', 'lineHeight', 'letterSpacing', 'textShadow'];

// <W7Button onClick="buy">購買</W7Button>，用 w7.on('buy', fn) 接收點擊
export class W7Button extends W7Node {
  static acceptsChildren = false;
  static textContent = true;

  constructor(attrs, ctx) {
    const merged = { ...DEFAULTS, ...attrs };
    if (attrs.bg && !attrs.bgTo) merged.bgTo = attrs.bg;
    merged.shadow ??= `0 6 16 ${merged.bgTo} 0.45`;
    super(merged, ctx);

    this.action = attrs.onClick ?? null;
    this.disabled = attrs.disabled === 'true';
    this.hovered = false;
    this.pressed = false;

    const labelAttrs = { color: '#ffffff', weight: '600', textAlign: 'center', shrink: '1', textShadow: '0 1 2 rgba(0,0,0,0.25)' };
    for (const key of LABEL_ATTRS) if (attrs[key] != null) labelAttrs[key] = attrs[key];
    labelAttrs.text = attrs.text ?? '';
    this.label = new W7Label(labelAttrs, ctx);
    this.attach(this.label);

    const [a, b] = this.background.colors.map((c) => c.clone());
    const shift = (l) => [shiftLightness(a, l), shiftLightness(b, l)];
    this.colors = { normal: [a, b], hover: shift(0.06), pressed: shift(-0.08) };
    this.shadowOpacity = this.shadow?.opacity ?? 0;

    if (this.disabled) {
      this.background.opacity *= 0.35;
      if (this.shadow) this.shadow.opacity = 0;
      this.label.material.opacity = 0.45;
    }
  }

  get interactive() {
    return !this.disabled;
  }

  setState({ hovered = this.hovered, pressed = this.pressed }) {
    this.hovered = hovered;
    this.pressed = pressed;
    const key = pressed ? 'pressed' : hovered ? 'hover' : 'normal';
    this.background.setColors(...this.colors[key]);
    if (this.shadow) this.shadow.opacity = this.shadowOpacity * (pressed ? 0.5 : hovered ? 1.25 : 1);
  }
}
