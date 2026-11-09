from pathlib import Path

html_path = Path("index.html")
rules_path = Path("firestore.rules")

html = html_path.read_text()
rules = rules_path.read_text()

def replace_once(source, old, new, label):
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    print("OK:", label)
    return source.replace(old, new, 1)

# ---------- USER LEVEL UI ----------
old = '''            <div style="margin-top:16px;padding:15px;border-radius:16px;background:linear-gradient(135deg,#17152b,#30224e);color:#fff;">
                <h4 style="margin:0 0 8px;">💎 Upgrade VIP Level</h4>
                <div id="levelUpgradeInfo" style="font-size:12px;opacity:.85;margin-bottom:10px;">နောက် Level ကို 5,000 MMK ဖြင့် ဝယ်ယူနိုင်သည်။ Admin Approve လုပ်မှ Level တက်မည်။</div>
                <select id="levelPaymentMethod" onchange="loadLevelPaymentInfo()" style="width:100%;padding:11px;border-radius:10px;margin:6px 0;background:#fff;color:#222;"><option value="WavePay">WavePay</option><option value="KBZPay">KBZPay</option></select>
                <div id="levelPaymentAccountInfo" style="font-size:12px;line-height:1.7;padding:10px;border-radius:10px;background:rgba(255,255,255,.1);margin:8px 0;">Payment Account: Admin မှ သတ်မှတ်ပေးရန် လိုအပ်သည်။</div>
                <input id="levelPaymentReference" type="text" maxlength="100" placeholder="ငွေလွှဲ Transaction ID / Reference" style="width:100%;padding:11px;border-radius:10px;margin:6px 0;background:#fff;color:#222;box-sizing:border-box;">
                <button id="levelUpgradeRequestBtn" onclick="submitLevelUpgradeRequest()" style="width:100%;padding:12px;border:0;border-radius:11px;background:linear-gradient(135deg,#f5cf58,#f59e0b);font-weight:900;color:#241600;margin-top:7px;">Request Upgrade • 5,000 MMK</button>
                <div id="levelUpgradeStatus" style="font-size:11px;margin-top:9px;opacity:.85;"></div>
            </div>'''

new = '''            <div style="margin-top:16px;padding:15px;border-radius:16px;background:linear-gradient(135deg,#17152b,#30224e);color:#fff;">
                <h4 style="margin:0 0 8px;">💎 VIP Level Request</h4>
                <div id="levelUpgradeInfo" style="font-size:12px;opacity:.85;margin-bottom:10px;">နောက် Level အတွက် Admin ထံ Request တင်နိုင်ပါသည်။</div>
                <button id="freeLevelRequestBtn" onclick="submitFreeLevelRequest()" style="width:100%;padding:12px;border:0;border-radius:11px;background:linear-gradient(135deg,#63e6be,#20c997);font-weight:900;color:#10251f;margin-top:7px;">Request Upgrade</button>
                <div id="freeLevelRequestStatus" style="font-size:11px;margin-top:9px;opacity:.9;"></div>
            </div>'''

html = replace_once(html, old, new, "User Level UI")

# ---------- ADMIN LEVEL UI ----------
old = '''                <div class="admin-section">
                    <h4><i class="fas fa-wallet"></i> VIP Payment Accounts</h4>
                    <input id="adminWaveAccount" type="text" placeholder="WavePay Phone / Account" style="width:100%;margin:5px 0;">
                    <input id="adminWaveName" type="text" placeholder="WavePay Account Name" style="width:100%;margin:5px 0;">
                    <input id="adminKbzAccount" type="text" placeholder="KBZPay Phone / Account" style="width:100%;margin:5px 0;">
                    <input id="adminKbzName" type="text" placeholder="KBZPay Account Name" style="width:100%;margin:5px 0;">
                    <button class="btn-sm mint" onclick="saveLevelPaymentSettings()" style="margin-top:6px;">Save Payment Accounts</button>
                </div>
                <div class="admin-section">
                    <h4><i class="fas fa-crown"></i> VIP Level Upgrade Requests</h4>
                    <div style="max-height:260px;overflow:auto;"><table><thead><tr><th>User</th><th>Level</th><th>Payment</th><th>Ref</th><th>Action</th></tr></thead><tbody id="levelUpgradeRequestsBody"><tr><td colspan="5" class="table-loading">No requests</td></tr></tbody></table></div>
                </div>'''

new = '''                <div class="admin-section">
                    <h4><i class="fas fa-crown"></i> Free VIP Level Requests</h4>
                    <div style="max-height:260px;overflow:auto;">
                        <table>
                            <thead><tr><th>User</th><th>Level</th><th>Status / Action</th></tr></thead>
                            <tbody id="freeLevelRequestsBody"><tr><td colspan="3" class="table-loading">No requests</td></tr></tbody>
                        </table>
                    </div>
                </div>'''

