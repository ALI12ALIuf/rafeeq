// ========== نظام الوظائف ==========
// jobs.js - إدارة الوظائف في منصة فرصة

// ========== دوال النشر ==========

// نشر وظيفة جديدة
window.publishJob = async function() {
    if (!window.auth?.currentUser) {
        alert('الرجاء تسجيل الدخول أولاً');
        return;
    }

    // التحقق من الحقول المطلوبة
    const title = document.getElementById('jobTitle')?.value;
    const description = document.getElementById('jobDescription')?.value;
    const governorate = document.getElementById('jobGovernorate')?.value;

    if (!title || !description || !governorate) {
        alert('الرجاء ملء جميع الحقول المطلوبة');
        return;
    }

    // جمع المهارات
    const skills = [];
    const skillTags = document.querySelectorAll('.skill-tag span');
    skillTags.forEach(tag => skills.push(tag.textContent));

    // جمع البيانات
    const jobData = {
        userId: window.auth.currentUser.uid,
        title: title,
        description: description,
        governorate: governorate,
        area: document.getElementById('jobArea')?.value || '',
        type: document.getElementById('jobType')?.value || 'full-time',
        salary: document.getElementById('jobSalary')?.value || '',
        experience: document.getElementById('jobExperience')?.value || '0',
        education: document.getElementById('jobEducation')?.value || 'none',
        hours: document.getElementById('jobHours')?.value || '',
        insurance: document.getElementById('jobInsurance')?.checked || false,
        skills: skills,
        status: 'active',
        views: 0,
        applications: 0,
        createdAt: new Date(),
        updatedAt: new Date()
    };

    try {
        // حفظ في Firebase
        const docRef = await window.db.collection('jobs').add(jobData);

        // تحديث إحصائيات المستخدم
        const userRef = window.db.collection('users').doc(window.auth.currentUser.uid);
        await userRef.update({
            jobsPosted: firebase.firestore.FieldValue.increment(1)
        });

        alert('تم نشر الوظيفة بنجاح!');
        
        // العودة للصفحة الرئيسية
        goBack();
        
        // إعادة تحميل الوظائف
        if (typeof loadJobs === 'function') {
            loadJobs();
        }

    } catch (error) {
        console.error('Error publishing job:', error);
        alert('حدث خطأ في نشر الوظيفة');
    }
};

// ========== عرض تفاصيل الوظيفة ==========

window.showJobDetails = async function(jobId) {
    try {
        const jobDoc = await window.db.collection('jobs').doc(jobId).get();
        
        if (!jobDoc.exists) {
            alert('الوظيفة غير موجودة');
            return;
        }

        const job = jobDoc.data();
        const posterDoc = await window.db.collection('users').doc(job.userId).get();
        const poster = posterDoc.exists ? posterDoc.data() : null;

        // تحديث عدد المشاهدات
        await window.db.collection('jobs').doc(jobId).update({
            views: firebase.firestore.FieldValue.increment(1)
        });

        // عرض صفحة التفاصيل
        document.querySelector('.home-page').style.display = 'none';
        document.getElementById('jobDetailsPage').style.display = 'block';

        const content = document.getElementById('jobDetailsContent');
        const time = job.createdAt ? new Date(job.createdAt.seconds * 1000) : new Date();

        content.innerHTML = `
            <div class="detail-section">
                <h4><i class="fas fa-briefcase"></i> معلومات الوظيفة</h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">المسمى الوظيفي</span>
                        <span class="detail-value">${job.title || 'غير محدد'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">نوع الوظيفة</span>
                        <span class="detail-value">${getJobTypeText(job.type)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">المحافظة</span>
                        <span class="detail-value">${job.governorate || 'غير محدد'} ${job.area ? `- ${job.area}` : ''}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">الراتب</span>
                        <span class="detail-value">${job.salary || 'غير محدد'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">سنوات الخبرة</span>
                        <span class="detail-value">${getExperienceText(job.experience)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">المؤهل المطلوب</span>
                        <span class="detail-value">${getEducationText(job.education)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">وقت الدوام</span>
                        <span class="detail-value">${job.hours || 'غير محدد'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">تأمين صحي</span>
                        <span class="detail-value">${job.insurance ? 'نعم' : 'لا'}</span>
                    </div>
                </div>
            </div>

            <div class="detail-section">
                <h4><i class="fas fa-align-left"></i> وصف الوظيفة</h4>
                <p>${job.description || 'لا يوجد وصف'}</p>
            </div>

            ${job.skills?.length ? `
                <div class="detail-section">
                    <h4><i class="fas fa-tools"></i> المهارات المطلوبة</h4>
                    <div class="job-tags">
                        ${job.skills.map(skill => `<span class="tag">${skill}</span>`).join('')}
                    </div>
                </div>
            ` : ''}

            <div class="detail-section">
                <h4><i class="fas fa-building"></i> معلومات الناشر</h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">اسم الناشر</span>
                        <span class="detail-value">${poster?.name || 'غير معروف'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">نوع الحساب</span>
                        <span class="detail-value">${getAccountTypeText(poster?.accountType)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">تاريخ النشر</span>
                        <span class="detail-value">${time.toLocaleDateString('ar-EG')}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">المشاهدات</span>
                        <span class="detail-value">${job.views || 0}</span>
                    </div>
                </div>
            </div>
        `;

        // تخزين معرف الوظيفة للاستخدام لاحقاً
        window.currentJobId = jobId;
        window.currentPosterId = job.userId;

    } catch (error) {
        console.error('Error showing job details:', error);
        alert('حدث خطأ في عرض تفاصيل الوظيفة');
    }
};

