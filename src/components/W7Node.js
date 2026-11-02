import * as THREE from 'three';
import Yoga from 'yoga-layout';
import { applyStyle, parseNumber } from '../style.js';
import { Rect, parseShadow } from '../Rect.js';

export function borderOptions(attrs) {
  if (!attrs.borderColor) return {};
  return {
    borderColor: attrs.borderColor,
    borderWidth: parseNumber(attrs.borderWidth, 1),
    borderOpacity: parseNumber(attrs.borderOpacity, 1),
  };
}

// 所有元件的基底：一個 yoga node + 一個 THREE.Group
export class W7Node {
  static acceptsChildren = true;

  constructor(attrs, ctx) {
    this.attrs = attrs;
    this.ctx = ctx;
    this.parent = null;
    this.children = [];
    this.yoga = Yoga.Node.create(ctx.yogaConfig);
    this.object = new THREE.Group();
    this.object.name = this.constructor.name + (attrs.id ? `#${attrs.id}` : '');
    this.content = this.object;
    this.meshes = [];
    this.absX = 0;
    this.absY = 0;
    this.width = 0;
    this.height = 0;
    this.clip = null;

    applyStyle(this.yoga, attrs);

    const radius = parseNumber(attrs.radius, 0);
    const shadow = parseShadow(attrs.shadow);
    if (shadow) {
      this.shadow = new Rect({ color: shadow.color, opacity: shadow.opacity, radius, blur: shadow.blur });
      this.shadowOffset = shadow;
      this.object.add(this.shadow.mesh);
      this.meshes.push(this.shadow.mesh);
    }

    const ownBorder = this.constructor.ownsBorder;
    if (attrs.bg || (attrs.borderColor && !ownBorder)) {
      this.background = new Rect({
        color: attrs.bg ?? '#000000',
        colorTo: attrs.bgTo,
        opacity: attrs.bg ? parseNumber(attrs.bgOpacity, 1) : 0,
        radius,
        ...(ownBorder ? {} : borderOptions(attrs)),
      });
      this.object.add(this.background.mesh);
      this.meshes.push(this.background.mesh);
    }
  }

  add(child) {
    if (!this.constructor.acceptsChildren) {
      throw new Error(`<${this.constructor.name}> 不能包含子元件`);
    }
    this.attach(child);
  }

  // 不檢查 acceptsChildren，給元件內部組合用
  attach(child) {
    child.parent = this;
    this.children.push(child);
    this.yoga.insertChild(child.yoga, this.yoga.getChildCount());
    this.content.add(child.object);
  }

  // 第一次 calculateLayout 後呼叫，回傳 true 代表 style 有變動需要重排
  postLayout() {
    let changed = false;
    for (const c of this.children) changed = c.postLayout() || changed;
    return changed;
  }

  // 把 yoga 的計算結果同步到 three 物件
  sync(originX, originY, state) {
    const left = this.yoga.getComputedLeft();
    const top = this.yoga.getComputedTop();
    this.width = this.yoga.getComputedWidth();
    this.height = this.yoga.getComputedHeight();
    this.absX = originX + left;
    this.absY = originY + top;
    this.clip = state.clip;
    this.object.position.set(left, -top, 0);
    this.object.visible = !state.clip || intersects(this.rect(), state.clip);

    this.background?.setSize(this.width, this.height);
    if (this.shadow) {
      this.shadow.setSize(this.width, this.height);
      this.shadow.mesh.position.set(this.shadowOffset.x, -this.shadowOffset.y, 0);
    }
    this.updateVisual();
    for (const m of this.meshes) applyRenderState(m, state);

    this.syncChildren(state);
  }

  syncChildren(state) {
    for (const c of this.children) c.sync(this.absX, this.absY, state);
  }

  updateVisual() {}

  rect() {
    return { x0: this.absX, y0: this.absY, x1: this.absX + this.width, y1: this.absY + this.height };
  }

  hitTest(px, py) {
    const r = this.rect();
    const inside = px >= r.x0 && px <= r.x1 && py >= r.y0 && py <= r.y1;
    const inClip = !this.clip || (px >= this.clip.x0 && px <= this.clip.x1 && py >= this.clip.y0 && py <= this.clip.y1);
    return inside && inClip;
  }

  // 深度優先，找出包含該點最深層、且符合條件的元件
  pick(px, py, filter) {
    if (!this.hitTest(px, py)) return null;
    for (let i = this.children.length - 1; i >= 0; i--) {
      const hit = this.children[i].pick(px, py, filter);
      if (hit) return hit;
    }
    return filter(this) ? this : null;
  }

  dispose() {
    for (const c of this.children) c.dispose();
    this.background?.dispose();
    this.shadow?.dispose();
    this.disposeVisual();
  }

  disposeVisual() {}
}

export function applyRenderState(mesh, state) {
  mesh.renderOrder = state.order++;
  mesh.material.clippingPlanes = state.planes;
}

export function intersects(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

export function intersectRect(a, b) {
  return {
    x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0),
    x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1),
  };
}

// 螢幕座標（y 向下）的矩形 -> world 座標（y 向上）的 4 個裁切平面
export function clipPlanes({ x0, y0, x1, y1 }) {
  return [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -x0),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), x1),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), -y0),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), y1),
  ];
}
