// ========== ui-functions.js - النسخة النهائية (بدون تنزيل) ==========
// وظائف الواجهة العامة

// ==================== MediaDB + MediaDownloader ====================
const MediaDB = {
    _db: null, DB_NAME: 'MediaStore', STORE: 'media',
    open() {
        return new Promise((resolve, reject) => {
            if (this._db) { resolve(this._db); return; }
            const req = indexedDB.open(this.DB_NAME, 1);
            req.onupgradeneeded = e => {
                if (!e.target.result.objectStoreNames.contains(this.STORE))
                    e.target.result.createObjectStore(this.STORE, { keyPath: 'id' });
            };
            req.onsuccess = e => { this._db = e.target.result; resolve(this._db); };
            req.onerror = () => reject(req.error);
        });
    },
    async save(id, dataUrl, fileName, mimeType) {
        try {
            const db = await this.open();
            return new Promise((res, rej) => {
                const tx = db.transaction(this.STORE, 'readwrite');
                tx.objectStore(this.STORE).put({ id: String(id), dataUrl, fileName, mimeType, ts: Date.now() });
                tx.oncomplete = () => { console.log('✅ MediaDB حفظ:', id, fileName); res(true); };
                tx.onerror = () => rej(tx.error);
            });
        } catch(e) { console.warn('MediaDB.save فشل:', e); return false; }
    },
    async get(id) {
        try {
            const db = await this.open();
            return new Promise((res, rej) => {
                const req = db.transaction(this.STORE, 'readonly').objectStore(this.STORE).get(String(id));
                req.onsuccess = () => res(req.result || null);
                req.onerror = () => rej(req.error);
            });
        } catch(e) { return null; }
    },
    async clearAll() {
        try {
            const db = await this.open();
            return new Promise(res => {
                const tx = db.transaction(this.STORE, 'readwrite');
                tx.objectStore(this.STORE).clear();
                tx.oncomplete = () => res(true);
            });
        } catch(e) { return false; }
    }
};

const MediaDownloader = {

    // ✅ يبني Blob URL مسبقاً ويخزنه في الزر - التنزيل فوري عند الضغط بدون async
    async createButton(msgId, fileName, mimeType, dataUrl) {
        const btn = document.createElement('button');
        btn.className = 'media-dl-btn';
        btn.title = 'تنزيل';
        btn.innerHTML = '<i class="fas fa-download"></i>';
        btn.setAttribute('data-msg-id', String(msgId));
        btn.style.cssText = `
            display:flex!important;visibility:visible!important;opacity:1!important;
            pointer-events:all!important;z-index:9999!important;
            position:absolute;top:8px;right:8px;
            width:36px;height:36px;min-width:36px;border-radius:50%;
            border:2px solid #4CAF50;background:rgba(0,0,0,0.82);color:#4CAF50;
            font-size:0.95rem;cursor:pointer;align-items:center;justify-content:center;
            box-shadow:0 2px 10px rgba(0,0,0,0.5);touch-action:manipulation;
        `;

        // بناء Blob URL مسبقاً في وقت الإنشاء
        try {
            const blobUrl = MediaDownloader.buildBlobUrl(dataUrl, mimeType);
            btn._blobUrl = blobUrl;
            btn._fileName = fileName || 'ملف';
            console.log('✅ Blob URL جاهز للزر:', fileName);
        } catch(e) {
            console.error('❌ فشل بناء Blob URL:', e);
        }

        // حفظ في IndexedDB للاستخدام لاحقاً (reload الصفحة)
        MediaDB.save(String(msgId), dataUrl, fileName, mimeType);

        btn.addEventListener('click', function(e) {
            e.stopPropagation(); e.stopImmediatePropagation(); e.preventDefault();
            if (btn._busy) return;
            btn._busy = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

            // ✅ التنزيل فوري - الـ blobUrl جاهز مسبقاً
            if (btn._blobUrl) {
                console.log('🔽 تنزيل فوري:', btn._fileName);
                const a = document.createElement('a');
                a.href = btn._blobUrl;
                a.download = btn._fileName;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                btn.innerHTML = '<i class="fas fa-check"></i>';
                console.log('✅ تحميل بدأ:', btn._fileName);
            } else {
                console.error('❌ blobUrl غير موجود للزر');
                btn.innerHTML = '❌';
            }

            setTimeout(() => { btn.innerHTML = '<i class="fas fa-download"></i>'; btn._busy = false; }, 1500);
        });

        return btn;
    },

    // بناء Blob URL من dataUrl أو base64
    buildBlobUrl(dataUrl, mimeType) {
        let base64, mime = mimeType || 'application/octet-stream';
        if (dataUrl.startsWith('data:')) {
            const comma = dataUrl.indexOf(',');
            base64 = dataUrl.substring(comma + 1);
            const m = dataUrl.match(/data:([^;]+)/);
            if (m) mime = m[1];
        } else {
            base64 = dataUrl;
        }
        base64 = base64.replace(/[\r\n\t ]/g, '');
        const pad = base64.length % 4;
        if (pad === 2) base64 += '==';
        else if (pad === 3) base64 += '=';
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: mime });
        return URL.createObjectURL(blob);
    }
};

