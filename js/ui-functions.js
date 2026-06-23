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



// ==================== أداة تشخيص التحميل المتخصصة ====================
const DownloadDiagnosticPro = {
    results: [],
    fullReportText: '',
    isRunning: false,
    isMinimized: false,
    
    // ✅ الدالة المفقودة (تم إضافتها)
    setupEventListeners() {
        console.log('🔧 تم إعداد مستمعات الأحداث');
        // يمكن إضافة مستمعات إضافية هنا
    },
    
    // تهيئة الأداة
    init() {
        this.createFullScreen();
        this.setupEventListeners();
        console.log('🔍 أداة تشخيص التحميل المتخصصة جاهزة');
    },
    
    // إنشاء شاشة كاملة منفصلة
    createFullScreen() {
        if (document.getElementById('downloadDiagnosticOverlay')) return;
        
        // الخلفية
        const overlay = document.createElement('div');
        overlay.id = 'downloadDiagnosticOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.92);
            backdrop-filter: blur(8px);
            z-index: 999999;
            display: none;
            align-items: center;
            justify-content: center;
            font-family: monospace;
            animation: fadeIn 0.3s ease;
        `;
        
        // الشاشة الرئيسية
        const screen = document.createElement('div');
        screen.style.cssText = `
            width: 90%;
            max-width: 800px;
            height: 85vh;
            max-height: 700px;
            background: #0a0e27;
            border: 2px solid #ff6600;
            border-radius: 16px;
            padding: 20px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0,0,0,0.8);
            position: relative;
        `;
        
        // رأس الشاشة
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 12px;
            border-bottom: 2px solid #ff6600;
            flex-shrink: 0;
        `;
        header.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 24px;">🔍</span>
                <div>
                    <div style="color: #ff6600; font-size: 18px; font-weight: bold;">تشخيص التحميل المتخصص</div>
                    <div style="color: #888; font-size: 11px;">تحليل دقيق لعملية تحميل الملفات</div>
                </div>
            </div>
            <div style="display: flex; gap: 8px;">
                <button id="diagMinimizeBtn" style="background: #555; border: none; color: white; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;">⏬ تصغير</button>
                <button id="diagCloseFullBtn" style="background: #f44336; border: none; color: white; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;">✕ إغلاق</button>
            </div>
        `;
        screen.appendChild(header);
        
        // شريط الحالة
        const statusBar = document.createElement('div');
        statusBar.style.cssText = `
            display: flex;
            gap: 15px;
            padding: 8px 0;
            flex-shrink: 0;
            font-size: 12px;
            color: #aaa;
            border-bottom: 1px solid #222;
        `;
        statusBar.innerHTML = `
            <span id="diagFullStatus">🟢 جاهز</span>
            <span id="diagFullCount">📊 0 سجل</span>
            <span id="diagFullTime">⏱️ 00:00:00</span>
        `;
        screen.appendChild(statusBar);
        
        // منطقة الأزرار
        const buttons = document.createElement('div');
        buttons.style.cssText = `
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            padding: 10px 0;
            flex-shrink: 0;
            border-bottom: 1px solid #222;
        `;
        buttons.innerHTML = `
            <button id="diagFullStartBtn" style="background: #4CAF50; border: none; color: white; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold;">▶️ بدء التشخيص</button>
            <button id="diagFullStopBtn" style="background: #f44336; border: none; color: white; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: none;">⏹️ إيقاف</button>
            <button id="diagFullCopyBtn" style="background: #2196F3; border: none; color: white; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 13px;">📋 نسخ التقرير</button>
            <button id="diagFullClearBtn" style="background: #555; border: 1px solid #ff6600; color: white; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 13px;">🧹 مسح</button>
            <button id="diagFullAnalyzeBtn" style="background: #9C27B0; border: none; color: white; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 13px;">🔬 تحليل عميق</button>
            <button id="diagFullTestBtn" style="background: #FF9800; border: none; color: white; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 13px;">🧪 اختبار التحميل</button>
        `;
        screen.appendChild(buttons);
        
        // منطقة النتائج (قابلة للتمرير)
        const resultsContainer = document.createElement('div');
        resultsContainer.id = 'diagFullResults';
        resultsContainer.style.cssText = `
            flex: 1;
            overflow-y: auto;
            background: rgba(0, 0, 0, 0.4);
            border-radius: 8px;
            padding: 10px;
            margin: 8px 0;
            font-size: 12px;
            line-height: 1.6;
            border: 1px solid #222;
            min-height: 200px;
        `;
        resultsContainer.innerHTML = `
            <div style="color: #888; text-align: center; padding: 40px 20px; font-size: 14px;">
                <div style="font-size: 48px; margin-bottom: 15px;">🔍</div>
                <div>انتظر بدء التشخيص...</div>
                <div style="font-size: 11px; margin-top: 8px; color: #666;">اضغط "▶️ بدء التشخيص" لبدء المراقبة</div>
                <div style="font-size: 11px; margin-top: 4px; color: #666;">ثم اضغط على أي زر تحميل لتحليل المشكلة</div>
            </div>
        `;
        screen.appendChild(resultsContainer);
        
        // شريط المعلومات السفلي
        const footer = document.createElement('div');
        footer.style.cssText = `
            display: flex;
            justify-content: space-between;
            padding-top: 8px;
            border-top: 1px solid #222;
            flex-shrink: 0;
            font-size: 10px;
            color: #555;
        `;
        footer.innerHTML = `
            <span>💡 Ctrl+Shift+D لإظهار/إخفاء</span>
            <span>🔄 ${new Date().toLocaleString()}</span>
        `;
        screen.appendChild(footer);
        
        overlay.appendChild(screen);
        document.body.appendChild(overlay);
        
        // إضافة أنماط الحركة
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
            }
            #diagFullResults::-webkit-scrollbar {
                width: 6px;
            }
            #diagFullResults::-webkit-scrollbar-track {
                background: #111;
            }
            #diagFullResults::-webkit-scrollbar-thumb {
                background: #ff6600;
                border-radius: 3px;
            }
            .diag-log-entry {
                padding: 3px 6px;
                border-bottom: 1px solid rgba(255,255,255,0.03);
                border-radius: 3px;
                transition: background 0.2s;
            }
            .diag-log-entry:hover {
                background: rgba(255,255,255,0.05);
            }
        `;
        document.head.appendChild(style);
        
        this.setupScreenListeners();
    },
    
    setupScreenListeners() {
        // زر بدء التشخيص
        document.getElementById('diagFullStartBtn')?.addEventListener('click', () => {
            this.startDiagnostic();
        });
        
        // زر إيقاف التشخيص
        document.getElementById('diagFullStopBtn')?.addEventListener('click', () => {
            this.stopDiagnostic();
        });
        
        // زر نسخ التقرير
        document.getElementById('diagFullCopyBtn')?.addEventListener('click', () => {
            this.copyFullReport();
        });
        
        // زر مسح
        document.getElementById('diagFullClearBtn')?.addEventListener('click', () => {
            this.clearResults();
        });
        
        // زر تحليل عميق
        document.getElementById('diagFullAnalyzeBtn')?.addEventListener('click', () => {
            this.deepAnalyze();
        });
        
        // زر اختبار التحميل
        document.getElementById('diagFullTestBtn')?.addEventListener('click', () => {
            this.testDownload();
        });
        
        // زر تصغير
        document.getElementById('diagMinimizeBtn')?.addEventListener('click', () => {
            this.minimize();
        });
        
        // زر إغلاق
        document.getElementById('diagCloseFullBtn')?.addEventListener('click', () => {
            this.hide();
        });
        
        // إغلاق بالضغط على Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const overlay = document.getElementById('downloadDiagnosticOverlay');
                if (overlay && overlay.style.display === 'flex') {
                    this.hide();
                }
            }
        });
    },
    
    // بدء التشخيص
    startDiagnostic() {
        if (this.isRunning) {
            this.stopDiagnostic();
            return;
        }
        
        this.isRunning = true;
        this.results = [];
        this.fullReportText = '';
        this.startTime = Date.now();
        
        document.getElementById('diagFullStartBtn').textContent = '⏹️ إيقاف';
        document.getElementById('diagFullStartBtn').style.background = '#f44336';
        document.getElementById('diagFullStopBtn').style.display = 'inline-block';
        document.getElementById('diagFullStatus').textContent = '🟢 جاري التشخيص...';
        
        const container = document.getElementById('diagFullResults');
        if (container) container.innerHTML = '';
        
        this.addResult('🔍', '═══════ بدء تشخيص التحميل المتخصص ═══════', '#ff6600');
        this.addResult('📋', `⏱️ ${new Date().toLocaleString()}`, '#888');
        this.addResult('', '', '#555');
        
        // تحليل جميع عناصر التحميل الموجودة
        this.analyzeAllDownloadElements();
        
        // بدء مراقبة التحميلات
        this.monitorDownloads();
        
        // تحديث المؤقت
        this.updateTimer();
    },
    
    stopDiagnostic() {
        this.isRunning = false;
        document.getElementById('diagFullStartBtn').textContent = '▶️ بدء التشخيص';
        document.getElementById('diagFullStartBtn').style.background = '#4CAF50';
        document.getElementById('diagFullStopBtn').style.display = 'none';
        document.getElementById('diagFullStatus').textContent = '🟡 متوقف';
        this.addResult('⏹️', 'تم إيقاف التشخيص', '#ff6600');
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    },
    
    updateTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            if (!this.isRunning) return;
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            const hours = String(Math.floor(elapsed / 3600)).padStart(2, '0');
            const minutes = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
            const seconds = String(elapsed % 60).padStart(2, '0');
            document.getElementById('diagFullTime').textContent = `⏱️ ${hours}:${minutes}:${seconds}`;
        }, 1000);
    },
    
    // مراقبة التحميلات
    monitorDownloads() {
        // مراقبة جميع روابط التحميل
        const links = document.querySelectorAll('a[download]');
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
                        const links = node.querySelectorAll('a[download]');
                        links.forEach((link) => {
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
    
    // تسجيل محاولة التحميل
    logDownloadAttempt(link, event) {
        const href = link.getAttribute('href');
        const download = link.getAttribute('download');
        const id = link.id || 'no-id';
        
        this.addResult('', '─'.repeat(50), '#444');
        this.addResult('📥', `🔄 محاولة تحميل: ${download || 'ملف'}`, '#4CAF50');
        this.addResult('🔗', `الرابط: ${href ? href.substring(0, 80) : 'غير موجود'}${href && href.length > 80 ? '...' : ''}`, '#aaa');
        
        // تحليل الرابط
        if (!href || href === '#') {
            this.addResult('❌', 'الرابط غير معين (href="#")', '#f44336');
            this.addResult('💡', 'الحل: تأكد من تعيين href عند عرض الرسالة', '#FFC107');
        } else if (href.startsWith('blob:')) {
            this.addResult('⚠️', '⚠️ الرابط من نوع Blob URL (قد ينتهي صلاحيته)', '#FFC107');
            this.testBlobUrl(href);
        } else if (href.startsWith('data:')) {
            this.addResult('ℹ️', 'الرابط من نوع Data URL (قد يكون كبيراً)', '#aaa');
        } else if (href.startsWith('http')) {
            this.addResult('✅', '✅ الرابط من نوع HTTP (يعمل دائماً)', '#4CAF50');
        }
        
        // تحليل خاصية download
        if (!download) {
            this.addResult('⚠️', '⚠️ لا توجد خاصية download', '#FFC107');
        } else {
            this.addResult('✅', `خاصية download: ${download}`, '#4CAF50');
        }
        
        // تحليل نوع البيانات المخزنة
        this.analyzeStoredData(link);
        
        // تحديث العداد
        const count = document.querySelectorAll('#diagFullResults .diag-log-entry').length;
        document.getElementById('diagFullCount').textContent = `📊 ${count} سجل`;
    },
    
    // تحليل جميع عناصر التحميل
    analyzeAllDownloadElements() {
        const links = document.querySelectorAll('a[download]');
        this.addResult('📊', `تم العثور على ${links.length} عنصر تحميل في الصفحة`, '#ff6600');
        
        if (links.length === 0) {
            this.addResult('ℹ️', 'لا توجد عناصر تحميل في الصفحة', '#888');
            return;
        }
        
        links.forEach((link, index) => {
            const href = link.getAttribute('href');
            const download = link.getAttribute('download');
            const isBlob = href && href.startsWith('blob:');
            const isData = href && href.startsWith('data:');
            const isHttp = href && href.startsWith('http');
            const isEmpty = !href || href === '#';
            
            let status = '✅';
            let color = '#4CAF50';
            let note = '';
            
            if (isEmpty) {
                status = '⚠️';
                color = '#FFC107';
                note = '(غير معين)';
            } else if (isBlob) {
                status = '⚠️';
                color = '#FFC107';
                note = '(Blob URL - قد ينتهي)';
            } else if (isData) {
                status = 'ℹ️';
                color = '#aaa';
                note = '(Data URL)';
            } else if (isHttp) {
                status = '✅';
                color = '#4CAF50';
                note = '(HTTP - يعمل دائماً)';
            }
            
            this.addResult(status, `عنصر ${index + 1}: ${download || 'ملف'} ${note}`, color);
        });
    },
    
    // اختبار صلاحية Blob URL
    testBlobUrl(url) {
        this.addResult('🔄', 'جاري اختبار صلاحية الرابط...', '#aaa');
        fetch(url, { method: 'HEAD' })
            .then(response => {
                if (response.ok) {
                    this.addResult('✅', '✅ Blob URL صالح ويعمل', '#4CAF50');
                } else {
                    this.addResult('❌', '❌ Blob URL غير صالح (انتهت صلاحيته)', '#f44336');
                    this.addResult('💡', 'الحل: استخدم ArrayBuffer بدلاً من Blob URL', '#FFC107');
                }
            })
            .catch(() => {
                this.addResult('❌', '❌ فشل التحقق من Blob URL (منتهي الصلاحية)', '#f44336');
                this.addResult('💡', 'الحل: استخدم ArrayBuffer بدلاً من Blob URL', '#FFC107');
            });
    },
    
    // تحليل البيانات المخزنة
    analyzeStoredData(link) {
        const messages = document.querySelectorAll('.message');
        let found = false;
        messages.forEach((msg) => {
            const img = msg.querySelector('img');
            const video = msg.querySelector('video');
            const audio = msg.querySelector('audio');
            const fileBtn = msg.querySelector('.download-file-btn');
            
            if (fileBtn === link || (img && img.src === link.href) || (video && video.src === link.href)) {
                found = true;
                const dataAttr = msg.getAttribute('data-file-type') || 'unknown';
                this.addResult('📊', `نوع البيانات: ${dataAttr}`, '#aaa');
            }
        });
        
        if (!found) {
            this.addResult('ℹ️', 'لم يتم العثور على الرسالة المرتبطة', '#888');
        }
    },
    
    // تحليل عميق
    deepAnalyze() {
        this.addResult('', '─'.repeat(50), '#9C27B0');
        this.addResult('🔬', '═══════ بدء التحليل العميق ═══════', '#9C27B0');
        
        // 1. تحليل localStorage
        this.analyzeLocalStorage();
        
        // 2. تحليل الذاكرة
        this.analyzeMemory();
        
        // 3. تحليل الروابط
        this.analyzeAllDownloadElements();
        
        // 4. تحليل المتصفح
        this.analyzeBrowser();
        
        this.addResult('✅', '═══════ اكتمل التحليل العميق ═══════', '#4CAF50');
        this.addResult('', '─'.repeat(50), '#9C27B0');
    },
    
    // تحليل localStorage
    analyzeLocalStorage() {
        this.addResult('📁', '─── تحليل localStorage ───', '#ff6600');
        let found = 0;
        let blobCount = 0;
        let arrayBufferCount = 0;
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('chat_')) {
                found++;
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    if (Array.isArray(data)) {
                        const fileMessages = data.filter(m => m.type === 'image' || m.type === 'video' || m.type === 'file');
                        if (fileMessages.length > 0) {
                            this.addResult('📨', `محادثة ${key}: ${fileMessages.length} ملفات`, '#aaa');
                            fileMessages.forEach((msg, idx) => {
                                const isBlob = typeof msg.data === 'string' && msg.data.startsWith('blob:');
                                const isArrayBuffer = msg.data instanceof ArrayBuffer;
                                const isString = typeof msg.data === 'string' && !isBlob;
                                if (isBlob) {
                                    blobCount++;
                                    this.addResult('⚠️', `  رسالة ${idx + 1}: Blob URL (ينتهي)`, '#FFC107');
                                } else if (isArrayBuffer) {
                                    arrayBufferCount++;
                                    this.addResult('✅', `  رسالة ${idx + 1}: ArrayBuffer (دائم)`, '#4CAF50');
                                } else if (isString) {
                                    this.addResult('⚠️', `  رسالة ${idx + 1}: String (غير معروف)`, '#FFC107');
                                }
                            });
                        }
                    }
                } catch (e) {
                    this.addResult('❌', `خطأ في قراءة ${key}`, '#f44336');
                }
            }
        }
        
        this.addResult('📊', `تم تحليل ${found} محادثة`, '#aaa');
        this.addResult('📊', `Blob URL: ${blobCount} | ArrayBuffer: ${arrayBufferCount}`, '#aaa');
        
        if (blobCount > 0) {
            this.addResult('💡', `🔴 ${blobCount} ملف مخزن كـ Blob URL (يحتاج إلى إصلاح)`, '#f44336');
        }
        if (arrayBufferCount > 0) {
            this.addResult('✅', `🟢 ${arrayBufferCount} ملف مخزن كـ ArrayBuffer (صحيح)`, '#4CAF50');
        }
    },
    
    // تحليل الذاكرة
    analyzeMemory() {
        this.addResult('🧠', '─── تحليل الذاكرة ───', '#ff6600');
        if (window.performance && window.performance.memory) {
            const mem = window.performance.memory;
            const used = (mem.usedJSHeapSize / 1024 / 1024).toFixed(1);
            const total = (mem.totalJSHeapSize / 1024 / 1024).toFixed(1);
            const limit = (mem.jsHeapSizeLimit / 1024 / 1024).toFixed(1);
            this.addResult('📊', `المستخدمة: ${used} MB`, '#aaa');
            this.addResult('📊', `الإجمالي: ${total} MB`, '#aaa');
            this.addResult('📊', `الحد الأقصى: ${limit} MB`, '#aaa');
            
            if (parseFloat(used) / parseFloat(limit) > 0.8) {
                this.addResult('⚠️', '⚠️ الذاكرة قريبة من الحد الأقصى!', '#FFC107');
            }
        } else {
            this.addResult('ℹ️', 'معلومات الذاكرة غير متوفرة في هذا المتصفح', '#888');
        }
    },
    
    // تحليل المتصفح
    analyzeBrowser() {
        this.addResult('🌐', '─── تحليل المتصفح ───', '#ff6600');
        const ua = navigator.userAgent;
        this.addResult('📊', `المتصفح: ${ua.split(' ').slice(0, 3).join(' ')}`, '#aaa');
        this.addResult('📊', `المنصة: ${navigator.platform}`, '#aaa');
        this.addResult('📊', `دعم Blob: ${!!window.Blob}`, '#aaa');
        this.addResult('📊', `دعم ArrayBuffer: ${!!window.ArrayBuffer}`, '#aaa');
        this.addResult('📊', `دعم URL.createObjectURL: ${!!window.URL?.createObjectURL}`, '#aaa');
    },
    
    // اختبار تحميل تجريبي
    testDownload() {
        this.addResult('🧪', '─── اختبار تحميل تجريبي ───', '#FF9800');
        
        // إنشاء ملف تجريبي
        const testData = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100, 33]);
        const blob = new Blob([testData], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        this.addResult('📄', 'تم إنشاء ملف تجريبي: "Hello World!"', '#aaa');
        this.addResult('🔗', `الرابط: ${url}`, '#aaa');
        
        // اختبار التحميل
        const link = document.createElement('a');
        link.href = url;
        link.download = 'test.txt';
        link.style.display = 'none';
        document.body.appendChild(link);
        
        this.addResult('🔄', 'محاولة تحميل الملف التجريبي...', '#aaa');
        
        try {
            link.click();
            this.addResult('✅', 'تم تحميل الملف التجريبي بنجاح!', '#4CAF50');
            this.addResult('💡', 'إذا عمل التحميل، فالمشكلة ليست في المتصفح', '#FFC107');
        } catch (e) {
            this.addResult('❌', `فشل التحميل التجريبي: ${e.message}`, '#f44336');
        }
        
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 1000);
        
        this.addResult('', '─'.repeat(50), '#FF9800');
    },
    
    // إضافة نتيجة
    addResult(icon, text, color = '#fff') {
        const container = document.getElementById('diagFullResults');
        if (!container) return;
        
        // إزالة النص الافتراضي
        const placeholder = container.querySelector('div[style*="text-align: center"]');
        if (placeholder && container.children.length === 1) {
            container.innerHTML = '';
        }
        
        const line = document.createElement('div');
        line.className = 'diag-log-entry';
        line.style.cssText = `
            padding: 3px 6px;
            border-bottom: 1px solid rgba(255,255,255,0.03);
            color: ${color};
            word-break: break-word;
            font-family: monospace;
            font-size: 12px;
        `;
        line.textContent = `${icon} ${text}`;
        container.appendChild(line);
        container.scrollTop = container.scrollHeight;
        
        // تخزين النص للتقرير
        this.fullReportText += `${icon} ${text}\n`;
        
        // تحديث العداد
        const count = container.querySelectorAll('.diag-log-entry').length;
        document.getElementById('diagFullCount').textContent = `📊 ${count} سجل`;
    },
    
    // نسخ التقرير
    copyFullReport() {
        if (!this.fullReportText) {
            alert('لا يوجد تقرير للنسخ. قم بتشغيل التشخيص أولاً.');
            return;
        }
        
        const text = `═══════════════════════════════════════\n` +
                    `🔍 تقرير تشخيص التحميل المتخصص\n` +
                    `📅 ${new Date().toLocaleString()}\n` +
                    `═══════════════════════════════════════\n\n` +
                    this.fullReportText +
                    `\n═══════════════════════════════════════\n` +
                    `📊 نهاية التقرير\n`;
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text)
                .then(() => {
                    this.addResult('✅', `✅ تم نسخ التقرير (${text.split('\n').length} سطر)`, '#4CAF50');
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
        textarea.style.cssText = 'position: fixed; opacity: 0; left: -9999px; top: -9999px;';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            this.addResult('✅', '✅ تم نسخ التقرير (طريقة بديلة)', '#4CAF50');
        } catch (e) {
            alert('فشل النسخ. يمكنك تحديد النص ونسخه يدوياً.');
        }
        document.body.removeChild(textarea);
    },
    
    // مسح النتائج
    clearResults() {
        const container = document.getElementById('diagFullResults');
        if (container) {
            container.innerHTML = `
                <div style="color: #888; text-align: center; padding: 40px 20px; font-size: 14px;">
                    <div style="font-size: 48px; margin-bottom: 15px;">🧹</div>
                    <div>تم مسح جميع النتائج</div>
                    <div style="font-size: 11px; margin-top: 8px; color: #666;">اضغط "▶️ بدء التشخيص" لبدء مراقبة جديدة</div>
                </div>
            `;
        }
        this.results = [];
        this.fullReportText = '';
        document.getElementById('diagFullCount').textContent = '📊 0 سجل';
    },
    
    // تصغير الشاشة
    minimize() {
        const overlay = document.getElementById('downloadDiagnosticOverlay');
        if (!overlay) return;
        
        if (this.isMinimized) {
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.querySelector('div[style*="width: 90%"]').style.height = '85vh';
            this.isMinimized = false;
            document.getElementById('diagMinimizeBtn').textContent = '⏬ تصغير';
        } else {
            overlay.style.alignItems = 'flex-end';
            overlay.style.justifyContent = 'flex-end';
            overlay.querySelector('div[style*="width: 90%"]').style.height = '200px';
            overlay.querySelector('div[style*="width: 90%"]').style.maxHeight = '200px';
            this.isMinimized = true;
            document.getElementById('diagMinimizeBtn').textContent = '⏫ تكبير';
        }
    },
    
    // عرض الشاشة
    show() {
        const overlay = document.getElementById('downloadDiagnosticOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
        }
    },
    
    // إخفاء الشاشة
    hide() {
        const overlay = document.getElementById('downloadDiagnosticOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
        if (this.isRunning) {
            this.stopDiagnostic();
        }
    }
};

// ==================== تشغيل الأداة ====================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        DownloadDiagnosticPro.init();
    });
} else {
    DownloadDiagnosticPro.init();
}

// ==================== اختصار لوحة المفاتيح ====================
document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+D = فتح/إغلاق أداة التشخيص
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

console.log('🔍 أداة تشخيص التحميل المتخصصة جاهزة! (شاشة كاملة)');
console.log('📌 استخدم Ctrl+Shift+D لفتح/إغلاق الشاشة');


