// Ensure Pako is loaded (via CDN or npm)
const socket = io({
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    transports: ['websocket'] // Prefer WebSocket over polling
});

// Decompress incoming data using Pako
const decompressData = (buffer) => {
    try {
        const decompressed = pako.inflate(new Uint8Array(buffer), { to: 'string' });
        return JSON.parse(decompressed);
    } catch (e) {
        return buffer; // Fallback to raw data if not compressed
    }
};

// Modal setup
$(document).ready(() => $('#userSetupModal').modal('show'));

// Chat handling
document.getElementById('messageForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    if (message) {
        socket.emit('chatMessage', message);
        input.value = '';
    }
});

socket.on('chatMessage', (msg) => {
    const [userName, message] = msg.split(': ');
    const userFigure = document.querySelector(`.figure[data-name="${userName}"]`);
    if (userFigure) {
        const bubble = document.createElement('div');
        bubble.classList.add('message-bubble');
        bubble.textContent = message;
        userFigure.appendChild(bubble);
        setTimeout(() => bubble.parentElement && userFigure.removeChild(bubble), 4000);
    }
});

// Optimized grid drawing with throttling
const throttle = (func, limit) => {
    let inThrottle;
    return (...args) => {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

const drawGrid = throttle((width, height) => {
    const gridContainer = document.getElementById('gridContainer');
    gridContainer.innerHTML = '';
    gridContainer.style.gridTemplateColumns = `repeat(${width}, 2rem)`;
    gridContainer.style.gridTemplateRows = `repeat(${height}, 2rem)`;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const square = document.createElement('div');
            square.classList.add('grid-square');
            square.dataset.x = x;
            square.dataset.y = y;
            square.addEventListener('dragover', (e) => e.preventDefault());
            square.addEventListener('drop', (e) => {
                e.preventDefault();
                const targetX = parseInt(square.dataset.x);
                const targetY = parseInt(square.dataset.y);
                if (isValidMove(targetX, targetY)) {
                    socket.emit('move', { x: targetX, y: targetY });
                    clearHighlights();
                }
            });
            gridContainer.appendChild(square);
        }
    }
}, 100);

// User setup
document.getElementById('userSetupForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const userName = document.getElementById('userName').value.trim();
    const imageInput = document.getElementById('userImage');
    const selectedEmoji = document.querySelector('.emoji-btn.selected')?.dataset.emoji;

    if (!userName) return alert('Please enter a name');
    if (!selectedEmoji && imageInput.files.length === 0) return alert('Please pick an emoji or upload an image');

    if (imageInput.files.length > 0) {
        const file = imageInput.files[0];
        const reader = new FileReader();
        reader.onload = (event) => socket.emit('pickUser', { name: userName, image: event.target.result });
        reader.readAsDataURL(file);
    } else {
        socket.emit('pickUser', { name: userName, emoji: selectedEmoji });
    }
    $('#userSetupModal').modal('hide');
});

document.getElementById('joinAsGuest').addEventListener('click', () => {
    $('#userSetupModal').modal('hide');
    $('#controller').empty();
    socket.emit('joinAsGuest');
});

// Emoji handling
const emojiButtons = document.querySelectorAll('.emoji-btn');
emojiButtons.forEach(button => {
    button.addEventListener('click', () => {
        emojiButtons.forEach(btn => btn.classList.remove('selected', 'btn-primary'));
        button.classList.add('selected', 'btn-primary');
    });
});

socket.on('emojiList', (buffer) => {
    const emojis = decompressData(buffer);
    emojiButtons.forEach(button => button.disabled = !emojis.includes(button.dataset.emoji));
});

socket.on('emojiError', (msg) => {
    alert(msg);
    emojiButtons.forEach(button => button.disabled = false);
});

// User updates
let myPosition = null;
socket.on('usersUpdate', (buffer) => {
    const users = decompressData(buffer);
    const squares = document.querySelectorAll('.grid-square');
    squares.forEach(square => {
        square.innerHTML = '';
        square.classList.remove('highlight');
    });

    Object.entries(users).forEach(([id, { name, emoji, image, x, y }]) => {
        const square = document.querySelector(`.grid-square[data-x="${x}"][data-y="${y}"]`);
        if (square) {
            const content = document.createElement('div');
            content.classList.add('figure');
            content.dataset.name = name;
            content.dataset.id = id; // Set data-id attribute
            if (image) {
                const img = new Image();
                img.src = image;
                img.style.width = '2rem';
                img.style.height = '2rem';
                content.appendChild(img);
            } else if (emoji) {
                content.textContent = emoji;
            }

            if (id === socket.id) {
                content.draggable = true;
                content.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', 'move');
                    highlightAvailableMoves(x, y, users);
                });
                content.addEventListener('click', () => highlightAvailableMoves(x, y, users));
                myPosition = { x, y };
            }
            square.appendChild(content);
        }
    });
});

// Move handling
const highlightAvailableMoves = throttle((x, y, users) => {
    clearHighlights();
    const maxSteps = 6;
    document.querySelectorAll('.grid-square').forEach(square => {
        const targetX = parseInt(square.dataset.x);
        const targetY = parseInt(square.dataset.y);
        const dx = Math.abs(targetX - x);
        const dy = Math.abs(targetY - y);
        const isWithinRange = (dx + dy) <= maxSteps;
        const isOccupied = Object.values(users).some(u => u.x === targetX && u.y === targetY && u !== users[socket.id]);
        if (isWithinRange && !isOccupied) square.classList.add('highlight');
    });
}, 50);