// ==================== القسم 1: مكدس تتبع الصفحات للرجوع المتسلسل ====================
window._pageStack = [];

function pushPage(pageType, pageId) {
    window._pageStack.push({ type: pageType, id: pageId });
}

function popPage() {
    if (window._pageStack.length > 0) {
        return window._pageStack.pop();
    }
    return null;
}

function clearStack() {
    window._pageStack = [];
}

// ==================== القسم 2: تحميل المحادثات ====================
let chatsLoaded = false;

async function loadChats(force = false) { 
    if (!window.auth || !window.auth.currentUser) return; 
    const list = document.getElementById('chatsList'); 
    if (!list) return; 
    
    if (chatsLoaded && !force) {
        console.log('⏭️ قائمة المحادثات محملة مسبقاً، تخطي التحميل');
        return;
    }
    
    const template = ChatSystem.chatItemTemplate || document.getElementById('chatItemTemplate');
    if (!template) {
        console.warn('⚠️ قالب chatItemTemplate غير موجود');
        return;
    }
    
    try { 
        const udoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get(); 
        if (!udoc.exists) return; 
        const friends = udoc.data().friends || []; 
        
        list.innerHTML = '';
        
        if (!friends.length) { 
            list.innerHTML = `<div class="empty-state"><i class="fas fa-comments"></i><h3>لا توجد محادثات</h3><p>أضف أصدقاء لبدء المحادثة</p></div>`; 
            chatsLoaded = true;
            return; 
        } 
        
        for (const fid of friends) { 
            try { 
                const fdoc = await window.db.collection('users').doc(fid).get(); 
                if (fdoc.exists) { 
                    const f = fdoc.data(); 
                    const key = `chat_${fid}`; 
                    let lm = 'اضغط لبدء المحادثة', lt = ''; 
                    
                    try { 
                        const h = JSON.parse(localStorage.getItem(key)) || []; 
                        if (h.length > 0) { 
                            const l = h[h.length - 1]; 
                            if (l.type === 'text') lm = l.text.length > 30 ? l.text.substring(0, 30) + '...' : l.text; 
                            else if (l.type === 'image') lm = '📷 صورة'; 
                            else if (l.type === 'voice') lm = '🎤 بصمة صوتية'; 
                            else if (l.type === 'video') lm = '🎥 فيديو'; 
                            else if (l.type === 'file') lm = '📎 ملف'; 
                            lt = new Date(l.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); 
                        } 
                    } catch (e) {} 
                    
                    const clone = template.content.cloneNode(true);
                    const chatItem = clone.querySelector('.chat-item');
                    
                    const avatar = chatItem.querySelector('.chat-avatar-emoji');
                    const name = chatItem.querySelector('.chat-info h4');
                    const lastMsg = chatItem.querySelector('.last-message');
                    const time = chatItem.querySelector('.chat-time');
                    
                    if (avatar) avatar.textContent = window.getEmojiForUser(f);
                    if (name) name.textContent = f.name || 'مستخدم';
                    if (lastMsg) lastMsg.textContent = lm;
                    if (time) time.textContent = lt || '';
                    
                    chatItem.onclick = () => openChat(fid);
                    
                    list.appendChild(clone);
                } 
            } catch (e) {
                console.warn('خطأ في تحميل صديق:', e);
            } 
        } 
        
        chatsLoaded = true;
        
        if (list.children.length === 0) {
            list.innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا توجد محادثات نشطة</h3><p>ابدأ بإضافة أصدقاء جدد</p></div>`;
        }
        
    } catch (e) {
        console.error('خطأ في loadChats:', e);
        list.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>حدث خطأ</h3><p>حاول تحديث الصفحة</p></div>`;
        chatsLoaded = true;
    } 
}

function refreshChats() {
    chatsLoaded = false;
    loadChats(true);
}

// ==================== القسم 3: إعداد مستمعي الواجهة ====================
function setupChatListeners() { 
    document.addEventListener('click', e => { 
        const m = document.getElementById('attachmentMenu'); 
        const ab = document.querySelector('.attach-btn'); 
        if (m && ab && !m.contains(e.target) && !ab.contains(e.target)) {
            m.style.display = 'none'; 
        }
    }); 
}

// ==================== القسم 4: فتح محادثة ====================
window.openChat = friendId => {
    if (document.getElementById('friendsPage') && document.getElementById('friendsPage').style.display === 'block') {
        pushPage('subpage', 'friendsPage');
    } else if (document.getElementById('friendRequestsPage') && document.getElementById('friendRequestsPage').style.display === 'block') {
        pushPage('subpage', 'friendRequestsPage');
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
            ChatSystem.openChat(friendId, f.name, window.getEmojiForUser ? window.getEmojiForUser(f) : '👤');
        }
    }).catch(() => {});
};