html = replace_once(html, old, new, "Admin Level UI")

# ---------- LEVEL PROGRESS BUTTON ----------
old = '''    const info=document.getElementById('levelUpgradeInfo');
    const btn=document.getElementById('levelUpgradeRequestBtn');
    if(info) info.textContent=next?`လက်ရှိ LV${current.level} → LV${next.level}။ Ads ${next.ads.toLocaleString()} ပြည့်လျှင် အလိုအလျောက်အရည်အချင်းပြည့်မီမည်၊ သို့မဟုတ် 5,000 MMK ဖြင့် Request တင်နိုင်သည်။ Admin Approve လုပ်မှ Level တက်မည်။`:'အမြင့်ဆုံး Level ရောက်ရှိပြီးပါပြီ။';
    if(btn) { btn.disabled=!next; btn.style.opacity=next?'1':'.5'; btn.textContent=next?`Request LV${next.level} Upgrade • 5,000 MMK`:'MAX LEVEL'; }'''

new = '''    const info=document.getElementById('levelUpgradeInfo');
    const btn=document.getElementById('freeLevelRequestBtn');
    if(info) info.textContent=next?`လက်ရှိ LV${current.level} → LV${next.level}။ Ads ${next.ads.toLocaleString()} ပြည့်လျှင် အလိုအလျောက် Level တက်နိုင်သည်။ Admin ထံ Free Request တင်နိုင်ပါသည်။`:'အမြင့်ဆုံး Level ရောက်ရှိပြီးပါပြီ။';
    if(btn) { btn.disabled=!next; btn.style.opacity=next?'1':'.5'; btn.textContent=next?`Request LV${next.level} Upgrade`:'MAX LEVEL'; }'''

html = replace_once(html, old, new, "Level progress button")

# ---------- REMOVE PAYMENT FUNCTIONS ----------
start = html.find("async function loadLevelPaymentInfo(){")
end = html.find("async function claimDailyAdsReward() {", start)

if start < 0 or end < 0:
    raise RuntimeError("Payment function boundaries not found")

free_submit = '''async function submitFreeLevelRequest() {
    if (!currentUser) {
        showToast('Login လုပ်ပါ', 'error');
        return;
    }

    const next = getNextLevel();
    if (!next) {
        showToast('MAX LEVEL ရောက်ပြီးပါပြီ', 'warning');
        return;
    }

    const btn = document.getElementById('freeLevelRequestBtn');
    const statusBox = document.getElementById('freeLevelRequestStatus');

    if (btn) btn.disabled = true;

    try {
        const ref = db.collection('freeLevelRequests').doc(currentUser.uid);
        const existing = await ref.get();

        if (existing.exists && existing.data().status === 'pending') {
            if (statusBox) statusBox.textContent = '⏳ Pending Request ရှိပြီးသားပါ။';
            showToast('Pending Request ရှိပြီးသားပါ', 'warning');
            return;
        }

        if (existing.exists && existing.data().status === 'approved') {
            if (statusBox) statusBox.textContent = 'ဒီ Request ကို Approve လုပ်ပြီးပါပြီ။';
            showToast('Request ကို Approve လုပ်ပြီးပါပြီ', 'info');
            return;
        }

        const current = getCurrentLevel();

        await ref.set({
            userId: currentUser.uid,
            username: userData.username || 'User',
            email: currentUser.email || '',
            fromLevel: current.level,
            toLevel: next.level,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        if (statusBox) statusBox.textContent = '⏳ Request တင်ပြီးပါပြီ။ Admin စစ်ဆေးပေးပါမည်။';
        showToast('Free Level Request တင်ပြီးပါပြီ', 'success');

    } catch (e) {
        console.error('Free Level Request:', e);
        if (statusBox) statusBox.textContent = 'Request မတင်နိုင်ပါ: ' + (e.code || e.message);
        showToast('Request မတင်နိုင်ပါ: ' + (e.code || e.message), 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

'''

html = html[:start] + free_submit + html[end:]
print("OK: Replace payment functions")

html = replace_once(
    html,
    "        await loadLevelPaymentInfo();\n",
    "",
    "Remove payment loader call"
)

html = replace_once(
    html,
    "        loadLevelUpgradeRequests();\n",
    "        loadFreeLevelRequests();\n",
    "Admin loader call"
)

payment_loader = "        try { const lp=await db.collection('settings').doc('levelPaymentAccounts').get(); if(lp.exists){const x=lp.data(); document.getElementById('adminWaveAccount').value=x.waveAccount||'';document.getElementById('adminWaveName').value=x.waveName||'';document.getElementById('adminKbzAccount').value=x.kbzAccount||'';document.getElementById('adminKbzName').value=x.kbzName||'';} } catch(e) {}\n"

