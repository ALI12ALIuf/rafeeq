// ========== posts-system.js - نظام منشورات الوظائف والزواج ==========

const PostsSystem = {
    currentTab: 'jobs', // 'jobs' أو 'marriage'
    
    // ==================== القسم 1: init ====================
    init() {
        this.loadAllPosts();
        this.setupRealtimeListeners();
        console.log('✅ تم تهيئة نظام المنشورات');
    },
    
    // ==================== القسم 2: التبديل بين التبويبات ====================
    switchTab(tab) {
        this.currentTab = tab;
        
        // ✅ تحديث التبويبات
        document.querySelectorAll('.home-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });
        
        // ✅ تحديث المحتوى
        document.querySelectorAll('.home-content').forEach(c => c.classList.remove('active'));
        
        if (tab === 'jobs') {
            document.getElementById('jobsContent')?.classList.add('active');
            this.loadJobsPosts();
        } else {
            document.getElementById('marriageContent')?.classList.add('active');
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
                .orderBy('timestamp', 'desc')
                .limit(50)
                .get();
            
            container.innerHTML = '';
            
            if (snapshot.empty) {
                if (emptyState) emptyState.style.display = 'flex';
                return;
            }
            
            if (emptyState) emptyState.style.display = 'none';
            
            for (const doc of snapshot.docs) {
                const post = { id: doc.id, ...doc.data() };
                const postEl = this.createJobPost(post);
                if (postEl) container.appendChild(postEl);
            }
            
            console.log(`✅ تم تحميل ${snapshot.size} وظيفة`);
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
                .orderBy('timestamp', 'desc')
                .limit(50)
                .get();
            
            container.innerHTML = '';
            
            if (snapshot.empty) {
                if (emptyState) emptyState.style.display = 'flex';
                return;
            }
            
            if (emptyState) emptyState.style.display = 'none';
            
            for (const doc of snapshot.docs) {
                const post = { id: doc.id, ...doc.data() };
                const postEl = this.createMarriagePost(post);
                if (postEl) container.appendChild(postEl);
            }
            
            console.log(`✅ تم تحميل ${snapshot.size} إعلان زواج`);
        } catch (e) {
            console.error('❌ خطأ في تحميل إعلانات الزواج:', e);
        }
    },
    
    // ==================== القسم 6: إنشاء بطاقة وظيفة ====================
    createJobPost(post) {
        const card = document.createElement('div');
        card.className = 'post-card job-post-card';
        
        const isOwner = window.auth?.currentUser?.uid === post.userId;
        
        card.innerHTML = `
            <div class="post-header">
                <div class="post-avatar-emoji">
                    ${post.image ? `<img src="${post.image}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : '👤'}
                </div>
                <div class="post-user">
                    <h4>${this.escapeHtml(post.name)}</h4>
                    <span class="post-time">${this.formatTime(post.timestamp)}</span>
                </div>
                ${isOwner ? `<button class="post-menu" onclick="PostsSystem.deletePost('${post.id}')"><i class="fas fa-trash"></i></button>` : ''}
            </div>
            <div class="post-content">
                <div class="post-job-title">
                    <i class="fas fa-briefcase"></i>
                    <strong>${this.escapeHtml(post.jobTitle)}</strong>
                </div>
                <div class="post-info-row">
                    <span><i class="fas fa-user"></i> ${post.age} سنة</span>
                    <span><i class="fas fa-map-marker-alt"></i> ${this.escapeHtml(post.country)}</span>
                </div>
                <div class="post-bio">
                    ${this.escapeHtml(post.bio)}
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
        
        // ✅ ترجمة حالة الزواج
        const marriedText = {
            'no': 'أعزب/عزباء',
            'yes': 'متزوج/متزوجة',
            'divorced': 'مطلق/مطلقة',
            'widowed': 'أرمل/أرملة'
        };
        
        const childrenText = post.children === 'yes' ? 'نعم' : 'لا';
        
        card.innerHTML = `
            <div class="post-header">
                <div class="post-avatar-emoji">
                    ${post.image ? `<img src="${post.image}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : '👤'}
                </div>
                <div class="post-user">
                    <h4>${this.escapeHtml(post.name)}</h4>
                    <span class="post-time">${this.formatTime(post.timestamp)}</span>
                </div>
                ${isOwner ? `<button class="post-menu" onclick="PostsSystem.deletePost('${post.id}')"><i class="fas fa-trash"></i></button>` : ''}
            </div>
            <div class="post-content">
                <div class="post-info-row">
                    <span><i class="fas fa-user"></i> ${post.age} سنة</span>
                    <span><i class="fas fa-map-marker-alt"></i> ${this.escapeHtml(post.country)}</span>
                </div>
                <div class="post-info-row">
                    <span><i class="fas fa-heart"></i> ${marriedText[post.married] || post.married}</span>
                    <span><i class="fas fa-child"></i> أطفال: ${childrenText}</span>
                </div>
                <div class="post-bio">
                    ${this.escapeHtml(post.bio)}
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
            console.log(`✅ تم حذف المنشور ${postId}`);
            
            // ✅ إعادة تحميل
            this.loadAllPosts();
        } catch (e) {
            console.error('❌ خطأ في الحذف:', e);
            alert('حدث خطأ');
        }
    },
    
    // ==================== القسم 9: مستمعي الوقت الحقيقي ====================
    setupRealtimeListeners() {
        // ✅ مستمع للوظائف
        window.db.collection('posts')
            .where('type', '==', 'job')
            .orderBy('timestamp', 'desc')
            .limit(50)
            .onSnapshot(snapshot => {
                console.log(`📊 تحديث الوظائف: ${snapshot.size}`);
                if (this.currentTab === 'jobs') {
                    this.loadJobsPosts();
                }
            }, error => console.warn('خطأ في مستمع الوظائف:', error));
        
        // ✅ مستمع للزواج
        window.db.collection('posts')
            .where('type', '==', 'marriage')
            .orderBy('timestamp', 'desc')
            .limit(50)
            .onSnapshot(snapshot => {
                console.log(`📊 تحديث الزواج: ${snapshot.size}`);
                if (this.currentTab === 'marriage') {
                    this.loadMarriagePosts();
                }
            }, error => console.warn('خطأ في مستمع الزواج:', error));
    },
    
    // ==================== القسم 10: دوال مساعدة ====================
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

// ✅ فتح نافذة نشر
window.openPublishModal = function(type) {
    if (type === 'jobs') {
        document.getElementById('publishJobModal').classList.add('active');
    } else if (type === 'marriage') {
        document.getElementById('publishMarriageModal').classList.add('active');
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
            preview.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;">`;
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
            preview.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;">`;
        }
    };
    reader.readAsDataURL(file);
};