// ==================== القسم 5: وظائف إرسال الرسائل ====================
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

window.handleMessageKeyPress = e => { 
    if (e.key === 'Enter' && !e.shiftKey) { 
        e.preventDefault(); 
        if (typeof window.handleActionButton === 'function') {
            window.handleActionButton();
        } else {
            window.sendMessage();
        }
    } 
};

// ==================== القسم 5.1: زر الإجراء (بصمة/إرسال) - Base64 كامل ====================

let _recordingTimer = null;
let _recordingSeconds = 0;
let _recordingChunks = [];
let _mediaRecorder = null;
let _recordingBlob = null;
let _isRecording = false;
let _audioData = null;
let _audioElement = null;

const MAX_RECORDING_SECONDS = 300;
const WARNING_THRESHOLD = 280;

window.toggleSendButton = function() {
    const input = document.getElementById('messageInput');
    const btn = document.getElementById('actionBtn');
    const recordingUI = document.getElementById('voiceRecordingUI');
    if (!input || !btn) return;
    
    if (recordingUI && recordingUI.style.display === 'flex') {
        btn.style.display = 'none';
        return;
    }
    
    const featuresEnabled = typeof ChatSystem !== 'undefined' && ChatSystem.featuresEnabled;
    
    if (!featuresEnabled) {
        btn.className = 'send-mode';
        btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        btn.title = 'إرسال';
        btn.style.display = 'flex';
        return;
    }
    
    const hasText = input.value.trim().length > 0;
    
    if (hasText) {
        btn.className = 'send-mode';
        btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        btn.title = 'إرسال';
    } else {
        btn.className = 'voice-btn';
        btn.innerHTML = '<i class="fas fa-microphone"></i>';
        btn.title = 'بصمة صوتية';
    }
    btn.style.display = 'flex';
};

window.handleActionButton = function() {
    const input = document.getElementById('messageInput');
    const btn = document.getElementById('actionBtn');
    if (!input || !btn) return;
    
    const recordingUI = document.getElementById('voiceRecordingUI');
    if (recordingUI && recordingUI.style.display === 'flex') return;
    
    const featuresEnabled = typeof ChatSystem !== 'undefined' && ChatSystem.featuresEnabled;
    const hasText = input.value.trim().length > 0;
    
    if (hasText) {
        window.sendMessage();
    } else if (featuresEnabled) {
        window.startVoiceRecording();
    }
};

