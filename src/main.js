import { W7Engine } from './W7Engine.js';
import { createEditor } from './editor.js';

const engine = new W7Engine(document.getElementById('app'), {
  sceneUrl: './scene.xml',
  errorEl: document.getElementById('error'),
  pollInterval: 1000,
});

engine.on('start', (button) => console.log('start', button.attrs.id));
engine.on('settings', (button) => console.log('settings', button.attrs.id));
engine.on('select', (button) => {
  if (button.attrs.id === 'item2') alert('第二項被點擊');
});

engine.start();
createEditor(engine);
window.w7 = engine;
