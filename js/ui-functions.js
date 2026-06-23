// ========== ui-functions.js - النسخة المعدلة (مع دوال إغلاق المعاينات) ==========
// وظائف الواجهة العامة

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

// ==================== القسم 2: تحميل المحادثات (معدل - استخدام القالب الثابت) ====================
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

// ==================== القسم 5.1: زر الإجراء (بصمة/إرسال) ====================

let _recordingTimer = null;
let _recordingSeconds = 0;
let _recordingChunks = [];
let _mediaRecorder = null;
let _recordingBlob = null;
let _isRecording = false;
let _audioUrl = null;
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
    
    if (_audioUrl) { URL.revokeObjectURL(_audioUrl); _audioUrl = null; }
    if (_audioElement) { _audioElement = null; }
    
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
                
                if (_audioUrl) URL.revokeObjectURL(_audioUrl);
                _audioUrl = URL.createObjectURL(_recordingBlob);
                
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
            
            _mediaRecorder.start();
            
            btn.onclick = function() {
                if (_mediaRecorder && _mediaRecorder.state === 'recording') {
                    _mediaRecorder.stop();
                    btn.onclick = window.handleActionButton;
                    playBtn.style.display = 'flex';
                    playBtn.innerHTML = '<i class="fas fa-play"></i>';
                    sendBtn.style.display = 'flex';
                    btn.style.display = 'none';
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
                if (!_recordingBlob) return;
                
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
                    _audioElement = new Audio(_audioUrl);
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
                if (_audioUrl) {
                    URL.revokeObjectURL(_audioUrl);
                    _audioUrl = null;
                }
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
    if (_audioUrl) {
        URL.revokeObjectURL(_audioUrl);
        _audioUrl = null;
    }
    
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

// ==================== القسم 14: دوال إغلاق المعاينات ====================
window.closeImagePreview = function() {
    const modal = document.getElementById('imagePreviewModal');
    const img = document.getElementById('previewImage');
    const link = document.getElementById('downloadImageLink');
    if (modal) modal.style.display = 'none';
    if (img) { img.src = ''; img.style.transform = 'none'; }
    if (link) { link.href = '#'; link.download = ''; }
};

window.closeVideoPreview = function() {
    const modal = document.getElementById('videoPreviewModal');
    const video = document.getElementById('previewVideo');
    const link = document.getElementById('downloadVideoLink');
    if (modal) modal.style.display = 'none';
    if (video) { video.pause(); video.src = ''; }
    if (link) { link.href = '#'; link.download = ''; }
};

// ❌ تم حذف الدوال التالية (لم تعد هناك حاجة لها)
// window.downloadPreviewImage = function() { ... }
// window.downloadPreviewVideo = function() { ... }

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







// ==================== أداة تشخيص التحميل المتخصصة (للنسخة الأصلية) ====================
const DownloadDiagnosticPro = {
    results: [],
    fullReportText: '',
    isRunning: false,
    isMinimized: false,
    isDragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    clickCount: 0,
    blobUrls: [],
    detectedIssues: [],
    
    setupEventListeners() {
        console.log('🔧 تم إعداد مستمعات الأحداث');
    },
    
    init() {
        this.createFloatingScreen();
        this.setupEventListeners();
        setTimeout(() => {
            this.show();
            console.log('🔍 أداة تشخيص التحميل المتخصصة ظهرت تلقائياً');
        }, 1500);
        console.log('🔍 أداة تشخيص التحميل المتخصصة جاهزة');
    },
    
    createFloatingScreen() {
        if (document.getElementById('downloadDiagnosticOverlay')) return;
        
        const overlay = document.createElement('div');
        overlay.id = 'downloadDiagnosticOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.0);
            z-index: 999999;
            display: none;
            align-items: center;
            justify-content: center;
            font-family: monospace;
            pointer-events: none;
        `;
        
        const screen = document.createElement('div');
        screen.id = 'diagFloatingScreen';
        screen.style.cssText = `
            width: 95%;
            max-width: 780px;
            height: 80vh;
            max-height: 650px;
            background: #0a0e27;
            border: 2px solid #ff6600;
            border-radius: 16px;
            padding: 16px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0,0,0,0.9);
            position: relative;
            pointer-events: all;
            cursor: grab;
            touch-action: none;
        `;
        
        // رأس الشاشة
        const header = document.createElement('div');
        header.id = 'diagDragHandle';
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 10px;
            border-bottom: 2px solid #ff6600;
            flex-shrink: 0;
            cursor: grab;
            touch-action: none;
            user-select: none;
        `;
        header.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:20px;">🔍</span>
                <div>
                    <div style="color:#ff6600;font-size:16px;font-weight:bold;">تشخيص التحميل - النسخة الأصلية</div>
                    <div style="color:#666;font-size:10px;">اسحب للتحريك | Ctrl+Shift+D</div>
                </div>
            </div>
            <div style="display:flex;gap:6px;">
                <button id="diagMinimizeBtn" style="background:#555;border:none;color:white;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;">⏬</button>
                <button id="diagCloseFullBtn" style="background:#f44336;border:none;color:white;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;">✕</button>
            </div>
        `;
        screen.appendChild(header);
        
        // شريط الحالة
        const statusBar = document.createElement('div');
        statusBar.style.cssText = `display:flex;gap:12px;padding:6px 0;flex-shrink:0;font-size:11px;color:#aaa;border-bottom:1px solid #222;`;
        statusBar.innerHTML = `
            <span id="diagFullStatus">🟢 جاهز</span>
            <span id="diagFullCount">📊 0</span>
            <span id="diagFullClicks">🖱️ 0</span>
            <span id="diagFullIssues">⚠️ 0</span>
        `;
        screen.appendChild(statusBar);
        
        // منطقة الأزرار
        const buttons = document.createElement('div');
        buttons.style.cssText = `display:flex;gap:6px;flex-wrap:wrap;padding:8px 0;flex-shrink:0;border-bottom:1px solid #222;`;
        buttons.innerHTML = `
            <button id="diagFullStartBtn" style="background:#4CAF50;border:none;color:white;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;">▶️ بدء</button>
            <button id="diagFullStopBtn" style="background:#f44336;border:none;color:white;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;display:none;">⏹️ إيقاف</button>
            <button id="diagFullCopyBtn" style="background:#2196F3;border:none;color:white;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:12px;">📋 نسخ</button>
            <button id="diagFullClearBtn" style="background:#555;border:1px solid #ff6600;color:white;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:12px;">🧹 مسح</button>
            <button id="diagFullAnalyzeBtn" style="background:#9C27B0;border:none;color:white;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:12px;">🔬 تحليل</button>
            <button id="diagFullTestBtn" style="background:#FF9800;border:none;color:white;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:12px;">🧪 اختبار</button>
            <button id="diagFullInspectBtn" style="background:#00BCD4;border:none;color:white;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:12px;">🔎 فحص العناصر</button>
        `;
        screen.appendChild(buttons);
        
        // منطقة النتائج
        const resultsContainer = document.createElement('div');
        resultsContainer.id = 'diagFullResults';
        resultsContainer.style.cssText = `
            flex:1;
            overflow-y:auto;
            background:rgba(0,0,0,0.5);
            border-radius:8px;
            padding:8px;
            margin:6px 0;
            font-size:11px;
            line-height:1.5;
            border:1px solid #222;
            min-height:150px;
            user-select:text;
            cursor:text;
        `;
        resultsContainer.innerHTML = `
            <div style="color:#666;text-align:center;padding:30px 15px;font-size:13px;">
                <div style="font-size:40px;margin-bottom:10px;">🔍</div>
                <div>انتظر بدء التشخيص...</div>
                <div style="font-size:10px;margin-top:6px;color:#444;">اضغط "▶️ بدء" ثم اضغط على أي زر تحميل</div>
                <div style="font-size:10px;margin-top:4px;color:#444;">سيتم تحليل كل محاولة تحميل بالتفصيل</div>
            </div>
        `;
        screen.appendChild(resultsContainer);
        
        // شريط المعلومات السفلي
        const footer = document.createElement('div');
        footer.style.cssText = `display:flex;justify-content:space-between;padding-top:6px;border-top:1px solid #222;flex-shrink:0;font-size:9px;color:#444;`;
        footer.innerHTML = `<span>💡 Ctrl+Shift+D</span><span>🔄 ${new Date().toLocaleString()}</span>`;
        screen.appendChild(footer);
        
        overlay.appendChild(screen);
        document.body.appendChild(overlay);
        
        // أنماط إضافية
        const style = document.createElement('style');
        style.textContent = `
            #diagFullResults::-webkit-scrollbar { width: 5px; }
            #diagFullResults::-webkit-scrollbar-track { background: #111; }
            #diagFullResults::-webkit-scrollbar-thumb { background: #ff6600; border-radius: 3px; }
            .diag-log-entry { padding: 2px 5px; border-bottom: 1px solid rgba(255,255,255,0.03); border-radius: 2px; font-size: 11px; word-break: break-word; user-select: text; }
            .diag-log-entry:hover { background: rgba(255,255,255,0.05); }
            .diag-error { border-right: 3px solid #f44336; }
            .diag-warning { border-right: 3px solid #FFC107; }
            .diag-success { border-right: 3px solid #4CAF50; }
        `;
        document.head.appendChild(style);
        
        this.setupDragging();
        this.setupScreenListeners();
    },
    
    setupDragging() {
        const screen = document.getElementById('diagFloatingScreen');
        const handle = document.getElementById('diagDragHandle');
        if (!screen || !handle) return;
        
        let startX, startY, origX, origY, isDragging = false;
        
        const onStart = (e) => {
            e.preventDefault();
            const touch = e.touches ? e.touches[0] : e;
            startX = touch.clientX;
            startY = touch.clientY;
            const rect = screen.getBoundingClientRect();
            origX = rect.left;
            origY = rect.top;
            isDragging = true;
            screen.style.cursor = 'grabbing';
            screen.style.transition = 'none';
        };
        
        const onMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const touch = e.touches ? e.touches[0] : e;
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            screen.style.left = (origX + dx) + 'px';
            screen.style.top = (origY + dy) + 'px';
            screen.style.position = 'fixed';
            screen.style.transform = 'none';
            screen.style.margin = '0';
        };
        
        const onEnd = () => { isDragging = false; screen.style.cursor = 'grab'; };
        
        handle.addEventListener('mousedown', onStart);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        handle.addEventListener('touchstart', onStart, { passive: false });
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);
    },
    
    setupScreenListeners() {
        document.getElementById('diagFullStartBtn')?.addEventListener('click', () => this.startDiagnostic());
        document.getElementById('diagFullStopBtn')?.addEventListener('click', () => this.stopDiagnostic());
        document.getElementById('diagFullCopyBtn')?.addEventListener('click', () => this.copyFullReport());
        document.getElementById('diagFullClearBtn')?.addEventListener('click', () => this.clearResults());
        document.getElementById('diagFullAnalyzeBtn')?.addEventListener('click', () => this.deepAnalyze());
        document.getElementById('diagFullTestBtn')?.addEventListener('click', () => this.testDownload());
        document.getElementById('diagFullInspectBtn')?.addEventListener('click', () => this.inspectElements());
        document.getElementById('diagMinimizeBtn')?.addEventListener('click', () => this.minimize());
        document.getElementById('diagCloseFullBtn')?.addEventListener('click', () => this.hide());
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const overlay = document.getElementById('downloadDiagnosticOverlay');
                if (overlay && overlay.style.display === 'flex') this.hide();
            }
        });
    },
    
    startDiagnostic() {
        if (this.isRunning) { this.stopDiagnostic(); return; }
        this.isRunning = true;
        this.results = [];
        this.fullReportText = '';
        this.clickCount = 0;
        this.blobUrls = [];
        this.detectedIssues = [];
        this.startTime = Date.now();
        
        document.getElementById('diagFullStartBtn').textContent = '⏹️ إيقاف';
        document.getElementById('diagFullStartBtn').style.background = '#f44336';
        document.getElementById('diagFullStopBtn').style.display = 'inline-block';
        document.getElementById('diagFullStatus').textContent = '🟢 جاري...';
        
        const container = document.getElementById('diagFullResults');
        if (container) container.innerHTML = '';
        
        this.addResult('🔍', '═══════ بدء تشخيص النسخة الأصلية ═══════', '#ff6600', '');
        this.addResult('📋', `⏱️ ${new Date().toLocaleString()}`, '#888', '');
        this.addResult('', 'سيتم تحليل كل محاولة تحميل', '#555', '');
        this.addResult('', '─'.repeat(50), '#444', '');
        
        this.analyzeAllDownloadElements();
        this.monitorDownloads();
        this.updateTimer();
    },
    
    stopDiagnostic() {
        this.isRunning = false;
        document.getElementById('diagFullStartBtn').textContent = '▶️ بدء';
        document.getElementById('diagFullStartBtn').style.background = '#4CAF50';
        document.getElementById('diagFullStopBtn').style.display = 'none';
        document.getElementById('diagFullStatus').textContent = '🟡 متوقف';
        this.addResult('⏹️', 'تم إيقاف التشخيص', '#ff6600', '');
        if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
    },
    
    updateTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            if (!this.isRunning) return;
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
            const secs = String(elapsed % 60).padStart(2, '0');
            document.getElementById('diagFullTime').textContent = `⏱️ ${mins}:${secs}`;
        }, 1000);
    },
    
    monitorDownloads() {
        // مراقبة جميع روابط التحميل
        const links = document.querySelectorAll('a[download], button[onclick*="download"]');
        links.forEach((link) => {
            link.addEventListener('click', (e) => {
                this.logDownloadAttempt(link, e);
            });
        });
        
        // مراقبة التغييرات في DOM
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        node.querySelectorAll('a[download], button[onclick*="download"]').forEach((link) => {
                            link.addEventListener('click', (e) => {
                                this.logDownloadAttempt(link, e);
                            });
                        });
                    }
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
        this._observer = observer;
    },
    
    logDownloadAttempt(link, event) {
        this.clickCount++;
        const href = link.getAttribute('href');
        const download = link.getAttribute('download');
        const tagName = link.tagName;
        const id = link.id || 'no-id';
        const className = link.className || '';
        const isButton = tagName === 'BUTTON';
        const isAnchor = tagName === 'A';
        
        // تحديث العداد
        document.getElementById('diagFullClicks').textContent = `🖱️ ${this.clickCount}`;
        
        this.addResult('', '─'.repeat(50), '#444', '');
        this.addResult('📥', `🔄 محاولة تحميل #${this.clickCount}: ${download || 'ملف'}`, '#4CAF50', '');
        
        // تحليل العنصر
        this.addResult('🔹', `العنصر: <${tagName}> id="${id}" class="${className}"`, '#aaa', '');
        
        if (isButton) {
            this.addResult('❌', '⚠️ زر تحميل من نوع <button> (غير موصى به)', '#f44336', 'diag-error');
            this.detectedIssues.push('استخدام <button> بدلاً من <a>');
        }
        
        if (isAnchor) {
            this.addResult('✅', '✅ رابط من نوع <a> (موصى به)', '#4CAF50', 'diag-success');
        }
        
        // تحليل الرابط
        if (!href || href === '#') {
            this.addResult('❌', '❌ الرابط غير معين (href="#")', '#f44336', 'diag-error');
            this.detectedIssues.push('href غير معين');
        } else if (href.startsWith('blob:')) {
            this.addResult('⚠️', '⚠️ Blob URL (قد ينتهي صلاحيته)', '#FFC107', 'diag-warning');
            this.blobUrls.push(href);
            this.testBlobUrl(href);
            this.detectedIssues.push('استخدام Blob URL (ينتهي صلاحيته)');
        } else if (href.startsWith('data:')) {
            this.addResult('ℹ️', 'Data URL (قد يكون كبيراً)', '#aaa', '');
        } else if (href.startsWith('http')) {
            this.addResult('✅', '✅ HTTP URL (يعمل دائماً)', '#4CAF50', 'diag-success');
        }
        
        // تحليل خاصية download
        if (!download) {
            this.addResult('⚠️', '⚠️ لا توجد خاصية download', '#FFC107', 'diag-warning');
            this.detectedIssues.push('خاصية download مفقودة');
        } else {
            this.addResult('✅', `✅ download: "${download}"`, '#4CAF50', 'diag-success');
        }
        
        // التحقق من onclick (للأزرار)
        const onclick = link.getAttribute('onclick');
        if (onclick && onclick.includes('download')) {
            this.addResult('🔹', `onclick: "${onclick.substring(0, 50)}${onclick.length > 50 ? '...' : ''}"`, '#aaa', '');
            if (onclick.includes('downloadPreviewImage') || onclick.includes('downloadPreviewVideo')) {
                this.addResult('⚠️', '⚠️ يستخدم دالة downloadPreview قديمة (تسبب مشاكل)', '#FFC107', 'diag-warning');
                this.detectedIssues.push('استخدام دالة downloadPreview قديمة');
            }
        }
        
        // تحليل موقع العنصر في DOM
        const parent = link.parentElement;
        if (parent) {
            const parentClass = parent.className || '';
            const parentTag = parent.tagName;
            this.addResult('🔹', `الموضع: <${parentTag}> class="${parentClass}"`, '#666', '');
            
            // التحقق من وجود القالب
            if (parent.closest('template')) {
                this.addResult('ℹ️', 'العنصر داخل قالب (template)', '#888', '');
            }
        }
        
        // تحليل نوع البيانات المخزنة
        this.analyzeStoredData(link);
        
        // تحديث العدد الإجمالي
        const count = document.querySelectorAll('#diagFullResults .diag-log-entry').length;
        document.getElementById('diagFullCount').textContent = `📊 ${count}`;
        document.getElementById('diagFullIssues').textContent = `⚠️ ${this.detectedIssues.length}`;
        
        // عرض ملخص المشاكل
        if (this.detectedIssues.length > 0) {
            this.addResult('📋', `المشاكل المكتشفة: ${this.detectedIssues.length}`, '#FFC107', '');
        }
    },
    
    analyzeStoredData(link) {
        // البحث عن الرسالة المرتبطة
        const messages = document.querySelectorAll('.message');
        let found = false;
        let dataType = 'غير معروف';
        
        messages.forEach((msg) => {
            const img = msg.querySelector('img');
            const video = msg.querySelector('video');
            const audio = msg.querySelector('audio');
            const fileBtn = msg.querySelector('.download-file-btn');
            
            if (fileBtn === link || (img && img.src === link.href) || (video && video.src === link.href)) {
                found = true;
                // تحديد نوع البيانات
                if (img && img.src === link.href) {
                    dataType = 'صورة (img)';
                    // التحقق من صحة الرابط
                    if (img.src.startsWith('blob:')) {
                        this.addResult('📊', `نوع البيانات: ${dataType} - Blob URL`, '#FFC107', 'diag-warning');
                    } else {
                        this.addResult('📊', `نوع البيانات: ${dataType} - ${img.src.substring(0, 30)}...`, '#aaa', '');
                    }
                } else if (video && video.src === link.href) {
                    dataType = 'فيديو (video)';
                    if (video.src.startsWith('blob:')) {
                        this.addResult('📊', `نوع البيانات: ${dataType} - Blob URL`, '#FFC107', 'diag-warning');
                    } else {
                        this.addResult('📊', `نوع البيانات: ${dataType} - ${video.src.substring(0, 30)}...`, '#aaa', '');
                    }
                } else if (audio && audio.src === link.href) {
                    dataType = 'صوت (audio)';
                    this.addResult('📊', `نوع البيانات: ${dataType}`, '#aaa', '');
                } else if (fileBtn === link) {
                    dataType = 'ملف (file)';
                    this.addResult('📊', `نوع البيانات: ${dataType}`, '#aaa', '');
                }
            }
        });
        
        if (!found) {
            this.addResult('ℹ️', 'لم يتم العثور على رسالة مرتبطة', '#888', '');
        }
        
        // التحقق من localStorage
        this.checkLocalStorageForFile(link);
    },
    
    checkLocalStorageForFile(link) {
        const href = link.getAttribute('href');
        if (!href) return;
        
        let found = false;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('chat_')) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    if (Array.isArray(data)) {
                        const fileMessages = data.filter(m => 
                            (m.type === 'image' || m.type === 'video' || m.type === 'file') && 
                            m.data === href
                        );
                        if (fileMessages.length > 0) {
                            found = true;
                            const msg = fileMessages[0];
                            const isBlob = typeof msg.data === 'string' && msg.data.startsWith('blob:');
                            const isArrayBuffer = msg.data instanceof ArrayBuffer;
                            if (isBlob) {
                                this.addResult('⚠️', '⚠️ مخزن كـ Blob URL في localStorage (ينتهي)', '#FFC107', 'diag-warning');
                                this.detectedIssues.push('بيانات مخزنة كـ Blob URL');
                            } else if (isArrayBuffer) {
                                this.addResult('✅', '✅ مخزن كـ ArrayBuffer في localStorage (دائم)', '#4CAF50', 'diag-success');
                            } else {
                                this.addResult('ℹ️', `مخزن كـ ${typeof msg.data}`, '#888', '');
                            }
                            break;
                        }
                    }
                } catch (e) {}
            }
        }
        
        if (!found) {
            this.addResult('ℹ️', 'غير موجود في localStorage', '#888', '');
        }
    },
    
    analyzeAllDownloadElements() {
        const links = document.querySelectorAll('a[download], button[onclick*="download"]');
        this.addResult('📊', `تم العثور على ${links.length} عنصر تحميل`, '#ff6600', '');
        
        if (links.length === 0) {
            this.addResult('ℹ️', 'لا توجد عناصر تحميل في الصفحة', '#888', '');
            return;
        }
        
        let buttonCount = 0;
        let anchorCount = 0;
        let blobCount = 0;
        let emptyHrefCount = 0;
        
        links.forEach((link, index) => {
            const href = link.getAttribute('href');
            const download = link.getAttribute('download');
            const tagName = link.tagName;
            
            if (tagName === 'BUTTON') buttonCount++;
            if (tagName === 'A') anchorCount++;
            if (href && href.startsWith('blob:')) blobCount++;
            if (!href || href === '#') emptyHrefCount++;
            
            const isBlob = href && href.startsWith('blob:');
            const isEmpty = !href || href === '#';
            const isButton = tagName === 'BUTTON';
            
            let status = '✅';
            let color = '#4CAF50';
            let note = '';
            
            if (isButton) {
                status = '⚠️';
                color = '#FFC107';
                note = '(زر - غير موصى به)';
            } else if (isEmpty) {
                status = '❌';
                color = '#f44336';
                note = '(غير معين)';
            } else if (isBlob) {
                status = '⚠️';
                color = '#FFC107';
                note = '(Blob URL - قد ينتهي)';
            }
            
            this.addResult(status, `#${index+1}: ${download || 'ملف'} ${note}`, color, status === '❌' ? 'diag-error' : (status === '⚠️' ? 'diag-warning' : 'diag-success'));
        });
        
        // إحصائيات
        this.addResult('', '─'.repeat(40), '#444', '');
        this.addResult('📊', `الإحصائيات:`, '#ff6600', '');
        this.addResult('📊', `روابط <a>: ${anchorCount} | أزرار <button>: ${buttonCount}`, '#aaa', '');
        this.addResult('📊', `Blob URLs: ${blobCount} | روابط فارغة: ${emptyHrefCount}`, '#aaa', '');
        
        if (buttonCount > 0) {
            this.addResult('⚠️', `🔴 ${buttonCount} زر تحميل (يُنصح باستخدام <a>)`, '#f44336', 'diag-error');
            this.detectedIssues.push(`${buttonCount} زر تحميل بدلاً من <a>`);
        }
        if (blobCount > 0) {
            this.addResult('⚠️', `🔴 ${blobCount} Blob URL (قد تنتهي صلاحيتها)`, '#f44336', 'diag-error');
            this.detectedIssues.push(`${blobCount} Blob URL`);
        }
        if (emptyHrefCount > 0) {
            this.addResult('⚠️', `🔴 ${emptyHrefCount} رابط غير معين`, '#f44336', 'diag-error');
            this.detectedIssues.push(`${emptyHrefCount} رابط غير معين`);
        }
    },
    
    testBlobUrl(url) {
        this.addResult('🔄', 'جاري اختبار صلاحية Blob URL...', '#aaa', '');
        fetch(url, { method: 'HEAD' })
            .then(response => {
                if (response.ok) {
                    this.addResult('✅', '✅ Blob URL صالح ويعمل', '#4CAF50', 'diag-success');
                } else {
                    this.addResult('❌', '❌ Blob URL غير صالح (انتهت صلاحيته)', '#f44336', 'diag-error');
                    this.detectedIssues.push('Blob URL منتهي الصلاحية');
                }
            })
            .catch(() => {
                this.addResult('❌', '❌ Blob URL غير صالح (منتهي الصلاحية)', '#f44336', 'diag-error');
                this.detectedIssues.push('Blob URL منتهي الصلاحية');
            });
    },
    
    inspectElements() {
        this.addResult('🔎', '═══════ فحص العناصر ═══════', '#00BCD4', '');
        
        // فحص جميع عناصر التحميل
        this.analyzeAllDownloadElements();
        
        // فحص القوالب
        const templates = document.querySelectorAll('template');
        this.addResult('📋', `القوالب (templates): ${templates.length}`, '#aaa', '');
        templates.forEach((t, i) => {
            const id = t.id || 'no-id';
            this.addResult('🔹', `قالب ${i+1}: id="${id}"`, '#666', '');
        });
        
        // فحص localStorage
        this.addResult('📁', '─── localStorage ───', '#00BCD4', '');
        let chatCount = 0;
        let fileCount = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('chat_')) {
                chatCount++;
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    if (Array.isArray(data)) {
                        const files = data.filter(m => m.type === 'image' || m.type === 'video' || m.type === 'file');
                        fileCount += files.length;
                    }
                } catch (e) {}
            }
        }
        this.addResult('📊', `محادثات: ${chatCount} | ملفات: ${fileCount}`, '#aaa', '');
        
        // فحص الذاكرة
        this.addResult('🧠', '─── الذاكرة ───', '#00BCD4', '');
        if (window.performance && window.performance.memory) {
            const mem = window.performance.memory;
            const used = (mem.usedJSHeapSize / 1024 / 1024).toFixed(1);
            const limit = (mem.jsHeapSizeLimit / 1024 / 1024).toFixed(1);
            this.addResult('📊', `المستخدمة: ${used} MB / ${limit} MB`, '#aaa', '');
        } else {
            this.addResult('ℹ️', 'معلومات الذاكرة غير متوفرة', '#888', '');
        }
        
        this.addResult('✅', '═══════ اكتمل الفحص ═══════', '#00BCD4', '');
        this.detectedIssues.push('تم فحص العناصر');
    },
    
    deepAnalyze() {
        this.addResult('🔬', '═══════ تحليل عميق ═══════', '#9C27B0', '');
        
        // 1. تحليل localStorage
        this.analyzeLocalStorage();
        
        // 2. تحليل الذاكرة
        this.analyzeMemory();
        
        // 3. تحليل الروابط
        this.analyzeAllDownloadElements();
        
        // 4. تحليل المتصفح
        this.analyzeBrowser();
        
        // 5. تحليل الأخطاء المحتملة
        this.analyzePotentialIssues();
        
        this.addResult('✅', '═══════ اكتمل التحليل العميق ═══════', '#4CAF50', '');
    },
    
    analyzeLocalStorage() {
        this.addResult('📁', '─── تحليل localStorage ───', '#ff6600', '');
        let blobCount = 0, arrayBufferCount = 0, stringCount = 0;
        let totalFiles = 0;
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('chat_')) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    if (Array.isArray(data)) {
                        const fileMessages = data.filter(m => m.type === 'image' || m.type === 'video' || m.type === 'file');
                        totalFiles += fileMessages.length;
                        fileMessages.forEach((msg) => {
                            const isBlob = typeof msg.data === 'string' && msg.data.startsWith('blob:');
                            const isArrayBuffer = msg.data instanceof ArrayBuffer;
                            const isString = typeof msg.data === 'string' && !isBlob;
                            if (isBlob) blobCount++;
                            else if (isArrayBuffer) arrayBufferCount++;
                            else if (isString) stringCount++;
                        });
                    }
                } catch (e) {}
            }
        }
        
        this.addResult('📊', `إجمالي الملفات المخزنة: ${totalFiles}`, '#aaa', '');
        this.addResult('📊', `Blob URL: ${blobCount} | ArrayBuffer: ${arrayBufferCount} | String: ${stringCount}`, '#aaa', '');
        
        if (blobCount > 0) {
            this.addResult('❌', `🔴 ${blobCount} ملف مخزن كـ Blob URL (يحتاج إصلاح)`, '#f44336', 'diag-error');
            this.detectedIssues.push(`${blobCount} ملفات مخزنة كـ Blob URL`);
        }
        if (arrayBufferCount > 0) {
            this.addResult('✅', `🟢 ${arrayBufferCount} ملف مخزن كـ ArrayBuffer (صحيح)`, '#4CAF50', 'diag-success');
        }
        if (stringCount > 0) {
            this.addResult('⚠️', `🟡 ${stringCount} ملف مخزن كـ String (قد يكون غير صحيح)`, '#FFC107', 'diag-warning');
            this.detectedIssues.push(`${stringCount} ملفات مخزنة كـ String`);
        }
    },
    
    analyzeMemory() {
        this.addResult('🧠', '─── تحليل الذاكرة ───', '#ff6600', '');
        if (window.performance && window.performance.memory) {
            const mem = window.performance.memory;
            const used = (mem.usedJSHeapSize / 1024 / 1024).toFixed(1);
            const total = (mem.totalJSHeapSize / 1024 / 1024).toFixed(1);
            const limit = (mem.jsHeapSizeLimit / 1024 / 1024).toFixed(1);
            this.addResult('📊', `المستخدمة: ${used} MB`, '#aaa', '');
            this.addResult('📊', `الإجمالي: ${total} MB`, '#aaa', '');
            this.addResult('📊', `الحد الأقصى: ${limit} MB`, '#aaa', '');
            
            if (parseFloat(used) / parseFloat(limit) > 0.8) {
                this.addResult('⚠️', '⚠️ الذاكرة قريبة من الحد الأقصى!', '#FFC107', 'diag-warning');
            }
        } else {
            this.addResult('ℹ️', 'معلومات الذاكرة غير متوفرة', '#888', '');
        }
    },
    
    analyzeBrowser() {
        this.addResult('🌐', '─── تحليل المتصفح ───', '#ff6600', '');
        const ua = navigator.userAgent;
        this.addResult('📊', `المتصفح: ${ua.split(' ').slice(0, 3).join(' ')}`, '#aaa', '');
        this.addResult('📊', `المنصة: ${navigator.platform}`, '#aaa', '');
        this.addResult('📊', `دعم Blob: ${!!window.Blob}`, '#aaa', '');
        this.addResult('📊', `دعم ArrayBuffer: ${!!window.ArrayBuffer}`, '#aaa', '');
        this.addResult('📊', `دعم URL.createObjectURL: ${!!window.URL?.createObjectURL}`, '#aaa', '');
        
        // التحقق من إصدار المتصفح
        const isChrome = ua.includes('Chrome');
        const isFirefox = ua.includes('Firefox');
        const isSafari = ua.includes('Safari') && !ua.includes('Chrome');
        this.addResult('📊', `المتصفح: ${isChrome ? 'Chrome' : isFirefox ? 'Firefox' : isSafari ? 'Safari' : 'غير معروف'}`, '#aaa', '');
    },
    
    analyzePotentialIssues() {
        this.addResult('⚠️', '─── المشاكل المحتملة ───', '#ff6600', '');
        
        const issues = [
            { check: 'localStorage.getItem("chat_")', desc: 'الملفات مخزنة كـ Blob URL' },
            { check: 'document.querySelectorAll("button[onclick*=\'download\']")', desc: 'استخدام أزرار بدلاً من روابط' },
            { check: 'document.querySelectorAll("a[href*=\'blob:\']")', desc: 'استخدام Blob URL قد ينتهي' },
            { check: 'typeof msg.data === "string" && msg.data.startsWith("blob:")', desc: 'تخزين Blob URL في localStorage' }
        ];
        
        // التحقق من وجود Blob URLs في localStorage
        let hasBlobInStorage = false;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('chat_')) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    if (Array.isArray(data)) {
                        const hasBlob = data.some(m => 
                            (m.type === 'image' || m.type === 'video' || m.type === 'file') && 
                            typeof m.data === 'string' && 
                            m.data.startsWith('blob:')
                        );
                        if (hasBlob) {
                            hasBlobInStorage = true;
                            break;
                        }
                    }
                } catch (e) {}
            }
        }
        
        if (hasBlobInStorage) {
            this.addResult('❌', '🔴 تم العثور على Blob URLs في localStorage!', '#f44336', 'diag-error');
            this.addResult('💡', 'الحل: استخدم ArrayBuffer بدلاً من Blob URL للتخزين', '#FFC107', '');
            this.detectedIssues.push('Blob URLs في localStorage');
        } else {
            this.addResult('✅', '🟢 لا توجد Blob URLs في localStorage', '#4CAF50', 'diag-success');
        }
        
        // التحقق من استخدام الأزرار
        const buttons = document.querySelectorAll('button[onclick*="download"]');
        if (buttons.length > 0) {
            this.addResult('⚠️', `⚠️ ${buttons.length} زر تحميل (يُنصح باستخدام <a>)`, '#FFC107', 'diag-warning');
        }
        
        // التحقق من وجود دالة downloadPreview
        if (typeof window.downloadPreviewImage === 'function' || typeof window.downloadPreviewVideo === 'function') {
            this.addResult('⚠️', '⚠️ دوال downloadPreview موجودة (قد تسبب مشاكل)', '#FFC107', 'diag-warning');
            this.detectedIssues.push('استخدام دوال downloadPreview');
        }
    },
    
    testDownload() {
        this.addResult('🧪', '─── اختبار تحميل تجريبي ───', '#FF9800', '');
        
        const testData = new Uint8Array([72, 101, 108, 108, 111, 33]);
        const blob = new Blob([testData], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        this.addResult('📄', 'ملف تجريبي: "Hello!"', '#aaa', '');
        this.addResult('🔗', `Blob URL: ${url.substring(0, 40)}...`, '#aaa', '');
        
        const link = document.createElement('a');
        link.href = url;
        link.download = 'test.txt';
        link.style.display = 'none';
        document.body.appendChild(link);
        
        this.addResult('🔄', 'محاولة تحميل الملف التجريبي...', '#aaa', '');
        
        try {
            link.click();
            this.addResult('✅', '✅ تم تحميل الملف التجريبي بنجاح!', '#4CAF50', 'diag-success');
            this.addResult('💡', 'إذا عمل التحميل، فالمشكلة ليست في المتصفح', '#FFC107', '');
        } catch (e) {
            this.addResult('❌', `❌ فشل التحميل التجريبي: ${e.message}`, '#f44336', 'diag-error');
        }
        
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            this.addResult('🧹', 'تم تنظيف الملف التجريبي', '#888', '');
        }, 1000);
        
        this.addResult('', '─'.repeat(50), '#FF9800', '');
    },
    
    addResult(icon, text, color = '#fff', className = '') {
        const container = document.getElementById('diagFullResults');
        if (!container) return;
        
        const placeholder = container.querySelector('div[style*="text-align: center"]');
        if (placeholder && container.children.length === 1) {
            container.innerHTML = '';
        }
        
        const line = document.createElement('div');
        line.className = `diag-log-entry ${className}`;
        line.style.cssText = `
            padding: 2px 5px;
            border-bottom: 1px solid rgba(255,255,255,0.03);
            color: ${color};
            word-break: break-word;
            font-size: 11px;
            user-select: text;
        `;
        line.textContent = `${icon} ${text}`;
        container.appendChild(line);
        container.scrollTop = container.scrollHeight;
        
        this.fullReportText += `${icon} ${text}\n`;
        
        const count = container.querySelectorAll('.diag-log-entry').length;
        document.getElementById('diagFullCount').textContent = `📊 ${count}`;
    },
    
    copyFullReport() {
        if (!this.fullReportText) { 
            alert('لا يوجد تقرير للنسخ. قم بتشغيل التشخيص أولاً.'); 
            return; 
        }
        
        const summary = this.detectedIssues.length > 0 
            ? `\n⚠️ المشاكل المكتشفة (${this.detectedIssues.length}):\n${this.detectedIssues.map((i, idx) => `  ${idx+1}. ${i}`).join('\n')}`
            : '\n✅ لا توجد مشاكل مكتشفة';
        
        const text = `═══════════════════════════════════════\n` +
                    `🔍 تقرير تشخيص التحميل - النسخة الأصلية\n` +
                    `📅 ${new Date().toLocaleString()}\n` +
                    `🖱️ عدد محاولات التحميل: ${this.clickCount}\n` +
                    `═══════════════════════════════════════\n\n` +
                    this.fullReportText +
                    `\n═══════════════════════════════════════\n` +
                    summary +
                    `\n═══════════════════════════════════════\n` +
                    `📊 نهاية التقرير\n`;
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text)
                .then(() => {
                    this.addResult('✅', `✅ تم نسخ التقرير (${text.split('\n').length} سطر)`, '#4CAF50', 'diag-success');
                })
                .catch(() => {
                    this.fallbackCopy(text);
                });
        } else {
            this.fallbackCopy(text);
        }
    },
    
    fallbackCopy(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.cssText = 'position:fixed;opacity:0;left:-9999px;top:-9999px;';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            this.addResult('✅', '✅ تم نسخ التقرير', '#4CAF50', 'diag-success');
        } catch (e) { 
            alert('فشل النسخ. يمكنك تحديد النص ونسخه يدوياً.'); 
        }
        document.body.removeChild(textarea);
    },
    
    clearResults() {
        const container = document.getElementById('diagFullResults');
        if (container) {
            container.innerHTML = `<div style="color:#666;text-align:center;padding:30px 15px;font-size:13px;">
                <div style="font-size:40px;margin-bottom:10px;">🧹</div>
                <div>تم مسح النتائج</div>
                <div style="font-size:10px;margin-top:6px;color:#444;">اضغط "▶️ بدء" لبدء مراقبة جديدة</div>
            </div>`;
        }
        this.results = [];
        this.fullReportText = '';
        this.detectedIssues = [];
        this.clickCount = 0;
        document.getElementById('diagFullCount').textContent = '📊 0';
        document.getElementById('diagFullClicks').textContent = '🖱️ 0';
        document.getElementById('diagFullIssues').textContent = '⚠️ 0';
    },
    
    minimize() {
        const screen = document.getElementById('diagFloatingScreen');
        if (!screen) return;
        if (this.isMinimized) {
            screen.style.height = '80vh';
            screen.style.maxHeight = '650px';
            screen.style.width = '95%';
            screen.style.maxWidth = '780px';
            screen.style.overflow = 'visible';
            this.isMinimized = false;
            document.getElementById('diagMinimizeBtn').textContent = '⏬';
        } else {
            screen.style.height = '50px';
            screen.style.maxHeight = '50px';
            screen.style.width = '280px';
            screen.style.maxWidth = '280px';
            screen.style.overflow = 'hidden';
            this.isMinimized = true;
            document.getElementById('diagMinimizeBtn').textContent = '⏫';
        }
    },
    
    show() {
        const overlay = document.getElementById('downloadDiagnosticOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            const screen = document.getElementById('diagFloatingScreen');
            if (screen) {
                screen.style.position = 'relative';
                screen.style.left = 'auto';
                screen.style.top = 'auto';
                screen.style.transform = 'none';
                screen.style.margin = '0';
            }
        }
    },
    
    hide() {
        const overlay = document.getElementById('downloadDiagnosticOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
        if (this.isRunning) { this.stopDiagnostic(); }
    }
};

// ==================== تشغيل الأداة ====================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { DownloadDiagnosticPro.init(); });
} else {
    DownloadDiagnosticPro.init();
}

// ==================== اختصار لوحة المفاتيح ====================
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        const overlay = document.getElementById('downloadDiagnosticOverlay');
        if (overlay) {
            if (overlay.style.display === 'none' || overlay.style.display === '') {
                DownloadDiagnosticPro.show();
            } else {
                DownloadDiagnosticPro.hide();
            }
        }
    }
});

console.log('🔍 أداة تشخيص التحميل جاهزة! (للنسخة الأصلية)');
console.log('📌 Ctrl+Shift+D للفتح/الإغلاق');
console.log('📌 اضغط "▶️ بدء" ثم اضغط على زر التحميل');