window.startVoiceRecording = function() {
    const featuresEnabled = typeof ChatSystem !== 'undefined' && ChatSystem.featuresEnabled;
    if (!featuresEnabled) {
        alert('الميزات غير مفعلة');
        return;
    }
    
    if (!navigator.mediaDevices?.getUserMedia) {
        alert('المتصفح لا يدعم تسجيل الصوت');
        return;
    }
    
    const input = document.getElementById('messageInput');
    const btn = document.getElementById('actionBtn');
    const recordingUI = document.getElementById('voiceRecordingUI');
    const progressFill = document.getElementById('voiceProgressFill');
    const currentTimeEl = document.getElementById('voiceCurrentTime');
    const maxTimeEl = document.getElementById('voiceMaxTime');
    const cancelBtn = document.getElementById('voiceCancelBtn');
    const sendBtn = document.getElementById('voiceSendBtn');
    const playBtn = document.getElementById('voicePlayBtn');
    
    if (!recordingUI || !progressFill || !currentTimeEl) return;
    
    _audioData = null;
    if (_audioElement) {
        _audioElement.pause();
        _audioElement = null;
    }
    
    input.style.display = 'none';
    recordingUI.style.display = 'flex';
    recordingUI.classList.remove('warning');
    btn.style.display = 'none';
    playBtn.style.display = 'none';
    sendBtn.style.display = 'none';
    cancelBtn.style.display = 'flex';
    
    btn.style.display = 'flex';
    btn.classList.add('recording');
    btn.innerHTML = '<i class="fas fa-stop"></i>';
    btn.title = 'إيقاف التسجيل';
    
    _recordingSeconds = 0;
    _recordingChunks = [];
    _recordingBlob = null;
    _isRecording = true;
    currentTimeEl.textContent = '0:00';
    maxTimeEl.textContent = '5:00';
    progressFill.style.width = '0%';
    
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            _mediaRecorder = new MediaRecorder(stream);
            
            _mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) _recordingChunks.push(e.data);
            };
            
            _mediaRecorder.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
                _isRecording = false;
                
                _recordingBlob = new Blob(_recordingChunks, { type: 'audio/webm' });
                
                const reader = new FileReader();
                reader.onload = function(e) {
                    _audioData = e.target.result;
                    playBtn.style.display = 'flex';
                    playBtn.innerHTML = '<i class="fas fa-play"></i>';
                    sendBtn.style.display = 'flex';
                    btn.style.display = 'none';
                    btn.classList.remove('recording');
                    
                    if (_recordingTimer) {
                        clearInterval(_recordingTimer);
                        _recordingTimer = null;
                    }
                };
                reader.readAsDataURL(_recordingBlob);
            };
            
            _mediaRecorder.start();
            
            btn.onclick = function() {
                if (_mediaRecorder && _mediaRecorder.state === 'recording') {
                    _mediaRecorder.stop();
                    btn.onclick = window.handleActionButton;
                }
            };
            
            if (_recordingTimer) clearInterval(_recordingTimer);
            _recordingTimer = setInterval(() => {
                if (!_isRecording) return;
                
                _recordingSeconds++;
                const mins = Math.floor(_recordingSeconds / 60);
                const secs = _recordingSeconds % 60;
                currentTimeEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
                
                const percent = (_recordingSeconds / MAX_RECORDING_SECONDS) * 100;
                progressFill.style.width = Math.min(percent, 100) + '%';
                
                if (_recordingSeconds >= WARNING_THRESHOLD) {
                    recordingUI.classList.add('warning');
                }
                
                if (_recordingSeconds >= MAX_RECORDING_SECONDS) {
                    if (_mediaRecorder && _mediaRecorder.state === 'recording') {
                        _mediaRecorder.stop();
                        btn.onclick = window.handleActionButton;
                        btn.style.display = 'none';
                        playBtn.style.display = 'flex';
                        playBtn.innerHTML = '<i class="fas fa-play"></i>';
                        sendBtn.style.display = 'flex';
                    }
                }
            }, 1000);
            
            cancelBtn.onclick = () => {
                if (_mediaRecorder && _mediaRecorder.state === 'recording') {
                    _mediaRecorder.stop();
                }
                if (_recordingTimer) {
                    clearInterval(_recordingTimer);
                    _recordingTimer = null;
                }
                resetVoiceUI();
            };
            
            let isPlaying = false;
            playBtn.onclick = () => {
                if (!_audioData) return;
                
                if (isPlaying) {
                    if (_audioElement) {
                        _audioElement.pause();
                        _audioElement.currentTime = 0;
                    }
                    playBtn.innerHTML = '<i class="fas fa-play"></i>';
                    isPlaying = false;
                    return;
                }
                
                if (!_audioElement) {
                    _audioElement = new Audio(_audioData);
                    _audioElement.onended = () => {
                        playBtn.innerHTML = '<i class="fas fa-play"></i>';
                        isPlaying = false;
                    };
                }
                
                _audioElement.play();
                playBtn.innerHTML = '<i class="fas fa-pause"></i>';
                isPlaying = true;
            };
            
            sendBtn.onclick = () => {
                if (_mediaRecorder && _mediaRecorder.state === 'recording') {
                    _mediaRecorder.stop();
                }
                if (_recordingTimer) {
                    clearInterval(_recordingTimer);
                    _recordingTimer = null;
                }
                
                if (_recordingBlob && _recordingBlob.size > 0) {
                    ChatSystem.sendVoiceNote(_recordingBlob);
                }
                resetVoiceUI();
            };
            
            const cleanup = () => {
                if (_mediaRecorder && _mediaRecorder.state === 'recording') {
                    _mediaRecorder.stop();
                }
                if (_recordingTimer) {
                    clearInterval(_recordingTimer);
                    _recordingTimer = null;
                }
                if (_audioElement) {
                    _audioElement.pause();
                    _audioElement = null;
                }
                _audioData = null;
                resetVoiceUI();
            };
            window._voiceCleanup = cleanup;
            window.addEventListener('beforeunload', cleanup);
        })
        .catch(() => {
            alert('يرجى السماح بالوصول إلى الميكروفون');
            resetVoiceUI();
        });
};

