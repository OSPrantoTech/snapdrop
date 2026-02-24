import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Download, Zap, Shield, Wifi, Share2, X, File as FileIcon, CheckCircle2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { QRCodeSVG } from 'qrcode.react';
import { WebRTCManager, FileMetadata, TransferProgress } from './lib/webrtc';
import { formatBytes, formatTime, cn } from './lib/utils';

type ViewState = 'home' | 'send' | 'receive' | 'transfer';

export default function App() {
  const [view, setView] = useState<ViewState>('home');
  const [sessionId, setSessionId] = useState('');
  const [webrtc, setWebrtc] = useState<WebRTCManager | null>(null);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'failed'>('disconnected');
  
  // Sender state
  const [filesToTransfer, setFilesToTransfer] = useState<{ file: File, id: string }[]>([]);
  
  // Receiver state
  const [incomingMetadata, setIncomingMetadata] = useState<FileMetadata[]>([]);
  const [receivedFiles, setReceivedFiles] = useState<{ id: string, blob: Blob }[]>([]);
  
  // Shared state
  const [progress, setProgress] = useState<Record<string, TransferProgress>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const session = params.get('session');
    if (session && session.length === 8) {
      handleJoinSession(session.toLowerCase());
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleStartSend = () => {
    const id = uuidv4().slice(0, 8);
    setSessionId(id);
    const manager = new WebRTCManager(id, true);
    setupManager(manager);
    setWebrtc(manager);
    setView('send');
  };

  const handleStartReceive = () => {
    setView('receive');
  };

  const handleJoinSession = (id: string) => {
    setSessionId(id);
    const manager = new WebRTCManager(id, false);
    setupManager(manager);
    setWebrtc(manager);
    setView('transfer');
  };

  const setupManager = (manager: WebRTCManager) => {
    manager.onStateChange = (state) => {
      setConnectionState(state);
      if (state === 'connected' && !manager.isInitiator) {
        setView('transfer');
      }
    };

    manager.onMetadataReceived = (metadata) => {
      setIncomingMetadata(metadata);
    };

    manager.onFileProgress = (p) => {
      setProgress(prev => ({ ...prev, [p.fileId]: p }));
    };

    manager.onFileComplete = (fileId, blob) => {
      setReceivedFiles(prev => [...prev, { id: fileId, blob }]);
      
      // Auto download
      const metadata = incomingMetadata.find(m => m.id === fileId);
      if (metadata) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = metadata.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    };
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map(file => ({ file, id: uuidv4() }));
      setFilesToTransfer(prev => [...prev, ...newFiles]);
    }
  };

  const startTransfer = async () => {
    if (!webrtc || filesToTransfer.length === 0) return;
    
    const metadata: FileMetadata[] = filesToTransfer.map(({ file, id }) => ({
      id,
      name: file.name,
      size: file.size,
      type: file.type
    }));
    
    webrtc.sendMetadata(metadata);
    
    for (let i = 0; i < filesToTransfer.length; i++) {
      await webrtc.sendFile(filesToTransfer[i].file, filesToTransfer[i].id);
    }
  };

  const cancelSession = () => {
    webrtc?.disconnect();
    setWebrtc(null);
    setSessionId('');
    setFilesToTransfer([]);
    setIncomingMetadata([]);
    setReceivedFiles([]);
    setProgress({});
    setConnectionState('disconnected');
    setView('home');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-indigo-500/30 overflow-hidden relative">
      {/* Background Gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] opacity-20 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-500 to-transparent blur-3xl rounded-full mix-blend-screen" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-4 sm:px-6 py-3 border-b border-white/5">
        <div className="flex items-center gap-2 cursor-pointer" onClick={cancelSession}>
          <Zap className="w-6 h-6 text-indigo-400" />
          <span className="text-lg sm:text-xl font-semibold tracking-tight">SnapDrop Pro</span>
        </div>
        <div className="flex items-center gap-4 text-sm text-zinc-400">
          <div className="flex items-center gap-1">
            <Shield className="w-4 h-4" />
            <span className="hidden sm:inline">E2E Encrypted</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 min-h-[calc(100vh-61px)] flex flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center text-center w-full max-w-2xl"
            >
              <h1 className="text-4xl text-center sm:text-6xl font-bold tracking-tight mb-6 bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent">
                Transfer files instantly.
                <br /> No limits.
              </h1>
              <p className="text-lg text-zinc-400 mb-12 max-w-lg">
                Secure, peer-to-peer file sharing directly between devices. 
                No servers, no size limits, blazing fast speeds.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
                <button
                  onClick={handleStartSend}
                  className="group relative flex flex-col items-center justify-center gap-4 p-8 rounded-3xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                    <Send className="w-8 h-8" />
                  </div>
                  <div className="text-xl font-medium">Send Files</div>
                </button>

                <button
                  onClick={handleStartReceive}
                  className="group relative flex flex-col items-center justify-center gap-4 p-8 rounded-3xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                    <Download className="w-8 h-8" />
                  </div>
                  <div className="text-xl font-medium">Receive Files</div>
                </button>
              </div>
            </motion.div>
          )}

          {view === 'send' && (
            <motion.div
              key="send"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-4xl bg-white/5 border border-white/10 rounded-3xl p-4 sm:p-8 backdrop-blur-xl"
            >
              <div className="flex justify-between items-start mb-8">
                <h2 className="text-2xl font-semibold">Send Files</h2>
                <button onClick={cancelSession} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                {/* Left Column: Connection Info */}
                <div className="flex flex-col items-center justify-center gap-6 border-r-0 md:border-r border-white/10 md:pr-8 min-h-[400px]">
                  <AnimatePresence mode="wait">
                    {connectionState !== 'connected' ? (
                      <motion.div
                        key="waiting"
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="flex flex-col items-center gap-6 w-full"
                      >
                        <div className="bg-white p-4 rounded-2xl">
                          <QRCodeSVG 
                            value={`${window.location.origin}?session=${sessionId}`} 
                            size={180}
                            level="H"
                          />
                        </div>
                        
                        <div className="text-center">
                          <p className="text-sm text-zinc-400 mb-2">Session ID</p>
                          <div className="text-3xl sm:text-4xl font-mono font-bold tracking-widest text-indigo-400">
                            {sessionId}
                          </div>
                        </div>

                        <p className="text-sm text-zinc-500 text-center">
                          Scan the QR code or share the Session ID with the receiving device.
                        </p>

                        <div className="flex items-center gap-2 text-sm text-yellow-500/80 bg-yellow-500/10 px-4 py-2 rounded-full">
                          <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                          Waiting for receiver...
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="connected"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-center justify-center gap-6 w-full h-full text-center"
                      >
                        <div className="w-24 h-24 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                          <Wifi className="w-12 h-12" />
                        </div>
                        <h3 className="text-2xl font-semibold">Connected!</h3>
                        <p className="text-zinc-400">You can now start the transfer.</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Right Column: File Selection */}
                <div className="flex flex-col space-y-4">
                    <div 
                    className="bg-black/20 border border-white/10 rounded-2xl p-4 backdrop-blur-xl border-dashed relative overflow-hidden group flex-grow flex flex-col"
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.dataTransfer.files) {
                        const newFiles = Array.from(e.dataTransfer.files).map(file => ({ file, id: uuidv4() }));
                        setFilesToTransfer(prev => [...prev, ...newFiles]);
                        }
                    }}
                    >
                    <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    <input
                        type="file"
                        multiple
                        onChange={handleFileSelect}
                        className="hidden"
                        id="file-upload"
                    />
                    
                    {filesToTransfer.length === 0 ? (
                        <label htmlFor="file-upload" className="flex flex-col items-center justify-center cursor-pointer text-center h-48">
                            <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3 group-hover:scale-110 transition-transform">
                                <Share2 className="w-6 h-6" />
                            </div>
                            <span className="text-md font-medium mb-1">Select files</span>
                            <span className="text-xs text-zinc-500">or drag and drop</span>
                        </label>
                    ) : (
                        <div className="flex flex-col h-full">
                            <div className="space-y-3 overflow-y-auto pr-2 flex-grow max-h-[250px] sm:max-h-none">
                                {filesToTransfer.map(({ file, id }) => {
                                    const p = progress[id];
                                    const isComplete = p && p.bytesTransferred === p.totalBytes;
                                    const percent = p ? (p.bytesTransferred / p.totalBytes) * 100 : 0;

                                    return (
                                    <div key={id} className="p-3 bg-black/30 rounded-lg border border-white/5">
                                        <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-3 min-w-0">
                                            {isComplete ? (
                                            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                                            ) : (
                                            <FileIcon className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                                            )}
                                            <span className="text-sm font-medium truncate">{file.name}</span>
                                        </div>
                                        <span className="text-xs text-zinc-500 flex-shrink-0 ml-2">{formatBytes(file.size)}</span>
                                        </div>
                                        
                                        {p && !isComplete && (
                                        <div className="mt-2">
                                            <div className="flex justify-between text-xs text-zinc-400 mb-1">
                                            <span>{formatBytes(p.speed)}/s</span>
                                            <span>{formatTime(p.eta)}</span>
                                            </div>
                                            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                            <motion.div 
                                                className="h-full bg-indigo-500"
                                                initial={{ width: 0 }}
                                                animate={{ width: `${percent}%` }}
                                                transition={{ duration: 0.1 }}
                                            />
                                            </div>
                                        </div>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>
                            <label htmlFor="file-upload" className="mt-4 text-center text-sm text-indigo-400 hover:text-indigo-300 cursor-pointer font-medium py-2">
                                Add more files...
                            </label>
                        </div>
                    )}
                    </div>

                    <button 
                    onClick={startTransfer}
                    disabled={connectionState !== 'connected' || filesToTransfer.length === 0}
                    className="w-full px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                    <Send className="w-5 h-5" />
                    <span>Start Transfer</span>
                    </button>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'receive' && (
            <motion.div
              key="receive"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-semibold">Join Session</h2>
                <button onClick={cancelSession} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-col gap-6">
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Enter Session ID</label>
                  <input
                    type="text"
                    maxLength={8}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-xl sm:text-2xl font-mono text-center uppercase tracking-widest focus:outline-none focus:border-indigo-500 transition-colors"
                    placeholder="XXXXXXXX"
                    onChange={(e) => {
                      if (e.target.value.length === 8) {
                        handleJoinSession(e.target.value.toLowerCase());
                      }
                    }}
                  />
                </div>

                <div className="relative flex items-center py-4">
                  <div className="flex-grow border-t border-white/10"></div>
                  <span className="flex-shrink-0 mx-4 text-zinc-500 text-sm">OR</span>
                  <div className="flex-grow border-t border-white/10"></div>
                </div>

                <p className="text-sm text-zinc-500 text-center">
                  Open the link shared by the sender to connect automatically.
                </p>
              </div>
            </motion.div>
          )}

          {view === 'transfer' && (
            <motion.div
              key="transfer"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-3xl"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-3xl font-semibold mb-2">Receiving Files</h2>
                  <div className="flex items-center gap-2 text-emerald-400 text-sm">
                    <Wifi className="w-4 h-4" />
                    <span>Direct P2P Connection Established</span>
                  </div>
                </div>
                <button onClick={cancelSession} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-colors text-sm">
                  Disconnect
                </button>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl">
                <h3 className="text-xl font-medium mb-6">Incoming Files</h3>
                {incomingMetadata.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500">
                    Waiting for sender to select files...
                  </div>
                ) : (
                  <div className="space-y-4">
                    {incomingMetadata.map(file => {
                      const p = progress[file.id];
                      const isComplete = receivedFiles.some(r => r.id === file.id);
                      const percent = p ? (p.bytesTransferred / p.totalBytes) * 100 : 0;

                      return (
                        <div key={file.id} className="p-4 bg-black/30 rounded-xl border border-white/5">
                          <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-3">
                              {isComplete ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                              ) : (
                                <FileIcon className="w-5 h-5 text-indigo-400" />
                              )}
                              <span className="font-medium truncate max-w-[200px] sm:max-w-xs">{file.name}</span>
                            </div>
                            <span className="text-sm text-zinc-500">{formatBytes(file.size)}</span>
                          </div>
                          
                          {p && !isComplete && (
                            <div className="mt-4">
                              <div className="flex justify-between text-xs text-zinc-400 mb-2">
                                <span>{formatBytes(p.speed)}/s</span>
                                <span>{formatTime(p.eta)} remaining</span>
                              </div>
                              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                                <motion.div 
                                  className="h-full bg-indigo-500"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${percent}%` }}
                                  transition={{ duration: 0.1 }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

