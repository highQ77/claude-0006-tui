import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const rand = (min, max) => min + Math.random() * (max - min);
const hsl = (h, s, l) => new THREE.Color().setHSL(((h % 1) + 1) % 1, s, l, THREE.SRGBColorSpace);
const BLOBS = 4;

// 每次載入隨機配色：緩慢流動的 mesh 漸層 + 帶環境反射的彩虹膜 3D 物件
export class Background {
  constructor(renderer) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.camera.position.z = 7;
    this.clock = new THREE.Clock();

    const hue = Math.random();
    const blobColors = [
      hsl(hue, 0.75, 0.42),
      hsl(hue + rand(0.06, 0.12), 0.8, 0.38),
      hsl(hue - rand(0.08, 0.14), 0.7, 0.32),
      hsl(hue + 0.5, 0.6, 0.34),
    ];
    const blobPositions = Array.from({ length: BLOBS }, () => new THREE.Vector2(rand(0.05, 0.95), rand(0.05, 0.95)));
    const blobRadius = Array.from({ length: BLOBS }, (_, i) => (i === 3 ? rand(0.22, 0.3) : rand(0.38, 0.55)));

    this.gradient = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uAspect: { value: 1 },
          uBase: { value: hsl(hue, 0.5, 0.06) },
          uColors: { value: blobColors },
          uPositions: { value: blobPositions },
          uRadius: { value: blobRadius },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uAspect;
          uniform vec3 uBase;
          uniform vec3 uColors[${BLOBS}];
          uniform vec2 uPositions[${BLOBS}];
          uniform float uRadius[${BLOBS}];
          varying vec2 vUv;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
          }

          void main() {
            vec2 p = vec2(vUv.x * uAspect, vUv.y);
            vec3 color = uBase;
            for (int i = 0; i < ${BLOBS}; i++) {
              float fi = float(i);
              vec2 c = uPositions[i] + 0.1 * vec2(sin(uTime * 0.13 + fi * 1.7), cos(uTime * 0.11 + fi * 2.3));
              c.x *= uAspect;
              float d = length(p - c) / uRadius[i];
              color = mix(color, uColors[i], exp(-d * d) * 0.9);
            }
            float vignette = smoothstep(1.15, 0.25, length(vUv - 0.5) * 1.5);
            color *= mix(0.55, 1.0, vignette);
            gl_FragColor = vec4(color, 1.0);
            #include <colorspace_fragment>
            // dithering：避免漸層出現色帶
            gl_FragColor.rgb += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
          }`,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.gradient.frustumCulled = false;
    this.gradient.renderOrder = -1;
    this.scene.add(this.gradient);

    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.mesh = new THREE.Mesh(
      new THREE.TorusKnotGeometry(1, 0.34, 320, 48),
      new THREE.MeshPhysicalMaterial({
        color: hsl(hue + 0.05, 0.5, 0.42),
        metalness: 0.2,
        roughness: 0.16,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        iridescence: 0.9,
        iridescenceIOR: 1.35,
        iridescenceThicknessRange: [180, 620],
        envMapIntensity: 0.9,
      }),
    );
    this.mesh.rotation.set(rand(0, Math.PI), rand(0, Math.PI), 0);
    this.mesh.scale.setScalar(0.85);
    this.scene.add(this.mesh);

    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(3, 4, 5);
    const rim = new THREE.DirectionalLight(blobColors[1], 2.2);
    rim.position.set(-4, -2, -3);
    this.scene.add(key, rim);
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    // 直式畫面時拉遠，避免物件超出畫面
    this.camera.position.z = width < height ? 7 * (height / width) * 0.75 : 7;
    this.camera.updateProjectionMatrix();
    this.gradient.material.uniforms.uAspect.value = width / height;
  }

  render(renderer) {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    this.gradient.material.uniforms.uTime.value = t;
    this.mesh.rotation.x += dt * 0.25;
    this.mesh.rotation.y += dt * 0.38;
    this.mesh.position.y = Math.sin(t * 0.6) * 0.12;
    renderer.render(this.scene, this.camera);
  }
}
