const express = require('express');
const expressFileUpload = require('express-fileupload');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

// Routerlar
const authRouter = require('./src/Router/authRouter');
const adminRouter = require('./src/Router/adminRouter');
const postRouter = require('./src/Router/postRouter');
const userRouter = require('./src/Router/userRouter');
const commentRouter = require('./src/Router/commentRouter');
const notificationRouter = require('./src/Router/notlificationRouter');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  },
});

// Socket global
global._io = io;
const onlineUsers = new Map();
global.onlineUsers = onlineUsers;

// Fayl upload va JSON parser
app.use(expressFileUpload({ useTempFiles: true, tempFileDir: '/tmp/' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}));

// Statik fayl (agar kerak bo‘lsa)
app.use(express.static(path.join(__dirname, 'public')));

// ROUTERLAR
app.use('/api', authRouter);
app.use('/api/user', userRouter);
app.use('/api/admin', adminRouter);
app.use('/api/post', postRouter);
app.use('/api/comment', commentRouter);
app.use('/api/notifications', notificationRouter);

// SOCKET IO
io.on('connection', (socket) => {
  socket.on('join', (userId) => {
    if (userId) {
      socket.join(userId.toString());
      onlineUsers.set(userId.toString(), socket.id);
    }
  });
  socket.on('notificationRead', (data) => {
    const { notificationId, userId } = data;
    io.to(userId.toString()).emit('notificationUpdated', {
      notificationId,
      isRead: true,
    });
  });
  socket.on('disconnect', () => {
    for (let [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }
  });
});

// MONGO
const MONGO_URL = process.env.MONGO_URL;
const PORT = process.env.PORT || 4000;

mongoose
  .connect(MONGO_URL)
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on port: ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB ulanish xatosi:', error.message);
    process.exit(1);
  });

// UNIVERSAL ERROR HANDLER (eng oxirida)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Serverda xato yuz berdi' });
});