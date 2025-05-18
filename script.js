// ========== GLOBAL VARIABLES ==========
let ENCRYPTION_PASSWORD = null;
let isPeerInitialized = false;
let isConnecting = false;
const userId = 'user-' + Math.random().toString(36).substring(2, 10) + Date.now().toString().slice(-4);
let peer = null;
let activeConnection = null;

// Voice recording variables
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// ========== DOM ELEMENTS ==========
const elements = {
    statusDot: null,
    statusText: null,
    yourIdDisplay: null,
    friendIdInput: null,
    connectBtn: null,
    copyIdBtn: null,
    chatBox: null,
    typingContainer: null,
    messageInput: null,
    sendBtn: null,
    fileBtn: null,
    fileInput: null,
    recordBtn: null
};

// ========== MAIN INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', async () => {
    initializeDOMElements();
    
    // Set encryption password
    ENCRYPTION_PASSWORD = prompt("MANUAL GUIDE :Set encryption password (both users must use the same encrypted password for chatting, NOTE:🌟 user B should use user A id number and press connect ONLY user B should press connect ( is vice versa ):") || "default_password";
    if (ENCRYPTION_PASSWORD === "default_password") {
        alert("Warning: Using default password. For security, set a strong password!");
    }

    await initializePeerConnection();
    initializeEventListeners();
    initializeFileSharing();
    initializeVoiceRecording();
});

function initializeDOMElements() {
    elements.statusDot = document.getElementById('status-dot');
    elements.statusText = document.getElementById('status-text');
    elements.yourIdDisplay = document.getElementById('your-id-display');
    elements.friendIdInput = document.getElementById('friend-id');
    elements.connectBtn = document.getElementById('connect-btn');
    elements.copyIdBtn = document.getElementById('copy-id-btn');
    elements.chatBox = document.getElementById('chat-box');
    elements.typingContainer = document.getElementById('typing-container');
    elements.messageInput = document.getElementById('message-input');
    elements.sendBtn = document.getElementById('send-btn');
    elements.fileBtn = document.getElementById('file-btn');
    elements.fileInput = document.getElementById('file-input');
    elements.recordBtn = document.getElementById('record-btn');
}

// ========== PEERJS CONNECTION ==========
async function initializePeerConnection() {
    return new Promise((resolve) => {
        try {
            // Create new Peer instance with better configuration
            peer = new Peer(userId, {
                debug: 3,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:global.stun.twilio.com:3478' }
                    ]
                }
            });

            peer.on('open', (id) => {
                updateStatus(`Your ID: ${id}`, 'success');
                elements.yourIdDisplay.textContent = `Your ID: ${id}`;
                isPeerInitialized = true;
                resolve();
            });

            peer.on('connection', (conn) => {
                if (activeConnection) {
                    conn.close();
                    addSystemMessage(`Rejected duplicate connection from ${conn.peer}`);
                    return;
                }

                // Verify password
                if (conn.metadata?.password !== ENCRYPTION_PASSWORD) {
                    conn.close();
                    addSystemMessage(`Rejected connection (wrong password)`);
                    return;
                }

                activeConnection = conn;
                setupConnectionHandlers(conn);
                updateStatus(`Connected to ${conn.peer}`, 'success');
                addSystemMessage(`${conn.peer} connected to you`);
            });

            peer.on('error', (err) => {
                console.error('PeerJS Error:', err);
                updateStatus(`Error: ${err.type}`, 'error');
                if (err.type === 'unavailable-id') {
                    setTimeout(initializePeerConnection, 2000);
                }
            });

            peer.on('disconnected', () => {
                updateStatus('Disconnected', 'error');
                setTimeout(() => {
                    if (!peer.destroyed && !peer.disconnected) {
                        peer.reconnect();
                    }
                }, 5000);
            });

        } catch (err) {
            console.error('Failed to initialize Peer:', err);
            updateStatus('Failed to initialize connection', 'error');
            setTimeout(initializePeerConnection, 2000);
            resolve();
        }
    });
}

// ========== CONNECTION MANAGEMENT ==========
function connectToPeer() {
    if (!isPeerInitialized) {
        updateStatus('Peer not initialized yet', 'error');
        return;
    }

    const friendId = elements.friendIdInput.value.trim();
    if (!friendId) {
        updateStatus('Please enter friend ID', 'error');
        return;
    }

    if (activeConnection) {
        updateStatus('Already connected to someone', 'error');
        return;
    }

    if (isConnecting) {
        updateStatus('Already trying to connect', 'info');
        return;
    }

    isConnecting = true;
    updateStatus('Connecting...', 'info');

    const conn = peer.connect(friendId, {
        reliable: true,
        serialization: 'json',
        metadata: { 
            password: ENCRYPTION_PASSWORD
        }
    });

    conn.on('open', () => {
        if (activeConnection) {
            conn.close();
            return;
        }

        activeConnection = conn;
        isConnecting = false;
        setupConnectionHandlers(conn);
        updateStatus(`Connected to ${friendId}`, 'success');
        addSystemMessage(`Connected to ${friendId}`);
    });

    conn.on('error', (err) => {
        console.error("Connection error:", err);
        isConnecting = false;
        updateStatus(`Failed to connect to ${friendId}`, 'error');
    });

    // Timeout after 10 seconds
    setTimeout(() => {
        if (!activeConnection && isConnecting) {
            conn.close();
            isConnecting = false;
            updateStatus('Connection timed out', 'error');
        }
    }, 10000);
}

