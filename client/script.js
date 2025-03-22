// Connect to the Socket.IO server
const socket = io();

// Show modal on page load
$(document).ready(() => {
    $('#userSetupModal').modal('show');
});

// Handle form submission to send messages
document.getElementById('messageForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    if (message) {
        socket.emit('chatMessage', message);
        input.value = '';
    }
});

// Listen for incoming messages from the server
socket.on('chatMessage', (msg) => {
    const messages = document.getElementById('messages');
    const li = document.createElement('li');
    li.textContent = msg;
    messages.appendChild(li);
});

// Grid drawing function
function drawGrid(width, height) {
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

            // Drag-and-drop events
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
}

// Handle user setup form submission
document.getElementById('userSetupForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const userName = document.getElementById('userName').value.trim();
    const imageInput = document.getElementById('userImage');
    let emoji = null;

    const selectedEmojiBtn = document.querySelector('.emoji-btn.selected');
    if (selectedEmojiBtn) {
        emoji = selectedEmojiBtn.dataset.emoji;
    }

    if (!userName) {
        alert('Please enter a name');
        return;
    }

    if (imageInput.files.length > 0) {
        const file = imageInput.files[0];
        const reader = new FileReader();
        reader.onload = (event) => {
            const imageData = event.target.result;
            socket.emit('pickUser', { name: userName, image: imageData });
        };
        reader.readAsDataURL(file);
    } else if (emoji) {
        socket.emit('pickUser', { name: userName, emoji });
    } else {
        alert('Please pick an emoji or upload an image');
        return;
    }

    $('#userSetupModal').modal('hide');
    document.getElementById('mainInterface').style.display = 'block';
    drawGrid(20, 20);
});

// Add click listeners to emoji buttons
const emojiButtons = document.querySelectorAll('.emoji-btn');
emojiButtons.forEach(button => {
    button.addEventListener('click', () => {
        emojiButtons.forEach(btn => {
            btn.classList.remove('selected');
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-outline-primary');
        });
        button.classList.add('selected');
        button.classList.add('btn-primary');
        button.classList.remove('btn-outline-primary');
    });
});

// Handle emoji list from server
socket.on('emojiList', (emojis) => {
    console.log('Received emoji list:', emojis);
    emojiButtons.forEach(button => {
        const emoji = button.dataset.emoji;
        button.disabled = !emojis.includes(emoji);
    });
});

socket.on('emojiError', (msg) => {
    alert(msg);
    emojiButtons.forEach(button => button.disabled = false);
});

// Update grid with user positions
let myPosition = null;
socket.on('usersUpdate', (users) => {
    const squares = document.querySelectorAll('.grid-square');
    squares.forEach(square => {
        square.innerHTML = '';
        square.classList.remove('highlight');
    });

    Object.entries(users).forEach(([id, { emoji, image, x, y }]) => {
        const square = document.querySelector(`.grid-square[data-x="${x}"][data-y="${y}"]`);
        if (square) {
            const content = document.createElement('div');
            content.classList.add('figure');
            if (image) {
                const img = document.createElement('img');
                img.src = image;
                img.style.width = '2rem';
                img.style.height = '2rem';
                content.appendChild(img);
            } else if (emoji) {
                content.textContent = emoji;
            }

            // Make my figure draggable
            if (id === socket.id) {
                content.draggable = true;
                content.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', 'move');
                    content.classList.add('hover');
                    highlightAvailableMoves(x, y, users);
                });
                content.addEventListener('dragend', () => {
                    content.classList.remove('hover');
                });
                content.addEventListener('click', () => {
                    highlightAvailableMoves(x, y, users);
                });
                myPosition = { x, y };
            }

            square.appendChild(content);
        }
    });
});

// Highlight available moves in a filled diamond pattern (6 squares max)
function highlightAvailableMoves(x, y, users) {
    clearHighlights();
    const maxSteps = 6; // 30 feet / 5 feet per square
    const squares = document.querySelectorAll('.grid-square');
    squares.forEach(square => {
        const targetX = parseInt(square.dataset.x);
        const targetY = parseInt(square.dataset.y);
        const dx = Math.abs(targetX - x);
        const dy = Math.abs(targetY - y);
        
        const isWithinRange = (dx + dy) <= maxSteps;
        const isOccupied = Object.values(users).some(u => u.x === targetX && u.y === targetY && u !== users[socket.id]);
        
        if (isWithinRange && !isOccupied) {
            square.classList.add('highlight');
        }
    });
}

function clearHighlights() {
    document.querySelectorAll('.grid-square.highlight').forEach(square => {
        square.classList.remove('highlight');
    });
}

function isValidMove(targetX, targetY) {
    if (!myPosition) return false;
    const dx = Math.abs(targetX - myPosition.x);
    const dy = Math.abs(targetY - myPosition.y);
    return (dx + dy) <= 6; // Max 6 steps total (30 feet)
}

// Arrow button controls
document.getElementById('moveUp').addEventListener('click', () => moveFigure(0, -1));
document.getElementById('moveDown').addEventListener('click', () => moveFigure(0, 1));
document.getElementById('moveLeft').addEventListener('click', () => moveFigure(-1, 0));
document.getElementById('moveRight').addEventListener('click', () => moveFigure(1, 0));

// Keyboard arrow controls
document.addEventListener('keydown', (e) => {
    switch (e.key) {
        case 'ArrowUp':
            moveFigure(0, -1);
            break;
        case 'ArrowDown':
            moveFigure(0, 1);
            break;
        case 'ArrowLeft':
            moveFigure(-1, 0);
            break;
        case 'ArrowRight':
            moveFigure(1, 0);
            break;
    }
});

// Move figure function
function moveFigure(dx, dy) {
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
}

// Helper to get current users from the grid (for occupancy check)
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

// Function to change the background image of the grid container's parent
function changeBackgroundImage(imageUrl) {
    const gridParent = document.querySelector('#gridContainer');
    gridParent.style.backgroundImage = `url(${imageUrl})`;
    gridParent.style.backgroundSize = '100% 100%';
    gridParent.style.backgroundRepeat = 'no-repeat';
    gridParent.style.overflow = 'auto';
    gridParent.style.objectFit = 'fill';
}

// Example usage: change the background image when a new image is selected
document.getElementById('backgroundImageInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            changeBackgroundImage(event.target.result);
        };
        reader.readAsDataURL(file);
    }
});