from pathlib import Path
from datetime import datetime
import shutil
import sys

p = Path("index.html")
s = p.read_text(encoding="utf-8")

def replace_once(old, new, label):
    global s
    count = s.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    s = s.replace(old, new, 1)
    print("PATCHED:", label)

# Prevent accidental double patch
if "function hasActiveAdAccess()" in s:
    raise RuntimeError("Ad Access patch already exists. No changes made.")

backup = Path(
    f"index.html.backup_free_ads_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
)
shutil.copy2(p, backup)
print("BACKUP:", backup)

# 1. Admin Dashboard UI
replace_once(
'''                <div class="admin-section">
                    <h4><i class="fas fa-coins"></i> Manage Coins</h4>''',
'''                <div class="admin-section" id="adminAdAccessSection">
                    <h4>🔐 Ads Free Test Access</h4>
                    <div class="admin-hint">
                        User Email ဖြင့် Free Ads Access 15 ရက် ပေးနိုင်သည်။
                        သက်တမ်းကုန်လျှင် Ads အလိုအလျောက် Lock ဖြစ်မည်။
                    </div>
                    <input type="email" id="adminAdAccessEmail"
                        placeholder="User Email"
                        style="width:100%;margin:8px 0;">
                    <div class="admin-row">
                        <button class="btn-sm mint"
                            onclick="adminGrantAdAccess()" style="flex:1;">
                            🎁 Grant Free 15 Days
                        </button>
                        <button class="btn-sm red"
                            onclick="adminRevokeAdAccess()" style="flex:1;">
                            🔒 Revoke
                        </button>
                    </div>
                    <div id="adminAdAccessMsg"
                        style="font-size:12px;margin-top:8px;"></div>
                </div>

                <div class="admin-section">
                    <h4><i class="fas fa-coins"></i> Manage Coins</h4>''',
"Admin Access UI"
)

# 2. Global state
replace_once(
"let isAdPlaying = false;",
"""let isAdPlaying = false;

let adAccessData = null;
let adAccessLoaded = false;
let adAccessUnsubscribe = null;
let adAccessCountdownTimer = null;
let adAccessWasActive = false;""",
"Access global state"
)