// ✅ نشر وظيفة
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
    
    // ✅ التحقق
    if (!name || !age || !country || !jobTitle || !bio) {
        alert('يرجى تعبئة جميع الحقول');
        return;
    }
    
    if (age < 15 || age > 80) {
        alert('العمر يجب أن يكون بين 15 و 80');
        return;
    }
    
    try {
        // ✅ معالجة الصورة
        let imageBase64 = null;
        if (imageInput && imageInput.files[0]) {
            imageBase64 = await fileToBase64(imageInput.files[0]);
        }
        
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
        
        // ✅ إغلاق + تفريغ
        closeModal('publishJobModal');
        clearJobForm();
        
        alert('✅ تم نشر الوظيفة بنجاح');
        
        // ✅ الانتقال للرئيسية + تحديث
        if (typeof switchPage === 'function') switchPage('home');
        PostsSystem.switchTab('jobs');
        PostsSystem.loadJobsPosts();
        
    } catch (e) {
        console.error('❌ خطأ في النشر:', e);
        alert('حدث خطأ في النشر');
    }
};

// ✅ نشر إعلان زواج
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
    
    // ✅ التحقق
    if (!name || !age || !country || !bio) {
        alert('يرجى تعبئة جميع الحقول');
        return;
    }
    
    if (age < 15 || age > 80) {
        alert('العمر يجب أن يكون بين 15 و 80');
        return;
    }
    
    try {
        // ✅ معالجة الصورة
        let imageBase64 = null;
        if (imageInput && imageInput.files[0]) {
            imageBase64 = await fileToBase64(imageInput.files[0]);
        }
        
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
        
        // ✅ إغلاق + تفريغ
        closeModal('publishMarriageModal');
        clearMarriageForm();
        
        alert('✅ تم نشر إعلان الزواج بنجاح');
        
        // ✅ الانتقال للرئيسية + تحديث
        if (typeof switchPage === 'function') switchPage('home');
        PostsSystem.switchTab('marriage');
        PostsSystem.loadMarriagePosts();
        
    } catch (e) {
        console.error('❌ خطأ في النشر:', e);
        alert('حدث خطأ في النشر');
    }
};

// ✅ تفريغ نماذج
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

// ✅ تحويل ملف إلى base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ✅ إغلاق نافذة
window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
};

// ==================== تشغيل النظام ====================
window.addEventListener('load', () => {
    setTimeout(() => {
        if (window.auth?.currentUser) {
            PostsSystem.init();
        }
    }, 500);
});

window.addEventListener('authReady', () => {
    PostsSystem.init();
});
