// ========== نظام التشفير E2EE + ضغط + حذف 24 ساعة ==========
const SecureChatSystem = {
    MESSAGE_EXPIRY_HOURS: 24,
    
    async init() {
        if (!window.auth?.currentUser) return false;
        try { await this.setupKeys(); this.startReceiving(); return true; } catch (e) { return false; }
    },
    
    async setupKeys() {
        if (!localStorage.getItem('enc_private_key')) {
            const kp = await this.generateKeyPair();
            const pk = await this.exportPublicKey(kp.publicKey);
            await window.db.collection('users').doc(window.auth.currentUser.uid).update({ publicKey: pk });
            const pe = await window.crypto.subtle.exportKey('pkcs8', kp.privateKey);
            localStorage.setItem('enc_private_key', btoa(String.fromCharCode(...new Uint8Array(pe))));
        }
    },
    
    async generateKeyPair() { return await window.crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']); },
    async exportPublicKey(k) { const r = await window.crypto.subtle.exportKey('raw', k); return btoa(String.fromCharCode(...new Uint8Array(r))); },
    async importPublicKey(b) { const bin = Uint8Array.from(atob(b), c => c.charCodeAt(0)); return await window.crypto.subtle.importKey('raw', bin, { name: 'ECDH', namedCurve: 'P-256' }, true, []); },
    async getMyPrivateKey() { const s = localStorage.getItem('enc_private_key'); if (!s) return null; const b = Uint8Array.from(atob(s), c => c.charCodeAt(0)); return await window.crypto.subtle.importKey('pkcs8', b, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']); },
    async getReceiverPublicKey(uid) { const d = await window.db.collection('users').doc(uid).get(); if (!d.exists || !d.data().publicKey) return null; return await this.importPublicKey(d.data().publicKey); },
    async deriveSharedKey(pr, pu) { return await window.crypto.subtle.deriveKey({ name: 'ECDH', public: pu }, pr, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); },
    
    async encryptData(data, sk) {
        const enc = new TextEncoder(); const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('rafeeq-secure') }, sk, typeof data === 'string' ? enc.encode(data) : data);
        const c = new Uint8Array(iv.length + encrypted.byteLength); c.set(iv); c.set(new Uint8Array(encrypted), iv.length);
        return btoa(String.fromCharCode(...c));
    },
    
    async decryptData(eb64, sk) {
        const enc = new TextEncoder(); const c = Uint8Array.from(atob(eb64), x => x.charCodeAt(0));
        const iv = c.slice(0, 12); const d = c.slice(12);
        const dec = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('rafeeq-secure') }, sk, d);
        return new TextDecoder().decode(dec);
    },
    
    async compressImage(file) {
        return new Promise(resolve => {
            const img = new Image(); const cv = document.createElement('canvas'); const ctx = cv.getContext('2d');
            img.onload = () => { let w = img.width, h = img.height; if (w > 1200 || h > 1200) { if (w > h) { h *= 1200 / w; w = 1200; } else { w *= 1200 / h; h = 1200; } } cv.width = w; cv.height = h; ctx.drawImage(img, 0, 0, w, h); cv.toBlob(resolve, 'image/jpeg', 0.8); };
            img.src = URL.createObjectURL(file);
        });
    },
    
    async compressVideo(file) {
        return new Promise(resolve => {
            const v = document.createElement('video'); const cv = document.createElement('canvas'); const ctx = cv.getContext('2d');
            v.preload = 'metadata'; v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); let w = v.videoWidth, h = v.videoHeight; if (h > 480) { w *= 480 / h; h = 480; } cv.width = Math.round(w); cv.height = Math.round(h);
                const st = cv.captureStream(30); const mr = new MediaRecorder(st, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 300000 }); const ch = [];
                mr.ondataavailable = e => ch.push(e.data); mr.onstop = () => resolve(new Blob(ch, { type: 'video/webm' }));
                v.currentTime = 0; v.play(); mr.start(); setTimeout(() => { mr.stop(); v.pause(); }, Math.min(v.duration * 1000, 60000)); };
            v.src = URL.createObjectURL(file);
        });
    },
    
    fileToBase64(blob) { return new Promise(r => { const rd = new FileReader(); rd.onloadend = () => r(rd.result); rd.readAsDataURL(blob); }); },
    
    async sendToServer(rid, pkg) {
        await window.db.collection('secure_messages').add({ to: rid, from: window.auth.currentUser.uid, package: pkg, timestamp: firebase.firestore.FieldValue.serverTimestamp(), expiresAt: firebase.firestore.Timestamp.fromDate(new Date(Date.now() + this.MESSAGE_EXPIRY_HOURS * 3600000)) });
    },
    
    startReceiving() {
        if (!window.auth?.currentUser) return;
        window.db.collection('secure_messages').where('to', '==', window.auth.currentUser.uid).onSnapshot(async snap => { for (const ch of snap.docChanges()) { if (ch.type === 'added') { const m = { id: ch.doc.id, ...ch.doc.data() }; await this.processReceivedMessage(m); await ch.doc.ref.delete(); } } });
    },
    
    async processReceivedMessage(msg) {
        try {
            const mp = await this.getMyPrivateKey(); const sp = await this.getReceiverPublicKey(msg.from);
            if (!mp || !sp) return; const sk = await this.deriveSharedKey(mp, sp);
            const p = msg.package;
            if (p.type === 'text') { const dec = await this.decryptData(p.data, sk); ChatSystem.saveMessage(msg.from, { id: p.id, type: 'text', text: dec, sender: 'friend', time: new Date().toISOString() }); if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from); ChatSystem.updateLastMessage(msg.from, dec); }
            else if (p.type === 'voice') { const dec = await this.decryptData(p.data, sk); ChatSystem.saveMessage(msg.from, { id: p.id, type: 'voice', data: dec, sender: 'friend', time: new Date().toISOString() }); if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from); ChatSystem.updateLastMessage(msg.from, '🎤 بصمة'); }
            else if (p.type === 'image') { const dec = await this.decryptData(p.data, sk); ChatSystem.saveMessage(msg.from, { id: p.id, type: 'image', data: dec, sender: 'friend', time: new Date().toISOString() }); if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from); ChatSystem.updateLastMessage(msg.from, '📷 صورة'); }
            else if (p.type === 'video') { const dec = await this.decryptData(p.data, sk); ChatSystem.saveMessage(msg.from, { id: p.id, type: 'video', data: dec, sender: 'friend', time: new Date().toISOString() }); if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from); ChatSystem.updateLastMessage(msg.from, '🎥 فيديو'); }
            else if (p.type === 'file') { const dec = await this.decryptData(p.data, sk); ChatSystem.saveMessage(msg.from, { id: p.id, type: 'file', data: dec, fileName: p.fileName, sender: 'friend', time: new Date().toISOString() }); if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from); ChatSystem.updateLastMessage(msg.from, '📎 ملف'); }
            loadChats();
        } catch (e) {}
    }
};

