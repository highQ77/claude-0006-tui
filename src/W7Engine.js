import * as THREE from 'three';
import Yoga, { Direction } from 'yoga-layout';
import { parseScene } from './parser.js';
import { W7List } from './components/W7List.js';
import { W7Button } from './components/W7Button.js';
import { Background } from './Background.js';

const MAX_LAYOUT_PASSES = 3;
const DRAG_THRESHOLD = 6;
const SVG_SCALE = 4;
const SVG_MAX_SIZE = 2048;

export class W7Engine {
  constructor(container, { sceneUrl = './scene.xml', errorEl = null, pollInterval = 1000 } = {}) {
    this.container = container;
    this.sceneUrl = new URL(sceneUrl, location.href);
    this.errorEl = errorEl;
    this.pollInterval = pollInterval;
    this.root = null;
    this.sourceText = null; // 目前畫面使用的 XML
    this.layoutDirty = false;
    this.syncDirty = false;
    this.textures = new Map();
    this.imageLoader = new THREE.ImageLoader();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.localClippingEnabled = true;
    this.renderer.setPixelRatio(devicePixelRatio);
    this.renderer.autoClear = false;
    // 只影響 3D 背景物件；UI 材質皆不套用 tone mapping
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.background = new Background(this.renderer);
    this.clock = new THREE.Clock();
    this.lists = [];
    this.drag = null;
    this.pressed = null;
    this.hoveredButton = null;
    this.handlers = new Map();

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, 1, 0, -1, -1000, 1000);

    this.yogaConfig = Yoga.Config.create();
    this.yogaConfig.setPointScaleFactor(1);

    // 傳給每個元件的共用 context
    this.ctx = {
      yogaConfig: this.yogaConfig,
      pixelRatio: devicePixelRatio,
      requestLayout: () => { this.layoutDirty = true; },
      loadTexture: (src) => this.loadTexture(src),
    };

