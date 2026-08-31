// ========== chat-system.js - النسخة النهائية مع التحسينات ==========
// نظام الدردشة E2EE + إرسال الصور عبر السيرفر
// مع تحسينات: التمرير التلقائي + تحديث فوري

const ChatSystem = {
    currentChat: null, 
    messages: {},
    friendInConversation: false,
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
                try { 
                    this.messages[fid] = JSON.parse(localStorage.getItem(k)) || []; 
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
        
        document.body.classList.add('conversation-open');
        const nameEl = document.getElementById('conversationName');
        const avatarEl = document.getElementById('conversationAvatar');
        if (nameEl) nameEl.textContent = friendName;
        if (avatarEl) avatarEl.textContent = friendAvatar || '👤';
        document.querySelector('.chat-page').style.display = 'none'; 
        document.getElementById('conversationPage').style.display = 'flex';
        this.displayMessages(friendId);
        
        setTimeout(() => { 
            const inp = document.getElementById('messageInput'); 
            if (inp) inp.focus(); 
        }, 300);
        setTimeout(() => { 
            this.scrollToBottom();
        }, 100);
    },
    
    // ==================== القسم 4: closeChat ====================
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
            const validMessages = messages.filter(msg => {
                if (msg.type === 'image') {
                    return msg.data && msg.data.startsWith('blob:');
                }
                return true;
            }).slice(-150);
        
            this.messages[chatId] = validMessages;
            localStorage.setItem(key, JSON.stringify(validMessages));
            console.log('✅ تم الاحتفاظ بآخر 150 رسالة');
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
        c.innerHTML = ''; 
        const messages = this.messages[friendId] || [];
        
        messages.forEach(msg => {
            this.displayMessage(msg);
        });
        
        this.scrollToBottom();
    },
    
    // ==================== القسم 7: displayMessage ====================
    displayMessage(msg) {
        const c = document.getElementById('messagesContainer'); 
        if (!c) return;
        
        const borderColor = msg.sender === 'me' ? '#2196F3' : '#4CAF50';
        
        const template = document.getElementById('messageWrapperTemplate');
        let div;
        if (template) {
            div = template.content.cloneNode(true).firstElementChild;
        } else {
            console.warn('⚠️ قالب messageWrapperTemplate غير موجود');
            div = document.createElement('div');
            div.className = 'message';
        }
        
        div.className = `message ${msg.sender === 'me' ? 'sent' : 'received'}`;
        div.id = `msg-${msg.id}`;
        
        // ===== النصوص =====
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
        
        // ===== الصور =====
        else if (msg.type === 'image') {
            const templateImg = document.getElementById('imageMessageTemplate');
            if (templateImg) {
                const clone = templateImg.content.cloneNode(true);
                const wrapper = clone.querySelector('.message-image-wrapper');
                if (wrapper) {
                    wrapper.style.border = `2px solid ${borderColor}`;
                    const img = wrapper.querySelector('.message-image-content');
                    if (img && msg.data) {
                        img.src = msg.data;
                        img.onclick = () => this.showImagePreview(msg.data);
                        img.oncontextmenu = (e) => e.preventDefault();
                        img.ondragstart = (e) => e.preventDefault();
                        img.onerror = () => {
                            console.warn('⚠️ فشل تحميل الصورة');
                            img.alt = 'فشل تحميل الصورة';
                            img.src = '';
                            img.style.backgroundColor = '#333';
                            img.style.minHeight = '100px';
                            img.style.display = 'flex';
                            img.style.alignItems = 'center';
                            img.style.justifyContent = 'center';
                            img.style.color = '#999';
                            img.style.width = '100%';
                        };
                    }
                }
                div.appendChild(clone);
            }
        }
        
        c.appendChild(div); 
        this.scrollToBottom();
    },
    
    // ==================== القسم 8: scrollToBottom (جديد) ====================
    scrollToBottom() {
        const c = document.getElementById('messagesContainer');
        if (c) {
            setTimeout(() => {
                c.scrollTop = c.scrollHeight;
            }, 50);
        }
    },
    
    // ==================== القسم 9: showImagePreview ====================
    showImagePreview(imageSrc) {
        const modal = document.getElementById('imagePreviewModal');
        const img = document.getElementById('previewImage');
        if (!modal || !img) return;
        
        img.src = imageSrc;
        modal.style.display = 'flex';
        this.setupImageZoom(modal, img);
    },
    
    // ==================== القسم 10: setupImageZoom ====================
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
    
    // ==================== القسم 11: sendMessage ====================
    async sendMessage(text) { 
        if (!this.currentChat || !text.trim()) return false; 
        const mid = Date.now().toString(); 
        
        const msg = { 
            id: mid, 
            type: 'text', 
            text: text.trim(), 
            sender: 'me', 
            time: new Date().toISOString()
        };
        this.displayMessage(msg);
        this.saveMessage(this.currentChat, msg);
        
        try { 
            const pr = await SecureChatSystem.getMyPrivateKey(); 
            const pu = await SecureChatSystem.getReceiverPublicKey(this.currentChat); 
            if (!pr || !pu) return false;
            const sk = await SecureChatSystem.deriveSharedKey(pr, pu); 
            const enc = await SecureChatSystem.encryptData(text.trim(), sk); 
            await SecureChatSystem.sendToServer(this.currentChat, { 
                id: mid, 
                type: 'text', 
                data: enc, 
                timestamp: Date.now() 
            }); 
            
            console.log('✅ تم إرسال النص عبر Firebase');
            return true; 
        } catch (e) { 
            console.error('❌ فشل إرسال النص:', e);
            return false; 
        } 
    },
    
    // ==================== القسم 12: sendImage ====================
    async sendImage(file) { 
        if (!this.currentChat) {
            console.error('❌ لا توجد محادثة نشطة');
            return;
        }
        
        console.log('📷 بدء إرسال الصورة');
        
        const msgId = Date.now().toString();
        const tempUrl = URL.createObjectURL(file);
        const msg = { 
            id: msgId, 
            type: 'image', 
            data: tempUrl, 
            fileName: file.name,
            sender: 'me', 
            time: new Date().toISOString(),
            _blobUrl: tempUrl 
        };
        this.displayMessage(msg);
        this.saveMessage(this.currentChat, msg);
        
        ChatSystem.showProgressBar('جاري ضغط الصورة...', 0);
        
        try {
            const success = await SecureChatSystem.sendEncryptedFile(
                this.currentChat, 
                file, 
                'image', 
                file.name
            );
            
            if (success) {
                console.log('✅ تم إرسال الصورة');
            } else {
                console.error('❌ فشل إرسال الصورة');
            }
        } catch (error) {
            console.error('❌ فشل إرسال الصورة:', error);
        } finally {
            ChatSystem.hideProgressBar();
        }
    },
    
    // ==================== القسم 13: saveMessage ====================
    saveMessage(friendId, message) { 
        const key = `chat_${friendId}`; 
        let messages = []; 
        try { 
            messages = JSON.parse(localStorage.getItem(key)) || []; 
        } catch (e) { 
            messages = []; 
        }
        
        messages.push(message); 
        
        if (messages.length > 150) {
            const removeCount = messages.length - 150;
            for (let i = 0; i < removeCount; i++) {
                const oldMsg = messages[i];
                if (oldMsg._blobUrl && oldMsg._blobUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(oldMsg._blobUrl);
                }
            }
            messages = messages.slice(removeCount);
            console.log(`🧹 تم حذف ${removeCount} رسالة قديمة`);
        }
        
        try { 
            localStorage.setItem(key, JSON.stringify(messages)); 
        } catch (e) {
            const removeCount = Math.min(50, messages.length);
            for (let i = 0; i < removeCount; i++) {
                const oldMsg = messages[i];
                if (oldMsg._blobUrl && oldMsg._blobUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(oldMsg._blobUrl);
                }
            }
            messages = messages.slice(removeCount);
            try { 
                localStorage.setItem(key, JSON.stringify(messages)); 
                console.log(`🧹 مساحة غير كافية - تم حذف ${removeCount} رسالة`);
            } catch (e2) { 
                messages = messages.slice(-50);
                try { 
                    localStorage.setItem(key, JSON.stringify(messages)); 
                    console.log(`🧹 تم الاحتفاظ بآخر 50 رسالة فقط`);
                } catch (e3) {}
            }
        }
        
        this.messages[friendId] = messages; 
    },
    
    // ==================== القسم 14: updateLastMessage ====================
    updateLastMessage(friendId, lastMessage) { 
        document.querySelectorAll('.chat-item').forEach(item => { 
            if (item.getAttribute('onclick')?.includes(friendId)) { 
                const lm = item.querySelector('.last-message'), 
                      tm = item.querySelector('.chat-time'); 
                if (lm) lm.textContent = lastMessage; 
                if (tm) tm.textContent = 'الآن'; 
            } 
        }); 
    },
    
    // ==================== القسم 15: showProgressBar ====================
    showProgressBar(message, percent) {
        const bar = document.getElementById('progressBar');
        if (!bar) return;
        bar.style.display = 'flex';
        const fill = document.getElementById('progressFill');
        const perc = document.getElementById('progressPercent');
        if (fill) fill.style.width = '0%';
        if (perc) perc.textContent = '0%';
    },
    
    // ==================== القسم 16: updateProgressBar ====================
    updateProgressBar(percent, message) {
        const fill = document.getElementById('progressFill');
        const perc = document.getElementById('progressPercent');
        if (fill) fill.style.width = Math.min(percent, 100) + '%';
        if (perc) perc.textContent = Math.round(percent) + '%';
    },
    
    // ==================== القسم 17: hideProgressBar ====================
    hideProgressBar() { 
        const bar = document.getElementById('progressBar'); 
        if (bar) bar.style.display = 'none'; 
    },
    
    // ==================== القسم 18: escapeHtml ====================
    escapeHtml(text) { 
        const div = document.createElement('div'); 
        div.textContent = text; 
        return div.innerHTML; 
    }
};

// ==================== القسم 19: تشغيل النظام ====================
ChatSystem.init();

// ==================== القسم 20: التنظيف الشامل ====================
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
    
    const attachmentMenu = document.getElementById('attachmentMenu');
    if (attachmentMenu) attachmentMenu.style.display = 'none';
    
    console.log('✅ اكتمل التنظيف الشامل للموقع');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', performGlobalCleanup);
} else {
    performGlobalCleanup();
}

// ==================== إصلاح مشكلة الكيبورد ====================
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

// ==================== منع التمرير الخاطئ ====================
document.addEventListener('touchmove', function(e) {
    if (document.body.classList.contains('conversation-open')) {
        const isMessagesContainer = e.target.closest('.messages-container');
        if (!isMessagesContainer) {
            e.preventDefault();
        }
    }
}, { passive: false });

// ==================== منع التكبير ====================
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

console.log('✅ ChatSystem جاهز (مع تحسينات التحديث الفوري)');
