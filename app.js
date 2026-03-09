(() => {
  'use strict';

  const state = {
    tool: 'blur',
    strength: 18,
    quality: 0.92,
    format: 'image/jpeg',
    imageLoaded: false,
    selection: null,
    dragging: false,
    history: [],
    deferredPrompt: null,
    fitMode: 'fit'
  };

  const els = {
    canvas: document.getElementById('canvas'),
    wrap: document.getElementById('canvasWrap'),
    emptyState: document.getElementById('emptyState'),
    hintBar: document.getElementById('hintBar'),
    loadBtn: document.getElementById('loadBtn'),
    cameraBtn: document.getElementById('cameraBtn'),
    resetBtn: document.getElementById('resetBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    downloadCleanBtn: document.getElementById('downloadCleanBtn'),
    fileInput: document.getElementById('fileInput'),
    undoBtn: document.getElementById('undoBtn'),
    rotateBtn: document.getElementById('rotateBtn'),
    fitBtn: document.getElementById('fitBtn'),
    fillBtn: document.getElementById('fillBtn'),
    strengthRange: document.getElementById('strengthRange'),
    strengthValue: document.getElementById('strengthValue'),
    qualityRange: document.getElementById('qualityRange'),
    qualityValue: document.getElementById('qualityValue'),
    formatSelect: document.getElementById('formatSelect'),
    imageSize: document.getElementById('imageSize'),
    exportInfo: document.getElementById('exportInfo'),
    exifInfo: document.getElementById('exifInfo'),
    installBtn: document.getElementById('installBtn')
  };

  const ctx = els.canvas.getContext('2d');

  function setHint(text) {
    els.hintBar.textContent = text;
  }

  function updateStrengthUI() {
    els.strengthValue.textContent = String(state.strength);
  }

  function updateQualityUI() {
    els.qualityValue.textContent = Number(state.quality).toFixed(2);
  }

  function setActiveTool(tool) {
    state.tool = tool;
    document.querySelectorAll('.tool').forEach((button) => {
      button.classList.toggle('active', button.dataset.tool === tool);
    });
    const hints = {
      blur: 'Blur: выдели пальцем область, чтобы размыть.',
      pixelate: 'Pixelate: выдели пальцем область, чтобы скрыть детали пикселями.',
      blackout: 'Blackout: выдели пальцем область, чтобы залить её чёрным.',
      crop: 'Crop: выдели область и она станет новым кадром.'
    };
    setHint(hints[tool]);
  }

  function toggleEditor(enabled) {
    els.resetBtn.disabled = !enabled;
    els.downloadBtn.disabled = !enabled;
    els.downloadCleanBtn.disabled = !enabled;
    els.rotateBtn.disabled = !enabled;
    els.fitBtn.disabled = !enabled;
    els.fillBtn.disabled = !enabled;
    els.undoBtn.disabled = state.history.length === 0;
  }

  function updateCanvasCssSize() {
    if (!state.imageLoaded) return;
    const wrapRect = els.wrap.getBoundingClientRect();
    const maxW = wrapRect.width - 20;
    const maxH = wrapRect.height - 20;
    const ratio = els.canvas.width / els.canvas.height;
    let cssW = maxW;
    let cssH = maxW / ratio;
    if (state.fitMode === 'fit') {
      if (cssH > maxH) {
        cssH = maxH;
        cssW = cssH * ratio;
      }
    } else {
      cssH = maxH;
      cssW = cssH * ratio;
      if (cssW < maxW) {
        cssW = maxW;
        cssH = cssW / ratio;
      }
    }
    els.canvas.style.width = `${cssW}px`;
    els.canvas.style.height = `${cssH}px`;
  }

  function clearSelection() {
    state.selection = null;
    drawSelection();
  }

  function drawSelection() {
    if (!state.imageLoaded) return;
    redrawCurrentImage();
    if (!state.selection) return;
    const { x, y, w, h } = normalizeRect(state.selection);
    ctx.save();
    ctx.lineWidth = Math.max(2, Math.round(Math.min(els.canvas.width, els.canvas.height) * 0.004));
    ctx.strokeStyle = '#7c9cff';
    ctx.setLineDash([12, 8]);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(124,156,255,0.14)';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  function normalizeRect(rect) {
    const x = rect.w >= 0 ? rect.x : rect.x + rect.w;
    const y = rect.h >= 0 ? rect.y : rect.y + rect.h;
    const w = Math.abs(rect.w);
    const h = Math.abs(rect.h);
    return {
      x: clamp(Math.round(x), 0, els.canvas.width),
      y: clamp(Math.round(y), 0, els.canvas.height),
      w: clamp(Math.round(w), 0, els.canvas.width),
      h: clamp(Math.round(h), 0, els.canvas.height)
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function pushHistory() {
    if (!state.imageLoaded) return;
    try {
      const snapshot = ctx.getImageData(0, 0, els.canvas.width, els.canvas.height);
      state.history.push(snapshot);
      if (state.history.length > 15) state.history.shift();
      els.undoBtn.disabled = false;
    } catch (error) {
      console.error('Не удалось сохранить шаг истории', error);
    }
  }

  function redrawCurrentImage() {
    if (!state.imageLoaded || state.history.length === 0) return;
    const latest = state.history[state.history.length - 1];
    els.canvas.width = latest.width;
    els.canvas.height = latest.height;
    ctx.putImageData(latest, 0, 0);
    updateCanvasCssSize();
    updateSizeInfo();
  }

  function replaceTopHistoryFromCanvas() {
    if (!state.imageLoaded) return;
    const snapshot = ctx.getImageData(0, 0, els.canvas.width, els.canvas.height);
    state.history[state.history.length - 1] = snapshot;
    updateSizeInfo();
  }

  function loadImageFromBlob(blob) {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      els.canvas.width = img.naturalWidth;
      els.canvas.height = img.naturalHeight;
      ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
      ctx.drawImage(img, 0, 0);
      state.imageLoaded = true;
      state.history = [ctx.getImageData(0, 0, els.canvas.width, els.canvas.height)];
      els.emptyState.classList.add('hidden');
      updateCanvasCssSize();
      updateSizeInfo();
      toggleEditor(true);
      clearSelection();
      setHint('Фото загружено. Выбери инструмент и выдели область пальцем.');
      inspectJpegExif(blob);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert('Не удалось открыть изображение.');
    };
    img.src = url;
  }

  function updateSizeInfo() {
    if (!state.imageLoaded) {
      els.imageSize.textContent = '—';
      return;
    }
    els.imageSize.textContent = `${els.canvas.width} × ${els.canvas.height}`;
  }

  async function inspectJpegExif(blob) {
    if (!blob || blob.type !== 'image/jpeg') {
      els.exifInfo.textContent = 'Исходный EXIF неизвестен';
      return;
    }
    try {
      const buffer = await blob.arrayBuffer();
      const hasExif = hasJpegExif(new Uint8Array(buffer));
      els.exifInfo.textContent = hasExif ? 'В исходнике найден EXIF' : 'В исходнике EXIF не найден';
    } catch {
      els.exifInfo.textContent = 'Не удалось проверить EXIF';
    }
  }

  function hasJpegExif(bytes) {
    if (bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return false;
    let i = 2;
    while (i + 4 < bytes.length) {
      if (bytes[i] !== 0xFF) break;
      const marker = bytes[i + 1];
      const length = (bytes[i + 2] << 8) + bytes[i + 3];
      if (marker === 0xE1) return true;
      if (length < 2) break;
      i += 2 + length;
    }
    return false;
  }

  function applyEffect() {
    if (!state.selection || !state.imageLoaded) return;
    const { x, y, w, h } = normalizeRect(state.selection);
    if (w < 8 || h < 8) {
      setHint('Слишком маленькая область. Выдели кусок побольше.');
      clearSelection();
      return;
    }

    pushHistory();

    if (state.tool === 'blur') {
      applyBlur(x, y, w, h, state.strength);
    } else if (state.tool === 'pixelate') {
      applyPixelate(x, y, w, h, state.strength);
    } else if (state.tool === 'blackout') {
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y, w, h);
    } else if (state.tool === 'crop') {
      cropToRect(x, y, w, h);
    }

    replaceTopHistoryFromCanvas();
    clearSelection();
    setHint('Готово. Можно делать следующую правку или скачивать clean-файл.');
  }

  function applyBlur(x, y, w, h, radius) {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = w;
    tempCanvas.height = h;
    tempCtx.filter = `blur(${radius}px)`;
    tempCtx.drawImage(els.canvas, x, y, w, h, 0, 0, w, h);
    tempCtx.filter = 'none';
    ctx.drawImage(tempCanvas, x, y);
  }

  function applyPixelate(x, y, w, h, size) {
    const sample = document.createElement('canvas');
    const sampleCtx = sample.getContext('2d');
    const px = Math.max(4, Math.floor(size));
    sample.width = Math.max(1, Math.floor(w / px));
    sample.height = Math.max(1, Math.floor(h / px));
    sampleCtx.imageSmoothingEnabled = false;
    sampleCtx.drawImage(els.canvas, x, y, w, h, 0, 0, sample.width, sample.height);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sample, 0, 0, sample.width, sample.height, x, y, w, h);
    ctx.restore();
  }

  function cropToRect(x, y, w, h) {
    const imageData = ctx.getImageData(x, y, w, h);
    els.canvas.width = w;
    els.canvas.height = h;
    ctx.putImageData(imageData, 0, 0);
    updateCanvasCssSize();
  }

  function rotateImage() {
    if (!state.imageLoaded) return;
    pushHistory();
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = els.canvas.height;
    tempCanvas.height = els.canvas.width;
    tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
    tempCtx.rotate(Math.PI / 2);
    tempCtx.drawImage(els.canvas, -els.canvas.width / 2, -els.canvas.height / 2);
    els.canvas.width = tempCanvas.width;
    els.canvas.height = tempCanvas.height;
    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
    ctx.drawImage(tempCanvas, 0, 0);
    replaceTopHistoryFromCanvas();
    updateCanvasCssSize();
    clearSelection();
  }

  function resetEditor() {
    if (!state.imageLoaded || state.history.length === 0) return;
    const first = state.history[0];
    state.history = [first];
    els.canvas.width = first.width;
    els.canvas.height = first.height;
    ctx.putImageData(first, 0, 0);
    clearSelection();
    updateCanvasCssSize();
    toggleEditor(true);
    setHint('Сброшено к исходному состоянию текущей сессии.');
  }

  function undo() {
    if (state.history.length <= 1) return;
    state.history.pop();
    redrawCurrentImage();
    clearSelection();
    els.undoBtn.disabled = state.history.length <= 1;
    setHint('Последнее действие отменено.');
  }

  function getCanvasPoint(event) {
    const rect = els.canvas.getBoundingClientRect();
    const clientX = event.clientX ?? (event.touches && event.touches[0]?.clientX) ?? 0;
    const clientY = event.clientY ?? (event.touches && event.touches[0]?.clientY) ?? 0;
    const x = ((clientX - rect.left) / rect.width) * els.canvas.width;
    const y = ((clientY - rect.top) / rect.height) * els.canvas.height;
    return { x: clamp(x, 0, els.canvas.width), y: clamp(y, 0, els.canvas.height) };
  }

  function onPointerDown(event) {
    if (!state.imageLoaded) return;
    const rect = els.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    state.dragging = true;
    const point = getCanvasPoint(event);
    state.selection = { x: point.x, y: point.y, w: 0, h: 0 };
    drawSelection();
  }

  function onPointerMove(event) {
    if (!state.dragging || !state.selection) return;
    const point = getCanvasPoint(event);
    state.selection.w = point.x - state.selection.x;
    state.selection.h = point.y - state.selection.y;
    drawSelection();
  }

  function onPointerUp() {
    if (!state.dragging) return;
    state.dragging = false;
    applyEffect();
  }

  async function exportImage(forceJpeg = false) {
    if (!state.imageLoaded) return;
    const mimeType = forceJpeg ? 'image/jpeg' : state.format;
    const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const quality = mimeType === 'image/png' ? undefined : state.quality;
    return new Promise((resolve, reject) => {
      els.canvas.toBlob(async (blob) => {
        if (!blob) {
          reject(new Error('Не удалось экспортировать изображение.'));
          return;
        }
        const buffer = mimeType === 'image/jpeg' ? await blob.arrayBuffer() : null;
        const hasExif = buffer ? hasJpegExif(new Uint8Array(buffer)) : false;
        els.exportInfo.textContent = `${Math.round(blob.size / 1024)} KB / ${mimeType.replace('image/', '').toUpperCase()}`;
        els.exifInfo.textContent = mimeType === 'image/jpeg'
          ? (hasExif ? 'В экспорт попал EXIF' : 'Экспорт без EXIF')
          : 'PNG/WEBP экспортированы заново';
        resolve({ blob, extension });
      }, mimeType, quality);
    });
  }

  async function download(forceJpeg = false) {
    try {
      const { blob, extension } = await exportImage(forceJpeg);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `privacy-photo-${Date.now()}.${extension}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error(error);
      alert('Не удалось скачать файл.');
    }
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch((error) => {
        console.error('SW registration failed', error);
      });
    }
  }

  function handleInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      state.deferredPrompt = event;
      els.installBtn.classList.remove('hidden');
    });
    els.installBtn.addEventListener('click', async () => {
      if (!state.deferredPrompt) return;
      state.deferredPrompt.prompt();
      await state.deferredPrompt.userChoice;
      state.deferredPrompt = null;
      els.installBtn.classList.add('hidden');
    });
  }

  function bindEvents() {
    els.loadBtn.addEventListener('click', () => els.fileInput.click());
    els.cameraBtn.addEventListener('click', () => {
      els.fileInput.setAttribute('capture', 'environment');
      els.fileInput.click();
    });
    els.fileInput.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (file) loadImageFromBlob(file);
      event.target.value = '';
    });
    els.resetBtn.addEventListener('click', resetEditor);
    els.undoBtn.addEventListener('click', undo);
    els.rotateBtn.addEventListener('click', rotateImage);
    els.fitBtn.addEventListener('click', () => {
      state.fitMode = 'fit';
      updateCanvasCssSize();
      els.fitBtn.classList.add('active');
      els.fillBtn.classList.remove('active');
    });
    els.fillBtn.addEventListener('click', () => {
      state.fitMode = 'fill';
      updateCanvasCssSize();
      els.fillBtn.classList.add('active');
      els.fitBtn.classList.remove('active');
    });
    els.downloadBtn.addEventListener('click', () => download(false));
    els.downloadCleanBtn.addEventListener('click', () => download(true));
    els.strengthRange.addEventListener('input', (event) => {
      state.strength = Number(event.target.value);
      updateStrengthUI();
    });
    els.qualityRange.addEventListener('input', (event) => {
      state.quality = Number(event.target.value);
      updateQualityUI();
    });
    els.formatSelect.addEventListener('change', (event) => {
      state.format = event.target.value;
    });
    document.querySelectorAll('.tool').forEach((button) => {
      button.addEventListener('click', () => setActiveTool(button.dataset.tool));
    });

    els.wrap.addEventListener('pointerdown', onPointerDown);
    els.wrap.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('resize', updateCanvasCssSize);
  }

  function init() {
    bindEvents();
    registerServiceWorker();
    handleInstallPrompt();
    updateStrengthUI();
    updateQualityUI();
    setActiveTool('blur');
    toggleEditor(false);
    els.fitBtn.classList.add('active');
  }

  init();
})();
