// ========== posts-system.js - النسخة النهائية ==========

const PostsSystem = {
    currentTab: 'jobs',
    selectedCountry: 'IQ',      // ✅ البلد المختار (افتراضي: العراق)
    selectedCategory: 'all',     // ✅ القسم المختار
    showAllCountries: false,     // ✅ عرض كل الدول
    
    // ✅ إعدادات ضغط الصور
    IMAGE_MAX_WIDTH: 600,
    IMAGE_QUALITY: 0.65,
    
    // ✅ أقسام الوظائف
    jobCategories: [
        { code: 'all', name: 'الكل', icon: '📋' },
        { code: 'it', name: 'تقنية المعلومات', icon: '💻' },
        { code: 'engineering', name: 'الهندسة', icon: '🏗️' },
        { code: 'education', name: 'التعليم', icon: '🎓' },
        { code: 'medical', name: 'الطب والصحة', icon: '🏥' },
        { code: 'design', name: 'التصميم', icon: '🎨' },
        { code: 'accounting', name: 'المحاسبة', icon: '📊' },
        { code: 'marketing', name: 'التسويق', icon: '📢' },
        { code: 'industry', name: 'الصناعة', icon: '🏭' },
        { code: 'transport', name: 'النقل', icon: '🚚' },
        { code: 'restaurants', name: 'المطاعم', icon: '🍔' },
        { code: 'crafts', name: 'الحرف والمهن', icon: '🔧' },
        { code: 'other', name: 'أخرى', icon: '📌' }
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
    
    // ==================== تحميل الإعدادات المحفوظة ====================
    loadSavedSettings() {
        try {
            const savedCountry = localStorage.getItem('selected_country');
            if (savedCountry) {
                this.selectedCountry = savedCountry;
            }
            
            const savedCategory = localStorage.getItem('selected_job_category');
            if (savedCategory) {
                this.selectedCategory = savedCategory;
            }
        } catch (e) {
            console.warn('⚠️ فشل تحميل الإعدادات:', e);
        }
    },
    
    // ==================== حفظ الإعدادات ====================
    saveSettings() {
        try {
            localStorage.setItem('selected_country', this.selectedCountry);
            localStorage.setItem('selected_job_category', this.selectedCategory);
        } catch (e) {}
    },
    
    // ==================== عرض منتقي البلد ====================
    renderCountrySelector() {
        const container = document.getElementById('countrySelector');
        if (!container) return;
        
        const currentFlag = window.Countries.getFlag(this.selectedCountry);
        const currentName = window.Countries.getName(this.selectedCountry);
        
        container.innerHTML = `
            <button class="country-btn" onclick="PostsSystem.toggleCountryDropdown()">
                <span class="country-flag">${currentFlag}</span>
                <span class="country-name">${currentName}</span>
                <i class="fas fa-chevron-down"></i>
            </button>
            <div class="country-dropdown" id="countryDropdown" style="display: none;">
                ${window.Countries.list.map(c => `
                    <button class="country-option ${c.code === this.selectedCountry ? 'active' : ''}" 
                            onclick="PostsSystem.selectCountry('${c.code}')">
                        <span class="country-flag">${c.flag}</span>
                        <span class="country-name">${c.name}</span>
                    </button>
                `).join('')}
                <div style="height: 1px; background: var(--border); margin: 4px 0;"></div>
                <button class="country-option ${this.showAllCountries ? 'active' : ''}" 
                        onclick="PostsSystem.selectAllCountries()">
                    <span class="country-flag">🌍</span>
                    <span class="country-name">جميع الدول</span>
                </button>
            </div>
        `;
    },
    
    // ==================== تبديل القائمة المنسدلة ====================
    toggleCountryDropdown() {
        const dropdown = document.getElementById('countryDropdown');
        if (!dropdown) return;
        
        if (dropdown.style.display === 'none' || !dropdown.style.display) {
            dropdown.style.display = 'block';
            
            // ✅ إغلاق عند النقر خارجها
            setTimeout(() => {
                const closeHandler = (e) => {
                    const container = document.getElementById('countrySelector');
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
    
    // ==================== اختيار البلد ====================
    selectCountry(code) {
        this.selectedCountry = code;
        this.showAllCountries = false;
        this.saveSettings();
        this.renderCountrySelector();
        this.loadAllPosts();
        
        console.log(`🌍 تم اختيار: ${window.Countries.getName(code)}`);
    },
    
    // ==================== اختيار كل الدول ====================
    selectAllCountries() {
        this.showAllCountries = true;
        this.saveSettings();
        this.renderCountrySelector();
        this.loadAllPosts();
        console.log('🌍 عرض جميع الدول');
    },
    
    // ==================== عرض أقسام الوظائف ====================
    renderJobCategories() {
        const container = document.getElementById('jobCategories');
        if (!container) return;
        
        container.innerHTML = this.jobCategories.map(cat => `
            <button class="category-tab ${cat.code === this.selectedCategory ? 'active' : ''}" 
                    onclick="PostsSystem.selectCategory('${cat.code}')">
                <span class="category-icon">${cat.icon}</span>
                <span class="category-name">${cat.name}</span>
            </button>
        `).join('');
    },
    
    // ==================== اختيار القسم ====================
    selectCategory(code) {
        this.selectedCategory = code;
        this.saveSettings();
        this.renderJobCategories();
        this.loadJobsPosts();
        
        console.log(`💼 تم اختيار قسم: ${this.getCategoryName(code)}`);
    },
    
    // ==================== الحصول على اسم القسم ====================
    getCategoryName(code) {
        const cat = this.jobCategories.find(c => c.code === code);
        return cat ? cat.name : code;
    },
    
    // ==================== الحصول على أيقونة القسم ====================
    getCategoryIcon(code) {
        const cat = this.jobCategories.find(c => c.code === code);
        return cat ? cat.icon : '📌';
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
    
    // ==================== تحميل جميع المنشورات ====================
    async loadAllPosts() {
        await this.loadJobsPosts();
        await this.loadMarriagePosts();
    },
    
    // ==================== تحميل منشورات الوظائف ====================
    async loadJobsPosts() {
        const container = document.getElementById('jobsPostsContainer');
        const emptyState = document.getElementById('jobsEmptyState');
        if (!container) return;
        
        try {
            // ✅ بناء الاستعلام
            let query = window.db.collection('posts').where('type', '==', 'job');
            
            // ✅ تصفية حسب البلد
            if (!this.showAllCountries && this.selectedCountry) {
                query = query.where('countryCode', '==', this.selectedCountry);
            }
            
            // ✅ تصفية حسب القسم
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
    
    // ==================== تحميل إعلانات الزواج ====================
    async loadMarriagePosts() {
        const container = document.getElementById('marriagePostsContainer');
        const emptyState = document.getElementById('marriageEmptyState');
        if (!container) return;
        
        try {
            // ✅ بناء الاستعلام
            let query = window.db.collection('posts').where('type', '==', 'marriage');
            
            // ✅ تصفية حسب البلد
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
                <div class="post-job-title">
                    <i class="fas fa-briefcase"></i>
                    <strong>${this.escapeHtml(post.jobTitle || '')}</strong>
                </div>
                <div class="post-info-row">
                    <span><i class="fas fa-user"></i> ${post.age || '?'} سنة</span>
                    <span><span style="font-size:1.1rem;">${flag}</span> ${this.escapeHtml(post.country || '')}</span>
                    <span><span style="font-size:1rem;">${catIcon}</span> ${this.escapeHtml(catName)}</span>
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
            'no': 'أعزب/عزباء',
            'yes': 'متزوج/متزوجة',
            'divorced': 'مطلق/مطلقة',
            'widowed': 'أرمل/أرملة'
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
    
    // ==================== فتح معاينة الصورة ====================
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
    
    // ==================== تكبير/تصغير صورة المنشور ====================
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
                    currentScale = 1;
                    translateX = 0;
                    translateY = 0;
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
        window.db.collection('posts')
            .where('type', '==', 'job')
            .onSnapshot(snapshot => {
                console.log(`📊 تحديث الوظائف: ${snapshot.size}`);
                this.loadJobsPosts();
            }, error => {
                console.warn('⚠️ خطأ في مستمع الوظائف:', error.message);
            });
        
        window.db.collection('posts')
            .where('type', '==', 'marriage')
            .onSnapshot(snapshot => {
                console.log(`📊 تحديث الزواج: ${snapshot.size}`);
                this.loadMarriagePosts();
            }, error => {
                console.warn('⚠️ خطأ في مستمع الزواج:', error.message);
            });
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
                    
                    canvas.toBlob(
                        (blob) => {
                            if (!blob) {
                                reject(new Error('فشل ضغط الصورة'));
                                return;
                            }
                            
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
                        },
                        'image/jpeg',
                        this.IMAGE_QUALITY
                    );
                };
                img.onerror = () => reject(new Error('فشل تحميل الصورة'));
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
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
        // ✅ ملء قائمة الدول والأقسام
        PostsSystem.fillPublishJobForm();
    } else if (type === 'marriage') {
        const modal = document.getElementById('publishMarriageModal');
        if (modal) modal.classList.add('active');
        // ✅ ملء قائمة الدول
        PostsSystem.fillPublishMarriageForm();
    }
};

// ==================== ملء نموذج الوظيفة ====================
PostsSystem.fillPublishJobForm = function() {
    // ✅ قائمة الدول
    const countrySelect = document.getElementById('jobCountryCode');
    if (countrySelect) {
        countrySelect.innerHTML = window.Countries.list.map(c => 
            `<option value="${c.code}">${c.flag} ${c.name}</option>`
        ).join('');
        countrySelect.value = this.selectedCountry;
    }
    
    // ✅ قائمة الأقسام
    const categorySelect = document.getElementById('jobCategory');
    if (categorySelect) {
        categorySelect.innerHTML = this.jobCategories
            .filter(c => c.code !== 'all')
            .map(c => `<option value="${c.code}">${c.icon} ${c.name}</option>`)
            .join('');
    }
};

// ==================== ملء نموذج الزواج ====================
PostsSystem.fillPublishMarriageForm = function() {
    const countrySelect = document.getElementById('marriageCountryCode');
    if (countrySelect) {
        countrySelect.innerHTML = window.Countries.list.map(c => 
            `<option value="${c.code}">${c.flag} ${c.name}</option>`
        ).join('');
        countrySelect.value = this.selectedCountry;
    }
};

// ✅ إغلاق معاينة صورة المنشور
window.closePostImagePreview = function() {
    const modal = document.getElementById('postImagePreviewModal');
    const img = document.getElementById('postPreviewImage');
    
    if (modal) modal.style.display = 'none';
    if (img) {
        img.src = '';
        img.style.transform = 'none';
        if (img._zoomCleanup) {
            img._zoomCleanup();
            img._zoomCleanup = null;
        }
    }
};

// ==================== نشر وظيفة ====================
window.publishJob = async function() {
    if (!window.auth?.currentUser) {
        alert('يجب تسجيل الدخول أولاً');
        return;
    }
    
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
    
    if (age < 15 || age > 80) {
        alert('العمر يجب أن يكون بين 15 و 80');
        return;
    }
    
    try {
        let imageBase64 = null;
        
        if (imageInput && imageInput.files[0]) {
            try {
                imageBase64 = await PostsSystem.compressImage(imageInput.files[0]);
            } catch (err) {
                console.error('❌ فشل ضغط الصورة:', err);
                alert('فشل معالجة الصورة: ' + err.message);
                return;
            }
        }
        
        const countryName = window.Countries.getName(countryCode);
        console.log('📤 جاري نشر الوظيفة...');
        
        await window.db.collection('posts').add({
            type: 'job',
            userId: window.auth.currentUser.uid,
            name: name,
            age: parseInt(age),
            country: countryName,
            countryCode: countryCode,
            category: category,
            jobTitle: jobTitle,
            bio: bio,
            image: imageBase64,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('✅ تم نشر الوظيفة');
        
        window.closeModal('publishJobModal');
        clearJobForm();
        
        alert('✅ تم نشر الوظيفة بنجاح');
        
        if (typeof switchPage === 'function') switchPage('home');
        
        // ✅ الانتقال للبلد الصحيح
        PostsSystem.selectCountry(countryCode);
        setTimeout(() => {
            PostsSystem.switchTab('jobs');
        }, 100);
        
    } catch (e) {
        console.error('❌ خطأ في النشر:', e);
        alert('حدث خطأ في النشر: ' + e.message);
    }
};

// ==================== نشر إعلان زواج ====================
window.publishMarriage = async function() {
    if (!window.auth?.currentUser) {
        alert('يجب تسجيل الدخول أولاً');
        return;
    }
    
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
    
    if (age < 15 || age > 80) {
        alert('العمر يجب أن يكون بين 15 و 80');
        return;
    }
    
    try {
        let imageBase64 = null;
        
        if (imageInput && imageInput.files[0]) {
            try {
                imageBase64 = await PostsSystem.compressImage(imageInput.files[0]);
            } catch (err) {
                console.error('❌ فشل ضغط الصورة:', err);
                alert('فشل معالجة الصورة: ' + err.message);
                return;
            }
        }
        
        const countryName = window.Countries.getName(countryCode);
        console.log('📤 جاري نشر إعلان الزواج...');
        
        await window.db.collection('posts').add({
            type: 'marriage',
            userId: window.auth.currentUser.uid,
            name: name,
            age: parseInt(age),
            country: countryName,
            countryCode: countryCode,
            bio: bio,
            married: married,
            children: children,
            image: imageBase64,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('✅ تم نشر إعلان الزواج');
        
        window.closeModal('publishMarriageModal');
        clearMarriageForm();
        
        alert('✅ تم نشر إعلان الزواج بنجاح');
        
        if (typeof switchPage === 'function') switchPage('home');
        
        PostsSystem.selectCountry(countryCode);
        setTimeout(() => {
            PostsSystem.switchTab('marriage');
        }, 100);
        
    } catch (e) {
        console.error('❌ خطأ في النشر:', e);
        alert('حدث خطأ في النشر: ' + e.message);
    }
};

// ==================== دوال مساعدة ====================
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

// ==================== تشغيل النظام ====================
window.addEventListener('load', () => {
    setTimeout(() => {
        if (window.auth?.currentUser) {
            PostsSystem.init();
        }
    }, 500);
});

window.addEventListener('authReady', () => {
    console.log('✅ authReady - تهيئة المنشورات');
    setTimeout(() => {
        PostsSystem.init();
    }, 300);
});

console.log('✅ posts-system.js تم تحميله');
