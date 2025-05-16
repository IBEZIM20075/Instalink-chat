// ========== ENCRYPTION SETUP ==========
let ENCRYPTION_PASSWORD = null;

// ========== INITIALIZATION ==========
const userId = Math.random().toString(36).substring(2, 10);
let peer = null;
let activeConnection = null;
let pendingMessages = {};
let isTyping = false;
let typingTimeout;
let deleteTimeout;

// Voice recording variables
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// DOM Elements (will be initialized after DOM loads)
let statusDot, statusText, yourIdDisplay, friendIdInput, connectBtn, copyIdBtn;
let chatBox, typingContainer, messageInput, sendBtn, fileBtn, fileInput, recordBtn;

// Prompt for password when page loads
window.addEventListener('DOMContentLoaded', () => {
    // Initialize DOM elements
    statusDot = document.getElementById('status-dot');
    statusText = document.getElementById('status-text');
    yourIdDisplay = document.getElementById('your-id-display');
    friendIdInput = document.getElementById('friend-id');
    connectBtn = document.getElementById('connect-btn');
    copyIdBtn = document.getElementById('copy-id-btn');
    chatBox = document.getElementById('chat-box');
    typingContainer = document.getElementById('typing-container');
    messageInput = document.getElementById('message-input');
    sendBtn = document.getElementById('send-btn');
    fileBtn = document.getElementById('file-btn');
    fileInput = document.getElementById('file-input');
    recordBtn = document.getElementById('record-btn');

    // Verify all required elements exist
    if (!statusDot || !statusText || !yourIdDisplay || !friendIdInput || !connectBtn || 
        !copyIdBtn || !chatBox || !typingContainer || !messageInput || !sendBtn || 
        !fileBtn || !fileInput || !recordBtn) {
        console.error('Critical DOM elements missing!');
        return;
    }

    ENCRYPTION_PASSWORD = prompt("Set encryption password (both users must use the same encrypted password for chatting and the same ID number):") || "default_password";
    if (ENCRYPTION_PASSWORD === "default_password") {
        alert("Warning: Using default encryption password. For real security, set a strong custom password!");
    }
    
    // Initialize all functionality
    initEventListeners();
    initializePeerConnection();
    initFileSharing();
    initVoiceRecording();
});

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

// Initialize all event listeners in one place
function initEventListeners() {
    connectBtn.addEventListener('click', connectToPeer);
    copyIdBtn.addEventListener('click', copyPeerId);
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('input', handleTyping);
    messageInput.addEventListener('keydown', handleKeyDown);
}

// ========== PEERJS INITIALIZATION ==========
function initializePeerConnection() {
    try {
        // Create new Peer instance with error handling
        peer = new Peer(userId);
        
        peer.on('error', (err) => {
            console.error('PeerJS Error:', err);
            updateStatus(`Connection error: ${err}`, 'error');
        });
        
        peer.on('open', (id) => {
            updateStatus(`Your ID: ${id}`, 'success');
            yourIdDisplay.textContent = `Your ID: ${id} - Share this with friends!`;
        });
        
        peer.on('connection', (conn) => {
            activeConnection = conn;
            updateStatus(`Connected to ${conn.peer}`, 'success');
            addSystemMessage(`Connected to ${conn.peer}`);
            
            conn.on('data', (data) => {
                if (data.type === 'message') {
                    const decryptedText = decrypt(data.text);
                    addMessage(
                        decryptedText.includes("[DECRYPTION") ? 
                            "🔒 Couldn't decrypt (wrong password?)" : decryptedText, 
                        false
                    );
                    sendReadReceipt(data.id);
                } else if (data.type === 'file') {
                    try {
                        const decryptedData = decrypt(data.data);
                        if (decryptedData.includes("[DECRYPTION")) {
                            addMessage("🔒 Couldn't decrypt file (wrong password?)", false);
                        } else {
                            displayMediaMessage(data.filename, decryptedData, data.fileType, false, data.id);
                        }
                        sendReadReceipt(data.id);
                    } catch (e) {
                        console.error("File decryption error:", e);
                        addMessage("🔒 File decryption failed", false);
                    }
                } else if (data.type === 'typing') {
                    showTypingIndicator(data.isTyping);
                } else if (data.type === 'read-receipt') {
                    updateReadReceipt(data.messageId);
                } else if (data.type === 'audio') {
                    try {
                        const decryptedAudio = decrypt(data.audio);
                        if (decryptedAudio.includes("[DECRYPTION")) {
                            addMessage("🔒 Couldn't decrypt audio (wrong password?)", false);
                        } else {
                            displayAudioMessage(decryptedAudio, false, data.id);
                        }
                        sendReadReceipt(data.id);
                    } catch (e) {
                        console.error("Audio decryption error:", e);
                        addMessage("🔒 Audio decryption failed", false);
                    }
                }
            });
            
            conn.on('close', () => {
                updateStatus('Disconnected', 'error');
                addSystemMessage(`Disconnected from ${conn.peer}`);
                activeConnection = null;
            });
            
            conn.on('error', (err) => {
                updateStatus(`Connection error: ${err}`, 'error');
            });
        });
        
    } catch (err) {
        console.error('Failed to initialize Peer:', err);
        updateStatus('Failed to initialize connection', 'error');
    }
}

