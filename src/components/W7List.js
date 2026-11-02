import * as THREE from 'three';
import { Align, Edge, FlexDirection, Overflow, Wrap } from 'yoga-layout';
import { W7Node, applyRenderState, clipPlanes, intersectRect } from './W7Node.js';
import { Rect } from '../Rect.js';
import { parseNumber, parseValue } from '../style.js';

const BAR = 4;
const BAR_OPACITY = 0.45;
const FADE_IN = 1 / 0.15; // 每秒 alpha 變化量（0.15s 淡入）
const FADE_OUT = 1 / 0.4; // 0.4s 淡出

// type="v"（預設，垂直）| "h"（水平）| "grid"（cols 欄，垂直捲動）
export class W7List extends W7Node {
  constructor(attrs, ctx) {
    super(attrs, ctx);
    this.type = ['v', 'h', 'grid'].includes(attrs.type) ? attrs.type : 'v';
    this.cols = Math.max(1, parseNumber(attrs.cols, 3));
    this.columnGap = parseNumber(attrs.columnGap ?? attrs.gap, 0);
    this.cellHeight = parseValue(attrs.cellHeight);
    this.axis = this.type === 'h' ? 'x' : 'y';
    this.scroll = 0;
    this.maxScroll = 0;

    this.yoga.setOverflow(Overflow.Scroll);
    this.yoga.setFlexDirection(this.type === 'v' ? FlexDirection.Column : FlexDirection.Row);
    if (this.type === 'grid') {
      this.yoga.setFlexWrap(Wrap.Wrap);
      this.yoga.setAlignContent(Align.FlexStart);
      this.yoga.setAlignItems(Align.FlexStart);
    }

    this.content = new THREE.Group();
    this.object.add(this.content);

    this.scrollbar = new Rect({ color: attrs.scrollbarColor ?? '#ffffff', radius: BAR / 2, opacity: 0 });
    this.scrollbar.mesh.visible = false;
    this.object.add(this.scrollbar.mesh);
    this.active = false;
    this.barAlpha = 0;
  }

  add(child) {
    super.add(child);
    child.yoga.setFlexShrink(0);
    if (this.type === 'grid' && this.cellHeight !== undefined && child.attrs.height == null) {
      child.yoga.setHeight(this.cellHeight);
    }
  }

  // grid：依 list 寬度把子元件寬度切成 cols 等分
  postLayout() {
    let changed = super.postLayout();
    if (this.type !== 'grid') return changed;
    const inner = this.yoga.getComputedWidth()
      - this.yoga.getComputedPadding(Edge.Left)
      - this.yoga.getComputedPadding(Edge.Right);
    const cell = Math.max(0, (inner - this.columnGap * (this.cols - 1)) / this.cols - 0.01);
    for (const c of this.children) {
      if (c.attrs.width != null || Math.abs((c.gridWidth ?? -1) - cell) < 0.5) continue;
      c.gridWidth = cell;
      c.yoga.setWidth(cell);
      changed = true;
    }
    return changed;
  }

  contentExtent() {
    const y = this.axis === 'y';
    let ext = 0;
    for (const c of this.children) {
      const n = c.yoga;
      const end = y
        ? n.getComputedTop() + n.getComputedHeight() + n.getComputedMargin(Edge.Bottom)
        : n.getComputedLeft() + n.getComputedWidth() + n.getComputedMargin(Edge.Right);
      ext = Math.max(ext, end);
    }
    return ext + this.yoga.getComputedPadding(y ? Edge.Bottom : Edge.Right);
  }

  syncChildren(state) {
    const y = this.axis === 'y';
    const size = y ? this.height : this.width;
    const extent = this.contentExtent();
    this.maxScroll = Math.max(0, extent - size);
    this.scroll = Math.min(Math.max(this.scroll, 0), this.maxScroll);
    this.content.position.set(y ? 0 : -this.scroll, y ? this.scroll : 0, 0);

    const parentClip = state.clip;
    const parentPlanes = state.planes;
    const clip = parentClip ? intersectRect(this.rect(), parentClip) : this.rect();
    state.clip = clip;
    state.planes = clipPlanes(clip);
    const ox = this.absX - (y ? 0 : this.scroll);
    const oy = this.absY - (y ? this.scroll : 0);
    for (const c of this.children) c.sync(ox, oy, state);
    state.clip = parentClip;
    state.planes = parentPlanes;

    this.updateScrollbar(size, extent);
    applyRenderState(this.scrollbar.mesh, state);
  }

  updateScrollbar(size, extent) {
    const bar = this.scrollbar;
    if (this.maxScroll <= 0) return;
    const len = Math.max(20, size * (size / extent));
    const pos = (this.scroll / this.maxScroll) * (size - len);
    if (this.axis === 'y') {
      bar.setSize(BAR, len);
      bar.mesh.position.set(this.width - BAR - 2, -pos, 0);
    } else {
      bar.setSize(len, BAR);
      bar.mesh.position.set(pos, -(this.height - BAR - 2), 0);
    }
    bar.mesh.visible = this.barAlpha > 0;
  }

  updateFade(dt) {
    const show = this.active && this.maxScroll > 0 && this.attrs.scrollbar !== 'false';
    const target = show ? 1 : 0;
    if (this.barAlpha === target) return;
    this.barAlpha = target > this.barAlpha
      ? Math.min(target, this.barAlpha + dt * FADE_IN)
      : Math.max(target, this.barAlpha - dt * FADE_OUT);
    this.scrollbar.opacity = BAR_OPACITY * this.barAlpha;
    this.scrollbar.mesh.visible = this.barAlpha > 0;
  }

  scrollBy(dx, dy) {
    const delta = this.axis === 'y' ? dy : (dx || dy);
    const next = Math.min(Math.max(this.scroll + delta, 0), this.maxScroll);
    if (next === this.scroll) return false;
    this.scroll = next;
    return true;
  }

  disposeVisual() {
    this.scrollbar.dispose();
  }
}
