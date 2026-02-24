import { io, Socket } from 'socket.io-client';

export type PeerConnectionState = 'disconnected' | 'connecting' | 'connected' | 'failed';

export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface ChunkMessage {
  type: 'chunk';
  fileId: string;
  chunkIndex: number;
  totalChunks: number;
  data: ArrayBuffer;
}

export interface MetadataMessage {
  type: 'metadata';
  files: FileMetadata[];
}

export interface TransferProgress {
  fileId: string;
  bytesTransferred: number;
  totalBytes: number;
  speed: number; // bytes per second
  eta: number; // seconds
}

export class WebRTCManager {
  private socket: Socket;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private roomId: string;
  public isInitiator: boolean;
  private targetSocketId: string | null = null;

  public onStateChange?: (state: PeerConnectionState) => void;
  public onMetadataReceived?: (files: FileMetadata[]) => void;
  public onFileProgress?: (progress: TransferProgress) => void;
  public onFileComplete?: (fileId: string, blob: Blob) => void;

  private receivedChunks: Map<string, ArrayBuffer[]> = new Map();
  private receivedBytes: Map<string, number> = new Map();
  private startTime: Map<string, number> = new Map();

  constructor(roomId: string, isInitiator: boolean) {
    this.roomId = roomId;
    this.isInitiator = isInitiator;
    
    // Connect to the signaling server
    this.socket = io({
      path: '/socket.io',
    });

    this.setupSocketListeners();
  }

  private setupSocketListeners() {
    this.socket.on('connect', () => {
      console.log('Connected to signaling server', this.socket.id);
      this.socket.emit('join-room', this.roomId);
      
      if (this.isInitiator) {
        // Wait for someone to join
      } else {
        // We just joined, we should initiate the connection to the existing user
        // Actually, the existing user (initiator) will receive 'user-joined' and create the offer.
      }
    });

    this.socket.on('user-joined', async (socketId: string) => {
      console.log('User joined:', socketId);
      if (this.isInitiator) {
        this.targetSocketId = socketId;
        await this.createPeerConnection();
        await this.createOffer();
      }
    });

    this.socket.on('offer', async (payload: { sdp: RTCSessionDescriptionInit, caller: string }) => {
      console.log('Received offer from', payload.caller);
      if (!this.isInitiator) {
        this.targetSocketId = payload.caller;
        await this.createPeerConnection();
        await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        await this.createAnswer();
      }
    });

    this.socket.on('answer', async (payload: { sdp: RTCSessionDescriptionInit, answerer: string }) => {
      console.log('Received answer from', payload.answerer);
      if (this.isInitiator && this.peerConnection) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      }
    });