# 3. Access functions before flushPendingAdRewards
anchor = "async function flushPendingAdRewards(force = false) {"
access_functions = r"""
function getAdAccessExpiryMillis() {
    const value = adAccessData && adAccessData.expiresAt;
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    return 0;
}

function hasActiveAdAccess() {
    return !!(
        adAccessLoaded &&
        adAccessData &&
        adAccessData.active === true &&
        getAdAccessExpiryMillis() > Date.now()
    );
}

function updateAdAccessCountdownText() {
    const el = document.getElementById('adAccessCountdown');
    if (!el) return;

    if (!hasActiveAdAccess()) {
        el.textContent = '🔒 Ads Access သက်တမ်းကုန်ဆုံးသွားပါပြီ';
        return;
    }

    const remaining = Math.max(0, getAdAccessExpiryMillis() - Date.now());
    const days = Math.floor(remaining / 86400000);
    const hours = Math.floor((remaining % 86400000) / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);

    el.textContent =
        `🎁 Free Ads Access ကျန်ချိန်: ${days} ရက် ${hours} နာရီ ${minutes} မိနစ် ${seconds} စက္ကန့်`;
}

function clearAdAccessState() {
    if (adAccessUnsubscribe) {
        adAccessUnsubscribe();
        adAccessUnsubscribe = null;
    }

    if (adAccessCountdownTimer) {
        clearInterval(adAccessCountdownTimer);
        adAccessCountdownTimer = null;
    }

    adAccessData = null;
    adAccessLoaded = false;
    adAccessWasActive = false;

    if (isAdPlaying) closeAdPageAndReturn();
}

async function loadAdAccess(uid) {
    clearAdAccessState();
    renderAdCards();

    return await new Promise(resolve => {
        let first = true;

        adAccessUnsubscribe = db.collection('adAccess').doc(uid)
            .onSnapshot(doc => {
                if (!currentUser || currentUser.uid !== uid) return;

                const wasActive = hasActiveAdAccess();
                adAccessData = doc.exists ? doc.data() : null;
                adAccessLoaded = true;

                const active = hasActiveAdAccess();

                if (wasActive && !active && isAdPlaying) {
                    closeAdPageAndReturn();
                }

                adAccessWasActive = active;
                renderAdCards();
                updateDailyAdsProgressUI();

                if (first) {
                    first = false;
                    resolve(true);
                }
            }, error => {
                console.error('AD ACCESS LOAD FAILED:', error);
                adAccessData = null;
                adAccessLoaded = false;
                renderAdCards();
                updateDailyAdsProgressUI();

                if (first) {
                    first = false;
                    resolve(false);
                }
            });
    }).then(result => {
        if (adAccessCountdownTimer) clearInterval(adAccessCountdownTimer);

        adAccessCountdownTimer = setInterval(() => {
            const active = hasActiveAdAccess();

            if (adAccessWasActive && !active) {
                adAccessWasActive = false;
                if (isAdPlaying) closeAdPageAndReturn();
                renderAdCards();
                updateDailyAdsProgressUI();
            }

            updateAdAccessCountdownText();
        }, 1000);

        return result;
    });
}

async function findAdAccessUserByEmail(email) {
    const snap = await db.collection('users')
        .where('email', '==', email)
        .limit(1)
        .get();

    if (snap.empty) throw new Error('USER_NOT_FOUND');
    return snap.docs[0];
}

async function adminGrantAdAccess() {
    if (!isAdmin || !auth.currentUser) {
        showToast('❌ Admin permission required', 'error');
        return;
    }

    const input = document.getElementById('adminAdAccessEmail');
    const msg = document.getElementById('adminAdAccessMsg');
    const email = input ? input.value.trim() : '';

    if (!email) {
        if (msg) msg.textContent = 'User Email ထည့်ပါ။';
        return;
    }

    try {
        if (msg) msg.textContent = 'စစ်ဆေးနေပါသည်...';

        const target = await findAdAccessUserByEmail(email);
        const expiresAt = firebase.firestore.Timestamp.fromDate(
            new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
        );

        await db.collection('adAccess').doc(target.id).set({
            active: true,
            status: 'active',
            email: email,
            grantedAt: firebase.firestore.FieldValue.serverTimestamp(),
            expiresAt: expiresAt,
            grantedBy: auth.currentUser.uid,
            durationDays: 15
        });

        if (msg) msg.textContent = '✅ Free Ads Access 15 ရက် ပေးပြီးပါပြီ။';
        showToast('✅ Free 15 Days Access Granted', 'success');
    } catch (e) {
        console.error('GRANT ACCESS FAILED:', e);
        const message = e.code === 'permission-denied'
            ? 'Firestore Permission မရပါ။ Admin UID နှင့် Rules ကိုစစ်ပါ။'
            : e.message === 'USER_NOT_FOUND'
                ? 'ဒီ Email နဲ့ User မတွေ့ပါ။'
                : (e.message || 'Access ပေးမရပါ။');

        if (msg) msg.textContent = '❌ ' + message;
        showToast('❌ ' + message, 'error');
    }
}

async function adminRevokeAdAccess() {
    if (!isAdmin || !auth.currentUser) {
        showToast('❌ Admin permission required', 'error');
        return;
    }

    const input = document.getElementById('adminAdAccessEmail');
    const msg = document.getElementById('adminAdAccessMsg');
    const email = input ? input.value.trim() : '';

    if (!email) {
        if (msg) msg.textContent = 'User Email ထည့်ပါ။';
        return;
    }

    try {
        if (msg) msg.textContent = 'စစ်ဆေးနေပါသည်...';

        const target = await findAdAccessUserByEmail(email);

        await db.collection('adAccess').doc(target.id).set({
            active: false,
            status: 'revoked',
            email: email,
            revokedAt: firebase.firestore.FieldValue.serverTimestamp(),
            revokedBy: auth.currentUser.uid
        }, { merge: true });

        if (msg) msg.textContent = '🔒 Ads Access ပြန်ရုပ်သိမ်းပြီးပါပြီ။';
        showToast('🔒 Ads Access Revoked', 'success');
    } catch (e) {
        console.error('REVOKE ACCESS FAILED:', e);
        const message = e.code === 'permission-denied'
            ? 'Firestore Permission မရပါ။ Admin UID နှင့် Rules ကိုစစ်ပါ။'
            : e.message === 'USER_NOT_FOUND'
                ? 'ဒီ Email နဲ့ User မတွေ့ပါ။'
                : (e.message || 'Access ပြန်ရုပ်သိမ်းမရပါ။');

        if (msg) msg.textContent = '❌ ' + message;
        showToast('❌ ' + message, 'error');
    }
}

"""
replace_once(anchor, access_functions + anchor, "Access helper functions")

# 4. Pending reward sync guard
replace_once(
"""async function flushPendingAdRewards(force = false) {
    if (!currentUser || _adRewardFlushPromise) return false;""",
"""async function flushPendingAdRewards(force = false) {
    if (!currentUser || !hasActiveAdAccess() || _adRewardFlushPromise) return false;""",
"Pending reward access guard"
)

# 5. Daily reward guard
replace_once(
"""async function claimDailyAdsReward() {
    if(!currentUser)return;""",
"""async function claimDailyAdsReward() {
    if(!currentUser)return;
    if (!hasActiveAdAccess()) {
        showToast('🔒 Ads Free Access မရှိသေးပါ။', 'error');
        return;
    }""",
"Daily reward access guard"
)

