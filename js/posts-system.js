// ========== posts-system.js - النسخة النهائية مع العدادات ==========

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
    
    // ==================== إعداد عدادات الحقول ====================
    setupFieldCounters() {
        const fields = [
            { inputId: 'jobName', counterId: 'jobNameCounter', max: 15, type: 'text' },
            { inputId: 'jobAge', counterId: 'jobAgeCounter', max: 2, type: 'number', min: 18 },
            { inputId: 'jobTitle', counterId: 'jobTitleCounter', max: 15, type: 'text' },
            { inputId: 'jobBio', counterId: 'jobBioCounter', max: 400, type: 'textarea' },
            { inputId: 'marriageName', counterId: 'marriageNameCounter', max: 15, type: 'text' },
            { inputId: 'marriageAge', counterId: 'marriageAgeCounter', max: 2, type: 'number', min: 18 },
            { inputId: 'marriageBio', counterId: 'marriageBioCounter', max: 400, type: 'textarea' }
        ];
        
        fields.forEach(({ inputId, counterId, max, type, min }) => {
            const input = document.getElementById(inputId);
            const counter = document.getElementById(counterId);
            if (!input || !counter) return;
            
            // ✅ إزالة المستمعين القدامى
            if (input._counterHandler) {
                input.removeEventListener('input', input._counterHandler);
            }
            if (input._pasteHandler) {
                input.removeEventListener('paste', input._pasteHandler);
            }
            if (input._keypressHandler) {
                input.removeEventListener('keypress', input._keypressHandler);
            }
            
            input.setAttribute('maxlength', max);
            
            // ✅ معالج الإدخال
            const handler = (e) => {
                let value = e.target.value;
                
                // ✅ للعمر: أرقام فقط
                if (type === 'number') {
                    value = value.replace(/[^0-9]/g, '');
                }
                
                // ✅ للسيرة الذاتية: تنظيف المسافات المتعددة
                if (type === 'textarea') {
                    value = value.replace(/\n{3,}/g, '\n\n');
                    value = value.replace(/[ \t]{3,}/g, '  ');
                }
                
                if (value.length > max) {
                    value = value.substring(0, max);
                }
                
                if (e.target.value !== value) {
                    e.target.value = value;
                }
                
                // ✅ تحديث العداد
                const len = value.length;
                counter.textContent = `${len}/${max}`;
                counter.classList.remove('warning', 'full');
                input.classList.remove('limit-reached');
                
                if (len >= max) {
                    counter.classList.add('full');
                    input.classList.add('limit-reached');
                } else if (len >= max - 5) {
                    counter.classList.add('warning');
                }
            };
            
            input._counterHandler = handler;
            input.addEventListener('input', handler);
            
            // ✅ منع اللصق الذي يتجاوز الحد
            const pasteHandler = (e) => {
                e.preventDefault();
                const pasted = (e.clipboardData || window.clipboardData).getData('text');
                let value = input.value + pasted;
                
                if (type === 'number') {
                    value = value.replace(/[^0-9]/g, '');
                }
                if (type === 'textarea') {
                    value = value.replace(/\n{3,}/g, '\n\n');
                    value = value.replace(/[ \t]{3,}/g, '  ');
                }
                value = value.substring(0, max);
                input.value = value;
                input.dispatchEvent(new Event('input'));
            };
            input._pasteHandler = pasteHandler;
            input.addEventListener('paste', pasteHandler);
            
            // ✅ منع الكتابة عند الحد
            const keypressHandler = (e) => {
                if (e.target.value.length >= max && e.key.length === 1) {
                    e.preventDefault();
                }
            };
            input._keypressHandler = keypressHandler;
            input.addEventListener('keypress', keypressHandler);
            
            // ✅ تهيئة العداد
            handler({ target: input });
        });
    },
    
    // ✅ إعادة تهيئة العدادات
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
    
    // ==================== تحميل حالات العلاقات ====================
    async loadRelationshipCache(force = false) {
        const uid = window.auth?.currentUser?.uid;
        if (!uid) return;
        
        const now = Date.now();
        if (!force && (now - this._relationshipCache.lastUpdate) < 300000) {
            return;
        }
        
        try {
            const [userDoc, sentSnap, receivedSnap] = await Promise.all([
                window.db.collection('users').doc(uid).get(),
                window.db.collection('friendRequests')
                    .where('from', '==', uid)
                    .where('status', '==', 'pending')
                    .get(),
                window.db.collection('friendRequests')
                    .where('to', '==', uid)
                    .where('status', '==', 'pending')
                    .get()
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
            console.log(`📊 حالة العلاقات: ${this._relationshipCache.friends.size} صديق، ${this._relationshipCache.sentRequests.size} مرسل، ${this._relationshipCache.receivedRequests.size} مستلم`);
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
        const state = this.getRelationshipState(post.userId);
        const btn = document.createElement('button');
        btn.className = 'post-action-btn';
        btn.setAttribute('data-user-id', post.userId);
        
        switch(state) {
            case 'self':
                btn.style.display = 'none';
                return btn;
            case 'guest':
                btn.innerHTML = `<i class="fas fa-lock"></i>`;
                btn.style.cssText = `background: transparent; color: var(--text-light); border: 1.5px solid var(--border); cursor: not-allowed; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; padding: 0; flex-shrink: 0;`;
                btn.title = 'سجل الدخول';
                btn.disabled = true;
                break;
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
                .where('from', '==', uid)
                .where('to', '==', targetUserId)
                .where('status', '==', 'pending')
                .get();
            
            if (!exist.empty) { alert('أرسلت طلباً مسبقاً'); return; }
            
            const me = await window.db.collection('users').doc(uid).get();
            if (me.exists && (me.data().friends || []).includes(targetUserId)) {
                alert('صديقك بالفعل');
                return;
            }
            
            await window.db.collection('friendRequests').add({
                from: uid,
                to: targetUserId,
                status: 'pending',
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
            <button type="button" class="publish-category-btn" onclick="PostsSystem.togglePublishCategoryDropdown(event)">
                <span class="publish-category-icon" style="background: ${selectedCat ? selectedCat.color + '20' : '#64B5F620'}; color: ${selectedCat ? selectedCat.color : '#64B5F6'};">
                    <i class="${selectedCat ? selectedCat.icon : 'fas fa-th-large'}"></i>
                </span>
                <span class="publish-category-name">${selectedCat ? selectedCat.name : 'اختر القسم'}</span>
                <i class="fas fa-chevron-down"></i>
            </button>
            <div class="publish-category-dropdown" id="jobCategoryDropdown" style="display: none;">
                ${this.jobCategories.filter(c => c.code !== 'all').map(cat => `
                    <button type="button" class="publish-category-option ${cat.code === selectedCode ? 'active' : ''}" 
                            onclick="PostsSystem.selectPublishCategory('${cat.code}')">
                        <span class="publish-category-icon" style="background: ${cat.color}20; color: ${cat.color};">
                            <i class="${cat.icon}"></i>
                        </span>
                        <span class="publish-category-name">${cat.name}</span>
                        ${cat.code === selectedCode ? '<i class="fas fa-check"></i>' : ''}
                    </button>
                `).join('')}
            </div>
        `;
    },
    
    togglePublishCategoryDropdown(event) {
        if (event) event.stopPropagation();
        const dropdown = document.getElementById('jobCategoryDropdown');
        if (!dropdown) return;
        document.querySelectorAll('.publish-category-dropdown, .publish-country-dropdown').forEach(d => {
            if (d.id !== 'jobCategoryDropdown') d.style.display = 'none';
        });
        if (dropdown.style.display === 'none' || !dropdown.style.display) {
            dropdown.style.display = 'block';
            setTimeout(() => {
                const closeHandler = (e) => {
                    const container = document.getElementById('jobCategorySelector');
                    if (container && !container.contains(e.target)) {
                        dropdown.style.display = 'none';
                        document.removeEventListener('click', closeHandler);
                    }
                };
                document.addEventListener('click', closeHandler);
            }, 100);
        } else {
            dropdown.style.display = 'none';
        }
    },
    
    selectPublishCategory(code) {
        const input = document.getElementById('jobCategory');
        if (input) input.value = code;
        const dropdown = document.getElementById('jobCategoryDropdown');
        if (dropdown) dropdown.style.display = 'none';
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
            <button type="button" class="publish-country-btn" onclick="PostsSystem.togglePublishCountryDropdown('${publishType}', event)">
                <span class="publish-country-flag">${selectedCountry ? selectedCountry.flag : '🌍'}</span>
                <span class="publish-country-name">${selectedCountry ? selectedCountry.name : 'اختر البلد'}</span>
                <i class="fas fa-chevron-down"></i>
            </button>
            <div class="publish-country-dropdown" id="${prefix}CountryDropdown" style="display: none;">
                ${window.Countries.list.map(c => `
                    <button type="button" class="publish-country-option ${c.code === selectedCode ? 'active' : ''}" 
                            onclick="PostsSystem.selectPublishCountry('${publishType}', '${c.code}')">
                        <span class="publish-country-flag">${c.flag}</span>
                        <span class="publish-country-name">${c.name}</span>
                        ${c.code === selectedCode ? '<i class="fas fa-check"></i>' : ''}
                    </button>
                `).join('')}
            </div>
        `;
    },
    
    togglePublishCountryDropdown(publishType, event) {
        if (event) event.stopPropagation();
        const prefix = publishType === 'jobs' ? 'job' : 'marriage';
        const dropdownId = `${prefix}CountryDropdown`;
        const dropdown = document.getElementById(dropdownId);
        if (!dropdown) return;
        document.querySelectorAll('.publish-country-dropdown, .publish-category-dropdown').forEach(d => {
            if (d.id !== dropdownId) d.style.display = 'none';
        });
        if (dropdown.style.display === 'none' || !dropdown.style.display) {
            dropdown.style.display = 'block';
            setTimeout(() => {
                const closeHandler = (e) => {
                    const container = document.getElementById(`${prefix}CountrySelector`);
                    if (container && !container.contains(e.target)) {
                        dropdown.style.display = 'none';
                        document.removeEventListener('click', closeHandler);
                    }
                };
                document.addEventListener('click', closeHandler);
            }, 100);
        } else {
            dropdown.style.display = 'none';
        }
    },
    
    selectPublishCountry(publishType, code) {
        const prefix = publishType === 'jobs' ? 'job' : 'marriage';
        const input = document.getElementById(`${prefix}CountryCode`);
        if (input) input.value = code;
        const dropdown = document.getElementById(`${prefix}CountryDropdown`);
        if (dropdown) dropdown.style.display = 'none';
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
        const dropdownId = field === 'married' ? 'marriageMarriedDropdown' : 'marriageChildrenDropdown';
        const existing = document.getElementById(dropdownId);
        if (existing) existing.remove();
        
        const btn = document.querySelector(`.publish-category-btn[data-field="${field}"]`);
        if (!btn) return;
        const rect = btn.getBoundingClientRect();
        
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
        dropdown.style.position = 'fixed';
        dropdown.style.top = (rect.bottom + 6) + 'px';
        dropdown.style.left = rect.left + 'px';
        dropdown.style.width = rect.width + 'px';
        dropdown.style.maxHeight = '280px';
        dropdown.style.overflowY = 'auto';
        dropdown.style.background = 'var(--card-bg)';
        dropdown.style.border = '1px solid var(--border)';
        dropdown.style.borderRadius = '10px';
        dropdown.style.boxShadow = '0 10px 30px rgba(0,0,0,0.7)';
        dropdown.style.zIndex = '99999';
        dropdown.style.padding = '6px';
        
        dropdown.innerHTML = options.map(opt => `
            <button type="button" class="publish-category-option ${opt.value === current ? 'active' : ''}" 
                    onclick="PostsSystem.selectMarriageOption('${field}', '${opt.value}')">
                <span class="publish-category-name">${opt.label}</span>
                ${opt.value === current ? '<i class="fas fa-check"></i>' : ''}
            </button>
        `).join('');
        
        document.body.appendChild(dropdown);
        
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
    
    selectMarriageOption(field, value) {
        const inputId = field === 'married' ? 'marriageMarried' : 'marriageChildren';
        const input = document.getElementById(inputId);
        if (input) input.value = value;
        const dropdownId = field === 'married' ? 'marriageMarriedDropdown' : 'marriageChildrenDropdown';
        const dropdown = document.getElementById(dropdownId);
        if (dropdown) dropdown.remove();
        
        if (field === 'married') {
            const childrenField = document.getElementById('marriageChildrenField');
            if (childrenField) {
                if (value === 'no') {
                    childrenField.style.display = 'none';
                    const childrenInput = document.getElementById('marriageChildren');
                    if (childrenInput) childrenInput.value = 'no';
                    this.renderMarriageDropdown('children', 'no');
                } else {
                    childrenField.style.display = 'block';
                    this.renderMarriageDropdown('children', 'no');
                }
            }
        }
        this.renderMarriageDropdown(field, value);
    },
    
    switchTab(tab) {
        this.currentTab = tab;
        this.closeCountryDropdown();
        document.querySelectorAll('.home-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });
        document.querySelectorAll('.home-content').forEach(c => c.classList.remove('active'));
        
        if (tab === 'jobs') {
            const jobsContent = document.getElementById('jobsContent');
            if (jobsContent) jobsContent.classList.add('active');
            this.loadJobsPosts();
        } else {
            const marriageContent = document.getElementById('marriageContent');
            if (marriageContent) marriageContent.classList.add('active');
            this.loadMarriagePosts();
        }
    },
    
    async loadAllPosts() {
        await Promise.all([
            this.loadJobsPosts(),
            this.loadMarriagePosts()
        ]);
        
        this.loadRelationshipCache().then(() => {
            this.refreshActionButtons();
        }).catch(() => {});
    },
    
    refreshActionButtons() {
        document.querySelectorAll('.post-card').forEach(card => {
            const oldBtn = card.querySelector('.post-action-btn');
            if (!oldBtn) return;
            
            const userId = oldBtn.getAttribute('data-user-id');
            if (!userId) return;
            
            const post = { userId };
            const newBtn = this.createPostActionButton(post);
            
            if (newBtn.style.display === 'none') {
                oldBtn.style.display = 'none';
                return;
            }
            
            oldBtn.innerHTML = newBtn.innerHTML;
            oldBtn.style.cssText = newBtn.style.cssText;
            oldBtn.title = newBtn.title;
            oldBtn.disabled = newBtn.disabled;
            
            this.bindActionButton(card, post);
        });
    },
    
    async loadJobsPosts() {
        const container = document.getElementById('jobsPostsContainer');
        const emptyState = document.getElementById('jobsEmptyState');
        if (!container) return;
        
        try {
            let query = window.db.collection('posts').where('type', '==', 'job');
            if (!this.showAllCountries && this.selectedCountry) {
                query = query.where('countryCode', '==', this.selectedCountry);
            }
            if (this.selectedCategory && this.selectedCategory !== 'all') {
                query = query.where('category', '==', this.selectedCategory);
            }
            
            const snapshot = await query.limit(50).get();
            container.innerHTML = '';
            
            if (snapshot.empty) {
                if (emptyState) emptyState.style.display = 'flex';
                return;
            }
            if (emptyState) emptyState.style.display = 'none';
            
            const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            posts.sort((a, b) => {
                const timeA = a.timestamp?.toDate?.()?.getTime() || 0;
                const timeB = b.timestamp?.toDate?.()?.getTime() || 0;
                return timeB - timeA;
            });
            
            const fragment = document.createDocumentFragment();
            for (const post of posts) {
                const el = this.createJobPost(post);
                if (el) fragment.appendChild(el);
            }
            container.appendChild(fragment);
        } catch (e) {
            console.error('❌ خطأ في تحميل الوظائف:', e);
            if (emptyState) emptyState.style.display = 'flex';
        }
    },
    
    async loadMarriagePosts() {
        const container = document.getElementById('marriagePostsContainer');
        const emptyState = document.getElementById('marriageEmptyState');
        if (!container) return;
        
        try {
            let query = window.db.collection('posts').where('type', '==', 'marriage');
            if (!this.showAllCountries && this.selectedCountry) {
                query = query.where('countryCode', '==', this.selectedCountry);
            }
            
            const snapshot = await query.limit(50).get();
            container.innerHTML = '';
            
            if (snapshot.empty) {
                if (emptyState) emptyState.style.display = 'flex';
                return;
            }
            if (emptyState) emptyState.style.display = 'none';
            
            const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            posts.sort((a, b) => {
                const timeA = a.timestamp?.toDate?.()?.getTime() || 0;
                const timeB = b.timestamp?.toDate?.()?.getTime() || 0;
                return timeB - timeA;
            });
            
            const fragment = document.createDocumentFragment();
            for (const post of posts) {
                const el = this.createMarriagePost(post);
                if (el) fragment.appendChild(el);
            }
            container.appendChild(fragment);
        } catch (e) {
            console.error('❌ خطأ في تحميل الزواج:', e);
            if (emptyState) emptyState.style.display = 'flex';
        }
    },
    
    createJobPost(post) {
        const card = document.createElement('div');
        card.className = 'post-card job-post-card';
        
        const isOwner = window.auth?.currentUser?.uid === post.userId;
        const flag = window.Countries.getFlag(post.countryCode);
        const catIcon = this.getCategoryIcon(post.category);
        const catName = this.getCategoryName(post.category);
        const catColor = this.getCategoryColor(post.category);
        
        const avatarContent = post.image 
            ? `<img src="${post.image}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" loading="lazy">` 
            : '👤';
        
        const deleteBtn = isOwner 
            ? `<button class="post-menu" onclick="PostsSystem.deletePost('${post.id}')" title="حذف"><i class="fas fa-trash"></i></button>` 
            : '';
        
        let actionBtnHTML = '';
        if (post.userId && !isOwner) {
            const actionBtn = this.createPostActionButton(post);
            if (actionBtn.style.display !== 'none') actionBtnHTML = actionBtn.outerHTML;
        }
        
        card.innerHTML = `
            <div class="post-header">
                <div class="post-avatar-emoji" ${post.image ? `onclick="PostsSystem.openImagePreview('${post.id}')"` : ''}>
                    ${avatarContent}
                </div>
                <div class="post-user">
                    <h4>${this.escapeHtml(post.name || 'مستخدم')}</h4>
                </div>
                <div class="post-header-actions">
                    ${actionBtnHTML}
                    ${deleteBtn}
                </div>
            </div>
            <div class="post-content">
                <div class="post-job-title" style="color: ${catColor}; background: ${catColor}15;">
                    <i class="${catIcon}" style="color: ${catColor};"></i>
                    <strong>${this.escapeHtml(post.jobTitle || '')}</strong>
                </div>
                <div class="post-info-row">
                    <span><i class="fas fa-user"></i> ${post.age || '?'} سنة</span>
                    <span><span style="font-size:1.1rem;">${flag}</span> ${this.escapeHtml(post.country || '')}</span>
                    <span style="color: ${catColor};"><i class="${catIcon}" style="color: ${catColor};"></i> ${catName}</span>
                </div>
                <div class="post-bio">${this.escapeHtml(post.bio || '')}</div>
            </div>
        `;
        
        this.bindActionButton(card, post);
        
        if (post.image) {
            card.setAttribute('data-post-image', post.image);
            card.setAttribute('data-post-id', post.id);
        }
        return card;
    },
    
    createMarriagePost(post) {
        const card = document.createElement('div');
        card.className = 'post-card marriage-post-card';
        
        const isOwner = window.auth?.currentUser?.uid === post.userId;
        const flag = window.Countries.getFlag(post.countryCode);
        
        const marriedText = {
            'no': 'أعزب/عزباء', 'yes': 'متزوج/متزوجة',
            'divorced': 'مطلق/مطلقة', 'widowed': 'أرمل/أرملة'
        };
        const childrenText = post.children === 'yes' ? 'نعم' : 'لا';
        
        const avatarContent = post.image 
            ? `<img src="${post.image}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" loading="lazy">` 
            : '👤';
        
        const deleteBtn = isOwner 
            ? `<button class="post-menu" onclick="PostsSystem.deletePost('${post.id}')" title="حذف"><i class="fas fa-trash"></i></button>` 
            : '';
        
        let actionBtnHTML = '';
        if (post.userId && !isOwner) {
            const actionBtn = this.createPostActionButton(post);
            if (actionBtn.style.display !== 'none') actionBtnHTML = actionBtn.outerHTML;
        }
        
        let childrenSpan = '';
        if (post.married !== 'no') {
            childrenSpan = `<span><i class="fas fa-child"></i> أطفال: ${childrenText}</span>`;
        }
        
        card.innerHTML = `
            <div class="post-header">
                <div class="post-avatar-emoji" ${post.image ? `onclick="PostsSystem.openImagePreview('${post.id}')"` : ''}>
                    ${avatarContent}
                </div>
                <div class="post-user">
                    <h4>${this.escapeHtml(post.name || 'مستخدم')}</h4>
                </div>
                <div class="post-header-actions">
                    ${actionBtnHTML}
                    ${deleteBtn}
                </div>
            </div>
            <div class="post-content">
                <div class="post-info-row">
                    <span><i class="fas fa-user"></i> ${post.age || '?'} سنة</span>
                    <span><span style="font-size:1.1rem;">${flag}</span> ${this.escapeHtml(post.country || '')}</span>
                    <span><i class="fas fa-heart"></i> ${marriedText[post.married] || post.married || ''}</span>
                    ${childrenSpan}
                </div>
                <div class="post-bio">${this.escapeHtml(post.bio || '')}</div>
            </div>
        `;
        
        this.bindActionButton(card, post);
        
        if (post.image) {
            card.setAttribute('data-post-image', post.image);
            card.setAttribute('data-post-id', post.id);
        }
        return card;
    },
    
    openImagePreview(postId) {
        const card = document.querySelector(`[data-post-id="${postId}"]`);
        if (!card) return;
        const imageSrc = card.getAttribute('data-post-image');
        if (!imageSrc) return;
        
        const modal = document.getElementById('postImagePreviewModal');
        const img = document.getElementById('postPreviewImage');
        if (!modal || !img) return;
        
        img.src = imageSrc;
        modal.style.display = 'flex';
        this.setupPostImageZoom(modal, img);
    },
    
    setupPostImageZoom(modal, img) {
        if (img._zoomCleanup) { img._zoomCleanup(); img._zoomCleanup = null; }
        let currentScale = 1, initialDistance = 0, initialScale = 1;
        let startX = 0, startY = 0, translateX = 0, translateY = 0, isTouching = false;
        const minScale = 1, maxScale = 4;
        
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
                if (newScale !== currentScale) { currentScale = newScale; updateTransform(); }
            } else if (touches.length === 1 && isTouching && currentScale > 1) {
                translateX = touches[0].clientX - startX;
                translateY = touches[0].clientY - startY;
                const maxX = (currentScale - 1) * 200;
                const maxY = (currentScale - 1) * 200;
                translateX = Math.min(maxX, Math.max(-maxX, translateX));
                translateY = Math.min(maxY, Math.max(-maxY, translateY));
                updateTransform();
            }
        };
        
        const touchEndHandler = (e) => {
            e.preventDefault();
            initialDistance = 0;
            isTouching = false;
            if (currentScale < 1) {
                currentScale = 1; translateX = 0; translateY = 0;
                updateTransform();
            }
        };
        
        let lastTap = 0;
        const doubleTapHandler = (e) => {
            const now = Date.now();
            if (now - lastTap < 300) {
                e.preventDefault();
                if (currentScale > 1.5) {
                    currentScale = 1; translateX = 0; translateY = 0;
                } else { currentScale = 2; }
                updateTransform();
            }
            lastTap = now;
        };
        
        img.addEventListener('touchstart', touchStartHandler, { passive: false });
        img.addEventListener('touchmove', touchMoveHandler, { passive: false });
        img.addEventListener('touchend', touchEndHandler);
        img.addEventListener('click', doubleTapHandler);
        
        img._zoomCleanup = () => {
            img.removeEventListener('touchstart', touchStartHandler);
            img.removeEventListener('touchmove', touchMoveHandler);
            img.removeEventListener('touchend', touchEndHandler);
            img.removeEventListener('click', doubleTapHandler);
        };
    },
    
    async deletePost(postId) {
        if (!confirm('هل أنت متأكد من حذف هذا المنشور؟')) return;
        try {
            await window.db.collection('posts').doc(postId).delete();
            this.loadAllPosts();
        } catch (e) {
            alert('حدث خطأ في الحذف');
        }
    },
    
    setupRealtimeListeners() {
        this._jobsUnsubscribe = window.db.collection('posts')
            .where('type', '==', 'job')
            .onSnapshot(snapshot => {
                if (snapshot.docChanges().length > 0) {
                    console.log('🔄 تحديث الوظائف...');
                    this.loadJobsPosts();
                }
            }, error => console.warn('⚠️', error.message));
        
        this._marriageUnsubscribe = window.db.collection('posts')
            .where('type', '==', 'marriage')
            .onSnapshot(snapshot => {
                if (snapshot.docChanges().length > 0) {
                    console.log('🔄 تحديث الزواج...');
                    this.loadMarriagePosts();
                }
            }, error => console.warn('⚠️', error.message));
    },
    
    async compressImage(file) {
        return new Promise((resolve, reject) => {
            if (!file.type.startsWith('image/')) { reject(new Error('الملف ليس صورة')); return; }
            if (file.size > 10 * 1024 * 1024) { reject(new Error('الصورة كبيرة جداً (الحد 10MB)')); return; }
            
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const side = Math.min(img.width, img.height);
                    const sx = (img.width - side) / 2;
                    const sy = (img.height - side) / 2;
                    const TARGET = this.IMAGE_TARGET_SIZE;
                    const canvas = document.createElement('canvas');
                    canvas.width = TARGET;
                    canvas.height = TARGET;
                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, sx, sy, side, side, 0, 0, TARGET, TARGET);
                    
                    canvas.toBlob((blob) => {
                        if (!blob) { reject(new Error('فشل ضغط الصورة')); return; }
                        const reader2 = new FileReader();
                        reader2.onload = () => {
                            const compressedKB = Math.round(reader2.result.length / 1024);
                            const originalKB = Math.round(file.size / 1024);
                            console.log(`📸 قص مربع + ضغط: ${originalKB} KB → ${compressedKB} KB`);
                            resolve(reader2.result);
                        };
                        reader2.readAsDataURL(blob);
                    }, 'image/jpeg', this.IMAGE_QUALITY);
                };
                img.onerror = () => reject(new Error('فشل تحميل الصورة'));
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },
    
    async previewJobImage(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        const preview = document.getElementById('jobImagePreview');
        if (!preview) return;
        preview.innerHTML = '<div style="color:#888;font-size:0.7rem;text-align:center;line-height:1.2;">جاري<br>المعالجة...</div>';
        try {
            const compressed = await this.compressImage(file);
            preview.innerHTML = `<img src="${compressed}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } catch (err) {
            alert('فشل معالجة الصورة: ' + err.message);
            preview.innerHTML = '👤';
            event.target.value = '';
        }
    },
    
    async previewMarriageImage(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        const preview = document.getElementById('marriageImagePreview');
        if (!preview) return;
        preview.innerHTML = '<div style="color:#888;font-size:0.7rem;text-align:center;line-height:1.2;">جاري<br>المعالجة...</div>';
        try {
            const compressed = await this.compressImage(file);
            preview.innerHTML = `<img src="${compressed}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } catch (err) {
            alert('فشل معالجة الصورة: ' + err.message);
            preview.innerHTML = '👤';
            event.target.value = '';
        }
    },
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// ==================== دوال الواجهة العامة ====================

window.switchHomeTab = (tab) => PostsSystem.switchTab(tab);

window.openPublishModal = function(type) {
    if (type === 'jobs') {
        const modal = document.getElementById('publishJobModal');
        if (modal) modal.classList.add('active');
        PostsSystem.fillPublishJobForm();
    } else if (type === 'marriage') {
        const modal = document.getElementById('publishMarriageModal');
        if (modal) modal.classList.add('active');
        PostsSystem.fillPublishMarriageForm();
    }
};

PostsSystem.fillPublishJobForm = function() {
    const countryInput = document.getElementById('jobCountryCode');
    if (countryInput) countryInput.value = this.selectedCountry;
    this.renderPublishCountryDropdown('jobs');
    this.renderPublishCategoryDropdown();
    this.setupFieldCounters();
    const preview = document.getElementById('jobImagePreview');
    if (preview) preview.innerHTML = '👤';
    const input = document.getElementById('jobImage');
    if (input) input.value = '';
};

PostsSystem.fillPublishMarriageForm = function() {
    const countryInput = document.getElementById('marriageCountryCode');
    if (countryInput) countryInput.value = this.selectedCountry;
    this.renderPublishCountryDropdown('marriage');
    
    const marriedInput = document.getElementById('marriageMarried');
    const childrenInput = document.getElementById('marriageChildren');
    if (marriedInput) marriedInput.value = 'no';
    if (childrenInput) childrenInput.value = 'no';
    
    this.renderMarriageDropdown('married', 'no');
    this.renderMarriageDropdown('children', 'no');
    
    const childrenField = document.getElementById('marriageChildrenField');
    if (childrenField) childrenField.style.display = 'none';
    
    this.setupFieldCounters();
    
    const preview = document.getElementById('marriageImagePreview');
    if (preview) preview.innerHTML = '👤';
    const input = document.getElementById('marriageImage');
    if (input) input.value = '';
};

window.closePostImagePreview = function() {
    const modal = document.getElementById('postImagePreviewModal');
    const img = document.getElementById('postPreviewImage');
    if (modal) modal.style.display = 'none';
    if (img) {
        img.src = '';
        img.style.transform = 'none';
        if (img._zoomCleanup) { img._zoomCleanup(); img._zoomCleanup = null; }
    }
};

window.publishJob = async function() {
    if (!window.auth?.currentUser) { alert('يجب تسجيل الدخول'); return; }
    
    const name = document.getElementById('jobName')?.value?.trim();
    const age = document.getElementById('jobAge')?.value;
    const countryCode = document.getElementById('jobCountryCode')?.value;
    const category = document.getElementById('jobCategory')?.value;
    const jobTitle = document.getElementById('jobTitle')?.value?.trim();
    const bio = document.getElementById('jobBio')?.value?.trim();
    const imageInput = document.getElementById('jobImage');
    
    if (!name) { alert('الاسم مطلوب'); return; }
    if (name.length > 15) { alert('الاسم لا يزيد عن 15 حرف'); return; }
    if (!age) { alert('العمر مطلوب'); return; }
    if (!countryCode) { alert('البلد مطلوب'); return; }
    if (!category) { alert('القسم مطلوب'); return; }
    if (!jobTitle) { alert('عنوان الوظيفة مطلوب'); return; }
    if (jobTitle.length > 15) { alert('عنوان الوظيفة لا يزيد عن 15 حرف'); return; }
    if (!bio) { alert('السيرة الذاتية مطلوبة'); return; }
    if (bio.length > 400) { alert('السيرة الذاتية لا تزيد عن 400 حرف'); return; }
    
    const ageNum = parseInt(age);
    if (isNaN(ageNum)) { alert('العمر غير صالح'); return; }
    if (ageNum < 18) { alert('❌ العمر يجب أن يكون 18 سنة على الأقل'); return; }
    if (ageNum > 99) { alert('❌ العمر غير صالح (الحد الأقصى 99)'); return; }
    
    try {
        let imageBase64 = null;
        if (imageInput && imageInput.files[0]) {
            try { imageBase64 = await PostsSystem.compressImage(imageInput.files[0]); }
            catch (err) { alert('فشل معالجة الصورة: ' + err.message); return; }
        }
        
        await window.db.collection('posts').add({
            type: 'job', userId: window.auth.currentUser.uid,
            name, age: ageNum,
            country: window.Countries.getName(countryCode),
            countryCode, category, jobTitle, bio,
            image: imageBase64,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        window.closeModal('publishJobModal');
        clearJobForm();
        alert('✅ تم نشر الوظيفة بنجاح');
        if (typeof switchPage === 'function') switchPage('home');
        PostsSystem.selectCountry(countryCode);
        setTimeout(() => PostsSystem.switchTab('jobs'), 100);
    } catch (e) { alert('حدث خطأ: ' + e.message); }
};

window.publishMarriage = async function() {
    if (!window.auth?.currentUser) { alert('يجب تسجيل الدخول'); return; }
    
    const name = document.getElementById('marriageName')?.value?.trim();
    const age = document.getElementById('marriageAge')?.value;
    const countryCode = document.getElementById('marriageCountryCode')?.value;
    const bio = document.getElementById('marriageBio')?.value?.trim();
    const married = document.getElementById('marriageMarried')?.value;
    const children = document.getElementById('marriageChildren')?.value;
    const imageInput = document.getElementById('marriageImage');
    
    if (!name) { alert('الاسم مطلوب'); return; }
    if (name.length > 15) { alert('الاسم لا يزيد عن 15 حرف'); return; }
    if (!age) { alert('العمر مطلوب'); return; }
    if (!countryCode) { alert('البلد مطلوب'); return; }
    if (!bio) { alert('السيرة الذاتية مطلوبة'); return; }
    if (bio.length > 400) { alert('السيرة الذاتية لا تزيد عن 400 حرف'); return; }
    
    const ageNum = parseInt(age);
    if (isNaN(ageNum)) { alert('العمر غير صالح'); return; }
    if (ageNum < 18) { alert('❌ العمر يجب أن يكون 18 سنة على الأقل'); return; }
    if (ageNum > 99) { alert('❌ العمر غير صالح (الحد الأقصى 99)'); return; }
    
    try {
        let imageBase64 = null;
        if (imageInput && imageInput.files[0]) {
            try { imageBase64 = await PostsSystem.compressImage(imageInput.files[0]); }
            catch (err) { alert('فشل معالجة الصورة: ' + err.message); return; }
        }
        
        await window.db.collection('posts').add({
            type: 'marriage', userId: window.auth.currentUser.uid,
            name, age: ageNum,
            country: window.Countries.getName(countryCode),
            countryCode, bio, married,
            children: (married === 'no') ? 'no' : children,
            image: imageBase64,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        window.closeModal('publishMarriageModal');
        clearMarriageForm();
        alert('✅ تم نشر إعلان الزواج بنجاح');
        if (typeof switchPage === 'function') switchPage('home');
        PostsSystem.selectCountry(countryCode);
        setTimeout(() => PostsSystem.switchTab('marriage'), 100);
    } catch (e) { alert('حدث خطأ: ' + e.message); }
};

function clearJobForm() {
    if (window.PostsSystem && PostsSystem.resetFieldCounters) {
        PostsSystem.resetFieldCounters();
    }
    ['jobName', 'jobAge', 'jobTitle', 'jobBio'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const preview = document.getElementById('jobImagePreview');
    if (preview) preview.innerHTML = '👤';
    const input = document.getElementById('jobImage');
    if (input) input.value = '';
}

function clearMarriageForm() {
    if (window.PostsSystem && PostsSystem.resetFieldCounters) {
        PostsSystem.resetFieldCounters();
    }
    ['marriageName', 'marriageAge', 'marriageBio'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const preview = document.getElementById('marriageImagePreview');
    if (preview) preview.innerHTML = '👤';
    const input = document.getElementById('marriageImage');
    if (input) input.value = '';
}

window.PostsSystem = PostsSystem;
window.previewJobImage = (e) => PostsSystem.previewJobImage(e);
window.previewMarriageImage = (e) => PostsSystem.previewMarriageImage(e);

window.addEventListener('authReady', () => {
    setTimeout(() => PostsSystem.init(), 100);
});

window.addEventListener('friendsUpdated', () => {
    PostsSystem._relationshipCache.lastUpdate = 0;
    PostsSystem.loadAllPosts();
});

console.log('✅ posts-system.js تم تحميله - مع العدادات المحسّنة');
