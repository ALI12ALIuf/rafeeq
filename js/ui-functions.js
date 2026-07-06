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

// ==================== القسم 2: تحميل المحادثات (معدل - يدعم طلبات الصداقة) ====================
let chatsLoaded = false;
let isLoadingChats = false;

async function loadChats(force = false) { 
    if (!window.auth || !window.auth.currentUser) return; 
    const list = document.getElementById('chatsList'); 
    if (!list) return; 
    
    if (isLoadingChats) {
        console.log('⏳ جاري تحميل المحادثات بالفعل، تخطي...');
        return;
    }
    
    if (chatsLoaded && !force) {
        console.log('⏭️ قائمة المحادثات محملة مسبقاً، تخطي التحميل');
        return;
    }
    
    isLoadingChats = true;
    
    const chatTemplate = ChatSystem.chatItemTemplate || document.getElementById('chatItemTemplate');
    const requestTemplate = document.getElementById('friendRequestChatTemplate');
    
    if (!chatTemplate) {
        console.warn('⚠️ قالب chatItemTemplate غير موجود');
        isLoadingChats = false;
        return;
    }
    
    try { 
        const udoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get(); 
        if (!udoc.exists) {
            isLoadingChats = false;
            return; 
        }
        const friends = udoc.data().friends || []; 
        
        list.innerHTML = '';
        
        // ===== القسم 2.1: عرض طلبات الصداقة في الأعلى =====
        if (requestTemplate) {
            const pendingRequests = await window.loadFriendRequestsForChat ? await window.loadFriendRequestsForChat() : [];
            const addedRequestIds = new Set();
            
            for (const req of pendingRequests) {
                if (addedRequestIds.has(req.id)) continue;
                addedRequestIds.add(req.id);
                
                try {
                    const senderDoc = await window.db.collection('users').doc(req.from).get();
                    if (!senderDoc.exists) continue;
                    
                    const sender = senderDoc.data();
                    const clone = requestTemplate.content.cloneNode(true);
                    const requestItem = clone.querySelector('.friend-request-item');
                    
                    const avatar = requestItem.querySelector('.chat-avatar-emoji');
                    const nameSpan = requestItem.querySelector('.friend-request-name');
                    const idSpan = requestItem.querySelector('.friend-request-id');
                    const copyBtn = requestItem.querySelector('.copy-id-btn');
                    const acceptBtn = requestItem.querySelector('.accept-friend-btn');
                    const rejectBtn = requestItem.querySelector('.reject-friend-btn');
                    
                    if (avatar) avatar.textContent = window.getEmojiForUser ? window.getEmojiForUser(sender) : '👤';
                    if (nameSpan) nameSpan.textContent = sender.name || 'مستخدم';
                    if (idSpan) idSpan.textContent = sender.shareableId || '0000000000';
                    
                    if (copyBtn) {
                        copyBtn.onclick = (e) => {
                            e.stopPropagation();
                            const id = sender.shareableId || '0000000000';
                            navigator.clipboard.writeText(id).then(() => {
                                const icon = copyBtn.querySelector('i');
                                if (icon) {
                                    icon.className = 'fas fa-check';
                                    setTimeout(() => {
                                        icon.className = 'fas fa-copy';
                                    }, 1500);
                                }
                            }).catch(() => {});
                        };
                    }
                    
                    if (acceptBtn) {
                        acceptBtn.onclick = (e) => {
                            e.stopPropagation();
                            window.acceptFriendRequest(req.id, req.from);
                        };
                    }
                    
                    if (rejectBtn) {
                        rejectBtn.onclick = (e) => {
                            e.stopPropagation();
                            window.rejectFriendRequest(req.id);
                        };
                    }
                    
                    list.appendChild(clone);
                    
                } catch (e) {
                    console.warn('خطأ في عرض طلب صداقة:', e);
                }
            }
        }
        
        // ===== القسم 2.2: عرض قائمة الأصدقاء =====
        if (!friends.length) { 
            if (list.children.length === 0) {
                list.innerHTML = `<div class="empty-state"><i class="fas fa-comments"></i><h3>لا توجد محادثات</h3><p>أضف أصدقاء لبدء المحادثة</p></div>`; 
            }
            chatsLoaded = true;
            isLoadingChats = false;
            return; 
        } 
        
        const addedFriendIds = new Set();
        
        for (const fid of friends) { 
            if (addedFriendIds.has(fid)) continue;
            addedFriendIds.add(fid);
            
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
                    
                    const clone = chatTemplate.content.cloneNode(true);
                    const chatItem = clone.querySelector('.chat-item');
                    
                    const avatar = chatItem.querySelector('.chat-avatar-emoji');
                    const name = chatItem.querySelector('.chat-info h4');
                    const lastMsg = chatItem.querySelector('.last-message');
                    const time = chatItem.querySelector('.chat-time');
                    
                    if (avatar) avatar.textContent = window.getEmojiForUser ? window.getEmojiForUser(f) : '👤';
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
        isLoadingChats = false;
        
        if (list.children.length === 0) {
            list.innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا توجد محادثات نشطة</h3><p>ابدأ بإضافة أصدقاء جدد</p></div>`;
        }
        
    } catch (e) {
        console.error('خطأ في loadChats:', e);
        list.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>حدث خطأ</h3><p>حاول تحديث الصفحة</p></div>`;
        chatsLoaded = true;
        isLoadingChats = false;
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

// ==================== القسم 13: تخصيص الشخصية ====================

// البيانات الافتراضية للشخصية
let customAvatarData = {
    skin: 'medium',
    eyes: 'brown',
    hair: 'black',
    hairLength: 'medium',
    beard: 'none',
    glasses: 'none'
};

// دالة تحديث المعاينة
function updateAvatarPreview() {
    const preview = document.getElementById('avatarPreview');
    if (!preview) return;
    
    // بناء الشخصية باستخدام الإيموجي + التعديلات
    let emoji = '👤';
    const skinMap = {
        'light': '🏻',
        'medium': '🏽',
        'tan': '🏾',
        'dark': '🏿',
        'olive': '🏽'
    };
    
    // اختيار الإيموجي الأساسي حسب طول الشعر
    const hairEmojis = {
        'short': '👦',
        'medium': '👨',
        'long': '👩',
        'bald': '👨‍🦲'
    };
    
    // محاولة بناء شخصية
    let baseEmoji = hairEmojis[customAvatarData.hairLength] || '👤';
    
    // إضافة لون البشرة
    const skinCode = skinMap[customAvatarData.skin] || '';
    if (skinCode && baseEmoji !== '👤') {
        // بعض الإيموجيات تدعم تعديل لون البشرة
        baseEmoji = baseEmoji.replace(/[\uD83C\uDFFB-\uD83C\uDFFF]/, '');
        // نضيف لون البشرة كـ modifier
        baseEmoji = baseEmoji + skinCode;
    }
    
    // إضافة اللحية
    if (customAvatarData.beard === 'full') {
        baseEmoji = '🧔' + skinCode;
    } else if (customAvatarData.beard === 'light') {
        baseEmoji = '🧔‍♂️' + skinCode;
    }
    
    // إضافة النظارات
    if (customAvatarData.glasses === 'glasses') {
        baseEmoji = '👓' + baseEmoji;
    } else if (customAvatarData.glasses === 'sunglasses') {
        baseEmoji = '🕶️' + baseEmoji;
    }
    
    preview.textContent = baseEmoji || '👤';
}

// دالة اختيار خيار (للأزرار الدائرية)
function selectAvatarOption(category, value, event) {
    // تحديث البيانات
    customAvatarData[category] = value;
    
    // تحديث المظهر (إزالة التحديد من الكل)
    const parent = event.target.closest('div[id$="Options"]');
    if (parent) {
        parent.querySelectorAll('.avatar-opt, .avatar-opt-btn').forEach(btn => {
            btn.style.borderColor = 'var(--border)';
            btn.style.background = btn.classList.contains('avatar-opt') ? btn.style.background : 'transparent';
        });
        event.target.style.borderColor = 'var(--primary)';
        if (event.target.classList.contains('avatar-opt-btn')) {
            event.target.style.background = 'var(--primary)';
            event.target.style.color = 'white';
        }
    }
    
    updateAvatarPreview();
}

// دالة حفظ الشخصية المخصصة
window.saveCustomAvatar = function() {
    if (!auth?.currentUser) {
        alert('الرجاء تسجيل الدخول أولاً');
        return;
    }
    
    // حفظ البيانات في قاعدة البيانات
    db.collection('users').doc(auth.currentUser.uid).update({
        avatar: customAvatarData
    }).then(() => {
        // تحديث الواجهة
        const profileAvatar = document.getElementById('profileAvatarEmoji');
        const preview = document.getElementById('avatarPreview');
        if (profileAvatar) profileAvatar.textContent = preview.textContent;
        if (currentAvatar) currentAvatar.textContent = preview.textContent;
        
        closeModal();
        alert('تم حفظ الشخصية بنجاح!');
    }).catch((error) => {
        console.error('خطأ في حفظ الشخصية:', error);
        alert('حدث خطأ في حفظ الشخصية');
    });
};

// دالة تحميل الشخصية المحفوظة
async function loadCustomAvatar(userId) {
    try {
        const doc = await db.collection('users').doc(userId).get();
        if (doc.exists) {
            const data = doc.data();
            if (data.avatar && typeof data.avatar === 'object') {
                customAvatarData = data.avatar;
                return customAvatarData;
            }
        }
    } catch (e) {
        console.warn('خطأ في تحميل الشخصية:', e);
    }
    return null;
}

// دالة الحصول على إيموجي الشخصية لعرضها
window.getAvatarEmoji = function(userData) {
    if (userData?.avatar && typeof userData.avatar === 'object') {
        // محاولة بناء إيموجي من البيانات
        const skinMap = {
            'light': '🏻',
            'medium': '🏽',
            'tan': '🏾',
            'dark': '🏿',
            'olive': '🏽'
        };
        const hairMap = {
            'short': '👦',
            'medium': '👨',
            'long': '👩',
            'bald': '👨‍🦲'
        };
        const skin = skinMap[userData.avatar.skin] || '';
        let emoji = hairMap[userData.avatar.hairLength] || '👤';
        
        if (userData.avatar.beard === 'full' || userData.avatar.beard === 'light') {
            emoji = '🧔' + skin;
        }
        // نضيف لون البشرة
        if (skin && emoji !== '👤' && !emoji.includes(skin)) {
            emoji = emoji.replace(/[\uD83C\uDFFB-\uD83C\uDFFF]/, '') + skin;
        }
        return emoji || '👤';
    }
    return '👤';
};

// دالة فتح نافذة تخصيص الشخصية
window.openAvatarModal = function() {
    const modal = document.getElementById('avatarModal');
    if (!modal) return;
    
    // تحميل البيانات المحفوظة
    if (auth?.currentUser) {
        loadCustomAvatar(auth.currentUser.uid).then(data => {
            if (data) {
                customAvatarData = data;
                updateAvatarPreview();
                
                // تحديث واجهة الاختيارات
                document.querySelectorAll('.avatar-opt, .avatar-opt-btn').forEach(btn => {
                    btn.style.borderColor = 'var(--border)';
                    btn.style.background = btn.classList.contains('avatar-opt') ? btn.style.background : 'transparent';
                    btn.style.color = 'var(--text)';
                });
                
                // تحديد الخيارات المحفوظة
                document.querySelectorAll('.avatar-opt').forEach(btn => {
                    const skin = btn.dataset.skin;
                    const eyes = btn.dataset.eyes;
                    const hair = btn.dataset.hair;
                    if (skin && skin === customAvatarData.skin) {
                        btn.style.borderColor = 'var(--primary)';
                    }
                    if (eyes && eyes === customAvatarData.eyes) {
                        btn.style.borderColor = 'var(--primary)';
                    }
                    if (hair && hair === customAvatarData.hair) {
                        btn.style.borderColor = 'var(--primary)';
                    }
                });
                
                document.querySelectorAll('.avatar-opt-btn').forEach(btn => {
                    const hairLength = btn.dataset.hairlength;
                    const beard = btn.dataset.beard;
                    const glasses = btn.dataset.glasses;
                    if (hairLength && hairLength === customAvatarData.hairLength) {
                        btn.style.borderColor = 'var(--primary)';
                        btn.style.background = 'var(--primary)';
                        btn.style.color = 'white';
                    }
                    if (beard && beard === customAvatarData.beard) {
                        btn.style.borderColor = 'var(--primary)';
                        btn.style.background = 'var(--primary)';
                        btn.style.color = 'white';
                    }
                    if (glasses && glasses === customAvatarData.glasses) {
                        btn.style.borderColor = 'var(--primary)';
                        btn.style.background = 'var(--primary)';
                        btn.style.color = 'white';
                    }
                });
            }
        });
    }
    
    modal.classList.add('active');
};

// ربط الأحداث عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
    // ربط أحداث اختيار الخيارات
    document.querySelectorAll('.avatar-opt').forEach(btn => {
        btn.addEventListener('click', function(e) {
            const category = Object.keys(this.dataset)[0];
            const value = this.dataset[category];
            selectAvatarOption(category, value, e);
        });
    });
    
    document.querySelectorAll('.avatar-opt-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            const category = Object.keys(this.dataset)[0];
            const value = this.dataset[category];
            selectAvatarOption(category, value, e);
        });
    });
});

