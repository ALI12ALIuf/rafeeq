// ========== captcha.js ==========
// نظام الكابتشا الكامل

// ========== متغيرات الكابتشا ==========
let _captchaCode = '';
let _captchaBlocked = false;
let _captchaActive = false;
let _captchaAttempts = 0;
let _pendingGoogleUser = null;
let _isLoggingIn = false;
let _captchaBlockTimer = null;
let _captchaCountdownTimer = null;
let _captchaRemainingSeconds = 0;

// ========== جدول الحظر التصاعدي ==========
function getBlockTime(totalAttempts) {
    if (totalAttempts <= 3) return 60;
    if (totalAttempts <= 6) return 180;
    if (totalAttempts <= 9) return 360;
    if (totalAttempts <= 12) return 900;
    if (totalAttempts <= 15) return 1800;
    if (totalAttempts <= 20) return 2400;
    if (totalAttempts <= 25) return 3600;
    if (totalAttempts <= 30) return 86400;
    return 86400;
}

// ========== توليد الكابتشا ==========
function generateCaptchaLocal() {
    _captchaCode = Math.floor(100000 + Math.random() * 900000).toString();
    return _captchaCode;
}

// ========== رسم الكابتشا على Canvas مع تشويش ==========
function drawCaptchaCanvas(code) {
    const canvas = document.getElementById('captchaCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, w, h);
    
    for (let i = 0; i < 100; i++) {
        ctx.fillStyle = `rgba(${Math.random()*200},${Math.random()*200},${Math.random()*200},0.4)`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    
    for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(0, Math.random() * h);
        ctx.bezierCurveTo(w/3, Math.random()*h, 2*w/3, Math.random()*h, w, Math.random()*h);
        ctx.strokeStyle = `rgba(${Math.random()*150},${Math.random()*150},${Math.random()*150},0.6)`;
        ctx.lineWidth = 1 + Math.random() * 2;
        ctx.stroke();
    }
    
    for (let i = 0; i < code.length; i++) {
        const x = 25 + (i * 42) + Math.random() * 6;
        const y = 35 + Math.random() * 12;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((Math.random() - 0.5) * 0.7);
        ctx.font = `bold ${32 + Math.random() * 8}px Arial`;
        ctx.fillStyle = `rgb(${20+Math.random()*100},${20+Math.random()*100},${20+Math.random()*100})`;
        ctx.fillText(code[i], 0, 0);
        ctx.restore();
    }
}

async function showCaptchaScreen(onSuccess) {
    _captchaActive = true;
    _captchaBlocked = false;
    _captchaAttempts = 0;
    const captchaCode = generateCaptchaLocal();
    
    const existing = document.querySelector('.captcha-screen');
    if (existing) existing.remove();
    
    const d = document.createElement('div');
    d.className = 'captcha-screen';
    d.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:10001;';
    d.innerHTML = `
        <div style="text-align:center;padding:25px;max-width:400px;width:90%;background:var(--card-bg);border-radius:20px;box-shadow:var(--shadow);">
            <div style="font-size:3.5rem;margin-bottom:0.5rem;">🔐</div>
            <p style="color:var(--primary);margin-bottom:1rem;font-size:1.1rem;font-weight:600;">أدخل الرمز الظاهر للمتابعة</p>
            
            <div style="display:flex;justify-content:center;margin-bottom:1.2rem;">
                <canvas id="captchaCanvas" width="280" height="60" style="border-radius:10px;border:1px solid var(--border);"></canvas>
            </div>
            
            <input type="text" name="hiddenField" style="position:absolute;left:-9999px;opacity:0;width:1px;height:1px;" autocomplete="off" tabindex="-1">
            
            <div style="display:flex;gap:8px;justify-content:center;margin-bottom:1.5rem;direction:ltr;">
                <input type="tel" maxlength="1" class="captcha-input" pattern="[0-9]" inputmode="numeric" style="width:40px;height:50px;text-align:center;font-size:1.4rem;font-weight:bold;border:2px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);direction:ltr;" oninput="handleCaptchaInput(this, 0)" onkeydown="handleCaptchaKeyDown(event, this, 0)" onpaste="handleCaptchaPaste(event)" autocomplete="off">
                <input type="tel" maxlength="1" class="captcha-input" pattern="[0-9]" inputmode="numeric" style="width:40px;height:50px;text-align:center;font-size:1.4rem;font-weight:bold;border:2px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);direction:ltr;" oninput="handleCaptchaInput(this, 1)" onkeydown="handleCaptchaKeyDown(event, this, 1)" autocomplete="off">
                <input type="tel" maxlength="1" class="captcha-input" pattern="[0-9]" inputmode="numeric" style="width:40px;height:50px;text-align:center;font-size:1.4rem;font-weight:bold;border:2px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);direction:ltr;" oninput="handleCaptchaInput(this, 2)" onkeydown="handleCaptchaKeyDown(event, this, 2)" autocomplete="off">
                <input type="tel" maxlength="1" class="captcha-input" pattern="[0-9]" inputmode="numeric" style="width:40px;height:50px;text-align:center;font-size:1.4rem;font-weight:bold;border:2px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);direction:ltr;" oninput="handleCaptchaInput(this, 3)" onkeydown="handleCaptchaKeyDown(event, this, 3)" autocomplete="off">
                <input type="tel" maxlength="1" class="captcha-input" pattern="[0-9]" inputmode="numeric" style="width:40px;height:50px;text-align:center;font-size:1.4rem;font-weight:bold;border:2px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);direction:ltr;" oninput="handleCaptchaInput(this, 4)" onkeydown="handleCaptchaKeyDown(event, this, 4)" autocomplete="off">
                <input type="tel" maxlength="1" class="captcha-input" pattern="[0-9]" inputmode="numeric" style="width:40px;height:50px;text-align:center;font-size:1.4rem;font-weight:bold;border:2px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);direction:ltr;" oninput="handleCaptchaInput(this, 5)" onkeydown="handleCaptchaKeyDown(event, this, 5)" autocomplete="off">
            </div>
            
            <p style="color:var(--danger);font-size:0.85rem;margin-bottom:1rem;min-height:20px;" id="captchaError"></p>
            
            <button onclick="verifyCaptcha()" style="background:var(--primary);color:white;border:none;border-radius:25px;padding:12px 40px;font-size:1.1rem;cursor:pointer;width:100%;" id="captchaVerifyBtn">تحقق</button>
            <button onclick="generateNewCaptcha()" style="background:none;border:none;color:var(--text-light);margin-top:0.8rem;cursor:pointer;font-size:0.9rem;" id="captchaRefreshBtn">رمز جديد</button>
        </div>`;
    document.body.appendChild(d);
    d._onSuccess = onSuccess;
    
    setTimeout(() => {
        drawCaptchaCanvas(captchaCode);
        const firstInput = document.querySelector('.captcha-input');
        if (firstInput) firstInput.focus();
    }, 300);
}

function resetInputs() {
    const inputs = document.querySelectorAll('.captcha-input');
    inputs.forEach(input => { input.value = ''; input.style.borderColor = 'var(--border)'; input.style.background = 'var(--bg)'; });
    inputs[0].focus();
}

function refreshCaptchaAndCanvas() {
    const code = generateCaptchaLocal();
    drawCaptchaCanvas(code);
    return code;
}

window.handleCaptchaInput = function(input, index) {
    input.value = input.value.replace(/\D/g, '');
    if (input.value.length === 1 && index < 5) {
        const inputs = document.querySelectorAll('.captcha-input');
        if (inputs[index + 1]) inputs[index + 1].focus();
    }
};

window.handleCaptchaKeyDown = function(event, input, index) {
    if (event.key === 'Backspace' && input.value === '' && index > 0) {
        const inputs = document.querySelectorAll('.captcha-input');
        if (inputs[index - 1]) { inputs[index - 1].focus(); inputs[index - 1].value = ''; }
    }
    if (event.key === 'Enter') { verifyCaptcha(); }
};

window.handleCaptchaPaste = function(event) {
    event.preventDefault();
    const paste = (event.clipboardData || window.clipboardData).getData('text');
    const digits = paste.replace(/\D/g, '').slice(0, 6);
    const inputs = document.querySelectorAll('.captcha-input');
    for (let i = 0; i < 6; i++) { inputs[i].value = digits[i] || ''; }
    if (digits.length === 6) { inputs[5].focus(); setTimeout(() => verifyCaptcha(), 200); }
};

// ========== عداد تنازلي ==========
function startCountdown(totalSeconds) {
    _captchaRemainingSeconds = totalSeconds;
    const errorEl = document.getElementById('captchaError');
    const verifyBtn = document.getElementById('captchaVerifyBtn');
    const refreshBtn = document.getElementById('captchaRefreshBtn');
    const inputs = document.querySelectorAll('.captcha-input');
    
    if (_captchaCountdownTimer) clearInterval(_captchaCountdownTimer);
    
    const updateCountdown = () => {
        if (_captchaRemainingSeconds <= 0) {
            clearInterval(_captchaCountdownTimer);
            _captchaCountdownTimer = null;
            _captchaBlocked = false;
            if (errorEl) { errorEl.textContent = ''; errorEl.style.color = 'var(--danger)'; }
            if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.style.opacity = '1'; }
            if (refreshBtn) { refreshBtn.style.opacity = '1'; refreshBtn.style.pointerEvents = 'auto'; }
            inputs.forEach(input => { input.disabled = false; input.style.opacity = '1'; });
            refreshCaptchaAndCanvas();
            resetInputs();
            return;
        }
        
        const hours = Math.floor(_captchaRemainingSeconds / 3600);
        const mins = Math.floor((_captchaRemainingSeconds % 3600) / 60);
        const secs = _captchaRemainingSeconds % 60;
        
        let timeStr;
        if (hours > 0) {
            timeStr = `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
        }
        
        if (errorEl) { errorEl.textContent = `تم تجاوز الحد الأقصى. انتظر ${timeStr}`; }
        _captchaRemainingSeconds--;
    };
    
    updateCountdown();
    _captchaCountdownTimer = setInterval(updateCountdown, 1000);
}

// ========== التحقق من الكابتشا ==========
window.verifyCaptcha = function() {
    if (_captchaBlocked) return;
    
    const honeypot = document.querySelector('input[name="hiddenField"]');
    if (honeypot && honeypot.value !== '') { return; }
    
    const inputs = document.querySelectorAll('.captcha-input');
    let enteredCode = '';
    inputs.forEach(input => { enteredCode += input.value; });
    
    const errorEl = document.getElementById('captchaError');
    const verifyBtn = document.getElementById('captchaVerifyBtn');
    const refreshBtn = document.getElementById('captchaRefreshBtn');
    
    if (enteredCode.length < 6) {
        if (errorEl) { errorEl.textContent = 'الرجاء إدخال 6 أرقام كاملة'; errorEl.style.color = 'var(--danger)'; }
        return;
    }
    
    const randomDelay = 200 + Math.floor(Math.random() * 400);
    
    setTimeout(() => {
        if (enteredCode === _captchaCode) {
            _captchaActive = false;
            _captchaBlocked = false;
            _captchaAttempts = 0;
            if (_captchaBlockTimer) { clearTimeout(_captchaBlockTimer); _captchaBlockTimer = null; }
            if (_captchaCountdownTimer) { clearInterval(_captchaCountdownTimer); _captchaCountdownTimer = null; }
            sessionStorage.setItem('_captchaVerified', 'true');
            localStorage.removeItem('_captchaTotalAttempts');
            const captchaScreen = document.querySelector('.captcha-screen');
            if (captchaScreen) {
                inputs.forEach(input => { input.style.borderColor = '#4CAF50'; input.style.background = 'rgba(76,175,80,0.2)'; });
                const onSuccess = captchaScreen._onSuccess;
                captchaScreen.remove();
                if (onSuccess) onSuccess();
            }
        } else {
            _captchaAttempts++;
            
            let totalAttempts = parseInt(localStorage.getItem('_captchaTotalAttempts') || '0');
            totalAttempts++;
            localStorage.setItem('_captchaTotalAttempts', totalAttempts.toString());
            
            for (let i = 0; i < 6; i++) {
                if (inputs[i].value !== _captchaCode[i]) {
                    inputs[i].style.borderColor = '#f44336';
                    inputs[i].style.background = 'rgba(244,67,54,0.2)';
                }
            }
            
            if (_captchaAttempts >= 3) {
                _captchaBlocked = true;
                _captchaAttempts = 0;
                
                if (verifyBtn) { verifyBtn.disabled = true; verifyBtn.style.opacity = '0.5'; }
                if (refreshBtn) { refreshBtn.style.opacity = '0.5'; refreshBtn.style.pointerEvents = 'none'; }
                inputs.forEach(input => { input.disabled = true; input.style.opacity = '0.5'; });
                
                const blockSeconds = getBlockTime(totalAttempts);
                
                if (_captchaBlockTimer) clearTimeout(_captchaBlockTimer);
                _captchaBlockTimer = setTimeout(() => {
                    _captchaBlocked = false;
                    if (errorEl) { errorEl.textContent = ''; }
                    if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.style.opacity = '1'; }
                    if (refreshBtn) { refreshBtn.style.opacity = '1'; refreshBtn.style.pointerEvents = 'auto'; }
                    inputs.forEach(input => { input.disabled = false; input.style.opacity = '1'; });
                    refreshCaptchaAndCanvas();
                    resetInputs();
                    _captchaBlockTimer = null;
                }, blockSeconds * 1000);
                
                startCountdown(blockSeconds);
                
            } else {
                const remaining = 3 - _captchaAttempts;
                if (errorEl) { errorEl.textContent = `رمز غير صحيح. متبقي ${remaining} محاولات`; errorEl.style.color = 'var(--danger)'; }
                setTimeout(() => {
                    refreshCaptchaAndCanvas();
                    resetInputs();
                }, 800);
            }
        }
    }, randomDelay);
};

window.generateNewCaptcha = function() {
    if (_captchaBlocked) return;
    refreshCaptchaAndCanvas();
    const errorEl = document.getElementById('captchaError');
    if (errorEl) { errorEl.textContent = ''; }
    _captchaAttempts = 0;
    resetInputs();
};