    this.socket.on('ice-candidate', async (payload: { candidate: RTCIceCandidateInit, sender: string }) => {
      if (this.peerConnection) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (e) {
          console.error('Error adding received ice candidate', e);
        }
      }
    });
  }

  private async createPeerConnection() {
    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    this.peerConnection = new RTCPeerConnection(configuration);

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.targetSocketId) {
        this.socket.emit('ice-candidate', {
          target: this.targetSocketId,
          candidate: event.candidate
        });
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', this.peerConnection?.connectionState);
      const state = this.peerConnection?.connectionState;
      if (state === 'connected') {
        this.onStateChange?.('connected');
      } else if (state === 'disconnected' || state === 'failed') {
        this.onStateChange?.('disconnected');
      }
    };

    if (this.isInitiator) {
      this.dataChannel = this.peerConnection.createDataChannel('fileTransfer', {
        ordered: true
      });
      this.setupDataChannel();
    } else {
      this.peerConnection.ondatachannel = (event) => {
        this.dataChannel = event.channel;
        this.setupDataChannel();
      };
    }
  }

  private setupDataChannel() {
    if (!this.dataChannel) return;
    
    this.dataChannel.binaryType = 'arraybuffer';
    
    this.dataChannel.onopen = () => {
      console.log('Data channel open');
      this.onStateChange?.('connected');
    };

    this.dataChannel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        const message = JSON.parse(event.data);
        if (message.type === 'metadata') {
          this.onMetadataReceived?.(message.files);
        }
      } else if (event.data instanceof ArrayBuffer) {
        this.handleChunk(event.data);
      }
    };
  }

  private async createOffer() {
    if (!this.peerConnection || !this.targetSocketId) return;
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    this.socket.emit('offer', {
      target: this.targetSocketId,
      sdp: offer
    });
  }

  private async createAnswer() {
    if (!this.peerConnection || !this.targetSocketId) return;
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    this.socket.emit('answer', {
      target: this.targetSocketId,
      sdp: answer
    });
  }

  public sendMetadata(files: FileMetadata[]) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({ type: 'metadata', files }));
    }
  }

  public async sendFile(file: File, fileId: string) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') return;

    const chunkSize = 64 * 1024; // 64KB
    const totalChunks = Math.ceil(file.size / chunkSize);
    let offset = 0;
    let chunkIndex = 0;

    const startTime = Date.now();

    const readNextChunk = () => {
      return new Promise<void>((resolve, reject) => {
        if (!this.dataChannel) return reject();
        
        // Flow control
        if (this.dataChannel.bufferedAmount > 1024 * 1024 * 4) { // 4MB buffer
          setTimeout(() => {
            readNextChunk().then(resolve).catch(reject);
          }, 50);
          return;
        }

        const slice = file.slice(offset, offset + chunkSize);
        const reader = new FileReader();
        
        reader.onload = (e) => {
          if (!e.target?.result || !this.dataChannel) return reject();
          
          const data = e.target.result as ArrayBuffer;
          
          // Create a header for the chunk (fileId length, fileId, chunkIndex, totalChunks)
          // To keep it simple, we can send a JSON message followed by the binary data,
          // OR we can pack it into a single ArrayBuffer.
          // Let's pack it: 
          // [36 bytes UUID string] [4 bytes chunkIndex] [4 bytes totalChunks] [Data]
          
          const encoder = new TextEncoder();
          const idBytes = encoder.encode(fileId.padEnd(36, ' ')); // Ensure exactly 36 bytes
          
          const header = new ArrayBuffer(44); // 36 + 4 + 4
          const headerView = new DataView(header);
          new Uint8Array(header).set(idBytes, 0);
          headerView.setUint32(36, chunkIndex, true);
          headerView.setUint32(40, totalChunks, true);
          
          const combined = new Uint8Array(header.byteLength + data.byteLength);
          combined.set(new Uint8Array(header), 0);
          combined.set(new Uint8Array(data), header.byteLength);
          
          this.dataChannel.send(combined.buffer);
          
          offset += chunkSize;
          chunkIndex++;
          
          // Update progress
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = offset / elapsed;
          const eta = (file.size - offset) / speed;
          
          this.onFileProgress?.({
            fileId,
            bytesTransferred: offset,
            totalBytes: file.size,
            speed,
            eta
          });

          if (offset < file.size) {
            readNextChunk().then(resolve).catch(reject);
          } else {
            // Mark as complete for sender
            this.onFileProgress?.({
              fileId,
              bytesTransferred: file.size,
              totalBytes: file.size,
              speed: 0,
              eta: 0
            });
            resolve();
          }
        };
        
        reader.onerror = reject;
        reader.readAsArrayBuffer(slice);
      });
    };

    await readNextChunk();
  }

  private handleChunk(buffer: ArrayBuffer) {
    // Parse header
    const headerView = new DataView(buffer, 0, 44);
    const idBytes = new Uint8Array(buffer, 0, 36);
    const decoder = new TextDecoder();
    const fileId = decoder.decode(idBytes).trim();
    
    const chunkIndex = headerView.getUint32(36, true);
    const totalChunks = headerView.getUint32(40, true);
    
    const data = buffer.slice(44);
    
    if (!this.receivedChunks.has(fileId)) {
      this.receivedChunks.set(fileId, []);
      this.receivedBytes.set(fileId, 0);
      this.startTime.set(fileId, Date.now());
    }
    
    const chunks = this.receivedChunks.get(fileId)!;
    chunks[chunkIndex] = data;
    
    const currentBytes = this.receivedBytes.get(fileId)! + data.byteLength;
    this.receivedBytes.set(fileId, currentBytes);
    
    const elapsed = (Date.now() - this.startTime.get(fileId)!) / 1000;
    const speed = currentBytes / elapsed;
    const totalBytes = currentBytes * (totalChunks / (chunkIndex + 1)); // Estimate
    const eta = (totalBytes - currentBytes) / speed;
    
    this.onFileProgress?.({
      fileId,
      bytesTransferred: currentBytes,
      totalBytes,
      speed,
      eta
    });
    
    // Check if complete
    if (chunks.filter(Boolean).length === totalChunks) {
      const blob = new Blob(chunks);
      this.onFileComplete?.(fileId, blob);
      
      // Cleanup
      this.receivedChunks.delete(fileId);
      this.receivedBytes.delete(fileId);
      this.startTime.delete(fileId);
    }
  }

  public disconnect() {
    if (this.dataChannel) this.dataChannel.close();
    if (this.peerConnection) this.peerConnection.close();
    if (this.socket) this.socket.disconnect();
  }
}