const clearHighlights = () => {
    document.querySelectorAll('.grid-square.highlight').forEach(square => square.classList.remove('highlight'));
};

const isValidMove = (targetX, targetY) => {
    if (!myPosition) return false;
    const dx = Math.abs(targetX - myPosition.x);
    const dy = Math.abs(targetY - myPosition.y);
    return (dx + dy) <= 6;
};

// Controls
const moveFigure = throttle((dx, dy) => {
    if (!myPosition) return;
    const targetX = myPosition.x + dx;
    const targetY = myPosition.y + dy;
    if (isValidMove(targetX, targetY)) {
        const users = getCurrentUsers();
        const isOccupied = Object.values(users).some(u => u.x === targetX && u.y === targetY && u !== users[socket.id]);
        if (!isOccupied) {
            socket.emit('move', { x: targetX, y: targetY });
            clearHighlights();
        }
    }
}, 100);

['moveUp', 'moveDown', 'moveLeft', 'moveRight'].forEach((id, i) => {
    document.getElementById(id).addEventListener('click', () => moveFigure([0, 0, -1, 1][i], [-1, 1, 0, 0][i]));
});

document.addEventListener('keydown', (e) => {
    const moves = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (moves[e.key]) moveFigure(...moves[e.key]);
});

// Helper to get current users
function getCurrentUsers() {
    const users = {};
    document.querySelectorAll('.grid-square .figure').forEach(figure => {
        const square = figure.parentElement;
        const x = parseInt(square.dataset.x);
        const y = parseInt(square.dataset.y);
        const id = (x === myPosition.x && y === myPosition.y) ? socket.id : 'other';
        users[id] = { x, y };
    });
    return users;
}

// Background and grid updates
socket.on('gridSizeUpdate', (buffer) => drawGrid(...Object.values(decompressData(buffer))));
socket.on('backgroundImageUpdate', (buffer) => {
    const url = decompressData(buffer);
    document.getElementById('gridContainer').style.backgroundImage = `url(${url})`;
});

document.getElementById('updateGridSize').addEventListener('click', () => {
    const width = parseInt(document.getElementById('gridWidthInput').value);
    const height = parseInt(document.getElementById('gridHeightInput').value);
    if (width > 0 && height > 0) socket.emit('updateGridSize', { width, height });
});

document.getElementById('backgroundImageUrlInput').addEventListener('change', (e) => {
    const imageUrl = e.target.value.trim();
    if (imageUrl) socket.emit('changeBackgroundImage', imageUrl);
});

// Your existing toggle functions
function grid() { $('#mainInterface').toggleClass('hidden'); }
function dm() { 
    $('#dmControllers').toggleClass('hidden');
    $('#mainInterface').toggleClass('hidden');
    $('#dmMoveControls').toggleClass('hidden');
 }
function controllers() { $('#controller').toggleClass('hidden'); }

let selectedUserId = null; // Define selectedUserId

// Function to set selected user for DM
const setSelectedUser = (userId) => {
    selectedUserId = userId;
    document.querySelectorAll('.figure').forEach(figure => {
        figure.classList.remove('selected');
    });
    const selectedFigure = document.querySelector(`.figure[data-id="${userId}"]`);
    if (selectedFigure) {
        selectedFigure.classList.add('selected');
    }
};

// Add click event to figures for DM to select a user
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('figure')) {
        const userId = e.target.dataset.id;
        setSelectedUser(userId);
    }
});

// DM move handling
const dmMoveFigure = (userId, dx, dy) => {
    const userFigure = document.querySelector(`.figure[data-id="${userId}"]`);
    if (userFigure) {
        const currentX = parseInt(userFigure.parentElement.dataset.x);
        const currentY = parseInt(userFigure.parentElement.dataset.y);
        const targetX = currentX + dx;
        const targetY = currentY + dy;
        socket.emit('dmMove', { userId, position: { x: targetX, y: targetY } });
    }
};

// Add event listeners for DM controls
document.getElementById('dmMoveUp').addEventListener('click', () => dmMoveFigure(selectedUserId, 0, -1));
document.getElementById('dmMoveDown').addEventListener('click', () => dmMoveFigure(selectedUserId, 0, 1));
document.getElementById('dmMoveLeft').addEventListener('click', () => dmMoveFigure(selectedUserId, -1, 0));
document.getElementById('dmMoveRight').addEventListener('click', () => dmMoveFigure(selectedUserId, 1, 0));

// Add key listeners for DM movements (W, A, S, D)
document.addEventListener('keydown', (e) => {
    if (!selectedUserId) return; // Ensure a user is selected
    switch (e.key) {
        case 'w':
        case 'W':
            dmMoveFigure(selectedUserId, 0, -1);
            break;
        case 's':
        case 'S':
            dmMoveFigure(selectedUserId, 0, 1);
            break;
        case 'a':
        case 'A':
            dmMoveFigure(selectedUserId, -1, 0);
            break;
        case 'd':
        case 'D':
            dmMoveFigure(selectedUserId, 1, 0);
            break;
    }
});