document.addEventListener('DOMContentLoaded', () => { ensureSinglePage(); setupNavigation(); setupModals(); loadChats(); setupChatListeners(); updateTripsCount(); if (window.auth?.currentUser) SecureChatSystem.init(); });

function formatNumber(n) { if (n >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'')+'M'; if (n >= 1e3) return (n/1e3).toFixed(1).replace(/\.0$/,'')+'K'; return n.toString(); }
async function updateTripsCount() { if (!window.auth?.currentUser) return; try { const s = await window.db.collection('trips').where('userId','==',window.auth.currentUser.uid).where('status','==','ended').get(); const el = document.getElementById('tripsCount'); if (el) el.textContent = formatNumber(s.size); } catch(e){} }
function ensureSinglePage() { document.querySelectorAll('.profile-subpage').forEach(p=>p.style.display='none'); document.querySelectorAll('.page').forEach(p=>{p.style.display=p.classList.contains('active')?'block':'none';}); }
function setupNavigation() {
    const ni = document.querySelectorAll('.nav-item'), pg = document.querySelectorAll('.page');
    if(!ni.length||!pg.length)return;
    const sw = (id) => { pg.forEach(p=>p.classList.remove('active')); const t=document.querySelector(`.page.${id}-page`); if(t){t.classList.add('active');t.style.display='block';} pg.forEach(p=>{if(!p.classList.contains('active'))p.style.display='none';}); document.querySelectorAll('.profile-subpage').forEach(p=>p.style.display='none'); if(id==='chat')loadChats(); document.body.classList.remove('conversation-open'); ni.forEach(i=>i.classList.toggle('active',i.dataset.page===id)); };
    ni.forEach(i=>i.addEventListener('click',()=>sw(i.dataset.page)));
}
function setupModals() {
    window.openLanguageModal = () => document.getElementById('languageModal')?.classList.add('active');
    window.closeModal = () => document.querySelectorAll('.modal').forEach(m=>m.classList.remove('active'));
    document.querySelectorAll('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('active');}));
    document.querySelectorAll('.settings-item').forEach(i=>{if(i.querySelector('[data-i18n="language"]'))i.addEventListener('click',openLanguageModal);});
}

const ChatSystem = {
    currentChat: null, messages: {},
    init() { this.loadAllChats(); },
    loadAllChats() { for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith('chat_')){const fid=k.replace('chat_','');try{this.messages[fid]=JSON.parse(localStorage.getItem(k))||[];}catch(e){this.messages[fid]=[];}}}},
    openChat(fid, name, avatar) {
        this.currentChat = fid; document.body.classList.add('conversation-open');
        document.getElementById('conversationName').textContent = name;
        document.getElementById('conversationAvatar').textContent = avatar || '👤';
        document.querySelector('.chat-page').style.display = 'none';
        document.getElementById('conversationPage').style.display = 'flex';
        this.displayMessages(fid);
        setTimeout(()=>{const inp=document.getElementById('messageInput');if(inp)inp.focus();},300);
        setTimeout(()=>{const ct=document.getElementById('messagesContainer');if(ct)ct.scrollTop=ct.scrollHeight;},100);
    },
    displayMessages(fid) { const ct=document.getElementById('messagesContainer');if(!ct)return;ct.innerHTML='';(this.messages[fid]||[]).forEach(m=>this.displayMessage(m)); },
    displayMessage(msg) {
        const ct=document.getElementById('messagesContainer');if(!ct)return;
        const div=document.createElement('div');div.className=`message ${msg.sender==='me'?'sent':'received'}`;div.id=`msg-${msg.id}`;
        const time=new Date(msg.time).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'});
        let sh='';if(msg.sender==='me'){let ic='✓',cl='sent';if(msg.status==='delivered'){ic='✓✓';cl='delivered';}else if(msg.status==='read'){ic='✓✓';cl='read';}sh=`<span class="message-status ${cl}">${ic}</span>`;}
        if(msg.type==='text')div.innerHTML=`<div class="message-content">${this.escapeHtml(msg.text)}</div><div class="message-info"><span class="message-time">${time}</span>${sh}</div>`;
        else if(msg.type==='image')div.innerHTML=`<img src="${msg.data}" class="message-image"><div class="message-info"><span class="message-time">${time}</span>${sh}</div>`;
        else if(msg.type==='voice')div.innerHTML=`<audio controls src="${msg.data}" class="message-audio"></audio><div class="message-info"><span class="message-time">${time}</span>${sh}</div>`;
        else if(msg.type==='video')div.innerHTML=`<video controls src="${msg.data}" class="message-video" style="max-width:250px;border-radius:12px;"></video><div class="message-info"><span class="message-time">${time}</span>${sh}</div>`;
        else if(msg.type==='file')div.innerHTML=`<div class="message-content" style="cursor:pointer;">📎 ${msg.fileName||'ملف'}</div><div class="message-info"><span class="message-time">${time}</span>${sh}</div>`;
        ct.appendChild(div);ct.scrollTop=ct.scrollHeight;
    },
    async sendMessage(text) { if(!this.currentChat||!text.trim())return false; const mid=Date.now().toString(); try{const mp=await SecureChatSystem.getMyPrivateKey();const rp=await SecureChatSystem.getReceiverPublicKey(this.currentChat);if(!mp||!rp)return false;const sk=await SecureChatSystem.deriveSharedKey(mp,rp);const enc=await SecureChatSystem.encryptData(text,sk);await SecureChatSystem.sendToServer(this.currentChat,{id:mid,type:'text',data:enc,timestamp:Date.now()});this.saveMessage(this.currentChat,{id:mid,type:'text',text,sender:'me',time:new Date().toISOString(),status:'sent'});this.displayMessage({id:mid,type:'text',text,sender:'me',time:new Date().toISOString(),status:'sent'});return true;}catch(e){return false;} },
    async sendImage(file) { if(!this.currentChat)return;const mid=Date.now().toString();try{const comp=await SecureChatSystem.compressImage(file);const b64=await SecureChatSystem.fileToBase64(comp);const mp=await SecureChatSystem.getMyPrivateKey();const rp=await SecureChatSystem.getReceiverPublicKey(this.currentChat);if(!mp||!rp)return;const sk=await SecureChatSystem.deriveSharedKey(mp,rp);const enc=await SecureChatSystem.encryptData(b64,sk);await SecureChatSystem.sendToServer(this.currentChat,{id:mid,type:'image',data:enc,timestamp:Date.now()});this.saveMessage(this.currentChat,{id:mid,type:'image',data:b64,sender:'me',time:new Date().toISOString(),status:'sent'});this.displayMessage({id:mid,type:'image',data:b64,sender:'me',time:new Date().toISOString(),status:'sent'});}catch(e){} },
    async sendVoiceNote(blob) { if(!this.currentChat)return;const mid=Date.now().toString();try{const b64=await SecureChatSystem.fileToBase64(blob);const mp=await SecureChatSystem.getMyPrivateKey();const rp=await SecureChatSystem.getReceiverPublicKey(this.currentChat);if(!mp||!rp)return;const sk=await SecureChatSystem.deriveSharedKey(mp,rp);const enc=await SecureChatSystem.encryptData(b64,sk);await SecureChatSystem.sendToServer(this.currentChat,{id:mid,type:'voice',data:enc,timestamp:Date.now()});this.saveMessage(this.currentChat,{id:mid,type:'voice',data:b64,sender:'me',time:new Date().toISOString(),status:'sent'});this.displayMessage({id:mid,type:'voice',data:b64,sender:'me',time:new Date().toISOString(),status:'sent'});}catch(e){} },
    async sendVideo(file) { if(!this.currentChat)return;const mid=Date.now().toString();try{let vf=file;if(file.size>10*1024*1024)vf=await SecureChatSystem.compressVideo(file);const b64=await SecureChatSystem.fileToBase64(vf);const mp=await SecureChatSystem.getMyPrivateKey();const rp=await SecureChatSystem.getReceiverPublicKey(this.currentChat);if(!mp||!rp)return;const sk=await SecureChatSystem.deriveSharedKey(mp,rp);const enc=await SecureChatSystem.encryptData(b64,sk);await SecureChatSystem.sendToServer(this.currentChat,{id:mid,type:'video',data:enc,timestamp:Date.now()});this.saveMessage(this.currentChat,{id:mid,type:'video',data:b64,sender:'me',time:new Date().toISOString(),status:'sent'});this.displayMessage({id:mid,type:'video',data:b64,sender:'me',time:new Date().toISOString(),status:'sent'});}catch(e){} },
    async sendFile(file) { if(!this.currentChat)return;const mid=Date.now().toString();try{const b64=await SecureChatSystem.fileToBase64(file);const mp=await SecureChatSystem.getMyPrivateKey();const rp=await SecureChatSystem.getReceiverPublicKey(this.currentChat);if(!mp||!rp)return;const sk=await SecureChatSystem.deriveSharedKey(mp,rp);const enc=await SecureChatSystem.encryptData(b64,sk);await SecureChatSystem.sendToServer(this.currentChat,{id:mid,type:'file',data:enc,fileName:file.name,timestamp:Date.now()});this.saveMessage(this.currentChat,{id:mid,type:'file',data:b64,fileName:file.name,sender:'me',time:new Date().toISOString(),status:'sent'});this.displayMessage({id:mid,type:'file',data:b64,fileName:file.name,sender:'me',time:new Date().toISOString(),status:'sent'});}catch(e){} },
    saveMessage(fid,msg) { const k=`chat_${fid}`;let h=[];try{h=JSON.parse(localStorage.getItem(k))||[];}catch(e){}h.push(msg);if(h.length>100)h=h.slice(-100);localStorage.setItem(k,JSON.stringify(h));this.messages[fid]=h; },
    updateLastMessage(fid,lm) { document.querySelectorAll('.chat-item').forEach(i=>{if(i.getAttribute('onclick')?.includes(fid)){const l=i.querySelector('.last-message');const t=i.querySelector('.chat-time');if(l)l.textContent=lm;if(t)t.textContent='الآن';}}); },
    closeChat() { document.body.classList.remove('conversation-open');document.getElementById('conversationPage').style.display='none';document.querySelector('.chat-page').style.display='block';this.currentChat=null; },
    escapeHtml(t) { const d=document.createElement('div');d.textContent=t;return d.innerHTML; }
};

