import React, { useState, useEffect, useRef } from 'react';
import { Scan, User, Laptop, CheckCircle, AlertTriangle, XCircle, Plus, Loader2, MonitorOff, LogIn, LogOut, UserCheck, QrCode, ArrowRight, Smartphone, Download, FileText, Camera, X, Keyboard, Grid, Barcode, Zap } from 'lucide-react';

// --- CONFIGURACIÓN ---
const API_URL = "https://script.google.com/macros/s/AKfycby3xgU6EeOrkirJAerQoL6G4w00yl9CGWwQt8p-wOdOR3gExR4n48k_K2FKl0cYzt-H/exec"; 
const QR_READ_API = "https://api.qrserver.com/v1/read-qr-code/";

// --- ESTADOS DE LA MÁQUINA ---
const STATE = {
  WAITING: 'WAITING',
  LOADING: 'LOADING',
  USER_DETECTED: 'USER_DETECTED',
  NEW_USER_MODE: 'NEW_USER_MODE',
  RESULT: 'RESULT',
  SHOW_CODE: 'SHOW_CODE',
  DASHBOARD: 'DASHBOARD'
};

export default function App() {
  const [appState, setAppState] = useState(STATE.WAITING);
  const [inputBuffer, setInputBuffer] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentAssets, setCurrentAssets] = useState<any[]>([]);
  const [feedback, setFeedback] = useState({ type: '', msg: '' });
  
  const [currentMode, setCurrentMode] = useState<'ENTRADA' | 'SALIDA'>('ENTRADA');
  
  const [newUserForm, setNewUserForm] = useState({ name: '', assetDesc: '', assetId: '' });
  const [hasLaptop, setHasLaptop] = useState(true);
  
  const [generatedCodeData, setGeneratedCodeData] = useState<{id: string, type: 'QR' | 'BARCODE'} | null>(null);
  const [dashboardSearch, setDashboardSearch] = useState('');
  
  const [isScanning, setIsScanning] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualId, setManualId] = useState('');
  const [nativeMode, setNativeMode] = useState(false); 

  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- 1. GESTIÓN DE CÁMARA (HÍBRIDA) ---
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } // Aumentamos la resolución de captura
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      if ('BarcodeDetector' in window) {
          setNativeMode(true);
      } else {
          setNativeMode(false);
      }

    } catch (err) {
      console.error(err);
      alert("No se pudo acceder a la cámara.");
      setShowCamera(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const captureAndScan = () => {
    if (!videoRef.current || !canvasRef.current || isScanning) return;
    const video = videoRef.current;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (context) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(async (blob) => {
                if (!blob) return;
                handleImageScan(blob);
            }, 'image/jpeg', 0.5);
        }
    }
  };

  const handleImageScan = async (imageBlob: Blob) => {
    setIsScanning(true);
    try {
        const formData = new FormData();
        formData.append('file', imageBlob);
        
        // Enviamos el formato de códigos de barras MÁS USADO (Code 128)
        formData.append('formats', 'qrcode,code128,ean13,code39'); 

        const response = await fetch(QR_READ_API, { method: 'POST', body: formData });
        const data = await response.json();
        if (data && data[0]?.symbol?.[0]?.data) {
            const code = data[0].symbol[0].data;
            stopCamera(); setShowCamera(false); setIsScanning(false);
            processScanCode(code);
        } else { setIsScanning(false); }
    } catch (error) { setIsScanning(false); }
  };

  useEffect(() => {
    let interval: any;
    if (showCamera) {
        startCamera();
        const time = ('BarcodeDetector' in window) ? 200 : 1500;
        interval = setInterval(captureAndScan, time);
    } else { stopCamera(); }
    return () => { clearInterval(interval); stopCamera(); };
  }, [showCamera]);

  // --- 2. LÓGICA GENERAL ---
  useEffect(() => {
    if (appState === STATE.NEW_USER_MODE || appState === STATE.SHOW_CODE || appState === STATE.DASHBOARD || showCamera || showManualInput) return;
    const keepFocus = () => { 
        if (appState !== STATE.NEW_USER_MODE && appState !== STATE.SHOW_CODE && appState !== STATE.DASHBOARD && !showCamera && !showManualInput) inputRef.current?.focus(); 
    };
    const interval = setInterval(keepFocus, 2000);
    document.addEventListener('click', keepFocus);
    keepFocus();
    return () => { clearInterval(interval); document.removeEventListener('click', keepFocus); };
  }, [appState, showCamera, showManualInput]);

  const parseInput = (rawText: string) => {
    if (rawText.length > 20) { const match = rawText.match(/\d{6,10}/); return match ? match[0] : rawText; }
    return rawText.trim();
  };

  const processScanCode = (code: string) => {
    if (!code) return;
    console.log("Procesando:", code);
    
    if (appState === STATE.WAITING || appState === STATE.RESULT || appState === STATE.USER_DETECTED) {
        fetchUser(code);
    } else if (appState === STATE.NEW_USER_MODE) {
        if (hasLaptop) { setNewUserForm(prev => ({ ...prev, assetId: code })); alert(`✅ CÓDIGO: ${code}`); }
    }
  };

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputBuffer) return;
    const scannedCode = parseInput(inputBuffer);
    setInputBuffer('');
    processScanCode(scannedCode);
  };

  const handleManualIdSubmit = (e: React.FormEvent) => { 
      e.preventDefault(); 
      if (manualId) { 
          setShowManualInput(false); 
          fetchUser(manualId, false); 
          setManualId(''); 
      } 
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsScanning(true);
    if ('BarcodeDetector' in window) {
        try {
            const barcodeDetector = new (window as any).BarcodeDetector({formats: ['qr_code', 'code_128', 'ean_13']});
            const imageBitmap = await createImageBitmap(file);
            const barcodes = await barcodeDetector.detect(imageBitmap);
            if (barcodes.length > 0) {
                setIsScanning(false);
                processScanCode(barcodes[0].rawValue);
                e.target.value = '';
                return;
            }
        } catch(e) { console.error(e); }
    }
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('formats', 'qrcode,code128,ean13,code39'); 
        const response = await fetch(QR_READ_API, { method: 'POST', body: formData });
        const data = await response.json();
        if (data && data[0]?.symbol?.[0]?.data) {
            setIsScanning(false);
            processScanCode(data[0].symbol[0].data);
        } else { setIsScanning(false); alert("No se detectó código."); }
    } catch (error) { setIsScanning(false); alert("Error analizando imagen."); }
    e.target.value = '';
  };

  // --- CONEXIÓN BACKEND ---
  const fetchUser = async (cedula: string, isDashboardSearch = false) => {
    setAppState(STATE.LOADING);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: isDashboardSearch ? 'BUSCAR_USUARIO' : 'IDENTIFICAR_CODIGO', codigo: cedula, cedula: cedula }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      if (data.status === 'success') {
        setCurrentUser(data.usuario);
        setCurrentAssets(data.activos || []);
        
        if (isDashboardSearch) {
            setAppState(STATE.DASHBOARD);
        } else {
            if (data.tipo === 'ACTIVO') {
                // Opción 1: Escaneó código de portátil. Hacemos registro RÁPIDO.
                await logMovement(currentMode, data.usuario.cedula, data.activo.id_activo, 'EXITOSO (SCAN&GO)', data.usuario.nombre);
                showFeedback('success', `${currentMode} RÁPIDA: ${data.usuario.nombre} - ${data.activo.id_activo}`);
            } else {
                 // Opción 2: Escaneó cédula/código de barras personal. 
                 if (currentMode === 'SALIDA') {
                     const assetIdForCycle = data.usuario.cedula; 
                     await logMovement('SALIDA', data.usuario.cedula, assetIdForCycle, 'EXITOSO (PEATONAL)', data.usuario.nombre);
                     showFeedback('success', `SALIDA PEATONAL RÁPIDA: ${data.usuario.nombre}`);
                 } else {
                    // Si el modo es ENTRADA, mostramos la pantalla de "Trae equipo?"
                    setAppState(STATE.USER_DETECTED);
                 }
            }
        }
      } else if (data.status === 'not_found') {
        if (isDashboardSearch) {
            alert("Usuario no encontrado.");
            setAppState(STATE.DASHBOARD);
        } else {
            setCurrentUser({ cedula: data.codigo || cedula });
            setNewUserForm({ name: '', assetDesc: '', assetId: '' });
            setHasLaptop(true);
            setAppState(STATE.NEW_USER_MODE);
        }
      } else {
        showFeedback('error', 'Error: ' + String(data.message));
      }
    } catch (error: any) {
      showFeedback('error', String(error.message || 'Error de conexión'));
    }
  };

  const validateAsset = async (assetCode: string) => {
    const match = currentAssets.find(a => String(a.id_activo) === String(assetCode));
    if (match) {
      const success = await logMovement(currentMode, currentUser.cedula, assetCode, 'EXITOSO', currentUser.nombre);
      if (success) showFeedback('success', `${currentMode} EXITOSA: ${match.descripcion}`);
    } else {
      await logMovement(currentMode + ' (FALLIDO)', currentUser.cedula, assetCode, 'ALERTA', currentUser.nombre);
      showFeedback('alarm', 'ALERTA: EQUIPO NO AUTORIZADO');
    }
  };

  const handleManualEntry = async () => {
    setAppState(STATE.LOADING);
    const assetIdForCycle = currentUser.cedula; 
    const success = await logMovement(currentMode, currentUser.cedula, assetIdForCycle, 'EXITOSO', currentUser.nombre);
    if (success) showFeedback('success', `${currentMode} PEATONAL EXITOSA`);
    else setAppState(STATE.USER_DETECTED); 
  };

  const registerNewUserAndAsset = async () => {
    if (!newUserForm.name) return alert("Falta nombre");
    if (hasLaptop && !newUserForm.assetId) return alert("Falta Serial del equipo");

    setAppState(STATE.LOADING);
    try {
      const payload = {
          action: 'VINCULAR_ACTIVO',
          cedula: currentUser.cedula,
          nombre: newUserForm.name,
          id_activo: hasLaptop ? newUserForm.assetId : 'SIN-EQUIPO-' + Date.now(), 
          descripcion: hasLaptop ? newUserForm.assetDesc : 'Peatonal',
          crearUsuario: true
      };
      
      const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
      const data = await response.json();
      
      if (data.status === 'success') {
        const codeForEntry = hasLaptop ? payload.id_activo : currentUser.cedula;

        await logMovement('ENTRADA', currentUser.cedula, codeForEntry, 'EXITOSO (REGISTRO)', newUserForm.name);
        
        if (hasLaptop) {
            setGeneratedCodeData({ id: payload.id_activo, type: 'QR' });
        } else {
            setGeneratedCodeData({ id: currentUser.cedula, type: 'BARCODE' });
        }
        setAppState(STATE.SHOW_CODE);

      } else {
        alert("Error: " + String(data.message));
        setAppState(STATE.NEW_USER_MODE);
      }
    } catch (e) {
      alert("Error de red");
      setAppState(STATE.NEW_USER_MODE);
    }
  };

  const logMovement = async (tipo: string, uid: string, aid: string, resultado: string, nombreOpcional?: string) => {
    try {
      const payload: any = {
        action: 'REGISTRAR_MOVIMIENTO',
        tipo, id_usuario: uid, id_activo: aid, resultado
      };
      if (nombreOpcional) payload.nombre_usuario = nombreOpcional; else if (currentUser?.nombre) payload.nombre_usuario = currentUser.nombre;

      const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
      const data = await response.json();
      if (data.status === 'error') { alert("⚠️ " + String(data.message)); return false; }
      return true;
    } catch (e) { alert("Error conexión"); return false; }
  };

  // --- DESCARGAR E IMPRIMIR ---
  const getFinalImageUrl = () => {
      if (!generatedCodeData) return '';
      if (generatedCodeData.type === 'QR') {
          return `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${generatedCodeData.id}`;
      } else {
          return `https://bwipjs-api.metafloor.com/?bcid=code128&text=${generatedCodeData.id}&scale=3&rotate=N&includetext`;
      }
  };
  
  // URL del QR que se muestra en pantalla (codifica la URL de la imagen final)
  const screenQrUrl = generatedCodeData ? `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(getFinalImageUrl())}` : '';

  const handleDownloadCode = async () => {
    if (!generatedCodeData) return;
    try {
        const response = await fetch(getFinalImageUrl());
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${generatedCodeData.type}-${generatedCodeData.id}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error) { alert('Error al descargar.'); }
  };

  const handlePrint = () => window.print();

  // --- 3. RENDERIZADO ---
  const showFeedback = (type: string, msg: string) => {
    setFeedback({ type, msg: String(msg) }); 
    setAppState(STATE.RESULT);
    setTimeout(() => {
      setAppState(STATE.WAITING);
      setFeedback({ type: '', msg: '' });
      setCurrentUser(null);
      setCurrentAssets([]);
      setNewUserForm({ name: '', assetDesc: '', assetId: '' });
      setHasLaptop(true);
      setGeneratedCodeData(null);
      setDashboardSearch('');
    }, 4000);
  };

  const getBgColor = () => {
      if (feedback.type === 'success') return 'bg-emerald-600';
      if (feedback.type === 'alarm') return 'bg-red-600';
      if (feedback.type === 'error') return 'bg-orange-600';
      if (appState === STATE.DASHBOARD) return 'bg-slate-900';
      return 'bg-slate-900'; 
  };

  return (
    <div className={`min-h-screen ${getBgColor()} transition-colors duration-500 text-white font-sans overflow-hidden flex flex-col items-center justify-center p-4`}>
      <style>{`@media print { body * { visibility: hidden; } .printable-area, .printable-area * { visibility: visible; } .printable-area { position: absolute; left: 0; top: 0; width: 100%; background: white; color: black; padding: 20px; } .no-print { display: none; } }`}</style>

      <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
      <form onSubmit={handleScanSubmit} className="absolute opacity-0 top-0"><input ref={inputRef} value={inputBuffer} onChange={(e) => setInputBuffer(e.target.value)} onBlur={() => { if (appState !== STATE.NEW_USER_MODE && appState !== STATE.SHOW_CODE && !showCamera && !showManualInput && appState !== STATE.DASHBOARD) inputRef.current?.focus(); }} /><button type="submit">Submit</button></form>

      {/* MODALES */}
      {showManualInput && (
          <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4">
              <div className="bg-slate-800 w-full max-w-md rounded-2xl p-6 border border-slate-600 shadow-2xl relative">
                  <button onClick={() => setShowManualInput(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={24} /></button>
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Keyboard /> INGRESAR CÉDULA</h3>
                  <form onSubmit={handleManualIdSubmit}>
                      <input type="number" autoFocus className="w-full bg-slate-900 border border-slate-500 rounded-xl p-4 text-white text-xl mb-4 focus:border-blue-500 outline-none placeholder-slate-600" placeholder="Ej: 104567890" value={manualId} onChange={(e) => setManualId(e.target.value)}/>
                      <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl">CONTINUAR</button>
                  </form>
              </div>
          </div>
      )}

      {showCamera && (
          <div className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center">
              <button onClick={() => setShowCamera(false)} className="absolute top-4 right-4 bg-red-600 text-white p-3 rounded-full z-10 hover:bg-red-700"><X size={24} /></button>
              <div className="relative w-full max-w-md aspect-square bg-black border-2 border-blue-500 rounded-lg overflow-hidden mb-6 shadow-2xl shadow-blue-900/50"><video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" /></div>
              <canvas ref={canvasRef} className="hidden" />
              <div className="bg-slate-800 px-6 py-2 rounded-full flex items-center gap-2">{nativeMode ? <><Zap className="w-4 h-4 text-green-400" /><span className="text-green-400 font-bold text-sm">Modo Nativo (Barras y QR)</span></> : <span className="text-yellow-400 font-bold text-sm">Modo Web (Solo QR)</span>}</div>
          </div>
      )}

      <div className="absolute top-4 left-4 flex items-center gap-4 opacity-80">
        <div className="flex items-center gap-2"><Scan className="w-6 h-6" /><span className="font-mono text-sm">GATEKEEPER v17.0</span></div>
      </div>

      {appState === STATE.WAITING && (
        <div className="text-center w-full max-w-md">
          <div className="flex bg-slate-800 p-1 rounded-full mb-6 shadow-lg border border-slate-700">
            <button onClick={() => setCurrentMode('ENTRADA')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-full font-bold transition-all ${currentMode === 'ENTRADA' ? 'bg-emerald-600 text-white scale-105' : 'text-slate-400'}`}><LogIn className="w-5 h-5" /> ENTRADA</button>
            <button onClick={() => setCurrentMode('SALIDA')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-full font-bold transition-all ${currentMode === 'SALIDA' ? 'bg-orange-600 text-white scale-105' : 'text-slate-400'}`}><LogOut className="w-5 h-5" /> SALIDA</button>
          </div>
          <div className="animate-pulse mb-8"><Scan className={`w-32 h-32 mx-auto mb-4 ${currentMode === 'ENTRADA' ? 'text-emerald-400' : 'text-orange-400'}`} /><h1 className="text-3xl font-bold mb-2">LISTO PARA {currentMode}</h1><p className="text-slate-400">Escanee Cédula, QR o Barras</p></div>
          <div className="flex flex-col gap-4 w-full max-w-xs mx-auto">
            <button onClick={() => { startCamera(); setShowCamera(true); }} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-4 rounded-xl font-bold flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all"><Camera className="w-6 h-6" /> ACTIVAR CÁMARA</button>
            <button onClick={() => setShowManualInput(true)} className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-4 rounded-xl font-bold flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all border border-slate-600"><Keyboard className="w-6 h-6" /> DIGITAR CÉDULA</button>
          </div>
          <div className="border-t border-slate-700 pt-6 mt-8"><button onClick={() => {setDashboardSearch(''); setAppState(STATE.DASHBOARD);}} className="text-slate-400 hover:text-white flex items-center justify-center gap-2 mx-auto text-sm font-bold px-4 py-2 rounded-lg hover:bg-slate-800 transition-all"><Grid className="w-4 h-4" /> PANEL DE CONTROL</button></div>
        </div>
      )}

      {appState === STATE.LOADING && (<div className="text-center"><Loader2 className="w-20 h-20 mx-auto animate-spin text-blue-500" /><p className="mt-4 text-xl">Cargando...</p></div>)}

      {/* DASHBOARD */}
      {appState === STATE.DASHBOARD && (
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl h-[80vh] flex flex-col">
              <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4"><h2 className="text-xl font-bold flex items-center gap-2 text-slate-200"><Grid className="w-6 h-6 text-blue-500" /> PANEL DE VIGILANTES</h2><button onClick={() => {setAppState(STATE.WAITING); setDashboardSearch(''); setCurrentUser(null);}} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm"><X className="w-4 h-4 inline mr-1" /> Cerrar</button></div>
              <div className="flex gap-2 mb-6"><div className="relative flex-1"><input type="number" autoFocus className="w-full bg-slate-800 border border-slate-600 rounded-xl py-3 px-4 text-white placeholder-slate-500 focus:border-blue-500 outline-none" placeholder="Buscar cédula..." value={dashboardSearch} onChange={(e) => setDashboardSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fetchUser(dashboardSearch, true)} /></div><button onClick={() => fetchUser(dashboardSearch, true)} className="bg-blue-600 hover:bg-blue-500 text-white px-6 rounded-xl font-bold">BUSCAR</button></div>
              <div className="flex-1 overflow-y-auto">
                  {currentUser ? (
                      <div className="animate-fadeIn">
                          <div className="flex items-center gap-4 bg-slate-800/50 p-4 rounded-xl mb-6 border border-slate-700">
                              <div className="w-16 h-16 bg-blue-900 rounded-full flex items-center justify-center text-2xl font-bold text-blue-200">{String(currentUser.nombre ? currentUser.nombre[0] : 'U')}</div>
                              <div className="flex-1"><h3 className="text-xl font-bold text-white">{String(currentUser.nombre)}</h3><p className="text-slate-400 font-mono">CC: {String(currentUser.cedula)}</p></div>
                              <button onClick={() => { setGeneratedCodeData({ id: currentUser.cedula, type: 'BARCODE' }); setAppState(STATE.SHOW_CODE); }} className="bg-emerald-900 hover:bg-emerald-800 text-emerald-200 px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 border border-emerald-700"><Barcode className="w-4 h-4" /> GENERAR BARRAS (PERSONAL)</button>
                          </div>
                          <h4 className="font-bold text-slate-400 mb-3 text-sm uppercase tracking-wider">Equipos Registrados</h4>
                          {currentAssets.map((asset, index) => (
                              <div key={index} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center">
                                  <div><p className="font-bold text-white">{String(asset.descripcion)}</p><p className="text-xs text-slate-500 font-mono">ID: {String(asset.id_activo)}</p></div>
                                  <button onClick={() => { setGeneratedCodeData({ id: asset.id_activo, type: 'QR' }); setAppState(STATE.SHOW_CODE); }} className="bg-blue-900 hover:bg-blue-800 text-blue-200 px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 border border-slate-600"><QrCode className="w-4 h-4" /> VER QR EQUIPO</button>
                              </div>
                          ))}
                          <button onClick={() => { setHasLaptop(true); setNewUserForm({ name: String(currentUser.nombre), assetDesc: '', assetId: '' }); setAppState(STATE.NEW_USER_MODE); }} className="w-full mt-6 py-3 border border-dashed border-slate-600 rounded-xl text-slate-400 hover:text-white hover:border-slate-400 hover:bg-slate-800 flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Registrar Nuevo Equipo</button>
                      </div>
                  ) : (<div className="h-full flex flex-col items-center justify-center text-slate-600"><p>Ingrese cédula para gestionar.</p></div>)}
              </div>
          </div>
      )}

      {/* ESTADO 2: USUARIO DETECTADO */}
      {appState === STATE.USER_DETECTED && currentUser && (
        <div className="w-full max-w-2xl bg-slate-800 rounded-2xl p-8 border border-slate-600 shadow-2xl">
          <div className="flex justify-between items-start border-b border-slate-700 pb-6 mb-6">
            <div className="flex items-center gap-6">
                <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-3xl font-bold uppercase">{String(currentUser.nombre ? currentUser.nombre[0] : 'U')}</div>
                <div><h2 className="text-3xl font-bold text-white">{String(currentUser.nombre)}</h2><p className="text-slate-400 font-mono text-lg">ID: {String(currentUser.cedula)}</p><span className={`inline-block px-3 py-1 rounded-full text-sm font-bold mt-2 ${currentUser.estado === 'ACTIVO' ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'}`}>{String(currentUser.estado)}</span></div>
            </div>
            <div className={`px-4 py-2 rounded-lg font-bold text-sm border ${currentMode === 'ENTRADA' ? 'bg-emerald-900/50 text-emerald-400 border-emerald-500' : 'bg-orange-900/50 text-orange-400 border-orange-500'}`}>{currentMode}</div>
          </div>
          <div className="space-y-6 text-center">
            <h3 className="text-xl font-bold text-white">¿El usuario trae equipo?</h3>
            <div className="bg-slate-700/50 p-6 rounded-xl border border-slate-600">
                <Laptop className="w-10 h-10 mx-auto text-cyan-400 mb-2" /><p className="text-cyan-3d00 font-bold mb-4">SÍ TRAE PORTÁTIL</p>
                <button onClick={() => { startCamera(); setShowCamera(true); }} className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-3 rounded-lg font-bold flex items-center justify-center gap-2 mx-auto border border-slate-500"><Camera className="w-5 h-5" /> ESCANEAR QR/BARRAS</button>
            </div>
            <button onClick={handleManualEntry} className="w-full py-4 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-slate-200 flex items-center justify-center gap-2 border border-slate-500"><UserCheck className="w-5 h-5" /> ENTRADA PEATONAL (SIN EQUIPO)</button>
          </div>
        </div>
      )}

      {/* REGISTRO NUEVO */}
      {appState === STATE.NEW_USER_MODE && (
        <div className="w-full max-w-lg bg-slate-800 rounded-2xl p-8 border-2 border-yellow-500 shadow-2xl">
          <div className="text-center mb-6"><User className="w-16 h-16 mx-auto text-yellow-500 mb-2" /><h2 className="text-2xl font-bold text-white">REGISTRO INICIAL</h2>
            <div className="flex items-center justify-center gap-2 mt-4 bg-slate-900/50 p-2 rounded-lg border border-slate-700"><span className="text-slate-400 text-sm font-bold">CÉDULA:</span><input type="number" className="bg-transparent text-yellow-400 font-mono text-lg font-bold text-center outline-none w-40 border-b border-slate-600 focus:border-yellow-500" value={currentUser?.cedula || ''} onChange={(e) => setCurrentUser({...currentUser, cedula: e.target.value})} /></div>
          </div>
          <div className="space-y-4">
            <div><label className="block text-sm text-slate-400 mb-1">Nombre Completo</label><input type="text" autoFocus className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-white focus:border-yellow-500 outline-none" placeholder="Escriba nombre..." value={newUserForm.name} onChange={e => setNewUserForm({...newUserForm, name: e.target.value})} /></div>
            <div className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-lg border border-slate-600 cursor-pointer" onClick={() => setHasLaptop(!hasLaptop)}><div className={`w-6 h-6 rounded border flex items-center justify-center ${hasLaptop ? 'bg-yellow-500 border-yellow-500' : 'border-slate-400'}`}>{hasLaptop && <CheckCircle className="w-4 h-4 text-black" />}</div><span className="text-sm font-bold text-white">¿Registrar Portátil?</span></div>
            {hasLaptop ? (
                <>
                    <div className="p-4 bg-slate-700/50 rounded-lg border border-slate-600"><label className="block text-sm text-yellow-400 font-bold mb-2 uppercase flex items-center gap-2"><QrCode className="w-4 h-4" /> SERIAL / ID DEL EQUIPO</label><input type="text" className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-white font-mono text-center focus:border-yellow-500 outline-none" placeholder="Ej: SN-554422" value={newUserForm.assetId} onChange={e => setNewUserForm({...newUserForm, assetId: e.target.value})} /></div>
                    <div><label className="block text-sm text-slate-400 mb-1">Descripción (Marca/Color)</label><input type="text" className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-white" placeholder="Ej: HP Pavilion Azul" value={newUserForm.assetDesc} onChange={e => setNewUserForm({...newUserForm, assetDesc: e.target.value})} /></div>
                </>
            ) : null}
            <button onClick={registerNewUserAndAsset} className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-4 rounded-lg mt-4 flex items-center justify-center gap-2"><Plus className="w-5 h-5" /> GUARDAR Y GENERAR</button>
            <button onClick={() => setAppState(STATE.WAITING)} className="w-full text-slate-500 text-sm mt-2 hover:text-white">Cancelar</button>
          </div>
        </div>
      )}

      {/* PANTALLA DE ENTREGA DE CÓDIGO */}
      {appState === STATE.SHOW_CODE && generatedCodeData && (
        <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl text-center text-slate-800 animate-bounce-slow printable-area">
            <h2 className="text-3xl font-black mb-2 text-slate-900">¡CÓDIGO LISTO!</h2>
            <p className="text-slate-500 mb-4">
                Escanee este QR para descargar su {generatedCodeData.type === 'QR' ? 'pase de equipo.' : 'pase personal de barras.'}
            </p>
            
            <div className="bg-white p-4 border-4 border-slate-900 rounded-xl inline-block mb-4 shadow-lg min-w-[250px]">
                {/* ESTO ES EL QR QUE LLEVA A LA IMAGEN FINAL */}
                <img 
                    src={screenQrUrl} 
                    alt="QR Maestro" 
                    className="w-56 h-56"
                />
            </div>
            
            <div className="bg-slate-100 p-3 rounded-lg mb-6">
                <p className="text-xs text-slate-500 uppercase font-bold">{generatedCodeData.type === 'QR' ? 'SERIAL EQUIPO' : 'CÉDULA USUARIO'}</p>
                <p className="text-xl font-mono font-bold text-slate-800">{generatedCodeData.id}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 no-print">
                <button onClick={handleDownloadCode} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2"><Download className="w-5 h-5" /> DESCARGAR</button>
                <button onClick={handlePrint} className="w-full bg-slate-700 text-white font-bold py-3 rounded-xl hover:bg-slate-800 flex items-center justify-center gap-2"><FileText className="w-5 h-5" /> PDF</button>
            </div>
            <button onClick={() => showFeedback('success', 'Proceso finalizado.')} className="w-full mt-4 text-slate-400 font-bold py-3 hover:text-slate-600 flex items-center justify-center gap-2 no-print"><ArrowRight className="w-5 h-5" /> CERRAR</button>
        </div>
      )}

      {/* FEEDBACK */}
      {appState === STATE.RESULT && (
        <div className={`text-center p-12 rounded-3xl shadow-2xl transform scale-110 transition-all ${feedback.type === 'success' ? 'bg-emerald-600' : feedback.type === 'alarm' ? 'bg-red-600 animate-pulse' : 'bg-slate-700'}`}>
          {feedback.type === 'success' && <CheckCircle className="w-32 h-32 mx-auto mb-4 text-white" />}
          {feedback.type === 'alarm' && <AlertTriangle className="w-32 h-32 mx-auto mb-4 text-white" />}
          {feedback.type === 'error' && <XCircle className="w-32 h-32 mx-auto mb-4 text-white" />}
          <h2 className="text-4xl font-black text-white uppercase">{feedback.type === 'alarm' ? 'ALERTA' : feedback.type === 'success' ? 'AUTORIZADO' : 'ERROR'}</h2>
          <p className="text-xl text-white/90 mt-4 font-bold">{feedback.msg}</p>
        </div>
      )}
    </div>
  );
}