// ========== التقديم على وظيفة ==========

window.applyForJob = async function() {
    if (!window.auth?.currentUser) {
        alert('الرجاء تسجيل الدخول أولاً');
        return;
    }

    if (!window.currentJobId) return;

    try {
        // التحقق من عدم التقديم مسبقاً
        const existingApplications = await window.db.collection('applications')
            .where('jobId', '==', window.currentJobId)
            .where('userId', '==', window.auth.currentUser.uid)
            .get();

        if (!existingApplications.empty) {
            alert('لقد تقدمت لهذه الوظيفة مسبقاً');
            return;
        }

        // إنشاء طلب التقديم
        await window.db.collection('applications').add({
            jobId: window.currentJobId,
            userId: window.auth.currentUser.uid,
            employerId: window.currentPosterId,
            status: 'pending',
            appliedAt: new Date(),
            updatedAt: new Date()
        });

        // تحديث عدد المتقدمين
        await window.db.collection('jobs').doc(window.currentJobId).update({
            applications: firebase.firestore.FieldValue.increment(1)
        });

        alert('تم التقديم على الوظيفة بنجاح!');

        // فتح محادثة مع صاحب العمل
        if (window.currentPosterId) {
            setTimeout(() => {
                window.openChat?.(window.currentPosterId);
            }, 1000);
        }

    } catch (error) {
        console.error('Error applying for job:', error);
        alert('حدث خطأ في التقديم على الوظيفة');
    }
};

// ========== إدارة المهارات ==========

// إضافة مهارة
window.addSkill = function() {
    const input = document.getElementById('skillInput');
    const skill = input.value.trim();
    
    if (!skill) return;
    
    const skillsList = document.getElementById('skillsList');
    const skillTag = document.createElement('span');
    skillTag.className = 'skill-tag';
    skillTag.innerHTML = `
        <span>${skill}</span>
        <i class="fas fa-times" onclick="this.parentElement.remove()"></i>
    `;
    
    skillsList.appendChild(skillTag);
    input.value = '';
};

// مستمع لإضافة المهارات بالضغط على Enter
document.addEventListener('DOMContentLoaded', function() {
    const skillInput = document.getElementById('skillInput');
    if (skillInput) {
        skillInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                window.addSkill();
            }
        });
    }
});

// ========== دوال مساعدة ==========

function getEducationText(education) {
    const types = {
        'none': 'بدون مؤهل',
        'highschool': 'ثانوية',
        'diploma': 'دبلوم',
        'bachelor': 'بكالوريوس',
        'master': 'ماجستير',
        'phd': 'دكتوراه'
    };
    return types[education] || 'غير محدد';
}

function getAccountTypeText(type) {
    const types = {
        'jobseeker': 'باحث عن عمل',
        'employer': 'صاحب عمل',
        'investor': 'مستثمر',
        'project-owner': 'صاحب مشروع'
    };
    return types[type] || 'مستخدم';
}

// ========== تصدير الدوال ==========
window.getJobTypeText = getJobTypeText;
window.getExperienceText = getExperienceText;

console.log('✅ jobs.js جاهز');