ChatSystem.init();

async function loadChats() {
    if(!window.auth?.currentUser)return;const cl=document.getElementById('chatsList');if(!cl)return;
    try{const ud=await window.db.collection('users').doc(window.auth.currentUser.uid).get();if(!ud.exists)return;const friends=ud.data().friends||[];if(!friends.length){cl.innerHTML='<div class="empty-state"><i class="fas fa-comments"></i><h3>لا توجد محادثات</h3></div>';return;}let html='';for(const fid of friends){try{const fd=await window.db.collection('users').doc(fid).get();if(fd.exists){const f=fd.data();const av=window.getEmojiForUser(f);const k=`chat_${fid}`;let lm='اضغط لبدء المحادثة',lt='';try{const h=JSON.parse(localStorage.getItem(k))||[];if(h.length){const l=h[h.length-1];if(l.type==='text')lm=l.text;else if(l.type==='image')lm='📷 صورة';else if(l.type==='voice')lm='🎤 بصمة';else if(l.type==='video')lm='🎥 فيديو';else if(l.type==='file')lm='📎 ملف';lt=new Date(l.time).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'});}}catch(e){}html+=`<div class="chat-item" onclick="openChat('${fid}')"><div class="chat-avatar-emoji">${av}</div><div class="chat-info"><h4>${f.name||'مستخدم'}</h4><p class="last-message">${lm}</p></div><div class="chat-meta"><span class="chat-time">${lt||''}</span></div></div>`;}}catch(e){}}cl.innerHTML=html;}catch(e){}
}

function setupChatListeners() { document.addEventListener('click',e=>{const m=document.getElementById('attachmentMenu');const b=document.querySelector('.attach-btn');if(m&&b&&!m.contains(e.target)&&!b.contains(e.target))m.style.display='none';const p=document.getElementById('emojiPicker');const eb=document.querySelector('.emoji-btn');if(p&&eb&&!p.contains(e.target)&&!eb.contains(e.target))p.style.display='none';}); }

window.openChat = (fid) => { window.db.collection('users').doc(fid).get().then(d=>{if(d.exists)ChatSystem.openChat(fid,d.data().name,window.getEmojiForUser?.(d.data())||'👤');}); };
window.sendMessage = () => { const i=document.getElementById('messageInput');if(i.value.trim())ChatSystem.sendMessage(i.value.trim()).then(s=>{if(s)i.value='';}); };
window.handleMessageKeyPress = (e) => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();window.sendMessage();} };
window.showAttachmentMenu = () => { document.getElementById('attachmentMenu').style.display=document.getElementById('attachmentMenu').style.display==='none'?'flex':'none';document.getElementById('emojiPicker').style.display='none'; };
window.showEmojiPicker = () => { const p=document.getElementById('emojiPicker');p.style.display=p.style.display==='none'?'block':'none';document.getElementById('attachmentMenu').style.display='none';if(!p.querySelector('.emoji-grid').children.length){['😊','😂','❤️','👍','🎉','😢','😡','😍','🤔','👌','🙏','🔥','✨','⭐','🌙','☀️'].forEach(em=>{const b=document.createElement('button');b.textContent=em;b.onclick=()=>{const i=document.getElementById('messageInput');i.value+=em;i.focus();p.style.display='none';};p.querySelector('.emoji-grid').appendChild(b);});} };
window.sendImage = () => { const i=document.createElement('input');i.type='file';i.accept='image/*';i.onchange=e=>{const f=e.target.files[0];if(f&&ChatSystem.currentChat)ChatSystem.sendImage(f);};i.click();document.getElementById('attachmentMenu').style.display='none'; };
window.sendVideo = () => { const i=document.createElement('input');i.type='file';i.accept='video/*';i.onchange=e=>{const f=e.target.files[0];if(f&&ChatSystem.currentChat)ChatSystem.sendVideo(f);};i.click();document.getElementById('attachmentMenu').style.display='none'; };
window.sendFile = () => { const i=document.createElement('input');i.type='file';i.accept='*/*';i.onchange=e=>{const f=e.target.files[0];if(f&&ChatSystem.currentChat)ChatSystem.sendFile(f);};i.click();document.getElementById('attachmentMenu').style.display='none'; };
window.sendVoiceNote = () => { navigator.mediaDevices.getUserMedia({audio:true}).then(s=>{const mr=new MediaRecorder(s);const ch=[];mr.ondataavailable=e=>ch.push(e.data);mr.onstop=()=>{ChatSystem.sendVoiceNote(new Blob(ch,{type:'audio/webm'}));s.getTracks().forEach(t=>t.stop());};mr.start();const sb=document.querySelector('.send-btn');const vb=document.querySelector('.voice-btn');if(sb)sb.style.display='none';if(vb){vb.style.display='flex';vb.onclick=()=>{if(mr.state==='recording'){mr.stop();sb.style.display='flex';vb.style.display='none';}};}setTimeout(()=>{if(mr.state==='recording'){mr.stop();if(sb)sb.style.display='flex';if(vb)vb.style.display='none';}},60000);});document.getElementById('attachmentMenu').style.display='none'; };
window.shareLocation = () => { if(navigator.geolocation)navigator.geolocation.getCurrentPosition(p=>ChatSystem.sendMessage(`📍 موقعي: https://www.google.com/maps?q=${p.coords.latitude},${p.coords.longitude}`));document.getElementById('attachmentMenu').style.display='none'; };
window.closeConversation = () => ChatSystem.closeChat();
window.openEditProfileModal = () => { document.getElementById('editName').value=document.getElementById('profileName').textContent;document.getElementById('currentAvatarEmoji').textContent=document.getElementById('profileAvatarEmoji').textContent;document.getElementById('editProfileModal').classList.add('active'); };
window.saveProfile = () => { const n=document.getElementById('editName').value.trim();if(!n||n.length>25)return;if(auth?.currentUser)db.collection('users').doc(auth.currentUser.uid).update({name:n}).then(()=>{document.getElementById('profileName').textContent=n;closeModal();}); };
window.showUserTrips = () => { document.querySelector('.profile-page').style.display='none';document.getElementById('tripsPage').style.display='block'; };
window.goBack = () => { document.querySelectorAll('.profile-subpage').forEach(p=>p.style.display='none');const pp=document.querySelector('.profile-page');if(pp){pp.style.display='block';pp.classList.add('active');} };
window.selectAvatar = (t) => { const m={male:'👨',female:'👩',boy:'🧒',girl:'👧',father:'👨‍🦳',mother:'👩‍🦳',grandfather:'👴',grandmother:'👵'};const e=m[t]||'👤';document.getElementById('profileAvatarEmoji').textContent=e;document.getElementById('currentAvatarEmoji').textContent=e;if(auth?.currentUser)db.collection('users').doc(auth.currentUser.uid).update({avatarType:t});closeModal(); };
window.openAvatarModal = () => document.getElementById('avatarModal')?.classList.add('active');
window.getEmojiForUser = (u) => { const m={male:'👨',female:'👩',boy:'🧒',girl:'👧',father:'👨‍🦳',mother:'👩‍🦳',grandfather:'👴',grandmother:'👵'};return m[u?.avatarType]||'👤'; };
window.clearMessages = () => { const c=document.getElementById('messagesContainer');if(c)c.innerHTML=''; };
if('Notification' in window)Notification.requestPermission();
console.log('✅ E2EE كامل - جميع الأنواع');
