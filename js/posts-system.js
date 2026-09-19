// ========== posts-system.js - النسخة النهائية ==========

const PostsSystem = {
    currentTab: 'jobs',
    selectedCountry: 'IQ',
    selectedCategory: 'all',
    showAllCountries: false,
    
    IMAGE_TARGET_SIZE: 400,
    IMAGE_QUALITY: 0.75,
    
    _isInitialized: false,
    _isLoadingPosts: false,
    
    _countryCloseHandler: null,
    _relationshipCache: {
        friends: new Set(),
        sentRequests: new Set(),
        receivedRequests: new Map(),
        lastUpdate: 0
    },
    
    jobCategories: [
        { code: 'all', name: 'الكل', icon: 'fas fa-layer-group', color: '#64B5F6' },
        { code: 'it', name: 'تقنية المعلومات', icon: 'fas fa-laptop-code', color: '#2196F3' },
        { code: 'engineering', name: 'الهندسة', icon: 'fas fa-hard-hat', color: '#FF9800' },
        { code: 'education', name: 'التعليم', icon: 'fas fa-graduation-cap', color: '#9C27B0' },
        { code: 'medical', name: 'الطب والصحة', icon: 'fas fa-heartbeat', color: '#f44336' },
        { code: 'design', name: 'التصميم', icon: 'fas fa-palette', color: '#E91E63' },
        { code: 'accounting', name: 'المحاسبة', icon: 'fas fa-chart-bar', color: '#4CAF50' },
        { code: 'marketing', name: 'التسويق', icon: 'fas fa-bullhorn', color: '#FF5722' },
        { code: 'industry', name: 'الصناعة', icon: 'fas fa-industry', color: '#795548' },
        { code: 'transport', name: 'النقل', icon: 'fas fa-truck', color: '#607D8B' },
        { code: 'restaurants', name: 'المطاعم', icon: 'fas fa-utensils', color: '#FFC107' },
        { code: 'crafts', name: 'الحرف والمهن', icon: 'fas fa-tools', color: '#00BCD4' },
        { code: 'other', name: 'أخرى', icon: 'fas fa-th-large', color: '#9E9E9E' }
    ],
    
    // ==================== init ====================
    init() {
        if (this._isInitialized) {
            console.log('⏭️ PostsSystem مُهيّأ بالفعل - تخطي');
            return;
        }
        this._isInitialized = true;
        
        console.log('🚀 تهيئة نظام المنشورات...');
        this.loadSavedSettings();
        this.setupFieldCounters();
        this.loadAllPosts();
        this.setupRealtimeListeners();
        this.renderCountryHeaderSelector();
        this.renderJobCategories();
        
        console.log('✅ تم تهيئة نظام المنشورات');
    },
    
    loadSavedSettings() {
        try {
            const savedCountry = localStorage.getItem('selected_country');
            if (savedCountry) this.selectedCountry = savedCountry;
            const savedCategory = localStorage.getItem('selected_job_category');
            if (savedCategory) this.selectedCategory = savedCategory;
        } catch (e) {}
    },
    
    saveSettings() {
        try {
            localStorage.setItem('selected_country', this.selectedCountry);
            localStorage.setItem('selected_job_category', this.selectedCategory);
        } catch (e) {}
    },
    
    // ==================== ✅ إغلاق كل القوائم ====================
    closeAllPublishDropdowns() {
        document.querySelectorAll('.publish-category-dropdown, .publish-country-dropdown').forEach(d => {
            d.remove();
        });
        document.querySelectorAll('.country-header-dropdown').forEach(d => {
            d.remove();
        });
    },
    
    // ==================== ✅ إعداد عدادات الحقول ====================
    setupFieldCounters() {
        const fields = [
            { inputId: 'jobName', counterId: 'jobNameCounter', max: 15, type: 'text' },
            { inputId: 'jobAge', counterId: 'jobAgeCounter', max: 2, type: 'number' },
            { inputId: 'jobTitle', counterId: 'jobTitleCounter', max: 15, type: 'text' },
            { inputId: 'jobBio', counterId: 'jobBioCounter', max: 400, type: 'textarea' },
            { inputId: 'marriageName', counterId: 'marriageNameCounter', max: 15, type: 'text' },
            { inputId: 'marriageAge', counterId: 'marriageAgeCounter', max: 2, type: 'number' },
            { inputId: 'marriageBio', counterId: 'marriageBioCounter', max: 400, type: 'textarea' }
        ];
        
        fields.forEach(({ inputId, counterId, max, type }) => {
            const input = document.getElementById(inputId);
            const counter = document.getElementById(counterId);
            if (!input || !counter) return;
            
            if (input._counterHandler) {
                input.removeEventListener('input', input._counterHandler);
            }
            
            input.setAttribute('maxlength', max);
            
            const handler = (e) => {
                let value = e.target.value;
                
                if (type === 'number') {
                    value = value.replace(/[^0-9]/g, '');
                }
                
                if (value.length > max) {
                    value = value.substring(0, max);
                }
                
                if (type === 'textarea') {
                    value = value.replace(/ {3,}/g, ' ');
                    value = value.replace(/\n{3,}/g, '\n\n');
                }
                
                if (e.target.value !== value) {
                    e.target.value = value;
                }
                
                const len = value.length;
                counter.textContent = `${len}/${max}`;
                counter.classList.remove('warning', 'full');
                input.classList.remove('limit-reached');
                
                if (len >= max) {
                    counter.classList.add('full');
                    input.classList.add('limit-reached');
                } else if (len >= max - Math.ceil(max * 0.1)) {
                    counter.classList.add('warning');
                }
            };
            
            input._counterHandler = handler;
            input.addEventListener('input', handler);
            
            if (!input._pasteHandler) {
                const pasteHandler = (e) => {
                    e.preventDefault();
                    const pasted = (e.clipboardData || window.clipboardData).getData('text');
                    let value = input.value + pasted;
                    
                    if (type === 'number') {
                        value = value.replace(/[^0-9]/g, '');
                    }
                    if (type === 'textarea') {
                        value = value.replace(/ {3,}/g, ' ');
                        value = value.replace(/\n{3,}/g, '\n\n');
                    }
                    
                    value = value.substring(0, max);
                    input.value = value;
                    input.dispatchEvent(new Event('input'));
                };
                input._pasteHandler = pasteHandler;
                input.addEventListener('paste', pasteHandler);
            }
            
            if (!input._keypressHandler) {
                const keypressHandler = (e) => {
                    if (e.target.value.length >= max && e.key.length === 1) {
                        e.preventDefault();
                    }
                };
                input._keypressHandler = keypressHandler;
                input.addEventListener('keypress', keypressHandler);
            }
            
            handler({ target: input });
        });
    },
    
    resetFieldCounters() {
        const fields = [
            { inputId: 'jobName', counterId: 'jobNameCounter', max: 15 },
            { inputId: 'jobAge', counterId: 'jobAgeCounter', max: 2 },
            { inputId: 'jobTitle', counterId: 'jobTitleCounter', max: 15 },
            { inputId: 'jobBio', counterId: 'jobBioCounter', max: 400 },
            { inputId: 'marriageName', counterId: 'marriageNameCounter', max: 15 },
            { inputId: 'marriageAge', counterId: 'marriageAgeCounter', max: 2 },
            { inputId: 'marriageBio', counterId: 'marriageBioCounter', max: 400 }
        ];
        
        fields.forEach(({ inputId, counterId, max }) => {
            const input = document.getElementById(inputId);
            const counter = document.getElementById(counterId);
            if (!input || !counter) return;
            
            input.value = '';
            counter.textContent = `0/${max}`;
            counter.classList.remove('warning', 'full');
            input.classList.remove('limit-reached');
        });
    },
    
    // ==================== ✅ قائمة طريقة التواصل ====================
    renderContactMethodDropdown(type) {
        const isJob = type === 'job';
        const containerId = isJob ? 'jobContactSelector' : 'marriageContactSelector';
        const inputId = isJob ? 'jobContactMethod' : 'marriageContactMethod';
        
        const container = document.getElementById(containerId);
        const input = document.getElementById(inputId);
        if (!container || !input) return;
        
        const current = input.value || 'none';
        
        const options = [
            { value: 'none', label: 'لا شيء (طلب صداقة)', icon: 'fas fa-user-plus', color: '#64B5F6' },
            { value: 'whatsapp', label: 'رابط واتساب', icon: 'fab fa-whatsapp', color: '#25D366' },
            { value: 'phone', label: 'رقم الهاتف', icon: 'fas fa-phone', color: '#2196F3' },
            { value: 'email', label: 'البريد الإلكتروني', icon: 'fas fa-envelope', color: '#FF9800' }
        ];
        
        const currentOption = options.find(o => o.value === current) || options[0];
        
        container.innerHTML = `
            <button type="button" class="publish-category-btn" 
                    data-contact-type="${type}"
                    onclick="PostsSystem.toggleContactDropdown('${type}', event)">
                <span class="publish-category-icon" style="background: ${currentOption.color}20; color: ${currentOption.color};">
                    <i class="${currentOption.icon}"></i>
                </span>
                <span class="publish-category-name">${currentOption.label}</span>
                <i class="fas fa-chevron-down"></i>
            </button>
        `;
    },
    
    toggleContactDropdown(type, event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
        
        // ✅ إغلاق كل القوائم الأخرى
        this.closeAllPublishDropdowns();
        
        const dropdownId = type === 'job' ? 'jobContactDropdown' : 'marriageContactDropdown';
        const existing = document.getElementById(dropdownId);
        if (existing) { existing.remove(); return; }
        
        const btn = document.querySelector(`.publish-category-btn[data-contact-type="${type}"]`);
        if (!btn) return;
        
        const container = btn.parentElement;
        if (!container) return;
        
        container.style.position = 'relative';
        
        const options = [
            { value: 'none', label: 'لا شيء (طلب صداقة)', icon: 'fas fa-user-plus', color: '#64B5F6' },
            { value: 'whatsapp', label: 'رابط واتساب', icon: 'fab fa-whatsapp', color: '#25D366' },
            { value: 'phone', label: 'رقم الهاتف', icon: 'fas fa-phone', color: '#2196F3' },
            { value: 'email', label: 'البريد الإلكتروني', icon: 'fas fa-envelope', color: '#FF9800' }
        ];
        
        const inputId = type === 'job' ? 'jobContactMethod' : 'marriageContactMethod';
        const input = document.getElementById(inputId);
        const current = input ? input.value : 'none';
        
        const dropdown = document.createElement('div');
        dropdown.className = 'publish-category-dropdown';
        dropdown.id = dropdownId;
        dropdown.style.position = 'absolute';
        dropdown.style.top = 'calc(100% + 6px)';
        dropdown.style.left = '0';
        dropdown.style.right = '0';
        dropdown.style.width = '100%';
        dropdown.style.maxHeight = '280px';
        dropdown.style.overflowY = 'auto';
        dropdown.style.background = 'var(--card-bg)';
        dropdown.style.border = '1px solid var(--border)';
        dropdown.style.borderRadius = '10px';
        dropdown.style.boxShadow = '0 10px 30px rgba(0,0,0,0.7)';
        dropdown.style.zIndex = '9999';
        dropdown.style.padding = '6px';
        
        dropdown.innerHTML = options.map(opt => `
            <button type="button" class="publish-category-option ${opt.value === current ? 'active' : ''}" 
                    onclick="PostsSystem.selectContactMethod('${type}', '${opt.value}')">
                <span class="publish-category-icon" style="background: ${opt.color}20; color: ${opt.color};">
                    <i class="${opt.icon}"></i>
                </span>
                <span class="publish-category-name">${opt.label}</span>
                ${opt.value === current ? '<i class="fas fa-check"></i>' : ''}
            </button>
        `).join('');
        
        container.appendChild(dropdown);
        
        setTimeout(() => {
            const closeHandler = (e) => {
                const dd = document.getElementById(dropdownId);
                if (dd && !dd.contains(e.target) && !btn.contains(e.target)) {
                    dd.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }, 100);
    },
    
    selectContactMethod(type, value) {
        const inputId = type === 'job' ? 'jobContactMethod' : 'marriageContactMethod';
        const input = document.getElementById(inputId);
        if (input) input.value = value;
        
        this.closeAllPublishDropdowns();
        this.renderContactValueField(type, value);
        this.renderContactMethodDropdown(type);
    },
    
    // ==================== ✅ حقل الإدخال الديناميكي ====================
    renderContactValueField(type, method) {
        const isJob = type === 'job';
        const fieldId = isJob ? 'jobContactValueField' : 'marriageContactValueField';
        const labelId = isJob ? 'jobContactValueLabel' : 'marriageContactValueLabel';
        const inputId = isJob ? 'jobContactValue' : 'marriageContactValue';
        const counterId = isJob ? 'jobContactValueCounter' : 'marriageContactValueCounter';
        
        const field = document.getElementById(fieldId);
        const label = document.getElementById(labelId);
        const input = document.getElementById(inputId);
        const counter = document.getElementById(counterId);
        
        if (!field || !label || !input) return;
        
        if (method === 'none' || !method) {
            field.style.display = 'none';
            input.value = '';
            if (counter) counter.textContent = '0/200';
            return;
        }
        
        field.style.display = 'flex';
        
        const config = {
            whatsapp: { label: 'رابط واتساب', placeholder: 'https://wa.me/9647701234567', max: 200 },
            phone: { label: 'رقم الهاتف', placeholder: '07701234567', max: 15 },
            email: { label: 'البريد الإلكتروني', placeholder: 'example@gmail.com', max: 100 }
        };
        
        const cfg = config[method];
        if (!cfg) return;
        
        label.textContent = cfg.label;
        input.placeholder = cfg.placeholder;
        input.setAttribute('maxlength', cfg.max);
        input.value = '';
        if (counter) counter.textContent = `0/${cfg.max}`;
        
        if (input._contactCounterHandler) {
            input.removeEventListener('input', input._contactCounterHandler);
        }
        
        const handler = (e) => {
            let value = e.target.value;
            if (value.length > cfg.max) {
                value = value.substring(0, cfg.max);
                e.target.value = value;
            }
            if (counter) counter.textContent = `${value.length}/${cfg.max}`;
        };
        
        input._contactCounterHandler = handler;
        input.addEventListener('input', handler);
    },
    
    // ==================== ✅ التحقق من قيمة التواصل ====================
    validateContactValue(method, value) {
        if (!method || method === 'none') return { valid: true };
        
        const v = (value || '').trim();
        if (!v) return { valid: false, error: 'يرجى إدخال قيمة طريقة التواصل' };
        
        if (method === 'whatsapp') {
            if (!/^https?:\/\//i.test(v)) {
                return { valid: false, error: 'رابط واتساب يجب أن يبدأ بـ http:// أو https://' };
            }
            if (!/wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|whatsapp/i.test(v)) {
                return { valid: false, error: 'رابط واتساب غير صحيح. مثال: https://wa.me/9647701234567' };
            }
            return { valid: true };
        }
        
        if (method === 'phone') {
            const digits = v.replace(/[^0-9]/g, '');
            if (digits.length < 7 || digits.length > 15) {
                return { valid: false, error: 'رقم الهاتف يجب أن يحتوي على 7-15 رقم' };
            }
            return { valid: true };
        }
        
        if (method === 'email') {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
                return { valid: false, error: 'البريد الإلكتروني غير صحيح' };
            }
            return { valid: true };
        }
        
        return { valid: true };
    },
    
    // ==================== تحميل حالات العلاقات ====================
    async loadRelationshipCache(force = false) {
        const uid = window.auth?.currentUser?.uid;
        if (!uid) return;
        
        const now = Date.now();
        if (!force && (now - this._relationshipCache.lastUpdate) < 300000) return;
        
        try {
            const [userDoc, sentSnap, receivedSnap] = await Promise.all([
                window.db.collection('users').doc(uid).get(),
                window.db.collection('friendRequests').where('from', '==', uid).where('status', '==', 'pending').get(),
                window.db.collection('friendRequests').where('to', '==', uid).where('status', '==', 'pending').get()
            ]);
            
            if (userDoc.exists) {
                this._relationshipCache.friends = new Set(userDoc.data().friends || []);
            }
            
            this._relationshipCache.sentRequests = new Set();
            sentSnap.forEach(doc => {
                const data = doc.data();
                if (data.to) this._relationshipCache.sentRequests.add(data.to);
            });
            
            this._relationshipCache.receivedRequests = new Map();
            receivedSnap.forEach(doc => {
                const data = doc.data();
                if (data.from) this._relationshipCache.receivedRequests.set(data.from, doc.id);
            });
            
            this._relationshipCache.lastUpdate = now;
        } catch (e) {
            console.warn('⚠️ خطأ في حالات العلاقات:', e);
        }
    },
    
    getRelationshipState(targetUserId) {
        const uid = window.auth?.currentUser?.uid;
        if (!uid) return 'guest';
        if (uid === targetUserId) return 'self';
        if (this._relationshipCache.friends.has(targetUserId)) return 'friend';
        if (this._relationshipCache.sentRequests.has(targetUserId)) return 'sent';
        if (this._relationshipCache.receivedRequests.has(targetUserId)) return 'received';
        return 'none';
    },
    
    // ==================== إنشاء زر الإجراء ====================
    createPostActionButton(post) {
        const uid = window.auth?.currentUser?.uid;
        const isOwner = uid === post.userId;
        
        if (isOwner) {
            const btn = document.createElement('button');
            btn.style.display = 'none';
            return btn;
        }
        
        const btn = document.createElement('button');
        btn.className = 'post-action-btn';
        btn.setAttribute('data-user-id', post.userId);
        
        if (!uid) {
            btn.innerHTML = `<i class="fas fa-lock"></i>`;
            btn.style.cssText = `background: transparent; color: var(--text-light); border: 1.5px solid var(--border); cursor: not-allowed; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; padding: 0; flex-shrink: 0;`;
            btn.title = 'سجل الدخول';
            btn.disabled = true;
            return btn;
        }
        
        const contactMethod = post.contactMethod && post.contactMethod !== 'none' ? post.contactMethod : null;
        
        if (contactMethod === 'whatsapp') {
            btn.innerHTML = `<i class="fab fa-whatsapp"></i>`;
            btn.classList.add('contact-whatsapp');
            btn.style.cssText = `background: #25D366; color: white; border: none; cursor: pointer; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1rem; padding: 0; flex-shrink: 0;`;
            btn.title = 'تواصل عبر واتساب';
            return btn;
        }
        
        if (contactMethod === 'phone') {
            btn.innerHTML = `<i class="fas fa-phone"></i>`;
            btn.classList.add('contact-phone');
            btn.style.cssText = `background: #2196F3; color: white; border: none; cursor: pointer; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; padding: 0; flex-shrink: 0;`;
            btn.title = 'اتصال هاتفي';
            return btn;
        }
        
        if (contactMethod === 'email') {
            btn.innerHTML = `<i class="fas fa-envelope"></i>`;
            btn.classList.add('contact-email');
            btn.style.cssText = `background: #FF9800; color: white; border: none; cursor: pointer; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; padding: 0; flex-shrink: 0;`;
            btn.title = 'إرسال بريد';
            return btn;
        }
        
        const state = this.getRelationshipState(post.userId);
        
        switch(state) {
            case 'friend':
                btn.innerHTML = `<i class="fas fa-comment"></i>`;
                btn.style.cssText = `background: var(--primary); color: white; border: none; cursor: pointer; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; padding: 0; flex-shrink: 0;`;
                btn.title = 'مراسلة';
                break;
            case 'sent':
                btn.innerHTML = `<i class="fas fa-clock"></i>`;
                btn.style.cssText = `background: transparent; color: var(--primary); border: 1.5px solid var(--primary); cursor: not-allowed; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; padding: 0; flex-shrink: 0;`;
                btn.title = 'طلب معلق';
                btn.disabled = true;
                break;
            case 'received':
                btn.innerHTML = `<i class="fas fa-check"></i>`;
                btn.style.cssText = `background: #4CAF50; color: white; border: none; cursor: pointer; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; padding: 0; flex-shrink: 0;`;
                btn.title = 'قبول الطلب';
                break;
            case 'none':
            default:
                btn.innerHTML = `<i class="fas fa-plus"></i>`;
                btn.style.cssText = `background: var(--primary); color: white; border: none; cursor: pointer; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; padding: 0; flex-shrink: 0;`;
                btn.title = 'إرسال طلب صداقة';
                break;
        }
        return btn;
    },
    
    bindActionButton(card, post) {
        if (!post.userId) return;
        const isOwner = window.auth?.currentUser?.uid === post.userId;
        if (isOwner) return;
        
        const newBtn = card.querySelector('.post-action-btn');
        if (!newBtn) return;
        
        const uid = window.auth?.currentUser?.uid;
        if (!uid) return;
        
        const contactMethod = post.contactMethod && post.contactMethod !== 'none' ? post.contactMethod : null;
        
        if (contactMethod === 'whatsapp' && post.contactValue) {
            newBtn.onclick = () => {
                let url = post.contactValue.trim();
                if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
                window.open(url, '_blank', 'noopener,noreferrer');
            };
            return;
        }
        
        if (contactMethod === 'phone' && post.contactValue) {
            newBtn.onclick = () => { window.location.href = `tel:${post.contactValue.trim()}`; };
            return;
        }
        
        if (contactMethod === 'email' && post.contactValue) {
            newBtn.onclick = () => { window.location.href = `mailto:${post.contactValue.trim()}`; };
            return;
        }
        
        const state = this.getRelationshipState(post.userId);
        
        if (state === 'friend') {
            newBtn.onclick = () => {
                if (typeof openChat === 'function') {
                    window.db.collection('users').doc(post.userId).get().then(doc => {
                        if (doc.exists) {
                            const f = doc.data();
                            openChat(post.userId, f.name, window.getEmojiForUser ? window.getEmojiForUser(f) : '🧔🏻‍♂️');
                        }
                    });
                }
            };
        } else if (state === 'received') {
            newBtn.onclick = async () => {
                const requestId = this._relationshipCache.receivedRequests.get(post.userId);
                if (requestId && typeof acceptFriendRequest === 'function') {
                    await acceptFriendRequest(requestId, post.userId);
                    this.refreshPostsAfterAction(post.userId);
                }
            };
        } else if (state === 'none') {
            newBtn.onclick = () => this.sendFriendRequestFromPost(post.userId, newBtn);
        }
    },
    
    async sendFriendRequestFromPost(targetUserId, btnElement) {
        const uid = window.auth?.currentUser?.uid;
        if (!uid) { alert('يجب تسجيل الدخول أولاً'); return; }
        if (uid === targetUserId) { alert('لا يمكنك إضافة نفسك'); return; }
        
        try {
            const exist = await window.db.collection('friendRequests')
                .where('from', '==', uid).where('to', '==', targetUserId).where('status', '==', 'pending').get();
            
            if (!exist.empty) { alert('أرسلت طلباً مسبقاً'); return; }
            
            const me = await window.db.collection('users').doc(uid).get();
            if (me.exists && (me.data().friends || []).includes(targetUserId)) {
                alert('صديقك بالفعل'); return;
            }
            
            await window.db.collection('friendRequests').add({
                from: uid, to: targetUserId, status: 'pending',
                timestamp: new Date(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            });
            
            this._relationshipCache.sentRequests.add(targetUserId);
            this._relationshipCache.lastUpdate = Date.now();
            
            if (btnElement) {
                btnElement.innerHTML = `<i class="fas fa-clock"></i>`;
                btnElement.style.cssText = `background: transparent; color: var(--primary); border: 1.5px solid var(--primary); cursor: not-allowed; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; padding: 0; flex-shrink: 0;`;
                btnElement.title = 'طلب معلق';
                btnElement.disabled = true;
                btnElement.onclick = null;
            }
            
            alert('✅ تم إرسال طلب الصداقة');
        } catch (e) {
            console.error('خطأ في إرسال طلب الصداقة:', e);
            alert('حدث خطأ في إرسال الطلب');
        }
    },
    
    refreshPostsAfterAction(targetUserId) {
        this._relationshipCache.lastUpdate = 0;
        this.loadAllPosts();
    },
    
    // ==================== منتقي البلد ====================
    renderCountryHeaderSelector() {
        const container = document.getElementById('countryHeaderSelector');
        if (!container) return;
        this.updateCountrySelectorVisibility();
        
        const currentFlag = window.Countries.getFlag(this.selectedCountry);
        const currentName = this.showAllCountries ? 'الكل' : window.Countries.getName(this.selectedCountry);
        
        container.innerHTML = `
            <div class="country-header-inline">
                <button class="country-header-btn" onclick="PostsSystem.toggleHeaderCountryDropdown(event)">
                    <span class="country-header-flag">${this.showAllCountries ? '🌍' : currentFlag}</span>
                    <span class="country-header-name">${currentName}</span>
                    <i class="fas fa-chevron-down country-header-arrow"></i>
                </button>
            </div>
        `;
    },
    
    updateCountrySelectorVisibility() {
        const container = document.getElementById('countryHeaderSelector');
        if (!container) return;
        const homePage = document.querySelector('.page.home-page');
        const isHomeActive = homePage && homePage.classList.contains('active');
        container.style.display = isHomeActive ? 'block' : 'none';
    },
    
    closeCountryDropdown() {
        const dd = document.getElementById('countryHeaderDropdown');
        if (dd) dd.remove();
        const arrow = document.querySelector('.country-header-arrow');
        if (arrow) arrow.style.transform = 'rotate(0deg)';
        if (this._countryCloseHandler) {
            document.removeEventListener('pointerdown', this._countryCloseHandler);
            document.removeEventListener('click', this._countryCloseHandler);
            this._countryCloseHandler = null;
        }
    },
    
    toggleHeaderCountryDropdown(event) {
        if (event) { event.stopPropagation(); event.preventDefault(); }
        const existing = document.getElementById('countryHeaderDropdown');
        if (existing) { this.closeCountryDropdown(); return; }
        
        const wrapper = document.querySelector('.country-header-inline');
        if (!wrapper) return;
        const btn = wrapper.querySelector('.country-header-btn');
        if (!btn) return;
        
        const rect = btn.getBoundingClientRect();
        const dropdown = document.createElement('div');
        dropdown.className = 'country-header-dropdown';
        dropdown.id = 'countryHeaderDropdown';
        dropdown.style.position = 'fixed';
        dropdown.style.top = (rect.bottom + 8) + 'px';
        dropdown.style.right = '10px';
        dropdown.style.zIndex = '99999';
        dropdown.style.minWidth = '200px';
        dropdown.style.maxWidth = '240px';
        dropdown.style.maxHeight = '50vh';
        dropdown.style.overflowY = 'auto';
        dropdown.style.background = 'var(--card-bg)';
        dropdown.style.border = '1px solid var(--border)';
        dropdown.style.borderRadius = '12px';
        dropdown.style.boxShadow = '0 10px 30px rgba(0,0,0,0.7)';
        dropdown.style.padding = '6px';
        
        dropdown.innerHTML = `
            <button class="country-mini-option ${this.showAllCountries ? 'active' : ''}" onclick="PostsSystem.selectAllCountries()">
                <span class="country-mini-flag">🌍</span>
                <span class="country-mini-name">جميع الدول</span>
                ${this.showAllCountries ? '<i class="fas fa-check"></i>' : ''}
            </button>
            <div class="country-mini-divider"></div>
            ${window.Countries.list.map(c => `
                <button class="country-mini-option ${c.code === this.selectedCountry && !this.showAllCountries ? 'active' : ''}" 
                        onclick="PostsSystem.selectCountry('${c.code}')">
                    <span class="country-mini-flag">${c.flag}</span>
                    <span class="country-mini-name">${c.name}</span>
                    ${c.code === this.selectedCountry && !this.showAllCountries ? '<i class="fas fa-check"></i>' : ''}
                </button>
            `).join('')}
        `;
        
        document.body.appendChild(dropdown);
        const arrow = btn.querySelector('.country-header-arrow');
        if (arrow) arrow.style.transform = 'rotate(180deg)';
        
        const self = this;
        this._countryCloseHandler = (e) => {
            const dd = document.getElementById('countryHeaderDropdown');
            if (!dd) { self.closeCountryDropdown(); return; }
            if (dd.contains(e.target)) return;
            if (btn.contains(e.target)) return;
            self.closeCountryDropdown();
        };
        
        setTimeout(() => {
            document.addEventListener('pointerdown', this._countryCloseHandler);
            document.addEventListener('click', this._countryCloseHandler);
        }, 0);
    },
    
    selectCountry(code) {
        this.selectedCountry = code;
        this.showAllCountries = false;
        this.saveSettings();
        this.closeCountryDropdown();
        
        const btn = document.querySelector('.country-header-btn');
        if (btn) {
            const flagSpan = btn.querySelector('.country-header-flag');
            const nameSpan = btn.querySelector('.country-header-name');
            if (flagSpan) flagSpan.textContent = window.Countries.getFlag(code);
            if (nameSpan) nameSpan.textContent = window.Countries.getName(code);
        }
        this.loadAllPosts();
    },
    
    selectAllCountries() {
        this.showAllCountries = true;
        this.saveSettings();
        this.closeCountryDropdown();
        
        const btn = document.querySelector('.country-header-btn');
        if (btn) {
            const flagSpan = btn.querySelector('.country-header-flag');
            const nameSpan = btn.querySelector('.country-header-name');
            if (flagSpan) flagSpan.textContent = '🌍';
            if (nameSpan) nameSpan.textContent = 'الكل';
        }
        this.loadAllPosts();
    },
    
    renderJobCategories() {
        const container = document.getElementById('jobCategories');
        if (!container) return;
        container.innerHTML = this.jobCategories.map(cat => `
            <button class="category-tab ${cat.code === this.selectedCategory ? 'active' : ''}" 
                    onclick="PostsSystem.selectCategory('${cat.code}')"
                    style="--cat-color: ${cat.color};">
                <span class="category-icon-wrapper" style="background: ${cat.color}20; color: ${cat.color};">
                    <i class="${cat.icon}"></i>
                </span>
                <span class="category-name">${cat.name}</span>
            </button>
        `).join('');
    },
    
    selectCategory(code) {
        this.selectedCategory = code;
        this.saveSettings();
        this.renderJobCategories();
        this.loadJobsPosts();
    },
    
    getCategoryName(code) {
        const cat = this.jobCategories.find(c => c.code === code);
        return cat ? cat.name : code;
    },
    
    getCategoryIcon(code) {
        const cat = this.jobCategories.find(c => c.code === code);
        return cat ? cat.icon : 'fas fa-th-large';
    },
    
    getCategoryColor(code) {
        const cat = this.jobCategories.find(c => c.code === code);
        return cat ? cat.color : '#64B5F6';
    },
    
    renderPublishCategoryDropdown() {
        const container = document.getElementById('jobCategorySelector');
        const input = document.getElementById('jobCategory');
        if (!container || !input) return;
        
        const selectedCode = input.value || 'it';
        const selectedCat = this.jobCategories.find(c => c.code === selectedCode && c.code !== 'all');
        
        container.innerHTML = `
            <button type="button" class="publish-category-btn" data-publish-category="job" onclick="PostsSystem.togglePublishCategoryDropdown(event)">
                <span class="publish-category-icon" style="background: ${selectedCat ? selectedCat.color + '20' : '#64B5F620'}; color: ${selectedCat ? selectedCat.color : '#64B5F6'};">
                    <i class="${selectedCat ? selectedCat.icon : 'fas fa-th-large'}"></i>
                </span>
                <span class="publish-category-name">${selectedCat ? selectedCat.name : 'اختر القسم'}</span>
                <i class="fas fa-chevron-down"></i>
            </button>
        `;
    },
    
    togglePublishCategoryDropdown(event) {
        if (event) { event.stopPropagation(); event.preventDefault(); }
        
        this.closeAllPublishDropdowns();
        
        const dropdownId = 'jobCategoryDropdown';
        const existing = document.getElementById(dropdownId);
        if (existing) { existing.remove(); return; }
        
        const btn = document.querySelector('.publish-category-btn[data-publish-category="job"]');
        if (!btn) return;
        const container = btn.parentElement;
        if (!container) return;
        
        container.style.position = 'relative';
        
        const input = document.getElementById('jobCategory');
        const selectedCode = input ? input.value : 'it';
        
        const dropdown = document.createElement('div');
        dropdown.className = 'publish-category-dropdown';
        dropdown.id = dropdownId;
        dropdown.style.position = 'absolute';
        dropdown.style.top = 'calc(100% + 6px)';
        dropdown.style.left = '0';
        dropdown.style.right = '0';
        dropdown.style.width = '100%';
        dropdown.style.maxHeight = '280px';
        dropdown.style.overflowY = 'auto';
        dropdown.style.background = 'var(--card-bg)';
        dropdown.style.border = '1px solid var(--border)';
        dropdown.style.borderRadius = '10px';
        dropdown.style.boxShadow = '0 10px 30px rgba(0,0,0,0.7)';
        dropdown.style.zIndex = '9999';
        dropdown.style.padding = '6px';
        
        dropdown.innerHTML = this.jobCategories.filter(c => c.code !== 'all').map(cat => `
            <button type="button" class="publish-category-option ${cat.code === selectedCode ? 'active' : ''}" 
                    onclick="PostsSystem.selectPublishCategory('${cat.code}')">
                <span class="publish-category-icon" style="background: ${cat.color}20; color: ${cat.color};">
                    <i class="${cat.icon}"></i>
                </span>
                <span class="publish-category-name">${cat.name}</span>
                ${cat.code === selectedCode ? '<i class="fas fa-check"></i>' : ''}
            </button>
        `).join('');
        
        container.appendChild(dropdown);
        
        setTimeout(() => {
            const closeHandler = (e) => {
                const dd = document.getElementById(dropdownId);
                if (dd && !dd.contains(e.target) && !btn.contains(e.target)) {
                    dd.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }, 100);
    },
    
    selectPublishCategory(code) {
        const input = document.getElementById('jobCategory');
        if (input) input.value = code;
        this.closeAllPublishDropdowns();
        this.renderPublishCategoryDropdown();
    },
    
    renderPublishCountryDropdown(publishType) {
        const prefix = publishType === 'jobs' ? 'job' : 'marriage';
        const containerId = `${prefix}CountrySelector`;
        const inputId = `${prefix}CountryCode`;
        const container = document.getElementById(containerId);
        const input = document.getElementById(inputId);
        if (!container || !input) return;
        
        const selectedCode = input.value || this.selectedCountry;
        const selectedCountry = window.Countries.getCountry(selectedCode);
        
        container.innerHTML = `
            <button type="button" class="publish-country-btn" data-publish-country="${publishType}" onclick="PostsSystem.togglePublishCountryDropdown('${publishType}', event)">
                <span class="publish-country-flag">${selectedCountry ? selectedCountry.flag : '🌍'}</span>
                <span class="publish-country-name">${selectedCountry ? selectedCountry.name : 'اختر البلد'}</span>
                <i class="fas fa-chevron-down"></i>
            </button>
        `;
    },
    
    togglePublishCountryDropdown(publishType, event) {
        if (event) { event.stopPropagation(); event.preventDefault(); }
        
        this.closeAllPublishDropdowns();
        
        const prefix = publishType === 'jobs' ? 'job' : 'marriage';
        const dropdownId = `${prefix}CountryDropdown`;
        const existing = document.getElementById(dropdownId);
        if (existing) { existing.remove(); return; }
        
        const btn = document.querySelector(`.publish-country-btn[data-publish-country="${publishType}"]`);
        if (!btn) return;
        const container = btn.parentElement;
        if (!container) return;
        
        container.style.position = 'relative';
        
        const input = document.getElementById(`${prefix}CountryCode`);
        const selectedCode = input ? input.value : this.selectedCountry;
        
        const dropdown = document.createElement('div');
        dropdown.className = 'publish-country-dropdown';
        dropdown.id = dropdownId;
        dropdown.style.position = 'absolute';
        dropdown.style.top = 'calc(100% + 6px)';
        dropdown.style.left = '0';
        dropdown.style.right = '0';
        dropdown.style.width = '100%';
        dropdown.style.maxHeight = '280px';
        dropdown.style.overflowY = 'auto';
        dropdown.style.background = 'var(--card-bg)';
        dropdown.style.border = '1px solid var(--border)';
        dropdown.style.borderRadius = '10px';
        dropdown.style.boxShadow = '0 10px 30px rgba(0,0,0,0.7)';
        dropdown.style.zIndex = '9999';
        dropdown.style.padding = '6px';
        
        dropdown.innerHTML = window.Countries.list.map(c => `
            <button type="button" class="publish-country-option ${c.code === selectedCode ? 'active' : ''}" 
                    onclick="PostsSystem.selectPublishCountry('${publishType}', '${c.code}')">
                <span class="publish-country-flag">${c.flag}</span>
                <span class="publish-country-name">${c.name}</span>
                ${c.code === selectedCode ? '<i class="fas fa-check"></i>' : ''}
            </button>
        `).join('');
        
        container.appendChild(dropdown);
        
        setTimeout(() => {
            const closeHandler = (e) => {
                const dd = document.getElementById(dropdownId);
                if (dd && !dd.contains(e.target) && !btn.contains(e.target)) {
                    dd.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }, 100);
    },
    
    selectPublishCountry(publishType, code) {
        const prefix = publishType === 'jobs' ? 'job' : 'marriage';
        const input = document.getElementById(`${prefix}CountryCode`);
        if (input) input.value = code;
        this.closeAllPublishDropdowns();
        this.renderPublishCountryDropdown(publishType);
    },
    
    renderMarriageDropdown(field, selectedValue) {
        const options = field === 'married'
            ? [
                { value: 'no', label: 'لا، أعزب/عزباء' },
                { value: 'yes', label: 'نعم، متزوج/متزوجة' },
                { value: 'divorced', label: 'مطلق/مطلقة' },
                { value: 'widowed', label: 'أرمل/أرملة' }
              ]
            : [
                { value: 'no', label: 'لا' },
                { value: 'yes', label: 'نعم' }
              ];
        
        const containerId = field === 'married' ? 'marriageMarriedSelector' : 'marriageChildrenSelector';
        const inputId = field === 'married' ? 'marriageMarried' : 'marriageChildren';
        const container = document.getElementById(containerId);
        const input = document.getElementById(inputId);
        if (!container || !input) return;
        
        const current = selectedValue !== undefined ? selectedValue : (input.value || 'no');
        const currentOption = options.find(o => o.value === current);
        
        container.innerHTML = `
            <button type="button" class="publish-category-btn" 
                    data-field="${field}"
                    onclick="PostsSystem.toggleMarriageDropdown('${field}', event)">
                <span class="publish-category-name">${currentOption ? currentOption.label : 'اختر'}</span>
                <i class="fas fa-chevron-down"></i>
            </button>
        `;
    },
    
    toggleMarriageDropdown(field, event) {
        if (event) { event.stopPropagation(); event.preventDefault(); }
        
        this.closeAllPublishDropdowns();
        
        const dropdownId = field === 'married' ? 'marriageMarriedDropdown' : 'marriageChildrenDropdown';
        const existing = document.getElementById(dropdownId);
        if (existing) { existing.remove(); return; }
        
        const btn = document.querySelector(`.publish-category-btn[data-field="${field}"]`);
        if (!btn) return;
        const container = btn.parentElement;
        if (!container) return;
        
        container.style.position = 'relative';
        
        const options = field === 'married'
            ? [
                { value: 'no', label: 'لا، أعزب/عزباء' },
                { value: 'yes', label: 'نعم، متزوج/متزوجة' },
                { value: 'divorced', label: 'مطلق/مطلقة' },
                { value: 'widowed', label: 'أرمل/أرملة' }
              ]
            : [
                { value: 'no', label: 'لا' },
                { value: 'yes', label: 'نعم' }
              ];
        
        const inputId = field === 'married' ? 'marriageMarried' : 'marriageChildren';
        const input = document.getElementById(inputId);
        const current = input ? input.value : 'no';
        
        const dropdown = document.createElement('div');
        dropdown.className = 'publish-category-dropdown';
        dropdown.id = dropdownId;
        dropdown.style.position = 'absolute';
        dropdown.style.top = 'calc(100% + 6px)';
        dropdown.style.left = '0';
        dropdown.style.right = '0';
        dropdown.style.width = '100%';
        dropdown.style.maxHeight = '280px';
        dropdown.style.overflowY = 'auto';
        dropdown.style.background = 'var(--card-bg)';
        dropdown.style.border = '1px solid var(--border)';
        dropdown.style.borderRadius = '10px';
        dropdown.style.boxShadow = '0 10px 30px rgba(0,0,0,0.7)';
        dropdown.style.zIndex = '9999';
        dropdown.style.padding = '6px';
        
        dropdown.innerHTML = options.map(opt => `
            <button type="button" class="publish-category-option ${opt.value === current ? 'active