function setupConnectionHandlers(conn) {
    conn.on('data', (data) => {
        try {
            if (data.type === 'message') {
                const decryptedText = decrypt(data.text);
                addMessage(
                    decryptedText.includes("[DECRYPTION") ? 
                        "🔒 Couldn't decrypt (wrong password?)" : decryptedText, 
                    false
                );
            }
            else if (data.type === 'file') {
                const decryptedData = decrypt(data.data);
                if (!decryptedData.includes("[DECRYPTION")) {
                    displayMediaMessage(data.filename, decryptedData, data.fileType, false);
                }
            }
            else if (data.type === 'audio') {
                const decryptedAudio = decrypt(data.audio);
                if (!decryptedAudio.includes("[DECRYPTION")) {
                    displayAudioMessage(decryptedAudio, false);
                }
            }
        } catch (e) {
            console.error("Error handling data:", e);
            addSystemMessage('Error processing received data');
        }
    });

    conn.on('close', () => {
        if (activeConnection === conn) {
            activeConnection = null;
            updateStatus('Disconnected', 'error');
            addSystemMessage(`Disconnected`);
        }
    });

    conn.on('error', (err) => {
        console.error("Connection error:", err);
        updateStatus('Connection error', 'error');
    });
}

// ========== MESSAGING FUNCTIONS ==========
function sendMessage() {
    if (!activeConnection || !activeConnection.open) {
        addSystemMessage('Not connected to anyone');
        return;
    }

    const rawText = elements.messageInput.value.trim();
    if (!rawText) return;

    try {
        const messageId = Date.now().toString();
        const encryptedText = encrypt(rawText);
        
        activeConnection.send({
            type: 'message',
            text: encryptedText,
            id: messageId
        });
        
        addMessage(rawText, true, messageId);
        elements.messageInput.value = '';
    } catch (err) {
        console.error("Error sending message:", err);
        addSystemMessage('Failed to send message');
    }
}

// ========== FILE SHARING ==========
function initializeFileSharing() {
    elements.fileBtn.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', handleFileUpload);
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 5MB file size limit
    if (file.size > 5 * 1024 * 1024) {
        addSystemMessage('File is too large (max 5MB)');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
        sendFile(file.name, event.target.result, file.type);
    };
    
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
        reader.readAsDataURL(file);
    } else {
        addSystemMessage('Unsupported file type. Please send images or videos.');
    }
    
    // Reset file input
    elements.fileInput.value = '';
}

function sendFile(filename, fileData, fileType) {
    if (!activeConnection || !activeConnection.open) {
        addSystemMessage('Not connected to anyone');
        return;
    }

    try {
        const messageId = Date.now().toString();
        const encryptedData = encrypt(fileData);
        
        activeConnection.send({
            type: 'file',
            filename: filename,
            data: encryptedData,
            fileType: fileType,
            id: messageId
        });
        
        displayMediaMessage(filename, fileData, fileType, true);
    } catch (err) {
        console.error("Error sending file:", err);
        addSystemMessage('Failed to send file');
    }
}

// ========== VOICE RECORDING ==========
function initializeVoiceRecording() {
    if (!elements.recordBtn) {
        console.error('Record button not found');
        return;
    }

    elements.recordBtn.addEventListener('mousedown', startRecording);
    elements.recordBtn.addEventListener('mouseup', stopRecording);
    elements.recordBtn.addEventListener('touchstart', startRecording);
    elements.recordBtn.addEventListener('touchend', stopRecording);
}

function startRecording(event) {
    event.preventDefault();
    if (isRecording || !activeConnection) return;

    if (!navigator.mediaDevices || !window.MediaRecorder) {
        addSystemMessage('Voice recording not supported in your browser');
        return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            isRecording = true;
            audioChunks = [];
            mediaRecorder = new MediaRecorder(stream);
            
            // Update UI
            elements.recordBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
            elements.recordBtn.style.color = '#f72585';
            
            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };
            
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                sendAudioMessage(audioBlob);
                
                // Stop all tracks in the stream
                stream.getTracks().forEach(track => track.stop());
                
                // Reset UI
                elements.recordBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                elements.recordBtn.style.color = '';
            };
            
            mediaRecorder.start();
        })
        .catch(err => {
            console.error('Error accessing microphone:', err);
            addSystemMessage('Microphone access denied');
        });
}