// ========== VOICE RECORDING FUNCTIONS ==========
function initVoiceRecording() {
    if (!recordBtn) {
        console.error('Record button not found');
        return;
    }

    recordBtn.addEventListener('mousedown', startRecording);
    recordBtn.addEventListener('mouseup', stopRecording);
    recordBtn.addEventListener('mouseleave', stopRecording);
    recordBtn.addEventListener('touchstart', startRecording);
    recordBtn.addEventListener('touchend', stopRecording);
}

// ... [rest of the functions remain the  as in your working code]
function startRecording(e) {
    e.preventDefault();
    if (isRecording) return;
    
    if (!activeConnection) {
        addSystemMessage('Not connected to anyone');
        return;
    }
    
    // Check if browser supports MediaRecorder
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
            recordBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
            recordBtn.style.color = '#f72585';
            
            mediaRecorder.ondataavailable = e => {
                audioChunks.push(e.data);
            };
            
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                sendAudioMessage(audioBlob);
                
                // Stop all tracks in the stream
                stream.getTracks().forEach(track => track.stop());
                
                // Reset UI
                recordBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                recordBtn.style.color = '';
            };
            
            mediaRecorder.start();
        })
        .catch(err => {
            console.error('Error accessing microphone:', err);
            addSystemMessage('Microphone access denied');
        });
}

function stopRecording(e) {
    e.preventDefault();
    if (!isRecording) return;
    
    isRecording = false;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
}

function sendAudioMessage(audioBlob) {
    const reader = new FileReader();
    reader.onload = () => {
        const audioData = reader.result;
        const messageId = Date.now().toString();
        
        // Show sending state
        const messageDiv = addMessage("🎤 Sending voice message...", true, messageId, true);
        
        // Encrypt and send
        const encryptedAudio = encrypt(audioData);
        activeConnection.send({
            type: 'audio',
            audio: encryptedAudio,
            id: messageId
        });
        
        // Update UI after sending
        setTimeout(() => {
            displayAudioMessage(audioData, true, messageId);
            messageDiv.remove();
        }, 300);
    };
    reader.readAsDataURL(audioBlob);
}

function displayAudioMessage(audioData, isYourMessage, messageId) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const audioContainer = document.createElement('div');
    audioContainer.className = `message ${isYourMessage ? 'your-message' : 'their-message'}`;
    audioContainer.dataset.messageId = messageId;
    
    audioContainer.innerHTML = `
        <div class="audio-message">
            <audio controls src="${audioData}"></audio>
        </div>
        <div class="message-info">
            <span>${time}</span>
            ${isYourMessage ? `
                <span class="read-receipt" id="receipt-${messageId}">
                    <i class="fas fa-check-double"></i>
                </span>
            ` : ''}
        </div>
    `;
    
    chatBox.insertBefore(audioContainer, typingContainer);
    scrollToBottom();
}

