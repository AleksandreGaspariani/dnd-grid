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
    li.textContent = msg; // Already includes username from server
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
            square.addEventListener('click', () => {
                socket.emit('move', { x, y });
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

    // Hide modal and show main interface
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
socket.on('usersUpdate', (users) => {
    const squares = document.querySelectorAll('.grid-square');
    squares.forEach(square => square.textContent = '');
    Object.entries(users).forEach(([id, { emoji, image, x, y }]) => {
        const square = document.querySelector(`.grid-square[data-x="${x}"][data-y="${y}"]`);
        if (square) {
            if (image) {
                const img = document.createElement('img');
                img.src = image;
                img.style.width = '2rem';
                img.style.height = '2rem';
                square.innerHTML = '';
                square.appendChild(img);
            } else if (emoji) {
                square.textContent = emoji;
            }
        }
    });
});