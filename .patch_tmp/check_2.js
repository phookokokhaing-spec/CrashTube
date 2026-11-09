
/* CASHTUBE_LOCAL_BAN_APPEAL_V1 */
(function () {
  'use strict';

  const KEY = 'cashtube_ban_appeals_v1';
  const overlay = document.getElementById('ctAppealOverlay');
  const form = document.getElementById('ctAppealForm');
  const email = document.getElementById('ctAppealEmail');
  const reason = document.getElementById('ctAppealReason');
  const status = document.getElementById('ctAppealStatus');

  function readAppeals() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  document.getElementById('ctAppealOpen').addEventListener('click', function () {
    const loginEmail = document.getElementById('loginEmail');
    if (loginEmail && loginEmail.value.trim() && !email.value) {
      email.value = loginEmail.value.trim();
    }
    overlay.classList.add('ct-open');
    status.textContent = '';
  });

  document.getElementById('ctAppealClose').addEventListener('click', function () {
    overlay.classList.remove('ct-open');
  });

  overlay.addEventListener('click', function (event) {
    if (event.target === overlay) overlay.classList.remove('ct-open');
  });


  /* CASHTUBE_LOCAL_BAN_APPEAL_COPY_V1 */
  document.getElementById('ctAppealCopy').addEventListener('click', async function () {
    let appeal = null;

    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (Array.isArray(saved) && saved.length) {
        appeal = saved[saved.length - 1];
      }
    } catch (_) {}

    // သိမ်းပြီးသားစာ မရှိသေးလျှင် လက်ရှိဖြည့်ထားသောစာကို Copy လုပ်နိုင်သည်
    const emailValue = appeal ? appeal.email : email.value.trim();
    const reasonValue = appeal ? appeal.reason : reason.value.trim();

    if (!emailValue || !reasonValue) {
      status.textContent = 'အရင် Gmail နဲ့ အယူခံအကြောင်းအရာ ဖြည့်ပြီး သိမ်းပါ။';
      return;
    }

    const message =
      'Cash Tube Ban Appeal\\n' +
      'Gmail: ' + emailValue + '\\n' +
      'အယူခံအကြောင်းအရာ: ' + reasonValue + '\\n' +
      'တင်သည့်အချိန်: ' +
      (appeal && appeal.createdAt ? appeal.createdAt : new Date().toLocaleString()) +
      '\\n\\nစစ်ဆေးပေးပါရန် မေတ္တာရပ်ခံအပ်ပါသည်။';

    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(message);
        copied = true;
      }
    } catch (_) {}

    if (!copied) {
      const temp = document.createElement('textarea');
      temp.value = message;
      temp.style.position = 'fixed';
      temp.style.left = '-9999px';
      document.body.appendChild(temp);
      temp.focus();
      temp.select();
      try { copied = document.execCommand('copy'); } catch (_) {}
      temp.remove();
    }

    status.textContent = copied
      ? '✅ အယူခံစာကို Copy လုပ်ပြီးပါပြီ။ Admin ဆီ ကိုယ်တိုင် Paste လုပ်ပို့ပါ။'
      : 'Copy အလိုအလျောက်မလုပ်နိုင်ပါ။ သိမ်းပြီးသားစာကို ပြန်ဖွင့်ပြီး ထပ်စမ်းပါ။';
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    const emailValue = email.value.trim();
    const reasonValue = reason.value.trim();

    if (!emailValue || !reasonValue) {
      status.textContent = 'Gmail နဲ့ အယူခံအကြောင်းအရာ ဖြည့်ပေးပါ။';
      return;
    }

    try {
      const appeals = readAppeals();
      appeals.push({
        email: emailValue,
        reason: reasonValue,
        createdAt: new Date().toISOString(),
        status: 'မပို့ရသေး — ဒီဖုန်းထဲမှာသာ သိမ်းထားသည်'
      });

      // Local Storage သာ အသုံးပြုသည်။ Firebase ကို မခေါ်ပါ။
      localStorage.setItem(KEY, JSON.stringify(appeals.slice(-20)));

      status.textContent =
        'သိမ်းပြီးပါပြီ။ ဒီဖုန်းမှာ အယူခံစာ ' +
        Math.min(appeals.length, 20) +
        ' စောင်အထိ သိမ်းထားနိုင်ပါတယ်။ Admin ဆီ မပို့ရသေးပါ။';

      reason.value = '';
    } catch (_) {
      status.textContent =
        'သိမ်းမရပါ။ Browser Storage ပြည့်နေခြင်း သို့မဟုတ် ပိတ်ထားခြင်း ဖြစ်နိုင်ပါတယ်။';
    }
  });
})();
