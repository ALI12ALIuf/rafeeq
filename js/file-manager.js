// ========== file-manager.js ==========
// نظام إدارة الملفات (يعمل في الذاكرة فقط - للخصوصية)

const FileManager = {
    _files: new Map(),    // ✅ بيانات الملفات (metadata)
    _blobs: new Map(),    // ✅ تخزين Blob بشكل منفصل
    _maxFiles: 50,
    
    // ✅ حفظ Blob (للتحميل) مع dataUrl للعرض
    saveBlob(id, blob, metadata) {
        if (!blob) {
            console.error('❌ Blob غير صالح:', id);
            return false;
        }
        
        // إذا تجاوز العدد، نحذف أقدم ملف
        if (this._blobs.size >= this._maxFiles) {
            const oldestKey = this._blobs.keys().next().value;
            this._blobs.delete(oldestKey);
            this._files.delete(oldestKey);
            console.log(`🗑️ تم حذف أقدم ملف: ${oldestKey}`);
        }
        
        this._blobs.set(id, blob);
        this._files.set(id, {
            fileName: metadata.fileName || 'ملف',
            type: metadata.type || 'file',
            sender: metadata.sender || 'friend',
            time: metadata.time || new Date().toISOString(),
            dataUrl: metadata.dataUrl || null  // ✅ إضافة dataUrl
        });
        
        console.log(`💾 تم حفظ Blob: ${id} (${(blob.size / 1024).toFixed(1)} KB) مع dataUrl`);
        return true;
    },
    
    // ✅ استرجاع Blob
    getBlob(id) {
        const blob = this._blobs.get(id);
        if (blob) {
            console.log(`📂 استرجاع Blob: ${id} (${(blob.size / 1024).toFixed(1)} KB)`);
            return blob;
        }
        console.warn(`⚠️ Blob غير موجود: ${id}`);
        return null;
    },
    
    // ✅ استرجاع بيانات الملف (metadata)
    getFile(id) {
        const file = this._files.get(id);
        if (file) {
            return file;
        }
        console.warn(`⚠️ الملف غير موجود: ${id}`);
        return null;
    },
    
    // ✅ الحصول على dataUrl (للتوافق مع الإصدارات القديمة)
    getFileDataUrl(id) {
        const file = this._files.get(id);
        if (file && file.dataUrl) {
            return file.dataUrl;
        }
        console.warn(`⚠️ لا توجد dataUrl للملف: ${id}`);
        return null;
    },
    
    // ✅ التحقق من وجود ملف
    hasFile(id) {
        return this._files.has(id);
    },
    
    // ✅ حذف ملف
    deleteFile(id) {
        this._blobs.delete(id);
        this._files.delete(id);
        console.log(`🗑️ تم حذف الملف: ${id}`);
        return true;
    },
    
    // ✅ حذف جميع الملفات
    clearAll() {
        const count = this._files.size;
        this._files.clear();
        this._blobs.clear();
        console.log(`🗑️ تم حذف ${count} ملف من الذاكرة (بما فيها Blob)`);
        return count;
    },
    
    // ✅ الحصول على حجم جميع الملفات
    getTotalSize() {
        let total = 0;
        for (const [id, blob] of this._blobs) {
            total += blob.size;
        }
        return total;
    }
};

window.FileManager = FileManager;
console.log('✅ FileManager جاهز (يدعم Blob + dataUrl)');