function stopRecording(event) {
    event.preventDefault();
    if (!isRecording) return;
    
    isRecording = false;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
}

function sendAudioMessage(audioBlob) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const audioData = reader.result;
            const messageId = Date.now().toString();
            const encryptedAudio = encrypt(audioData);
            
            activeConnection.send({
                type: 'audio',
                audio: encryptedAudio,
                id: messageId
            });
            
            displayAudioMessage(audioData, true);
        } catch (err) {
            console.error("Error sending audio:", err);
            addSystemMessage('Failed to send audio message');
        }
    };
    reader.readAsDataURL(audioBlob);
}

// ========== UTILITY FUNCTIONS ==========
function initializeEventListeners() {
    elements.connectBtn.addEventListener('click', connectToPeer);
    elements.copyIdBtn.addEventListener('click', copyPeerId);
    elements.sendBtn.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            sendMessage();
        }
    });
}

function copyPeerId() {
    if (!peer || !peer.id) {
        updateStatus('ID not available yet', 'error');
        return;
    }
    navigator.clipboard.writeText(peer.id)
        .then(() => {
            addSystemMessage('Copied your ID to clipboard!');
        })
        .catch(err => {
            console.error('Failed to copy ID:', err);
            addSystemMessage('Failed to copy ID');
        });
}

function encrypt(text) {
    return CryptoJS.AES.encrypt(text, ENCRYPTION_PASSWORD).toString();
}

function decrypt(ciphertext) {
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_PASSWORD);
        return bytes.toString(CryptoJS.enc.Utf8) || "[DECRYPTION FAILED]";
    } catch (e) {
        console.error("Decryption error:", e);
        return "[DECRYPTION ERROR]";
    }
}

function updateStatus(text, type = 'info') {
    if (!elements.statusText || !elements.statusDot) return;
    
    elements.statusText.textContent = text;
    elements.statusDot.className = 'status-dot';
    
    if (type === 'success') {
        elements.statusDot.classList.add('connected');
    } else if (type === 'error') {
        elements.statusDot.classList.add('error');
    } else {
        elements.statusDot.classList.add('connecting');
    }
}

function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = text;
    elements.chatBox.appendChild(div);
    scrollToBottom();
}

function addMessage(text, isYourMessage, messageId = Date.now().toString()) {
    const messageDiv = document.createElement('div');
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.className = `message ${isYourMessage ? 'your-message' : 'their-message'}`;
    messageDiv.dataset.messageId = messageId;
    
    messageDiv.innerHTML = `
        <div class="message-text">${text}</div>
        <div class="message-info">
            <span>${time}</span>
            ${isYourMessage ? '<span class="read-receipt"><i class="fas fa-check-double"></i></span>' : ''}
        </div>
    `;
    
    elements.chatBox.insertBefore(messageDiv, elements.typingContainer);
    scrollToBottom();
}

function displayMediaMessage(filename, data, fileType, isYourMessage) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const mediaContainer = document.createElement('div');
    mediaContainer.className = `message ${isYourMessage ? 'your-message' : 'their-message'}`;
    
    let mediaElement;
    if (fileType.startsWith('image/')) {
        mediaElement = document.createElement('img');
        mediaElement.src = data;
        mediaElement.loading = 'lazy';
    } else if (fileType.startsWith('video/')) {
        mediaElement = document.createElement('video');
        mediaElement.controls = true;
        mediaElement.src = data;
    }
    
    mediaContainer.innerHTML = `
        <div class="media-message">
            ${mediaElement.outerHTML}
            <div class="media-caption">${filename}</div>
        </div>
        <div class="message-info">
            <span>${time}</span>
            ${isYourMessage ? '<span class="read-receipt"><i class="fas fa-check-double"></i></span>' : ''}
        </div>
    `;
    
    elements.chatBox.insertBefore(mediaContainer, elements.typingContainer);
    scrollToBottom();
}

function displayAudioMessage(audioData, isYourMessage) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const audioContainer = document.createElement('div');
    audioContainer.className = `message ${isYourMessage ? 'your-message' : 'their-message'}`;
    
    audioContainer.innerHTML = `
        <div class="audio-message">
            <audio controls src="${audioData}"></audio>
        </div>
        <div class="message-info">
            <span>${time}</span>
            ${isYourMessage ? '<span class="read-receipt"><i class="fas fa-check-double"></i></span>' : ''}
        </div>
    `;
    
    elements.chatBox.insertBefore(audioContainer, elements.typingContainer);
    scrollToBottom();
}

function scrollToBottom() {
    elements.chatBox.scrollTop = elements.chatBox.scrollHeight;
}