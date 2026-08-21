// ========== chat-system.js - النسخة المعدلة (بدون عداد + تصحيح الصور) ==========
// نظام الدردشة E2EE + إرسال الصور والبصمات عبر السيرفر

const ChatSystem = {
    currentChat: null, messages: {},
    friendInConversation: true,
    
    // ✅ قالب عنصر المحادثة
    chatItemTemplate: null,
    
    // ==================== القسم 1: init ====================
    init() { 
        this.loadAllChats(); 
        this.chatItemTemplate = document.getElementById('chatItemTemplate');
        if (!this.chatItemTemplate) {
            console.warn('⚠️ قالب chatItemTemplate غير موجود في HTML');
        } else {
            console.log('✅ تم تحميل قالب chatItemTemplate بنجاح');
        }
    },
    
    // ==================== القسم 2: loadAllChats ====================
    loadAllChats() { 
        for (let i = 0; i < localStorage.length; i++) { 
            const k = localStorage.key(i); 
            if (k && k.startsWith('chat_')) { 
                const fid = k.replace('chat_', ''); 
                try { this.messages[fid] = JSON.parse(localStorage.getItem(k)) || []; } catch (e) { this.messages[fid] = []; } 
            } 
        } 
    },
    
    // ==================== القسم 3: openChat ====================
    openChat(friendId, friendName, friendAvatar) {
        if (this.currentChat && this.currentChat !== friendId) {
            console.log('🧹 تنظيف المحادثة السابقة:', this.currentChat);
            this.cleanConversationData(this.currentChat, false);
        }
        
        this.currentChat = friendId;
        this.friendInConversation = true;
        
        document.body.classList.add('conversation-open');
        const nameEl = document.getElementById('conversationName'), avatarEl = document.getElementById('conversationAvatar');
        if (nameEl) nameEl.textContent = friendName;
        if (avatarEl) avatarEl.textContent = friendAvatar || '👤';
        document.querySelector('.chat-page').style.display = 'none'; 
        document.getElementById('conversationPage').style.display = 'flex';
        this.displayMessages(friendId);
        
        setTimeout(() => { const inp = document.getElementById('messageInput'); if (inp) inp.focus(); }, 300);
        setTimeout(() => { const c = document.getElementById('messagesContainer'); if (c) c.scrollTop = c.scrollHeight; }, 100);
        
        if (typeof window.toggleSendButton === 'function') {
            setTimeout(() => window.toggleSendButton(), 100);
        }
    },
    
    // ==================== القسم 4: displayMessages ====================
    displayMessages(friendId) { 
        const c = document.getElementById('messagesContainer'); 
        if (!c) return; 
        c.innerHTML = ''; 
        const messages = this.messages[friendId] || [];
        
        messages.forEach(msg => {
            if (msg.type === 'text' || msg.type === 'image' || msg.type === 'voice') {
                this.displayMessage(msg);
            }
        });
        
        c.scrollTop = c.scrollHeight;
    },
    
    // ==================== القسم 5: displayMessage ====================
    displayMessage(msg) {
        const c = document.getElementById('messagesContainer'); 
        if (!c) return;
        
        const formatDateTime = (dateObj) => {
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            let hours = dateObj.getHours();
            const minutes = String(dateObj.getMinutes()).padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            const formattedHours = String(hours).padStart(2, '0');
            return `${year}-${month}-${day} ${formattedHours}:${minutes} ${ampm}`;
        };
        
        const dateTime = formatDateTime(new Date(msg.time));
        const borderColor = msg.sender === 'me' ? '#2196F3' : '#4CAF50';
        
        const template = document.getElementById('messageWrapperTemplate');
        let div;
        if (template) {
            div = template.content.cloneNode(true).firstElementChild;
        } else {
            div = document.createElement('div');
            div.className = 'message';
        }
        
        div.className = `message ${msg.sender === 'me' ? 'sent' : 'received'}`;
        div.id = `msg-${msg.id}`;
        
        // ==================== الرسائل النصية ====================
        if (msg.type === 'text') {
            const textTemplate = document.getElementById('textMessageTemplate');
            if (textTemplate) {
                const clone = textTemplate.content.cloneNode(true);
                const contentDiv = clone.querySelector('.message-content');
                const textSpan = contentDiv?.querySelector('span');
                
                if (contentDiv) {
                    contentDiv.style.border = `1.5px solid ${borderColor}`;
                }
                
                if (textSpan) {
                    textSpan.innerHTML = this.escapeHtml(msg.text);
                }
                
                div.appendChild(clone);
            }
        }
        
        // ==================== الصور ====================
        else if (msg.type === 'image') {
            const templateImg = document.getElementById('imageMessageTemplate');
            if (templateImg) {
                const clone = templateImg.content.cloneNode(true);
                const wrapper = clone.querySelector('.message-image-wrapper');
                if (wrapper) {
                    wrapper.style.border = `2px solid ${borderColor}`;
                    const img = wrapper.querySelector('.message-image-content');
                    if (img) {
                        img.src = msg.data;
                        img.onclick = () => this.showImagePreview(msg.data);
                        img.oncontextmenu = (e) => e.preventDefault();
                        img.ondragstart = (e) => e.preventDefault();
                    }
                }
                div.appendChild(clone);
            }
        }
        
        // ==================== البصمات الصوتية ====================
        else if (msg.type === 'voice') {
            const templateVoice = document.getElementById('voiceMessageTemplate');
            if (templateVoice) {
                const clone = templateVoice.content.cloneNode(true);
                const voiceMsg = clone.querySelector('.voice-message');
                if (voiceMsg) {
                    voiceMsg.style.background = '#4CAF50';
                    voiceMsg.style.border = `1.5px solid ${borderColor}`;
                    const audioEl = voiceMsg.querySelector('.voice-audio-element');
                    if (audioEl && msg.data) {
                        audioEl.src = msg.data;
                        this.setupVoiceControls(clone, audioEl);
                    }
                }
                div.appendChild(clone);
            }
        }
        
        c.appendChild(div); 
        c.scrollTop = c.scrollHeight;
    },
    
    // ==================== القسم 6: setupVoiceControls ====================
    setupVoiceControls(clone, audioEl) {
        const playBtn = clone.querySelector('.voice-play-btn');
        const replayBtn = clone.querySelector('.voice-replay-btn');
        const muteBtn = clone.querySelector('.voice-mute-btn');
        const timeSpan = clone.querySelector('.voice-current-time');
        const durationSpan = clone.querySelector('.voice-duration');
        
        if (!audioEl || !audioEl.src) return;
        
        const tempAudio = new Audio(audioEl.src);
        tempAudio.addEventListener('loadedmetadata', () => {
            const duration = tempAudio.duration;
            if (durationSpan && !isNaN(duration)) {
                const minutes = Math.floor(duration / 60);
                const seconds = Math.floor(duration % 60);
                durationSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        });
        
        let isPlaying = false;
        
        if (playBtn) {
            playBtn.onclick = (e) => {
                e.stopPropagation();
                if (isPlaying) {
                    audioEl.pause();
                    playBtn.innerHTML = '<i class="fas fa-play"></i>';
                    isPlaying = false;
                } else {
                    audioEl.play();
                    playBtn.innerHTML = '<i class="fas fa-pause"></i>';
                    isPlaying = true;
                }
            };
        }
        
        if (replayBtn) {
            replayBtn.onclick = (e) => {
                e.stopPropagation();
                audioEl.pause();
                audioEl.currentTime = 0;
                if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
                isPlaying = false;
                if (timeSpan) timeSpan.textContent = '0:00';
                audioEl.play();
                if (playBtn) playBtn.innerHTML = '<i class="fas fa-pause"></i>';
                isPlaying = true;
            };
        }
        
        let isMuted = false;
        if (muteBtn) {
            muteBtn.onclick = (e) => {
                e.stopPropagation();
                if (isMuted) {
                    audioEl.muted = false;
                    muteBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                    isMuted = false;
                } else {
                    audioEl.muted = true;
                    muteBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
                    isMuted = true;
                }
            };
        }
        
        audioEl.ontimeupdate = () => {
            const minutes = Math.floor(audioEl.currentTime / 60);
            const seconds = Math.floor(audioEl.currentTime % 60);
            if (timeSpan) {
                timeSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        };
        
        audioEl.onended = () => {
            if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
            isPlaying = false;
            if (timeSpan) timeSpan.textContent = '0:00';
        };
    },
    
    // ==================== القسم 7: showImagePreview ====================
    showImagePreview(imageSrc) {
        const modal = document.getElementById('imagePreviewModal');
        const img = document.getElementById('previewImage');
        if (!modal || !img) return;
        
        img.src = imageSrc;
        modal.style.display = 'flex';
        
        this.setupImageZoom(modal, img);
    },
    
    setupImageZoom(modal, img) {
        if (img._zoomCleanup) {
            img._zoomCleanup();
            img._zoomCleanup = null;
        }
        
        let currentScale = 1;
        let initialDistance = 0;
        let initialScale = 1;
        let startX = 0, startY = 0;
        let translateX = 0, translateY = 0;
        let isTouching = false;
        
        const minScale = 0.8;
        const maxScale = 3;
        
        const updateTransform = () => {
            img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${currentScale})`;
        };
        
        const touchStartHandler = (e) => {
            e.preventDefault();
            const touches = e.touches;
            
            if (touches.length === 2) {
                const dx = touches[0].clientX - touches[1].clientX;
                const dy = touches[0].clientY - touches[1].clientY;
                initialDistance = Math.hypot(dx, dy);
                initialScale = currentScale;
                isTouching = false;
            } else if (touches.length === 1) {
                startX = touches[0].clientX - translateX;
                startY = touches[0].clientY - translateY;
                isTouching = true;
            }
        };
        
        const touchMoveHandler = (e) => {
            e.preventDefault();
            const touches = e.touches;
            
            if (touches.length === 2 && initialDistance > 0) {
                const dx = touches[0].clientX - touches[1].clientX;
                const dy = touches[0].clientY - touches[1].clientY;
                const newDistance = Math.hypot(dx, dy);
                let newScale = initialScale * (newDistance / initialDistance);
                newScale = Math.min(maxScale, Math.max(minScale, newScale));
                
                if (newScale !== currentScale) {
                    currentScale = newScale;
                    updateTransform();
                }
            } else if (touches.length === 1 && isTouching && currentScale > 1) {
                translateX = touches[0].clientX - startX;
                translateY = touches[0].clientY - startY;
                
                const maxTranslateX = (currentScale - 1) * 200;
                const maxTranslateY = (currentScale - 1) * 200;
                translateX = Math.min(maxTranslateX, Math.max(-maxTranslateX, translateX));
                translateY = Math.min(maxTranslateY, Math.max(-maxTranslateY, translateY));
                
                updateTransform();
            }
        };
        
        const touchEndHandler = (e) => {
            e.preventDefault();
            initialDistance = 0;
            isTouching = false;
            
            if (currentScale < 0.95) {
                currentScale = 1;
                translateX = 0;
                translateY = 0;
                updateTransform();
            }
        };
        
        img.addEventListener('touchstart', touchStartHandler);
        img.addEventListener('touchmove', touchMoveHandler, { passive: false });
        img.addEventListener('touchend', touchEndHandler);
        
        img._zoomCleanup = () => {
            img.removeEventListener('touchstart', touchStartHandler);
            img.removeEventListener('touchmove', touchMoveHandler);
            img.removeEventListener('touchend', touchEndHandler);
        };
    },
    
    // ==================== القسم 8: closeImagePreview ====================
    closeImagePreview() {
        const modal = document.getElementById('imagePreviewModal');
        const img = document.getElementById('previewImage');
        if (modal) modal.style.display = 'none';
        if (img) { img.src = ''; img.style.transform = 'none'; }
    },
    
    downloadPreviewImage() {
        const img = document.getElementById('previewImage');
        if (!img || !img.src) return;
        const link = document.createElement('a');
        link.href = img.src;
        link.download = 'image.jpg';
        link.click();
    },
    
    // ==================== القسم 9: sendMessage ====================
    async sendMessage(text) { 
        if (!this.currentChat || !text.trim()) return false; 
        const mid = Date.now().toString(); 
        
        try { 
            const pr = await SecureChatSystem.getMyPrivateKey(), pu = await SecureChatSystem.getReceiverPublicKey(this.currentChat); 
            if (!pr || !pu) return false;
            const sk = await SecureChatSystem.deriveSharedKey(pr, pu), enc = await SecureChatSystem.encryptData(text.trim(), sk); 
            await SecureChatSystem.sendToServer(this.currentChat, { id: mid, type: 'text', data: enc, timestamp: Date.now() }); 
            this.saveMessage(this.currentChat, { id: mid, type: 'text', text: text.trim(), sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
            this.displayMessage({ id: mid, type: 'text', text: text.trim(), sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
            console.log('✅ تم إرسال النص عبر Firebase');
            return true; 
        } catch (e) { 
            console.error('❌ فشل إرسال النص:', e);
            return false; 
        } 
    },
    
    // ==================== القسم 10: sendImage ====================
    async sendImage(file) { 
        if (!this.currentChat) return;
        
        try {
            const compressedBlob = await SecureChatSystem.compressImage(file);
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                try {
                    const base64Data = e.target.result;
                    const pr = await SecureChatSystem.getMyPrivateKey();
                    const pu = await SecureChatSystem.getReceiverPublicKey(this.currentChat);
                    if (!pr || !pu) return;
                    const sk = await SecureChatSystem.deriveSharedKey(pr, pu);
                    
                    const chunkSize = 50000;
                    const totalChunks = Math.ceil(base64Data.length / chunkSize);
                    const msgId = Date.now().toString();
                    
                    // ✅ استخدام معرف موحد لجميع الأجزاء
                    const packageId = msgId + '_' + Date.now();
                    
                    for (let i = 0; i < totalChunks; i++) {
                        const start = i * chunkSize;
                        const end = Math.min(start + chunkSize, base64Data.length);
                        const chunk = base64Data.substring(start, end);
                        
                        // ✅ تشفير البيانات كاملة مع معلومات القطعة
                        const chunkData = {
                            chunk: i,
                            total: totalChunks,
                            data: chunk,
                            fileName: file.name || 'صورة',
                            packageId: packageId
                        };
                        
                        const encrypted = await SecureChatSystem.encryptData(JSON.stringify(chunkData), sk);
                        
                        await SecureChatSystem.sendToServer(this.currentChat, {
                            id: packageId + '_' + i,
                            type: 'image_chunk',
                            data: encrypted,
                            timestamp: Date.now()
                        });
                        
                        console.log(`📤 إرسال قطعة ${i+1}/${totalChunks}`);
                    }
                    
                    // ✅ عرض الصورة مؤقتاً في الواجهة
                    const tempUrl = URL.createObjectURL(compressedBlob);
                    this.saveMessage(this.currentChat, { 
                        id: msgId, 
                        type: 'image', 
                        data: tempUrl, 
                        fileName: file.name || 'صورة',
                        sender: 'me', 
                        time: new Date().toISOString(), 
                        status: 'sent',
                        _blobUrl: tempUrl
                    });
                    this.displayMessage({ 
                        id: msgId, 
                        type: 'image', 
                        data: tempUrl, 
                        fileName: file.name || 'صورة',
                        sender: 'me', 
                        time: new Date().toISOString(), 
                        status: 'sent',
                        _blobUrl: tempUrl
                    });
                    
                    console.log('✅ تم إرسال الصورة بنجاح');
                } catch (err) {
                    console.error('❌ فشل إرسال الصورة:', err);
                    alert('فشل إرسال الصورة');
                }
            };
            
            reader.readAsDataURL(compressedBlob);
        } catch (err) {
            console.error('❌ فشل ضغط الصورة:', err);
            alert('فشل معالجة الصورة');
        }
    },
    
    // ==================== القسم 11: sendVoiceNote ====================
    async sendVoiceNote(audioBlob) { 
        if (!this.currentChat) return;
        
        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const base64Data = e.target.result;
                    const pr = await SecureChatSystem.getMyPrivateKey();
                    const pu = await SecureChatSystem.getReceiverPublicKey(this.currentChat);
                    if (!pr || !pu) return;
                    const sk = await SecureChatSystem.deriveSharedKey(pr, pu);
                    
                    const chunkSize = 50000;
                    const totalChunks = Math.ceil(base64Data.length / chunkSize);
                    const msgId = Date.now().toString();
                    const packageId = msgId + '_' + Date.now();
                    
                    for (let i = 0; i < totalChunks; i++) {
                        const start = i * chunkSize;
                        const end = Math.min(start + chunkSize, base64Data.length);
                        const chunk = base64Data.substring(start, end);
                        
                        const chunkData = {
                            chunk: i,
                            total: totalChunks,
                            data: chunk,
                            packageId: packageId
                        };
                        
                        const encrypted = await SecureChatSystem.encryptData(JSON.stringify(chunkData), sk);
                        
                        await SecureChatSystem.sendToServer(this.currentChat, {
                            id: packageId + '_' + i,
                            type: 'voice_chunk',
                            data: encrypted,
                            timestamp: Date.now()
                        });
                        
                        console.log(`📤 إرسال قطعة صوت ${i+1}/${totalChunks}`);
                    }
                    
                    const tempUrl = URL.createObjectURL(audioBlob);
                    this.saveMessage(this.currentChat, { 
                        id: msgId, 
                        type: 'voice', 
                        data: tempUrl, 
                        sender: 'me', 
                        time: new Date().toISOString(), 
                        status: 'sent',
                        _blobUrl: tempUrl
                    });
                    this.displayMessage({ 
                        id: msgId, 
                        type: 'voice', 
                        data: tempUrl, 
                        sender: 'me', 
                        time: new Date().toISOString(), 
                        status: 'sent',
                        _blobUrl: tempUrl
                    });
                    
                    console.log('✅ تم إرسال البصمة الصوتية بنجاح');
                } catch (err) {
                    console.error('❌ فشل إرسال البصمة:', err);
                    alert('فشل إرسال البصمة الصوتية');
                }
            };
            reader.readAsDataURL(audioBlob);
        } catch (err) {
            console.error('❌ فشل معالجة البصمة:', err);
            alert('فشل معالجة البصمة الصوتية');
        }
    },
    
    // ==================== القسم 12: saveMessage ====================
    saveMessage(friendId, message) { 
        if (message.type !== 'text' && message.type !== 'image' && message.type !== 'voice') {
            return;
        }
        
        const key = `chat_${friendId}`; 
        let messages = []; 
        try { 
            messages = JSON.parse(localStorage.getItem(key)) || []; 
        } catch (e) { 
            messages = []; 
        }
        
        messages.push(message); 
        
        if (messages.length > 100) {
            const excessCount = messages.length - 100;
            const removeCount = excessCount + 50;
            messages = messages.slice(removeCount);
        }
        
        try { 
            localStorage.setItem(key, JSON.stringify(messages)); 
        } catch (e) {
            const removeCount = Math.min(50, messages.length);
            messages = messages.slice(removeCount);
            try { 
                localStorage.setItem(key, JSON.stringify(messages)); 
            } catch (e2) { 
                messages = messages.slice(-50);
                try { 
                    localStorage.setItem(key, JSON.stringify(messages)); 
                } catch (e3) {}
            }
        }
        
        this.messages[friendId] = messages; 
    },
    
    // ==================== القسم 13: closeChat ====================
    closeChat() {
        console.log('🔴 closeChat - بدء إغلاق المحادثة');
        
        const chatId = this.currentChat;
        
        if (chatId) {
            this.cleanConversationData(chatId, false);
        }
        
        document.body.classList.remove('conversation-open');
        document.getElementById('conversationPage').style.display = 'none';
        document.querySelector('.chat-page').style.display = 'block';
        
        this.currentChat = null;
        this.friendInConversation = false;
        
        console.log('✅ closeChat - انتهى');
    },
    
    // ==================== القسم 14: cleanConversationData ====================
    cleanConversationData(chatId, cleanAll = false) {
        console.log('🧹 بدء مسح بيانات المحادثة:', chatId);
        
        const key = `chat_${chatId}`;
        if (cleanAll) {
            localStorage.removeItem(key);
            delete this.messages[chatId];
        } else {
            const messages = this.messages[chatId] || [];
            const textMessages = messages.filter(msg => msg.type === 'text' || msg.type === 'image' || msg.type === 'voice').slice(-100);
            this.messages[chatId] = textMessages;
            localStorage.setItem(key, JSON.stringify(textMessages));
        }
        
        document.querySelectorAll('img, video, audio').forEach(el => {
            if (el.src && el.src.startsWith('blob:')) {
                URL.revokeObjectURL(el.src);
                el.src = '';
            }
        });
        
        if (this.currentChat === chatId) {
            const messagesContainer = document.getElementById('messagesContainer');
            if (messagesContainer) {
                messagesContainer.innerHTML = '';
            }
        }
    },
    
    // ==================== القسم 15: escapeHtml ====================
    escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
};

// ==================== القسم 16: تشغيل النظام ====================
ChatSystem.init();

// ==================== القسم 17: دوال عامة ====================
window.sendImage = () => { 
    const i = document.createElement('input'); 
    i.type = 'file'; 
    i.accept = 'image/*'; 
    i.onchange = e => { 
        const f = e.target.files[0]; 
        if (f && ChatSystem.currentChat) ChatSystem.sendImage(f); 
    }; 
    i.click(); 
    document.getElementById('attachmentMenu').style.display = 'none'; 
};

// ==================== القسم 18: التنظيف الشامل ====================
function performGlobalCleanup() {
    document.querySelectorAll('img, video, audio').forEach(el => {
        if (el.src && el.src.startsWith('blob:')) {
            URL.revokeObjectURL(el.src);
            el.src = '';
        }
    });
    
    const modals = ['incomingCall', 'imagePreviewModal'];
    modals.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'none';
            if (id === 'imagePreviewModal') {
                const img = document.getElementById('previewImage');
                if (img) img.src = '';
            }
        }
    });
    
    const attachmentMenu = document.getElementById('attachmentMenu');
    if (attachmentMenu) attachmentMenu.style.display = 'none';
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', performGlobalCleanup);
} else {
    performGlobalCleanup();
}

// ✅ الحل النهائي للكيبورد
const initVisualViewportFix = () => {
    if (!window.visualViewport) return;

    const fixViewportHeight = () => {
        const conversationPage = document.querySelector('.conversation-page');
        const messagesContainer = document.querySelector('.messages-container');
        
        if (conversationPage && document.body.classList.contains('conversation-open')) {
            const currentViewportHeight = window.visualViewport.height;
            conversationPage.style.height = `${currentViewportHeight}px`;
            if (messagesContainer) {
                setTimeout(() => {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }, 30);
            }
        }
    };

    window.visualViewport.addEventListener('resize', fixViewportHeight);
    window.visualViewport.addEventListener('scroll', fixViewportHeight);
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVisualViewportFix);
} else {
    initVisualViewportFix();
}

// منع سحب الواجهة
document.addEventListener('touchmove', function(e) {
    if (document.body.classList.contains('conversation-open')) {
        const isMessagesContainer = e.target.closest('.messages-container');
        if (!isMessagesContainer) {
            e.preventDefault();
        }
    }
}, { passive: false });

// منع التكبير
document.addEventListener('touchstart', function (e) {
    if (e.touches.length > 1) {
        e.preventDefault();
    }
}, { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchend', function (e) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        e.preventDefault();
    }
    lastTouchEnd = now;
}, { passive: false });

console.log('✅ ChatSystem جاهز (بدون عداد + تصحيح الصور)');
