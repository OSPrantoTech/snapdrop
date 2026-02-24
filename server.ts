import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Server } from 'socket.io';
import http from 'http';

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  const PORT = 3000;

  // Socket.io Signaling Logic
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (roomId) => {
      socket.join(roomId);
      console.log(`Socket ${socket.id} joined room ${roomId}`);
      // Notify others in the room
      socket.to(roomId).emit('user-joined', socket.id);
    });

    socket.on('offer', (payload) => {
      io.to(payload.target).emit('offer', {
        sdp: payload.sdp,
        caller: socket.id
      });
    });

    socket.on('answer', (payload) => {
      io.to(payload.target).emit('answer', {
        sdp: payload.sdp,
        answerer: socket.id
      });
    });

    socket.on('ice-candidate', (payload) => {
      io.to(payload.target).emit('ice-candidate', {
        candidate: payload.candidate,
        sender: socket.id
      });
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      // Optional: notify rooms the user was in
    });
  });

  // API routes FIRST
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