    this.diskText = null;
    this.hotReloadPaused = false;

    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
    this.bindPointer();
  }

  async start() {
    await this.reload();
    setInterval(() => this.reload(), this.pollInterval);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  async fetchScene() {
    const res = await fetch(this.sceneUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`讀取 ${this.sceneUrl.pathname} 失敗：HTTP ${res.status}`);
    return res.text();
  }

  // 1. 讀取 scene.xml（磁碟版本有變更才套用；編輯器修改中時暫停）
  async reload() {
    if (this.hotReloadPaused) return;
    let text;
    try {
      text = await this.fetchScene();
    } catch (err) {
      this.showError(err.message);
      return;
    }
    if (this.hotReloadPaused || text === this.diskText) return;
    this.diskText = text;
    this.apply(text);
  }

  // 重新讀取磁碟版本並恢復熱更新
  async resetToDisk() {
    const text = await this.fetchScene();
    this.diskText = text;
    this.hotReloadPaused = false;
    this.apply(text);
    return text;
  }

  // 2. 將 XML 轉換成元件並取代目前畫面，失敗時保留原畫面並回傳錯誤訊息
  apply(text) {
    let root;
    try {
      root = parseScene(text, this.ctx);
    } catch (err) {
      this.showError(err.message);
      return err.message;
    }
    this.showError(null);
    this.sourceText = text;
    this.setRoot(root);
    return null;
  }

  setRoot(root) {
    if (this.root) {
      this.scene.remove(this.root.object);
      this.root.dispose();
      this.root.yoga.freeRecursive();
    }
    this.root = root;
    this.drag = null;
    this.pressed = null;
    this.hoveredButton = null;
    this.lists = [];
    (function collect(n, lists) {
      if (n instanceof W7List) lists.push(n);
      for (const c of n.children) collect(c, lists);
    })(root, this.lists);
    this.scene.add(root.object);
    this.layoutDirty = true;
  }

  // 3. yoga 排版並同步到 three 物件
  layout() {
    const { root } = this;
    if (root.attrs.width == null) root.yoga.setWidth(this.width);
    if (root.attrs.height == null) root.yoga.setHeight(this.height);

    for (let pass = 0; pass < MAX_LAYOUT_PASSES; pass++) {
      root.yoga.calculateLayout(this.width, this.height, Direction.LTR);
      if (!root.postLayout()) break;
    }
    this.layoutDirty = false;
    this.syncDirty = true;
  }

  sync() {
    this.root.sync(0, 0, { order: 0, clip: null, planes: null });
    this.syncDirty = false;
  }

  frame() {
    if (this.root) {
      if (this.layoutDirty) this.layout();
      if (this.syncDirty) this.sync();
    }
    const dt = this.clock.getDelta();
    for (const list of this.lists) list.updateFade(dt);
    this.renderer.clear();
    this.background.render(this.renderer);
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const { clientWidth, clientHeight } = this.container;
    if (!clientWidth || !clientHeight) return;
    if (clientWidth === this.width && clientHeight === this.height) return;
    this.width = clientWidth;
    this.height = clientHeight;
    this.renderer.setSize(this.width, this.height);
    // 螢幕像素座標：左上 (0,0)，y 向下（three 中為 -y）
    Object.assign(this.camera, { left: 0, right: this.width, top: 0, bottom: -this.height });
    this.camera.updateProjectionMatrix();
    this.background.resize(this.width, this.height);
    this.layoutDirty = true;
  }

  // 同一張圖共用一個 texture；SVG 先以高解析度點陣化，避免放大或高 DPI 時模糊
  loadTexture(src) {
    const url = new URL(src, this.sceneUrl).href;
    if (!this.textures.has(url)) {
      const p = this.imageLoader.loadAsync(url).then((img) => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        let source = img;
        if (/\.svg($|\?)/i.test(url)) {
          const scale = Math.max(1, Math.min(SVG_SCALE, SVG_MAX_SIZE / Math.max(w, h)));
          source = document.createElement('canvas');
          source.width = Math.round(w * scale);
          source.height = Math.round(h * scale);
          source.getContext('2d').drawImage(img, 0, 0, source.width, source.height);
        }
        const tex = new THREE.Texture(source);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        tex.userData.natural = { w, h };
        tex.needsUpdate = true;
        return tex;
      });
      p.catch(() => this.textures.delete(url));
      this.textures.set(url, p);
    }
    return this.textures.get(url);
  }

  pick(e, filter) {
    if (!e || !this.root) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    return this.root.pick(e.clientX - r.left, e.clientY - r.top, filter);
  }

  pickList(e) {
    return this.pick(e, (n) => n instanceof W7List && n.maxScroll > 0);
  }

  pickButton(e) {
    return this.pick(e, (n) => n instanceof W7Button && n.interactive);
  }

  // XML 的 onClick="name" 對應 w7.on('name', (button, event) => {})
  on(action, fn) {
    if (!this.handlers.has(action)) this.handlers.set(action, new Set());
    this.handlers.get(action).add(fn);
    return () => this.off(action, fn);
  }

  off(action, fn) {
    this.handlers.get(action)?.delete(fn);
  }

  emit(action, ...args) {
    const fns = this.handlers.get(action);
    if (!fns?.size) {
      console.warn(`[W7Engine] 沒有註冊 "${action}" 的處理函式`);
      return;
    }
    for (const fn of fns) fn(...args);
  }

  bindPointer() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      let list = this.pickList(e);
      // 內層捲到底時交給外層 list
      while (list) {
        if (list.scrollBy(e.deltaX, e.deltaY)) {
          this.syncDirty = true;
          return;
        }
        list = findParentList(list);
      }
    }, { passive: false });

    el.addEventListener('pointerdown', (e) => {
      const list = this.pickList(e);
      const button = this.pickButton(e);
      if (!list && !button) return;
      if (list) this.drag = { list, x: e.clientX, y: e.clientY, moved: 0 };
      if (button) {
        this.pressed = button;
        button.setState({ pressed: true });
      }
      el.setPointerCapture(e.pointerId);
    });

    el.addEventListener('pointermove', (e) => {
      const { drag } = this;
      if (drag) {
        const dx = drag.x - e.clientX;
        const dy = drag.y - e.clientY;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        if (drag.list.scrollBy(dx, dy)) this.syncDirty = true;
        drag.x = e.clientX;
        drag.y = e.clientY;
        // 拖曳超過門檻視為捲動，取消按鈕點擊
        if (drag.moved > DRAG_THRESHOLD) this.releaseButton();
      }
      this.updateHover(e);
    });

    el.addEventListener('pointerup', (e) => {
      const button = this.pressed;
      this.releaseButton();
      this.drag = null;
      if (button && this.pickButton(e) === button && button.action) this.emit(button.action, button, e);
      this.updateHover(e);
    });

    const cancel = () => {
      this.releaseButton();
      this.drag = null;
      this.updateHover(null);
    };
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('pointerleave', cancel);
  }

  releaseButton() {
    this.pressed?.setState({ pressed: false });
    this.pressed = null;
  }

  // List：滑鼠所在（含外層）與拖曳中的顯示 scrollbar，其餘淡出
  // Button：hover 狀態與游標
  updateHover(e) {
    const active = new Set();
    for (let n = this.pick(e, (node) => node instanceof W7List); n; n = n.parent) {
      if (n instanceof W7List) active.add(n);
    }
    if (this.drag) active.add(this.drag.list);
    for (const list of this.lists) list.active = active.has(list);

    const button = this.pressed ? null : this.pickButton(e);
    if (button !== this.hoveredButton) {
      this.hoveredButton?.setState({ hovered: false });
      button?.setState({ hovered: true });
      this.hoveredButton = button;
    }
    this.renderer.domElement.style.cursor = button || this.pressed ? 'pointer' : '';
  }

  showError(message) {
    if (message) console.error(message);
    if (!this.errorEl) return;
    this.errorEl.textContent = message ?? '';
    this.errorEl.style.display = message ? 'block' : 'none';
  }
}

function findParentList(node) {
  let p = node.parent;
  while (p && !(p instanceof W7List && p.maxScroll > 0)) p = p.parent;
  return p;
}
