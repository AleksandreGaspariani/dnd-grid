const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const compression = require("compression");
const zlib = require("zlib");
const rateLimit = require("express-rate-limit");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e6,
  pingTimeout: 20000,
  pingInterval: 25000,
});

app.use(compression());
app.use(express.static("../client", { maxAge: "1d" }));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
  })
);

const availableEmojis = ["🤖", "🧙‍♂️", "🥷", "🐺", "😺"];
const users = {};
let gridSize = { width: 20, height: 20 };
let backgroundImageUrl = "";

const compressData = (data) => {
  return new Promise((resolve) => {
    zlib.deflate(JSON.stringify(data), (err, buffer) => {
      if (!err) resolve(buffer);
      else resolve(JSON.stringify(data));
    });
  });
};

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  Promise.all([
    compressData(availableEmojis),
    compressData(gridSize),
    compressData(backgroundImageUrl),
  ]).then(([emojiBuffer, gridBuffer, bgBuffer]) => {
    socket.emit("emojiList", emojiBuffer);
    socket.emit("gridSizeUpdate", gridBuffer);
    socket.emit("backgroundImageUpdate", bgBuffer);
  });

  socket.on("pickUser", ({ name, emoji, image }) => {
    if (
      emoji &&
      availableEmojis.includes(emoji) &&
      !Object.values(users).some((u) => u.emoji === emoji)
    ) {
      users[socket.id] = { name, emoji, x: 0, y: 0, lastMove: 0 };
    } else if (image) {
      users[socket.id] = { name, image, x: 0, y: 0, lastMove: 0 };
    } else {
      socket.emit("emojiError", "Emoji already taken or invalid");
      return;
    }
    compressData(users).then((buffer) => io.emit("usersUpdate", buffer));
  });

  socket.on("joinAsGuest", () => {
    console.log(`Guest user connected: ${socket.id}`);
    users[socket.id] = {
      name: `Guest_${socket.id.slice(0, 4)}`,
      isGuest: true,
      x: -1,
      y: -1,
      lastMove: 0,
    };
    compressData(users).then((buffer) => io.emit("usersUpdate", buffer));
  });

  socket.on("chatMessage", (msg) => {
    if (users[socket.id]) {
      const messageWithUser = `${users[socket.id].name}: ${msg}`;
      io.emit("chatMessage", messageWithUser);
    }
  });

  socket.on("move", (position) => {
    if (users[socket.id]) {
      const user = users[socket.id];
      const now = Date.now();
      if (now - user.lastMove < 100) return;
      user.lastMove = now;

      const dx = Math.abs(position.x - user.x);
      const dy = Math.abs(position.y - user.y);
      const isWithinRange = dx + dy <= 6;
      const isOccupied = Object.values(users).some(
        (u) => u.x === position.x && u.y === position.y && u !== user
      );

      if (isWithinRange && !isOccupied) {
        user.x = position.x;
        user.y = position.y;
        compressData(users).then((buffer) => io.emit("usersUpdate", buffer));
      }
    }
  });

  socket.on("dmMove", ({ userId, position }) => {
    if (users[userId]) {
      const user = users[userId];
      const dx = Math.abs(position.x - user.x);
      const dy = Math.abs(position.y - user.y);
      const isWithinRange = dx + dy <= 6;
      const isOccupied = Object.values(users).some(
        (u) => u.x === position.x && u.y === position.y && u !== user
      );

      if (isWithinRange && !isOccupied) {
        user.x = position.x;
        user.y = position.y;
        compressData(users).then((buffer) => io.emit("usersUpdate", buffer));
      }
    }
  });

  socket.on("updateGridSize", ({ width, height }) => {
    gridSize = { width, height };
    compressData(gridSize).then((buffer) => io.emit("gridSizeUpdate", buffer));
  });

  socket.on("changeBackgroundImage", (imageUrl) => {
    backgroundImageUrl = imageUrl;
    compressData(backgroundImageUrl).then((buffer) =>
      io.emit("backgroundImageUpdate", buffer)
    );
  });

  socket.on("disconnect", () => {
    delete users[socket.id];
    compressData(users).then((buffer) => io.emit("usersUpdate", buffer));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