# 6. Daily reward button lock
replace_once(
"""    const btn=document.getElementById('dailyAdsClaimBtn'); if(btn){btn.disabled=!!claimed||count<DAILY_AD_TARGET;btn.textContent=claimed?'✅ Claimed':count>=DAILY_AD_TARGET?'🎁 Claim Coin':'🔒 Claim';btn.style.background=claimed?'#0f9f72':count>=DAILY_AD_TARGET?'linear-gradient(135deg,#27d7a1,#0f9f72)':'#6b7280';}
    const status=document.getElementById('dailyAdsClaimStatus'); if(status)status.textContent=claimed?'ယနေ့ Daily Reward ရယူပြီးပါပြီ။ မနက်ဖြန် ပြန်စနိုင်ပါမည်။':`${Math.max(0,DAILY_AD_TARGET-count)} Ads ကျန်ပါသည်။`;""",
"""    const access = hasActiveAdAccess();
    const btn=document.getElementById('dailyAdsClaimBtn');
    if(btn){
        btn.disabled=!access||!!claimed||count<DAILY_AD_TARGET;
        btn.textContent=!access?'🔒 Access လိုအပ်သည်':claimed?'✅ Claimed':count>=DAILY_AD_TARGET?'🎁 Claim Coin':'🔒 Claim';
        btn.style.background=claimed?'#0f9f72':access&&count>=DAILY_AD_TARGET?'linear-gradient(135deg,#27d7a1,#0f9f72)':'#6b7280';
    }
    const status=document.getElementById('dailyAdsClaimStatus');
    if(status) status.textContent=!access?'🔒 Ads Free Access မရှိသေးပါ။':claimed?'ယနေ့ Daily Reward ရယူပြီးပါပြီ။ မနက်ဖြန် ပြန်စနိုင်ပါမည်。':`${Math.max(0,DAILY_AD_TARGET-count)} Ads ကျန်ပါသည်။`;""",
"Daily reward UI lock"
)

# 7. Render ads lock
replace_once(
"""function renderAdCards() {
    const container = document.getElementById('adGrid');
    if (!container) return;
    container.innerHTML = '';
    AD_CARDS.forEach((card) => {""",
"""function renderAdCards() {
    const container = document.getElementById('adGrid');
    if (!container) return;
    container.innerHTML = '';

    if (!hasActiveAdAccess()) {
        container.innerHTML = `
            <div style="width:100%;padding:24px 16px;text-align:center;">
                <div style="font-size:38px;">🔒</div>
                <div style="font-size:17px;font-weight:800;margin:10px 0;">
                    Ads Access Locked
                </div>
                <div style="font-size:13px;opacity:.8;">
                    Admin မှ Free Ads Test Access 15 ရက် ရရှိပြီးမှ Ads ကြည့်နိုင်ပါမည်။
                </div>
            </div>`;
        return;
    }

    const banner = document.createElement('div');
    banner.id = 'adAccessCountdown';
    banner.style.cssText = 'width:100%;padding:10px;margin-bottom:10px;text-align:center;font-size:12px;border-radius:10px;';
    container.appendChild(banner);
    updateAdAccessCountdownText();

    AD_CARDS.forEach((card) => {""",
"Render ads access lock"
)

# 8. Start ad guard
replace_once(
"""function startAdTask(cardId) {
    if (!currentUser) { showToast('❌ Please login', 'error'); return; }
    if (isAdPlaying)""",
"""function startAdTask(cardId) {
    if (!currentUser) { showToast('❌ Please login', 'error'); return; }
    if (!hasActiveAdAccess()) {
        showToast('🔒 Ads Free Access မရှိသေးပါ။', 'error');
        renderAdCards();
        return;
    }
    if (isAdPlaying)""",
"Start ad access guard"
)

# 9. Claim ad guard
replace_once(
"""async function claimAdReward() {
    if (!currentUser || !currentAdCard) return;
    if (dailyAdsToday >= DAILY_AD_TARGET)""",
"""async function claimAdReward() {
    if (!currentUser || !currentAdCard) return;
    if (!hasActiveAdAccess()) {
        closeAdPageAndReturn();
        showToast('🔒 Ads Access သက်တမ်းကုန်ဆုံးပါပြီ။', 'error');
        renderAdCards();
        return;
    }
    if (dailyAdsToday >= DAILY_AD_TARGET)""",
"Claim ad access guard"
)

# 10. Logout: don't flush after expiry
replace_once(
"async function handleLogout() { await flushPendingAdRewards(true); await auth.signOut(); showToast('👋 Logged out'); }",
"""async function handleLogout() {
    if (hasActiveAdAccess()) await flushPendingAdRewards(true);
    await auth.signOut();
    showToast('👋 Logged out');
}""",
"Logout pending sync guard"
)

# 11. Auth callback: load access before pending reward sync
replace_once(
"""    if (user) {
        currentUser = user;
        document.getElementById('authScreen').classList.remove('active');""",
"""    if (user) {
        currentUser = user;
        await loadAdAccess(user.uid);
        document.getElementById('authScreen').classList.remove('active');""",
"Auth load access"
)

# 12. Logout listener cleanup
replace_once(
"""    } else {
        currentUser = null;
        document.getElementById('authScreen').classList.add('active');""",
"""    } else {
        clearAdAccessState();
        currentUser = null;
        document.getElementById('authScreen').classList.add('active');""",
"Auth logout cleanup"
)

p.write_text(s, encoding="utf-8")
print("\\nPATCH COMPLETE")
print("Backup:", backup)
print("Updated:", p)