// ✅ تحديث دالة getEmojiForUser القديمة لتستخدم النظام الجديد
window.getEmojiForUser = function(userData) {
    return window.getAvatarEmoji(userData);
};

// ==================== القسم 14: دوال إغلاق المعاينات ====================
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

window.downloadPreviewImage = function() {
    const img = document.getElementById('previewImage');
    if (!img || !img.src) return;
    const link = document.createElement('a');
    link.href = img.src;
    link.download = 'image.jpg';
    link.click();
};

window.downloadPreviewVideo = function() {
    const video = document.getElementById('previewVideo');
    if (!video || !video.src) return;
    const link = document.createElement('a');
    link.href = video.src;
    link.download = 'video.mp4';
    link.click();
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
        
        // ✅ تحديث عنوان الصفحة في رأس التطبيق
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) {
            const titles = {
                'home': 'الرئيسية',
                'chat': 'الدردشة',
                'profile': 'الملف الشخصي',
                'settings': 'الإعدادات'
            };
            pageTitle.textContent = titles[id] || id;
            pageTitle.setAttribute('data-i18n', id);
        }
        
        if (id === 'chat') loadChats(); 
        nav.forEach(n => n.classList.toggle('active', n.dataset.page === id)); 
    } 
    
    window.switchPage = switchPage;
    
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
