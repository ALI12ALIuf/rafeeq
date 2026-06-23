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



// ==================== أداة تشخيص التحميل ====================
const DownloadDiagnostic = {
    // تخزين نتائج التشخيص
    results: [],
    
    // تخزين النص الكامل للتشخيص
    fullReportText: '',
    
    // تشخيص عنصر التحميل
    diagnose(downloadElement, fileData, fileName) {
        const result = {
            timestamp: new Date().toISOString(),
            elementType: downloadElement.tagName,
            elementId: downloadElement.id,
            elementClass: downloadElement.className,
            hasHref: downloadElement.hasAttribute('href'),
            hrefValue: downloadElement.getAttribute('href'),
            hasDownload: downloadElement.hasAttribute('download'),
            downloadValue: downloadElement.getAttribute('download'),
            fileDataType: typeof fileData,
            fileDataIsArrayBuffer: fileData instanceof ArrayBuffer,
            fileDataIsBlob: fileData instanceof Blob,
            fileDataIsString: typeof fileData === 'string',
            fileDataLength: fileData?.byteLength || fileData?.length || 0,
            fileName: fileName || 'unknown',
            isObjectUrl: typeof fileData === 'string' && fileData.startsWith('blob:'),
            isDataUrl: typeof fileData === 'string' && fileData.startsWith('data:'),
            isHttpUrl: typeof fileData === 'string' && (fileData.startsWith('http://') || fileData.startsWith('https://')),
            parentElement: downloadElement.parentElement?.tagName || 'none',
            parentClasses: downloadElement.parentElement?.className || 'none'
        };
        
        this.results.push(result);
        this.displayResult(result);
        
        return result;
    },
    
    // عرض نتيجة التشخيص في لوحة التحكم
    displayResult(result) {
        const logContainer = document.getElementById('diagnosticLogs');
        if (!logContainer) return;
        
        const line = document.createElement('div');
        line.style.cssText = 'border-bottom: 1px solid #444; padding: 4px 0; font-family: monospace; font-size: 10px;';
        
        // تحديد المشكلة بناءً على النتائج
        let status = '✅';
        let statusColor = '#4CAF50';
        let issues = [];
        
        // 1. التحقق من نوع العنصر
        if (result.elementType !== 'A') {
            issues.push('❌ العنصر ليس رابط <a>');
            status = '❌';
            statusColor = '#f44336';
        }
        
        // 2. التحقق من وجود href
        if (!result.hasHref) {
            issues.push('❌ لا يوجد href');
            status = '❌';
            statusColor = '#f44336';
        } else if (result.hrefValue === '#') {
            issues.push('⚠️ href = # (لم يتم تعيينه بعد)');
            if (status === '✅') { status = '⚠️'; statusColor = '#FFC107'; }
        } else if (result.hrefValue.startsWith('blob:')) {
            // 3. التحقق من صحة blob URL
            fetch(result.hrefValue, { method: 'HEAD' })
                .then(response => {
                    if (response.ok) {
                        const validMsg = document.createElement('div');
                        validMsg.style.cssText = 'color: #4CAF50; font-size: 9px; padding-left: 20px;';
                        validMsg.textContent = '✅ Blob URL صالح ويعمل';
                        logContainer.appendChild(validMsg);
                    } else {
                        const invalidMsg = document.createElement('div');
                        invalidMsg.style.cssText = 'color: #f44336; font-size: 9px; padding-left: 20px;';
                        invalidMsg.textContent = '❌ Blob URL غير صالح (انتهت صلاحيته)';
                        logContainer.appendChild(invalidMsg);
                    }
                })
                .catch(() => {
                    const errorMsg = document.createElement('div');
                    errorMsg.style.cssText = 'color: #f44336; font-size: 9px; padding-left: 20px;';
                    errorMsg.textContent = '❌ فشل التحقق من Blob URL (قد يكون منتهي الصلاحية)';
                    logContainer.appendChild(errorMsg);
                });
        } else if (result.hrefValue.startsWith('data:')) {
            issues.push('ℹ️ data URL (قد يكون كبيراً جداً)');
        }
        
        // 4. التحقق من وجود download
        if (!result.hasDownload) {
            issues.push('⚠️ لا يوجد download attribute');
            if (status === '✅') { status = '⚠️'; statusColor = '#FFC107'; }
        }
        
        // 5. التحقق من نوع البيانات
        if (result.fileDataIsArrayBuffer) {
            issues.push(`✅ البيانات من نوع ArrayBuffer (${(result.fileDataLength / 1024).toFixed(1)} KB)`);
        } else if (result.fileDataIsBlob) {
            issues.push(`✅ البيانات من نوع Blob (${(result.fileDataLength / 1024).toFixed(1)} KB)`);
        } else if (result.isObjectUrl) {
            issues.push(`⚠️ البيانات هي Blob URL (قد تنتهي صلاحيتها)`);
            if (status === '✅') { status = '⚠️'; statusColor = '#FFC107'; }
        } else if (result.fileDataIsString && !result.isObjectUrl && !result.isDataUrl) {
            issues.push(`⚠️ البيانات من نوع String (قد لا تكون صالحة)`);
            if (status === '✅') { status = '⚠️'; statusColor = '#FFC107'; }
        }
        
        // عرض النتيجة الرئيسية
        const header = document.createElement('div');
        header.style.cssText = `color: ${statusColor}; font-weight: bold;`;
        header.textContent = `${status} [${result.timestamp}] تشخيص: ${result.fileName}`;
        line.appendChild(header);
        
        // عرض التفاصيل
        const details = document.createElement('div');
        details.style.cssText = `color: #aaa; font-size: 9px; padding-left: 20px;`;
        details.textContent = `🔹 عنصر: ${result.elementType} | href: ${result.hrefValue || 'none'} | download: ${result.downloadValue || 'none'}`;
        line.appendChild(details);
        
        // عرض المشاكل
        if (issues.length > 0) {
            const issuesDiv = document.createElement('div');
            issuesDiv.style.cssText = `color: #FFC107; font-size: 9px; padding-left: 20px;`;
            issuesDiv.textContent = `🔸 ${issues.join(' | ')}`;
            line.appendChild(issuesDiv);
        }
        
        logContainer.appendChild(line);
        logContainer.scrollTop = logContainer.scrollHeight;
        
        // ✅ تخزين النص الكامل للتشخيص
        this.fullReportText += `${status} [${result.timestamp}] تشخيص: ${result.fileName}\n`;
        this.fullReportText += `   🔹 عنصر: ${result.elementType} | href: ${result.hrefValue || 'none'} | download: ${result.downloadValue || 'none'}\n`;
        if (issues.length > 0) {
            this.fullReportText += `   🔸 ${issues.join(' | ')}\n`;
        }
        this.fullReportText += '\n';
    },
    
    // تشخيص جميع عناصر التحميل في الصفحة
    diagnoseAll() {
        // ✅ إعادة تعيين النص
        this.fullReportText = '';
        
        const logContainer = document.getElementById('diagnosticLogs');
        if (logContainer) {
            const separator = document.createElement('div');
            separator.style.cssText = 'border-top: 2px solid #ff6600; padding: 5px 0; color: #ff6600; text-align: center; margin: 5px 0;';
            separator.textContent = '═══════ بدء تشخيص التحميل ═══════';
            logContainer.appendChild(separator);
            this.fullReportText += '═══════ بدء تشخيص التحميل ═══════\n';
        }
        
        const links = document.querySelectorAll('a[download], button[onclick*="download"]');
        const results = [];
        links.forEach((el, index) => {
            const result = this.diagnose(el, el.href || el.getAttribute('data-file'), `element_${index}`);
            results.push(result);
        });
        
        setTimeout(() => {
            this.showReport();
            // ✅ تحديث نص التقرير
            const total = this.results.length;
            const issues = this.results.filter(r => r.isObjectUrl || r.hrefValue === '#');
            const valid = this.results.filter(r => !r.isObjectUrl && r.hrefValue !== '#');
            this.fullReportText += `\n📊 تقرير التشخيص: ${total} عنصر تم فحصه\n`;
            this.fullReportText += `✅ صالح: ${valid.length} | ⚠️ بحاجة إلى إصلاح: ${issues.length}\n`;
        }, 1000);
        
        return results;
    },
    
    // عرض التقرير النهائي
    showReport() {
        const logContainer = document.getElementById('diagnosticLogs');
        if (!logContainer) return;
        
        const total = this.results.length;
        const issues = this.results.filter(r => r.isObjectUrl || r.hrefValue === '#');
        const valid = this.results.filter(r => !r.isObjectUrl && r.hrefValue !== '#');
        
        const report = document.createElement('div');
        report.style.cssText = 'border-top: 2px solid #ff6600; padding: 8px 0; margin-top: 8px; color: #fff; font-size: 11px;';
        report.innerHTML = `
            📊 تقرير التشخيص: ${total} عنصر تم فحصه<br>
            ✅ صالح: ${valid.length} | ⚠️ بحاجة إلى إصلاح: ${issues.length}
        `;
        logContainer.appendChild(report);
    },
    
    // ✅ دالة نسخ النص الكامل للتشخيص
    copyFullReport() {
        if (!this.fullReportText) {
            alert('لا يوجد نص لتشخيصه. قم بتشغيل التشخيص أولاً.');
            return;
        }
        
        const reportText = this.fullReportText;
        
        // استخدام Clipboard API
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(reportText)
                .then(() => {
                    const msg = document.createElement('div');
                    msg.style.cssText = 'color: #4CAF50; font-size: 12px; padding: 5px; text-align: center; border: 1px solid #4CAF50; border-radius: 5px; margin: 5px 0;';
                    msg.textContent = '✅ تم نسخ النص بالكامل (' + reportText.split('\n').length + ' سطر)';
                    const logContainer = document.getElementById('diagnosticLogs');
                    if (logContainer) {
                        logContainer.appendChild(msg);
                        logContainer.scrollTop = logContainer.scrollHeight;
                    }
                })
                .catch(() => {
                    this.fallbackCopy(reportText);
                });
        } else {
            this.fallbackCopy(reportText);
        }
    },
    
    // ✅ طريقة بديلة للنسخ (للتوافق مع المتصفحات القديمة)
    fallbackCopy(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.cssText = 'position: fixed; opacity: 0; left: -9999px; top: -9999px;';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            const msg = document.createElement('div');
            msg.style.cssText = 'color: #4CAF50; font-size: 12px; padding: 5px; text-align: center; border: 1px solid #4CAF50; border-radius: 5px; margin: 5px 0;';
            msg.textContent = '✅ تم نسخ النص بالكامل (' + text.split('\n').length + ' سطر)';
            const logContainer = document.getElementById('diagnosticLogs');
            if (logContainer) {
                logContainer.appendChild(msg);
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        } catch (e) {
            alert('فشل النسخ. يمكنك تحديد النص ونسخه يدوياً.');
        }
        document.body.removeChild(textarea);
    }
};