html = replace_once(
    html,
    payment_loader,
    "",
    "Remove Admin payment settings loader"
)

# ---------- ADMIN FREE REQUEST FUNCTIONS ----------
start = html.find("async function loadLevelUpgradeRequests(){")
end = html.find("async function loadWithdrawRequests() {", start)

if start < 0 or end < 0:
    raise RuntimeError("Admin request function boundaries not found")

admin_functions = '''async function loadFreeLevelRequests() {
    const tbody = document.getElementById('freeLevelRequestsBody');
    if (!tbody) return;

    try {
        const snap = await db.collection('freeLevelRequests')
            .orderBy('createdAt', 'desc').limit(50).get();

        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="3">No requests</td></tr>';
            return;
        }

        tbody.innerHTML = snap.docs.map(doc => {
            const d = doc.data();
            const actions = d.status === 'pending'
                ? `<button class="btn-sm mint" onclick="processFreeLevelRequest('${doc.id}','approved')">Approve</button>
                   <button class="btn-sm red" onclick="processFreeLevelRequest('${doc.id}','rejected')">Reject</button>`
                : String(d.status || 'unknown');

            return `<tr>
                <td>${d.username || 'User'}<br><small>${d.email || ''}</small></td>
                <td>LV${Number(d.fromLevel) || 1} → LV${Number(d.toLevel) || 1}</td>
                <td>${actions}</td>
            </tr>`;
        }).join('');

    } catch (e) {
        console.error('Load free requests:', e);
        tbody.innerHTML = '<tr><td colspan="3">Request ဖတ်မရပါ: ' + (e.code || e.message) + '</td></tr>';
    }
}

async function processFreeLevelRequest(id, status) {
    if (!isAdmin || !['approved', 'rejected'].includes(status)) return;

    const promptText = status === 'approved'
        ? 'ဒီ Free Level Request ကို Approve လုပ်မလား?'
        : 'ဒီ Request ကို Reject လုပ်မလား?';

    if (!confirm(promptText)) return;

    try {
        const reqRef = db.collection('freeLevelRequests').doc(id);

        await db.runTransaction(async tx => {
            const req = await tx.get(reqRef);
            if (!req.exists) throw new Error('REQUEST_NOT_FOUND');

            const d = req.data();
            if (d.status !== 'pending') throw new Error('ALREADY_PROCESSED');

            if (status === 'approved') {
                const userRef = db.collection('users').doc(d.userId);
                const user = await tx.get(userRef);
                if (!user.exists) throw new Error('USER_NOT_FOUND');

                const ud = user.data();
                const adsLevel = getLevelFromAds(Number(ud.totalAds) || 0);
                const effectiveLevel = Math.max(Number(ud.level) || 1, adsLevel);

                if (Number(d.toLevel) !== effectiveLevel + 1) {
                    throw new Error('LEVEL_CHANGED');
                }

                tx.update(userRef, { level: Number(d.toLevel) });
            }

            tx.update(reqRef, {
                status,
                processedAt: firebase.firestore.FieldValue.serverTimestamp(),
                processedBy: currentUser.uid
            });
        });

        showToast(status === 'approved' ? 'Free VIP Level Approved' : 'Request Rejected', 'success');
        await loadFreeLevelRequests();

    } catch (e) {
        console.error('Process free level request:', e);
        showToast('မအောင်မြင်ပါ: ' + (e.code || e.message), 'error');
    }
}

'''

html = html[:start] + admin_functions + html[end:]
print("OK: Add Admin Free Request functions")

# ---------- FIRESTORE RULE ----------
anchor = "    match /withdrawals/{id} {"

rule = '''    match /freeLevelRequests/{uid} {
      function validFreeLevelRequest() {
        return request.resource.data.userId == request.auth.uid
          && request.resource.data.status == 'pending'
          && request.resource.data.fromLevel is number
          && request.resource.data.toLevel is number
          && request.resource.data.toLevel == request.resource.data.fromLevel + 1
          && request.resource.data.keys().hasOnly([
            'userId', 'username', 'email',
            'fromLevel', 'toLevel', 'status', 'createdAt'
          ]);
      }

      allow get: if isOwner(uid) || isAdmin();
      allow list: if isAdmin();
      allow create: if isOwner(uid) && validFreeLevelRequest();
      allow update: if isAdmin()
        || (isOwner(uid)
          && resource.data.status == 'rejected'
          && validFreeLevelRequest());
      allow delete: if isAdmin();
    }

'''

rules = replace_once(rules, anchor, rule + anchor, "Add Firestore free request rule")

# Save only after every expected section was found
html_path.write_text(html)
rules_path.write_text(rules)

print("\\nSUCCESS: index.html and firestore.rules saved")