function resetVoiceUI() {
    const input = document.getElementById('messageInput');
    const btn = document.getElementById('actionBtn');
    const recordingUI = document.getElementById('voiceRecordingUI');
    const playBtn = document.getElementById('voicePlayBtn');
    
    if (input) input.style.display = 'block';
    if (recordingUI) {
        recordingUI.style.display = 'none';
        recordingUI.classList.remove('warning');
    }
    if (btn) {
        btn.style.display = 'flex';
        btn.classList.remove('recording');
        btn.onclick = window.handleActionButton;
    }
    if (playBtn) {
        playBtn.style.display = 'none';
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
    }
    
    if (_recordingTimer) {
        clearInterval(_recordingTimer);
        _recordingTimer = null;
    }
    
    if (_audioElement) {
        _audioElement.pause();
        _audioElement = null;
    }
    _audioData = null;
    
    _recordingBlob = null;
    _mediaRecorder = null;
    _recordingChunks = [];
    _isRecording = false;
    
    if (window._voiceCleanup) {
        window.removeEventListener('beforeunload', window._voiceCleanup);
        window._voiceCleanup = null;
    }
    
    window.toggleSendButton();
}

// ==================== القسم 6: قائمة المرفقات ====================
window.showAttachmentMenu = () => { 
    const m = document.getElementById('attachmentMenu'); 
    if (m) {
        m.style.display = m.style.display === 'none' ? 'flex' : 'none'; 
    }
};

// ==================== القسم 7: إرسال الملفات ====================
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

window.sendVideo = () => { 
    const i = document.createElement('input'); 
    i.type = 'file'; 
    i.accept = 'video/*'; 
    i.onchange = e => { 
        const f = e.target.files[0]; 
        if (f && ChatSystem.currentChat) ChatSystem.sendVideoFile(f); 
    }; 
    i.click(); 
    document.getElementById('attachmentMenu').style.display = 'none'; 
};

