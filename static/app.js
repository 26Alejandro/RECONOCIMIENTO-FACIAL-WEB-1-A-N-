/* =====================================================
   FaceAuth — JavaScript principal
   Maneja cámara, capturas, API y UI (Soporte Multi-Sujeto)
   ===================================================== */

const state = {
    refStream: null,
    verifStream: null,
    refRegistered: false,
    verifying: false,
    history: []
  };
  
  // ---- Elementos del DOM ----
  const el = (id) => document.getElementById(id);
  
  // ============================================================
  // CÁMARA
  // ============================================================
  
  async function startCamera(panel) {
    const isRef   = panel === 'ref';
    const videoId = isRef ? 'refVideo'  : 'verifVideo';
    const btnStart= isRef ? 'btnStartRef'  : 'btnStartVerif';
    const btnCap  = isRef ? 'btnCaptureRef': 'btnVerify';
  
    try {
      setStatus('Accediendo a cámara...', 'busy');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: 'user' }
      });
  
      const video = el(videoId);
      video.srcObject = stream;
      video.style.display = 'block';
  
      if (isRef) {
        state.refStream = stream;
        el('refPreview').style.display = 'none';
      } else {
        state.verifStream = stream;
        el('verifPreview').style.display = 'none';
        el('verifOverlay').style.display = 'flex';
      }
  
      el(btnStart).style.display = 'none';
      el(btnCap).style.display   = 'flex';
      setStatus('Cámara activa', 'ok');
      showToast('Cámara activada', 'ok');
  
    } catch (err) {
      setStatus('Error de cámara', 'error');
      showToast('No se pudo acceder a la cámara: ' + err.message, 'error');
    }
  }
  
  function captureFrame(videoId, canvasId) {
    const video  = el(videoId);
    const canvas = el(canvasId);
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.9);
  }
  
  // ============================================================
  // REGISTRO DE REFERENCIA (Multi-Sujeto)
  // ============================================================
  
  async function captureAndRegister() {
    if (!state.refStream) return;
  
    const btn = el('btnCaptureRef');
    btn.disabled = true;
    btn.textContent = 'Procesando...';
    showScanLine('ref');
    setStatus('Registrando rostro...', 'busy');
  
    const imageData = captureFrame('refVideo', 'refCanvas');
  
    try {
      const resp = await fetch('/upload_reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData })
      });
      const data = await resp.json();
      hideScanLine('ref');
  
      if (data.success) {
        // Detener cámara y mostrar preview
        stopStream('ref');
        el('refVideo').style.display = 'none';
        el('refPreview').src         = data.preview;
        el('refPreview').style.display = 'block';
  
        el('btnCaptureRef').style.display = 'none';
        
        // Hacemos que el botón "Borrar" sea siempre visible si hay datos
        el('btnResetRef').style.display   = 'flex';
        
        // Pero volvemos a mostrar "Activar Cámara" para registrar más sujetos
        el('btnStartRef').style.display = 'flex';
        el('btnStartRef').innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg> Agregar Otro Sujeto';
        
        state.refRegistered = true;
  
        const card = el('refResult');
        card.className = 'info-card success';
        card.innerHTML = `✓ Registrado como: <strong>${data.subject}</strong><br>
          Rostros detectados: <strong>${data.faces_found}</strong><br>
          Hora: <strong>${data.timestamp}</strong>`;
        card.style.display = 'block';
  
        setStatus('Referencia guardada', 'ok');
        showToast(`${data.subject} registrado exitosamente`, 'ok');
      } else {
        showError('refResult', data.error || 'Error al registrar');
        resetBtn(btn, 'Tomar Foto');
        setStatus('Error', 'error');
      }
    } catch (err) {
      hideScanLine('ref');
      showError('refResult', 'Error de conexión: ' + err.message);
      resetBtn(btn, 'Tomar Foto');
      setStatus('Error', 'error');
    }
  }
  
  // ============================================================
  // VERIFICACIÓN
  // ============================================================
  
  async function verifyFace() {
    if (!state.verifStream || state.verifying) return;
    state.verifying = true;
  
    const btn = el('btnVerify');
    btn.disabled = true;
    btn.textContent = 'Analizando...';
    showScanLine('verif');
    setStatus('Buscando coincidencias...', 'busy');
  
    const imageData = captureFrame('verifVideo', 'verifCanvas');
  
    try {
      const resp = await fetch('/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData })
      });
      const data = await resp.json();
      hideScanLine('verif');
  
      if (!data.success && !data.hasOwnProperty('match')) {
        showError('verifResult', data.error || 'Error en verificación');
        resetVerifyBtn();
        return;
      }
  
      // Mostrar preview con anotaciones
      stopStream('verif');
      el('verifVideo').style.display  = 'none';
      el('verifOverlay').style.display= 'none';
  
      if (data.preview) {
        el('verifPreview').src         = data.preview;
        el('verifPreview').style.display = 'block';
      }
  
      el('btnVerify').style.display    = 'none';
      el('btnResetVerif').style.display= 'flex';
  
      // Info card (Actualizada para Multi-Sujeto)
      const card = el('verifResult');
      card.className = `info-card ${data.match ? 'success' : 'error'}`;
      
      const identityText = data.match ? `✓ MATCH: ${data.matched_name.toUpperCase()}` : `✗ DESCONOCIDO`;
      
      card.innerHTML = `<strong>${identityText}</strong><br>
        Confianza: <strong>${data.confidence}%</strong><br>
        Hora: <strong>${data.timestamp || '—'}</strong>`;
      card.style.display = 'block';
  
      // Panel de resultados
      renderResultPanel(data, imageData);
  
      // Agregar a historial
      addToHistory(data);
  
      setStatus(data.match ? 'Identidad confirmada' : 'No coincide', data.match ? 'ok' : 'error');
      showToast(
        data.match ? `Verificado ✓ (${data.matched_name})` : `Desconocido (${data.confidence}%)`,
        data.match ? 'ok' : 'error'
      );
  
    } catch (err) {
      hideScanLine('verif');
      showError('verifResult', 'Error de conexión: ' + err.message);
      setStatus('Error', 'error');
    } finally {
      state.verifying = false;
    }
  }
  
  // ============================================================
  // PANEL DE RESULTADOS (Actualizado)
  // ============================================================
  
  function renderResultPanel(data, capturedImageData) {
    const panel = el('resultPanel');
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  
    // Verdict
    const verdict = el('resultVerdict');
    verdict.className = `result-verdict ${data.match ? 'match' : 'no-match'}`;
    verdict.innerHTML = data.match
      ? `✓ &nbsp; CONFIRMADO: ${data.matched_name.toUpperCase()}`
      : `✗ &nbsp; DESCONOCIDO`;
  
    // Confidence
    const conf = data.confidence || 0;
    el('metricConfidence').textContent = conf.toFixed(1) + '%';
    el('metricConfidence').style.color = conf >= 55 ? 'var(--success)' : 'var(--danger)';
  
    const bar = el('meterBar');
    setTimeout(() => {
      bar.style.width = Math.min(conf, 100) + '%';
      bar.className = 'meter-bar ' + (conf >= 75 ? 'high' : conf >= 55 ? 'medium' : 'low');
    }, 100);
  
    el('metricDistance').textContent  = data.distance != null ? data.distance.toFixed(4) : '—';
    el('metricLevel').textContent     = data.security_level || '—';
    el('metricThreshold').textContent = (data.threshold || 55) + '%';
    el('metricTime').textContent      = data.timestamp || '—';
  
    // Imágenes: Si hay match mostramos la foto base de ese sujeto
    if (data.match && data.matched_image) {
        el('resultRefImg').src = data.matched_image + '?t=' + Date.now();
        el('resultRefImg').style.display = 'block';
    } else {
        el('resultRefImg').style.display = 'none';
    }
    
    if (data.preview) el('resultCapImg').src = data.preview;
  }
  
  // ============================================================
  // HISTORIAL
  // ============================================================
  
  function addToHistory(data) {
    const entry = {
      timestamp:  data.timestamp || new Date().toLocaleTimeString(),
      match:      data.match,
      name:       data.matched_name || 'Desconocido',
      confidence: data.confidence,
      level:      data.security_level
    };
    state.history.unshift(entry);
  
    const list = el('historyList');
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <span class="h-time">${entry.timestamp}</span>
      <span>${entry.name}</span>
      <span class="h-conf" style="color:${entry.match ? 'var(--success)':'var(--danger)'}">${entry.confidence?.toFixed(1)}%</span>
      <span class="h-badge ${entry.match ? 'ok':'fail'}">${entry.match ? 'MATCH':'FAIL'}</span>
    `;
    list.prepend(item);
  }
  
  // ============================================================
  // RESET
  // ============================================================
  
  async function resetReference() {
    stopStream('ref');
    // Borramos todos los sujetos
    await fetch('/clear_reference', { method: 'POST' });
  
    el('refVideo').style.display    = 'block';
    el('refPreview').style.display  = 'none';
    el('refResult').style.display   = 'none';
    
    el('btnStartRef').style.display = 'flex';
    el('btnStartRef').innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg> Activar Cámara';
    
    el('btnCaptureRef').style.display = 'none';
    el('btnResetRef').style.display   = 'none';
    el('resultPanel').style.display   = 'none';
  
    state.refRegistered = false;
    el('meterBar').style.width = '0%';
    setStatus('Base de datos limpia', 'ok');
    showToast('Todos los sujetos eliminados', 'ok');
  }
  
  function resetVerification() {
    stopStream('verif');
    el('verifVideo').style.display    = 'block';
    el('verifOverlay').style.display  = 'flex';
    el('verifPreview').style.display  = 'none';
    el('verifResult').style.display   = 'none';
    el('btnStartVerif').style.display = 'flex';
    el('btnVerify').style.display     = 'none';
    el('btnResetVerif').style.display = 'none';
    setStatus('Sistema listo', 'ok');
  }
  
  function resetVerifyBtn() {
    const btn = el('btnVerify');
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg> Verificar Identidad`;
    state.verifying = false;
  }
  
  // ============================================================
  // HELPERS
  // ============================================================
  
  function stopStream(panel) {
    const stream = panel === 'ref' ? state.refStream : state.verifStream;
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      if (panel === 'ref') state.refStream   = null;
      else                  state.verifStream = null;
    }
  }
  
  function showScanLine(panel) {
    const id = panel === 'ref' ? 'refScanLine' : 'verifScanLine';
    el(id).style.display = 'block';
  }
  function hideScanLine(panel) {
    const id = panel === 'ref' ? 'refScanLine' : 'verifScanLine';
    el(id).style.display = 'none';
  }
  
  function showError(cardId, msg) {
    const card = el(cardId);
    card.className = 'info-card error';
    card.textContent = '✗ ' + msg;
    card.style.display = 'block';
  }
  
  function resetBtn(btn, label) {
    btn.disabled = false;
    btn.textContent = label;
  }
  
  function setStatus(msg, type) {
    el('statusText').textContent = msg;
    const dot = el('statusDot');
    dot.className = 'dot' + (type === 'busy' ? ' busy' : type === 'error' ? ' error' : '');
  }
  
  function showToast(msg, type = 'ok') {
    const toast = el('toast');
    toast.textContent = msg;
    toast.className = `toast toast-${type} show`;
    setTimeout(() => { toast.className = `toast toast-${type}`; }, 3500);
  }
  
  // ============================================================
  // INIT
  // ============================================================
  setStatus('Sistema listo', 'ok');