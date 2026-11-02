import { MeasureMode } from 'yoga-layout';
import { W7Node, borderOptions } from './W7Node.js';
import { Rect } from '../Rect.js';
import { parseNumber } from '../style.js';

// src: 相對於 scene.xml 的路徑
// fit: fill（預設）| contain | cover；radius / border 套用在圖片本身
export class W7Image extends W7Node {
  static acceptsChildren = false;
  static ownsBorder = true;

  constructor(attrs, ctx) {
    super(attrs, ctx);
    this.fit = attrs.fit ?? 'fill';
    this.natural = null;
    this.drawKey = '';

    this.image = new Rect({
      radius: parseNumber(attrs.radius, 0),
      opacity: parseNumber(attrs.opacity, 1),
      tint: attrs.tint ?? '#ffffff',
      ...borderOptions(attrs),
    });
    this.image.mesh.visible = false;
    this.object.add(this.image.mesh);
    this.meshes.push(this.image.mesh);

    this.yoga.setMeasureFunc((w, wm, h, hm) => this.measure(w, wm, h, hm));

    if (attrs.src) {
      ctx.loadTexture(attrs.src)
        .then((tex) => this.onLoad(tex))
        .catch(() => console.warn(`[W7Image] 載入失敗: ${attrs.src}`));
    }
  }

  onLoad(texture) {
    if (this.disposed) return;
    this.image.setMap(texture);
    this.natural = texture.userData.natural;
    this.drawKey = '';
    this.yoga.markDirty();
    this.ctx.requestLayout();
  }

  // 未指定尺寸時使用原圖尺寸，只指定一邊時依比例推算
  measure(width, widthMode, height, heightMode) {
    if (!this.natural) return { width: 0, height: 0 };
    const { w: nw, h: nh } = this.natural;
    const ratio = nh / nw;
    if (widthMode === MeasureMode.Exactly && heightMode === MeasureMode.Exactly) return { width, height };
    if (widthMode === MeasureMode.Exactly) return { width, height: width * ratio };
    if (heightMode === MeasureMode.Exactly) return { width: height / ratio, height };
    let w = nw;
    if (widthMode === MeasureMode.AtMost) w = Math.min(w, width);
    let h = w * ratio;
    if (heightMode === MeasureMode.AtMost && h > height) {
      h = height;
      w = h / ratio;
    }
    return { width: w, height: h };
  }

  updateVisual() {
    if (!this.natural) return;
    const { width: bw, height: bh } = this;
    const key = `${bw}x${bh}`;
    if (key === this.drawKey) return;
    this.drawKey = key;

    const imgRatio = this.natural.w / this.natural.h;
    const boxRatio = bw / bh;
    let w = bw, h = bh;
    let repeatX = 1, repeatY = 1;

    if (this.fit === 'contain') {
      if (imgRatio > boxRatio) h = bw / imgRatio;
      else w = bh * imgRatio;
    } else if (this.fit === 'cover') {
      if (imgRatio > boxRatio) repeatX = boxRatio / imgRatio;
      else repeatY = imgRatio / boxRatio;
    }

    this.image.setUvTransform((1 - repeatX) / 2, (1 - repeatY) / 2, repeatX, repeatY);
    this.image.setSize(w, h);
    this.image.mesh.position.set((bw - w) / 2, -(bh - h) / 2, 0);
  }

  disposeVisual() {
    this.disposed = true;
    this.image.dispose();
  }
}
