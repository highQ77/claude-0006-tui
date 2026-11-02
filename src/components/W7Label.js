import * as THREE from 'three';
import { MeasureMode } from 'yoga-layout';
import { W7Node } from './W7Node.js';
import { planeGeometry } from '../Rect.js';
import { parseNumber } from '../style.js';

const DEFAULT_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", "Segoe UI", system-ui, sans-serif';
const DEFAULT_SHADOW = { x: 0, y: 1, blur: 3, color: 'rgba(0, 0, 0, 0.35)' };

// "x y blur color"，"true" 使用預設值
function parseTextShadow(value) {
  if (value == null || value === 'false') return null;
  if (value === 'true') return DEFAULT_SHADOW;
  const [x, y, blur, ...color] = value.trim().split(/\s+/);
  return { x: Number(x) || 0, y: Number(y) || 0, blur: Number(blur) || 0, color: color.join(' ') || DEFAULT_SHADOW.color };
}
const CJK = '⺀-鿿가-힯豈-﫿＀-￯　-〿';
const TOKEN_RE = new RegExp(`[${CJK}]|[^\\s${CJK}]+|\\s+`, 'g');
const measureCtx = document.createElement('canvas').getContext('2d');

// CJK 逐字斷行、拉丁文字以單字斷行，保留 \n
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const tok of para.match(TOKEN_RE) ?? []) {
      const isSpace = /^\s+$/.test(tok);
      if (!line && isSpace) continue;
      if (!line || ctx.measureText(line + tok).width <= maxWidth) {
        line += tok;
      } else {
        lines.push(line.trimEnd());
        line = isSpace ? '' : tok;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

export class W7Label extends W7Node {
  static acceptsChildren = false;
  static textContent = true;

  constructor(attrs, ctx) {
    super(attrs, ctx);
    this.text = (attrs.text ?? '').replace(/\\n/g, '\n');
    this.fontSize = parseNumber(attrs.fontSize, 16);
    this.lineHeight = this.fontSize * parseNumber(attrs.lineHeight, 1.35);
    const weight = attrs.weight ?? (attrs.bold === 'true' ? '700' : '400');
    this.font = `${weight} ${this.fontSize}px ${attrs.font ?? DEFAULT_FONT}`;
    this.letterSpacing = `${parseNumber(attrs.letterSpacing, 0)}px`;
    this.textShadow = parseTextShadow(attrs.textShadow);
    this.color = attrs.color ?? '#ffffff';
    this.textAlign = attrs.textAlign ?? 'left';
    this.verticalAlign = attrs.verticalAlign ?? 'top';

    this.material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: parseNumber(attrs.opacity, 1),
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.object.add(this.mesh);
    this.meshes.push(this.mesh);
    this.drawKey = '';

    this.yoga.setMeasureFunc((width, widthMode) => this.measure(width, widthMode));
  }

  applyFont(g) {
    g.font = this.font;
    g.letterSpacing = this.letterSpacing;
  }

  measure(width, widthMode) {
    this.applyFont(measureCtx);
    const max = widthMode === MeasureMode.Undefined ? Infinity : width;
    const lines = wrapText(measureCtx, this.text, max);
    const textWidth = Math.ceil(Math.max(0, ...lines.map((l) => measureCtx.measureText(l).width)));
    return {
      width: widthMode === MeasureMode.Exactly ? width : Math.min(textWidth, max),
      height: Math.ceil(lines.length * this.lineHeight),
    };
  }

  updateVisual() {
    const w = Math.max(1, Math.round(this.width));
    const h = Math.max(1, Math.round(this.height));
    const dpr = this.ctx.pixelRatio;
    const key = `${w}x${h}@${dpr}`;
    if (key === this.drawKey) return;
    this.drawKey = key;

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(w * dpr);
    canvas.height = Math.ceil(h * dpr);
    const g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    this.applyFont(g);
    g.fillStyle = this.color;
    if (this.textShadow) {
      const { x, y, blur, color } = this.textShadow;
      Object.assign(g, { shadowOffsetX: x * dpr, shadowOffsetY: y * dpr, shadowBlur: blur * dpr, shadowColor: color });
    }
    g.textAlign = this.textAlign;
    g.textBaseline = 'middle';

    const lines = wrapText(g, this.text, w + 0.5);
    const total = lines.length * this.lineHeight;
    const offsetY = { top: 0, center: (h - total) / 2, bottom: h - total }[this.verticalAlign] ?? 0;
    const x = { left: 0, center: w / 2, right: w }[this.textAlign] ?? 0;
    lines.forEach((line, i) => g.fillText(line, x, offsetY + (i + 0.5) * this.lineHeight));

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    this.material.map?.dispose();
    this.material.map = texture;
    this.material.needsUpdate = true;

    this.mesh.geometry.dispose();
    this.mesh.geometry = planeGeometry(w, h);
  }

  disposeVisual() {
    this.material.map?.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}
