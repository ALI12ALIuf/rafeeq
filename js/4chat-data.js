// ========== 4chat-data.js - نظام نقل الملفات والصور المستقل ==========
// لا يطلب أي صلاحيات ميكروفون/كاميرا، يعمل فقط عبر Data Channel

const ChatDataSystem = {
    pc: null,
    dc: null,
    initialized: false,
    currentChatId: null,
    incomingChunks: {},
    incomingFileInfo: {},
    
    servers: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
        ]
    },
    
    // ==================== حذف إشارات الملفات فقط ====================
    async deleteFileSignals(chatId) {
        if (!chatId || !window.db) return;
        try {
            const messagesRef = window.db.collection('secure_messages');
            const snapshot = await messagesRef
                .where('to', '==', chatId)
                .where('package.type', 'in', ['file_offer', 'file_answer', 'file_ice'])
                .get();
            
            if (snapshot.empty) return;
            
            const batch = window.db.batch();
            snapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            console.log(`✅ تم حذف ${snapshot.size} إشارة ملفات من Firestore`);
        } catch(e) {
            console.warn('⚠️ فشل حذف إشارات الملفات:', e);
        }
    },
    
    // ==================== تهيئة القناة ====================
    async init(chatId) {
        if (!ChatSystem.featuresEnabled || !ChatSystem.friendInConversation) {
            console.log('🚫 منع تهيئة نظام الملفات - الميزات غير مفعلة');
            return false;
        }
        
        if (this.initialized && this.dc && this.dc.readyState === 'open') {
            console.log('✅ نظام الملفات موجود ومفتوح');
            return true;
        }
        
        if (this.dc && this.dc.readyState === 'connecting') {
            console.log('⏳ نظام الملفات في طور الاتصال...');
            return new Promise((resolve) => {
                const timeout = setTimeout(() => resolve(false), 10000);
                const check = setInterval(() => {
                    if (this.dc && this.dc.readyState === 'open') {
                        clearInterval(check);
                        clearTimeout(timeout);
                        resolve(true);
                    } else if (this.dc && (this.dc.readyState === 'failed' || this.dc.readyState === 'closed')) {
                        clearInterval(check);
                        clearTimeout(timeout);
                        this.createNewDataChannel(chatId).then(resolve);
                    }
                }, 500);
            });
        }
        
        return this.createNewDataChannel(chatId);
    },
    
    async createNewDataChannel(chatId) {
        if (!ChatSystem.featuresEnabled || !ChatSystem.friendInConversation) {
            console.log('🚫 منع إنشاء قناة ملفات - الميزات غير مفعلة');
            return false;
        }
        
        this.cleanup();
        this.currentChatId = chatId;
        
        try {
            console.log('🔧 إنشاء قناة ملفات مستقلة...');
            
            this.pc = new RTCPeerConnection(this.servers);
            this.dc = this.pc.createDataChannel('fileTransfer', { ordered: true, maxRetransmits: 3 });
            this.setupDataChannelEvents();
            
            this.pc.onicecandidate = e => {
                if (e.candidate) this.sendSignal(chatId, { candidate: e.candidate, type: 'file_ice' });
            };
            
            this.pc.oniceconnectionstatechange = () => {
                if (this.pc?.iceConnectionState === 'failed') {
                    console.log('🔄 إعادة محاولة ICE لقناة الملفات');
                    this.pc.restartIce();
                }
            };
            
            this.pc.ondatachannel = e => {
                console.log('📡 استقبال Data Channel للملفات');
                this.setupDataChannelEvents(e.channel);
                this.dc = e.channel;
            };
            
            const offer = await this.pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
            await this.pc.setLocalDescription(offer);
            await this.sendSignal(chatId, { sdp: this.pc.localDescription, type: 'file_offer' });
            
            console.log('✅ تم إرسال طلب فتح قناة الملفات');
            this.initialized = true;
            return true;
            
        } catch (error) {
            console.error('❌ فشل إنشاء قناة الملفات:', error);
            return false;
        }
    },
    
    // ==================== معالجة الإشارات الواردة ====================
    async handleSignaling(data) {
        if (!this.pc) {
            this.pc = new RTCPeerConnection(this.servers);
            this.pc.ondatachannel = e => {
                this.dc = e.channel;
                this.setupDataChannelEvents();
            };
            this.pc.onicecandidate = e => {
                if (e.candidate && this.currentChatId) {
                    this.sendSignal(this.currentChatId, { candidate: e.candidate, type: 'file_ice' });
                }
            };
        }
        
        try {
            if (data.sdp) {
                await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                if (data.sdp.type === 'offer') {
                    const answer = await this.pc.createAnswer();
                    await this.pc.setLocalDescription(answer);
                    await this.sendSignal(this.currentChatId, { sdp: this.pc.localDescription, type: 'file_answer' });
                }
            } else if (data.candidate) {
                if (this.pc && data.candidate) {
                    await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                }
            }
        } catch (e) {
            console.warn('⚠️ خطأ في معالجة إشارة الملفات:', e);
        }
    },
    
    // ==================== إرسال الإشارات ====================
    async sendSignal(calleeId, data) {
        if (!ChatSystem.featuresEnabled || !ChatSystem.friendInConversation) {
            return;
        }
        
        if (this.dc && this.dc.readyState === 'open') {
            try {
                this.dc.send(JSON.stringify({ type: 'file_signal', data: data }));
                console.log('📡 تم إرسال إشارة ملفات مباشرة');
                return;
            } catch(e) {}
        }
        
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(calleeId);
            if (!myPrivateKey || !receiverPublicKey) return;
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify(data), sharedKey);
            await SecureChatSystem.sendToServer(calleeId, { 
                id: Date.now().toString(), 
                type: 'file_signal', 
                data: encrypted, 
                timestamp: Date.now() 
            });
            console.log('📡 تم إرسال إشارة ملفات عبر Firebase');
        } catch (error) {
            console.error('❌ فشل إرسال إشارة الملفات:', error);
        }
    },
    
    // ==================== إعداد أحداث القناة ====================
    setupDataChannelEvents(channel = null) {
        const targetChannel = channel || this.dc;
        if (!targetChannel) return;
        
        targetChannel.onmessage = e => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'file_signal') {
                    this.handleSignaling(msg.data);
                } else if (msg.chunk !== undefined) {
                    this.handleChunkMessage(msg);
                }
            } catch (error) {
                console.error('خطأ في معالجة رسالة الملفات:', error);
            }
        };
        
        targetChannel.onopen = () => {
            console.log('✅ قناة الملفات مفتوحة ومستقرة');
            this.initialized = true;
        };
        
        targetChannel.onclose = () => {
            console.log('🔴 قفلت قناة الملفات');
            this.initialized = false;
        };
        
        targetChannel.onerror = (e) => {
            console.error('❌ خطأ في قناة الملفات:', e);
        };
    },
    
    // ==================== إرسال الملفات ====================
    async sendFile(file, type) {
        if (!this.dc || this.dc.readyState !== 'open') {
            console.log('❌ قناة الملفات غير مفتوحة');
            await this.init(this.currentChatId);
            if (!this.dc || this.dc.readyState !== 'open') {
                alert('قناة نقل الملفات غير جاهزة، حاول مرة أخرى');
                return false;
            }
        }
        
        try {
            let blobToSend = file;
            if (type === 'image') {
                blobToSend = await this.compressImage(file);
            }
            
            const b64 = await this.fileToBase64(blobToSend);
            const chunkSize = 16000;
            const totalChunks = Math.ceil(b64.length / chunkSize);
            const fileId = Date.now().toString();
            
            console.log(`📤 إرسال ${type}: ${file.name || 'ملف'} (${totalChunks} جزء)`);
            
            for (let i = 0; i < totalChunks; i++) {
                if (this.dc.readyState !== 'open') {
                    ChatSystem.hideProgressBar();
                    return false;
                }
                const chunk = {
                    type: type,
                    data: b64.substring(i * chunkSize, (i + 1) * chunkSize),
                    chunk: i,
                    total: totalChunks,
                    id: fileId,
                    fileName: file.name || 'ملف'
                };
                this.dc.send(JSON.stringify(chunk));
                const progress = ((i + 1) / totalChunks) * 100;
                const typeLabel = type === 'video' ? 'الفيديو' : type === 'image' ? 'الصورة' : 'الملف';
                ChatSystem.updateProgressBar(progress, `جاري إرسال ${typeLabel}...`);
                await new Promise(r => setTimeout(r, 30));
            }
            ChatSystem.hideProgressBar();
            console.log('✅ تم إرسال الملف بنجاح عبر قناة مستقلة');
            return true;
        } catch (e) {
            console.error('❌ فشل إرسال الملف:', e);
            ChatSystem.hideProgressBar();
            return false;
        }
    },
    
    // ==================== استقبال الملفات ====================
    handleChunkMessage(msg) {
        if (!this.incomingChunks[msg.id]) {
            this.incomingChunks[msg.id] = [];
            this.incomingFileInfo[msg.id] = {
                type: msg.type,
                fileName: msg.fileName,
                total: msg.total,
                received: 0
            };
            ChatSystem.showProgressBar('جاري استلام الملف...', 0);
        }
        
        this.incomingChunks[msg.id][msg.chunk] = msg.data;
        this.incomingFileInfo[msg.id].received++;
        const progress = (this.incomingFileInfo[msg.id].received / msg.total) * 100;
        const fileType = msg.type === 'video' ? 'الفيديو' : msg.type === 'image' ? 'الصورة' : 'الملف';
        ChatSystem.updateProgressBar(progress, `جاري استلام ${fileType}...`);
        
        if (this.incomingFileInfo[msg.id].received === msg.total) {
            const fullData = this.incomingChunks[msg.id].join('');
            
            let finalData = fullData;
            if (msg.type === 'image' && !fullData.startsWith('data:image')) {
                finalData = 'data:image/jpeg;base64,' + fullData;
            } else if (msg.type === 'video' && !fullData.startsWith('data:video')) {
                finalData = 'data:video/mp4;base64,' + fullData;
            } else if (msg.type === 'voice' && !fullData.startsWith('data:audio')) {
                finalData = 'data:audio/webm;base64,' + fullData;
            }
            
            const displayMsg = {
                id: msg.id,
                type: msg.type === 'location' ? 'text' : msg.type,
                data: finalData,
                fileName: msg.fileName || (msg.type === 'image' ? 'صورة' : msg.type === 'video' ? 'فيديو' : 'ملف'),
                sender: 'friend',
                time: new Date().toISOString()
            };
            
            if (ChatSystem.currentChat) {
                ChatSystem.saveMessage(ChatSystem.currentChat, displayMsg);
                ChatSystem.displayMessage(displayMsg);
            }
            ChatSystem.hideProgressBar();
            delete this.incomingChunks[msg.id];
            delete this.incomingFileInfo[msg.id];
        }
    },
    
    // ==================== أدوات مساعدة ====================
    compressImage(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width, height = img.height;
                    const maxSize = 800;
                    if (width > height && width > maxSize) {
                        height = (height * maxSize) / width;
                        width = maxSize;
                    } else if (height > maxSize) {
                        width = (width * maxSize) / height;
                        height = maxSize;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.7);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    },
    
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1] || reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },
    
    // ==================== التنظيف الكامل ====================
    cleanup() {
        if (this.dc) {
            try { this.dc.close(); } catch(e) {}
            this.dc = null;
        }
        if (this.pc) {
            try { this.pc.close(); } catch(e) {}
            this.pc = null;
        }
        this.initialized = false;
        this.incomingChunks = {};
        this.incomingFileInfo = {};
        console.log('🧼 تم تنظيف نظام الملفات بالكامل');
    },
    
    closeFullSystem() {
        if (this.currentChatId) {
            this.deleteFileSignals(this.currentChatId);
        }
        this.cleanup();
        this.currentChatId = null;
        console.log('✅ تم إغلاق نظام الملفات وتنظيف إشاراته');
    }
};

console.log('✅ ChatDataSystem جاهز - نظام ملفات مستقل');
