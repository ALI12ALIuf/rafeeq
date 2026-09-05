// ========== chat-system.js - النسخة النهائية (الصور تختفي نهائياً) ==========
// نظام الدردشة E2EE + الصور (مع مسح الصور عند الخروج)

const ChatSystem = {
    currentChat: null, messages: {},
    friendInConversation: false,
    chatItemTemplate: null,
    _isDisplaying: false,
    _tempImageUrls: [], // ✅ لتتبع روابط الصور المؤقتة
    
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
                try { 
                    const data = JSON.parse(localStorage.getItem(k)) || [];
                    // ✅ نحتفظ فقط بالرسائل النصية، نمسح الصور
                    this.messages[fid] = data.filter(msg => msg.type === 'text');
                    localStorage.setItem(k, JSON.stringify(this.messages[fid]));
                } catch (e) { this.messages[fid] = []; } 
            } 
        } 
    },
    
    // ==================== القسم 3: openChat ====================
    openChat(friendId, friendName, friendAvatar) {
        if (this.currentChat && this.currentChat !== friendId) {
            console.log('🧹 تنظيف المحادثة السابقة قبل فتح محادثة جديدة:', this.currentChat);
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
        
        // ✅ عرض الرسائل النصية فقط
        this.displayMessages(friendId);
        
        setTimeout(() => { const inp = document.getElementById('messageInput'); if (inp) inp.focus(); }, 300);
        setTimeout(() => { const c = document.getElementById('messagesContainer'); if (c) c.scrollTop = c.scrollHeight; }, 100);
    },
    
    // ==================== القسم 4: closeChat (مسح كل شيء) ====================
    closeChat() {
        console.log('🔴 closeChat - بدء إغلاق المحادثة');
        const chatId = this.currentChat;
        
        // ✅ مسح جميع روابط الصور المؤقتة
        this._tempImageUrls.forEach(url => {
            try { URL.revokeObjectURL(url); } catch(e) {}
        });
        this._tempImageUrls = [];
        
        // ✅ مسح حاوية الرسائل بالكامل (يزيل الإطارات)
        const container = document.getElementById('messagesContainer');
        if (container) {
            container.innerHTML = '';
        }
        
        if (chatId) {
            // ✅ نحتفظ فقط بالرسائل النصية، نمسح الصور نهائياً
            const key = `chat_${chatId}`;
            const messages = this.messages[chatId] || [];
            const textMessages = messages.filter(msg => msg.type === 'text');
            this.messages[chatId] = textMessages;
            localStorage.setItem(key, JSON.stringify(textMessages));
            console.log('✅ تم مسح الصور من localStorage');
            
            // ✅ مسح أي صور متبقية في DOM
            document.querySelectorAll('img').forEach(el => {
                if (el.src && el.src.startsWith('blob:')) {
                    URL.revokeObjectURL(el.src);
                    el.src = '';
                }
            });
        }
        
        document.body.classList.remove('conversation-open');
        document.getElementById('conversationPage').style.display = 'none';
        document.querySelector('.chat-page').style.display = 'block';
        this.currentChat = null;
        this.friendInConversation = false;
        console.log('✅ closeChat - انتهى (تم مسح جميع الصور والإطارات)');
    },
    
    // ==================== القسم 5: cleanConversationData ====================
    cleanConversationData(chatId, cleanAll = false) {
        console.log('🧹 بدء مسح بيانات المحادثة:', chatId);
        const key = `chat_${chatId}`;
        
        // ✅ مسح جميع روابط الصور المؤقتة
        this._tempImageUrls.forEach(url => {
            try { URL.revokeObjectURL(url); } catch(e) {}
        });
        this._tempImageUrls = [];
        
        if (cleanAll) {
            localStorage.removeItem(key);
            delete this.messages[chatId];
            console.log('✅ تم مسح localStorage بالكامل');
        } else {
            const messages = this.messages[chatId] || [];
            // ✅ نحتفظ فقط بالرسائل النصية
            const textMessages = messages.filter(msg => msg.type === 'text').slice(-100);
            this.messages[chatId] = textMessages;
            localStorage.setItem(key, JSON.stringify(textMessages));
            console.log('✅ تم الاحتفاظ بآخر 100 رسالة نصية فقط (تم مسح الصور)');
        }
        
        // ✅ مسح جميع الصور من DOM
        document.querySelectorAll('img').forEach(el => {
            if (el.src && el.src.startsWith('blob:')) {
                URL.revokeObjectURL(el.src);
                el.src = '';
            }
        });
        
        // ✅ مسح حاوية الرسائل
        if (this.currentChat === chatId) {
            const messagesContainer = document.getElementById('messagesContainer');
            if (messagesContainer) {
                messagesContainer.innerHTML = '';
            }
        }
        console.log('✅ اكتمل مسح بيانات المحادثة:', chatId);
    },
    
    // ==================== القسم 6: displayMessages ====================
    displayMessages(friendId) { 
        const c = document.getElementById('messagesContainer'); 
        if (!c) return;
        
        if (this._isDisplaying) {
            console.log('⏳ جاري عرض الرسائل بالفعل، تخطي...');
            return;
        }
        
        this._isDisplaying = true;
        
        try {
            c.innerHTML = ''; 
            const messages = this.messages[friendId] || [];
            // ✅ نعرض فقط الرسائل النصية (الصور لا تُحفظ)
            messages.forEach(msg => { 
                if (msg.type === 'text') {
                    this.displayMessage(msg); 
                }
            });
            c.scrollTop = c.scrollHeight;
        } finally {
            this._isDisplaying = false;
        }
    },

    // ==================== القسم 7: displayMessage ====================
    displayMessage(msg) {
        const c = document.getElementById('messagesContainer'); 
        if (!c) return;
        
        if (document.getElementById(`msg-${msg.id}`)) {
            return;
        }
        
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
        
        // ==================== معالجة الرسائل النصية فقط ====================
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
                    textSpan.textContent = msg.text || '';
                }
                div.appendChild(clone);
                c.appendChild(div);
                c.scrollTop = c.scrollHeight;
            }
        }
        // ==================== الصور: نعرضها مؤقتاً فقط ====================
        else if (msg.type === 'image' && msg.data) {
            const templateImg = document.getElementById('imageMessageTemplate');
            if (templateImg) {
                const clone = templateImg.content.cloneNode(true);
                const wrapper = clone.querySelector('.message-image-wrapper');
                if (wrapper) {
                    wrapper.style.border = `2px solid ${borderColor}`;
                    const img = wrapper.querySelector('.message-image-content');
                    if (img) {
                        img.src = msg.data;
                        // ✅ تتبع الرابط المؤقت
                        if (msg.data.startsWith('blob:')) {
                            this._tempImageUrls.push(msg.data);
                        }
                        img.onclick = () => this.showImagePreview(msg.data);
                        img.oncontextmenu = (e) => e.preventDefault();
                        img.ondragstart = (e) => e.preventDefault();
                    }
                }
                div.appendChild(clone);
                c.appendChild(div);
                c.scrollTop = c.scrollHeight;
            }
        }
    },
    
    // ==================== القسم 8: showImagePreview ====================
    showImagePreview(imageSrc) {
        const modal = document.getElementById('imagePreviewModal');
        const img = document.getElementById('previewImage');
        if (!modal || !img) return;
        img.src = imageSrc;
        modal.style.display = 'flex';
        this.setupImageZoom(modal, img);
    },
    
    // ==================== القسم 9: setupImageZoom ====================
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

    // ==================== القسم 10: closeImagePreview ====================
    closeImagePreview() {
        const modal = document.getElementById('imagePreviewModal');
        const img = document.getElementById('previewImage');
        if (modal) modal.style.display = 'none';
        if (img) { img.src = ''; img.style.transform = 'none'; }
    },

    // ==================== القسم 11: downloadPreviewImage ====================
    downloadPreviewImage() {
        const img = document.getElementById('previewImage');
        if (!img || !img.src) return;
        const link = document.createElement('a');
        link.href = img.src;
        link.download = 'image.jpg';
        link.click();
    },

    // ==================== القسم 12: sendMessage ====================
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
            console.log('✅ تم إرسال النص عبر Firebase (تشفير E2EE)');
            return true; 
        } catch (e) { 
            console.error('❌ فشل إرسال النص:', e);
            return false; 
        } 
    },

    // ==================== القسم 13: sendImage ====================
    async sendImage(file) { 
        if (!this.currentChat) {
            console.error('❌ لا توجد محادثة نشطة');
            return;
        }
        
        try {
            console.log('📸 بدء ضغط الصورة...');
            const compressedBlob = await SecureChatSystem.compressImage(file);
            console.log('✅ تم ضغط الصورة');
            
            const arrayBuffer = await compressedBlob.arrayBuffer();
            const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            
            const pr = await SecureChatSystem.getMyPrivateKey();
            const pu = await SecureChatSystem.getReceiverPublicKey(this.currentChat);
            if (!pr || !pu) {
                console.error('❌ فشل الحصول على المفاتيح');
                return;
            }
            
            const sk = await SecureChatSystem.deriveSharedKey(pr, pu);
            const encrypted = await SecureChatSystem.encryptData(base64Data, sk);
            
            const msgId = Date.now().toString();
            console.log('📤 إرسال الصورة إلى السيرفر...');
            
            await SecureChatSystem.sendToServer(this.currentChat, { 
                id: msgId, 
                type: 'image', 
                data: encrypted, 
                fileName: file.name,
                timestamp: Date.now() 
            });
            
            const tempUrl = URL.createObjectURL(compressedBlob);
            
            // ✅ عرض الصورة مؤقتاً (دون حفظ في localStorage)
            const msgObj = { 
                id: msgId, 
                type: 'image', 
                data: tempUrl, 
                fileName: file.name, 
                sender: 'me', 
                time: new Date().toISOString(), 
                status: 'sent', 
                _blobUrl: tempUrl 
            };
            
            // ✅ لا نحفظ الصورة في localStorage
            // this.saveMessage(this.currentChat, msgObj); ← تم إلغاء حفظ الصور
            
            // ✅ نعرض الصورة فقط
            this.displayMessage(msgObj);
            
            console.log('✅ تم إرسال الصورة وعرضها (لن تُحفظ)');
        } catch (e) {
            console.error('❌ فشل إرسال الصورة:', e);
            alert('فشل إرسال الصورة: ' + (e.message || 'خطأ غير معروف'));
        }
    },

    // ==================== القسم 14: saveMessage (للنصوص فقط) ====================
    saveMessage(friendId, message) { 
        // ✅ نحفظ فقط الرسائل النصية
        if (message.type !== 'text') {
            console.log(`📝 نوع الرسالة (${message.type}) لن يُحفظ`);
            return;
        }
        
        const key = `chat_${friendId}`; 
        let messages = []; 
        try { 
            messages = JSON.parse(localStorage.getItem(key)) || []; 
        } catch (e) { 
            messages = []; 
        }
        
        const exists = messages.some(m => m.id === message.id);
        if (exists) {
            console.log(`⚠️ الرسالة ${message.id} موجودة بالفعل، تخطي الحفظ`);
            return;
        }
        
        messages.push(message); 
        
        if (messages.length > 100) {
            const excessCount = messages.length - 100;
            const removeCount = excessCount + 50;
            messages = messages.slice(removeCount);
            console.log(`🧹 تم حذف ${removeCount} رسالة قديمة (الحد الأقصى 100 رسالة)`);
        }
        
        try { 
            localStorage.setItem(key, JSON.stringify(messages)); 
        } catch (e) {
            const removeCount = Math.min(50, messages.length);
            messages = messages.slice(removeCount);
            try { 
                localStorage.setItem(key, JSON.stringify(messages)); 
                console.log(`🧹 مساحة غير كافية - تم حذف ${removeCount} رسالة قديمة`);
            } catch (e2) { 
                messages = messages.slice(-50);
                try { 
                    localStorage.setItem(key, JSON.stringify(messages)); 
                    console.log(`🧹 مساحة غير كافية - تم الاحتفاظ بآخر 50 رسالة فقط`);
                } catch (e3) {}
            }
        }
        
        this.messages[friendId] = messages; 
    },

    // ==================== القسم 15: updateLastMessage ====================
    updateLastMessage(friendId, lastMessage) { 
        document.querySelectorAll('.chat-item').forEach(item => { 
            if (item.getAttribute('onclick')?.includes(friendId)) { 
                const lm = item.querySelector('.last-message'), tm = item.querySelector('.chat-time'); 
                if (lm) lm.textContent = lastMessage; 
                if (tm) tm.textContent = 'الآن'; 
            } 
        }); 
    },

    // ==================== القسم 16: escapeHtml ====================
    escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; },
    
    // ==================== القسم 17: showProgressBar ====================
    showProgressBar(message, percent) {
        const bar = document.getElementById('progressBar');
        if (!bar) return;
        bar.style.display = 'flex';
        const fill = document.getElementById('progressFill');
        const perc = document.getElementById('progressPercent');
        if (fill) fill.style.width = '0%';
        if (perc) perc.textContent = '0%';
    },
    
    // ==================== القسم 18: updateProgressBar ====================
    updateProgressBar(percent, message) {
        const fill = document.getElementById('progressFill');
        const perc = document.getElementById('progressPercent');
        if (fill) fill.style.width = Math.min(percent, 100) + '%';
        if (perc) perc.textContent = Math.round(percent) + '%';
    },
    
    // ==================== القسم 19: hideProgressBar ====================
    hideProgressBar() { 
        const bar = document.getElementById('progressBar'); 
        if (bar) bar.style.display = 'none'; 
    }
};

