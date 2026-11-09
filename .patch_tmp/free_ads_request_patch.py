from pathlib import Path
import re
import shutil
from datetime import datetime

root = Path.home() / "cashtube"
html = root / "index.html"
rules = root / "firestore.rules"

stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(html, root / f"index.html.backup_request_{stamp}")
shutil.copy2(rules, root / f"firestore.rules.backup_request_{stamp}")

s = html.read_text()
r = rules.read_text()

def replace_once(pattern, replacement, source, label, flags=re.S):
    out, count = re.subn(pattern, replacement, source, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, got {count}")
    print("PATCHED:", label)
    return out

# 1. Global request state
s = replace_once(
    r"let adAccessData = null;\s*let adAccessLoaded = false;\s*let adAccessUnsubscribe = null;",
    """let adAccessData = null;
let adAccessLoaded = false;
let adAccessUnsubscribe = null;
let adAccessRequestData = null;
let adAccessRequestUnsubscribe = null;""",
    s, "request global state"
)

# 2. Clear request listener and state during logout/reload
s = replace_once(
    r"(function clearAdAccessState\(\) \{\s*if \(adAccessUnsubscribe\) \{.*?adAccessUnsubscribe = null;\s*\})",
    r"""\1
    if (adAccessRequestUnsubscribe) {
        adAccessRequestUnsubscribe();
        adAccessRequestUnsubscribe = null;
    }
    adAccessRequestData = null;""",
    s, "clear request listener"
)

# 3. Add user request listener before loadAdAccess
marker = "async function loadAdAccess(uid) {"
if s.count(marker) != 1:
    raise RuntimeError("loadAdAccess marker not unique")

request_listener = r"""
function loadAdAccessRequest(uid) {
    if (adAccessRequestUnsubscribe) {
        adAccessRequestUnsubscribe();
        adAccessRequestUnsubscribe = null;
    }
    adAccessRequestData = null;

    adAccessRequestUnsubscribe = db.collection('adAccessRequests').doc(uid)
        .onSnapshot(doc => {
            if (!currentUser || currentUser.uid !== uid) return;
            adAccessRequestData = doc.exists ? doc.data() : null;
            renderAdCards();
        }, error => {
            console.error('AD ACCESS REQUEST LOAD FAILED:', error);
        });
}

function getAdAccessRequestPanelHtml() {
    const req = adAccessRequestData || {};
    if (req.status === 'pending') {
        return '<div style="margin-top:16px;padding:12px;border-radius:12px;background:rgba(245,158,11,.12);color:#f59e0b;font-weight:800;">⏳ Access Request Pending — Admin အတည်ပြုချက်ကို စောင့်ဆိုင်းနေပါသည်။</div>';
    }
    if (req.status === 'rejected') {
        return '<div style="margin-top:12px;color:#ef7777;font-size:12px;">❌ Request ကို Admin မှ Reject လုပ်ထားပါသည်။ ပြန်လည် Request တင်နိုင်ပါသည်။</div><button onclick="requestAdAccess()" style="margin-top:12px;padding:12px 20px;border:0;border-radius:12px;background:#16a085;color:white;font-weight:800;">📩 Request Ads Access</button>';
    }
    if (req.status === 'approved' && req.expiresAt) {
        let expiry = 0;
        if (typeof req.expiresAt.toMillis === 'function') expiry = req.expiresAt.toMillis();
        else if (typeof req.expiresAt.toDate === 'function') expiry = req.expiresAt.toDate().getTime();
        if (expiry > 0 && expiry <= Date.now()) {
            return '<div style="margin-top:12px;color:#f59e0b;font-size:12px;">⌛ ယခင် Access သက်တမ်းကုန်ဆုံးပါပြီ။</div><button onclick="requestAdAccess()" style="margin-top:12px;padding:12px 20px;border:0;border-radius:12px;background:#16a085;color:white;font-weight:800;">📩 Request Again</button>';
        }
    }
    return '<button onclick="requestAdAccess()" style="margin-top:16px;padding:12px 20px;border:0;border-radius:12px;background:#16a085;color:white;font-weight:800;">📩 Request Ads Access</button>';
}

async function requestAdAccess() {
    if (!currentUser) {
        showToast('Login ဝင်ပြီးမှ Request တင်နိုင်ပါမည်။', 'error');
        return;
    }
    if (hasActiveAdAccess()) {
        showToast('Ads Access ရရှိထားပြီးပါပြီ။', 'warning');
        return;
    }
    if (adAccessRequestData && adAccessRequestData.status === 'pending') {
        showToast('Request ကို စစ်ဆေးနေဆဲဖြစ်ပါသည်။', 'warning');
        return;
    }

    try {
        const userRef = db.collection('users').doc(currentUser.uid);
        const userSnap = await userRef.get();
        const profile = userSnap.exists ? userSnap.data() : {};

        await db.collection('adAccessRequests').doc(currentUser.uid).set({
            userId: currentUser.uid,
            email: currentUser.email || profile.email || '',
            username: profile.username || profile.name || currentUser.displayName || 'User',
            status: 'pending',
            requestedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        showToast('✅ Ads Access Request တင်ပြီးပါပြီ။', 'success');
    } catch (e) {
        console.error('AD ACCESS REQUEST FAILED:', e);
        showToast('❌ Request မတင်နိုင်ပါ: ' + (e.message || e.code), 'error');
    }
}

function escapeAdAccessText(value) {
    return String(value || '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;',
        '"': '&quot;', "'": '&#39;'
    })[ch]);
}

async function loadAdminAdAccessRequests() {
    const box = document.getElementById('adminAdAccessRequestsList');
    if (!box || !isAdmin) return;

    box.innerHTML = '<div style="padding:10px;">Loading requests...</div>';

    try {
        const snap = await db.collection('adAccessRequests')
            .where('status', '==', 'pending')
            .get();

        if (snap.empty) {
            box.innerHTML = '<div style="padding:12px;font-size:12px;opacity:.7;">Pending Request မရှိသေးပါ။</div>';
            return;
        }

        const rows = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        rows.sort((a, b) => {
            const at = a.requestedAt && a.requestedAt.toMillis ? a.requestedAt.toMillis() : 0;
            const bt = b.requestedAt && b.requestedAt.toMillis ? b.requestedAt.toMillis() : 0;
            return at - bt;
        });

        box.innerHTML = rows.map(item => `
            <div style="padding:12px;margin:8px 0;border:1px solid rgba(255,255,255,.14);border-radius:12px;">
                <div style="font-weight:800;">${escapeAdAccessText(item.username || 'User')}</div>
                <div style="font-size:12px;opacity:.8;margin:4px 0 10px;">${escapeAdAccessText(item.email)}</div>
                <div style="display:flex;gap:8px;">
                    <button class="btn-sm mint" onclick="adminApproveAdAccessRequest('${item.id}')" style="flex:1;">✅ Approve 15 Days</button>
                    <button class="btn-sm red" onclick="adminRejectAdAccessRequest('${item.id}')" style="flex:1;">❌ Reject</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error('LOAD ACCESS REQUESTS FAILED:', e);
        box.innerHTML = '<div style="color:#ef7777;padding:10px;">Request list load failed: ' + escapeAdAccessText(e.message) + '</div>';
    }
}

async function adminApproveAdAccessRequest(uid) {
    if (!isAdmin || !auth.currentUser) return;
    try {
        const requestRef = db.collection('adAccessRequests').doc(uid);
        const requestSnap = await requestRef.get();
        if (!requestSnap.exists || requestSnap.data().status !== 'pending') {
            showToast('Request မရှိတော့ပါ။', 'warning');
            await loadAdminAdAccessRequests();
            return;
        }

        const request = requestSnap.data();
        const expiresAt = firebase.firestore.Timestamp.fromDate(
            new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
        );

        const batch = db.batch();
        batch.set(db.collection('adAccess').doc(uid), {
            active: true,
            status: 'active',
            email: request.email || '',
            grantedAt: firebase.firestore.FieldValue.serverTimestamp(),
            expiresAt: expiresAt,
            grantedBy: auth.currentUser.uid,
            durationDays: 15
        });

        batch.update(requestRef, {
            status: 'approved',
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedBy: auth.currentUser.uid,
            expiresAt: expiresAt
        });

        await batch.commit();
        showToast('✅ Ads Access 15 ရက် Approve လုပ်ပြီးပါပြီ။', 'success');
        await loadAdminAdAccessRequests();
    } catch (e) {
        console.error('APPROVE ACCESS REQUEST FAILED:', e);
        showToast('❌ Approve မအောင်မြင်ပါ: ' + (e.message || e.code), 'error');
    }
}

async function adminRejectAdAccessRequest(uid) {
    if (!isAdmin || !auth.currentUser) return;
    try {
        const ref = db.collection('adAccessRequests').doc(uid);
        const snap = await ref.get();
        if (!snap.exists || snap.data().status !== 'pending') {
            showToast('Request မရှိတော့ပါ။', 'warning');
            await loadAdminAdAccessRequests();
            return;
        }

        await ref.update({
            status: 'rejected',
            rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
            rejectedBy: auth.currentUser.uid
        });

        showToast('Request ကို Reject လုပ်ပြီးပါပြီ။', 'success');
        await loadAdminAdAccessRequests();
    } catch (e) {
        console.error('REJECT ACCESS REQUEST FAILED:', e);
        showToast('❌ Reject မအောင်မြင်ပါ: ' + (e.message || e.code), 'error');
    }
}
"""

s = s.replace(marker, request_listener + "\n" + marker, 1)
print("PATCHED: request functions")

# 4. Start request listener when user access loads
s = replace_once(
    r"(async function loadAdAccess\(uid\) \{\s*clearAdAccessState\(\);)",
    r"\1\n    loadAdAccessRequest(uid);",
    s, "load user request listener"
)

# 5. Replace locked Ads UI
locked_pattern = r"""    if \(!hasActiveAdAccess\(\)\) \{\s*container\.innerHTML = `.*?`;\s*return;\s*\}"""
locked_replacement = """    if (!hasActiveAdAccess()) {
        container.innerHTML = `
            <div style="width:100%;padding:24px 16px;text-align:center;">
                <div style="font-size:38px;">🔒</div>
                <div style="font-size:17px;font-weight:800;margin:10px 0;">Ads Access Locked</div>
                <div style="font-size:13px;opacity:.8;">
                    Admin အတည်ပြုပြီးမှ Free Ads Access 15 ရက် ရရှိပါမည်။
                </div>
                ${getAdAccessRequestPanelHtml()}
            </div>`;
        return;
    }"""
s = replace_once(locked_pattern, locked_replacement, s, "user locked Ads request UI")

# 6. Replace old direct Grant UI with request queue + revoke
admin_html_pattern = r'<div class="admin-section" id="adminAdAccessSection">.*?</div>\s*(?=<div class="admin-section">\s*<h4><i class="fas fa-coins">)'
admin_html_replacement = """<div class="admin-section" id="adminAdAccessSection">
                    <h4>🔐 Ads Access Requests</h4>
                    <div class="admin-hint">
                        User Request များကို စစ်ဆေးပြီး Approve / Reject လုပ်နိုင်ပါသည်။
                        Approve လုပ်သည့်အချိန်မှ 15 ရက် စတင်ပါမည်။
                    </div>
                    <div id="adminAdAccessRequestsList" style="max-height:360px;overflow-y:auto;margin:10px 0;">
                        <div style="padding:10px;">Pending Request များကို Load လုပ်နေပါသည်...</div>
                    </div>
                    <hr style="opacity:.2;margin:12px 0;">
                    <div style="font-weight:800;font-size:13px;">Manual Revoke</div>
                    <input type="email" id="adminAdAccessEmail"
                        placeholder="User Email"
                        style="width:100%;margin:8px 0;">
                    <button class="btn-sm red" onclick="adminRevokeAdAccess()" style="width:100%;">
                        🔒 Revoke Ads Access
                    </button>
                    <div id="adminAdAccessMsg" style="font-size:12px;margin-top:8px;"></div>
                </div>
                """
s = replace_once(admin_html_pattern, admin_html_replacement, s, "admin request queue HTML")

# 7. Remove obsolete direct-grant function only
s = replace_once(
    r"async function adminGrantAdAccess\(\) \{.*?\n\}\s*(?=async function adminRevokeAdAccess)",
    "",
    s, "remove direct grant function"
)

# 8. Load pending requests after admin verification
s = replace_once(
    r"(loadDailyTop3Rewards\(\);\s*)(showToast\('✅ Admin in'\);)",
    r"\1loadAdminAdAccessRequests();\n                                \2",
    s, "load admin request queue"
)

# 9. Add Firestore rules before final catch-all
request_rules = """
    match /adAccessRequests/{uid} {
      function validPendingAdAccessRequest() {
        return request.resource.data.userId == request.auth.uid
          && request.resource.data.status == 'pending'
          && request.resource.data.keys().hasOnly([
            'userId', 'email', 'username', 'status', 'requestedAt'
          ]);
      }

      allow get: if isOwner(uid) || isAdmin();
      allow list: if isAdmin();

      allow create: if isOwner(uid)
        && validPendingAdAccessRequest();

      allow update: if isAdmin()
        || (isOwner(uid)
          && (
            resource.data.status == 'rejected'
            || (
              resource.data.status == 'approved'
              && resource.data.expiresAt is timestamp
              && resource.data.expiresAt < request.time
            )
          )
          && validPendingAdAccessRequest());

      allow delete: if isAdmin();
    }

"""
if r.count("match /{document=**}") != 1:
    raise RuntimeError("Firestore catch-all marker missing or duplicated")
r = r.replace("    match /{document=**}", request_rules + "    match /{document=**}", 1)
print("PATCHED: Firestore request rules")

# Write only after all replacements succeeded
html.write_text(s)
rules.write_text(r)

print("\nPATCH COMPLETE")
print("HTML backup:", root / f"index.html.backup_request_{stamp}")
print("Rules backup:", root / f"firestore.rules.backup_request_{stamp}")
