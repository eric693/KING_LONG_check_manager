// 生物辨識（WebAuthn）快速打卡：支援度偵測、註冊、驗證與重置
// 從 script.js 拆出。實際的打卡動作仍由 script.js 的 doPunch() 執行。

// ==================== 生物辨識快速打卡功能 ====================

/**
 * 檢查瀏覽器是否支援 WebAuthn
 */
function checkBiometricSupport() {
    // WebAuthn 只在 HTTPS（或 localhost）下可用，http 頁面連 API 都不會出現
    return window.isSecureContext !== false &&
           window.PublicKeyCredential !== undefined && 
           navigator.credentials !== undefined;
}

/**
 * 這台裝置是否真的有內建的生物辨識可用。
 * 只看 PublicKeyCredential 存不存在是不夠的：LINE 內建瀏覽器、
 * 沒有 Windows Hello 的桌機都有這個 API，但實際呼叫一定失敗。
 */
async function checkPlatformAuthenticator() {
    if (!checkBiometricSupport()) return false;
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return false;
    try {
        return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch (e) {
        console.warn('平台驗證器偵測失敗:', e);
        return false;
    }
}

/**
 * credential.id 是 base64url（用 - _ 且不補 =），atob 只吃標準 base64，
 * 直接丟進去會在含 - 或 _ 的憑證上拋 InvalidCharacterError。
 */
function base64urlToBytes(value) {
    const b64 = value.replace(/-/g, '+').replace(/_/g, '/')
        .padEnd(Math.ceil(value.length / 4) * 4, '=');
    const raw = atob(b64);
    return Uint8Array.from(raw, c => c.charCodeAt(0));
}

/**
 * 初始化生物辨識打卡功能
 */
async function initBiometricPunch() {
    const setupBtn = document.getElementById('setup-biometric-btn');
    const biometricInBtn = document.getElementById('biometric-punch-in-btn');
    const biometricOutBtn = document.getElementById('biometric-punch-out-btn');
    const notSetupStatus = document.getElementById('biometric-not-setup');
    const readyStatus = document.getElementById('biometric-ready');
    const biometricButtons = document.getElementById('biometric-punch-buttons');
    
    if (!setupBtn) return;
    
    // 檢查支援度：先看 API，再確認裝置真的有可用的生物辨識
    if (!checkBiometricSupport()) {
        setupBtn.textContent = t('BIO_UNSUPPORTED_BROWSER');
        setupBtn.disabled = true;
        setupBtn.classList.add('opacity-50', 'cursor-not-allowed');
        return;
    }
    
    if (!await checkPlatformAuthenticator()) {
        setupBtn.textContent = t('BIO_NO_AUTHENTICATOR');
        setupBtn.disabled = true;
        setupBtn.classList.add('opacity-50', 'cursor-not-allowed');
        setupBtn.title = t('BIO_NO_AUTHENTICATOR_HINT');
        return;
    }
    
    // 檢查是否已設定
    const credentialId = localStorage.getItem('biometric_credential_id');
    if (credentialId) {
        setupBtn.classList.add('hidden');
        biometricButtons.classList.remove('hidden');
        notSetupStatus.classList.add('hidden');
        readyStatus.classList.remove('hidden');
    }
    
    // 設定生物辨識
    setupBtn.addEventListener('click', async () => {
        try {
            showNotification(t('NOTIF_BIO_VERIFY_PROMPT'), 'info');
            
            const userId = localStorage.getItem('sessionUserId');
            if (!userId) {
                showNotification(t('NOTIF_LOGIN_REQUIRED'), 'error');
                return;
            }
            
            // 建立 credential
            const credential = await registerBiometric(userId);
            
            if (credential) {
                // 儲存 credential ID
                localStorage.setItem('biometric_credential_id', credential.id);
                localStorage.setItem('biometric_user_id', userId);
                
                // 更新 UI
                setupBtn.classList.add('hidden');
                biometricButtons.classList.remove('hidden');
                notSetupStatus.classList.add('hidden');
                readyStatus.classList.remove('hidden');
                
                showNotification(t('NOTIF_BIO_SETUP_OK'), 'success');
            }
            
        } catch (error) {
            console.error('生物辨識設定失敗:', error);
            
            if (error.name === 'NotAllowedError') {
                showNotification(t('NOTIF_BIO_SETUP_CANCELLED'), 'warning');
            } else if (error.name === 'InvalidStateError') {
                showNotification(t('NOTIF_BIO_ALREADY_REGISTERED'), 'warning');
            } else if (error.name === 'NotSupportedError' || error.name === 'SecurityError') {
                showNotification(t('NOTIF_BIO_BROWSER_UNSUPPORTED'), 'error');
            } else {
                showNotification(t('NOTIF_SETUP_FAILED'), 'error');
            }
        }
    });
    
    // 生物辨識上班打卡
    if (biometricInBtn) {
        biometricInBtn.addEventListener('click', () => biometricPunch('上班'));
    }
    
    // 生物辨識下班打卡
    if (biometricOutBtn) {
        biometricOutBtn.addEventListener('click', () => biometricPunch('下班'));
    }
}

/**
 * 註冊生物辨識
 */
async function registerBiometric(userId) {
    try {
        // 產生隨機 challenge
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        
        const publicKeyCredentialCreationOptions = {
            challenge: challenge,
            rp: {
                name: "出勤管家",
                id: window.location.hostname
            },
            user: {
                id: Uint8Array.from(userId, c => c.charCodeAt(0)),
                name: userId,
                displayName: document.getElementById('user-name')?.textContent || userId
            },
            pubKeyCredParams: [
                { alg: -7, type: "public-key" },  // ES256
                { alg: -257, type: "public-key" } // RS256
            ],
            authenticatorSelection: {
                authenticatorAttachment: "platform", // 使用裝置內建的生物辨識
                userVerification: "required"
            },
            timeout: 60000,
            attestation: "none"
        };
        
        const credential = await navigator.credentials.create({
            publicKey: publicKeyCredentialCreationOptions
        });
        
        return credential;
        
    } catch (error) {
        console.error('註冊失敗:', error);
        throw error;
    }
}

/**
 * 使用生物辨識進行打卡
 */
async function biometricPunch(type) {
    // 驗證期間鎖住兩顆按鈕，避免使用者連按造成重複打卡
    const bioBtns = [
        document.getElementById('biometric-punch-in-btn'),
        document.getElementById('biometric-punch-out-btn')
    ].filter(Boolean);
    const lockButtons = (locked) => bioBtns.forEach(b => {
        b.disabled = locked;
        b.classList.toggle('opacity-50', locked);
        b.classList.toggle('cursor-not-allowed', locked);
    });
    
    if (bioBtns.some(b => b.disabled)) return;
    lockButtons(true);
    
    try {
        const credentialId = localStorage.getItem('biometric_credential_id');
        const storedUserId = localStorage.getItem('biometric_user_id');
        const currentUserId = localStorage.getItem('sessionUserId');
        
        if (!credentialId || storedUserId !== currentUserId) {
            showNotification(t('NOTIF_BIO_SETUP_AGAIN'), 'error');
            return;
        }
        
        showNotification(t('NOTIF_BIO_VERIFY_PROMPT'), 'info');
        
        // 驗證生物辨識
        const verified = await verifyBiometric(credentialId);
        
        if (verified) {
            // 驗證成功，執行打卡
            await doPunch(type);
        } else {
            showNotification(t('NOTIF_VERIFY_FAILED'), 'error');
        }
        
    } catch (error) {
        console.error('生物辨識打卡失敗:', error);
        
        if (error.name === 'NotAllowedError') {
            // 使用者取消，或憑證已經不在這台裝置上（換網域、清除瀏覽器資料）
            showNotification(t('NOTIF_VERIFY_NOT_PASSED'), 'warning');
        } else if (error.name === 'InvalidCharacterError' || error.name === 'InvalidStateError') {
            // 憑證資料已經不能用，直接清掉讓使用者重新設定
            console.warn('憑證失效，重置生物辨識設定');
            resetBiometric();
            showNotification(t('NOTIF_BIO_CREDENTIAL_INVALID'), 'error');
        } else {
            showNotification(t('NOTIF_VERIFY_FAILED_USE_NORMAL'), 'error');
        }
    } finally {
        lockButtons(false);
    }
}

/**
 * 驗證生物辨識
 */
async function verifyBiometric(credentialId) {
    try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        
        const publicKeyCredentialRequestOptions = {
            challenge: challenge,
            allowCredentials: [{
                id: base64urlToBytes(credentialId),
                type: 'public-key'
            }],
            timeout: 60000,
            userVerification: "required"
        };
        
        const assertion = await navigator.credentials.get({
            publicKey: publicKeyCredentialRequestOptions
        });
        
        return !!assertion;
        
    } catch (error) {
        console.error('驗證失敗:', error);
        throw error;
    }
}

/**
 * 重置生物辨識設定
 */
function resetBiometric() {
    localStorage.removeItem('biometric_credential_id');
    localStorage.removeItem('biometric_user_id');
    
    const setupBtn = document.getElementById('setup-biometric-btn');
    const biometricButtons = document.getElementById('biometric-punch-buttons');
    const notSetupStatus = document.getElementById('biometric-not-setup');
    const readyStatus = document.getElementById('biometric-ready');
    
    if (setupBtn) setupBtn.classList.remove('hidden');
    if (biometricButtons) biometricButtons.classList.add('hidden');
    if (notSetupStatus) notSetupStatus.classList.remove('hidden');
    if (readyStatus) readyStatus.classList.add('hidden');
    
    showNotification(t('NOTIF_BIO_RESET'), 'success');
}
