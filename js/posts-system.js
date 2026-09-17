// ========== posts-system.js - النسخة النهائية (مع ضغط الصور) ==========
// نظام المنشورات (وظائف + زواج) مع ضغط ذكي للصور

const PostsSystem = {
    currentTab: 'jobs',
    
    // ==================== إعدادات ضغط الصور ====================
    // ✅ يمكنك تعديل هذه القيم حسب الحاجة
    IMAGE_MAX_WIDTH: 600,      // العرض الأقصى بالبكسل
    IMAGE_QUALITY: 0.65,        // جودة JPEG (0.1 = ضعيفة، 1 = عالية)
    
    // ==================== القسم 1: init ====================
    init() {
        console.log('🚀 تهيئة نظام المنشورات...');
        console.log(`📐 إعدادات الصور: ${this.IMAGE_MAX_WIDTH}px @ ${this.IMAGE_QUALITY * 100}%`);
        this.loadAllPosts();
        this.setupRealtimeListeners();
        console.log('✅ تم تهيئة نظام المنشورات');
    },
    
    // ==================== القسم 2: التبديل بين التبويبات ====================
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
    
    // ==================== القسم 3: تحميل جميع المنشورات ====================
    async loadAllPosts() {
        await this.loadJobsPosts();
        await this.loadMarriagePosts();
    },
    
    // ==================== القسم 4: تحميل منشورات الوظائف ====================
    async loadJobsPosts() {
        const container = document.getElementById('jobsPostsContainer');
        const emptyState = document.getElementById('jobsEmptyState');
        if (!container) return;
        
        try {
            const snapshot = await window.db.collection('posts')
                .where('type', '==', 'job')
                .limit(50)
                .get();
            
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
        }
    },
    
    // ==================== القسم 5: تحميل إعلانات الزواج ====================
    async loadMarriagePosts() {
        const container = document.getElementById('marriagePostsContainer');
        const emptyState = document.getElementById('marriageEmptyState');
        if (!container) return;
        
        try {
            const snapshot = await window.db.collection('posts')
                .where('type', '==', 'marriage')
                .limit(50)
                .get();
            
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
        }
    },
    
    // ==================== القسم 6: إنشاء بطاقة وظيفة ====================
    createJobPost(post) {
        const card = document.createElement('div');
        card.className = 'post-card job-post-card';
        
        const isOwner = window.auth?.currentUser?.uid === post.userId;
        
        const avatarContent = post.image 
            ? `<img src="${post.image}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" loading="lazy">` 
            : '👤';
        
        const deleteBtn = isOwner 
            ? `<button class="post-menu" onclick="PostsSystem.deletePost('${post.id}')" title="حذف"><i class="fas fa-trash"></i></button>` 
            : '';
        
        card.innerHTML = `
            <div class="post-header">
                <div class="post-avatar-emoji">${avatarContent}</div>
                <div class="post-user">
                    <h4>${this.escapeHtml(post.name || 'مستخدم')}</h4>
                    <span class="post-time">${this.formatTime(post.timestamp)}</span>
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
                    <span><i class="fas fa-map-marker-alt"></i> ${this.escapeHtml(post.country || '')}</span>
                </div>
                <div class="post-bio">
                    ${this.escapeHtml(post.bio || '')}
                </div>
            </div>
        `;
        
        return card;
    },
    
    // ==================== القسم 7: إنشاء بطاقة زواج ====================
    createMarriagePost(post) {
        const card = document.createElement('div');
        card.className = 'post-card marriage-post-card';
        
        const isOwner = window.auth?.currentUser?.uid === post.userId;
        
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
                <div class="post-avatar-emoji">${avatarContent}</div>
                <div class="post-user">
                    <h4>${this.escapeHtml(post.name || 'مستخدم')}</h4>
                    <span class="post-time">${this.formatTime(post.timestamp)}</span>
                </div>
                ${deleteBtn}
            </div>
            <div class="post-content">
                <div class="post-info-row">
                    <span><i class="fas fa-user"></i> ${post.age || '?'} سنة</span>
                    <span><i class="fas fa-map-marker-alt"></i> ${this.escapeHtml(post.country || '')}</span>
                </div>
                <div class="post-info-row">
                    <span><i class="fas fa-heart"></i> ${marriedText[post.married] || post.married || ''}</span>
                    <span><i class="fas fa-child"></i> أطفال: ${childrenText}</span>
                </div>
                <div class="post-bio">
                    ${this.escapeHtml(post.bio || '')}
                </div>
            </div>
        `;
        
        return card;
    },
    
    // ==================== القسم 8: حذف منشور ====================
    async deletePost(postId) {
        if (!confirm('هل أنت متأكد من حذف هذا المنشور؟')) return;
        
        try {
            await window.db.collection('posts').doc(postId).delete();
            console.log(`✅ تم حذف المنشور ${postId} بالكامل (بما فيه الصورة)`);
            this.loadAllPosts();
        } catch (e) {
            console.error('❌ خطأ في الحذف:', e);
            alert('حدث خطأ في الحذف');
        }
    },
    
    // ==================== القسم 9: مستمعي الوقت الحقيقي ====================
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
    
    // ==================== القسم 10: ضغط الصورة الذكي ====================
    async compressImage(file) {
        return new Promise((resolve, reject) => {
            // ✅ التحقق من نوع الصورة
            if (!file.type.startsWith('image/')) {
                reject(new Error('الملف ليس صورة'));
                return;
            }
            
            // ✅ التحقق من حجم الملف الأصلي (10 MB كحد أقصى)
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
                    
                    // ✅ تصغير الصورة إذا كانت كبيرة
                    if (width > this.IMAGE_MAX_WIDTH) {
                        height = Math.round((height * this.IMAGE_MAX_WIDTH) / width);
                        width = this.IMAGE_MAX_WIDTH;
                    }
                    
                    // ✅ إذا كانت الصورة عمودية كبيرة، نحدد الارتفاع
                    if (height > this.IMAGE_MAX_WIDTH) {
                        width = Math.round((width * this.IMAGE_MAX_WIDTH) / height);
                        height = this.IMAGE_MAX_WIDTH;
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    const ctx = canvas.getContext('2d');
                    // ✅ تحسين جودة الرسم
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // ✅ ضغط إلى JPEG
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
                                
                                // ✅ التحقق من الحجم النهائي
                                if (compressedSize > 200) {
                                    console.warn(`⚠️ الصورة المضغوطة كبيرة (${compressedSize} KB)`);
                                }
                                
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
    
    // ==================== القسم 11: دوال مساعدة ====================
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    formatTime(timestamp) {
        if (!timestamp) return 'الآن';
        try {
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            const now = new Date();
            const diff = Math.floor((now - date) / 1000);
            
            if (diff < 60) return 'الآن';
            if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
            if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
            if (diff < 604800) return `منذ ${Math.floor(diff / 86400)} يوم`;
            
            return date.toLocaleDateString('ar-EG');
        } catch (e) {
            return 'الآن';
        }
    }
};

// ==================== دوال الواجهة العامة ====================

// ✅ تبديل التبويبات
window.switchHomeTab = function(tab) {
    PostsSystem.switchTab(tab);
};

// ✅ فتح نافذة النشر
window.openPublishModal = function(type) {
    if (type === 'jobs') {
        const modal = document.getElementById('publishJobModal');
        if (modal) modal.classList.add('active');
    } else if (type === 'marriage') {
        const modal = document.getElementById('publishMarriageModal');
        if (modal) modal.classList.add('active');
    }
};

// ✅ معاينة صورة الوظيفة
window.previewJobImage = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('jobImagePreview');
        if (preview) {
            preview.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        }
    };
    reader.readAsDataURL(file);
};

// ✅ معاينة صورة الزواج
window.previewMarriageImage = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('marriageImagePreview');
        if (preview) {
            preview.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        }
    };
    reader.readAsDataURL(file);
};

// ✅ نشر وظيفة (مع ضغط الصورة)
window.publishJob = async function() {
    if (!window.auth?.currentUser) {
        alert('يجب تسجيل الدخول أولاً');
        return;
    }
    
    const name = document.getElementById('jobName')?.value?.trim();
    const age = document.getElementById('jobAge')?.value;
    const country = document.getElementById('jobCountry')?.value?.trim();
    const jobTitle = document.getElementById('jobTitle')?.value?.trim();
    const bio = document.getElementById('jobBio')?.value?.trim();
    const imageInput = document.getElementById('jobImage');
    
    // ✅ التحقق من الحقول
    if (!name || !age || !country || !jobTitle || !bio) {
        alert('يرجى تعبئة جميع الحقول');
        return;
    }
    
    if (age < 15 || age > 80) {
        alert('العمر يجب أن يكون بين 15 و 80');
        return;
    }
    
    try {
        let imageBase64 = null;
        
        // ✅ ضغط الصورة (إذا كانت موجودة)
        if (imageInput && imageInput.files[0]) {
            try {
                imageBase64 = await PostsSystem.compressImage(imageInput.files[0]);
            } catch (err) {
                console.error('❌ فشل ضغط الصورة:', err);
                alert('فشل معالجة الصورة: ' + err.message);
                return;
            }
        }
        
        console.log('📤 جاري نشر الوظيفة...');
        
        // ✅ حفظ في Firebase
        await window.db.collection('posts').add({
            type: 'job',
            userId: window.auth.currentUser.uid,
            name: name,
            age: parseInt(age),
            country: country,
            jobTitle: jobTitle,
            bio: bio,
            image: imageBase64,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('✅ تم نشر الوظيفة');
        
        // ✅ إغلاق النافذة وتفريغ النموذج
        window.closeModal('publishJobModal');
        clearJobForm();
        
        alert('✅ تم نشر الوظيفة بنجاح');
        
        // ✅ الانتقال للرئيسية
        if (typeof switchPage === 'function') {
            switchPage('home');
        }
        
        // ✅ التبديل لتبويب الوظائف وتحديث
        setTimeout(() => {
            PostsSystem.switchTab('jobs');
            PostsSystem.loadJobsPosts();
        }, 100);
        
    } catch (e) {
        console.error('❌ خطأ في النشر:', e);
        alert('حدث خطأ في النشر: ' + e.message);
    }
};

// ✅ نشر إعلان زواج (مع ضغط الصورة)
window.publishMarriage = async function() {
    if (!window.auth?.currentUser) {
        alert('يجب تسجيل الدخول أولاً');
        return;
    }
    
    const name = document.getElementById('marriageName')?.value?.trim();
    const age = document.getElementById('marriageAge')?.value;
    const country = document.getElementById('marriageCountry')?.value?.trim();
    const bio = document.getElementById('marriageBio')?.value?.trim();
    const married = document.getElementById('marriageMarried')?.value;
    const children = document.getElementById('marriageChildren')?.value;
    const imageInput = document.getElementById('marriageImage');
    
    // ✅ التحقق من الحقول
    if (!name || !age || !country || !bio) {
        alert('يرجى تعبئة جميع الحقول');
        return;
    }
    
    if (age < 15 || age > 80) {
        alert('العمر يجب أن يكون بين 15 و 80');
        return;
    }
    
    try {
        let imageBase64 = null;
        
        // ✅ ضغط الصورة (إذا كانت موجودة)
        if (imageInput && imageInput.files[0]) {
            try {
                imageBase64 = await PostsSystem.compressImage(imageInput.files[0]);
            } catch (err) {
                console.error('❌ فشل ضغط الصورة:', err);
                alert('فشل معالجة الصورة: ' + err.message);
                return;
            }
        }
        
        console.log('📤 جاري نشر إعلان الزواج...');
        
        // ✅ حفظ في Firebase
        await window.db.collection('posts').add({
            type: 'marriage',
            userId: window.auth.currentUser.uid,
            name: name,
            age: parseInt(age),
            country: country,
            bio: bio,
            married: married,
            children: children,
            image: imageBase64,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('✅ تم نشر إعلان الزواج');
        
        // ✅ إغلاق النافذة وتفريغ النموذج
        window.closeModal('publishMarriageModal');
        clearMarriageForm();
        
        alert('✅ تم نشر إعلان الزواج بنجاح');
        
        // ✅ الانتقال للرئيسية
        if (typeof switchPage === 'function') {
            switchPage('home');
        }
        
        // ✅ التبديل لتبويب الزواج وتحديث
        setTimeout(() => {
            PostsSystem.switchTab('marriage');
            PostsSystem.loadMarriagePosts();
        }, 100);
        
    } catch (e) {
        console.error('❌ خطأ في النشر:', e);
        alert('حدث خطأ في النشر: ' + e.message);
    }
};

// ==================== دوال مساعدة ====================

// ✅ تفريغ نموذج الوظيفة
function clearJobForm() {
    ['jobName', 'jobAge', 'jobCountry', 'jobTitle', 'jobBio'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const preview = document.getElementById('jobImagePreview');
    if (preview) preview.innerHTML = '👤';
    const input = document.getElementById('jobImage');
    if (input) input.value = '';
}

// ✅ تفريغ نموذج الزواج
function clearMarriageForm() {
    ['marriageName', 'marriageAge', 'marriageCountry', 'marriageBio'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const preview = document.getElementById('marriageImagePreview');
    if (preview) preview.innerHTML = '👤';
    const input = document.getElementById('marriageImage');
    if (input) input.value = '';
}

// ==================== تشغيل النظام ====================

// ✅ عند تحميل الصفحة
window.addEventListener('load', () => {
    setTimeout(() => {
        if (window.auth?.currentUser) {
            PostsSystem.init();
        }
    }, 500);
});

// ✅ عند تسجيل الدخول
window.addEventListener('authReady', () => {
    console.log('✅ authReady - تهيئة المنشورات');
    setTimeout(() => {
        PostsSystem.init();
    }, 300);
});

console.log('✅ posts-system.js تم تحميله - إعدادات الصور: 600px @ 65%');
