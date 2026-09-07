// ========== chat-system.js - النسخة النهائية المصححة (إزالة الإطارات الفارغة) ==========
// نظام الدردشة E2EE + الصور

const ChatSystem = {
    currentChat: null, messages: {},
    friendInConversation: false,
    chatItemTemplate: null,
    _displayedIds: new Set(),
    
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
                    // ✅ تنظيف الصور بدون بيانات
                    const cleaned = data.filter(m => {
                        if (m.type === 'image' && (!m.data || m.data === '')) {
                            console.log(`🧹 تنظيف صورة بدون بيانات: ${m.id}`);
                            return false;
                        }
                        return true;
                    });
                    this.messages[fid] = cleaned;
                    if (cleaned.length !== data.length) {
                        localStorage.setItem(k, JSON.stringify(cleaned));
                    }
                } catch (e) { 
                    this.messages[fid] = []; 
                } 
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
        this._displayedIds = new Set();
        
        document.body.classList.add('conversation-open');
        const nameEl = document.getElementById('conversationName'), avatarEl = document.getElementById('conversationAvatar');
        if (nameEl) nameEl.textContent = friendName;
        if (avatarEl) avatarEl.textContent = friendAvatar || '👤';
        document.querySelector('.chat-page').style.display = 'none'; 
        document.getElementById('conversationPage').style.display = 'flex';
        
        this.displayMessages(friendId);
        
        setTimeout(() => { const inp = document.getElementById('messageInput'); if (inp) inp.focus(); }, 300);
        setTimeout(() => { const c = document.getElementById('messagesContainer'); if (c) c.scrollTop = c.scrollHeight; }, 100);
    },
    
    // ==================== القسم 4: closeChat ====================
    closeChat() {
        console.log('🔴 closeChat - بدء إغلاق المحادثة');
        const chatId = this.currentChat;
        
        if (chatId) {
            const key = `chat_${chatId}`;
            const messages = this.messages[chatId] || [];
            // ✅ تنظيف الصور بدون بيانات قبل الحفظ
            const cleanedMessages = messages.filter(m => {
                if (m.type === 'image' && (!m.data || m.data === '')) {
                    return false;
                }
                return true;
            });
            localStorage.setItem(key, JSON.stringify(cleanedMessages));
            console.log('✅ تم حفظ البيانات في localStorage');
            
            document.querySelectorAll('img').forEach(el => {
                if (el.src && el.src.startsWith('blob:')) {
                    URL.revokeObjectURL(el.src);
                    el.src = '';
                }
            });
        }
        
        // ✅ مسح حاوية الرسائل بالكامل
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
            console.log('✅ تم مسح حاوية الرسائل بالكامل');
        }
        
        this._displayedIds = new Set();
        document.body.classList.remove('conversation-open');
        document.getElementById('conversationPage').style.display = 'none';
        document.querySelector('.chat-page').style.display = 'block';
        this.currentChat = null;
        this.friendInConversation = false;
        console.log('✅ closeChat - انتهى');
    },
    
    // ==================== القسم 5: cleanConversationData ====================
    cleanConversationData(chatId, cleanAll = false) {
        console.log('🧹 بدء مسح بيانات المحادثة:', chatId);
        const key = `chat_${chatId}`;
        if (cleanAll) {
            localStorage.removeItem(key);
            delete this.messages[chatId];
            console.log('✅ تم مسح localStorage بالكامل');
        } else {
            const messages = this.messages[chatId] || [];
            // ✅ تنظيف الصور بدون بيانات
            const cleaned = messages.filter(m => {
                if (m.type === 'image' && (!m.data || m.data === '')) {
                    return false;
                }
                return true;
            });
            const savedMessages = cleaned.slice(-100);
            this.messages[chatId] = savedMessages;
            localStorage.setItem(key, JSON.stringify(savedMessages));
            console.log('✅ تم الاحتفاظ بآخر 100 رسالة');
        }
        
        document.querySelectorAll('img').forEach(el => {
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
        console.log('✅ اكتمل مسح بيانات المحادثة:', chatId);
    },
    
    // ==================== القسم 6: displayMessages ====================
    displayMessages(friendId) { 
        const c = document.getElementById('messagesContainer'); 
        if (!c) return; 
        
        if (this._displayedIds.size === 0) {
            c.innerHTML = '';
        }
        
        const messages = this.messages[friendId] || [];
        console.log(`📨 عرض ${messages.length} رسالة للمحادثة ${friendId}`);
        
        messages.forEach(msg => { 
            if (!this._displayedIds.has(msg.id)) {
                this.displayMessage(msg);
            }
        });
        
        setTimeout(() => {
            c.scrollTop = c.scrollHeight;
        }, 50);
    },

    // ==================== القسم 7: displayMessage (مصحح - تجاهل الصور بدون بيانات) ====================
    displayMessage(msg) {
        if (this._displayedIds.has(msg.id)) return;
        
        // ✅ تجاهل الصور التي ليس لها بيانات صالحة
        if (msg.type === 'image' && (!msg.data || msg.data === '')) {
            console.log(`⚠️ تجاهل صورة بدون بيانات: ${msg.id}`);
            return;
        }
        
        this._displayedIds.add(msg.id);
        
        const c = document.getElementById('messagesContainer'); 
        if (!c) return;
        
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
        
        // ==================== معالجة الرسائل النصية ====================
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
                    textSpan.innerHTML = this.escapeHtml(msg.text || '');
                }
                div.appendChild(clone);
            }
        }
        
        // ==================== معالجة الصورة (مصححة) ====================
        else if (msg.type === 'image') {
            // ✅ التحقق من وجود بيانات صالحة للصورة
            if (!msg.data || msg.data === '') {
                console.log(`⚠️ تخطي عرض الصورة ${msg.id} - لا توجد بيانات`);
                return;
            }
            
            const templateImg = document.getElementById('imageMessageTemplate');
            if (templateImg) {
                const clone = templateImg.content.cloneNode(true);
                const wrapper = clone.querySelector('.message-image-wrapper');
                if (wrapper) {
                    wrapper.style.border = `2px solid ${borderColor}`;
                    const img = wrapper.querySelector('.message-image-content');
                    if (img) {
                        // ✅ تعيين مصدر الصورة
                        if (msg.data.startsWith('blob:') || msg.data.startsWith('data:')) {
                            img.src = msg.data;
                        } else if (msg.data.startsWith('http')) {
                            img.src = msg.data;
                        } else {
                            // ✅ إذا كانت الصورة غير صالحة، لا نعرض الإطار
                            console.log(`⚠️ تخطي عرض الصورة ${msg.id} - مصدر غير صالح`);
                            return;
                        }
                        img.onclick = () => this.showImagePreview(img.src);
                        img.oncontextmenu = (e) => e.preventDefault();
                        img.ondragstart = (e) => e.preventDefault();
                        img.setAttribute('loading', 'lazy');
                    }
                }
                div.appendChild(clone);
            }
        }
        
        // ✅ إضافة الرسالة فقط إذا كانت تحتوي على محتوى
        if (div.children.length > 0) {
            c.appendChild(div);
            setTimeout(() => {
                c.scrollTop = c.scrollHeight;
            }, 50);
        }
    },
    
    // ==================== القسم 8: showImagePreview ====================
    showImagePreview(imageSrc) {
        const modal = document.getElementById('imagePreviewModal');
        const img = document.getElementById('previewImage');
        if (!modal || !img || !imageSrc) return;
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
            const pr = await SecureChatSystem.getMyPrivateKey();
            const pu = await SecureChatSystem.getReceiverPublicKey(this.currentChat); 
            if (!pr || !pu) return false;
            const sk = await SecureChatSystem.deriveSharedKey(pr, pu);
            const enc = await SecureChatSystem.encryptData(text.trim(), sk); 
            await SecureChatSystem.sendToServer(this.currentChat, { id: mid, type: 'text', data: enc, timestamp: Date.now() }); 
            
            const msg = { id: mid, type: 'text', text: text.trim(), sender: 'me', time: new Date().toISOString(), status: 'sent' };
            this.saveMessage(this.currentChat, msg); 
            this.displayMessage(msg); 
            console.log('✅ تم إرسال النص عبر Firebase');
            return true; 
        } catch (e) { 
            console.error('❌ فشل إرسال النص:', e);
            return false; 
        } 
    },

    // ==================== القسم 13: sendImage ====================
    async sendImage(file) { 
        if (!this.currentChat) return;
        
        try {
            console.log('📸 بدء ضغط الصورة...');
            const compressedBlob = await SecureChatSystem.compressImage(file);
            console.log('✅ تم ضغط الصورة');
            
            const arrayBuffer = await compressedBlob.arrayBuffer();
            const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            
            const pr = await SecureChatSystem.getMyPrivateKey();
            const pu = await SecureChatSystem.getReceiverPublicKey(this.currentChat);
            if (!pr || !pu) return;
            
            const sk = await SecureChatSystem.deriveSharedKey(pr, pu);
            const encrypted = await SecureChatSystem.encryptData(base64Data, sk);
            
            const msgId = Date.now().toString();
            await SecureChatSystem.sendToServer(this.currentChat, { 
                id: msgId, 
                type: 'image', 
                data: encrypted, 
                fileName: file.name,
                timestamp: Date.now() 
            });
            
            const tempUrl = URL.createObjectURL(compressedBlob);
            
            const msg = { 
                id: msgId, 
                type: 'image', 
                data: tempUrl,
                fileName: file.name, 
                sender: 'me', 
                time: new Date().toISOString(), 
                status: 'sent',
                _blobUrl: tempUrl
            };
            
            this.saveMessage(this.currentChat, msg);
            this.displayMessage(msg);
            
            console.log('✅ تم إرسال الصورة عبر Firebase');
        } catch (e) {
            console.error('❌ فشل إرسال الصورة:', e);
            alert('فشل إرسال الصورة: ' + (e.message || 'خطأ غير معروف'));
        }
    },

    // ==================== القسم 14: saveMessage (مصحح) ====================
    saveMessage(friendId, message) { 
        if (!friendId || !message) return;
        
        if (message.type !== 'text' && message.type !== 'image') {
            console.log(`📝 نوع الرسالة (${message.type}) لن يُحفظ`);
            return;
        }
        
        // ✅ للصور: التحقق من وجود بيانات صالحة
        if (message.type === 'image') {
            if (!message.data || message.data === '') {
                console.log(`⚠️ تخطي حفظ صورة بدون بيانات: ${message.id}`);
                return;
            }
        }
        
        const key = `chat_${friendId}`; 
        let messages = []; 
        try { 
            messages = JSON.parse(localStorage.getItem(key)) || []; 
        } catch (e) { 
            messages = []; 
        }
        
        // ✅ منع حفظ الرسائل المكررة
        const exists = messages.some(m => m.id === message.id);
        if (exists) {
            console.log(`⚠️ رسالة مكررة ${message.id}، تم تخطيها`);
            return;
        }
        
        // ✅ إزالة أي صور قديمة بدون بيانات قبل الحفظ
        messages = messages.filter(m => {
            if (m.type === 'image' && (!m.data || m.data === '')) {
                console.log(`🧹 إزالة صورة قديمة بدون بيانات: ${m.id}`);
                return false;
            }
            return true;
        });
        
        messages.push(message); 
        
        if (messages.length > 100) {
            messages = messages.slice(-100);
            console.log(`🧹 تم الاقتصار على آخر 100 رسالة`);
        }
        
        try { 
            localStorage.setItem(key, JSON.stringify(messages)); 
            this.messages[friendId] = messages;
            console.log(`✅ تم حفظ رسالة ${message.type} (${message.id})`);
        } catch (e) {
            console.error('❌ فشل حفظ في localStorage:', e);
            const reduced = messages.slice(-50);
            try { 
                localStorage.setItem(key, JSON.stringify(reduced)); 
                this.messages[friendId] = reduced;
                console.log(`✅ تم حفظ آخر 50 رسالة`);
            } catch (e2) {
                console.error('❌ فشل حتى في حفظ 50 رسالة');
            }
        }
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
    escapeHtml(text) { 
        if (!text) return '';
        const div = document.createElement('div'); 
        div.textContent = text; 
        return div.innerHTML; 
    },
    
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

window.sendImage = () => { 
    const i = document.createElement('input'); 
    i.type = 'file'; 
    i.accept = 'image/*'; 
    i.onchange = e => { 
        const f = e.target.files[0]; 
        if (f && ChatSystem.currentChat) {
            console.log('📸 تم اختيار صورة، جاري الإرسال...');
            ChatSystem.sendImage(f); 
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

window.closeConversation = () => { 
    ChatSystem.closeChat();
    
    setTimeout(() => {
        const lastPage = popPage();
        document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
        document.querySelectorAll('.profile-subpage').forEach(s => s.style.display = 'none');
        document.body.classList.remove('profile-subpage-open');
        
        if (lastPage && lastPage.type === 'subpage') {
            document.body.classList.add('profile-subpage-open');
            document.querySelector('.profile-page').style.display = 'none';
            if (lastPage.id && document.getElementById(lastPage.id)) {
                document.getElementById(lastPage.id).style.display = 'block';
            }
            document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active'); if (n.dataset.page === 'profile') n.classList.add('active'); });
        } else if (lastPage && lastPage.type === 'page' && lastPage.id === 'profile') {
            document.querySelector('.profile-page').classList.add('active');
            document.querySelector('.profile-page').style.display = 'block';
            document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active'); if (n.dataset.page === 'profile') n.classList.add('active'); });
        } else {
            document.querySelector('.chat-page').classList.add('active');
            document.querySelector('.chat-page').style.display = 'block';
            if (typeof loadChats === 'function') loadChats();
            document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active'); if (n.dataset.page === 'chat') n.classList.add('active'); });
        }
    }, 200);
};

window.openChat = friendId => {
    if (document.getElementById('friendsPage') && document.getElementById('friendsPage').style.display === 'block') {
        pushPage('subpage', 'friendsPage');
    } else if (document.getElementById('tripsPage') && document.getElementById('tripsPage').style.display === 'block') {
        pushPage('subpage', 'tripsPage');
    } else if (document.querySelector('.profile-page') && getComputedStyle(document.querySelector('.profile-page')).display === 'block') {
        pushPage('page', 'profile');
    } else {
        pushPage('page', 'chat');
    }
    
    window.db.collection('users').doc(friendId).get().then(doc => {
        if (doc.exists) {
            const f = doc.data();
            ChatSystem.openChat(friendId, f.name, window.getEmojiForUser ? window.getEmojiForUser(f) : '🧔🏻‍♂️');
        }
    }).catch(() => {});
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