window.sendFile = () => { 
    const i = document.createElement('input'); 
    i.type = 'file'; 
    i.accept = '*/*'; 
    i.onchange = e => { 
        const f = e.target.files[0]; 
        if (f && ChatSystem.currentChat) ChatSystem.sendFile(f); 
    }; 
    i.click(); 
    document.getElementById('attachmentMenu').style.display = 'none'; 
};

// ==================== القسم 8: مشاركة الموقع ====================
window.shareLocation = () => { 
    ChatSystem.shareLocationDirect(); 
    document.getElementById('attachmentMenu').style.display = 'none'; 
};

// ==================== القسم 9: إغلاق المحادثة ====================
window.closeConversation = () => { 
    CallSystem.endCall(); 
    ChatSystem.closeChat();
    
    if (typeof window.hideSearchResults === 'function') {
        window.hideSearchResults();
    }
    
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
            loadChats();
            document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active'); if (n.dataset.page === 'chat') n.classList.add('active'); });
        }
    }, 200);
};

// ==================== القسم 10: تعديل الملف الشخصي ====================
window.openEditProfileModal = () => { 
    const nameInput = document.getElementById('editName'); 
    const currentName = document.getElementById('profileName')?.textContent; 
    const currentEmoji = document.getElementById('profileAvatarEmoji')?.textContent; 
    if (nameInput) nameInput.value = currentName || ''; 
    const avatarPreview = document.getElementById('currentAvatarEmoji'); 
    if (avatarPreview) avatarPreview.textContent = currentEmoji || '👤'; 
    document.getElementById('editProfileModal')?.classList.add('active'); 
};

window.saveProfile = () => { 
    const n = document.getElementById('editName')?.value?.trim(); 
    if (!n || n.length > 25) { 
        alert('الاسم مطلوب ولا يزيد عن 25 حرف'); 
        return; 
    } 
    if (auth?.currentUser) db.collection('users').doc(auth.currentUser.uid).update({ name: n }).then(() => { 
        const nameEl = document.getElementById('profileName'); 
        if (nameEl) nameEl.textContent = n; 
        closeModal(); 
    }).catch(() => alert('فشل حفظ التغييرات')); 
};

// ==================== القسم 11: الصفحات الفرعية ====================
window.showUserTrips = () => {
    pushPage('page', 'profile');
    document.body.classList.add('profile-subpage-open');
    document.querySelector('.profile-page').style.display = 'none';
    document.getElementById('tripsPage').style.display = 'block';
};

window.showFriendsList = () => {
    pushPage('page', 'profile');
    document.body.classList.add('profile-subpage-open');
    document.querySelector('.profile-page').style.display = 'none';
    document.getElementById('friendsPage').style.display = 'block';
};

window.showFriendRequests = () => {
    pushPage('page', 'profile');
    document.body.classList.add('profile-subpage-open');
    document.querySelector('.profile-page').style.display = 'none';
    document.getElementById('friendRequestsPage').style.display = 'block';
};

// ==================== القسم 12: الرجوع من صفحة فرعية ====================
window.goBack = () => {
    const lastPage = popPage();
    
    document.querySelectorAll('.profile-subpage').forEach(p => p.style.display = 'none');
    document.body.classList.remove('profile-subpage-open');
    
    if (lastPage && lastPage.type === 'page' && lastPage.id === 'profile') {
        document.querySelector('.profile-page').style.display = 'block';
        document.querySelector('.profile-page').classList.add('active');
    } else {
        document.querySelector('.profile-page').style.display = 'block';
        document.querySelector('.profile-page').classList.add('active');
    }
};

// ==================== القسم 13: الصورة الرمزية ====================
window.selectAvatar = t => { 
    const m = { male:'👨', female:'👩', boy:'🧒', girl:'👧', father:'👨‍🦳', mother:'👩‍🦳', grandfather:'👴', grandmother:'👵' }; 
    const e = m[t] || '👤'; 
    const profileAvatar = document.getElementById('profileAvatarEmoji'), currentAvatar = document.getElementById('currentAvatarEmoji'); 
    if (profileAvatar) profileAvatar.textContent = e; 
    if (currentAvatar) currentAvatar.textContent = e; 
    if (auth?.currentUser) db.collection('users').doc(auth.currentUser.uid).update({ avatarType: t }).then(() => closeModal()).catch(() => {}); 
};

