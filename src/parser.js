import { registry } from './components/index.js';

export function parseScene(xmlText, ctx) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const error = doc.querySelector('parsererror');
  if (error) throw new Error(`scene.xml 解析失敗\n${error.textContent}`);
  return buildNode(doc.documentElement, ctx);
}

function buildNode(el, ctx) {
  const Component = registry[el.tagName];
  if (!Component) throw new Error(`未知的元件 <${el.tagName}>，可用元件：${Object.keys(registry).join(', ')}`);

  const attrs = Object.fromEntries(Array.from(el.attributes, (a) => [a.name, a.value]));
  if (Component.textContent && attrs.text == null) attrs.text = el.textContent.trim();

  const node = new Component(attrs, ctx);
  try {
    for (const child of el.children) node.add(buildNode(child, ctx));
  } catch (err) {
    node.dispose();
    node.yoga.freeRecursive();
    throw err;
  }
  return node;
}