// ========== FILE SHARING FUNCTIONS ==========
function initFileSharing() {
    fileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // 5MB file size limit
    if (file.size > 5 * 1024 * 1024) {
        addSystemMessage('File is too large (max 5MB)');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(event) {
        const fileData = event.target.result;
        sendFile(file.name, fileData, file.type);
    };
    
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
        reader.readAsDataURL(file);
    } else {
        addSystemMessage('Unsupported file type. Please send images or videos.');
    }
    
    // Reset file input
    fileInput.value = '';
}

function sendFile(filename, fileData, fileType) {
    if (!activeConnection) {
        addSystemMessage('Not connected to anyone');
        return;
    }
    
    const messageId = Date.now().toString();
    const messageDiv = addMessage("📁 Sending file...", true, messageId, true);
    
    // Encrypt the file data before sending
    const encryptedData = encrypt(fileData);
    
    activeConnection.send({
        type: 'file',
        filename: filename,
        data: encryptedData,
        fileType: fileType,
        id: messageId
    });
    
    setTimeout(() => {
        displayMediaMessage(filename, fileData, fileType, true, messageId);
        messageDiv.remove();
    }, 300);
}

function displayMediaMessage(filename, data, fileType, isYourMessage, messageId) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const mediaContainer = document.createElement('div');
    mediaContainer.className = `message ${isYourMessage ? 'your-message' : 'their-message'}`;
    mediaContainer.dataset.messageId = messageId;
    
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
            ${isYourMessage ? `
                <span class="read-receipt" id="receipt-${messageId}">
                    <i class="fas fa-check-double"></i>
                </span>
            ` : ''}
        </div>
    `;
    
    chatBox.insertBefore(mediaContainer, typingContainer);
    scrollToBottom();
}

// ========== MESSAGE FUNCTIONS ==========
function updateStatus(text, type = 'info') {
    statusText.textContent = text;
    
    if (type === 'success') {
        statusDot.classList.remove('connecting');
        statusDot.style.background = '#4ade80';
    } else if (type === 'error') {
        statusDot.classList.remove('connecting');
        statusDot.style.background = '#f72585';
    } else {
        statusDot.classList.add('connecting');
    }
}

function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = text;
    chatBox.appendChild(div);
    scrollToBottom();
}

function addMessage(text, isYourMessage, messageId = null, isPending = false) {
    const messageDiv = document.createElement('div');
    const messageClass = isYourMessage ? 'your-message' : 'their-message';
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.className = `message ${messageClass} ${isPending ? 'pending deletable' : ''}`;
    messageDiv.dataset.messageId = messageId;
    
    if (isPending) {
        messageDiv.addEventListener('mousedown', startDeleteTimer);
        messageDiv.addEventListener('mouseup', cancelDelete);
        messageDiv.addEventListener('mouseleave', cancelDelete);
    }
    
    messageDiv.innerHTML = `
        ${isPending ? '🔒 Encrypting...' : text}
        <div class="message-info">
            <span>${time}</span>
            ${isYourMessage ? `
                <span class="read-receipt" id="receipt-${messageId}">
                    <i class="fas fa-check${isPending ? '' : '-double read'}"></i>
                </span>
            ` : ''}
        </div>
    `;
    
    chatBox.insertBefore(messageDiv, typingContainer);
    scrollToBottom();
    return messageDiv;
}

function startDeleteTimer(e) {
    const messageDiv = e.target.closest('.message');
    const messageId = messageDiv.dataset.messageId;
    
    deleteTimeout = setTimeout(() => {
        messageDiv.remove();
        delete pendingMessages[messageId];
    }, 1000);
}

function cancelDelete() {
    clearTimeout(deleteTimeout);
}

function showTypingIndicator(show) {
    if (show) {
        if (!document.getElementById('typing-indicator')) {
            const typingDiv = document.createElement('div');
            typingDiv.className = 'typing-indicator';
            typingDiv.id = 'typing-indicator';
            typingDiv.innerHTML = `
                Friend is typing
                <div class="typing-dots">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            `;
            typingContainer.appendChild(typingDiv);
            scrollToBottom();
        }
    } else {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) typingIndicator.remove();
    }
}

function handleTyping() {
    if (!isTyping) {
        isTyping = true;
        sendTypingStatus(true);
    }
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        isTyping = false;
        sendTypingStatus(false);
    }, 2000);
}

function sendTypingStatus(typing) {
    if (activeConnection && activeConnection.open) {
        activeConnection.send({
            type: 'typing',
            isTyping: typing
        });
    }
}

function sendMessage() {
    const rawText = messageInput.value.trim();
    if (rawText && activeConnection) {
        const messageId = Date.now().toString();
        
        // Show encrypting state
        const messageDiv = addMessage("🔒 Encrypting...", true, messageId, true);
        // Encrypt and send
        const encryptedText = encrypt(rawText);
        activeConnection.send({
            type: 'message',
            text: encryptedText,
            id: messageId
        });
        
        // Update UI after simulated encryption delay
        setTimeout(() => {
            messageDiv.innerHTML = messageDiv.innerHTML.replace("🔒 Encrypting...", rawText);
            messageDiv.classList.remove('pending', 'deletable');
        }, 300);
        
        messageInput.value = '';
    }
}

function updateReadReceipt(messageId) {
    const receipt = document.getElementById(`receipt-${messageId}`);
    if (receipt) {
        receipt.innerHTML = '<i class="fas fa-check-double read"></i>';
    }
}

function connectToPeer() {
    // Added check for peer initialization
    if (!peer) {
        updateStatus('Connection system not ready yet', 'error');
        return;
    }
    
    const friendId = friendIdInput.value.trim();
    if (!friendId) {
        updateStatus('Please enter a friend ID', 'error');
        return;
    }
    
    try {
        const conn = peer.connect(friendId);
        
        conn.on('open', () => {
            activeConnection = conn;
            updateStatus(`Connected to ${friendId}`, 'success');
            addSystemMessage(`Connected to ${friendId}`);
            
            conn.on('data', (data) => {
                if (data.type === 'message') {
                    const decryptedText = decrypt(data.text);
                    addMessage(decryptedText.includes("[DECRYPTION") ? 
                        "🔒 Couldn't decrypt (wrong password?)" : decryptedText, 
                        false
                    );
                    sendReadReceipt(data.id);
                } else if (data.type === 'file') {
                    try {
                        const decryptedData = decrypt(data.data);
                        if (decryptedData.includes("[DECRYPTION")) {
                            addMessage("🔒 Couldn't decrypt file (wrong password?)", false);
                        } else {
                            displayMediaMessage(data.filename, decryptedData, data.fileType, false, data.id);
                        }
                        sendReadReceipt(data.id);
                    } catch (e) {
                        console.error("File decryption error:", e);
                        addMessage("🔒 File decryption failed", false);
                    }
                } else if (data.type === 'typing') {
                    showTypingIndicator(data.isTyping);
                } else if (data.type === 'read-receipt') {
                    updateReadReceipt(data.messageId);
                } else if (data.type === 'audio') {
                    try {
                        const decryptedAudio = decrypt(data.audio);
                        if (decryptedAudio.includes("[DECRYPTION")) {
                            addMessage("🔒 Couldn't decrypt audio (wrong password?)", false);
                        } else {
                            displayAudioMessage(decryptedAudio, false, data.id);
                        }
                        sendReadReceipt(data.id);
                    } catch (e) {
                        console.error("Audio decryption error:", e);
                        addMessage("🔒 Audio decryption failed", false);
                    }
                }
            });
        });
        
        conn.on('error', (err) => {
            updateStatus(`Connection error: ${err}`, 'error');
        });
        
    } catch (err) {
        console.error('Connection failed:', err);
        updateStatus('Connection failed', 'error');
    }
}

function sendReadReceipt(messageId) {
    if (activeConnection && activeConnection.open) {
        activeConnection.send({
            type: 'read-receipt',
            messageId: messageId
        });
    }
}

function copyPeerId() {
    if (!peer || !peer.id) {
        updateStatus('ID not available yet', 'error');
        return;
    }
    navigator.clipboard.writeText(peer.id);
    addSystemMessage('Copied your ID to clipboard!');
}

function scrollToBottom() {
    chatBox.scrollTop = chatBox.scrollHeight;
}

function handleKeyDown(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
}