window.openAvatarModal = () => document.getElementById('avatarModal')?.classList.add('active');

window.getEmojiForUser = u => { 
    const m = { male:'👨', female:'👩', boy:'🧒', girl:'👧', father:'👨‍🦳', mother:'👩‍🦳', grandfather:'👴', grandmother:'👵' }; 
    return m[u?.avatarType] || '👤'; 
};

// ==================== القسم 14: دوال إغلاق المعاينات (بدون تنزيل) ====================
window.closeImagePreview = function() {
    const modal = document.getElementById('imagePreviewModal');
    const img = document.getElementById('previewImage');
    if (modal) modal.style.display = 'none';
    if (img) { img.src = ''; img.style.transform = 'none'; }
};

window.closeVideoPreview = function() {
    const modal = document.getElementById('videoPreviewModal');
    const video = document.getElementById('previewVideo');
    if (modal) modal.style.display = 'none';
    if (video) { video.pause(); video.src = ''; }
};

// ==================== القسم 15: دوال مساعدة ====================
function formatNumber(num) { 
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'; 
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K'; 
    return num.toString(); 
}

async function updateTripsCount() { 
    if (!window.auth || !window.auth.currentUser) return; 
    try { 
        const s = await window.db.collection('trips').where('userId', '==', window.auth.currentUser.uid).where('status', '==', 'ended').get(); 
        const c = document.getElementById('tripsCount'); 
        if (c) c.textContent = formatNumber(s.size); 
    } catch (error) {} 
}

function ensureSinglePage() { 
    document.querySelectorAll('.profile-subpage').forEach(p => p.style.display = 'none'); 
    document.querySelectorAll('.page').forEach(p => { 
        p.style.display = p.classList.contains('active') ? 'block' : 'none'; 
    }); 
}

function setupNavigation() { 
    const nav = document.querySelectorAll('.nav-item'); 
    const pages = document.querySelectorAll('.page'); 
    if (!nav.length || !pages.length) return; 
    function switchPage(id) { 
        clearStack(); 
        pages.forEach(p => p.classList.remove('active')); 
        const t = document.querySelector(`.page.${id}-page`); 
        if (t) { 
            t.classList.add('active'); 
            t.style.display = 'block'; 
        } 
        pages.forEach(p => { 
            if (!p.classList.contains('active')) p.style.display = 'none'; 
        }); 
        document.querySelectorAll('.profile-subpage').forEach(s => s.style.display = 'none'); 
        document.body.classList.remove('profile-subpage-open'); 
        document.body.classList.remove('conversation-open'); 
        
        if (typeof window.hideSearchResults === 'function') {
            window.hideSearchResults();
        }
        
        if (id === 'chat') loadChats(); 
        nav.forEach(n => n.classList.toggle('active', n.dataset.page === id)); 
    } 
    nav.forEach(n => n.addEventListener('click', () => switchPage(n.dataset.page))); 
}

function setupModals() { 
    window.openLanguageModal = () => document.getElementById('languageModal')?.classList.add('active'); 
    window.closeModal = () => document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); 
    document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { 
        if (e.target === m) m.classList.remove('active'); 
    })); 
    document.querySelectorAll('.settings-item').forEach(i => { 
        if (i.querySelector('[data-i18n="language"]')) i.addEventListener('click', window.openLanguageModal); 
    }); 
}

// ==================== القسم 16: أحداث الصفحة ====================
document.addEventListener('DOMContentLoaded', () => { 
    ensureSinglePage(); 
    setupNavigation(); 
    setupModals(); 
    loadChats(); 
    setupChatListeners(); 
    updateTripsCount(); 
});

window.addEventListener('authReady', async () => { 
    if (window.auth?.currentUser) await SecureChatSystem.init(); 
});

if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();

window.addEventListener('error', (event) => { 
    console.error('❌ خطأ عام:', event.error); 
});

window.addEventListener('unhandledrejection', (event) => { 
    console.error('❌ خطأ غير معالج:', event.reason); 
});
