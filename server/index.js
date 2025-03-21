const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('../client'));

const availableEmojis = ['🤖', '🧙‍♂️', '🐱', '🐱‍🏍', '💂🏿‍♀️'];
const users = {};

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    socket.emit('emojiList', availableEmojis);

    socket.on('pickUser', ({ name, emoji, image }) => {
        if (emoji && availableEmojis.includes(emoji) && !Object.values(users).some(u => u.emoji === emoji)) {
            users[socket.id] = { name, emoji, x: 0, y: 0 };
            console.log(`${socket.id} (${name}) picked emoji ${emoji}`);
        } else if (image) {
            users[socket.id] = { name, image, x: 0, y: 0 };
            console.log(`${socket.id} (${name}) uploaded an image`);
        } else {
            socket.emit('emojiError', 'Emoji already taken or invalid');
            return;
        }
        io.emit('usersUpdate', users);
    });

    socket.on('chatMessage', (msg) => {
        if (users[socket.id]) {
            const user = users[socket.id];
            const messageWithUser = `${user.name}: ${msg}`;
            console.log('Message received:', messageWithUser);
            io.emit('chatMessage', messageWithUser);
        }
    });

    socket.on('move', (position) => {
        if (users[socket.id]) {
            const user = users[socket.id];
            const dx = Math.abs(position.x - user.x);
            const dy = Math.abs(position.y - user.y);
            const isWithinRange = (dx + dy) <= 6;
            const isOccupied = Object.values(users).some(u => u.x === position.x && u.y === position.y && u !== user);

            if (isWithinRange && !isOccupied) {
                user.x = position.x;
                user.y = position.y;
                console.log(`${socket.id} moved to (${position.x}, ${position.y})`);
                io.emit('usersUpdate', users);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete users[socket.id];
        io.emit('usersUpdate', users);
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});