// ==================== القسم 20: تشغيل النظام ====================
ChatSystem.init();

// ==================== القسم 21: دوال الواجهة العامة ====================
window.sendMessage = () => { 
    const inp = document.getElementById('messageInput'); 
    if (inp && inp.value.trim()) {
        ChatSystem.sendMessage(inp.value.trim()).then(s => { 
            if (s) { 
                inp.value = ''; 
                inp.style.height = 'auto';
                if (typeof window.toggleSendButton === 'function') {
                    window.toggleSendButton();
                }
            } 
        }); 
    }
};

window.handleMessageKeyPress = function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
    }
};

window.toggleSendButton = function() {
    const input = document.getElementById('messageInput');
    const btn = document.getElementById('actionBtn');
    if (!input || !btn) return;
    
    const hasText = input.value.trim().length > 0;
    
    if (hasText) {
        btn.className = 'send-mode';
        btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        btn.title = 'إرسال';
        btn.style.background = 'var(--primary)';
        btn.style.color = 'white';
    } else {
        btn.className = 'send-mode';
        btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        btn.title = 'إرسال';
        btn.style.background = 'var(--primary)';
        btn.style.color = 'white';
    }
    btn.style.display = 'flex';
};

window.handleActionButton = function() {
    const input = document.getElementById('messageInput');
    if (!input) return;
    const hasText = input.value.trim().length > 0;
    if (hasText) {
        window.sendMessage();
    }
};

