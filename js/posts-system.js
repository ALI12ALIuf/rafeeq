// ========== posts-system.js - النسخة النهائية ==========

const PostsSystem = {
    currentTab: 'jobs',
    
    // ==================== إعدادات ضغط الصور ====================
    IMAGE_MAX_WIDTH: 600,
    IMAGE_QUALITY: 0.65,
    
    // ==================== init ====================
    init() {
        console.log('🚀 تهيئة نظام المنشورات...');
        this.loadAllPosts();
        this.setupRealtimeListeners();
        console.log('✅ تم تهيئة نظام المنشورات');
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
    
    // ==================== تحميل إعلانات الزواج ====================
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
    
    // ==================== إنشاء بطاقة وظيفة ====================
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
                    <span><i class="fas fa-map-marker-alt"></i> ${this.escapeHtml(post.country || '')}</span>
                </div>
                <div class="post-bio">${this.escapeHtml(post.bio || '')}</div>
            </div>
        `;
        
        // ✅ تخزين الصورة للمعاينة
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
                    <span><i class="fas fa-map-marker-alt"></i> ${this.escapeHtml(post.country || '')}</span>
                </div>
                <div class="post-info-row">
                    <span><i class="fas fa-heart"></i> ${marriedText[post.married] || post.married || ''}</span>
                    <span><i class="fas fa-child"></i> أطفال: ${childrenText}</span>
                </div>
                <div class="post-bio">${this.escapeHtml(post.bio || '')}</div>
            </div>
        `;
        
        // ✅ تخزين الصورة للمعاينة
        if (post.image) {
            card.setAttribute('data-post-image', post.image);
            card.setAttribute('data-post-id', post.id);
        }
        
        return card;
    },
    
    // ==================== ✅ فتح معاينة الصورة ====================
    openImagePreview(postId) {
        // ✅ البحث عن البطاقة بالمعرف
        const card = document.querySelector(`[data-post-id="${postId}"]`);
        if (!card) return;
        
        const imageSrc = card.getAttribute('data-post-image');
        if (!imageSrc) return;
        
        const modal = document.getElementById('postImagePreviewModal');
        const img = document.getElementById('postPreviewImage');
        if (!modal || !img) return;
        
        img.src = imageSrc;
        modal.style.display = 'flex';
        
        // ✅ إعداد التكبير/التصغير
        this.setupPostImageZoom(modal, img);
    },
    
    // ==================== ✅ تكبير/تصغير صورة المنشور ====================
    setupPostImageZoom(modal, img) {
        // ✅ إزالة المستمعات السابقة
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
        
        // ✅ لمس بـ إصبعين للتكبير
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
            
            // ✅ إعادة للمقياس الطبيعي عند التصغير جداً
            if (currentScale < 1) {
                currentScale = 1;
                translateX = 0;
                translateY = 0;
                updateTransform();
            }
        };
        
        // ✅ نقر مزدوج للتكبير/التصغير
        let lastTap = 0;
        const doubleTapHandler = (e) => {
            const now = Date.now();
            if (now - lastTap < 300) {
                e.preventDefault();
                // ✅ تبديل بين 1x و 2x
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
    } else if (type === 'marriage') {
        const modal = document.getElementById('publishMarriageModal');
        if (modal) modal.classList.add('active');
    }
};

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
        
        window.closeModal('publishJobModal');
        clearJobForm();
        
        alert('✅ تم نشر الوظيفة بنجاح');
        
        if (typeof switchPage === 'function') switchPage('home');
        
        setTimeout(() => {
            PostsSystem.switchTab('jobs');
            PostsSystem.loadJobsPosts();
        }, 100);
        
    } catch (e) {
        console.error('❌ خطأ في النشر:', e);
        alert('حدث خطأ في النشر: ' + e.message);
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
        
        window.closeModal('publishMarriageModal');
        clearMarriageForm();
        
        alert('✅ تم نشر إعلان الزواج بنجاح');
        
        if (typeof switchPage === 'function') switchPage('home');
        
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
