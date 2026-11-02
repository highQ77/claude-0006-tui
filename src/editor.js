const LIVE_DELAY = 400;

// 頁面上的 scene.xml 編輯器：只套用到目前頁面，不寫回磁碟
export function createEditor(engine) {
  const panel = document.getElementById('editor');
  const toggle = document.getElementById('editor-toggle');
  const textarea = document.getElementById('editor-text');
  const status = document.getElementById('editor-status');
  const live = document.getElementById('editor-live');

  let dirty = false;
  let timer = 0;

  const setStatus = (text, kind = '') => {
    status.textContent = text;
    status.className = kind;
  };

  const updateToggle = () => {
    toggle.innerHTML = panel.hidden
      ? `編輯 XML${dirty ? ' <span class="badge">● 已修改</span>' : ''}`
      : '關閉編輯器';
  };

  const open = () => {
    if (!dirty) textarea.value = engine.sourceText ?? engine.diskText ?? '';
    panel.hidden = false;
    document.body.classList.add('editing');
    updateToggle();
    textarea.focus();
  };

  const close = () => {
    panel.hidden = true;
    document.body.classList.remove('editing');
    updateToggle();
  };

  const apply = () => {
    clearTimeout(timer);
    const error = engine.apply(textarea.value);
    if (error) setStatus('✗ XML 有錯誤，畫面維持上一版', 'err');
    else setStatus(`✓ 已套用（熱更新暫停）${new Date().toLocaleTimeString()}`, 'ok');
  };

  const reset = async () => {
    if (dirty && !confirm('捨棄目前的修改，重新載入磁碟上的 scene.xml？')) return;
    clearTimeout(timer);
    try {
      textarea.value = await engine.resetToDisk();
      dirty = false;
      setStatus('已載入磁碟版本，熱更新恢復');
    } catch (err) {
      setStatus(`✗ ${err.message}`, 'err');
    }
    updateToggle();
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([textarea.value], { type: 'application/xml' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'scene.xml' });
    a.click();
    URL.revokeObjectURL(url);
  };

  textarea.addEventListener('input', () => {
    if (!dirty) {
      dirty = true;
      engine.hotReloadPaused = true;
    }
    setStatus('已修改（熱更新暫停）', 'dirty');
    if (live.checked) {
      clearTimeout(timer);
      timer = setTimeout(apply, LIVE_DELAY);
    }
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      apply();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      textarea.setRangeText('  ', textarea.selectionStart, textarea.selectionEnd, 'end');
      textarea.dispatchEvent(new Event('input'));
    } else if (e.key === 'Escape') {
      close();
    }
  });

  const actions = { apply, reset, download };
  panel.addEventListener('click', (e) => actions[e.target.dataset.act]?.());
  toggle.addEventListener('click', () => (panel.hidden ? open() : close()));

  return { open, close, apply, reset };
}
