// ========== نظام الاستثمار ==========
// investments.js - إدارة الفرص الاستثمارية في منصة فرصة

// ========== دوال النشر ==========

// نشر فرصة استثمارية
window.publishInvestment = async function() {
    if (!window.auth?.currentUser) {
        alert('الرجاء تسجيل الدخول أولاً');
        return;
    }

    // التحقق من الحقول المطلوبة
    const title = document.getElementById('investmentTitle')?.value;
    const description = document.getElementById('investmentDescription')?.value;
    const governorate = document.getElementById('investmentGovernorate')?.value;
    const capital = document.getElementById('investmentCapital')?.value;

    if (!title || !description || !governorate || !capital) {
        alert('الرجاء ملء جميع الحقول المطلوبة');
        return;
    }

    // جمع البيانات
    const investmentData = {
        userId: window.auth.currentUser.uid,
        title: title,
        description: description,
        governorate: governorate,
        area: document.getElementById('investmentArea')?.value || '',
        field: document.getElementById('investmentField')?.value || 'commercial',
        capital: capital,
        profit: document.getElementById('investmentProfit')?.value || '',
        duration: document.getElementById('investmentDuration')?.value || '',
        status: 'active',
        views: 0,
        interests: 0,
        createdAt: new Date(),
        updatedAt: new Date()
    };

    try {
        // حفظ في Firebase
        const docRef = await window.db.collection('investments').add(investmentData);

        // تحديث إحصائيات المستخدم
        const userRef = window.db.collection('users').doc(window.auth.currentUser.uid);
        await userRef.update({
            investmentsPosted: firebase.firestore.FieldValue.increment(1)
        });

        alert('تم نشر الفرصة الاستثمارية بنجاح!');
        
        // العودة للصفحة الرئيسية
        goBack();
        
        // إعادة تحميل الاستثمارات
        if (typeof loadInvestments === 'function') {
            loadInvestments();
        }

    } catch (error) {
        console.error('Error publishing investment:', error);
        alert('حدث خطأ في نشر الفرصة الاستثمارية');
    }
};

// ========== عرض تفاصيل الفرصة الاستثمارية ==========

window.showInvestmentDetails = async function(investmentId) {
    try {
        const investmentDoc = await window.db.collection('investments').doc(investmentId).get();
        
        if (!investmentDoc.exists) {
            alert('الفرصة الاستثمارية غير موجودة');
            return;
        }

        const investment = investmentDoc.data();
        const posterDoc = await window.db.collection('users').doc(investment.userId).get();
        const poster = posterDoc.exists ? posterDoc.data() : null;

        // تحديث عدد المشاهدات
        await window.db.collection('investments').doc(investmentId).update({
            views: firebase.firestore.FieldValue.increment(1)
        });

        // عرض صفحة التفاصيل
        document.querySelector('.home-page').style.display = 'none';
        document.getElementById('investmentDetailsPage').style.display = 'block';

        const content = document.getElementById('investmentDetailsContent');
        const time = investment.createdAt ? new Date(investment.createdAt.seconds * 1000) : new Date();

        content.innerHTML = `
            <div class="detail-section">
                <h4><i class="fas fa-chart-line"></i> معلومات المشروع</h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">عنوان المشروع</span>
                        <span class="detail-value">${investment.title || 'غير محدد'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">مجال المشروع</span>
                        <span class="detail-value">${getInvestmentFieldText(investment.field)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">المحافظة</span>
                        <span class="detail-value">${investment.governorate || 'غير محدد'} ${investment.area ? `- ${investment.area}` : ''}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">رأس المال المطلوب</span>
                        <span class="detail-value">${formatCurrency(investment.capital)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">نسبة الربح المتوقعة</span>
                        <span class="detail-value">${investment.profit || 'غير محددة'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">مدة المشروع</span>
                        <span class="detail-value">${investment.duration || 'غير محددة'}</span>
                    </div>
                </div>
            </div>

            <div class="detail-section">
                <h4><i class="fas fa-align-left"></i> وصف المشروع</h4>
                <p>${investment.description || 'لا يوجد وصف'}</p>
            </div>

            <div class="detail-section">
                <h4><i class="fas fa-user"></i> معلومات صاحب المشروع</h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">الاسم</span>
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
                        <span class="detail-value">${investment.views || 0}</span>
                    </div>
                </div>
            </div>
        `;

        // تخزين معرف الفرصة للاستخدام لاحقاً
        window.currentInvestmentId = investmentId;
        window.currentPosterId = investment.userId;

    } catch (error) {
        console.error('Error showing investment details:', error);
        alert('حدث خطأ في عرض تفاصيل الفرصة الاستثمارية');
    }
};

// ========== إبداء الاهتمام بفرصة استثمارية ==========

window.expressInterest = async function() {
    if (!window.auth?.currentUser) {
        alert('الرجاء تسجيل الدخول أولاً');
        return;
    }

    if (!window.currentInvestmentId) return;

    try {
        // التحقق من عدم إبداء الاهتمام مسبقاً
        const existingInterests = await window.db.collection('interests')
            .where('investmentId', '==', window.currentInvestmentId)
            .where('userId', '==', window.auth.currentUser.uid)
            .get();

        if (!existingInterests.empty) {
            alert('لقد أبديت اهتمامك بهذه الفرصة مسبقاً');
            return;
        }

        // إنشاء سجل الاهتمام
        await window.db.collection('interests').add({
            investmentId: window.currentInvestmentId,
            userId: window.auth.currentUser.uid,
            ownerId: window.currentPosterId,
            status: 'pending',
            expressedAt: new Date(),
            updatedAt: new Date()
        });

        // تحديث عدد المهتمين
        await window.db.collection('investments').doc(window.currentInvestmentId).update({
            interests: firebase.firestore.FieldValue.increment(1)
        });

        alert('تم إبداء الاهتمام بالفرصة الاستثمارية بنجاح!');

        // فتح محادثة مع صاحب المشروع
        if (window.currentPosterId) {
            setTimeout(() => {
                window.openChat?.(window.currentPosterId);
            }, 1000);
        }

    } catch (error) {
        console.error('Error expressing interest:', error);
        alert('حدث خطأ في إبداء الاهتمام');
    }
};

// ========== دوال مساعدة ==========

function formatCurrency(amount) {
    if (!amount) return 'غير محدد';
    
    // إزالة الفواصل إن وجدت
    const num = amount.toString().replace(/,/g, '');
    
    if (isNaN(num)) return amount;
    
    // تنسيق الأرقام
    if (num >= 1000000000) {
        return (num / 1000000000).toFixed(1) + ' مليار د.ع';
    } else if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + ' مليون د.ع';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + ' ألف د.ع';
    }
    
    return num + ' د.ع';
}

function getInvestmentFieldText(field) {
    const fields = {
        'industrial': 'صناعي',
        'commercial': 'تجاري',
        'agricultural': 'زراعي',
        'service': 'خدماتي',
        'tech': 'تقني'
    };
    return fields[field] || 'غير محدد';
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
window.getInvestmentFieldText = getInvestmentFieldText;
window.formatCurrency = formatCurrency;

console.log('✅ investments.js جاهز');
