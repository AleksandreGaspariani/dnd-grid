const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const compression = require('compression'); // For Express compression
const zlib = require('zlib'); // For data compression
const rateLimit = require('express-rate-limit'); // Rate limiting

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    maxHttpBufferSize: 1e6, // Limit payload size to 1MB
    pingTimeout: 20000,
    pingInterval: 25000
});

// Middleware
app.use(compression()); // Compress static files
app.use(express.static('../client', { maxAge: '1d' })); // Cache static files
app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // Limit each IP to 100 requests
}));

const availableEmojis = ['🤖', '🧙‍♂️', '🥷', '🐺', '😺'];
const users = {};
let gridSize = { width: 20, height: 20 };
let backgroundImageUrl = '';

// Compress data before emitting
const compressData = (data) => {
    return new Promise((resolve) => {
        zlib.deflate(JSON.stringify(data), (err, buffer) => {
            if (!err) resolve(buffer);
            else resolve(JSON.stringify(data)); // Fallback
        });
    });
};

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Send initial data with compression
    Promise.all([
        compressData(availableEmojis),
        compressData(gridSize),
        compressData(backgroundImageUrl)
    ]).then(([emojiBuffer, gridBuffer, bgBuffer]) => {
        socket.emit('emojiList', emojiBuffer);
        socket.emit('gridSizeUpdate', gridBuffer);
        socket.emit('backgroundImageUpdate', bgBuffer);
    });

    socket.on('pickUser', ({ name, emoji, image }) => {
        if (emoji && availableEmojis.includes(emoji) && !Object.values(users).some(u => u.emoji === emoji)) {
            users[socket.id] = { name, emoji, x: 0, y: 0, lastMove: 0 };
        } else if (image) {
            users[socket.id] = { name, image, x: 0, y: 0, lastMove: 0 };
        } else {
            socket.emit('emojiError', 'Emoji already taken or invalid');
            return;
        }
        compressData(users).then(buffer => io.emit('usersUpdate', buffer));
    });

    socket.on('joinAsGuest', () => {
        console.log(`Guest user connected: ${socket.id}`);
    });

    socket.on('chatMessage', (msg) => {
        if (users[socket.id]) {
            const messageWithUser = `${users[socket.id].name}: ${msg}`;
            io.emit('chatMessage', messageWithUser);
        }
    });

    // Rate-limited movement
    socket.on('move', (position) => {
        if (users[socket.id]) {
            const user = users[socket.id];
            const now = Date.now();
            if (now - user.lastMove < 100) return; // 100ms cooldown
            user.lastMove = now;

            const dx = Math.abs(position.x - user.x);
            const dy = Math.abs(position.y - user.y);
            const isWithinRange = (dx + dy) <= 6;
            const isOccupied = Object.values(users).some(u => u.x === position.x && u.y === position.y && u !== user);

            if (isWithinRange && !isOccupied) {
                user.x = position.x;
                user.y = position.y;
                compressData(users).then(buffer => io.emit('usersUpdate', buffer));
            }
        }
    });

    socket.on('updateGridSize', ({ width, height }) => {
        gridSize = { width, height };
        compressData(gridSize).then(buffer => io.emit('gridSizeUpdate', buffer));
    });

    socket.on('changeBackgroundImage', (imageUrl) => {
        backgroundImageUrl = imageUrl;
        compressData(backgroundImageUrl).then(buffer => io.emit('backgroundImageUpdate', buffer));
    });

    socket.on('disconnect', () => {
        delete users[socket.id];
        compressData(users).then(buffer => io.emit('usersUpdate', buffer));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});