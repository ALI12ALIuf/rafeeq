// ==================== نظام الرمز (المستخدم يحدده بنفسه) ==================

const PINSystem = {
    // التحقق إذا كان المستخدم لديه رمز من قبل
    hasPIN() {
        return localStorage.getItem('hasPIN') === 'true';
    },
    
    // التحقق من صحة الرمز (أحرف إنجليزية + أرقام فقط)
    isValidPIN(pin) {
        const regex = /^[A-Za-z0-9]+$/;
        return regex.test(pin) && pin.length >= 4 && pin.length <= 20;
    },
    
    // عرض شاشة إنشاء الرمز (تظهر بعد CAPTCHA)
    showCreatePINModal() {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.95);
                z-index: 20000;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: system-ui, sans-serif;
            `;
            
            modal.innerHTML = `
                <div style="background: #0a0e27; border-radius: 30px; padding: 40px; width: 400px; max-width: 90%; text-align: center; border: 2px solid #4CAF50;">
                    <div style="font-size: 3rem; margin-bottom: 10px;">🔐</div>
                    <h2 style="color: white; margin-bottom: 10px;">إنشاء رمز الحماية</h2>
                    <p style="color: #aaa; font-size: 0.8rem; margin-bottom: 20px;">أدخل رمزاً لحماية مفتاحك الخاص<br>(أحرف إنجليزية وأرقام فقط)</p>
                    
                    <div style="margin-bottom: 15px;">
                        <input type="text" id="pinInput" maxlength="20" placeholder="مثال: mySecret123" style="width: 100%; padding: 15px; border-radius: 25px; border: 2px solid #4CAF50; background: #1a1a2e; color: white; text-align: center; font-size: 1.1rem; font-family: monospace;" dir="ltr">
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <input type="text" id="confirmPinInput" maxlength="20" placeholder="تأكيد الرمز" style="width: 100%; padding: 15px; border-radius: 25px; border: 2px solid #4CAF50; background: #1a1a2e; color: white; text-align: center; font-size: 1.1rem; font-family: monospace;" dir="ltr">
                    </div>
                    
                    <div style="color: #f44336; font-size: 0.7rem; margin-bottom: 10px; display: none;" id="pinError">⚠️ الرمز غير صالح (أحرف إنجليزية وأرقام فقط)</div>
                    <div style="color: #f44336; font-size: 0.7rem; margin-bottom: 10px; display: none;" id="matchError">⚠️ الرمز غير متطابق</div>
                    
                    <button id="savePINBtn" style="background: #4CAF50; border: none; padding: 14px; border-radius: 25px; color: white; cursor: pointer; font-size: 1rem; width: 100%;">✅ حفظ الرمز</button>
                    
                    <p style="color: #888; font-size: 0.7rem; margin-top: 15px;">⚠️ تحذير: إذا فقدت هذا الرمز، ستفقد جميع رسائلك المشفرة!</p>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            const pinInput = document.getElementById('pinInput');
            const confirmInput = document.getElementById('confirmPinInput');
            const pinError = document.getElementById('pinError');
            const matchError = document.getElementById('matchError');
            
            const validatePIN = () => {
                const pin = pinInput.value;
                if (!this.isValidPIN(pin) && pin.length > 0) {
                    pinError.style.display = 'block';
                    return false;
                }
                pinError.style.display = 'none';
                return true;
            };
            
            pinInput.oninput = validatePIN;
            
            document.getElementById('savePINBtn').onclick = async () => {
                const pin = pinInput.value;
                const confirm = confirmInput.value;
                
                if (!this.isValidPIN(pin)) {
                    pinError.style.display = 'block';
                    return;
                }
                
                if (pin !== confirm) {
                    matchError.style.display = 'block';
                    return;
                }
                
                // تشفير المفتاح الخاص بالرمز
                await this.encryptPrivateKeyWithPIN(pin);
                
                localStorage.setItem('hasPIN', 'true');
                modal.remove();
                alert('✅ تم إنشاء الرمز وتشفير المفتاح بنجاح');
                resolve(true);
            };
            
            pinInput.focus();
        });
    },
    
    // عرض شاشة إدخال الرمز (تظهر بعد CAPTCHA عند كل فتح)
    showVerifyPINModal() {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.95);
                z-index: 20000;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: system-ui, sans-serif;
            `;
            
            modal.innerHTML = `
                <div style="background: #0a0e27; border-radius: 30px; padding: 40px; width: 400px; max-width: 90%; text-align: center; border: 2px solid #4CAF50;">
                    <div style="font-size: 3rem; margin-bottom: 10px;">🔐</div>
                    <h2 style="color: white; margin-bottom: 10px;">أدخل رمز الحماية</h2>
                    <p style="color: #aaa; font-size: 0.8rem; margin-bottom: 20px;">أدخل الرمز الذي أنشأته سابقاً</p>
                    
                    <div style="margin-bottom: 20px;">
                        <input type="text" id="pinInput" maxlength="20" placeholder="أدخل الرمز" style="width: 100%; padding: 15px; border-radius: 25px; border: 2px solid #4CAF50; background: #1a1a2e; color: white; text-align: center; font-size: 1.1rem; font-family: monospace;" dir="ltr">
                    </div>
                    
                    <button id="verifyBtn" style="background: #4CAF50; border: none; padding: 14px; border-radius: 25px; color: white; cursor: pointer; font-size: 1rem; width: 100%;">🔓 فك التشفير</button>
                    
                    <div style="color: #f44336; font-size: 0.7rem; margin-top: 15px; display: none;" id="pinError">⚠️ الرمز غير صحيح</div>
                    <p style="color: #888; font-size: 0.7rem; margin-top: 10px;">إذا نسيت الرمز، ستفقد جميع رسائلك المشفرة</p>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            const pinInput = document.getElementById('pinInput');
            const errorDiv = document.getElementById('pinError');
            
            document.getElementById('verifyBtn').onclick = async () => {
                const enteredPIN = pinInput.value;
                const success = await this.decryptPrivateKeyWithPIN(enteredPIN);
                
                if (success) {
                    modal.remove();
                    resolve(true);
                } else {
                    errorDiv.style.display = 'block';
                    pinInput.value = '';
                    resolve(false);
                }
            };
            
            pinInput.onkeypress = (e) => {
                if (e.key === 'Enter') {
                    document.getElementById('verifyBtn').click();
                }
            };
            
            pinInput.focus();
        });
    },
    
    // تشفير المفتاح الخاص بالرمز
    async encryptPrivateKeyWithPIN(pin) {
        const privateKey = localStorage.getItem('privateKey');
        if (!privateKey) return;
        
        const encoder = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        
        const baseKey = await crypto.subtle.importKey(
            'raw',
            encoder.encode(pin),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        
        const derivedKey = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
            baseKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt']
        );
        
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            derivedKey,
            encoder.encode(privateKey)
        );
        
        localStorage.setItem('encryptedPrivateKey', JSON.stringify({
            data: Array.from(new Uint8Array(encrypted)),
            salt: Array.from(salt),
            iv: Array.from(iv)
        }));
        
        localStorage.removeItem('privateKey');
    },
    
    // فك تشفير المفتاح الخاص بالرمز
    async decryptPrivateKeyWithPIN(pin) {
        const encryptedData = JSON.parse(localStorage.getItem('encryptedPrivateKey'));
        if (!encryptedData) return false;
        
        try {
            const encoder = new TextEncoder();
            const baseKey = await crypto.subtle.importKey(
                'raw',
                encoder.encode(pin),
                'PBKDF2',
                false,
                ['deriveKey']
            );
            
            const derivedKey = await crypto.subtle.deriveKey(
                { name: 'PBKDF2', salt: new Uint8Array(encryptedData.salt), iterations: 100000, hash: 'SHA-256' },
                baseKey,
                { name: 'AES-GCM', length: 256 },
                false,
                ['decrypt']
            );
            
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: new Uint8Array(encryptedData.iv) },
                derivedKey,
                new Uint8Array(encryptedData.data)
            );
            
            const privateKey = new TextDecoder().decode(decrypted);
            localStorage.setItem('privateKey', privateKey);
            return true;
        } catch(e) {
            return false;
        }
    },
    
    // تهيئة النظام (تُستدعى بعد CAPTCHA)
    async init() {
        // إذا كان هناك مفتاح مشفر ولا يوجد مفتاح في الذاكرة
        if (localStorage.getItem('encryptedPrivateKey') && !localStorage.getItem('privateKey')) {
            const success = await this.showVerifyPINModal();
            if (!success) {
                alert('❌ الرمز غير صحيح. لن تتمكن من قراءة رسائلك');
                return false;
            }
        }
        // إذا كان هناك مفتاح عادي ولا يوجد رمز
        else if (localStorage.getItem('privateKey') && !this.hasPIN()) {
            await this.showCreatePINModal();
        }
        
        return true;
    }
};
