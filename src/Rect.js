import * as THREE from 'three';

const vertexShader = /* glsl */ `
  #include <clipping_planes_pars_vertex>
  varying vec2 vPos;
  void main() {
    vPos = vec2(position.x, -position.y);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

// 以 SDF 畫圓角矩形：邊緣抗鋸齒、上下漸層、邊框、貼圖、模糊陰影
const fragmentShader = /* glsl */ `
  #include <clipping_planes_pars_fragment>
  uniform vec2 uSize;
  uniform float uRadius;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uOpacity;
  uniform vec3 uBorderColor;
  uniform float uBorderWidth;
  uniform float uBorderOpacity;
  uniform float uBlur;
  uniform sampler2D uMap;
  uniform bool uHasMap;
  uniform mat3 uUvTransform;
  uniform vec3 uTint;
  varying vec2 vPos;

  float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    #include <clipping_planes_fragment>
    vec2 halfSize = uSize * 0.5;
    float r = min(uRadius, min(halfSize.x, halfSize.y));
    float d = sdRoundBox(vPos - halfSize, halfSize, r);

    if (uBlur > 0.0) {
      float a = 1.0 - smoothstep(-uBlur, uBlur, d);
      gl_FragColor = vec4(uColorA, a * a * uOpacity);
    } else {
      float aa = max(fwidth(d), 1e-4) * 0.7;
      float fill = 1.0 - smoothstep(-aa, aa, d);
      vec2 uv = vPos / uSize;
      vec3 color = mix(uColorA, uColorB, uv.y);
      float alpha = uOpacity;
      if (uHasMap) {
        vec4 tex = texture2D(uMap, (uUvTransform * vec3(uv.x, 1.0 - uv.y, 1.0)).xy);
        color = tex.rgb * uTint;
        alpha *= tex.a;
      }
      if (uBorderWidth > 0.0) {
        float b = smoothstep(-uBorderWidth - aa, -uBorderWidth + aa, d);
        color = mix(color, uBorderColor, b);
        alpha = mix(alpha, uBorderOpacity, b);
      }
      gl_FragColor = vec4(color, alpha * fill);
    }
    #include <colorspace_fragment>
  }
`;

export class Rect {
  constructor({
    color = '#ffffff', colorTo, opacity = 1, radius = 0,
    borderColor, borderWidth = 1, borderOpacity = 1,
    blur = 0, map = null, tint = '#ffffff',
  } = {}) {
    this.pad = blur > 0 ? blur * 2 : 1;
    this.uniforms = {
      uSize: { value: new THREE.Vector2(1, 1) },
      uRadius: { value: radius },
      uColorA: { value: new THREE.Color(color) },
      uColorB: { value: new THREE.Color(colorTo ?? color) },
      uOpacity: { value: opacity },
      uBorderColor: { value: new THREE.Color(borderColor ?? '#ffffff') },
      uBorderWidth: { value: borderColor ? borderWidth : 0 },
      uBorderOpacity: { value: borderOpacity },
      uBlur: { value: blur },
      uMap: { value: map },
      uHasMap: { value: !!map },
      uUvTransform: { value: new THREE.Matrix3() },
      uTint: { value: new THREE.Color(tint) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      clipping: true,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.w = -1;
    this.h = -1;
  }

  get opacity() {
    return this.uniforms.uOpacity.value;
  }

  set opacity(v) {
    this.uniforms.uOpacity.value = v;
  }

  get colors() {
    return [this.uniforms.uColorA.value, this.uniforms.uColorB.value];
  }

  setColors(a, b = a) {
    this.uniforms.uColorA.value.copy(a);
    this.uniforms.uColorB.value.copy(b);
  }

  setMap(texture) {
    this.uniforms.uMap.value = texture;
    this.uniforms.uHasMap.value = !!texture;
  }

  setUvTransform(offsetX, offsetY, repeatX, repeatY) {
    this.uniforms.uUvTransform.value.setUvTransform(offsetX, offsetY, repeatX, repeatY, 0, 0, 0);
  }

  setSize(w, h) {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    const p = this.pad;
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.PlaneGeometry(w + p * 2, h + p * 2).translate(w / 2, -h / 2, 0);
    this.uniforms.uSize.value.set(w, h);
    this.mesh.visible = w > 0 && h > 0;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

// "x y blur color opacity"，"true" 使用預設值
export function parseShadow(value) {
  if (value == null || value === 'false') return null;
  const [x = 0, y = 8, blur = 24, color = '#000000', opacity = 0.35] = value === 'true' ? [] : value.trim().split(/\s+/);
  return { x: Number(x), y: Number(y), blur: Math.max(1, Number(blur)), color, opacity: Number(opacity) };
}

export function planeGeometry(w, h) {
  return new THREE.PlaneGeometry(w, h).translate(w / 2, -h / 2, 0);
}