// ✅ إضافة أزرار التشخيص
function addDiagnosticButtons() {
    const controlBar = document.querySelector('#diagnosticTool .diagnostic-controls') || 
                       document.querySelector('#diagnosticTool > div:first-child');
    if (!controlBar) return;
    
    // زر تشخيص التحميل
    const diagnoseBtn = document.createElement('button');
    diagnoseBtn.textContent = '🔍 تشخيص التحميل';
    diagnoseBtn.style.cssText = 'background: #9C27B0; border: none; color: white; padding: 4px 10px; border-radius: 5px; font-size: 10px; cursor: pointer; margin-left: 5px;';
    diagnoseBtn.onclick = () => {
        DownloadDiagnostic.diagnoseAll();
    };
    controlBar.appendChild(diagnoseBtn);
    
    // ✅ زر نسخ النص الكامل (جديد)
    const copyReportBtn = document.createElement('button');
    copyReportBtn.textContent = '📋 نسخ التقرير';
    copyReportBtn.style.cssText = 'background: #2196F3; border: none; color: white; padding: 4px 10px; border-radius: 5px; font-size: 10px; cursor: pointer; margin-left: 5px;';
    copyReportBtn.onclick = () => {
        DownloadDiagnostic.copyFullReport();
    };
    controlBar.appendChild(copyReportBtn);
    
    // زر مسح التشخيص
    const clearDiagnoseBtn = document.createElement('button');
    clearDiagnoseBtn.textContent = '🧹 مسح التشخيص';
    clearDiagnoseBtn.style.cssText = 'background: #555; border: 1px solid #ff6600; color: white; padding: 4px 10px; border-radius: 5px; font-size: 10px; cursor: pointer; margin-left: 5px;';
    clearDiagnoseBtn.onclick = () => {
        DownloadDiagnostic.results = [];
        DownloadDiagnostic.fullReportText = '';
        const logContainer = document.getElementById('diagnosticLogs');
        if (logContainer) {
            const items = logContainer.querySelectorAll('div');
            items.forEach(item => {
                if (item.textContent.includes('═══════') || 
                    item.textContent.includes('تشخيص:') ||
                    item.textContent.includes('تقرير التشخيص') ||
                    item.textContent.includes('تم نسخ النص')) {
                    item.remove();
                }
            });
        }
    };
    controlBar.appendChild(clearDiagnoseBtn);
}

// تشغيل عند تحميل الصفحة
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addDiagnosticButtons);
} else {
    addDiagnosticButtons();
}


