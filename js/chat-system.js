// ========== chat-system.js - النسخة النهائية (بدون WebRTC) ==========
// نظام الدردشة E2EE + إرسال الصور والملفات عبر Firebase

const ChatSystem = {
    currentChat: null, messages: {},
    friendInConversation: false,
    
    // ✅ قالب عنصر المحادثة (ثابت)
    chatItemTemplate: null,
    
    // ==================== القسم 1: init ====================
    init() { 
        this.loadAllChats(); 
        
        // ✅ تخزين مرجع القالب الثابت لقائمة المحادثات
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
    
    // ==================== القسم 3: showProgressBar ====================
    showProgressBar(message, percent) {
        const bar = document.getElementById('progressBar');
        if (!bar) return;
        bar.style.display = 'flex';
        const fill = document.getElementById('progressFill');
        const perc = document.getElementById('progressPercent');
        if (fill) fill.style.width = '0%';
        if (perc) perc.textContent = '0%';
    },
    
    // ==================== القسم 4: updateProgressBar ====================
    updateProgressBar(percent, message) {
        const fill = document.getElementById('progressFill');
        const perc = document.getElementById('progressPercent');
        if (fill) fill.style.width = Math.min(percent, 100) + '%';
        if (perc) perc.textContent = Math.round(percent) + '%';
    },
    
    // ==================== القسم 5: hideProgressBar ====================
    hideProgressBar() { 
        const bar = document.getElementById('progressBar'); 
        if (bar) bar.style.display = 'none'; 
    },
    
    // ==================== القسم 6: openChat ====================
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
        this.displayMessages(friendId);
        
        setTimeout(() => { const inp = document.getElementById('messageInput'); if (inp) inp.focus(); }, 300);
        setTimeout(() => { const c = document.getElementById('messagesContainer'); if (c) c.scrollTop = c.scrollHeight; }, 100);
    },
    
    // ==================== القسم 7: displayMessages ====================
    displayMessages(friendId) { 
        const c = document.getElementById('messagesContainer'); 
        if (!c) return; 
        c.innerHTML = ''; 
        const messages = this.messages[friendId] || [];
        
        messages.forEach(msg => {
            if (msg.type === 'text' || msg.type === 'image' || msg.type === 'video' || msg.type === 'file' || msg.type === 'voice' || msg.type === 'location') {
                this.displayMessage(msg);
            }
        });
        
        c.scrollTop = c.scrollHeight;
    },

    // ==================== القسم 8: setupVoiceControls (دالة مساعدة للبصمة الصوتية) ====================
    setupVoiceControls(clone, audioEl) {
        const playBtn = clone.querySelector('.voice-play-btn');
        const replayBtn = clone.querySelector('.voice-replay-btn');
        const muteBtn = clone.querySelector('.voice-mute-btn');
        const timeSpan = clone.querySelector('.voice-current-time');
        const durationSpan = clone.querySelector('.voice-duration');
        
        if (!audioEl || !audioEl.src) return;
        
        // إعداد مدة الصوت
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

    // ==================== القسم 9: displayMessage (معدل بالكامل - استخدام القوالب الثابتة) ====================
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
        
        // ✅ إنشاء العنصر الرئيسي باستخدام cloneNode من قالب ثابت
        const template = document.getElementById('messageWrapperTemplate');
        let div;
        if (template) {
            div = template.content.cloneNode(true).firstElementChild;
        } else {
            // ⚠️ Fallback فقط في حالة عدم وجود القالب (حل طوارئ)
            console.warn('⚠️ قالب messageWrapperTemplate غير موجود');
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
                    textSpan.innerHTML = this.escapeHtml(msg.text);
                }
                
                div.appendChild(clone);
            } else {
                console.warn('⚠️ قالب textMessageTemplate غير موجود');
            }
            
            // ✅ إضافة فاصل زمني كل 10 رسائل
            const existingTextMessages = c.querySelectorAll('.message.sent, .message.received');
            const currentMessageCount = existingTextMessages.length;
            
            if (currentMessageCount % 10 === 0) {
                const timeSeparator = document.createElement('div');
                timeSeparator.className = 'time-separator';
                timeSeparator.style.cssText = 'text-align: center; margin: 15px 0; font-size: 0.7rem; color: var(--text-light); opacity: 0.7; direction: ltr;';
                timeSeparator.textContent = dateTime;
                c.appendChild(timeSeparator);
            }
        }
        
        // ==================== معالجة الموقع ====================
        else if (msg.type === 'location') {
            let locationData = msg.data;
            let locationUrl = '';
            
            if (typeof locationData === 'object' && locationData.url) {
                locationUrl = locationData.url;
            } else if (typeof locationData === 'string') {
                const match = locationData.match(/https?:\/\/[^\s]+/);
                locationUrl = match ? match[0] : locationData;
            } else {
                locationUrl = '#';
            }
            
            const maxClicks = locationData.maxClicks;
            let clicksRemaining = locationData.clicksRemaining;
            
            const templateLoc = document.getElementById('locationMessageTemplate');
            if (templateLoc) {
                const clone = templateLoc.content.cloneNode(true);
                const locationDiv = clone.querySelector('.location-card');
                if (locationDiv) {
                    locationDiv.style.background = '#4CAF50';
                    
                    if (clicksRemaining !== undefined && clicksRemaining <= 0) {
                        locationDiv.style.background = '#888';
                        locationDiv.innerHTML = `<i class="fas fa-lock" style="font-size: 1.2rem; color: white;"></i>`;
                        locationDiv.style.border = 'none';
                    } else {
                        locationDiv.style.border = `1.5px solid ${borderColor}`;
                        locationDiv.innerHTML = `<i class="fas fa-map-marker-alt" style="font-size: 1.2rem; color: white;"></i>`;
                        locationDiv.onclick = (e) => {
                            e.stopPropagation();
                            if (clicksRemaining !== undefined && clicksRemaining <= 0) return;
                            window.open(locationUrl, '_blank');
                            if (msg.sender !== 'me' && clicksRemaining !== undefined && maxClicks < 999999) {
                                clicksRemaining--;
                                msg.data.clicksRemaining = clicksRemaining;
                                if (clicksRemaining <= 0) {
                                    locationDiv.style.background = '#888';
                                    locationDiv.style.cursor = 'default';
                                    locationDiv.innerHTML = `<i class="fas fa-lock" style="font-size: 1.2rem; color: white;"></i>`;
                                    locationDiv.onclick = () => {};
                                }
                                if (ChatSystem.currentChat) {
                                    const messages = ChatSystem.messages[ChatSystem.currentChat] || [];
                                    const msgIndex = messages.findIndex(m => m.id === msg.id);
                                    if (msgIndex !== -1) {
                                        messages[msgIndex].data.clicksRemaining = clicksRemaining;
                                        ChatSystem.saveMessage(ChatSystem.currentChat, messages[msgIndex]);
                                    }
                                }
                            }
                        };
                    }
                }
                div.appendChild(clone);
            } else {
                console.warn('⚠️ قالب locationMessageTemplate غير موجود');
            }
        }
        
        // ==================== معالجة الصورة ====================
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
            } else {
                console.warn('⚠️ قالب imageMessageTemplate غير موجود');
            }
        }
        
        // ==================== معالجة البصمة الصوتية ====================
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
            } else {
                console.warn('⚠️ قالب voiceMessageTemplate غير موجود');
            }
        }
        
        // ==================== معالجة الفيديو ====================
        else if (msg.type === 'video') {
            const templateVideo = document.getElementById('videoMessageTemplate');
            if (templateVideo) {
                const clone = templateVideo.content.cloneNode(true);
                const thumbnail = clone.querySelector('.video-thumbnail');
                if (thumbnail) {
                    thumbnail.style.border = `2px solid ${borderColor}`;
                    const video = thumbnail.querySelector('.video-thumbnail-content');
                    const source = video?.querySelector('source');
                    if (source && msg.data) {
                        source.src = msg.data;
                        video.load();
                    }
                    thumbnail.onclick = (e) => {
                        e.stopPropagation();
                        this.showVideoPreview(msg.data);
                    };
                }
                div.appendChild(clone);
            } else {
                console.warn('⚠️ قالب videoMessageTemplate غير موجود');
            }
        }
        
        // ==================== معالجة الملف ====================
        else if (msg.type === 'file') {
            const templateFile = document.getElementById('fileMessageTemplate');
            if (templateFile) {
                const clone = templateFile.content.cloneNode(true);
                const fileCard = clone.querySelector('.file-card');
                if (fileCard) {
                    fileCard.style.background = '#4CAF50';
                    fileCard.style.border = `1.5px solid ${borderColor}`;
                    const fileNameEl = fileCard.querySelector('.file-name');
                    if (fileNameEl) {
                        fileNameEl.textContent = msg.fileName || 'ملف';
                    }
                    const downloadBtn = fileCard.querySelector('.download-file-btn');
                    if (downloadBtn && msg.data) {
                        downloadBtn.onclick = (e) => {
                            e.stopPropagation();
                            const link = document.createElement('a');
                            link.href = msg.data;
                            link.download = msg.fileName || 'ملف';
                            link.click();
                        };
                    }
                }
                div.appendChild(clone);
            } else {
                console.warn('⚠️ قالب fileMessageTemplate غير موجود');
            }
        }
        
        // ✅ إضافة الرسالة إلى الحاوية
        c.appendChild(div); 
        c.scrollTop = c.scrollHeight;
    },

    // ==================== القسم 10: showImagePreview ====================
    showImagePreview(imageSrc) {
        const modal = document.getElementById('imagePreviewModal');
        const img = document.getElementById('previewImage');
        if (!modal || !img) return;
        
        img.src = imageSrc;
        modal.style.display = 'flex';
        
        this.setupImageZoom(modal, img);
    },

    // ==================== القسم 11: setupImageZoom ====================
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

    // ==================== القسم 12: showVideoPreview (معدل - تحكم مخصص) ====================
    showVideoPreview(videoSrc) {
        const modal = document.getElementById('videoPreviewModal');
        const video = document.getElementById('previewVideo');
        if (!modal || !video) return;
        
        // إخفاء عناصر التحكم الافتراضية
        video.removeAttribute('controls');
        
        video.src = videoSrc;
        modal.style.display = 'flex';
        
        // إظهار عناصر التحكم المخصصة
        const controls = document.getElementById('videoCustomControls');
        if (controls) controls.style.display = 'flex';
        
        // إعادة تعيين حالة الأزرار
        const playBtn = document.getElementById('videoPlayBtn');
        const muteBtn = document.getElementById('videoMuteBtn');
        const progress = document.getElementById('videoProgress');
        const currentTime = document.getElementById('videoCurrentTime');
        const duration = document.getElementById('videoDuration');
        
        if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
        if (muteBtn) muteBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        if (progress) {
            progress.value = 0;
            progress.style.direction = 'ltr';
            progress.style.background = `linear-gradient(to right, #4CAF50 0%, #4CAF50 0%, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.2) 100%)`;
        }
        if (currentTime) currentTime.textContent = '0:00';
        if (duration) duration.textContent = '0:00';
        
        // تشغيل تلقائي
        video.play().catch(() => {});
        
        // تحديث المدة عند تحميل الفيديو
        video.onloadedmetadata = function() {
            if (duration) {
                const mins = Math.floor(video.duration / 60);
                const secs = Math.floor(video.duration % 60);
                duration.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
            }
            if (progress) {
                progress.max = video.duration;
                progress.value = 0;
                progress.style.direction = 'ltr';
            }
        };
        
        // تحديث شريط التقدم والوقت أثناء التشغيل
        video.ontimeupdate = function() {
            if (progress) {
                progress.value = video.currentTime;
                const percent = (video.currentTime / video.duration) * 100;
                progress.style.background = `linear-gradient(to right, #4CAF50 0%, #4CAF50 ${percent}%, rgba(255,255,255,0.2) ${percent}%, rgba(255,255,255,0.2) 100%)`;
            }
            if (currentTime) {
                const mins = Math.floor(video.currentTime / 60);
                const secs = Math.floor(video.currentTime % 60);
                currentTime.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
            }
        };
        
        // عند انتهاء الفيديو
        video.onended = function() {
            if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
            if (progress) {
                progress.value = 0;
                progress.style.background = `linear-gradient(to right, #4CAF50 0%, #4CAF50 0%, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.2) 100%)`;
            }
            if (currentTime) currentTime.textContent = '0:00';
        };
    },

    // ==================== القسم 13: toggleVideoPlay ====================
    toggleVideoPlay() {
        const video = document.getElementById('previewVideo');
        const playBtn = document.getElementById('videoPlayBtn');
        if (!video || !playBtn) return;
        
        if (video.paused) {
            video.play();
            playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        } else {
            video.pause();
            playBtn.innerHTML = '<i class="fas fa-play"></i>';
        }
    },

    // ==================== القسم 14: toggleVideoMute ====================
    toggleVideoMute() {
        const video = document.getElementById('previewVideo');
        const muteBtn = document.getElementById('videoMuteBtn');
        if (!video || !muteBtn) return;
        
        video.muted = !video.muted;
        muteBtn.innerHTML = video.muted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
    },

    // ==================== القسم 15: seekVideo ====================
    seekVideo(value) {
        const video = document.getElementById('previewVideo');
        if (!video) return;
        video.currentTime = parseFloat(value);
    },

    // ==================== القسم 16: closeVideoPreview (معدل) ====================
    closeVideoPreview() {
        const modal = document.getElementById('videoPreviewModal');
        const video = document.getElementById('previewVideo');
        const controls = document.getElementById('videoCustomControls');
        
        if (modal) modal.style.display = 'none';
        if (video) {
            video.pause();
            video.src = '';
            video.onloadedmetadata = null;
            video.ontimeupdate = null;
            video.onended = null;
        }
        if (controls) controls.style.display = 'none';
        
        const playBtn = document.getElementById('videoPlayBtn');
        const muteBtn = document.getElementById('videoMuteBtn');
        const progress = document.getElementById('videoProgress');
        const currentTime = document.getElementById('videoCurrentTime');
        const duration = document.getElementById('videoDuration');
        
        if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
        if (muteBtn) muteBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        if (progress) {
            progress.value = 0;
            progress.style.direction = 'ltr';
            progress.style.background = `linear-gradient(to right, #4CAF50 0%, #4CAF50 0%, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.2) 100%)`;
        }
        if (currentTime) currentTime.textContent = '0:00';
        if (duration) duration.textContent = '0:00';
    },

    // ==================== القسم 17: downloadPreviewVideo ====================
    downloadPreviewVideo() {
        const video = document.getElementById('previewVideo');
        if (!video || !video.src) return;
        const link = document.createElement('a');
        link.href = video.src;
        link.download = 'video.mp4';
        link.click();
    },

    // ==================== القسم 18: sendMessage ====================
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

    // ==================== القسم 19: sendImage ====================
    async sendImage(file) { 
        if (!this.currentChat) return;
        
        try {
            this.showProgressBar('جاري ضغط وإرسال الصورة...', 0);
            
            // ضغط الصورة
            const compressedBlob = await SecureChatSystem.compressImage(file);
            
            // تشفير الصورة
            const pr = await SecureChatSystem.getMyPrivateKey();
            const pu = await SecureChatSystem.getReceiverPublicKey(this.currentChat);
            if (!pr || !pu) { this.hideProgressBar(); return; }
            const sk = await SecureChatSystem.deriveSharedKey(pr, pu);
            
            // تحويل الصورة إلى ArrayBuffer
            const arrayBuffer = await compressedBlob.arrayBuffer();
            const encryptedData = await SecureChatSystem.encryptData(arrayBuffer, sk);
            
            const msgId = Date.now().toString();
            
            // إرسال عبر Firebase
            await SecureChatSystem.sendToServer(this.currentChat, { 
                id: msgId, 
                type: 'image', 
                data: encryptedData,
                fileName: file.name,
                timestamp: Date.now() 
            });
            
            this.hideProgressBar();
            
            // عرض الصورة مؤقتاً للمرسل (سيتم استلامها من الخادم لاحقاً)
            const tempUrl = URL.createObjectURL(compressedBlob);
            this.displayMessage({ id: msgId, type: 'image', data: tempUrl, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent', _blobUrl: tempUrl });
            
            console.log('✅ تم إرسال الصورة عبر Firebase (تشفير E2EE)');
            
        } catch (e) {
            console.error('❌ فشل إرسال الصورة:', e);
            this.hideProgressBar();
            alert('فشل إرسال الصورة');
        }
    },

    // ==================== القسم 20: sendVideoFile ====================
    async sendVideoFile(file) { 
        if (!this.currentChat) return;
        
        try {
            // التحقق من حجم الفيديو
            await SecureChatSystem.validateVideo(file);
            
            this.showProgressBar('جاري إرسال الفيديو...', 0);
            
            // تشفير الفيديو
            const pr = await SecureChatSystem.getMyPrivateKey();
            const pu = await SecureChatSystem.getReceiverPublicKey(this.currentChat);
            if (!pr || !pu) { this.hideProgressBar(); return; }
            const sk = await SecureChatSystem.deriveSharedKey(pr, pu);
            
            // تحويل الفيديو إلى ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();
            const encryptedData = await SecureChatSystem.encryptData(arrayBuffer, sk);
            
            const msgId = Date.now().toString();
            
            // إرسال عبر Firebase
            await SecureChatSystem.sendToServer(this.currentChat, { 
                id: msgId, 
                type: 'video', 
                data: encryptedData,
                fileName: file.name,
                timestamp: Date.now() 
            });
            
            this.hideProgressBar();
            
            // عرض الفيديو مؤقتاً للمرسل
            const tempUrl = URL.createObjectURL(file);
            this.displayMessage({ id: msgId, type: 'video', data: tempUrl, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent', _blobUrl: tempUrl });
            
            console.log('✅ تم إرسال الفيديو عبر Firebase (تشفير E2EE)');
            
        } catch (e) {
            console.error('❌ فشل إرسال الفيديو:', e);
            this.hideProgressBar();
            alert(e.message || 'فشل إرسال الفيديو');
        }
    },

    // ==================== القسم 21: sendFile ====================
    async sendFile(file) { 
        if (!this.currentChat) return;
        
        try {
            this.showProgressBar('جاري إرسال الملف...', 0);
            
            // تشفير الملف
            const pr = await SecureChatSystem.getMyPrivateKey();
            const pu = await SecureChatSystem.getReceiverPublicKey(this.currentChat);
            if (!pr || !pu) { this.hideProgressBar(); return; }
            const sk = await SecureChatSystem.deriveSharedKey(pr, pu);
            
            // تحويل الملف إلى ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();
            const encryptedData = await SecureChatSystem.encryptData(arrayBuffer, sk);
            
            const msgId = Date.now().toString();
            
            // إرسال عبر Firebase
            await SecureChatSystem.sendToServer(this.currentChat, { 
                id: msgId, 
                type: 'file', 
                data: encryptedData,
                fileName: file.name,
                timestamp: Date.now() 
            });
            
            this.hideProgressBar();
            
            // عرض الملف مؤقتاً للمرسل
            const tempUrl = URL.createObjectURL(file);
            this.displayMessage({ id: msgId, type: 'file', data: tempUrl, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent', _blobUrl: tempUrl });
            
            console.log('✅ تم إرسال الملف عبر Firebase (تشفير E2EE)');
            
        } catch (e) {
            console.error('❌ فشل إرسال الملف:', e);
            this.hideProgressBar();
            alert('فشل إرسال الملف');
        }
    },

    // ==================== القسم 22: sendVoiceNote ====================
    async sendVoiceNote(audioBlob) { 
        if (!this.currentChat) return;
        
        try {
            this.showProgressBar('جاري إرسال البصمة الصوتية...', 0);
            
            // تشفير البصمة
            const pr = await SecureChatSystem.getMyPrivateKey();
            const pu = await SecureChatSystem.getReceiverPublicKey(this.currentChat);
            if (!pr || !pu) { this.hideProgressBar(); return; }
            const sk = await SecureChatSystem.deriveSharedKey(pr, pu);
            
            // تحويل البصمة إلى ArrayBuffer
            const arrayBuffer = await audioBlob.arrayBuffer();
            const encryptedData = await SecureChatSystem.encryptData(arrayBuffer, sk);
            
            const msgId = Date.now().toString();
            
            // إرسال عبر Firebase
            await SecureChatSystem.sendToServer(this.currentChat, { 
                id: msgId, 
                type: 'voice', 
                data: encryptedData,
                timestamp: Date.now() 
            });
            
            this.hideProgressBar();
            
            // عرض البصمة مؤقتاً للمرسل
            const tempUrl = URL.createObjectURL(audioBlob);
            this.displayMessage({ id: msgId, type: 'voice', data: tempUrl, sender: 'me', time: new Date().toISOString(), status: 'sent', _blobUrl: tempUrl });
            
            console.log('✅ تم إرسال البصمة الصوتية عبر Firebase (تشفير E2EE)');
            
        } catch (e) {
            console.error('❌ فشل إرسال البصمة:', e);
            this.hideProgressBar();
            alert('فشل إرسال البصمة الصوتية');
        }
    },

    // ==================== القسم 23: shareLocationDirect ====================
    async shareLocationDirect() { 
        if (!this.currentChat) return; 
        
        if (!navigator.geolocation) { alert('المتصفح لا يدعم تحديد الموقع'); return; }
        
        navigator.geolocation.getCurrentPosition(p => { 
            const lat = p.coords.latitude.toFixed(6);
            const lng = p.coords.longitude.toFixed(6);
            const locationData = {
                lat: parseFloat(lat),
                lng: parseFloat(lng),
                url: `https://www.google.com/maps?q=${lat},${lng}`
            };
            
            this.showLocationSwipeModalWithClicks(locationData);
            
        }, () => { 
            alert('❌ فشل تحديد موقعك');
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    },

    // ==================== القسم 24: showLocationSwipeModalWithClicks ====================
    showLocationSwipeModalWithClicks(locationData) {
        const modal = document.getElementById('locationSwipeModal');
        const coordsText = document.getElementById('locationCoordsText');
        if (!modal || !coordsText) return;
        
        coordsText.textContent = `${locationData.lat} , ${locationData.lng}`;
        modal.style.display = 'flex';
        
        this.setupLocationSwipe(locationData);
    },

    setupLocationSwipe(locationData) {
        const modal = document.getElementById('locationSwipeModal');
        const button = document.getElementById('locationSwipeButton');
        const leftThumb = document.getElementById('locationLeftThumb');
        const rightThumb = document.getElementById('locationRightThumb');
        const unlimitedToggle = document.getElementById('unlimitedToggle');
        
        if (!button || !leftThumb || !rightThumb) return;
        
        if (leftThumb._cleanup) leftThumb._cleanup();
        if (rightThumb._cleanup) rightThumb._cleanup();
        
        let selectedClicks = 1;
        let selectedButton = null;
        
        document.querySelectorAll('.click-preset').forEach(btn => {
            btn.onclick = () => {
                if (selectedButton) {
                    selectedButton.style.background = '#1a1a2e';
                    selectedButton.style.borderColor = '#4CAF50';
                }
                selectedButton = btn;
                selectedButton.style.background = '#4CAF50';
                selectedButton.style.borderColor = '#4CAF50';
                selectedClicks = parseInt(btn.dataset.clicks);
            };
        });
        
        const firstBtn = document.querySelector('.click-preset[data-clicks="1"]');
        if (firstBtn) {
            firstBtn.style.background = '#4CAF50';
            firstBtn.style.borderColor = '#4CAF50';
            selectedButton = firstBtn;
            selectedClicks = 1;
        }
        
        unlimitedToggle.addEventListener('change', () => {
            if (unlimitedToggle.checked) {
                document.querySelectorAll('.click-preset').forEach(btn => {
                    btn.style.opacity = '0.5';
                    btn.style.pointerEvents = 'none';
                });
            } else {
                document.querySelectorAll('.click-preset').forEach(btn => {
                    btn.style.opacity = '1';
                    btn.style.pointerEvents = 'auto';
                });
                if (selectedButton) {
                    selectedButton.style.background = '#4CAF50';
                }
            }
        });
        
        const buttonWidth = button.clientWidth;
        const centerPos = buttonWidth / 2;
        const maxLeftMove = centerPos - 35;
        const maxRightMove = centerPos - 35;
        
        let isDraggingLeft = false, isDraggingRight = false;
        let leftCurrentPos = 8, rightCurrentPos = 8;
        
        const onLeftStart = (e) => {
            e.preventDefault();
            isDraggingLeft = true;
            leftThumb.style.transition = 'none';
        };
        
        const onLeftMove = (e) => {
            if (!isDraggingLeft) return;
            e.preventDefault();
            const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
            const rect = button.getBoundingClientRect();
            let newLeft = clientX - rect.left - 27;
            newLeft = Math.max(8, Math.min(newLeft, maxLeftMove));
            leftCurrentPos = newLeft;
            leftThumb.style.left = newLeft + 'px';
        };
        
        const onLeftEnd = () => {
            if (!isDraggingLeft) return;
            isDraggingLeft = false;
            leftThumb.style.transition = 'left 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1)';
            if (leftCurrentPos >= maxLeftMove - 10) {
                leftThumb.style.left = maxLeftMove + 'px';
                
                let maxClicks;
                if (unlimitedToggle.checked) {
                    maxClicks = 999999;
                } else {
                    maxClicks = selectedClicks;
                    if (maxClicks < 1) maxClicks = 1;
                    if (maxClicks > 5) maxClicks = 5;
                }
                
                locationData.maxClicks = maxClicks;
                locationData.clicksRemaining = maxClicks;
                
                setTimeout(async () => {
                    // تشفير وإرسال الموقع عبر Firebase
                    try {
                        const pr = await SecureChatSystem.getMyPrivateKey();
                        const pu = await SecureChatSystem.getReceiverPublicKey(ChatSystem.currentChat);
                        if (pr && pu) {
                            const sk = await SecureChatSystem.deriveSharedKey(pr, pu);
                            const encrypted = await SecureChatSystem.encryptData(JSON.stringify(locationData), sk);
                            
                            await SecureChatSystem.sendToServer(ChatSystem.currentChat, {
                                id: Date.now().toString(),
                                type: 'location',
                                data: encrypted,
                                timestamp: Date.now()
                            });
                        }
                    } catch(e) {
                        console.error('❌ فشل إرسال الموقع:', e);
                    }
                    
                    const msgId = Date.now().toString();
                    this.displayMessage({ id: msgId, type: 'location', data: locationData, sender: 'me', time: new Date().toISOString(), status: 'sent' });
                    modal.style.display = 'none';
                }, 200);
            } else {
                leftThumb.style.left = '8px';
            }
        };
        
        const onRightStart = (e) => {
            e.preventDefault();
            isDraggingRight = true;
            rightThumb.style.transition = 'none';
        };
        
        const onRightMove = (e) => {
            if (!isDraggingRight) return;
            e.preventDefault();
            const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
            const rect = button.getBoundingClientRect();
            let newRight = rect.right - clientX - 27;
            newRight = Math.max(8, Math.min(newRight, maxRightMove));
            rightCurrentPos = newRight;
            rightThumb.style.right = newRight + 'px';
        };
        
        const onRightEnd = () => {
            if (!isDraggingRight) return;
            isDraggingRight = false;
            rightThumb.style.transition = 'right 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1)';
            if (rightCurrentPos >= maxRightMove - 10) {
                rightThumb.style.right = maxRightMove + 'px';
                setTimeout(() => {
                    modal.style.display = 'none';
                }, 200);
            } else {
                rightThumb.style.right = '8px';
            }
        };
        
        leftThumb.addEventListener('mousedown', onLeftStart);
        leftThumb.addEventListener('touchstart', onLeftStart, { passive: false });
        rightThumb.addEventListener('mousedown', onRightStart);
        rightThumb.addEventListener('touchstart', onRightStart, { passive: false });
        
        const moveHandler = (e) => { onLeftMove(e); onRightMove(e); };
        const endHandler = () => { onLeftEnd(); onRightEnd(); };
        
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', endHandler);
        document.addEventListener('touchmove', moveHandler, { passive: false });
        document.addEventListener('touchend', endHandler);
        
        leftThumb._cleanup = () => {
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', endHandler);
            document.removeEventListener('touchmove', moveHandler);
            document.removeEventListener('touchend', endHandler);
        };
        rightThumb._cleanup = leftThumb._cleanup;
        
        setTimeout(() => {
            if (modal && modal.style.display === 'flex') {
                modal.style.display = 'none';
            }
        }, 30000);
    },

    // ==================== القسم 25: saveMessage ====================
    saveMessage(friendId, message) {
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

    // ==================== القسم 26: updateLastMessage ====================
    updateLastMessage(friendId, lastMessage) { 
        document.querySelectorAll('.chat-item').forEach(item => { 
            if (item.getAttribute('onclick')?.includes(friendId)) { 
                const lm = item.querySelector('.last-message'), tm = item.querySelector('.chat-time'); 
                if (lm) lm.textContent = lastMessage; 
                if (tm) tm.textContent = 'الآن'; 
            } 
        }); 
    },

    // ==================== القسم 27: closeChat ====================
    closeChat() {
        console.log('🔴 closeChat - بدء إغلاق المحادثة');
        
        const chatId = this.currentChat;
        
        if (chatId) {
            console.log('📤 إغلاق المحادثة - سيتم تنظيف البيانات محلياً');
            this.cleanConversationData(chatId, false);
        }
        
        document.body.classList.remove('conversation-open');
        document.getElementById('conversationPage').style.display = 'none';
        document.querySelector('.chat-page').style.display = 'block';
        
        this.currentChat = null;
        this.friendInConversation = false;
        
        console.log('✅ closeChat - انتهى');
    },

    // ==================== القسم 28: cleanConversationData ====================
    cleanConversationData(chatId, cleanAll = false) {
        console.log('🧹 بدء مسح بيانات المحادثة:', chatId);
        
        const key = `chat_${chatId}`;
        if (cleanAll) {
            localStorage.removeItem(key);
            delete this.messages[chatId];
            console.log('✅ تم مسح localStorage بالكامل');
        } else {
            const messages = this.messages[chatId] || [];
            const textMessages = messages.filter(msg => msg.type === 'text').slice(-100);
            this.messages[chatId] = textMessages;
            localStorage.setItem(key, JSON.stringify(textMessages));
            console.log('✅ تم الاحتفاظ بآخر 100 رسالة نصية فقط');
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
        
        console.log('✅ اكتمل مسح بيانات المحادثة:', chatId);
    },

    // ==================== القسم 29: escapeHtml ====================
    escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; },
    
    // ==================== القسم 30: closeConversation ====================
    closeConversation() {
        console.log("🚪 إغلاق صفحة المحادثة والعودة للقائمة الرئيسية");
        
        document.body.classList.remove('conversation-open');

        this.currentChat = null;
        this.friendInConversation = false;
        
        const conversationPage = document.querySelector('.conversation-page');
        if (conversationPage) conversationPage.style.display = 'none';
        
        const chatPage = document.querySelector('.page.active') || document.querySelector('.chat-page');
        if (chatPage) chatPage.style.display = 'block';
        
        const bottomNav = document.querySelector('.bottom-nav');
        if (bottomNav) bottomNav.style.setProperty('display', 'flex', 'important');
        
        const appHeader = document.querySelector('.app-header');
        if (appHeader) appHeader.style.setProperty('display', 'flex', 'important');
    }
};

// ==================== القسم 31: تشغيل النظام ====================
ChatSystem.init();

// ==================== القسم 32: التنظيف الشامل عند تحميل الصفحة ====================
function performGlobalCleanup() {
    console.log('🧹 بدء التنظيف الشامل للموقع...');
    
    document.querySelectorAll('img, video, audio').forEach(el => {
        if (el.src && el.src.startsWith('blob:')) {
            URL.revokeObjectURL(el.src);
            el.src = '';
        }
    });
    
    const modals = ['incomingCall', 'locationSwipeModal', 'imagePreviewModal', 'videoPreviewModal'];
    modals.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'none';
            if (id === 'imagePreviewModal') {
                const img = document.getElementById('previewImage');
                if (img) img.src = '';
            }
            if (id === 'videoPreviewModal') {
                const video = document.getElementById('previewVideo');
                if (video) { video.pause(); video.src = ''; }
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

// ✅ الحل النهائي والثابت للمتصفحات والهواتف عند ظهور واختفاء الكيبورد
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

// 🛡️ تأمين شامل: منع سحب الواجهة بالخطأ للأعلى عند لمس الهيدر أو شريط الكتابة
document.addEventListener('touchmove', function(e) {
    if (document.body.classList.contains('conversation-open')) {
        const isMessagesContainer = e.target.closest('.messages-container');
        if (!isMessagesContainer) {
            e.preventDefault();
        }
    }
}, { passive: false });

// 🛡️ جدار حماية صارم: منع تكبير أو تصغير الموقع نهائياً بالإصبعين أو النقر المزدوج
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
