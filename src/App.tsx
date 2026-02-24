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
      if (state === 'connected') {
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

      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-2 cursor-pointer" onClick={cancelSession}>
          <Zap className="w-6 h-6 text-indigo-400" />
          <span className="text-xl font-semibold tracking-tight">SnapDrop Pro</span>
        </div>
        <div className="flex items-center gap-4 text-sm text-zinc-400">
          <div className="flex items-center gap-1">
            <Shield className="w-4 h-4" />
            <span>E2E Encrypted</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-6 py-12 min-h-[calc(100vh-73px)] flex flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center text-center w-full max-w-2xl"
            >
              <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6 bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent">
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
              className="w-full max-w-md bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-semibold">Share Session</h2>
                <button onClick={cancelSession} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-col items-center gap-6">
                <div className="bg-white p-4 rounded-2xl">
                  <QRCodeSVG 
                    value={`${window.location.origin}?session=${sessionId}`} 
                    size={200}
                    level="H"
                  />
                </div>
                
                <div className="text-center">
                  <p className="text-sm text-zinc-400 mb-2">Session ID</p>
                  <div className="text-4xl font-mono font-bold tracking-widest text-indigo-400">
                    {sessionId}
                  </div>
                </div>

                <p className="text-sm text-zinc-500 text-center">
                  Scan the QR code or enter the Session ID on the receiving device to connect.
                </p>

                <div className="flex items-center gap-2 text-sm text-yellow-500/80 bg-yellow-500/10 px-4 py-2 rounded-full">
                  <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                  Waiting for receiver...
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
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-4 text-2xl font-mono text-center uppercase tracking-widest focus:outline-none focus:border-indigo-500 transition-colors"
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
                  <h2 className="text-3xl font-semibold mb-2">Connected</h2>
                  <div className="flex items-center gap-2 text-emerald-400 text-sm">
                    <Wifi className="w-4 h-4" />
                    <span>Direct P2P Connection Established</span>
                  </div>
                </div>
                <button onClick={cancelSession} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-colors text-sm">
                  Disconnect
                </button>
              </div>

              {webrtc && (webrtc as any).isInitiator ? (
                <div className="space-y-6">
                  <div 
                    className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl border-dashed relative overflow-hidden group"
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
                    <label htmlFor="file-upload" className="flex flex-col items-center justify-center cursor-pointer py-8">
                      <div className="w-16 h-16 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 group-hover:scale-110 transition-transform">
                        <Share2 className="w-8 h-8" />
                      </div>
                      <span className="text-xl font-medium mb-2">Select files to send</span>
                      <span className="text-sm text-zinc-500">or drag and drop them here</span>
                    </label>
                  </div>

                  {filesToTransfer.length > 0 && (
                    <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-medium">Selected Files ({filesToTransfer.length})</h3>
                        <button 
                          onClick={startTransfer}
                          className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full font-medium transition-colors"
                        >
                          Start Transfer
                        </button>
                      </div>
                      <div className="space-y-3">
                        {filesToTransfer.map(({ file, id }) => {
                          const p = progress[id];
                          const isComplete = p && p.bytesTransferred === p.totalBytes;
                          const percent = p ? (p.bytesTransferred / p.totalBytes) * 100 : 0;

                          return (
                            <div key={id} className="p-4 bg-black/30 rounded-xl border border-white/5">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  {isComplete ? (
                                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                  ) : (
                                    <FileIcon className="w-5 h-5 text-zinc-400" />
                                  )}
                                  <span className="font-medium">{file.name}</span>
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
                    </div>
                  )}
                </div>
              ) : (
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
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