window.sendImage = function() {
    console.log('📸 فتح نافذة اختيار الصورة');
    const i = document.createElement('input'); 
    i.type = 'file'; 
    i.accept = 'image/*'; 
    i.onchange = function(e) { 
        const f = e.target.files[0]; 
        if (f) {
            console.log('📸 تم اختيار صورة:', f.name, f.size);
            if (ChatSystem.currentChat) {
                ChatSystem.sendImage(f);
            } else {
                alert('الرجاء فتح محادثة أولاً');
            }
        }
    }; 
    i.click(); 
};

window.closeImagePreview = function() {
    ChatSystem.closeImagePreview();
};

window.downloadPreviewImage = function() {
    ChatSystem.downloadPreviewImage();
};

// ==================== القسم 22: التنظيف الشامل ====================
function performGlobalCleanup() {
    console.log('🧹 بدء التنظيف الشامل للموقع...');
    
    document.querySelectorAll('img').forEach(el => {
        if (el.src && el.src.startsWith('blob:')) {
            URL.revokeObjectURL(el.src);
            el.src = '';
        }
    });
    
    const modals = ['imagePreviewModal'];
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
    
    console.log('✅ اكتمل التنظيف الشامل للموقع');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', performGlobalCleanup);
} else {
    performGlobalCleanup();
}

// ==================== القسم 23: إصلاح الكيبورد ====================
const initVisualViewportFix = () => {
    if (!window.visualViewport) return;
    const fixViewportHeight = () => {
        const conversationPage = document.querySelector('.conversation-page');
        const messagesContainer = document.querySelector('.messages-container');
        if (conversationPage && document.body.classList.contains('conversation-open')) {
            const currentViewportHeight = window.visualViewport.height;
            conversationPage.style.height = `${currentViewportHeight}px`;
            if (messagesContainer) {
                setTimeout(() => { messagesContainer.scrollTop = messagesContainer.scrollHeight; }, 30);
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

document.addEventListener('touchmove', function(e) {
    if (document.body.classList.contains('conversation-open')) {
        const isMessagesContainer = e.target.closest('.messages-container');
        if (!isMessagesContainer) {
            e.preventDefault();
        }
    }
}, { passive: false });

document.addEventListener('touchstart', function (e) {
    if (e.touches.length > 1) { e.preventDefault(); }
}, { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchend', function (e) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) { e.preventDefault(); }
    lastTouchEnd = now;
}, { passive: false });
