// ========== posts-system.js - النسخة النهائية ==========

const PostsSystem = {
    currentTab: 'jobs',
    selectedCountry: 'IQ',
    selectedCategory: 'all',
    showAllCountries: false,
    _countryDropdownOpen: false,
    _publishCountryDropdowns: {},
    
    IMAGE_MAX_WIDTH: 600,
    IMAGE_QUALITY: 0.65,
    
    // ✅ أقسام الوظائف بألوان
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
        console.log('🚀 تهيئة نظام المنشورات...');
        this.loadSavedSettings();
        this.loadAllPosts();
        this.setupRealtimeListeners();
        this.renderCountrySelector();
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
    
    // ==================== ✅ منتقي البلد المصغّر ====================
    renderCountrySelector() {
        const container = document.getElementById('countrySelector');
        if (!container) return;
        
        const currentFlag = window.Countries.getFlag(this.selectedCountry);
        const currentName = this.showAllCountries ? 'الكل' : window.Countries.getName(this.selectedCountry);
        
        container.innerHTML = `
            <button class="country-mini-btn" onclick="PostsSystem.toggleCountryDropdown(event)">
                <span class="country-mini-flag">${this.showAllCountries ? '🌍' : currentFlag}</span>
                <span class="country-mini-name">${currentName}</span>
                <i class="fas fa-chevron-down country-mini-arrow"></i>
            </button>
            <div class="country-mini-dropdown" id="countryDropdown" style="display: none;">
                <button class="country-mini-option ${this.showAllCountries ? 'active' : ''}" 
                        onclick="PostsSystem.selectAllCountries()">
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
            </div>
        `;
    },
    
    toggleCountryDropdown(event) {
        if (event) event.stopPropagation();
        
        const dropdown = document.getElementById('countryDropdown');
        const arrow = document.querySelector('.country-mini-arrow');
        if (!dropdown) return;
        
        if (dropdown.style.display === 'none' || !dropdown.style.display) {
            dropdown.style.display = 'block';
            this._countryDropdownOpen = true;
            if (arrow) arrow.style.transform = 'rotate(180deg)';
            
            setTimeout(() => {
                const closeHandler = (e) => {
                    const container = document.getElementById('countrySelector');
                    if (container && !container.contains(e.target)) {
                        dropdown.style.display = 'none';
                        this._countryDropdownOpen = false;
                        if (arrow) arrow.style.transform = 'rotate(0deg)';
                        document.removeEventListener('click', closeHandler);
                    }
                };
                document.addEventListener('click', closeHandler);
            }, 100);
        } else {
            dropdown.style.display = 'none';
            this._countryDropdownOpen = false;
            if (arrow) arrow.style.transform = 'rotate(0deg)';
        }
    },
    
    selectCountry(code) {
        this.selectedCountry = code;
        this.showAllCountries = false;
        this.saveSettings();
        this.renderCountrySelector();
        this.loadAllPosts();
        
        const dropdown = document.getElementById('countryDropdown');
        if (dropdown) dropdown.style.display = 'none';
        const arrow = document.querySelector('.country-mini-arrow');
        if (arrow) arrow.style.transform = 'rotate(0deg)';
        
        console.log(`🌍 تم اختيار: ${window.Countries.getName(code)}`);
    },
    
    selectAllCountries() {
        this.showAllCountries = true;
        this.saveSettings();
        this.renderCountrySelector();
        this.loadAllPosts();
        
        const dropdown = document.getElementById('countryDropdown');
        if (dropdown) dropdown.style.display = 'none';
        
        console.log('🌍 عرض جميع الدول');
    },
    
    // ==================== ✅ أقسام الوظائف المُحسّنة ====================
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
        console.log(`💼 تم اختيار قسم: ${this.getCategoryName(code)}`);
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
    
    // ==================== التبديل بين التبويبات ====================
    switchTab(tab) {
        this.currentTab = tab;
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
        await this.loadJobsPosts();
        await this.loadMarriagePosts();
    },
    
    // ==================== تحميل الوظائف ====================
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
            
            for (const post of posts) {
                const postEl = this.createJobPost(post);
                if (postEl) container.appendChild(postEl);
            }
            
            console.log(`✅ تم تحميل ${posts.length} وظيفة`);
        } catch (e) {
            console.error('❌ خطأ في تحميل الوظائف:', e);
            if (emptyState) emptyState.style.display = 'flex';
        }
    },
    
    // ==================== تحميل الزواج ====================
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
            
            for (const post of posts) {
                const postEl = this.createMarriagePost(post);
                if (postEl) container.appendChild(postEl);
            }
            
            console.log(`✅ تم تحميل ${posts.length} إعلان زواج`);
        } catch (e) {
            console.error('❌ خطأ في تحميل إعلانات الزواج:', e);
            if (emptyState) emptyState.style.display = 'flex';
        }
    },
    
    // ==================== إنشاء بطاقة وظيفة ====================
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
        
        card.innerHTML = `
            <div class="post-header">
                <div class="post-avatar-emoji" ${post.image ? `onclick="PostsSystem.openImagePreview('${post.id}')"` : ''}>
                    ${avatarContent}
                </div>
                <div class="post-user">
                    <h4>${this.escapeHtml(post.name || 'مستخدم')}</h4>
                </div>
                ${deleteBtn}
            </div>
            <div class="post-content">
                <div class="post-job-title" style="color: ${catColor}; background: ${catColor}15; border-right: 3px solid ${catColor};">
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
        
        if (post.image) {
            card.setAttribute('data-post-image', post.image);
            card.setAttribute('data-post-id', post.id);
        }
        
        return card;
    },
    
    // ==================== إنشاء بطاقة زواج ====================
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
        
        card.innerHTML = `
            <div class="post-header">
                <div class="post-avatar-emoji" ${post.image ? `onclick="PostsSystem.openImagePreview('${post.id}')"` : ''}>
                    ${avatarContent}
                </div>
                <div class="post-user">
                    <h4>${this.escapeHtml(post.name || 'مستخدم')}</h4>
                </div>
                ${deleteBtn}
            </div>
            <div class="post-content">
                <div class="post-info-row">
                    <span><i class="fas fa-user"></i> ${post.age || '?'} سنة</span>
                    <span><span style="font-size:1.1rem;">${flag}</span> ${this.escapeHtml(post.country || '')}</span>
                </div>
                <div class="post-info-row">
                    <span><i class="fas fa-heart"></i> ${marriedText[post.married] || post.married || ''}</span>
                    <span><i class="fas fa-child"></i> أطفال: ${childrenText}</span>
                </div>
                <div class="post-bio">${this.escapeHtml(post.bio || '')}</div>
            </div>
        `;
        
        if (post.image) {
            card.setAttribute('data-post-image', post.image);
            card.setAttribute('data-post-id', post.id);
        }
        
        return card;
    },
    
    // ==================== معاينة الصورة ====================
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
        
        const minScale = 1;
        const maxScale = 4;
        
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
            if (currentScale < 1) {
                currentScale = 1;
                translateX = 0;
                translateY = 0;
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
                } else {
                    currentScale = 2;
                }
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
    
    // ==================== حذف منشور ====================
    async deletePost(postId) {
        if (!confirm('هل أنت متأكد من حذف هذا المنشور؟')) return;
        try {
            await window.db.collection('posts').doc(postId).delete();
            console.log(`✅ تم حذف المنشور ${postId}`);
            this.loadAllPosts();
        } catch (e) {
            console.error('❌ خطأ في الحذف:', e);
            alert('حدث خطأ في الحذف');
        }
    },
    
    // ==================== مستمعي الوقت الحقيقي ====================
    setupRealtimeListeners() {
        window.db.collection('posts').where('type', '==', 'job')
            .onSnapshot(snapshot => {
                console.log(`📊 تحديث الوظائف: ${snapshot.size}`);
                this.loadJobsPosts();
            }, error => console.warn('⚠️ خطأ:', error.message));
        
        window.db.collection('posts').where('type', '==', 'marriage')
            .onSnapshot(snapshot => {
                console.log(`📊 تحديث الزواج: ${snapshot.size}`);
                this.loadMarriagePosts();
            }, error => console.warn('⚠️ خطأ:', error.message));
    },
    
    // ==================== ضغط الصورة ====================
    async compressImage(file) {
        return new Promise((resolve, reject) => {
            if (!file.type.startsWith('image/')) {
                reject(new Error('الملف ليس صورة'));
                return;
            }
            if (file.size > 10 * 1024 * 1024) {
                reject(new Error('الصورة كبيرة جداً (الحد الأقصى 10 MB)'));
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    
                    if (width > this.IMAGE_MAX_WIDTH) {
                        height = Math.round((height * this.IMAGE_MAX_WIDTH) / width);
                        width = this.IMAGE_MAX_WIDTH;
                    }
                    if (height > this.IMAGE_MAX_WIDTH) {
                        width = Math.round((width * this.IMAGE_MAX_WIDTH) / height);
                        height = this.IMAGE_MAX_WIDTH;
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    canvas.toBlob((blob) => {
                        if (!blob) { reject(new Error('فشل ضغط الصورة')); return; }
                        const reader2 = new FileReader();
                        reader2.onload = () => {
                            const compressedSize = Math.round(reader2.result.length / 1024);
                            const originalSize = Math.round(file.size / 1024);
                            const saving = Math.round((1 - compressedSize / originalSize) * 100);
                            console.log(`📸 ضغط الصورة: ${originalSize} KB → ${compressedSize} KB (${saving}% توفير)`);
                            resolve(reader2.result);
                        };
                        reader2.onerror = reject;
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
    
    // ==================== ✅ منتقي البلد الداخلي (للنشر) ====================
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
        
        // ✅ إغلاق أي قائمة مفتوحة
        document.querySelectorAll('.publish-country-dropdown').forEach(d => {
            if (d.id !== dropdownId) d.style.display = 'none';
        });
        
        if (dropdown.style.display === 'none' || !dropdown.style.display) {
            dropdown.style.display = 'block';
            this._publishCountryDropdowns[publishType] = true;
            
            setTimeout(() => {
                const closeHandler = (e) => {
                    const container = document.getElementById(`${prefix}CountrySelector`);
                    if (container && !container.contains(e.target)) {
                        dropdown.style.display = 'none';
                        this._publishCountryDropdowns[publishType] = false;
                        document.removeEventListener('click', closeHandler);
                    }
                };
                document.addEventListener('click', closeHandler);
            }, 100);
        } else {
            dropdown.style.display = 'none';
            this._publishCountryDropdowns[publishType] = false;
        }
    },
    
    selectPublishCountry(publishType, code) {
        const prefix = publishType === 'jobs' ? 'job' : 'marriage';
        const inputId = `${prefix}CountryCode`;
        const input = document.getElementById(inputId);
        if (input) input.value = code;
        
        const dropdown = document.getElementById(`${prefix}CountryDropdown`);
        if (dropdown) dropdown.style.display = 'none';
        
        this.renderPublishCountryDropdown(publishType);
    },
    
    // ==================== دوال مساعدة ====================
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// ==================== دوال الواجهة العامة ====================

window.switchHomeTab = function(tab) {
    PostsSystem.switchTab(tab);
};

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
    
    const categorySelect = document.getElementById('jobCategory');
    if (categorySelect) {
        categorySelect.innerHTML = this.jobCategories
            .filter(c => c.code !== 'all')
            .map(c => `<option value="${c.code}">${c.name}</option>`)
            .join('');
    }
};

PostsSystem.fillPublishMarriageForm = function() {
    const countryInput = document.getElementById('marriageCountryCode');
    if (countryInput) countryInput.value = this.selectedCountry;
    
    this.renderPublishCountryDropdown('marriage');
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
    if (!window.auth?.currentUser) { alert('يجب تسجيل الدخول أولاً'); return; }
    
    const name = document.getElementById('jobName')?.value?.trim();
    const age = document.getElementById('jobAge')?.value;
    const countryCode = document.getElementById('jobCountryCode')?.value;
    const category = document.getElementById('jobCategory')?.value;
    const jobTitle = document.getElementById('jobTitle')?.value?.trim();
    const bio = document.getElementById('jobBio')?.value?.trim();
    const imageInput = document.getElementById('jobImage');
    
    if (!name || !age || !countryCode || !category || !jobTitle || !bio) {
        alert('يرجى تعبئة جميع الحقول');
        return;
    }
    if (age < 15 || age > 80) { alert('العمر يجب أن يكون بين 15 و 80'); return; }
    
    try {
        let imageBase64 = null;
        if (imageInput && imageInput.files[0]) {
            try {
                imageBase64 = await PostsSystem.compressImage(imageInput.files[0]);
            } catch (err) {
                alert('فشل معالجة الصورة: ' + err.message);
                return;
            }
        }
        
        const countryName = window.Countries.getName(countryCode);
        console.log('📤 جاري نشر الوظيفة...');
        
        await window.db.collection('posts').add({
            type: 'job',
            userId: window.auth.currentUser.uid,
            name, age: parseInt(age),
            country: countryName, countryCode,
            category, jobTitle, bio,
            image: imageBase64,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        window.closeModal('publishJobModal');
        clearJobForm();
        alert('✅ تم نشر الوظيفة بنجاح');
        
        if (typeof switchPage === 'function') switchPage('home');
        PostsSystem.selectCountry(countryCode);
        setTimeout(() => PostsSystem.switchTab('jobs'), 100);
        
    } catch (e) {
        console.error('❌ خطأ في النشر:', e);
        alert('حدث خطأ: ' + e.message);
    }
};

window.publishMarriage = async function() {
    if (!window.auth?.currentUser) { alert('يجب تسجيل الدخول أولاً'); return; }
    
    const name = document.getElementById('marriageName')?.value?.trim();
    const age = document.getElementById('marriageAge')?.value;
    const countryCode = document.getElementById('marriageCountryCode')?.value;
    const bio = document.getElementById('marriageBio')?.value?.trim();
    const married = document.getElementById('marriageMarried')?.value;
    const children = document.getElementById('marriageChildren')?.value;
    const imageInput = document.getElementById('marriageImage');
    
    if (!name || !age || !countryCode || !bio) {
        alert('يرجى تعبئة جميع الحقول');
        return;
    }
    if (age < 15 || age > 80) { alert('العمر يجب أن يكون بين 15 و 80'); return; }
    
    try {
        let imageBase64 = null;
        if (imageInput && imageInput.files[0]) {
            try {
                imageBase64 = await PostsSystem.compressImage(imageInput.files[0]);
            } catch (err) {
                alert('فشل معالجة الصورة: ' + err.message);
                return;
            }
        }
        
        const countryName = window.Countries.getName(countryCode);
        console.log('📤 جاري نشر إعلان الزواج...');
        
        await window.db.collection('posts').add({
            type: 'marriage',
            userId: window.auth.currentUser.uid,
            name, age: parseInt(age),
            country: countryName, countryCode,
            bio, married, children,
            image: imageBase64,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        window.closeModal('publishMarriageModal');
        clearMarriageForm();
        alert('✅ تم نشر إعلان الزواج بنجاح');
        
        if (typeof switchPage === 'function') switchPage('home');
        PostsSystem.selectCountry(countryCode);
        setTimeout(() => PostsSystem.switchTab('marriage'), 100);
        
    } catch (e) {
        console.error('❌ خطأ في النشر:', e);
        alert('حدث خطأ: ' + e.message);
    }
};

function clearJobForm() {
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
    ['marriageName', 'marriageAge', 'marriageBio'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const preview = document.getElementById('marriageImagePreview');
    if (preview) preview.innerHTML = '👤';
    const input = document.getElementById('marriageImage');
    if (input) input.value = '';
}

window.addEventListener('load', () => {
    setTimeout(() => {
        if (window.auth?.currentUser) PostsSystem.init();
    }, 500);
});

window.addEventListener('authReady', () => {
    setTimeout(() => PostsSystem.init(), 300);
});

console.log('✅ posts-system.js تم تحميله');
