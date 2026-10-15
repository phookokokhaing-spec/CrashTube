
      atOptions = {
        'key' : 'cc7cd0a23b6233b016189f04e29fda5c',
        'format' : 'iframe',
        'height' : 250,
        'width' : 300,
        'params' : {}
      };
    
;


/* ============================================================
   CASH TUBE CORE CONFIG — SAFE INITIALIZATION ORDER
   ============================================================ */
const PROFILE_FRAMES = [
    {id:'aurora', name:'Aurora', cls:'frame-aurora', price:300, icon:'🌌'},
    {id:'royal', name:'Royal', cls:'frame-royal', price:300, icon:'👑'},
    {id:'rose', name:'Rose Glow', cls:'frame-rose', price:300, icon:'🌹'},
    {id:'neon', name:'Neon', cls:'frame-neon', price:300, icon:'⚡'},
    {id:'ocean', name:'Ocean', cls:'frame-ocean', price:300, icon:'🌊'},
    {id:'gold', name:'Gold', cls:'frame-gold', price:300, icon:'✨'},
    {id:'diamond', name:'Diamond', cls:'frame-diamond', price:300, icon:'💎'},
    {id:'cosmic', name:'Cosmic', cls:'frame-cosmic', price:300, icon:'🪐'}
];

var VIDEO_REWARD = 30;

// ============================================================
//  SIDE DRAWER FUNCTIONS
// ============================================================
function openDrawer() {
    document.getElementById('sideDrawer').classList.add('show');
    document.getElementById('drawerOverlay').classList.add('show');
}

function closeDrawer() {
    document.getElementById('sideDrawer').classList.remove('show');
    document.getElementById('drawerOverlay').classList.remove('show');
}

// ============================================================
//  FIREBASE SETUP
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyDi3BZwW1Bj9q-l5aifdetKGrIpIZXw79I",
  authDomain: "cashtube-1679a.firebaseapp.com",
  projectId: "cashtube-1679a",
  storageBucket: "cashtube-1679a.firebasestorage.app",
  messagingSenderId: "453269438044",
  appId: "1:453269438044:web:6290085ed840a19d677099",
  measurementId: "G-Q3W8SVWL0L"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

// ============================================================
//  CONSTANTS
// ============================================================
let AD_REWARD = 30;
const AD_DURATION = 30;
const COOLDOWN = 2 * 60 * 1000;
const TOP_BONUS = 1500;
const TOP_BONUS_TARGET = 50;
const ADMIN_IDS = ["2021666", "7625227853"];
const GIFT_FEE = 20;
const REFERRAL_BONUS = 500;
const ADMIN_REF_CODE = "ADMIN2026";
const ADMIN_SIGNUP_REF_CODE = "5CDUKGUB";
const MIN_WITHDRAW_MMK = 1000;

// FIRESTORE QUOTA OPTIMIZATION
// Ad rewards are queued locally and synced in small batches instead of
// writing to Firestore on every single ad view.
const AD_SYNC_BATCH = 5;
let _adRewardFlushPromise = null;
function getPendingAdRewards() {
    if (!currentUser) return { count: 0, coins: 0, lastTitle: '' };
    try {
        return JSON.parse(localStorage.getItem('pendingAdRewards_' + currentUser.uid) || '{"count":0,"coins":0,"lastTitle":""}');
    } catch (e) { return { count: 0, coins: 0, lastTitle: '' }; }
}
function setPendingAdRewards(p) {
    if (!currentUser) return;
    localStorage.setItem('pendingAdRewards_' + currentUser.uid, JSON.stringify(p));
}
async function flushPendingAdRewards(force = false) {
    if (!currentUser || _adRewardFlushPromise) return false;

    const uid = currentUser.uid;
    const pending = getPendingAdRewards();

    pending.count = Number(pending.count || 0);
    pending.coins = Number(pending.coins || 0);

    if (
        !Number.isFinite(pending.count) ||
        !Number.isFinite(pending.coins) ||
        pending.count <= 0 ||
        pending.coins < 0
    ) {
        console.error('Invalid pending ad rewards:', pending);
        return false;
    }

    if (!force && pending.count < AD_SYNC_BATCH) return false;

    if (!pending.batchId) {
        pending.batchId =
            Date.now().toString(36) + '_' +
            Math.random().toString(36).slice(2, 12);

        try {
            localStorage.setItem(
                'pendingAdRewards_' + uid,
                JSON.stringify(pending)
            );
        } catch (e) {
            console.error('Could not persist ad batch ID:', e);
            return false;
        }
    }

    const batch = {
        uid: uid,
        batchId: pending.batchId,
        count: pending.count,
        coins: pending.coins,
        lastTitle: pending.lastTitle || 'Ad Watch'
    };

    _adRewardFlushPromise = (async () => {
        try {
            const today = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Yangon'
            }).format(new Date());

            const userRef = db.collection('users').doc(uid);
            const adRef = db.collection('adWatches').doc(uid + '_' + today);

            // Stable document ID makes retries identifiable.
            const txRef = db.collection('transactions').doc(
                'ad_batch_' + uid + '_' + batch.batchId
            );

            const result = await db.runTransaction(async transaction => {
                // Read first: if this batch was already committed,
                // do not increment the user's coins again.
                const existing = await transaction.get(txRef);

                if (existing.exists) {
                    const data = existing.data() || {};
                    return {
                        alreadyCommitted: true,
                        count: Number(data.adCount || batch.count),
                        coins: Number(data.amount || batch.coins)
                    };
                }

                transaction.update(userRef, {
                    coins: firebase.firestore.FieldValue.increment(batch.coins),
                    totalAds: firebase.firestore.FieldValue.increment(batch.count)
                });

                transaction.set(adRef, {
                    userId: uid,
                    authUid: uid,
                    username: userData.username || 'User',
                    email: userData.email || '',
                    date: today,
                    count: firebase.firestore.FieldValue.increment(batch.count),
                    totalCoins: firebase.firestore.FieldValue.increment(batch.coins),
                    lastWatch: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                transaction.set(txRef, {
                    userId: uid,
                    type: 'ad_watch_batch',
                    amount: batch.coins,
                    adCount: batch.count,
                    batchId: batch.batchId,
                    description: `${batch.count} ads - ${batch.lastTitle}`,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });

                return {
                    alreadyCommitted: false,
                    count: batch.count,
                    coins: batch.coins
                };
            });

            // Remove only the rewards confirmed as committed.
            // Preserve any rewards that may have been queued meanwhile.
            const storageKey = 'pendingAdRewards_' + uid;
            let currentPending;

            try {
                currentPending = JSON.parse(
                    localStorage.getItem(storageKey) ||
                    '{"count":0,"coins":0,"lastTitle":""}'
                );
            } catch (_) {
                currentPending = null;
            }

            if (currentPending &&
                currentPending.batchId === batch.batchId) {

                const remainingCount = Math.max(
                    0,
                    Number(currentPending.count || 0) - result.count
                );

                const remainingCoins = Math.max(
                    0,
                    Number(currentPending.coins || 0) - result.coins
                );

                if (remainingCount > 0 || remainingCoins > 0) {
                    currentPending.count = remainingCount;
                    currentPending.coins = remainingCoins;
                    currentPending.batchId =
                        Date.now().toString(36) + '_' +
                        Math.random().toString(36).slice(2, 12);

                    localStorage.setItem(
                        storageKey,
                        JSON.stringify(currentPending)
                    );
                } else {
                    localStorage.setItem(storageKey, JSON.stringify({
                        count: 0,
                        coins: 0,
                        lastTitle: ''
                    }));
                }
            }

            console.log(
                result.alreadyCommitted
                    ? '✅ AD SYNC: Batch was already committed; no duplicate reward.'
                    : '✅ AD SYNC: Atomic transaction committed.',
                {
                    uid: uid,
                    count: result.count,
                    coins: result.coins,
                    batchId: batch.batchId
                }
            );

            return true;

        } catch (e) {
            console.error('❌ AD FIRESTORE SYNC FAILED:', e);
            console.error('Error code:', e && e.code);
            console.error('Error message:', e && e.message);
            console.error('Pending batch:', batch);

            try {
                showToast(
                    '⚠️ Ad Sync Failed: ' +
                    (e && e.code ? e.code : 'unknown'),
                    'error'
                );
            } catch (_) {}

            // Keep pending rewards for retry.
            return false;

        } finally {
            _adRewardFlushPromise = null;
        }
    })();

    return await _adRewardFlushPromise;
}

const LEVELS = [
    { level: 1, ads: 0, bonus: 0, title: 'Novice', vip: 'Bronze', color: '#cd7f32' },
    { level: 2, ads: 50, bonus: 1500, title: 'Rookie', vip: 'Bronze', color: '#cd7f32' },
    { level: 3, ads: 100, bonus: 2000, title: 'Fighter', vip: 'Silver', color: '#c0c0c0' },
    { level: 4, ads: 200, bonus: 3000, title: 'Warrior', vip: 'Silver', color: '#c0c0c0' },
    { level: 5, ads: 350, bonus: 5000, title: 'Elite', vip: 'Gold', color: '#ffd700' },
    { level: 6, ads: 500, bonus: 7500, title: 'Master', vip: 'Gold', color: '#ffd700' },
    { level: 7, ads: 750, bonus: 10000, title: 'Champion', vip: 'Platinum', color: '#e5e4e2' },
    { level: 8, ads: 1000, bonus: 15000, title: 'Hero', vip: 'Platinum', color: '#e5e4e2' },
    { level: 9, ads: 1500, bonus: 20000, title: 'Legend', vip: 'Diamond', color: '#b9f2ff' },
    { level: 10, ads: 2000, bonus: 30000, title: 'Mythic', vip: 'Diamond', color: '#b9f2ff' }
];

const ACHIEVEMENTS = [
    { id: 'first_ad', icon: '🎬', title: 'First Ad', desc: 'ပထမဆုံး Ad ကြည့်', target: 1, type: 'ads', reward: 100 },
    { id: 'ad_10', icon: '📺', title: 'Ad Fan', desc: '10 ads ကြည့်', target: 10, type: 'ads', reward: 250 },
    { id: 'ad_50', icon: '🎯', title: 'Ad Hunter', desc: '50 ads ကြည့်', target: 50, type: 'ads', reward: 500 },
    { id: 'ad_100', icon: '🏅', title: 'Ad Master', desc: '100 ads ကြည့်', target: 100, type: 'ads', reward: 1000 },
    { id: 'ad_500', icon: '👑', title: 'Ad King', desc: '500 ads ကြည့်', target: 500, type: 'ads', reward: 1000 },
    { id: 'coin_1000', icon: '💰', title: 'Rich', desc: '1,000 coins', target: 1000, type: 'coins', reward: 200 },
    { id: 'coin_10000', icon: '💎', title: 'Tycoon', desc: '10,000 coins', target: 10000, type: 'coins', reward: 500 },
    { id: 'ref_1', icon: '👥', title: 'Inviter', desc: '1 ယောက် ဖိတ်', target: 1, type: 'refs', reward: 500 },
    { id: 'ref_10', icon: '🌟', title: 'Super Inviter', desc: '10 ယောက် ဖိတ်', target: 10, type: 'refs', reward: 1000 }
];

const AD_CARDS = [
    { id: 'ad1', type: 'watch', title: 'Ad 1', icon: '📺', reward: AD_REWARD },
    { id: 'ad2', type: 'watch', title: 'Ad 2', icon: '🎬', reward: AD_REWARD },
    { id: 'ad3', type: 'download', title: 'Ad 3', icon: '📥', reward: AD_REWARD },
    { id: 'ad4', type: 'download', title: 'Ad 4', icon: '📲', reward: AD_REWARD }
];

// ============================================================
//  MULTI-LANGUAGE — COMPLETE UI TRANSLATION
// ============================================================
const TRANSLATIONS = {
  my: {
    home:'ပင်မ', rank:'အဆင့်', refer:'ဖိတ်', profile:'ကိုယ်ရေး',
    earn:'ရယူ', bonus:'ဘောနပ်', level:'အဆင့်', awards:'ဆုများ',
    leaderboard:'အဆင့်ဇယား', adTasks:'Ad တာဝန်များ', language:'ဘာသာစကား',
    dailyBonus:'နေ့စဉ် ဘောနပ်စ်', vipLevel:'VIP အဆင့်', dashboard:'ဒက်ရှ်ဘုတ်',
    totalBalance:'စုစုပေါင်း လက်ကျန်', nextLevel:'နောက်အဆင့်', progress:'တိုးတက်မှု'
  },
  en: {
    home:'Home', rank:'Rank', refer:'Refer', profile:'Profile',
    earn:'Earn', bonus:'Bonus', level:'Level', awards:'Awards',
    leaderboard:'Leaderboard', adTasks:'Ad Tasks', language:'Language',
    dailyBonus:'Daily Bonus', vipLevel:'VIP Level', dashboard:'Dashboard',
    totalBalance:'Total Balance', nextLevel:'Next Level', progress:'Progress'
  }
};

/* Static + dynamic UI text pairs.  The original text is kept as the key,
   so switching MY → EN → MY remains reversible. */
const UI_TEXT = {
  'CASH TUBE':['CASH TUBE','CASH TUBE'],
  'R E W A R D S':['R E W A R D S','R E W A R D S'],
  'Loading your rewards':['ဆုလာဘ်များကို ဖွင့်နေသည်','Loading your rewards'],
  '📱 Local Mode':['📱 Local Mode','📱 Local Mode'],
  'REWARD EARNED':['ဆုလာဘ်ရရှိပြီး','REWARD EARNED'],
  'coins added to your wallet':['Coin များ Wallet ထဲသို့ ထည့်ပြီးပါပြီ','coins added to your wallet'],
  'Total:':['စုစုပေါင်း:','Total:'],
  'Loading...':['ဖွင့်နေသည်...','Loading...'],
  'MAIN':['ပင်မ','MAIN'],
  'Ad Tasks':['Ad တာဝန်များ','Ad Tasks'],
  'VIP Level':['VIP အဆင့်','VIP Level'],
  'Market':['ဈေးကွက်','Market'],
  'Leaderboard':['အဆင့်ဇယား','Leaderboard'],
  'ACCOUNT':['အကောင့်','ACCOUNT'],
  'Profile':['ကိုယ်ရေးအချက်အလက်','Profile'],
  'Refer & Earn':['ဖိတ်ခေါ်ပြီး ရယူမည်','Refer & Earn'],
  'Achievements':['အောင်မြင်မှုဆုများ','Achievements'],
  'History':['မှတ်တမ်း','History'],
  'SETTINGS':['ဆက်တင်များ','SETTINGS'],
  'Dark / Light':['အမှောင် / အလင်း','Dark / Light'],
  'Language':['ဘာသာစကား','Language'],
  'English':['အင်္ဂလိပ်','English'],
  'Logout':['ထွက်မည်','Logout'],
  'Watch ads & earn rewards':['ကြော်ငြာကြည့်ပြီး ဆုလာဘ်ရယူပါ','Watch ads & earn rewards'],
  'Email':['အီးမေးလ်','Email'],
  'Password':['စကားဝှက်','Password'],
  'Sign In':['ဝင်မည်','Sign In'],
  'No account?':['အကောင့်မရှိသေးပါက?','No account?'],
  'Sign Up':['အကောင့်ဖွင့်မည်','Sign Up'],
  'Username':['အသုံးပြုသူအမည်','Username'],
  'Password (min 6)':['စကားဝှက် (အနည်းဆုံး ၆ လုံး)','Password (min 6)'],
  'Referral Code (Optional)':['ဖိတ်ခေါ်ကုဒ် (မဖြည့်လည်းရ)','Referral Code (Optional)'],
  'Create Account':['အကောင့်ဖန်တီးမည်','Create Account'],
  'Already have account?':['အကောင့်ရှိပြီးသားလား?','Already have account?'],
  'TOTAL BALANCE':['စုစုပေါင်း လက်ကျန်','TOTAL BALANCE'],
  'Bronze':['ကြေးတံဆိပ်','Bronze'],
  'Level 1':['အဆင့် ၁','Level 1'],
  'Next Level':['နောက်အဆင့်','Next Level'],
  'QUICK ACTIONS':['အမြန်လုပ်ဆောင်ချက်များ','QUICK ACTIONS'],
  'Earn':['ရယူမည်','Earn'],
  'Bonus':['ဘောနပ်စ်','Bonus'],
  'Level':['အဆင့်','Level'],
  'Rank':['အဆင့်ဇယား','Rank'],
  'Refer':['ဖိတ်ခေါ်မည်','Refer'],
  'Awards':['ဆုများ','Awards'],
  'See All':['အားလုံးကြည့်မည်','See All'],
  'Daily Bonus':['နေ့စဉ် ဘောနပ်စ်','Daily Bonus'],
  'Daily Reward':['နေ့စဉ် ဆုလာဘ်','Daily Reward'],
  'Claim once every 24 hours':['၂၄ နာရီလျှင် တစ်ကြိမ် ရယူနိုင်သည်','Claim once every 24 hours'],
  'View':['ကြည့်မည်','View'],
  'Novice':['အစပြုသူ','Novice'],
  'Dashboard':['ဒက်ရှ်ဘုတ်','Dashboard'],
  'Refresh':['ပြန်လည်စတင်မည်','Refresh'],
  'Wallet':['ပိုက်ဆံအိတ်','Wallet'],
  'Ad Playing...':['Ad ဖွင့်နေသည်...','Ad Playing...'],
  'Ad Loading...':['Ad ဖွင့်ရန် ပြင်ဆင်နေသည်...','Ad Loading...'],
  'Coin Gift ပို့ရန်':['Coin Gift ပို့ရန်','Send Coin Gift'],
  'ပို့မည် (Fee 20 Coin)':['ပို့မည် (Fee 20 Coin)','Send (20 Coin Fee)'],
  'Refer & Earn +500':['ဖိတ်ခေါ်ပြီး +500 ရယူမည်','Refer & Earn +500'],
  'Transaction History':['ငွေလွှဲမှတ်တမ်း','Transaction History'],
  'Level Bonus ရယူမည်':['Level Bonus ရယူမည်','Claim Level Bonus'],
  '📊 Level List':['📊 အဆင့်စာရင်း','📊 Level List'],
  'Today':['ယနေ့','Today'],
  'This Week':['ဒီအပတ်','This Week'],
  'All Time':['အချိန်အားလုံး','All Time'],
  'Your Referral Code':['သင့် Referral Code','Your Referral Code'],
  'Invited':['ဖိတ်ခေါ်ထားသူ','Invited'],
  'Earned':['ရရှိပြီး','Earned'],
  'Share လုပ်မည်':['မျှဝေမည်','Share'],
  'No referrals yet':['ဖိတ်ခေါ်ထားသူ မရှိသေးပါ','No referrals yet'],
  '💵 USD → MMK':['💵 USD → MMK','💵 USD → MMK'],
  '1 Coin = --- MMK':['1 Coin = --- MMK','1 Coin = --- MMK'],
  '🪙 Coin → MMK':['🪙 Coin → MMK','🪙 Coin → MMK'],
  '10,000 Coins = --- MMK':['10,000 Coins = --- MMK','10,000 Coins = --- MMK'],
  '💰 Your MMK Balance':['💰 သင့် MMK လက်ကျန်','💰 Your MMK Balance'],
  '🔒 Exchange ပိတ်ထားပါသည်':['🔒 Exchange ပိတ်ထားပါသည်','🔒 Exchange is closed'],
  'Exchange':['လဲလှယ်မည်','Exchange'],
  'Balance Coin':['လက်ကျန် Coin','Balance Coin'],
  'Rate':['နှုန်းထား','Rate'],
  'Coin Amount':['Coin အရေအတွက်','Coin Amount'],
  '1K':['1K','1K'],'3K':['3K','3K'],'5K':['5K','5K'],'10K':['10K','10K'],
  "You'll receive:":["ရရှိမည့်ပမာဏ:","You'll receive:"],
  'Confirm':['အတည်ပြုမည်','Confirm'],
  'Admin Panel':['Admin Panel','Admin Panel'],
  'Admin ID':['Admin ID','Admin ID'],
  'Login':['ဝင်မည်','Login'],
  '✅ Logged in':['✅ ဝင်ရောက်ပြီး','✅ Logged in'],
  'App Download Links':['App Download Links','App Download Links'],
  'Link':['လင့်ခ်','Link'],
  'Action':['လုပ်ဆောင်ချက်','Action'],
  'Ad Watch Links':['Ad Watch Links','Ad Watch Links'],
  'Exchange Rate':['လဲလှယ်နှုန်း','Exchange Rate'],
  'Set':['သတ်မှတ်မည်','Set'],
  'Current: 1$ =':['လက်ရှိ: 1$ =','Current: 1$ ='],
  'Coins':['Coin များ','Coins'],
  'USD → MMK Rate':['USD → MMK နှုန်း','USD → MMK Rate'],
  'Current:':['လက်ရှိ:','Current:'],
  'Ks':['ကျပ်','Ks'],
  'Watch':['ကြည့်မည်','Watch'],
  'Download':['ဒေါင်းလုဒ်','Download'],
  'wait':['စောင့်ပါ','wait'],
  'Error loading':['ဖွင့်ရာတွင် အမှားဖြစ်နေသည်','Error loading'],
  'Please login':['ကျေးဇူးပြု၍ အရင်ဝင်ပါ','Please login'],
  '❌ Link မရှိ':['❌ လင့်ခ် မရှိသေးပါ','❌ No link available'],
  '⏳ Ad ကနေဆဲ':['⏳ Ad လုပ်ဆောင်နေဆဲပါ','⏳ Ad is still running']
};

function normUIText(v){ return String(v ?? '').replace(/\s+/g,' ').trim(); }

function translateDOM(lang){
  if(!UI_TEXT) return;
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  const nodes=[];
  while(walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node=>{
    const raw=normUIText(node.nodeValue);
    if(!raw) return;
    const pair=UI_TEXT[raw];
    if(pair) node.nodeValue=node.nodeValue.replace(raw,pair[lang==='my'?0:1]);
  });
  document.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(el=>{
    const pair=UI_TEXT[normUIText(el.getAttribute('placeholder'))];
    if(pair) el.setAttribute('placeholder',pair[lang==='my'?0:1]);
  });
  document.querySelectorAll('[title],[aria-label]').forEach(el=>{
    ['title','aria-label'].forEach(attr=>{
      const val=normUIText(el.getAttribute(attr));
      const pair=UI_TEXT[val];
      if(pair) el.setAttribute(attr,pair[lang==='my'?0:1]);
    });
  });
  /* Dynamic counters */
  document.querySelectorAll('*').forEach(el=>{
    if(el.children.length) return;
    const t=normUIText(el.textContent);
    if(/^\d+\/\d+\s+ads$/i.test(t)){
      const n=t.split(' ')[0];
      el.textContent=lang==='my'?`${n} ကြော်ငြာ`:`${n} ads`;
    }
    if(/^\d+:\d+\s+(wait|စောင့်ပါ)$/i.test(t)){
      el.textContent=t.replace(/\s+(wait|စောင့်ပါ)$/i,lang==='my'?' စောင့်ပါ':' wait');
    }
  });
}

let currentLang = localStorage.getItem('appLang') || 'my';

function switchLanguage(lang) {
  if (!TRANSLATIONS[lang]) lang='my';
  currentLang=lang;
  localStorage.setItem('appLang',lang);

  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key=el.getAttribute('data-i18n');
    if(TRANSLATIONS[lang][key]) el.textContent=TRANSLATIONS[lang][key];
  });

  translateDOM(lang);

  const myBtn=document.getElementById('langMyBtn');
  const enBtn=document.getElementById('langEnBtn');
  if(myBtn) myBtn.classList.toggle('active',lang==='my');
  if(enBtn) enBtn.classList.toggle('active',lang==='en');
  document.documentElement.lang=lang==='my'?'my':'en';

  if(typeof renderAdCards==='function') renderAdCards();
  translateDOM(lang);
  if(typeof currentLeaderboardType!=='undefined' && currentLeaderboardType && typeof loadLeaderboard==='function'){
    loadLeaderboard(currentLeaderboardType);
  }
}

function toggleLanguage(){ switchLanguage(currentLang==='my'?'en':'my'); }
function applyLanguage(){ switchLanguage(currentLang); }

// Translate newly-rendered text without interfering with forms.
const _uiLangObserver=new MutationObserver(muts=>{
  if(!document.body) return;
  clearTimeout(window._uiLangTimer);
  window._uiLangTimer=setTimeout(()=>translateDOM(currentLang),60);
});
if(document.body) _uiLangObserver.observe(document.body,{subtree:true,childList:true});

// ============================================================
//  STATE
// ============================================================
let adLinks = [];
let appLinks = [];
let currentUser = null;
let userData = {
    coins: 0, usdt: 0, username: 'User', email: '',
    isBanned: false, level: 1, totalAds: 0, refCode: '',
    referredBy: '', referralCount: 0, referralEarned: 0,
    mmkBalance: 0,
    claimedLevels: [], unlockedAch: [], claimedAch: []
};
let isAdmin = false;
let exchangeRate = 3000; // legacy USD→Coin setting
let mmkRate = 0; // legacy USD→MMK setting
let coinMmkRate = 0; // MMK value for 10,000 Coins (admin controlled)
let isExchangeOpen = true;
let exchangeOpenDate = null;
let isUpdatingCoins = false;
let isAdPlaying = false;
let adCardTimers = {};
let adPageInterval = null;
// CASHTUBE_LISTENER_TIMER_FIX_V1
let cashTubeUserSnapshotUnsubscribe = null;
let cashTubeDailyBonusInterval = null;
let cashTubeSaveCoinsInterval = null;
let cashTubeAuthGeneration = 0;

let currentAdCard = null;
let isWithdrawOpen = localStorage.getItem('isWithdrawOpen') === 'true';
let currentLeaderboardType = 'today';

// ============================================================
//  HELPERS
// ============================================================
function acquireCoinLock() {
    if (isUpdatingCoins) return false;
    isUpdatingCoins = true;
    setTimeout(() => { isUpdatingCoins = false; }, 10000);
    return true;
}
function releaseCoinLock() { isUpdatingCoins = false; }
function generateRefCode() { return Math.random().toString(36).substring(2, 10).toUpperCase(); }

let audioContext = null;
function playCoinSound() {
    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const now = audioContext.currentTime;
        playTone(988, now, 0.08, 0.3);
        playTone(1319, now + 0.08, 0.2, 0.25);
        playTone(1760, now + 0.15, 0.15, 0.15);
    } catch (e) {}
}
function playBigRewardSound() {
    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const now = audioContext.currentTime;
        playTone(523, now, 0.1, 0.2);
        playTone(659, now + 0.1, 0.1, 0.25);
        playTone(784, now + 0.2, 0.1, 0.3);
        playTone(1047, now + 0.3, 0.15, 0.35);
        playTone(1319, now + 0.45, 0.3, 0.4);
    } catch (e) {}
}
function playTone(freq, start, dur, vol) {
    try {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(vol, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.start(start);
        osc.stop(start + dur);
    } catch (e) {}
}

// ============================================================
//  COIN ANIMATION
// ============================================================
function showCoinAnimation(amount, totalCoins) {
    const overlay = document.getElementById('coinAnimationOverlay');
    const amountEl = document.getElementById('rewardAmountNum');
    const totalEl = document.getElementById('rewardTotalCoins');
    if (!overlay) return;
    amountEl.textContent = '0';
    totalEl.textContent = totalCoins;
    document.querySelectorAll('.coin-particle, .confetti').forEach(el => el.remove());
    overlay.classList.add('show');
    if (amount >= 100) playBigRewardSound(); else playCoinSound();
    setTimeout(() => { overlay.classList.add('shake'); setTimeout(() => overlay.classList.remove('shake'), 700); }, 100);

    for (let i = 0; i < 50; i++) {
        setTimeout(() => {
            const coin = document.createElement('div');
            coin.className = 'coin-particle';
            coin.textContent = '💎';
            coin.style.cssText = `position:absolute;width:${28 + Math.random()*18}px;height:${28 + Math.random()*18}px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#10b981);box-shadow:0 0 25px rgba(59,130,246,0.6);display:flex;align-items:center;justify-content:center;font-size:16px;top:-80px;left:${Math.random()*100}%;animation:coinFall 2.8s cubic-bezier(0.34,0.5,0.64,1) forwards;animation-delay:${Math.random()*0.5}s;`;
            overlay.appendChild(coin);
            setTimeout(() => coin.remove(), 4000);
        }, i * 25);
    }

    const duration = 1600;
    const start = Date.now();
    const countUp = () => {
        const elapsed = Date.now() - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 4);
        amountEl.textContent = Math.round(amount * eased);
        if (progress < 1) requestAnimationFrame(countUp);
        else amountEl.textContent = amount;
    };
    requestAnimationFrame(countUp);
    if (navigator.vibrate) navigator.vibrate([80, 40, 80, 40, 150]);
    setTimeout(() => overlay.classList.remove('show'), 4500);
}

const styleEl = document.createElement('style');
styleEl.textContent = `@keyframes coinFall { 0% { top:-80px; opacity:0; transform:rotate(0deg) scale(0.3); } 15% { opacity:1; transform:rotate(180deg) scale(1.3); } 85% { opacity:1; } 100% { top:115vh; opacity:0; transform:rotate(1080deg) scale(0.5); } }`;
document.head.appendChild(styleEl);

// ============================================================
//  LEVEL SYSTEM
// ============================================================
function getCurrentLevel() {
    const ads = userData.totalAds || 0;
    let lvl = LEVELS[0];
    for (const l of LEVELS) { if (ads >= l.ads) lvl = l; }
    return lvl;
}
function getNextLevel() {
    const current = getCurrentLevel();
    return LEVELS.find(l => l.level === current.level + 1) || null;
}
function getLevelFromAds(ads) {
    let lvl = 1;
    for (const l of LEVELS) { if (ads >= l.ads) lvl = l.level; }
    return lvl;
}

function updateLevelUI() {
    const current = getCurrentLevel();
    const next = getNextLevel();
    const ads = userData.totalAds || 0;

    document.getElementById('vipTitle').textContent = current.vip;
    document.getElementById('levelTitle').textContent = 'Level ' + current.level;
    document.getElementById('lvlNumBig').textContent = current.level;
    document.getElementById('lvlTitleBig').textContent = current.title;
    document.getElementById('lvlNumModal').textContent = current.level;
    document.getElementById('lvlTitleModal').textContent = current.title;

    if (next) {
        const progressAds = ads - current.ads;
        const targetAds = next.ads - current.ads;
        const pct = Math.min((progressAds / targetAds) * 100, 100);
        document.getElementById('lvlProgressFill').style.width = pct + '%';
        document.getElementById('lvlProgressModal').style.width = pct + '%';
        document.getElementById('lvlProgressLabel').textContent = `${ads}/${next.ads} ads`;
        document.getElementById('lvlProgressLabelModal').textContent = `${ads}/${next.ads} ads`;
        document.getElementById('lvlDescBig').textContent = `Ad ${next.ads - ads} ခု ထပ်ကြည့်ပြီး Level ${next.level} တက်`;
        document.getElementById('lvlDescModal').textContent = `Ad ${next.ads - ads} ခု ထပ်ကြည့်ပါ`;
        document.getElementById('heroProgressFill').style.width = pct + '%';
        document.getElementById('nextLevelLabel').textContent = `${ads}/${next.ads} ads`;

        if (userData.claimedLevels && userData.claimedLevels.includes(next.level)) {
            document.getElementById('levelClaimBtn').style.display = 'none';
        } else if (ads >= next.ads) {
            document.getElementById('levelClaimBtn').style.display = 'flex';
            document.getElementById('levelClaimBtn').innerHTML = `<i class="fas fa-gift"></i> Level ${next.level} Bonus +${next.bonus} Coins`;
            document.getElementById('levelClaimBtn').dataset.level = next.level;
            document.getElementById('levelClaimBtn').dataset.bonus = next.bonus;
        } else {
            document.getElementById('levelClaimBtn').style.display = 'none';
        }
    } else {
        document.getElementById('lvlProgressFill').style.width = '100%';
        document.getElementById('lvlProgressModal').style.width = '100%';
        document.getElementById('lvlProgressLabel').textContent = 'MAX';
        document.getElementById('lvlProgressLabelModal').textContent = 'MAX';
        document.getElementById('lvlDescBig').textContent = 'အကောင်းဆုံး Level ရောက်နေပါပြီ!';
        document.getElementById('heroProgressFill').style.width = '100%';
        document.getElementById('nextLevelLabel').textContent = 'MAX LEVEL';
        document.getElementById('levelClaimBtn').style.display = 'none';
    }

    const list = document.getElementById('levelListContainer');
    list.innerHTML = LEVELS.map(l => {
        const unlocked = ads >= l.ads;
        const claimed = userData.claimedLevels && userData.claimedLevels.includes(l.level);
        return `
            <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--slate-50);border-radius:14px;margin-bottom:8px;border:1px solid ${claimed ? 'var(--mint-400)' : unlocked ? 'var(--blue-300)' : 'var(--border-light)'};">
                <div style="width:40px;height:40px;border-radius:50%;background:${l.color};display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:15px;">${l.level}</div>
                <div style="flex:1;">
                    <div style="font-size:13px;font-weight:700;color:var(--text-1);">${l.title} <span style="color:${l.color};font-size:10px;">${l.vip}</span></div>
                    <div style="font-size:10px;color:var(--text-3);">${l.ads} ads • +${l.bonus} coins</div>
                </div>
                <div style="font-size:18px;">${claimed ? '✅' : unlocked ? '🎁' : '🔒'}</div>
            </div>
        `;
    }).join('');
}

async function claimLevelBonus() {
    const btn = document.getElementById('levelClaimBtn');
    const level = parseInt(btn.dataset.level);
    const bonus = parseInt(btn.dataset.bonus);
    if (!level || !bonus) return;
    if (userData.claimedLevels && userData.claimedLevels.includes(level)) { showToast('❌ ရယူပြီးပါပြီ', 'error'); return; }
    if (!acquireCoinLock()) { showToast('⏳ Please wait', 'warning'); return; }
    try {
        const newCoins = (userData.coins || 0) + bonus;
        userData.coins = newCoins;
        userData.claimedLevels = [...(userData.claimedLevels || []), level];
        saveCoinsToLocal(newCoins);
        updateUI();
        updateLevelUI();
        try {
            await db.collection('users').doc(currentUser.uid).update({
                coins: firebase.firestore.FieldValue.increment(bonus),
                claimedLevels: firebase.firestore.FieldValue.arrayUnion(level)
            });
            await db.collection('transactions').add({
                userId: currentUser.uid, type: 'level_bonus', amount: bonus,
                description: `Level ${level} Bonus`,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {}
        showCoinAnimation(bonus, newCoins);
        showToast(`🎉 Level ${level} Bonus +${bonus} Coins!`, 'success');
    } catch (e) { showToast('❌ Failed', 'error'); }
    finally { setTimeout(() => releaseCoinLock(), 1500); }
}

// ============================================================
//  ACHIEVEMENTS
// ============================================================
function getAchProgress(ach) {
    if (ach.type === 'ads') return userData.totalAds || 0;
    if (ach.type === 'coins') return userData.coins || 0;
    if (ach.type === 'refs') return userData.referralCount || 0;
    return 0;
}
function updateAchievementsUI() {
    const grid = document.getElementById('achGrid');
    if (!grid) return;
    let unclaimedCount = 0;
    grid.innerHTML = ACHIEVEMENTS.map(ach => {
        const progress = getAchProgress(ach);
        const unlocked = progress >= ach.target;
        const claimed = userData.claimedAch && userData.claimedAch.includes(ach.id);
        const pct = Math.min((progress / ach.target) * 100, 100);
        if (unlocked && !claimed) unclaimedCount++;
        return `
            <div class="ach-card ${unlocked ? 'unlocked' : 'locked'}" onclick="${unlocked && !claimed ? `claimAchievement('${ach.id}', ${ach.reward})` : ''}">
                ${unlocked && !claimed ? '<div class="ach-claim-badge">NEW</div>' : ''}
                <div class="ach-reward">+${ach.reward}</div>
                <span class="ach-icon">${claimed ? '✅' : ach.icon}</span>
                <div class="ach-title">${ach.title}</div>
                <div class="ach-desc">${ach.desc}</div>
                <div class="ach-progress"><div class="ach-progress-fill" style="width:${pct}%"></div></div>
                <div style="font-size:8px;color:var(--text-3);margin-top:4px;">${Math.min(progress, ach.target)}/${ach.target}</div>
            </div>
        `;
    }).join('');
    const badge = document.getElementById('achBadge');
    if (badge) {
        if (unclaimedCount > 0) { badge.textContent = unclaimedCount; badge.style.display = 'flex'; }
        else badge.style.display = 'none';
    }
    const drawerBadge = document.getElementById('drawerAchBadge');
    if (drawerBadge) {
        if (unclaimedCount > 0) { drawerBadge.textContent = unclaimedCount; drawerBadge.style.display = 'inline-block'; }
        else drawerBadge.style.display = 'none';
    }
}
async function claimAchievement(id, reward) {
    if (userData.claimedAch && userData.claimedAch.includes(id)) return;
    const ach = ACHIEVEMENTS.find(a => a.id === id);
    if (!ach || getAchProgress(ach) < ach.target) return;
    if (!acquireCoinLock()) return;
    try {
        const newCoins = (userData.coins || 0) + reward;
        userData.coins = newCoins;
        userData.claimedAch = [...(userData.claimedAch || []), id];
        saveCoinsToLocal(newCoins);
        updateUI();
        updateAchievementsUI();
        try {
            await db.collection('users').doc(currentUser.uid).update({
                coins: firebase.firestore.FieldValue.increment(reward),
                claimedAch: firebase.firestore.FieldValue.arrayUnion(id)
            });
            await db.collection('transactions').add({
                userId: currentUser.uid, type: 'achievement', amount: reward,
                description: `Achievement: ${ach.title}`,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {}
        showCoinAnimation(reward, newCoins);
        showToast(`🏆 ${ach.title} +${reward} Coins!`, 'success');
    } catch (e) { showToast('❌ Failed', 'error'); }
    finally { setTimeout(() => releaseCoinLock(), 1500); }
}

// ============================================================
//  REFERRAL
// ============================================================
function updateReferralUI() {
    document.getElementById('myRefCode').textContent = userData.refCode || '------';
    document.getElementById('refCount').textContent = userData.referralCount || 0;
    document.getElementById('refEarned').textContent = userData.referralEarned || 0;
    loadReferralList();
}
async function loadReferralList() {
    if (!currentUser) return;
    const container = document.getElementById('refList');
    try {
        const snap = await db.collection('users').where('referredBy', '==', userData.refCode).limit(20).get();
        if (snap.empty) {
            container.innerHTML = '<div class="ref-empty">No referrals yet</div>';
            return;
        }
        let html = '';
        snap.forEach(doc => {
            const d = doc.data();
            const date = d.createdAt?.seconds ? new Date(d.createdAt.seconds * 1000) : new Date();
            html += `
                <div class="ref-item">
                    <div>
                        <div class="ri-name">${d.username || 'User'}</div>
                        <div class="ri-date">${date.toLocaleDateString()}</div>
                    </div>
                    <div class="ri-bonus">+${REFERRAL_BONUS}</div>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (e) { container.innerHTML = '<div class="ref-empty">Error</div>'; }
}
function copyRefCode() {
    const code = userData.refCode;
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
        showToast('📋 Copy ပြီးပါပြီ!', 'success');
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('📋 Copy ပြီးပါပြီ!', 'success');
    });
}
function shareReferral() {
    const text = `💰 CASH TUBE Rewards မှာ Ads ကြည့်ပြီး Coins ရယူပါ!\n\n🎁 ကျွန်တော့်ရဲ့ Referral Code: ${userData.refCode}\n\n👉 ${window.location.origin}${window.location.pathname}?ref=${userData.refCode}`;
    if (navigator.share) {
        navigator.share({ title: 'CASH TUBE Rewards', text, url: window.location.href }).catch(() => {});
    } else {
        navigator.clipboard.writeText(text).then(() => showToast('📋 Copy ပြီးပါပြီ!', 'success'));
    }
}

// ============================================================
//  LEADERBOARD
// ============================================================
async function loadLeaderboard(type = 'today') {
    currentLeaderboardType = type;
    const listEl = document.getElementById('lbList');
    const podiumEl = document.getElementById('lbPodium');
    listEl.innerHTML = '<div class="lb-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    podiumEl.innerHTML = '<div class="lb-loading">Loading...</div>';
    try {
        let users = [];
        if (type === 'today') {
            const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yangon' }).format(new Date());
            const snap = await db.collection('adWatches').where('date', '==', today).get();
            const records = [];
            snap.forEach(doc => records.push({ userId: doc.data().userId, ...doc.data() }));
            records.sort((a, b) => (b.totalCoins || 0) - (a.totalCoins || 0));
            const top = records.slice(0, 30);
            // Avoid 30 individual user reads. Firestore 'in' queries allow
            // up to 10 IDs, so fetch the user data in small groups.
            for (let i = 0; i < top.length; i += 10) {
                const group = top.slice(i, i + 10);
                const ids = group.map(r => r.userId).filter(Boolean);
                if (!ids.length) continue;
                try {
                    const uSnap = await db.collection('users')
                        .where(firebase.firestore.FieldPath.documentId(), 'in', ids).get();
                    const userMap = {};
                    uSnap.forEach(d => userMap[d.id] = d.data());
                    group.forEach(r => {
                        const d = userMap[r.userId];
                        if (d) users.push({
                            uid: r.userId, name: d.username || 'User',
                            coins: r.totalCoins || 0, ads: r.count || 0,
                            level: getLevelFromAds(d.totalAds || 0)
                        });
                    });
                } catch (e) {}
            }
        } else {
            const snap = await db.collection('users').orderBy('coins', 'desc').limit(30).get();
            snap.forEach(doc => {
                const d = doc.data();
                users.push({
                    uid: doc.id, name: d.username || 'User',
                    coins: d.coins || 0, ads: d.totalAds || 0,
                    level: getLevelFromAds(d.totalAds || 0)
                });
            });
        }

        if (users.length === 0) {
            listEl.innerHTML = '<div class="lb-loading">No data yet</div>';
            podiumEl.innerHTML = '<div class="lb-loading">No data yet</div>';
            return;
        }

        const top3 = users.slice(0, 3);
        let podiumHtml = '';
        podiumHtml += top3[1] ? `
            <div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;max-width:90px;">
                <div style="width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,var(--blue-400),var(--blue-600));display:flex;align-items:center;justify-content:center;font-size:22px;border:3px solid var(--blue-300);">🥈</div>
                <div style="font-size:10px;font-weight:700;text-align:center;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">${top3[1].name}</div>
                <div style="font-size:12px;font-weight:700;color:var(--blue-600);">${top3[1].coins.toLocaleString()}</div>
            </div>` : '';
        podiumHtml += top3[0] ? `
            <div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;max-width:90px;">
                <div style="font-size:24px;">👑</div>
                <div style="width:62px;height:62px;border-radius:50%;background:linear-gradient(135deg,var(--mint-400),var(--mint-600));display:flex;align-items:center;justify-content:center;font-size:26px;border:3px solid var(--mint-300);box-shadow:0 8px 20px rgba(16,185,129,0.4);">🥇</div>
                <div style="font-size:11px;font-weight:700;text-align:center;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">${top3[0].name}</div>
                <div style="font-size:13px;font-weight:700;color:var(--mint-600);">${top3[0].coins.toLocaleString()}</div>
            </div>` : '';
        podiumHtml += top3[2] ? `
            <div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;max-width:90px;">
                <div style="width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,var(--slate-400),var(--slate-600));display:flex;align-items:center;justify-content:center;font-size:22px;border:3px solid var(--slate-300);">🥉</div>
                <div style="font-size:10px;font-weight:700;text-align:center;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">${top3[2].name}</div>
                <div style="font-size:12px;font-weight:700;color:var(--slate-600);">${top3[2].coins.toLocaleString()}</div>
            </div>` : '';
        podiumEl.innerHTML = podiumHtml;

        const myUid = currentUser?.uid;
        let listHtml = '';
        users.forEach((u, i) => {
            const rank = i + 1;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
            const isMe = u.uid === myUid;
            listHtml += `
                <div class="lb-row ${isMe ? 'is-me' : ''} ${rank <= 3 ? 'rank-' + rank : ''}">
                    <div class="lb-rank">${medal}</div>
                    <div class="lb-avatar">${(u.name || 'U')[0].toUpperCase()}</div>
                    <div class="lb-info">
                        <div class="lb-name">${u.name}${isMe ? ' (You)' : ''}</div>
                        <div class="lb-level">Lv.${u.level} • ${u.ads} ads</div>
                    </div>
                    <div class="lb-value">
                        ${u.coins.toLocaleString()}
                        <span class="lb-label">COINS</span>
                    </div>
                </div>
            `;
        });
        listEl.innerHTML = listHtml;
    } catch (err) {
        console.error('Leaderboard error:', err);
        listEl.innerHTML = '<div class="lb-loading" style="color:var(--rose-500);">Error loading</div>';
    }
}
function switchLeaderboard(type, el) {
    document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    loadLeaderboard(type);
}

// ============================================================
//  AD CARDS
// ============================================================
function renderAdCards() {
    const container = document.getElementById('adGrid');
    if (!container) return;
    container.innerHTML = '';
    AD_CARDS.forEach((card) => {
        const lastClaimKey = 'adClaim_' + card.id + '_' + (currentUser?.uid || 'guest');
        const lastClaim = parseInt(localStorage.getItem(lastClaimKey) || '0');
        const now = Date.now();
        const remaining = COOLDOWN - (now - lastClaim);
        const isCooldown = lastClaim > 0 && remaining > 0;
        const cardEl = document.createElement('div');
        cardEl.className = 'ad-card ' + (isCooldown ? 'cooldown' : 'available');
        const btnClass = card.type === 'watch' ? 'watch' : 'download';
        const btnIcon = card.type === 'watch' ? 'fa-play' : 'fa-download';
        const btnText = card.type === 'watch' ? (currentLang === 'my' ? 'ကြည့်မည်' : 'Watch') : (currentLang === 'my' ? 'ဒေါင်းလုဒ်' : 'Download');
        cardEl.innerHTML = `
            <span class="ad-icon">${card.icon}</span>
            <div class="ad-title">${card.title}</div>
            <div class="ad-reward"><span class="ad-amount">+${card.reward}</span><span class="ad-coin">🪙</span></div>
            <button class="ad-btn ${btnClass}" ${isCooldown ? 'disabled' : ''} onclick="startAdTask('${card.id}')"><i class="fas ${btnIcon}"></i> ${btnText}</button>
            <div class="ad-cd" id="cooldown_${card.id}">${isCooldown ? formatTime(remaining) + (currentLang === 'my' ? ' စောင့်ပါ' : ' wait') : ''}</div>
        `;
        container.appendChild(cardEl);
        if (isCooldown) startCardCooldownTimer(card.id, remaining);
    });
}
function formatTime(ms) {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return m + ':' + String(s).padStart(2, '0');
}
function startCardCooldownTimer(cardId, remaining) {
    if (adCardTimers[cardId]) clearInterval(adCardTimers[cardId]);
    adCardTimers[cardId] = setInterval(() => {
        remaining -= 1000;
        if (remaining <= 0) { clearInterval(adCardTimers[cardId]); delete adCardTimers[cardId]; renderAdCards(); return; }
        const el = document.getElementById('cooldown_' + cardId);
        if (el) el.textContent = formatTime(remaining) + (currentLang === 'my' ? ' စောင့်ပါ' : ' wait');
    }, 1000);
}

// ============================================================
//  START AD
// ============================================================
function startAdTask(cardId) {
    if (!currentUser) { showToast('❌ Please login', 'error'); return; }
    if (isAdPlaying) { showToast('⏳ Ad ကနေဆဲ', 'warning'); return; }
    const card = AD_CARDS.find(c => c.id === cardId);
    if (!card) return;

    const rotationIndex = adLinks.length > 0 ? ((Number(userData.totalAds) || 0) % adLinks.length) : 0;
    let adUrl = card.type === 'watch' ? (adLinks[rotationIndex] || appLinks[0] || '') : (appLinks[0] || adLinks[rotationIndex] || '');
    if (!adUrl) { showToast('❌ Link မရှိ', 'error'); return; }
    if (!adUrl.startsWith('http')) adUrl = 'https://' + adUrl;

    // Open the ad website directly in a new browser tab/window.
    // No iframe is used, so ad networks can load normally without iframe restrictions.
    let adWindow = null;
    try { adWindow = window.open(adUrl, '_blank'); } catch (e) {}
    if (!adWindow) {
        showToast('⚠️ Browser က Ad ဖွင့်ခွင့်ပိတ်ထားပါတယ်။ Allow pop-ups လုပ်ပြီး ပြန်နှိပ်ပါ။', 'warning');
        return;
    }
    try { adWindow.focus(); } catch (e) {}

    currentAdCard = card;
    isAdPlaying = true;

    const adPage = document.getElementById('adPage');
    const mainContainer = document.getElementById('appContainer');
    if (mainContainer) mainContainer.style.display = 'none';
    if (adPage) adPage.classList.add('show');

    const loading = document.getElementById('adPageLoading');
    const progressBar = document.getElementById('adPageProgress');
    const timerEl = document.getElementById('adPageTimer');
    const claimBtn = document.getElementById('adPageClaimBtn');

    if (loading) {
        loading.style.display = 'flex';
        loading.innerHTML = '<i class="fas fa-external-link-alt"></i><p>Ad website ကို Browser မှာ ဖွင့်ထားပါတယ်</p>';
    }
    if (progressBar) progressBar.style.width = '0%';
    if (timerEl) timerEl.textContent = AD_DURATION;
    if (claimBtn) {
        claimBtn.disabled = true;
        claimBtn.className = 'ad-page-claim-btn';
        claimBtn.innerHTML = `⏳ ${AD_DURATION}s ပြည့်ရင် Coin ရမည်...`;
    }

    let isClaimed = false;
    const startTime = Date.now();
    if (adPageInterval) clearInterval(adPageInterval);

    adPageInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const timeLeft = Math.max(AD_DURATION - elapsed, 0);
        const progressPercent = Math.min((elapsed / AD_DURATION) * 100, 100);
        if (progressBar) progressBar.style.width = progressPercent + '%';
        if (timerEl) timerEl.textContent = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(adPageInterval);
            adPageInterval = null;
            if (progressBar) progressBar.style.width = '100%';
            if (loading) loading.style.display = 'none';

            if (card.type === 'watch') {
                if (claimBtn) {
                    claimBtn.disabled = false;
                    claimBtn.className = 'ad-page-claim-btn active';
                    claimBtn.innerHTML = `✅ +${card.reward} Coins`;
                }
                setTimeout(() => {
                    if (!isClaimed) {
                        isClaimed = true;
                        claimAdReward();
                    }
                }, 500);
            } else {
                if (claimBtn) {
                    claimBtn.disabled = false;
                    claimBtn.className = 'ad-page-claim-btn active';
                    claimBtn.innerHTML = `✅ Claim ${card.reward} Coins`;
                    claimBtn.onclick = function () {
                        if (isClaimed) return;
                        isClaimed = true;
                        claimBtn.disabled = true;
                        claimBtn.innerHTML = '⏳ Adding...';
                        claimAdReward();
                    };
                }
            }
        }
    }, 250);
}

function closeAdPageAndReturn() {
    if (adPageInterval) { clearInterval(adPageInterval); adPageInterval = null; }
    const adPage = document.getElementById('adPage');
    if (adPage) adPage.classList.remove('show');
    const mainContainer = document.getElementById('appContainer');
    if (mainContainer) mainContainer.style.display = 'flex';
    isAdPlaying = false;
    currentAdCard = null;
    const progressBar = document.getElementById('adPageProgress');
    if (progressBar) progressBar.style.width = '0%';
    const timerEl = document.getElementById('adPageTimer');
    if (timerEl) timerEl.textContent = AD_DURATION;
}

async function claimAdReward() {
    if (!currentUser || !currentAdCard) return;
    if (!acquireCoinLock()) { showToast('⏳ Please wait', 'warning'); return; }
    try {
        const reward = currentAdCard.reward;
        const newCoins = (userData.coins || 0) + reward;
        const newAds = (userData.totalAds || 0) + 1;
        userData.coins = newCoins;
        userData.totalAds = newAds;
        saveCoinsToLocal(newCoins);
        updateUI();
        updateLevelUI();
        updateAchievementsUI();

        // Queue the Firestore writes. One batch is committed every few ads.
        const pending = getPendingAdRewards();
        pending.count += 1;
        pending.coins += reward;
        pending.lastTitle = currentAdCard.title || 'Ad Watch';
        setPendingAdRewards(pending);

        const flushed = await flushPendingAdRewards(false);
        localStorage.setItem('adClaim_' + currentAdCard.id + '_' + currentUser.uid, Date.now().toString());
        closeAdPageAndReturn();
        showCoinAnimation(reward, newCoins);
        renderAdCards();
        showToast(`✅ +${reward} Coins ရပါပြီ!`, 'success');
        if (flushed) loadDashboard();
    } catch (error) {
        showToast('❌ Failed', 'error');
        closeAdPageAndReturn();
    } finally {
        setTimeout(() => releaseCoinLock(), 300);
    }
}

async function saveAdWatchRecord(reward) {
    // Kept for compatibility with older code paths. New ad rewards use
    // flushPendingAdRewards() so repeated views do not hit Firestore.
    const pending = getPendingAdRewards();
    pending.count += 1;
    pending.coins += reward;
    setPendingAdRewards(pending);
    return await flushPendingAdRewards(false);
}

// ============================================================
//  DASHBOARD
// ============================================================
async function loadDashboard() {
    if (!currentUser) return;
    const topCard = document.getElementById('topViewerCard');
    const historyList = document.getElementById('adHistoryList');
    topCard.innerHTML = '<div class="dtt-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    historyList.innerHTML = '<div class="dlt-loading">Loading...</div>';
    try {
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yangon' }).format(new Date());
        const snapshot = await db.collection('adWatches').where('date', '==', today).get();
        const records = [];
        snapshot.forEach(doc => records.push({ id: doc.id, ...doc.data() }));

        // Include locally queued ads so Dashboard shows today's activity
        // even before the 5-ad Firestore sync batch is reached.
        const pending = getPendingAdRewards();
        if (pending.count > 0) {
            const myRecord = records.find(r => r.userId === currentUser.uid);
            if (myRecord) {
                myRecord.count = Number(myRecord.count || 0) + Number(pending.count || 0);
                myRecord.totalCoins = Number(myRecord.totalCoins || 0) + Number(pending.coins || 0);
            } else {
                records.push({
                    id: 'local_pending_' + currentUser.uid,
                    userId: currentUser.uid,
                    authUid: currentUser.uid,
                    username: userData.username || 'User',
                    email: userData.email || '',
                    date: today,
                    count: Number(pending.count || 0),
                    totalCoins: Number(pending.coins || 0),
                    _localPending: true
                });
            }
        }

        if (records.length === 0) {
            topCard.innerHTML = '<div class="dtt-loading">🎯 ဒီနေ့ ဘယ်သူမှ မကြည့်ရသေးပါ</div>';
            historyList.innerHTML = '<div class="dlt-loading">No records yet</div>';
            return;
        }

        // Rank everyone by today's ad count: highest first.
        records.sort((a, b) => {
            const countDiff = Number(b.count || 0) - Number(a.count || 0);
            if (countDiff !== 0) return countDiff;
            return String(a.username || a.email || '').localeCompare(String(b.username || b.email || ''));
        });
        const myRecord = records.find(r => r.userId === currentUser.uid);
        const myCount = myRecord ? (myRecord.count || 0) : 0;
        const top = records[0];
        const isMeTop = top.userId === currentUser.uid;
        const progressPercent = Math.min((myCount / TOP_BONUS_TARGET) * 100, 100);
        const isComplete = myCount >= TOP_BONUS_TARGET;
        const bonusClaimedKey = 'topBonusClaimed_' + today + '_' + currentUser.uid;
        const bonusClaimed = localStorage.getItem(bonusClaimedKey) === 'true';

        let claimBtnHtml = '';
        if (isComplete && !bonusClaimed) {
            claimBtnHtml = `<button style="width:100%;padding:12px;border:none;border-radius:12px;background:linear-gradient(135deg,var(--mint-500),var(--mint-700));color:#fff;font-weight:700;font-size:13px;cursor:pointer;box-shadow:0 6px 20px rgba(16,185,129,0.4);margin-top:12px;display:flex;align-items:center;justify-content:center;gap:8px;" onclick="claimTopBonus(${TOP_BONUS})"><i class="fas fa-crown"></i> Bonus +${TOP_BONUS} Coins</button>`;
        } else if (bonusClaimed) {
            claimBtnHtml = `<div style="text-align:center;padding:12px;color:var(--mint-600);font-size:13px;font-weight:700;">✅ Bonus ရယူပြီးပါပြီ</div>`;
        } else {
            claimBtnHtml = `<button style="width:100%;padding:12px;border:none;border-radius:12px;background:var(--slate-200);color:var(--text-3);font-weight:700;font-size:13px;cursor:not-allowed;margin-top:12px;display:flex;align-items:center;justify-content:center;gap:8px;" disabled><i class="fas fa-lock"></i> Ad ${TOP_BONUS_TARGET} ခု ကြည့်ပါ (${myCount}/${TOP_BONUS_TARGET})</button>`;
        }

        topCard.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;">
                <div style="font-size:32px;">🥇</div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:14px;font-weight:700;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${top.username || 'User'}${isMeTop ? ' (You)' : ''}</div>
                    <div style="font-size:11px;color:var(--text-2);margin-top:2px;">👁️ ${top.count || 0} ads • 🪙 ${top.totalCoins || 0}</div>
                </div>
                <div style="background:var(--blue-500);color:#fff;padding:4px 12px;border-radius:999px;font-size:9px;font-weight:700;">TOP</div>
            </div>
            <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(59,130,246,0.15);">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:11px;font-weight:700;">
                    <span style="color:var(--text-2);">🎯 Progress</span>
                    <span style="color:var(--blue-600);">${myCount}/${TOP_BONUS_TARGET}</span>
                </div>
                <div style="width:100%;height:8px;background:var(--slate-200);border-radius:8px;overflow:hidden;">
                    <div style="height:100%;width:${progressPercent}%;background:linear-gradient(90deg,var(--blue-500),var(--mint-500));border-radius:8px;transition:width 0.6s;"></div>
                </div>
            </div>
        `;
        const btnWrapper = document.createElement('div');
        btnWrapper.innerHTML = claimBtnHtml;
        topCard.appendChild(btnWrapper.firstElementChild);

        // Show ALL today's ad viewers ranked by ad count.
        // Highest ad count = Rank 1.
        let historyHtml = '';
        records.forEach((r, i) => {
            const rank = i + 1;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank + '.';
            const isMe = r.userId === currentUser.uid;
            const isTop = rank === 1;
            historyHtml += `
                <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:${isTop ? 'linear-gradient(135deg,var(--mint-50),var(--blue-50))' : 'var(--slate-50)'};border-radius:12px;border:1px solid ${isTop ? 'var(--mint-300)' : 'var(--border-light)'};font-size:12px;">
                    <div style="font-weight:800;width:28px;text-align:center;color:${isTop ? 'var(--mint-600)' : 'var(--text-3)'};font-size:${rank <= 3 ? '18px' : '12px'};">${medal}</div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:700;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                            ${r.username || 'User'}${isMe ? ' (You)' : ''}
                        </div>
                        ${r.email ? `<div style="font-size:9px;color:var(--text-3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.email}</div>` : ''}
                    </div>
                    <div style="background:var(--blue-500);color:#fff;padding:4px 10px;border-radius:999px;font-weight:800;font-size:10px;white-space:nowrap;">
                        ${r.count || 0} ads
                    </div>
                </div>
            `;
        });
        historyList.innerHTML = historyHtml;
    } catch (err) {
        topCard.innerHTML = '<div class="dtt-loading">❌ Error</div>';
        historyList.innerHTML = '<div class="dlt-loading">No records</div>';
    }
}

async function claimTopBonus(amount) {
    if (!currentUser) return;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yangon' }).format(new Date());
    const claimedKey = 'topBonusClaimed_' + today + '_' + currentUser.uid;
    if (localStorage.getItem(claimedKey) === 'true') { showToast('❌ ရယူပြီးပါပြီ', 'error'); return; }
    if (!acquireCoinLock()) return;
    try {
        const newCoins = (userData.coins || 0) + amount;
        userData.coins = newCoins;
        saveCoinsToLocal(newCoins);
        updateUI();
        try {
            await db.collection('users').doc(currentUser.uid).update({ coins: firebase.firestore.FieldValue.increment(amount) });
            await db.collection('transactions').add({ userId: currentUser.uid, type: 'top_viewer_bonus', amount, description: `Top Viewer Bonus`, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
        } catch (e) {}
        localStorage.setItem(claimedKey, 'true');
        showCoinAnimation(amount, newCoins);
        showToast(`🎉 +${amount} Coins!`, 'success');
        loadDashboard();
    } catch (e) {}
    finally { setTimeout(() => releaseCoinLock(), 1500); }
}

// ============================================================
//  DAILY BONUS
// ============================================================
function updateDailyBonusUI() {
    const btn = document.getElementById('dailyBonusBtn');
    const cdEl = document.getElementById('dailyBonusCooldown');
    if (!btn || !currentUser) return;
    const lastClaimKey = 'dailyBonus_' + currentUser.uid;
    const lastClaim = parseInt(localStorage.getItem(lastClaimKey) || '0');
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const remaining = ONE_DAY - (now - lastClaim);
    if (lastClaim > 0 && remaining > 0) {
        btn.disabled = true;
        const h = Math.floor(remaining / 3600000);
        const m = Math.floor((remaining % 3600000) / 60000);
        cdEl.textContent = `⏳ ${h}h ${m}m wait`;
    } else { btn.disabled = false; cdEl.textContent = ''; }
}

async function claimDailyBonus() {
    if (!currentUser) { showToast('❌ Please login', 'error'); return; }
    const lastClaimKey = 'dailyBonus_' + currentUser.uid;
    const lastClaim = parseInt(localStorage.getItem(lastClaimKey) || '0');
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    if (lastClaim > 0 && (now - lastClaim) < ONE_DAY) { showToast('❌ ရယူပြီးပါပြီ', 'error'); return; }
    if (!acquireCoinLock()) return;
    try {
        const reward = 100;
        userData.coins += reward;
        saveCoinsToLocal(userData.coins);
        updateUI();
        try {
            await db.collection('users').doc(currentUser.uid).update({ coins: firebase.firestore.FieldValue.increment(reward) });
            await db.collection('transactions').add({ userId: currentUser.uid, type: 'daily_bonus', amount: reward, description: 'Daily Bonus', timestamp: firebase.firestore.FieldValue.serverTimestamp() });
        } catch (e) {}
        localStorage.setItem(lastClaimKey, now.toString());
        updateDailyBonusUI();
        showCoinAnimation(reward, userData.coins);
        showToast('🎁 +100 Coins!', 'success');
    } catch (e) {}
    finally { releaseCoinLock(); }
}

// ============================================================
//  UI UPDATE
// ============================================================
function updateUI() {
    userData.profileFrames = Array.isArray(userData.profileFrames) ? userData.profileFrames : [];
    userData.profileFrame = userData.profileFrame || 'none';
    const coins = userData.coins || 0;
    const mmk = Math.max(0, Number(userData.mmkBalance || 0));
    const username = userData.username || 'User';
    document.getElementById('totalCoins').textContent = coins;
    if (document.getElementById('profileCoins')) document.getElementById('profileCoins').textContent = coins;
    if (document.getElementById('profileUsdt')) document.getElementById('profileUsdt').textContent = mmk.toLocaleString() + ' MMK';
    if (document.getElementById('profileName')) document.getElementById('profileName').value = username;
    if (document.getElementById('profileEmail')) document.getElementById('profileEmail').value = userData.email || '';
    document.getElementById('marketUsdt').textContent = mmk.toLocaleString() + ' MMK';
    document.getElementById('exchangeCoins').textContent = coins;
    document.getElementById('headerUsdt').textContent = mmk.toLocaleString() + ' MMK';
    const wb = document.getElementById('withdrawBalanceMmk');
    if (wb) wb.textContent = mmk.toLocaleString() + ' MMK';

    const avatar = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(username) + '&background=3b82f6&color=fff&size=72';
    const savedImg = localStorage.getItem('profileImg');
    const profileSrc = savedImg || avatar;
    if (document.getElementById('profileImg')) document.getElementById('profileImg').src = profileSrc;
    if (document.getElementById('headerAvatar')) document.getElementById('headerAvatar').src = profileSrc;
    if (document.getElementById('drawerAvatar')) document.getElementById('drawerAvatar').src = profileSrc;
    applyProfileFrame(userData.profileFrame || 'none');
    if (document.getElementById('frameShopCoins')) document.getElementById('frameShopCoins').textContent = coins;
    renderFrameShop();
    if (document.getElementById('drawerUsername')) document.getElementById('drawerUsername').textContent = username;
    if (document.getElementById('drawerEmail')) document.getElementById('drawerEmail').textContent = userData.email || 'user@email.com';
    if (document.getElementById('drawerCoins')) document.getElementById('drawerCoins').textContent = coins;
    if (document.getElementById('drawerUsdt')) document.getElementById('drawerUsdt').textContent = mmk.toLocaleString() + ' MMK';
    if (document.getElementById('headerLevel')) document.getElementById('headerLevel').textContent = `Lv.${getCurrentLevel().level} • Online`;

    updateWithdrawUI();
    updateExchangeRateUI();
    updateExchangeStatusUI();
    updateLevelUI();
    updateAchievementsUI();
    updateReferralUI();
}

function updateWithdrawUI() {
    const statusEl = document.getElementById('withdrawStatus');
    const btn = document.getElementById('withdrawBtn');
    if (!statusEl || !btn) return;

    if (isWithdrawOpen) {
        statusEl.textContent = '✅ Open';
        statusEl.style.color = 'var(--mint-600)';
    } else {
        statusEl.textContent = '🔒 Locked';
        statusEl.style.color = 'var(--rose-500)';
    }

    // Keep Withdraw button clickable.
    // requestWithdraw() will check whether Withdraw is open.
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
}

// ============================================================
//  EXCHANGE
// ============================================================
// CASHTUBE_WITHDRAW_CACHE_V1
async function loadWithdrawControlCached(forceRefresh = false) {
    const key = 'cachedWithdrawControl';
    const ttl = 60 * 1000;

    if (!forceRefresh) {
        try {
            const cached = JSON.parse(localStorage.getItem(key) || 'null');
            if (cached && typeof cached.isOpen === 'boolean' &&
                Date.now() - Number(cached.timestamp || 0) < ttl) {
                isWithdrawOpen = cached.isOpen;
                localStorage.setItem('isWithdrawOpen', String(isWithdrawOpen));
                updateWithdrawUI();
                return;
            }
        } catch (e) {}
    }

    try {
        const w = await db.collection('settings').doc('withdrawControl').get();
        let openDate = null;

        if (w.exists) {
            const data = w.data() || {};
            if (typeof data.isOpen === 'boolean') isWithdrawOpen = data.isOpen;
            openDate = data.openDate || null;
        }

        localStorage.setItem('isWithdrawOpen', String(isWithdrawOpen));
        localStorage.setItem(key, JSON.stringify({
            isOpen: isWithdrawOpen,
            openDate,
            timestamp: Date.now()
        }));
        updateWithdrawUI();
    } catch (e) {
        // Keep the last known status if the network read fails.
    }
}

function cacheWithdrawControlStatus(open, openDate = null) {
    isWithdrawOpen = Boolean(open);
    localStorage.setItem('isWithdrawOpen', String(isWithdrawOpen));
    localStorage.setItem('cachedWithdrawControl', JSON.stringify({
        isOpen: isWithdrawOpen,
        openDate,
        timestamp: Date.now()
    }));
    updateWithdrawUI();
}

async function loadExchangeRate() {
    const cacheKey = 'cachedExchangeRate';
    const TTL = 5 * 60 * 1000;
    try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
        if (cached && Date.now() - cached.timestamp < TTL) {
            exchangeRate = cached.rate || 3000;
            mmkRate = cached.mmkRate || 0;
            coinMmkRate = Number(cached.coinMmkRate) || ((mmkRate > 0 && exchangeRate > 0) ? (mmkRate / exchangeRate) * 10000 : 0);
            isExchangeOpen = cached.isExchangeOpen !== false;
            exchangeOpenDate = cached.openDate || null;
            AD_REWARD = cached.adReward || 30;
            VIDEO_REWARD = AD_REWARD;
            AD_CARDS.forEach(c => c.reward = AD_REWARD);
            updateExchangeRateUI();
            updateExchangeStatusUI();
            updateAdRewardUI();
            await loadWithdrawControlCached();
            return;
        }
    } catch (e) {}

    try {
        const doc = await db.collection('settings').doc('exchangeRate').get();
        if (doc.exists) {
            const data = doc.data();
            exchangeRate = data.rate || 3000;
            mmkRate = data.mmkRate || 0;
            coinMmkRate = Number(data.coinMmkRate) || ((mmkRate > 0 && exchangeRate > 0) ? (mmkRate / exchangeRate) * 10000 : 0);
            isExchangeOpen = data.isExchangeOpen !== false;
        exchangeOpenDate = data.openDate || null;
            AD_REWARD = Number(data.adReward) > 0 ? Number(data.adReward) : 30;
            VIDEO_REWARD = AD_REWARD;
            localStorage.setItem(cacheKey, JSON.stringify({
                rate: exchangeRate, mmkRate, coinMmkRate, isExchangeOpen, openDate: exchangeOpenDate, adReward: AD_REWARD, timestamp: Date.now()
            }));
        } else {
            await db.collection('settings').doc('exchangeRate').set({
                rate: 3000, mmkRate: 0, coinMmkRate: 0, isExchangeOpen: true, adReward: 30,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            AD_REWARD = 30;
            VIDEO_REWARD = AD_REWARD;
        }
    } catch (e) {
        exchangeRate = 3000; mmkRate = 0; coinMmkRate = 0; isExchangeOpen = true; AD_REWARD = 30; VIDEO_REWARD = AD_REWARD;
    }
    AD_CARDS.forEach(c => c.reward = AD_REWARD);
    updateExchangeRateUI();
    updateExchangeStatusUI();
    updateAdRewardUI();
    await loadWithdrawControlCached();
}

function updateExchangeRateUI() {
    const directRate = Number(coinMmkRate) || 0;
    const display = directRate > 0 ? directRate.toLocaleString() + ' MMK / 10,000 Coins' : '--- MMK / 10,000 Coins';
    const perCoin = directRate > 0 ? (directRate / 10000) : 0;
    const el1 = document.getElementById('marketRate');
    const el2 = document.getElementById('exchangeRateDisplay');
    const el3 = document.getElementById('currentRateDisplay');
    const el4 = document.getElementById('marketMmkRate');
    const el5 = document.getElementById('currentMmkRateDisplay');
    const el6 = document.getElementById('currentCoinMmkRateDisplay');
    if (el1) el1.textContent = display;
    if (el2) el2.textContent = display;
    if (el3) el3.textContent = directRate > 0 ? directRate.toLocaleString() : '---';
    if (el4) el4.textContent = directRate > 0 ? '1 Coin = ' + perCoin.toLocaleString(undefined, {maximumFractionDigits: 4}) + ' MMK' : '1 Coin = --- MMK';
    if (el5) el5.textContent = directRate > 0 ? directRate.toLocaleString() : '---';
    if (el6) el6.textContent = directRate > 0 ? directRate.toLocaleString() : '---';
    const adminCoinMmk = document.getElementById('adminCoinMmkRate');
    if (adminCoinMmk) adminCoinMmk.value = directRate > 0 ? directRate : '';
}

function isExchangeDateOpen() {
    if (!exchangeOpenDate) return true;

    const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Yangon'
    }).format(new Date());

    return today >= exchangeOpenDate;
}

async function adminSetExchangeDate() {
    const date = document.getElementById('adminExchangeDate').value;
    if (!date) return;

    exchangeOpenDate = date;
    isExchangeOpen = true;

    try {
        await db.collection('settings').doc('exchangeRate').set({
            openDate: date,
            rate: exchangeRate,
            mmkRate,
            coinMmkRate,
            isExchangeOpen,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        localStorage.removeItem('cachedExchangeRate');

        const display = document.getElementById('currentExchangeDateDisplay');
        if (display) display.textContent = date;

        updateExchangeStatusUI();
        showToast('✅ Exchange Date Set: ' + date);
    } catch (e) {
        console.error('adminSetExchangeDate:', e);
        showToast('❌ Exchange Date Save Failed', 'error');
    }
}

function updateExchangeStatusUI() {
    const statusDisplay = document.getElementById('exchangeStatusDisplay');
    const dateInput = document.getElementById('adminExchangeDate');
    const dateDisplay = document.getElementById('currentExchangeDateDisplay');
    if (dateInput && exchangeOpenDate) dateInput.value = exchangeOpenDate;
    if (dateDisplay) dateDisplay.textContent = exchangeOpenDate || '---';

    const toggleBtn = document.getElementById('toggleExchangeBtn');
    const lockedMsg = document.getElementById('exchangeLockedMsg');
    const lockedNotice = document.getElementById('exchangeLockedNotice');
    const confirmBtn = document.getElementById('exchangeConfirmBtn');
    const exchangeActuallyOpen = isExchangeOpen && isExchangeDateOpen();

    if (exchangeActuallyOpen) {
        if (statusDisplay) { statusDisplay.textContent = 'OPEN'; statusDisplay.style.color = 'var(--mint-600)'; }
        if (toggleBtn) { toggleBtn.textContent = '🔓 Exchange Open'; toggleBtn.style.background = 'linear-gradient(135deg, var(--mint-500), var(--mint-700))'; toggleBtn.style.color = '#fff'; }
        if (lockedMsg) lockedMsg.classList.remove('show');
        if (lockedNotice) lockedNotice.classList.remove('show');
        if (confirmBtn) confirmBtn.disabled = false;
    } else {
        if (statusDisplay) { statusDisplay.textContent = 'CLOSED'; statusDisplay.style.color = 'var(--rose-500)'; }
        if (toggleBtn) { toggleBtn.textContent = '🔒 Exchange Closed'; toggleBtn.style.background = 'linear-gradient(135deg, var(--rose-500), var(--rose-600))'; toggleBtn.style.color = '#fff'; }
        if (lockedMsg) lockedMsg.classList.add('show');
        if (lockedNotice) lockedNotice.classList.add('show');
        if (confirmBtn) confirmBtn.disabled = true;
    }
}

function updateAdRewardUI() {
    const d = document.getElementById('currentAdRewardDisplay');
    const input = document.getElementById('adminAdReward');
    if (d) d.textContent = AD_REWARD;
    if (input && isAdmin) input.value = AD_REWARD;
}
async function adminSetAdReward() {
    const reward = parseInt(document.getElementById('adminAdReward').value);
    if (!reward || reward < 1 || reward > 100000) { showToast('Invalid reward', 'error'); return; }
    AD_REWARD = reward;
    VIDEO_REWARD = reward;
    AD_CARDS.forEach(c => c.reward = AD_REWARD);
    await db.collection('settings').doc('exchangeRate').set({
        rate: exchangeRate, mmkRate, coinMmkRate, isExchangeOpen, adReward: AD_REWARD,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    localStorage.removeItem('cachedExchangeRate');
    updateAdRewardUI();
    renderAdCards();
    showToast(`✅ Ad/Video reward ${reward} Coins သတ်မှတ်ပြီးပါပြီ`);
}
async function adminSetRefCode() {
    const code = document.getElementById('adminRefCodeManage').value.trim().toUpperCase();
    if (!code || code.length < 6) { showToast('Referral Code အနည်းဆုံး ၆ လုံးလိုသည်', 'error'); return; }
    await db.collection('settings').doc('adminAccess').set({
        refCode: code,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    showToast('✅ Admin Referral Code ပြောင်းပြီးပါပြီ');
}
async function adminSetCoinMmkRate() {
    const rate = Number(document.getElementById('adminCoinMmkRate').value);
    if (!Number.isFinite(rate) || rate <= 0) { showToast('Invalid MMK rate', 'error'); return; }
    coinMmkRate = rate;
    // Keep legacy fields synchronized for old data/functions.
    mmkRate = (exchangeRate > 0) ? (rate / 10000) * exchangeRate : 0;
    await db.collection('settings').doc('exchangeRate').set({
        coinMmkRate: rate,
        rate: exchangeRate,
        mmkRate,
        isExchangeOpen,
        adReward: AD_REWARD,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    localStorage.removeItem('cachedExchangeRate');
    updateExchangeRateUI();
    updateUI();
    showToast(`✅ 10,000 Coins = ${rate.toLocaleString()} MMK သတ်မှတ်ပြီးပါပြီ`);
}
async function adminSetRate() {
    const rate = parseInt(document.getElementById('adminRate').value);
    if (!rate || rate < 1) { showToast('Invalid', 'error'); return; }
    await db.collection('settings').doc('exchangeRate').set({ rate, mmkRate, coinMmkRate, isExchangeOpen, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }); localStorage.removeItem('cachedExchangeRate');
    exchangeRate = rate;
    updateExchangeRateUI();
    showToast('✅ Rate set');
}
async function adminSetMmkRate() {
    const rate = parseInt(document.getElementById('adminMmkRate').value);
    if (!rate || rate < 1) { showToast('Invalid', 'error'); return; }
    await db.collection('settings').doc('exchangeRate').set({ rate: exchangeRate, mmkRate: rate, isExchangeOpen, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }); localStorage.removeItem('cachedExchangeRate');
    mmkRate = rate;
    updateExchangeRateUI();
    showToast('✅ MMK set');
}
async function adminToggleExchange() {
    isExchangeOpen = !isExchangeOpen;
    await db.collection('settings').doc('exchangeRate').set({ rate: exchangeRate, mmkRate, isExchangeOpen, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }); localStorage.removeItem('cachedExchangeRate');
    updateExchangeStatusUI();
    showToast(isExchangeOpen ? '✅ Opened' : '🔒 Closed');
}
function openExchangeFromMarket() {
    if (!(isExchangeOpen && isExchangeDateOpen())) { showToast('🔒 Exchange ပိတ်ထားပါသည်', 'warning'); return; }
    openModal('exchangeModal');
}
function setExchangeAmount(val) { document.getElementById('exchangeInput').value = val; calculateExchange(); }
function calculateExchange() {
    const amt = parseInt(document.getElementById('exchangeInput').value) || 0;
    const result = document.getElementById('exchangeUsdt');
    if (amt <= 0) { result.textContent = '0 MMK'; return; }
    if (amt > (userData.coins || 0)) { result.textContent = 'Insufficient'; result.style.color = 'var(--rose-500)'; return; }
    if (!coinMmkRate || coinMmkRate <= 0) { result.textContent = 'Coin → MMK Rate မသတ်မှတ်ရသေးပါ'; result.style.color = 'var(--rose-500)'; return; }
    const mmk = (amt / 10000) * coinMmkRate;
    result.textContent = mmk.toLocaleString(undefined, {maximumFractionDigits: 0}) + ' MMK';
    result.style.color = 'var(--mint-600)';
}

async function confirmExchange() {
    if (!currentUser) { showToast('❌ Please login', 'error'); return; }
    if (!(isExchangeOpen && isExchangeDateOpen())) { showToast('🔒 Exchange ပိတ်ထားပါသည်', 'error'); return; }
    if (!coinMmkRate || coinMmkRate <= 0) { showToast('❌ Admin မှ 10,000 Coin = MMK Rate သတ်မှတ်ပေးရန်လိုသည်', 'error'); return; }
    if (!acquireCoinLock()) { showToast('⏳ Please wait...', 'warning'); return; }

    try {
        const amt = parseInt(document.getElementById('exchangeInput').value) || 0;
        if (amt <= 0) { showToast('Invalid', 'error'); return; }
        const mmkAmount = (amt / 10000) * coinMmkRate;
        if (!confirm(`${amt.toLocaleString()} Coins → ${mmkAmount.toLocaleString(undefined,{maximumFractionDigits:0})} MMK?`)) return;

        const userRef = db.collection('users').doc(currentUser.uid);
        const result = await db.runTransaction(async (tx) => {
            const snap = await tx.get(userRef);
            if (!snap.exists) throw new Error('USER_NOT_FOUND');
            const data = snap.data() || {};
            const serverCoins = Math.max(0, Number(data.coins) || 0);
            const serverMmk = Math.max(0, Number(data.mmkBalance) || 0);
            if (serverCoins < amt) throw new Error('INSUFFICIENT_COINS');
            const newCoins = serverCoins - amt;
            const newMmk = serverMmk + mmkAmount;
            tx.update(userRef, { coins: newCoins, mmkBalance: newMmk });
            return { coins: newCoins, mmkBalance: newMmk };
        });

        userData.coins = result.coins;
        userData.mmkBalance = result.mmkBalance;
        saveCoinsToLocal(result.coins);
        updateUI();

        try {
            await db.collection('transactions').add({
                userId: currentUser.uid, type: 'coin_exchange',
                amount: -amt,
                mmkAmount: mmkAmount,
                description: `${amt} Coins → ${mmkAmount.toLocaleString()} MMK`,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {}
        document.getElementById('exchangeInput').value = '';
        document.getElementById('exchangeUsdt').textContent = '0 MMK';
        showToast('✅ MMK အဖြစ်ပြောင်းပြီးပါပြီ');
        closeModal('exchangeModal');
    } catch (e) {
        if (e.message === 'INSUFFICIENT_COINS') showToast('❌ Insufficient Coins', 'error');
        else showToast('❌ Exchange failed', 'error');
    } finally {
        setTimeout(() => releaseCoinLock(), 1200);
    }
}

async function requestWithdraw() {
    if (!isWithdrawOpen) { showToast('❌ Withdraw ပိတ်ထားပါသည်', 'error'); return; }
    if (!currentUser) { showToast('❌ Please login', 'error'); return; }

    const amount = Number(document.getElementById('withdrawAmount').value);
    const method = document.getElementById('withdrawMethod').value;
    const accountName = document.getElementById('withdrawAccountName').value.trim();
    const phone = document.getElementById('withdrawPhone').value.trim();

    if (!method) { showToast('❌ Wave / KPay ရွေးချယ်ပါ', 'error'); return; }
    if (!accountName) { showToast('❌ Username / အကောင့်အမည် ဖြည့်ပါ', 'error'); return; }
    if (!phone) { showToast('❌ ဖုန်းနံပါတ် ဖြည့်ပါ', 'error'); return; }
    if (!amount || amount < MIN_WITHDRAW_MMK) {
        showToast(`❌ အနည်းဆုံး ${MIN_WITHDRAW_MMK.toLocaleString()} MMK`, 'error');
        return;
    }
    if (amount > (userData.mmkBalance || 0)) {
        showToast('❌ MMK လက်ကျန်မလုံလောက်ပါ', 'error');
        return;
    }

    try {
        const userRef = db.collection('users').doc(currentUser.uid);
        const reqRef = db.collection('withdrawals').doc();

        // Unique receipt number
        const receiptNo =
            'CT-' +
            getReceiptDateKey() +
            '-' +
            reqRef.id.slice(-8).toUpperCase();

        const result = await db.runTransaction(async (tx) => {
            const snap = await tx.get(userRef);

            if (!snap.exists) {
                throw new Error('USER_NOT_FOUND');
            }

            const d = snap.data() || {};
            const balance = Math.max(0, Number(d.mmkBalance) || 0);

            if (balance < amount) {
                throw new Error('INSUFFICIENT_MMK');
            }

            tx.update(userRef, {
                mmkBalance: balance - amount
            });

            tx.set(reqRef, {
                userId: currentUser.uid,
                authUid: currentUser.uid,
                username: d.username || 'User',
                email: d.email || '',
                amount: amount,
                currency: 'MMK',
                method: method,
                accountName: accountName,
                phone: phone,

                // Withdrawal Receipt
                receiptNo: receiptNo,

                status: 'pending',
                requestedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            return {
                balance: balance - amount,
                receiptNo: receiptNo,
                username: d.username || 'User'
            };
        });

        userData.mmkBalance = result.balance;
        updateUI();

        document.getElementById('withdrawAmount').value = '';
        document.getElementById('withdrawMethod').value = '';
        document.getElementById('withdrawAccountName').value = '';
        document.getElementById('withdrawPhone').value = '';

        // Show receipt immediately
        showWithdrawalReceipt({
            receiptNo: result.receiptNo,
            username: result.username,
            amount: amount,
            method: method,
            accountName: accountName,
            phone: phone,
            status: 'pending',
            requestedAt: new Date()
        });

        showToast('✅ ငွေထုတ်ယူရန် Request တင်ပြီးပါပြီ');

    } catch (e) {
        console.error('requestWithdraw error:', e);

        console.error('WITHDRAW ERROR DETAILS:', e);
        let withdrawError = 'UNKNOWN_ERROR';
        try {
            withdrawError = [
                e && e.code,
                e && e.message,
                typeof e === 'string' ? e : JSON.stringify(e)
            ].filter(Boolean).join(' | ') || String(e);
        } catch (_) {
            withdrawError = String(e);
        }
        showToast(
            e.message === 'INSUFFICIENT_MMK'
                ? '❌ MMK လက်ကျန်မလုံလောက်ပါ'
                : '❌ Request မတင်နိုင်ပါ: ' + withdrawError.slice(0, 90),
            'error'
        );
    }
}

function toggleAuth(mode) {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const authError = document.getElementById('authError');

    if (!loginForm || !signupForm) {
        console.error('Auth form not found');
        return;
    }

    const isSignup = mode === 'signup';

    loginForm.style.display = isSignup ? 'none' : '';
    signupForm.style.display = isSignup ? '' : 'none';

    if (authError) {
        authError.textContent = '';
        authError.classList.remove('show');
    }
}

window.toggleAuth = toggleAuth;

function showAuthError(msg) {
    const el = document.getElementById('authError');
    el.textContent = msg;
    el.classList.add('show');
}

// ✅ Referral link မှ ?ref= ပါလာရင် Auto-fill လုပ်ပေးမည်
//    ဒါပေမယ့် Sign Up ခလုတ်ကို ဘယ်တော့မှ မပိတ်ပါ
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const refParam = urlParams.get('ref');
    const refInput = document.getElementById('signupRefCode');
    const refBadge = document.getElementById('refBadge');

    if (refParam && refInput) {
        // Link မှ code ပါလာရင် auto-fill + lock
        refInput.value = refParam.toUpperCase();
        refInput.readOnly = true;
        refInput.style.background = 'var(--slate-100)';
        refInput.style.cursor = 'not-allowed';
        if (refBadge) refBadge.textContent = '✅ Applied (locked)';
        // Signup form ကို ပြပါ
        setTimeout(() => { if (document.getElementById('signupForm')) toggleAuth('signup'); }, 500);
    }
    // ref မပါလည်း Sign Up ခလုတ် အလုပ်လုပ်နေတယ်
});

async function handleSignup() {
    const username = document.getElementById('signupUsername').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const refCodeInput = document.getElementById('signupRefCode').value.trim().toUpperCase();

    // ✅ Field တွေ အကုန်စစ်
    if (!username) { showAuthError('❌ အမည် ဖြည့်ပါ'); return; }
    if (!email) { showAuthError('❌ Email ဖြည့်ပါ'); return; }
    if (!password) { showAuthError('❌ Password ဖြည့်ပါ'); return; }
    if (password.length < 6) { showAuthError('❌ Password အနည်းဆုံး ၆ လုံး ဖြစ်ရမည်'); return; }

    // ✅ Referral Code မဖြစ်မနေ လိုအပ်သည်
    if (!refCodeInput) {
        showAuthError('❌ Referral Code ဖြည့်ရန် လိုအပ်ပါသည်');
        return;
    }

    let referredBy = '';
    let referrerData = null;

    // ✅ Referral Code validation
    // ADMIN2026 + Settings ထဲက လက်ရှိ Admin Referral Code နှစ်ခုလုံးကို လက်ခံ
    try {
        let currentAdminRefCode = ADMIN_REF_CODE;

        try {
            const adminRefSnap = await db.collection('settings')
                .doc('adminAccess')
                .get();

            if (adminRefSnap.exists && adminRefSnap.data().refCode) {
                currentAdminRefCode = String(adminRefSnap.data().refCode)
                    .trim()
                    .toUpperCase();
            }
        } catch (adminRefError) {
            console.warn('Admin referral settings read failed:', adminRefError);
        }

        if (
            refCodeInput === String(ADMIN_REF_CODE).toUpperCase() ||
            refCodeInput === String(ADMIN_SIGNUP_REF_CODE).toUpperCase() ||
            refCodeInput === currentAdminRefCode
        ) {
            // Admin referral
            referredBy = currentAdminRefCode;
            referrerData = null;
        } else {
            // Normal user referral
            const refSnap = await db.collection('users')
                .where('refCode', '==', refCodeInput)
                .limit(1)
                .get();

            if (!refSnap.empty) {
                referredBy = refCodeInput;
                referrerData = refSnap.docs[0];
            } else {
                showAuthError('❌ Referral Code မမှန်ပါ');
                return;
            }
        }
    } catch (e) {
        console.error('Referral code validation error:', e);
        showAuthError('❌ Code စစ်ဆေးမှု မအောင်မြင်ပါ');
        return;
    }

    // ✅ အားလုံး မှန်ရင် အကောင့်ဖန်တီး
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        const myRefCode = generateRefCode();

        await db.collection('users').doc(cred.user.uid).set({
            id: cred.user.uid,
            authUid: cred.user.uid,
            username, email,
            coins: 1000, usdt: 0, mmkBalance: 0,
            isBanned: false,
            level: 1, totalAds: 0,
            refCode: myRefCode,
            referredBy: referredBy,
            referralCount: 0, referralEarned: 0,
    mmkBalance: 0,
            claimedLevels: [], unlockedAch: [], claimedAch: [],
            lastActive: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await db.collection('transactions').add({
            userId: cred.user.uid, type: 'welcome_bonus', amount: 1000,
            description: 'Welcome Bonus',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        if (referrerData) {
            const referrerId = referrerData.id;
            await db.collection('users').doc(referrerId).update({
                coins: firebase.firestore.FieldValue.increment(REFERRAL_BONUS),
                referralCount: firebase.firestore.FieldValue.increment(1),
                referralEarned: firebase.firestore.FieldValue.increment(REFERRAL_BONUS)
            });
            await db.collection('transactions').add({
                userId: referrerId, type: 'referral_bonus', amount: REFERRAL_BONUS,
                description: `Referral Bonus from ${username}`,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        saveCoinsToLocal(1000);
        showToast('✅ အကောင့်ဖွင့်ပြီးပါပြီ!');
        toggleAuth('login');
        window.history.replaceState({}, '', window.location.pathname);
    } catch (e) { showAuthError(e.message); }
}

async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) { showAuthError('Email & Password required'); return; }
    try { await auth.signInWithEmailAndPassword(email, password); showToast('✅ Welcome!'); }
    catch (e) { showAuthError(e.message); }
}
async function handleLogout() { await flushPendingAdRewards(true); await auth.signOut(); showToast('👋 Logged out'); }
// ============================================================
//  AUTH STATE
// ============================================================
auth.onAuthStateChanged(async (user) => {
    const authGeneration = ++cashTubeAuthGeneration;

    if (cashTubeUserSnapshotUnsubscribe) {
        try { cashTubeUserSnapshotUnsubscribe(); } catch (e) {}
        cashTubeUserSnapshotUnsubscribe = null;
    }
    if (cashTubeDailyBonusInterval) {
        clearInterval(cashTubeDailyBonusInterval);
        cashTubeDailyBonusInterval = null;
    }
    if (cashTubeSaveCoinsInterval) {
        clearInterval(cashTubeSaveCoinsInterval);
        cashTubeSaveCoinsInterval = null;
    }

    if (user) {
        currentUser = user;
        document.getElementById('authScreen').classList.remove('active');
        document.getElementById('appContainer').classList.add('active');
        document.getElementById('floatingPlayBtn').style.display = 'flex';
        applyLanguage();

        try {
            const doc = await db.collection('users').doc(user.uid).get();
            if (doc.exists) {
                const data = doc.data();
                if (data.isBanned) { await auth.signOut(); showToast('သင့်အကောင့်ကို system မှ စစ်ဆေးနေဆဲ', 'error'); return; }
                userData.coins = data.coins || 0;
                userData.username = data.username || 'User';
                userData.email = data.email || '';
                userData.usdt = data.usdt || 0;
                userData.mmkBalance = Number(data.mmkBalance) || 0;
                // Migrate legacy USDT wallet to MMK once, using the current MMK rate.
                if (!data.mmkBalance && userData.usdt > 0 && mmkRate > 0) {
                    userData.mmkBalance = userData.usdt * mmkRate;
                    await db.collection('users').doc(user.uid).update({
                        mmkBalance: userData.mmkBalance
                    });
                }
                userData.level = data.level || 1;
                userData.totalAds = data.totalAds || 0;
                userData.refCode = data.refCode || generateRefCode();
                userData.referredBy = data.referredBy || '';
                userData.referralCount = data.referralCount || 0;
                userData.referralEarned = data.referralEarned || 0;
                userData.claimedLevels = data.claimedLevels || [];
                userData.unlockedAch = data.unlockedAch || [];
                userData.claimedAch = data.claimedAch || [];

                // Premium Profile Frame persistence
                userData.profileFrames = Array.isArray(data.profileFrames)
                    ? data.profileFrames
                    : [];
                userData.profileFrame = data.profileFrame || 'none';
                applyProfileFrame(userData.profileFrame);
                if (!data.refCode) {
                    await db.collection('users').doc(user.uid).update({ refCode: userData.refCode });
                }
                saveCoinsToLocal(userData.coins);
                updateUI();
            }
        } catch (error) {}

        // Restore any locally queued ad rewards before the first user snapshot.
        const pendingOnLogin = getPendingAdRewards();
        if (pendingOnLogin.count > 0) {
            userData.coins = (userData.coins || 0) + pendingOnLogin.coins;
            userData.totalAds = (userData.totalAds || 0) + pendingOnLogin.count;
            saveCoinsToLocal(userData.coins);
            updateUI();
            await flushPendingAdRewards(true);
        }

        await loadExchangeRate();
        updateUI();
        // Ensure legacy users have an MMK balance before the first UI render.
        try {
            const freshUser = await db.collection('users').doc(user.uid).get();
            const freshData = freshUser.data() || {};
            if (!Object.prototype.hasOwnProperty.call(freshData, 'mmkBalance')) {
                const migratedMmk = Math.max(0, Number(freshData.usdt) || 0) * Math.max(0, Number(mmkRate) || 0);
                await db.collection('users').doc(user.uid).update({ mmkBalance: migratedMmk });
                userData.mmkBalance = migratedMmk;
                updateUI();
            }
        } catch (e) {}
        await loadAdLinksFromFirestore();
        await loadAppLinksFromFirestore();

        if (authGeneration !== cashTubeAuthGeneration || !auth.currentUser ||
            auth.currentUser.uid !== user.uid) return;

        cashTubeUserSnapshotUnsubscribe = db.collection('users').doc(user.uid).onSnapshot((doc) => {
            if (authGeneration !== cashTubeAuthGeneration) return;
            if (doc.exists) {
                const d = doc.data();
                const pendingLive = getPendingAdRewards();
                const _oldShownCoins = Number(userData.coins) || 0;
                const _serverCoins = Number(d.coins) || 0;
                const _pendingCoins = Number(pendingLive.coins) || 0;
                const _shownCoins = _serverCoins + _pendingCoins;

                console.log(
                    '💰 COIN SNAPSHOT | OLD=' + _oldShownCoins +
                    ' | SERVER=' + _serverCoins +
                    ' | PENDING=' + _pendingCoins +
                    ' | SHOWN=' + _shownCoins +
                    ' | DIFF=' + (_shownCoins - _oldShownCoins) +
                    ' | CACHE=' + (doc.metadata ? doc.metadata.fromCache : 'unknown') +
                    ' | PENDING_WRITES=' + (doc.metadata ? doc.metadata.hasPendingWrites : 'unknown') +
                    ' | TIME=' + new Date().toISOString()
                );

                userData.coins = _shownCoins;
                userData.usdt = d.usdt || 0;
                userData.mmkBalance = Number(d.mmkBalance) || 0;
                userData.totalAds = (d.totalAds || 0) + (pendingLive.count || 0);
                userData.referralCount = d.referralCount || 0;
                userData.referralEarned = d.referralEarned || 0;
                userData.claimedLevels = d.claimedLevels || [];
                userData.claimedAch = d.claimedAch || [];
                updateUI();
            }
        });

        // Update lastActive on login so Admin can separate Active / Inactive users.
        const activeKey = 'lastActiveSync_' + user.uid;
        const lastActiveSync = parseInt(localStorage.getItem(activeKey) || '0');

        if (Date.now() - lastActiveSync > 60 * 60 * 1000) {
            db.collection('users').doc(user.uid).update({
                lastActive: firebase.firestore.FieldValue.serverTimestamp()
            }).then(() => {
                localStorage.setItem(activeKey, Date.now().toString());
            }).catch(() => {});
        }

        renderAdCards();
        updateDailyBonusUI();
        loadDashboard();

        if (authGeneration === cashTubeAuthGeneration) {
            if (!cashTubeDailyBonusInterval) {
                cashTubeDailyBonusInterval = setInterval(() => {
                    if (currentUser) updateDailyBonusUI();
                }, 60000);
            }
            if (!cashTubeSaveCoinsInterval) {
                cashTubeSaveCoinsInterval = setInterval(() => {
                    if (currentUser) saveCoinsToLocal(userData.coins);
                }, 60000);
            }
        }
    } else {
        if (cashTubeUserSnapshotUnsubscribe) {
            try { cashTubeUserSnapshotUnsubscribe(); } catch (e) {}
            cashTubeUserSnapshotUnsubscribe = null;
        }
        if (cashTubeDailyBonusInterval) {
            clearInterval(cashTubeDailyBonusInterval);
            cashTubeDailyBonusInterval = null;
        }
        if (cashTubeSaveCoinsInterval) {
            clearInterval(cashTubeSaveCoinsInterval);
            cashTubeSaveCoinsInterval = null;
        }
        currentUser = null;
        document.getElementById('authScreen').classList.add('active');
        document.getElementById('appContainer').classList.remove('active');
        document.getElementById('floatingPlayBtn').style.display = 'none';
    }
});

async function loadAdLinksFromFirestore() {
    const key = 'cachedAdLinks';
    const TTL = 10 * 60 * 1000;
    try {
        const cached = JSON.parse(localStorage.getItem(key) || 'null');
        if (cached && Date.now() - cached.timestamp < TTL) {
            adLinks = cached.links || [];
            renderAdCards();
            return;
        }
    } catch (e) {}
    try {
        const doc = await db.collection('settings').doc('adLinks').get();
        if (doc.exists && doc.data().links?.length > 0) {
            adLinks = doc.data().links;
            localStorage.setItem(key, JSON.stringify({ links: adLinks, timestamp: Date.now() }));
            localStorage.setItem('adLinks', JSON.stringify(adLinks));
        } else adLinks = JSON.parse(localStorage.getItem('adLinks')) || [];
    } catch (e) { adLinks = JSON.parse(localStorage.getItem('adLinks')) || []; }
    renderAdCards();
}
async function loadAppLinksFromFirestore() {
    const key = 'cachedAppLinks';
    const TTL = 10 * 60 * 1000;
    try {
        const cached = JSON.parse(localStorage.getItem(key) || 'null');
        if (cached && Date.now() - cached.timestamp < TTL) {
            appLinks = cached.links || [];
            return;
        }
    } catch (e) {}
    try {
        const doc = await db.collection('settings').doc('appLinks').get();
        if (doc.exists && doc.data().links?.length > 0) {
            appLinks = doc.data().links;
            localStorage.setItem(key, JSON.stringify({ links: appLinks, timestamp: Date.now() }));
            localStorage.setItem('appLinks', JSON.stringify(appLinks));
        } else appLinks = JSON.parse(localStorage.getItem('appLinks')) || [];
    } catch (e) { appLinks = JSON.parse(localStorage.getItem('appLinks')) || []; }
}

// ============================================================
//  LOCAL STORAGE
// ============================================================
function saveCoinsToLocal(coins) {
    if (!currentUser) return;
    try { localStorage.setItem('userCoins_' + currentUser.uid, JSON.stringify({ coins, timestamp: Date.now() })); } catch (e) {}
}
function getCoinsFromLocal() {
    if (!currentUser) return null;
    try {
        const data = localStorage.getItem('userCoins_' + currentUser.uid);
        if (data) {
            const parsed = JSON.parse(data);
            if (Date.now() - parsed.timestamp < 604800000) return parsed.coins;
        }
    } catch (e) {}
    return null;
}
function saveTransactionLocal(type, amount, description) {
    if (!currentUser) return;
    try {
        const tx = JSON.parse(localStorage.getItem('localTx_' + currentUser.uid) || '[]');
        tx.push({ type, amount, description, timestamp: Date.now(), synced: false });
        if (tx.length > 100) tx.splice(0, tx.length - 100);
        localStorage.setItem('localTx_' + currentUser.uid, JSON.stringify(tx));
    } catch (e) {}
}
async function syncLocalTransactions() {
    if (!currentUser) return;
    try {
        const tx = JSON.parse(localStorage.getItem('localTx_' + currentUser.uid) || '[]');
        const unsynced = tx.filter(t => !t.synced);
        for (const t of unsynced) {
            try { await db.collection('transactions').add({ userId: currentUser.uid, type: t.type, amount: t.amount, description: t.description, timestamp: new Date(t.timestamp) }); t.synced = true; }
            catch (e) { if (e.code === 'resource-exhausted') break; }
        }
        localStorage.setItem('localTx_' + currentUser.uid, JSON.stringify(tx));
    } catch (e) {}
}

// ============================================================
//  ADMIN
// ============================================================
let adminTapCount = 0, adminTapTimeout = null;
function handleAdminLockClick() {
    adminTapCount++;
    const counter = document.getElementById('tapCounter');
    counter.textContent = adminTapCount;
    counter.style.display = 'flex';
    clearTimeout(adminTapTimeout);
    adminTapTimeout = setTimeout(() => { adminTapCount = 0; counter.textContent = '0'; counter.style.display = 'none'; }, 3000);
    if (adminTapCount >= 12) {
        adminTapCount = 0; counter.textContent = '0'; counter.style.display = 'none';
        clearTimeout(adminTapTimeout);
        showToast('🔓 Admin!', 'success');
        const codeInput = document.getElementById('adminRefCodeInput');
        const codeHint = document.getElementById('adminRefCodeHint');
        if (codeInput) {
            const first = localStorage.getItem('realcash_admin_verified') !== '1';
            codeInput.style.display = first ? '' : 'none';
            if (codeHint && codeHint.classList.contains('admin-hint')) codeHint.style.display = first ? '' : 'none';
        }
        openModal('adminModal');
    }
}

// ============================================================
// REALCASH ANALYTICS
// ============================================================
async function loadRealcashAnalytics() {
    if (!isAdmin) return;

    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (!el) return;

        el.textContent = Number(value || 0).toLocaleString();
        el.style.color = '#0f172a';
        el.style.fontWeight = '900';
        el.style.visibility = 'visible';
        el.style.opacity = '1';
    };

    const setError = (id, message) => {
        const el = document.getElementById(id);
        if (!el) return;

        el.textContent = message;
        el.style.color = '#dc2626';
        el.style.fontWeight = '900';
        el.style.visibility = 'visible';
        el.style.opacity = '1';
    };

    try {
        const today = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Yangon'
        }).format(new Date());

        console.log('===== REALCASH ANALYTICS DEBUG =====');
        console.log('Today:', today);
        console.log('Firebase UID:', auth.currentUser ? auth.currentUser.uid : 'NOT SIGNED IN');

        // USERS
        try {
            const usersSnap = await db.collection('users').get();

            let activeToday = 0;

            usersSnap.forEach(doc => {
                const d = doc.data();

                if (d.lastActive && typeof d.lastActive.toDate === 'function') {
                    const activeDate = new Intl.DateTimeFormat('en-CA', {
                        timeZone: 'Asia/Yangon'
                    }).format(d.lastActive.toDate());

                    if (activeDate === today) {
                        activeToday++;
                    }
                }
            });

            setValue('analyticsUsers', usersSnap.size);
            setValue('analyticsActive', activeToday);

            console.log('USERS OK:', usersSnap.size);
            console.log('ACTIVE TODAY OK:', activeToday);

        } catch (e) {
            console.error('USERS ERROR:', e);
            setError('analyticsUsers', 'Error');
            setError('analyticsActive', 'Error');
        }

        // ADS
        try {
            const adSnap = await db.collection('adWatches')
                .where('date', '==', today)
                .get();

            let adsToday = 0;
            let coinsToday = 0;

            adSnap.forEach(doc => {
                const d = doc.data();
                adsToday += Number(d.count || 0);
                coinsToday += Number(d.totalCoins || 0);
            });

            setValue('analyticsAds', adsToday);
            setValue('analyticsCoins', coinsToday);

            console.log('ADS OK:', adsToday);
            console.log('COINS TODAY OK:', coinsToday);

        } catch (e) {
            console.error('ADS ERROR:', e);
            setError('analyticsAds', 'Error');
            setError('analyticsCoins', 'Error');
        }

        // WITHDRAWALS
        try {
            let withdrawalSnap = null;

            try {
                withdrawalSnap = await db.collection('withdrawals').get();
                console.log('WITHDRAWALS COLLECTION OK:', withdrawalSnap.size);
            } catch (e1) {
                console.error('withdrawals collection ERROR:', e1);

                try {
                    withdrawalSnap = await db.collection('withdrawRequests').get();
                    console.log('withdrawRequests COLLECTION OK:', withdrawalSnap.size);
                } catch (e2) {
                    console.error('withdrawRequests collection ERROR:', e2);
                    throw e2;
                }
            }

            let totalWithdrawals = withdrawalSnap.size;
            let pendingWithdrawals = 0;

            withdrawalSnap.forEach(doc => {
                const d = doc.data();
                const status = String(d.status || '').toLowerCase();

                if (status === 'pending') {
                    pendingWithdrawals++;
                }
            });

            setValue('analyticsWithdrawals', totalWithdrawals);
            setValue('analyticsPending', pendingWithdrawals);

            console.log('WITHDRAWALS OK:', totalWithdrawals);
            console.log('PENDING OK:', pendingWithdrawals);

        } catch (e) {
            console.error('WITHDRAWAL FINAL ERROR:', e);
            setError('analyticsWithdrawals', 'Error');
            setError('analyticsPending', 'Error');
        }

        const updated = document.getElementById('analyticsUpdated');

        if (updated) {
            updated.textContent =
                'Updated • ' + today + ' • Yangon Time';
            updated.style.color = '#64748b';
        }

        console.log('===== ANALYTICS DEBUG END =====');

    } catch (e) {
        console.error('ANALYTICS FATAL ERROR:', e);
    }
}

async function verifyAdmin() {
    const id = document.getElementById('adminIdInput').value.trim();
    console.log('REALCASH ADMIN ID:', id);
    console.log('REALCASH FIREBASE UID:', auth.currentUser ? auth.currentUser.uid : 'NOT_SIGNED_IN');
    if (auth.currentUser) {
        console.log('👉 FIREBASE ADMIN UID =', auth.currentUser.uid);
    } else {
        console.warn('⚠️ Firebase Auth user မဝင်ထားသေးပါ');
    }
    const enteredCode = document.getElementById('adminRefCodeInput').value.trim().toUpperCase();
    const firstAdminLogin = localStorage.getItem('realcash_admin_verified') !== '1';
    let validCode = ADMIN_REF_CODE;

    try {
        const s = await db.collection('settings').doc('adminAccess').get();
        if (s.exists && s.data().refCode) validCode = String(s.data().refCode).toUpperCase();
    } catch (e) {}

    const codeOk = !firstAdminLogin || enteredCode === validCode;
    if (ADMIN_IDS.includes(id) && codeOk) {
        isAdmin = true;
        localStorage.setItem('realcash_admin_verified', '1');
        document.getElementById('adminLogin').style.display = 'none';
        document.getElementById('adminDashboard').style.display = 'block';
        const legacyRateInput = document.getElementById('adminRate');
        if (legacyRateInput) legacyRateInput.value = exchangeRate;
        const coinMmkInput = document.getElementById('adminCoinMmkRate');
        if (coinMmkInput) coinMmkInput.value = coinMmkRate || '';
        document.getElementById('adminAdReward').value = AD_REWARD;
        document.getElementById('adminRefCodeManage').value = validCode;
        document.getElementById('toggleWithdrawBtn').textContent = isWithdrawOpen ? '🔒 Close' : '🔓 Open';
        updateExchangeStatusUI();
        updateExchangeRateUI();
        updateAdRewardUI();
        loadAdminUsers();
        loadWithdrawRequests();
        loadAppList();
        loadRealcashAnalytics();
        loadAdList();
        loadDailyTop3Rewards();
        showToast('✅ Admin in');
        closeModal('adminModal');
    } else {
        showToast('❌ Admin ID / Referral Code မမှန်ပါ', 'error');
    }
}
function adminLogout() {
    isAdmin = false;
    document.getElementById('adminLogin').style.display = 'block';
    document.getElementById('adminDashboard').style.display = 'none';
}
function loadAppList() {
    const tbody = document.getElementById('appListBody');
    const links = JSON.parse(localStorage.getItem('appLinks')) || [];
    if (!links.length) { tbody.innerHTML = '<tr><td colspan="2" class="table-loading">Empty</td></tr>'; return; }
    tbody.innerHTML = links.map((link, i) => `<tr><td style="font-size:11px;text-align:left;"><a href="${link}" target="_blank" style="color:var(--blue-600);">${link.substring(0,30)}...</a></td><td><button class="btn-sm red" onclick="adminRemoveAppLink(${i})" style="padding:5px 10px;font-size:10px;">✕</button></td></tr>`).join('');
}
async function adminAddAppLink() {
    const link = document.getElementById('adminAppLink').value.trim();
    if (!link) return;
    let links = JSON.parse(localStorage.getItem('appLinks')) || [];
    links.push(link);
    localStorage.setItem('appLinks', JSON.stringify(links));
    appLinks = links;
    document.getElementById('adminAppLink').value = '';
    loadAppList();
    try { await db.collection('settings').doc('appLinks').set({ links }); localStorage.removeItem('cachedAppLinks'); } catch (e) {}
    showToast('✅ Added');
}
async function adminRemoveAppLink(i) {
    if (!confirm('Delete?')) return;
    let links = JSON.parse(localStorage.getItem('appLinks')) || [];
    links.splice(i, 1);
    localStorage.setItem('appLinks', JSON.stringify(links));
    appLinks = links;
    loadAppList();
    try { await db.collection('settings').doc('appLinks').set({ links }); localStorage.removeItem('cachedAppLinks'); } catch (e) {}
}
function loadAdList() {
    const tbody = document.getElementById('adListBody');
    const links = JSON.parse(localStorage.getItem('adLinks')) || [];
    if (!links.length) { tbody.innerHTML = '<tr><td colspan="2" class="table-loading">Empty</td></tr>'; return; }
    tbody.innerHTML = links.map((link, i) => `<tr><td style="font-size:11px;text-align:left;"><a href="${link}" target="_blank" style="color:var(--blue-600);">${link.substring(0,30)}...</a></td><td><button class="btn-sm red" onclick="adminRemoveAdLink(${i})" style="padding:5px 10px;font-size:10px;">✕</button></td></tr>`).join('');
}
async function adminAddAdLink() {
    const link = document.getElementById('adminAdLink').value.trim();
    if (!link) return;
    let links = JSON.parse(localStorage.getItem('adLinks')) || [];
    links.push(link);
    localStorage.setItem('adLinks', JSON.stringify(links));
    adLinks = links;
    document.getElementById('adminAdLink').value = '';
    loadAdList();
    try { await db.collection('settings').doc('adLinks').set({ links }); localStorage.removeItem('cachedAdLinks'); } catch (e) {}
    renderAdCards();
    showToast('✅ Added');
}
async function adminRemoveAdLink(i) {
    if (!confirm('Delete?')) return;
    let links = JSON.parse(localStorage.getItem('adLinks')) || [];
    links.splice(i, 1);
    localStorage.setItem('adLinks', JSON.stringify(links));
    adLinks = links;
    loadAdList();
    try { await db.collection('settings').doc('adLinks').set({ links }); localStorage.removeItem('cachedAdLinks'); } catch (e) {}
    renderAdCards();
}
async function adminToggleWithdraw() {
    const nextWithdrawOpen = !isWithdrawOpen;
    try {
        await db.collection('settings').doc('withdrawControl').set({
            isOpen: nextWithdrawOpen,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        cacheWithdrawControlStatus(nextWithdrawOpen);
    } catch (e) {
        showToast('❌ Withdrawal setting မသိမ်းနိုင်ပါ', 'error');
        return;
    }
    document.getElementById('toggleWithdrawBtn').textContent = isWithdrawOpen ? '🔒 Close' : '🔓 Open';
    updateWithdrawUI();
}
async function adminSetWithdrawDate() {
    const date = document.getElementById('adminWithdrawDate').value;
    if (!date) return;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yangon' }).format(new Date());
    const nextWithdrawOpen = date <= today;
    try {
        await db.collection('settings').doc('withdrawControl').set({
            isOpen: nextWithdrawOpen,
            openDate: date,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        cacheWithdrawControlStatus(nextWithdrawOpen, date);
    } catch (e) {
        showToast('❌ Withdrawal date မသိမ်းနိုင်ပါ', 'error');
        return;
    }
    updateWithdrawUI();
    showToast('✅ Set');
}

// ============================================================
// DAILY TOP 3 REWARD SYSTEM
// Uses existing adWatches records and Myanmar local date.
// Rewards are paid only after Admin approval.
// ============================================================
const DAILY_TOP3_PRIZES = [3000, 2000, 1000];

function dailyTop3Today() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Yangon'
    }).format(new Date());
}

function dailyTop3Escape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[ch]);
}

function dailyTop3StatusText(status) {
    if (status === 'approved') return '✅ Approved';
    if (status === 'rejected') return '❌ Rejected';
    if (status === 'superseded') return '↪️ Updated ranking';
    return '⏳ Pending approval';
}

async function prepareDailyTop3Rewards() {
    if (!isAdmin) {
        showToast('❌ Admin login လုပ်ပါ', 'error');
        return;
    }

    const statusEl = document.getElementById('dailyTop3RewardStatus');
    if (statusEl) statusEl.textContent = 'ယနေ့ Ads စာရင်းကို စစ်ဆေးနေပါသည်...';

    try {
        const today = dailyTop3Today();
        const snap = await db.collection('adWatches')
            .where('date', '==', today)
            .get();

        const records = [];
        snap.forEach(doc => {
            const d = doc.data() || {};
            const uid = d.userId || d.authUid;
            const count = Number(d.count || 0);

            if (uid && Number.isFinite(count) && count > 0) {
                records.push({
                    uid,
                    count,
                    totalCoins: Number(d.totalCoins || 0),
                    username: d.username || 'User',
                    email: d.email || ''
                });
            }
        });

        // Rank by number of ads, not coins earned.
        // Ties use totalCoins, then username for deterministic ordering.
        records.sort((a, b) =>
            b.count - a.count ||
            b.totalCoins - a.totalCoins ||
            String(a.username).localeCompare(String(b.username))
        );

        const top = [];
        const seen = new Set();
        for (const record of records) {
            if (seen.has(record.uid)) continue;
            seen.add(record.uid);
            top.push(record);
            if (top.length === 3) break;
        }

        const rewards = db.collection('dailyTop3Rewards');
        const oldSnap = await rewards.where('date', '==', today).get();

        // Once any reward is approved, freeze today's ranking.
        const alreadyApproved = oldSnap.docs.some(doc => {
            const data = doc.data() || {};
            return data.status === 'approved';
        });

        if (alreadyApproved) {
            if (statusEl) {
                statusEl.textContent =
                    '🔒 ယနေ့ ဆုတစ်ခု အတည်ပြုပြီးဖြစ်သောကြောင့် Ranking အသစ် မပြင်ဆင်နိုင်ပါ။';
            }
            await loadDailyTop3Rewards();
            return;
        }

        const currentIds = new Set(
            top.map((r, i) => `${today}_${r.uid}`)
        );

        // Mark old pending nominations as superseded when the ranking changes.
        // Approved records are never reset or paid a second time.
        const batch = db.batch();
        let batchHasWrites = false;

        oldSnap.forEach(doc => {
            const d = doc.data() || {};
            if (d.status === 'pending' && !currentIds.has(doc.id)) {
                batch.update(doc.ref, {
                    status: 'superseded',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                batchHasWrites = true;
            }
        });

        top.forEach((r, i) => {
            const ref = rewards.doc(`${today}_${r.uid}`);
            // Existing approved/rejected decisions must not be overwritten.
            // Existing pending entries will be refreshed with today's ranking.
            const existing = oldSnap.docs.find(d => d.id === ref.id);
            if (existing) {
                const old = existing.data() || {};
                if (old.status === 'approved' || old.status === 'rejected') {
                    return;
                }
            }

            batch.set(ref, {
                date: today,
                userId: r.uid,
                username: r.username,
                email: r.email,
                ads: r.count,
                totalCoins: r.totalCoins,
                rank: i + 1,
                rewardCoins: DAILY_TOP3_PRIZES[i],
                status: 'pending',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            batchHasWrites = true;
        });

        if (batchHasWrites) await batch.commit();

        if (statusEl) {
            statusEl.textContent = top.length
                ? `📅 ${today} — Top ${top.length} စာရင်းပြင်ဆင်ပြီးပါပြီ။ Approve မလုပ်မချင်း Coin မပေးပါ။`
                : `📅 ${today} — ယနေ့ Ads မှတ်တမ်း မရှိသေးပါ။`;
        }

        await loadDailyTop3Rewards();
    } catch (e) {
        console.error('DAILY TOP3 PREPARE ERROR:', e);
        if (statusEl) {
            statusEl.textContent = '❌ ' + (e.code || e.message || 'Failed');
        }
        showToast('Daily Top 3 စာရင်းမရပါ: ' + (e.code || 'Error'), 'error');
    }
}

async function loadDailyTop3Rewards() {
    const listEl = document.getElementById('dailyTop3RewardList');
    const statusEl = document.getElementById('dailyTop3RewardStatus');
    if (!listEl || !isAdmin) return;

    try {
        const today = dailyTop3Today();
        const snap = await db.collection('dailyTop3Rewards')
            .where('date', '==', today)
            .get();

        const rows = [];
        snap.forEach(doc => rows.push({ id: doc.id, ...doc.data() }));
        rows.sort((a, b) => Number(a.rank || 99) - Number(b.rank || 99));

        if (!rows.length) {
            listEl.innerHTML =
                '<div class="table-loading">စာရင်းမရှိသေးပါ။ အပေါ်က ခလုတ်ကိုနှိပ်ပါ။</div>';
            return;
        }

        listEl.innerHTML = rows.map(r => {
            const rank = Number(r.rank || 0);
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅';
            const pending = r.status === 'pending';
            const safeId = dailyTop3Escape(r.id);
            return `
                <div style="padding:12px;margin-bottom:8px;border:1px solid var(--border-light);border-radius:12px;">
                    <div style="font-weight:800;">
                        ${medal} Top ${rank} — ${dailyTop3Escape(r.username || 'User')}
                    </div>
                    <div style="font-size:11px;color:var(--text-3);margin-top:4px;overflow-wrap:anywhere;">
                        ${dailyTop3Escape(r.email || r.userId || '')}
                    </div>
                    <div style="font-size:12px;margin-top:5px;">
                        Ads: <strong>${Number(r.ads || 0).toLocaleString()}</strong>
                        · ဆု: <strong>${Number(r.rewardCoins || 0).toLocaleString()} Coins</strong>
                    </div>
                    <div style="font-size:12px;margin-top:5px;">
                        အခြေအနေ: ${dailyTop3Escape(dailyTop3StatusText(r.status))}
                    </div>
                    ${pending ? `
                        <div style="display:flex;gap:8px;margin-top:9px;">
                            <button class="btn-sm mint"
                                onclick="approveDailyTop3Reward('${safeId}')"
                                style="flex:1;">✅ Approve</button>
                            <button class="btn-sm red"
                                onclick="rejectDailyTop3Reward('${safeId}')"
                                style="flex:1;">❌ Reject</button>
                        </div>` : ''}
                </div>`;
        }).join('');

        if (statusEl && !statusEl.textContent) {
            statusEl.textContent = `📅 ${today}`;
        }
    } catch (e) {
        console.error('DAILY TOP3 LOAD ERROR:', e);
        listEl.innerHTML =
            '<div class="table-loading">❌ ' +
            dailyTop3Escape(e.code || e.message || 'Failed') + '</div>';
    }
}

async function approveDailyTop3Reward(rewardId) {
    if (!isAdmin) {
        showToast('❌ Admin login လုပ်ပါ', 'error');
        return;
    }

    if (!confirm('ဒီနေ့ Top 3 ဆုကို အတည်ပြုပြီး Coin ပေးမလား?')) return;

    try {
        const rewardRef = db.collection('dailyTop3Rewards').doc(rewardId);

        await db.runTransaction(async tx => {
            const rewardSnap = await tx.get(rewardRef);
            if (!rewardSnap.exists) throw new Error('Reward record မရှိပါ');

            const r = rewardSnap.data() || {};
            if (r.status !== 'pending') {
                throw new Error('ဒီဆုကို ဆုံးဖြတ်ပြီးသားဖြစ်ပါသည်');
            }

            const rank = Number(r.rank);
            const expectedPrize = DAILY_TOP3_PRIZES[rank - 1];
            const prize = Number(r.rewardCoins);

            if (!r.userId || !r.date ||
                !Number.isInteger(rank) || rank < 1 || rank > 3 ||
                prize !== expectedPrize) {
                throw new Error('ဆုစာရင်း မမှန်ကန်ပါ');
            }

            const userRef = db.collection('users').doc(r.userId);
            const userSnap = await tx.get(userRef);
            if (!userSnap.exists) throw new Error('User မရှိတော့ပါ');

            tx.update(userRef, {
                coins: firebase.firestore.FieldValue.increment(prize)
            });

            tx.update(rewardRef, {
                status: 'approved',
                approvedCoins: prize,
                approvedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            const txRef = db.collection('transactions').doc();
            tx.set(txRef, {
                userId: r.userId,
                type: 'daily_top3_reward',
                amount: prize,
                description: `Daily Top ${rank} Ads Reward (${r.date})`,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        });

        showToast('✅ ဆု Coin ပေးပြီးပါပြီ', 'success');
        await loadDailyTop3Rewards();
        await loadAdminUsers();
    } catch (e) {
        console.error('DAILY TOP3 APPROVE ERROR:', e);
        showToast('❌ ' + (e.code || e.message || 'Approve failed'), 'error');
    }
}

async function rejectDailyTop3Reward(rewardId) {
    if (!isAdmin) {
        showToast('❌ Admin login လုပ်ပါ', 'error');
        return;
    }

    if (!confirm('ဒီဆုလျှောက်ထားမှုကို Reject လုပ်မှာ သေချာပါသလား?')) return;

    try {
        const ref = db.collection('dailyTop3Rewards').doc(rewardId);
        await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            if (!snap.exists) throw new Error('Reward record မရှိပါ');
            const r = snap.data() || {};
            if (r.status !== 'pending') {
                throw new Error('ဒီဆုကို ဆုံးဖြတ်ပြီးသားဖြစ်ပါသည်');
            }
            tx.update(ref, {
                status: 'rejected',
                rejectedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });

        showToast('ဆုစာရင်းကို Reject လုပ်ပြီးပါပြီ');
        await loadDailyTop3Rewards();
    } catch (e) {
        console.error('DAILY TOP3 REJECT ERROR:', e);
        showToast('❌ ' + (e.code || e.message || 'Reject failed'), 'error');
    }
}


async function adminAddCoin() {
    const email = document.getElementById('adminTargetEmail').value.trim();
    const amount = parseInt(document.getElementById('adminCoinAmount').value);
    const msg = document.getElementById('adminCoinMsg');
    if (!email || !amount) { msg.textContent = '❌ Fill'; msg.style.color = 'var(--rose-500)'; return; }
    const snap = await db.collection('users').where('email', '==', email).limit(1).get();
    if (snap.empty) { msg.textContent = '❌ Not found'; msg.style.color = 'var(--rose-500)'; return; }
    await db.collection('users').doc(snap.docs[0].id).update({ coins: firebase.firestore.FieldValue.increment(amount) });
    msg.textContent = '✅ +' + amount;
    msg.style.color = 'var(--mint-600)';
}
async function adminRemoveCoin() {
    const email = document.getElementById('adminTargetEmail').value.trim();
    const amount = parseInt(document.getElementById('adminCoinAmount').value);
    const msg = document.getElementById('adminCoinMsg');
    if (!email || !amount) { msg.textContent = '❌ Fill'; msg.style.color = 'var(--rose-500)'; return; }
    const snap = await db.collection('users').where('email', '==', email).limit(1).get();
    if (snap.empty) { msg.textContent = '❌ Not found'; msg.style.color = 'var(--rose-500)'; return; }
    await db.collection('users').doc(snap.docs[0].id).update({ coins: firebase.firestore.FieldValue.increment(-amount) });
    msg.textContent = '✅ -' + amount;
    msg.style.color = 'var(--rose-500)';
}

async function adminAddMmk() {
    const email = document.getElementById('adminMmkTargetEmail').value.trim();
    const amount = Number(document.getElementById('adminMmkAmount').value);
    const msg = document.getElementById('adminMmkMsg');

    if (!email || !Number.isFinite(amount) || amount <= 0) {
        msg.textContent = '❌ Email နှင့် MMK ပမာဏ ဖြည့်ပါ';
        msg.style.color = 'var(--rose-500)';
        return;
    }

    try {
        const snap = await db.collection('users')
            .where('email', '==', email)
            .limit(1)
            .get();

        if (snap.empty) {
            msg.textContent = '❌ User မတွေ့ပါ';
            msg.style.color = 'var(--rose-500)';
            return;
        }

        const ref = snap.docs[0].ref;

        await ref.update({
            mmkBalance: firebase.firestore.FieldValue.increment(amount)
        });

        msg.textContent = '✅ MMK +' + amount.toLocaleString();
        msg.style.color = 'var(--mint-600)';

        loadAdminUsers();
    } catch (e) {
        console.error('ADMIN ADD MMK ERROR:', e);
        msg.textContent = '❌ ' + (e.code || 'Failed');
        msg.style.color = 'var(--rose-500)';
    }
}

async function adminRemoveMmk() {
    const email = document.getElementById('adminMmkTargetEmail').value.trim();
    const amount = Number(document.getElementById('adminMmkAmount').value);
    const msg = document.getElementById('adminMmkMsg');

    if (!email || !Number.isFinite(amount) || amount <= 0) {
        msg.textContent = '❌ Email နှင့် MMK ပမာဏ ဖြည့်ပါ';
        msg.style.color = 'var(--rose-500)';
        return;
    }

    try {
        const snap = await db.collection('users')
            .where('email', '==', email)
            .limit(1)
            .get();

        if (snap.empty) {
            msg.textContent = '❌ User မတွေ့ပါ';
            msg.style.color = 'var(--rose-500)';
            return;
        }

        const ref = snap.docs[0].ref;
        const data = snap.docs[0].data();
        const currentMmk = Math.max(0, Number(data.mmkBalance || 0));

        if (amount > currentMmk) {
            msg.textContent = '❌ MMK လက်ကျန်ထက် မပိုနိုင်ပါ';
            msg.style.color = 'var(--rose-500)';
            return;
        }

        await ref.update({
            mmkBalance: currentMmk - amount
        });

        msg.textContent = '✅ MMK −' + amount.toLocaleString();
        msg.style.color = 'var(--rose-500)';

        loadAdminUsers();
    } catch (e) {
        console.error('ADMIN REMOVE MMK ERROR:', e);
        msg.textContent = '❌ ' + (e.code || 'Failed');
        msg.style.color = 'var(--rose-500)';
    }
}

async function loadAdminUsers() {
    const table = document.getElementById('adminUserTable');

    table.innerHTML = '<tr><td colspan="5" class="table-loading"><i class="fas fa-spinner fa-spin"></i></td></tr>';

    try {
        const snap = await db.collection('users').limit(100).get();

        const now = Date.now();
        const ACTIVE_MS = 24 * 60 * 60 * 1000;

        const users = snap.docs.map(doc => {
            const d = doc.data();

            let lastActiveMs = 0;

            if (d.lastActive?.toMillis) {
                lastActiveMs = d.lastActive.toMillis();
            } else if (d.lastActive?.seconds) {
                lastActiveMs = d.lastActive.seconds * 1000;
            } else if (d.lastActive) {
                const parsed = new Date(d.lastActive).getTime();
                if (Number.isFinite(parsed)) lastActiveMs = parsed;
            }

            const isActive = lastActiveMs > 0 && (now - lastActiveMs) <= ACTIVE_MS;

            return {
                id: doc.id,
                data: d,
                isActive
            };
        });

        const activeUsers = users.filter(u => u.isActive);
        const inactiveUsers = users.filter(u => !u.isActive);

        document.getElementById('userCount').textContent =
            `${activeUsers.length} 🟢 / ${inactiveUsers.length} ⚫`;

        const renderUser = ({ id, data: d, isActive }) => {
            const email = d.email || '—';
            const mmk = Number(d.mmkBalance ?? d.mmk ?? 0);
            const coins = Number(d.coins ?? 0);

            const username = d.username
                ? (String(d.username).startsWith('@')
                    ? String(d.username)
                    : '@' + String(d.username))
                : '—';

            const status = isActive
                ? '<span style="color:var(--mint-600);font-weight:800;">🟢 Active</span>'
                : '<span style="color:var(--text-3);font-weight:800;">⚫ Inactive</span>';

            return `<tr>
                <td>
                    <strong>${email}</strong>
                    <br>
                    <small style="color:var(--text-3);">${username}</small>
                </td>
                <td><strong>${mmk.toLocaleString()}</strong></td>
                <td><strong>${coins.toLocaleString()}</strong></td>
                <td>${status}</td>
                <td>
                    <button class="btn-sm ${d.isBanned ? 'mint' : 'red'}"
                        onclick="toggleBan('${id}')"
                        style="padding:5px 10px;font-size:10px;">
                        ${d.isBanned ? 'Unban' : 'Ban'}
                    </button>
                </td>
            </tr>`;
        };

        const activeHtml = activeUsers.map(renderUser).join('');
        const inactiveHtml = inactiveUsers.map(renderUser).join('');

        let htmlOut = '';

        if (activeHtml) {
            htmlOut += `
                <tr>
                    <td colspan="5" style="padding:8px 6px;color:var(--mint-600);font-weight:900;">
                        🟢 ACTIVE USERS (${activeUsers.length})
                    </td>
                </tr>
                ${activeHtml}`;
        }

        if (inactiveHtml) {
            htmlOut += `
                <tr>
                    <td colspan="5" style="padding:8px 6px;color:var(--text-3);font-weight:900;">
                        ⚫ INACTIVE USERS (${inactiveUsers.length})
                    </td>
                </tr>
                ${inactiveHtml}`;
        }

        if (!htmlOut) {
            htmlOut = '<tr><td colspan="5" class="table-loading">No users</td></tr>';
        }

        table.innerHTML = htmlOut;

    } catch (e) {
        console.error('REALCASH ADMIN USERS ERROR:', e);
        console.error('Firebase currentUser:', auth.currentUser);

        const code = e && e.code ? e.code : 'unknown';
        const msg = e && e.message ? e.message : String(e);
        const firebaseUid = auth.currentUser
            ? auth.currentUser.uid
            : 'NOT_SIGNED_IN';

        table.innerHTML = `<tr>
            <td colspan="5" class="table-loading"
                style="color:var(--rose-500);font-size:12px;line-height:1.6;">
                ❌ Firebase Error<br>
                <small>Code: ${code}</small><br>
                <small style="color:#fca5a5;">${msg}</small><br>
                <small style="color:#fbbf24;">Firebase UID: ${firebaseUid}</small>
            </td>
        </tr>`;
    }
}

async function searchUserByEmail() {
    const email = document.getElementById('userSearchInput').value.trim();
    if (!email) return;
    const table = document.getElementById('adminUserTable');
    const snap = await db.collection('users').where('email', '==', email).limit(1).get();
    if (snap.empty) { table.innerHTML = '<tr><td colspan="4" class="table-loading">Not found</td></tr>'; return; }
    const doc = snap.docs[0];
    const d = doc.data();
    table.innerHTML = `<tr>
        <td><strong>${d.username}</strong><br><span style="font-size:10px;color:var(--text-3);">${d.email}</span></td>
        <td>${d.coins || 0}</td>
        <td>${(d.usdt || 0).toFixed(2)}</td>
        <td><button class="btn-sm ${d.isBanned ? 'mint' : 'red'}" onclick="toggleBan('${doc.id}')">${d.isBanned ? 'Unban' : 'Ban'}</button></td>
    </tr>`;
}
function clearUserSearch() { document.getElementById('userSearchInput').value = ''; loadAdminUsers(); }
async function toggleBan(uid) {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return;
    await db.collection('users').doc(uid).update({ isBanned: !doc.data().isBanned });
    showToast('✅ Updated');
    loadAdminUsers();
}
async function loadWithdrawRequests() {
    const tbody = document.getElementById('withdrawRequestsBody');
    try {
        const snap = await db.collection('withdrawals').orderBy('requestedAt', 'desc').limit(50).get();
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="5" class="table-loading">No requests</td></tr>';
            return;
        }
        tbody.innerHTML = snap.docs.map(doc => {
            const d = doc.data();
            const amount = Number(d.amount) || 0;
            const statusText = d.status === 'pending' ? '⏳ Pending' : d.status === 'approved' ? '✅ Approved' : '❌ Rejected';
            const payment = `${d.method || '-'}<br><small>${d.accountName || '-'}<br>${d.phone || '-'}</small>`;
            const action = d.status === 'pending'
                ? `<button class="btn-sm mint" onclick="approveWithdraw('${doc.id}')" style="padding:4px 8px;font-size:10px;">✓</button>
                   <button class="btn-sm red" onclick="rejectWithdraw('${doc.id}')" style="padding:4px 8px;font-size:10px;">✕</button>`
                : '—';
            return `<tr>
                <td><strong>${d.username || 'User'}</strong><br><small>${d.email || ''}</small></td>
                <td><strong>${amount.toLocaleString()} MMK</strong></td>
                <td>${payment}</td>
                <td>${statusText}</td>
                <td>${action}</td>
            </tr>`;
        }).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-loading">Request list မဖတ်နိုင်ပါ</td></tr>';
    }
}
async function approveWithdraw(id) {
    if (!confirm('ဒီ Withdrawal Request ကို Approved လုပ်မလား?')) return;
    try {
        const ref = db.collection('withdrawals').doc(id);
        const result = await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists) throw new Error('NOT_FOUND');
            const d = snap.data();
            if (d.status !== 'pending') throw new Error('ALREADY_PROCESSED');
            tx.update(ref, {
                status: 'approved',
                processedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return d;
        });
        showToast(`✅ ${Number(result.amount || 0).toLocaleString()} MMK Approved`);
        loadWithdrawRequests();
    } catch (e) {
        showToast(e.message === 'ALREADY_PROCESSED' ? 'Already processed' : '❌ Approve failed', 'error');
    }
}
async function rejectWithdraw(id) {
    if (!confirm('ဒီ Withdrawal Request ကို Reject လုပ်မလား?')) return;
    try {
        const ref = db.collection('withdrawals').doc(id);
        const result = await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists) throw new Error('NOT_FOUND');
            const d = snap.data();
            if (d.status !== 'pending') throw new Error('ALREADY_PROCESSED');
            const userRef = db.collection('users').doc(d.userId);
            const userSnap = await tx.get(userRef);
            if (!userSnap.exists) throw new Error('USER_NOT_FOUND');
            const balance = Math.max(0, Number(userSnap.data().mmkBalance) || 0);
            tx.update(userRef, { mmkBalance: balance + (Number(d.amount) || 0) });
            tx.update(ref, {
                status: 'rejected',
                processedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return Number(d.amount) || 0;
        });
        showToast(`↩️ ${result.toLocaleString()} MMK ပြန်အမ်းပြီး Reject လုပ်ပြီးပါပြီ`);
        loadWithdrawRequests();
    } catch (e) {
        showToast(e.message === 'ALREADY_PROCESSED' ? 'Already processed' : '❌ Reject failed', 'error');
    }
}

// ============================================================
//  UTILITIES
// ============================================================
let isDark = false; // Default Light Mode

function toggleTheme() {
    isDark = !isDark;
    document.body.classList.toggle('dark-mode', isDark);
    const icon = document.querySelector('#themeToggleBtn');
    if (icon) icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    const drawerIcon = document.getElementById('drawerThemeIcon');
    if (drawerIcon) drawerIcon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

if (localStorage.getItem('theme') === 'dark') {
    isDark = true;
    document.body.classList.add('dark-mode');
    document.querySelector('#themeToggleBtn').className = 'fas fa-sun';
    const drawerIcon = document.getElementById('drawerThemeIcon');
    if (drawerIcon) drawerIcon.className = 'fas fa-sun';
}

function openModal(id) {
    const el = document.getElementById(id);
    if (!el) {
        console.warn('Modal not found:', id);
        return;
    }
    el.classList.add('show');
}
function closeModal(id) { document.getElementById(id).classList.remove('show'); }
document.querySelectorAll('.modal').forEach(el => {
    el.addEventListener('click', (e) => { if (e.target === el) el.classList.remove('show'); });
});
function openHistoryModal() { openModal('historyModal'); setTimeout(loadTransactionHistory, 300); }
function scrollToAds() { document.getElementById('adsSection').scrollIntoView({ behavior: 'smooth' }); }

function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show ' + type;
    clearTimeout(el._timeout);
    el._timeout = setTimeout(() => el.classList.remove('show'), 3500);
}

function uploadProfileImg(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        localStorage.setItem('profileImg', e.target.result);
        document.getElementById('profileImg').src = e.target.result;
        if (document.getElementById('headerAvatar')) document.getElementById('headerAvatar').src = e.target.result;
        if (document.getElementById('drawerAvatar')) document.getElementById('drawerAvatar').src = e.target.result;
        applyProfileFrame(userData.profileFrame || 'none');
        renderFrameShop();
        showToast('✅ Updated');
    };
    reader.readAsDataURL(file);
}
async function updateProfile() {
    const name = document.getElementById('profileName').value.trim();
    if (!name || !currentUser) return;
    await db.collection('users').doc(currentUser.uid).update({ username: name });
    userData.username = name;
    updateUI();
    showToast('✅ Updated');
}
async function loadTransactionHistory() {
    const container = document.getElementById('transactionList');
    if (!currentUser) return;
    try {
        const snapshot = await db.collection('transactions').where('userId', '==', currentUser.uid).limit(50).get();
        const transactions = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            let date = new Date();
            if (data.timestamp?.seconds) date = new Date(data.timestamp.seconds * 1000);
            transactions.push({ ...data, _date: date });
        });
        if (!transactions.length) { container.innerHTML = '<div class="table-loading">No transactions</div>'; return; }
        transactions.sort((a, b) => b._date - a._date);
        const typeMap = {
            'ad_watch': { icon: '📺', label: 'Ad Watch' },
            'daily_bonus': { icon: '🎁', label: 'Daily Bonus' },
            'welcome_bonus': { icon: '🎉', label: 'Welcome' },
            'top_viewer_bonus': { icon: '🏆', label: 'Top Viewer' },
            'level_bonus': { icon: '⭐', label: 'Level Bonus' },
            'achievement': { icon: '🏅', label: 'Achievement' },
            'referral_bonus': { icon: '👥', label: 'Referral' },
            'exchange': { icon: '🔄', label: 'Exchange' },
            'gift_sent': { icon: '🎁', label: 'Gift Sent' },
            'gift_received': { icon: '🎁', label: 'Gift Received' }
        };
        container.innerHTML = transactions.map(item => {
            const type = typeMap[item.type] || { icon: '📝', label: item.type };
            const amount = item.amount || 0;
            return `<div class="transaction-item">
                <div class="left">
                    <div class="type">${type.icon} ${type.label}</div>
                    <div class="detail">${item.description || ''}</div>
                    <div class="date">${item._date.toLocaleString()}</div>
                </div>
                <div class="right ${amount > 0 ? 'positive' : 'negative'}">${amount > 0 ? '+' : ''}${amount}</div>
            </div>`;
        }).join('');
    } catch (e) { container.innerHTML = '<div class="table-loading">Failed</div>'; }
}
async function sendCoinGift() {
    const receiverEmail = document.getElementById('giftReceiverEmail').value.trim();
    const amount = parseInt(document.getElementById('giftAmount').value);
    const msgEl = document.getElementById('giftMsg');
    if (!receiverEmail || !amount || amount < 1) { msgEl.textContent = '❌ Fill'; msgEl.style.color = 'var(--rose-500)'; return; }
    const totalCost = amount + GIFT_FEE;
    if (userData.coins < totalCost) { msgEl.textContent = '❌ Need ' + totalCost; msgEl.style.color = 'var(--rose-500)'; return; }
    try {
        const snapshot = await db.collection('users').where('email', '==', receiverEmail).get();
        if (snapshot.empty) { msgEl.textContent = '❌ Not found'; msgEl.style.color = 'var(--rose-500)'; return; }
        const receiverDoc = snapshot.docs[0];
        const transferResult = await db.runTransaction(async (tx) => {
            const sRef = db.collection('users').doc(currentUser.uid);
            const rRef = db.collection('users').doc(receiverDoc.id);
            const sDoc = await tx.get(sRef);
            const rDoc = await tx.get(rRef);
            const senderCoins = Math.max(0, Number(sDoc.data()?.coins) || 0);
            const receiverCoins = Math.max(0, Number(rDoc.data()?.coins) || 0);
            if (senderCoins < totalCost) throw new Error('INSUFFICIENT_COINS');
            const newSenderCoins = senderCoins - totalCost;
            tx.update(sRef, { coins: newSenderCoins });
            tx.update(rRef, { coins: receiverCoins + amount });
            return newSenderCoins;
        });
        userData.coins = transferResult;
        saveCoinsToLocal(transferResult);
        updateUI();
        msgEl.textContent = '✅ Sent';
        msgEl.style.color = 'var(--mint-600)';
        showToast('🎁 Sent!', 'success');
    } catch (e) {
        msgEl.textContent = e.message === 'INSUFFICIENT_COINS' ? '❌ Insufficient Coins' : '❌ Failed';
        msgEl.style.color = 'var(--rose-500)';
    }
}

// ============================================================
//  COIN DEBUG TEST
// ============================================================
console.log('🟢 CASH TUBE COIN DEBUG FILE LOADED', {
    time: new Date().toISOString(),
    page: window.location.href
});
// ============================================================
// ============================================================
//  INIT
// ============================================================
window.addEventListener('load', () => {
    setTimeout(() => {
        document.getElementById('splash').classList.add('hide');
        setTimeout(() => { document.getElementById('splash').style.display = 'none'; }, 800);
    }, 2200);
});

updateUI();
renderAdCards();
updateDailyBonusUI();
applyLanguage();
// ============================================================
//  🎬 VIDEO TASKS — YouTube + RSS + Coin System
// ============================================================

const YOUTUBE_API_KEY = 'AIzaSyBmr5WXG46FsqDSSTax8Z9rlnlpQh4oyzI'; // 👈 သင့် key
var VIDEO_REWARD = 30;
const TARGET_WATCH = 120; // 2 minutes
const RSS_CACHE_TIME = 30 * 60 * 1000;

const RSS_CHANNELS = [
    { id: 'UCNHIxx5X9XND2BMZ4LV73Fg', name: 'Heart & Soul', emoji: '🎬', category: 'movies' },
    { id: 'UCZpd3IpUl7c7vLYIIiWzoOA', name: 'Drama Recap', emoji: '📺', category: 'drama' },
    { id: 'UCgsfh9NxpBbzmfdV6wzgFA', name: 'Mg Kyaw AI', emoji: '🤖', category: 'ai' },
    { id: 'UCaL6FKyJ75fAKANYL2P7t_g', name: 'Mahar Ent', emoji: '🎥', category: 'movies' },
    { id: 'UC1ghHlhem7676hJfsyoON5Q', name: 'Barbie Myanmar', emoji: '💃', category: 'fun' },
    { id: 'UCesiu2rvAlopyNVzEK4RFMA', name: 'SEIN HTAY', emoji: '🎞️', category: 'movies' },
    { id: 'UCniPIti4QwaOEorvIqv1RWA', name: 'Anne Bryan', emoji: '🌸', category: 'fun' },
    { id: 'UCj10WX_WHpZIpN6br_g-h1w', name: 'Pyone Play Sports', emoji: '⚽', category: 'sports' }
];

const CORS_PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://api.codetabs.com/v1/proxy?quest='
];

let allRSSVideos = [];
let currentVideoCategory = 'rss';
let ytPlayer = null;
let currentVideoId = "";
let ytPlayerReady = false;
let videoWatchTime = 0;
let videoWatchInterval = null;
let isVideoAdShowing = false;
let isVideoPlaying = false;
let savedVideoTime = 0;

// --- YouTube Player Init ---
function initYTPlayer() {
    if (ytPlayer && ytPlayer.loadVideoById) return;
    if (typeof YT !== 'undefined' && YT.Player) {
        ytPlayer = new YT.Player('player', {
            height: '100%', width: '100%', videoId: '',
            playerVars: { playsinline: 1, rel: 0, modestbranding: 1, enablejsapi: 1 },
            events: {
                onReady: () => {
                    ytPlayerReady = true;
                    const err = document.getElementById('videoError');
                    if (err) err.style.display = 'none';
                    resetVideoWatchTimer();
                },
                onStateChange: onYTPlayerStateChange,
                onError: () => {
                    const err = document.getElementById('videoError');
                    if (err) err.style.display = 'block';
                    resetVideoWatchTimer();
                }
            }
        });
    } else setTimeout(initYTPlayer, 500);
}
window.onYouTubeIframeAPIReady = function() { initYTPlayer(); };

// --- YouTube API Script Loader ---
(function loadYTApi() {
    if (window.YT && window.YT.Player) { initYTPlayer(); return; }
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(s);
    }
})();

function onYTPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        isVideoPlaying = true;
        if (isVideoAdShowing) { isVideoAdShowing = false; resetVideoWatchTimer(); }
        if (!isVideoAdShowing && videoWatchTime < TARGET_WATCH) startVideoWatchTimer();
    } else if (event.data === YT.PlayerState.PAUSED) {
        isVideoPlaying = false;
        if (videoWatchInterval) { clearInterval(videoWatchInterval); videoWatchInterval = null; }
    } else if (event.data === YT.PlayerState.ENDED) {
        isVideoPlaying = false;
        if (videoWatchInterval) { clearInterval(videoWatchInterval); videoWatchInterval = null; }
    }
}

function loadVideo(id) {
    if (!id || id.length !== 11) return;
    currentVideoId = id;
    resetVideoWatchTimer();
    const err = document.getElementById('videoError');
    if (err) err.style.display = 'none';
    const popup = document.getElementById('videoClaimPopup');
    if (popup) popup.style.display = 'none';
    isVideoAdShowing = false;
    isVideoPlaying = false;
    savedVideoTime = 0;
    if (!ytPlayer || !ytPlayerReady) { initYTPlayer(); setTimeout(() => loadVideo(id), 800); return; }
    if (ytPlayer.loadVideoById) {
        ytPlayer.loadVideoById(id);
        setTimeout(() => { if (ytPlayer.playVideo) ytPlayer.playVideo(); }, 800);
    }
    document.getElementById('videosSection').scrollIntoView({ behavior: 'smooth' });
}

// --- Watch Timer (2 min) ---
function resetVideoWatchTimer() {
    if (videoWatchInterval) { clearInterval(videoWatchInterval); videoWatchInterval = null; }
    videoWatchTime = 0;
    isVideoAdShowing = false;
    isVideoPlaying = false;
    const wt = document.getElementById('watchTimer');
    const cp = document.getElementById('videoClaimPopup');
    if (wt) wt.style.display = 'none';
    if (cp) cp.style.display = 'none';
    const wtt = document.getElementById('watchTimerText');
    if (wtt) wtt.textContent = '0s / 120s';
}
function startVideoWatchTimer() {
    if (videoWatchInterval) { clearInterval(videoWatchInterval); videoWatchInterval = null; }
    if (isVideoAdShowing || videoWatchTime >= TARGET_WATCH) { if (videoWatchTime >= TARGET_WATCH) showVideoClaimPopup(); return; }
    isVideoPlaying = true;
    const wt = document.getElementById('watchTimer');
    if (wt) wt.style.display = 'block';
    updateVideoTimerDisplay();
    videoWatchInterval = setInterval(() => {
        if (isVideoAdShowing || !isVideoPlaying) return;
        videoWatchTime++;
        updateVideoTimerDisplay();
        if (videoWatchTime >= TARGET_WATCH) {
            clearInterval(videoWatchInterval);
            videoWatchInterval = null;
            if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
            isVideoPlaying = false;
            showVideoClaimPopup();
        }
    }, 1000);
}
function updateVideoTimerDisplay() {
    const el = document.getElementById('watchTimerText');
    if (el) el.textContent = `${videoWatchTime}s / ${TARGET_WATCH}s`;
}
function showVideoClaimPopup() {
    isVideoAdShowing = true;
    isVideoPlaying = false;
    if (videoWatchInterval) { clearInterval(videoWatchInterval); videoWatchInterval = null; }
    const amtEl = document.getElementById('videoClaimAmount');
    if (amtEl) amtEl.textContent = VIDEO_REWARD;
    const popup = document.getElementById('videoClaimPopup');
    if (popup) popup.style.display = 'block';
    const wt = document.getElementById('watchTimer');
    if (wt) wt.style.display = 'none';
    if (navigator.vibrate) navigator.vibrate(100);
}

// --- Claim → Ad Page → Coin ---
function claimVideoCoin() {
    if (isUpdatingCoins) { showToast('⏳ Please wait...', 'warning'); return; }
    if (!currentUser) { showToast('❌ Please login', 'error'); return; }
    if (!adLinks || adLinks.length === 0) {
        showToast('❌ No ad links configured', 'error');
        const popup = document.getElementById('videoClaimPopup');
        if (popup) popup.style.display = 'none';
        isVideoAdShowing = false;
        resetVideoWatchTimer();
        if (ytPlayer && ytPlayer.playVideo) setTimeout(() => ytPlayer.playVideo(), 500);
        return;
    }
    if (ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
        try { savedVideoTime = ytPlayer.getCurrentTime(); } catch (e) { savedVideoTime = 0; }
    }
    if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
        try { ytPlayer.pauseVideo(); } catch (e) {}
    }
    const popup = document.getElementById('videoClaimPopup');
    if (popup) popup.style.display = 'none';
    const adUrl = adLinks[Math.floor(Math.random() * adLinks.length)];
    try {
        const p = window.open(adUrl, 'videoAdTab', 'width=500,height=700,scrollbars=yes,resizable=yes');
        if (p) p.focus();
        else showToast('⚠️ Popup blocked', 'warning');
    } catch (e) {}
    startVideoAdPage(VIDEO_REWARD);
}

function startVideoAdPage(reward) {
    isVideoAdShowing = true;
    const adPage = document.getElementById('adPage');
    const mainContainer = document.getElementById('appContainer');
    if (mainContainer) mainContainer.style.display = 'none';
    if (adPage) adPage.classList.add('show');
    const progressBar = document.getElementById('adPageProgress');
    const timerEl = document.getElementById('adPageTimer');
    const claimBtn = document.getElementById('adPageClaimBtn');
    const loading = document.getElementById('adPageLoading');
    if (loading) { loading.style.display = 'flex'; loading.innerHTML = '<i class="fas fa-spinner fa-spin"></i><p>Ad Loading...</p>'; }
    if (progressBar) progressBar.style.width = '0%';
    if (timerEl) timerEl.textContent = AD_DURATION;
    if (claimBtn) {
        claimBtn.disabled = true;
        claimBtn.className = 'ad-page-claim-btn';
        claimBtn.innerHTML = `⏳ ${AD_DURATION}s ပြည့်ရင် +${reward} Coin ရမည်...`;
        claimBtn.onclick = null;
    }
    let isClaimed = false;
    const startTime = Date.now();
    if (adPageInterval) clearInterval(adPageInterval);
    adPageInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const timeLeft = Math.max(AD_DURATION - elapsed, 0);
        const progressPercent = Math.min((elapsed / AD_DURATION) * 100, 100);
        if (progressBar) progressBar.style.width = progressPercent + '%';
        if (timerEl) timerEl.textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(adPageInterval);
            adPageInterval = null;
            if (progressBar) progressBar.style.width = '100%';
            if (claimBtn) {
                claimBtn.disabled = false;
                claimBtn.className = 'ad-page-claim-btn active';
                claimBtn.innerHTML = `✅ Claim +${reward} Coins`;
                claimBtn.onclick = function () {
                    if (isClaimed) return;
                    isClaimed = true;
                    claimBtn.disabled = true;
                    claimBtn.innerHTML = '⏳ Adding...';
                    giveVideoReward(reward);
                };
            }
            setTimeout(() => { if (!isClaimed) { isClaimed = true; giveVideoReward(reward); } }, 2000);
        }
    }, 250);
}

async function giveVideoReward(reward) {
    if (!currentUser) { showToast('❌ Please login', 'error'); return; }
    if (!acquireCoinLock()) { showToast('⏳ Please wait...', 'warning'); return; }
    try {
        const newCoins = (userData.coins || 0) + reward;
        const newAds = (userData.totalAds || 0) + 1;
        userData.coins = newCoins;
        userData.totalAds = newAds;
        saveCoinsToLocal(newCoins);
        updateUI();
        updateLevelUI();
        updateAchievementsUI();
        const pending = getPendingAdRewards();
        pending.count += 1;
        pending.coins += reward;
        pending.lastTitle = 'Video Watch';
        setPendingAdRewards(pending);
        const flushed = await flushPendingAdRewards(false);
        closeVideoAdPage();
        showCoinAnimation(reward, newCoins);
        showToast(`✅ +${reward} Coins (Video)!`, 'success');
        if (flushed) loadDashboard();
    } catch (error) {
        showToast('❌ Failed', 'error');
        closeVideoAdPage();
    } finally {
        setTimeout(() => releaseCoinLock(), 1500);
    }
}

function closeVideoAdPage() {
    if (adPageInterval) { clearInterval(adPageInterval); adPageInterval = null; }
    const adPage = document.getElementById('adPage');
    if (adPage) adPage.classList.remove('show');
    const mainContainer = document.getElementById('appContainer');
    if (mainContainer) mainContainer.style.display = 'flex';
    isVideoAdShowing = false;
    const progressBar = document.getElementById('adPageProgress');
    if (progressBar) progressBar.style.width = '0%';
    const timerEl = document.getElementById('adPageTimer');
    if (timerEl) timerEl.textContent = AD_DURATION;
    setTimeout(() => resumeVideoAfterAd(), 4200);
}

function resumeVideoAfterAd() {
    isVideoAdShowing = false;
    if (!ytPlayer || !ytPlayerReady) {
        initYTPlayer();
        setTimeout(() => {
            if (ytPlayer && ytPlayer.loadVideoById && currentVideoId) {
                ytPlayer.loadVideoById(currentVideoId);
                setTimeout(() => { if (ytPlayer.playVideo) ytPlayer.playVideo(); resetVideoWatchTimer(); }, 500);
            }
        }, 1000);
        return;
    }
    try {
        if (savedVideoTime > 0 && ytPlayer.seekTo) {
            ytPlayer.seekTo(savedVideoTime, true);
            setTimeout(() => { if (ytPlayer.playVideo) ytPlayer.playVideo(); resetVideoWatchTimer(); }, 500);
        } else if (currentVideoId && ytPlayer.loadVideoById) {
            ytPlayer.loadVideoById(currentVideoId);
            setTimeout(() => { if (ytPlayer.playVideo) ytPlayer.playVideo(); resetVideoWatchTimer(); }, 800);
        } else if (ytPlayer.playVideo) {
            ytPlayer.playVideo();
            resetVideoWatchTimer();
        }
    } catch (e) {}
}

// --- YouTube Search ---
async function searchYouTube() {
    const query = document.getElementById('videoSearchInput').value.trim();
    if (!query) { showToast('Enter search term', 'error'); return; }
    let videoId = '';
    if (query.includes('youtu.be/')) videoId = query.split('youtu.be/')[1].split('?')[0];
    else if (query.includes('watch?v=')) videoId = query.split('watch?v=').pop().split('&')[0];
    else if (query.includes('shorts/')) videoId = query.split('shorts/')[1].split('?')[0];
    else if (query.length === 11 && /^[a-zA-Z0-9_-]+$/.test(query)) videoId = query;
    if (videoId && videoId.length === 11) { loadVideo(videoId); document.getElementById('videoSearchInput').value = ''; return; }

    const container = document.getElementById('videoGrid');
    const title = document.getElementById('videoListTitle');
    const count = document.getElementById('videoListCount');
    title.textContent = '🔍 Searching...';
    count.textContent = '...';
    container.innerHTML = `<div class="video-loading"><i class="fas fa-spinner"></i><p>Searching "${query}"...</p></div>`;
    try {
        const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=20&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`);
        if (!response.ok) throw new Error('API error');
        const data = await response.json();
        if (data.items && data.items.length > 0) {
            const results = data.items.map(item => ({
                name: item.snippet.title, id: item.id.videoId,
                thumbnail: item.snippet.thumbnails.medium.url,
                channelName: item.snippet.channelTitle, channelEmoji: '🔍',
                published: item.snippet.publishedAt, views: 0
            }));
            title.textContent = `🔍 Results (${results.length})`;
            count.textContent = results.length;
            container.innerHTML = '';
            results.forEach((item, i) => container.appendChild(createVideoCard(item, i)));
        } else {
            container.innerHTML = `<div class="video-no-results"><i class="fas fa-search"></i><p>No results</p></div>`;
            count.textContent = '0';
        }
    } catch (error) {
        container.innerHTML = `<div class="video-no-results"><i class="fas fa-exclamation-circle"></i><p>Search failed</p></div>`;
        count.textContent = '0';
    }
}

// --- RSS Fetch ---
async function fetchChannelRSS(channelId) {
    const cacheKey = `rss_cache_${channelId}`;
    let cached = null;
    try {
        const c = localStorage.getItem(cacheKey);
        if (c) { cached = JSON.parse(c); if (Date.now() - cached.timestamp < RSS_CACHE_TIME) return cached.data; }
    } catch (e) {}
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    for (const proxy of CORS_PROXIES) {
        try {
            const response = await fetch(proxy + encodeURIComponent(rssUrl));
            if (!response.ok) continue;
            const xmlText = await response.text();
            if (!xmlText.includes('<entry>')) continue;
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
            const entries = xmlDoc.querySelectorAll('entry');
            const videos = [];
            entries.forEach(entry => {
                const videoId = entry.getElementsByTagName('yt:videoId')[0]?.textContent;
                const title = entry.getElementsByTagName('title')[0]?.textContent;
                const published = entry.getElementsByTagName('published')[0]?.textContent;
                const thumbnail = entry.getElementsByTagName('media:thumbnail')[0]?.getAttribute('url');
                const stats = entry.getElementsByTagName('media:statistics')[0];
                const views = stats ? parseInt(stats.getAttribute('views')) : 0;
                if (videoId && title) videos.push({
                    id: videoId, name: title, published, views,
                    thumbnail: thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
                });
            });
            if (videos.length > 0) {
                try { localStorage.setItem(cacheKey, JSON.stringify({ data: videos, timestamp: Date.now() })); } catch (e) {}
                return videos;
            }
        } catch (error) { continue; }
    }
    if (cached) return cached.data;
    return [];
}

async function loadRSSVideos() {
    const container = document.getElementById('videoGrid');
    const title = document.getElementById('videoListTitle');
    const count = document.getElementById('videoListCount');
    container.innerHTML = `<div class="video-loading"><i class="fas fa-satellite-dish"></i><p>Channel ၈ ခုကနေ Video တွေ ရယူနေပါသည်...</p></div>`;
    title.textContent = '🎬 Movies';
    count.textContent = '...';
    try {
        const results = await Promise.all(RSS_CHANNELS.map(channel => fetchChannelRSS(channel.id)));
        const allVideos = [];
        results.forEach((videos, i) => {
            const channel = RSS_CHANNELS[i];
            videos.forEach(v => allVideos.push({
                ...v, channelId: channel.id, channelName: channel.name,
                channelEmoji: channel.emoji, channelCategory: channel.category
            }));
        });
        allRSSVideos = allVideos.sort((a, b) => new Date(b.published) - new Date(a.published));
        renderFilteredVideos(allRSSVideos);
    } catch (error) {
        container.innerHTML = `<div class="video-no-results"><i class="fas fa-exclamation-circle"></i><p>Video တွေ ရယူမရပါ</p></div>`;
    }
}

// --- Series Detection ---
function myanmarToNumber(str) {
    if (!str) return 0;
    const map = { '၀':0,'၁':1,'၂':2,'၃':3,'၄':4,'၅':5,'၆':6,'၇':7,'၈':8,'၉':9 };
    let num = '';
    for (const ch of str) num += map[ch] !== undefined ? map[ch] : ch;
    return parseInt(num) || 0;
}
function detectSeries(videos) {
    const patterns = [
        /\(အပိုင်း\s*([၁၂၃၄၅၆၇၈၉၀\d]+)\)/i,
        /အပိုင်း\s*([၁၂၃၄၅၆၇၈၉၀\d]+)/i,
        /(part|episode|ep)\s*([\d၁၂၃၄၅၆၇၈၉၀]+)/i,
        /\(([၁၂၃၄၅၆၇၈၉၀\d])\)/
    ];
    const seriesMap = {};
    const standalone = [];
    videos.forEach(video => {
        let matched = false, baseTitle = '', episodeNum = '';
        for (const pattern of patterns) {
            const match = video.name.match(pattern);
            if (match) {
                episodeNum = match[1] || match[2];
                baseTitle = video.name.replace(/\(အပိုင်း\s*[၁၂၃၄၅၆၇၈၉၀\d]+\)/gi,'')
                    .replace(/အပိုင်း\s*[၁၂၃၄၅၆၇၈၉၀\d]+/gi,'')
                    .replace(/[\s\-–—_]+$/,'').trim();
                matched = true; break;
            }
        }
        if (matched && baseTitle.length > 5) {
            const key = baseTitle.toLowerCase().substring(0, 40);
            if (!seriesMap[key]) seriesMap[key] = { baseTitle, videos: [] };
            seriesMap[key].videos.push({ ...video, episodeNum });
        } else standalone.push(video);
    });
    const series = [];
    const remainingStandalone = [...standalone];
    Object.values(seriesMap).forEach(s => {
        if (s.videos.length >= 2) {
            s.videos.sort((a, b) => myanmarToNumber(a.episodeNum) - myanmarToNumber(b.episodeNum));
            series.push(s);
        } else s.videos.forEach(v => remainingStandalone.push(v));
    });
    return { series, standalone: remainingStandalone };
}

function renderFilteredVideos(videos) {
    const container = document.getElementById('videoGrid');
    const title = document.getElementById('videoListTitle');
    const count = document.getElementById('videoListCount');
    count.textContent = videos.length;
    title.textContent = `🎬 Movies (${videos.length})`;
    if (videos.length === 0) {
        container.innerHTML = `<div class="video-no-results"><i class="fas fa-search"></i><p>Video မတွေ့ပါ</p></div>`;
        return;
    }
    const { series, standalone } = detectSeries(videos);
    container.innerHTML = '';
    series.forEach(s => {
        const group = document.createElement('div');
        group.className = 'series-group';
        let episodesHtml = '';
        s.videos.forEach(video => {
            const epNum = video.episodeNum || '?';
            episodesHtml += `
                <div class="series-episode" onclick="event.stopPropagation(); loadVideo('${video.id}')">
                    <div class="ep-number">${epNum}</div>
                    <img class="ep-thumb" src="${video.thumbnail}" loading="lazy" />
                    <div class="ep-title">အပိုင်း ${epNum}</div>
                </div>`;
        });
        const firstVideo = s.videos[0];
        group.innerHTML = `
            <div class="series-header">
                <div class="series-title-wrap">
                    <span class="series-icon">🎬</span>
                    <div class="series-info">
                        <div class="series-name">${s.baseTitle}</div>
                        <div class="series-meta">
                            <span>${firstVideo.channelEmoji} ${firstVideo.channelName}</span>
                            <span class="series-episodes-count">${s.videos.length} parts</span>
                        </div>
                    </div>
                </div>
                <button class="series-play-all-btn" onclick="event.stopPropagation(); loadVideo('${firstVideo.id}')">
                    <i class="fas fa-play"></i> Play All
                </button>
            </div>
            <div class="series-episodes">${episodesHtml}</div>`;
        container.appendChild(group);
    });
    standalone.forEach((item, index) => container.appendChild(createVideoCard(item, index)));
}

function createVideoCard(item, index) {
    const card = document.createElement('div');
    card.className = 'v-card';
    const pubDate = new Date(item.published);
    const daysAgo = Math.floor((Date.now() - pubDate) / (1000 * 60 * 60 * 24));
    let timeAgo = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' :
        daysAgo < 7 ? daysAgo + 'd ago' : daysAgo < 30 ? Math.floor(daysAgo/7) + 'w ago' :
        daysAgo < 365 ? Math.floor(daysAgo/30) + 'mo ago' : Math.floor(daysAgo/365) + 'y ago';
    card.innerHTML = `
        <div class="v-thumb">
            <img src="${item.thumbnail}" loading="lazy" />
            <div class="play-overlay"><div class="play-icon"><i class="fas fa-play"></i></div></div>
            <div class="time-ago">${timeAgo}</div>
        </div>
        <div class="v-title">${item.name}</div>
        <div class="v-channel">${item.channelEmoji || '📁'} ${item.channelName || 'Local'}</div>`;
    card.onclick = () => loadVideo(item.id);
    return card;
}

// --- Category Switch ---
const defaultSongList = [
    { name: "သီချင်း 1 - တို့ဗမာ", id: "EnpWs20HZiY" },
    { name: "သီချင်း 2 - ရင်ခုန်သံ", id: "H0GOhtVdC3Y" }
];
const defaultVideoList = [{ name: "ဗီဒီယို 1", id: "I54Chzm_YUY" }];
const defaultCartoonList = [{ name: "ကာတွန်း 1", id: "EnpWs20HZiY" }];

function getVideosFromLocal(category) {
    const stored = localStorage.getItem('videos_' + category);
    if (stored) { try { return JSON.parse(stored); } catch (e) {} }
    if (category === 'song') return defaultSongList;
    if (category === 'video') return defaultVideoList;
    if (category === 'cartoon') return defaultCartoonList;
    return [];
}

function switchVideoCategory(category, el) {
    currentVideoCategory = category;
    document.querySelectorAll('.video-pill').forEach(e => e.classList.remove('active'));
    if (el) el.classList.add('active');
    resetVideoWatchTimer();
    isVideoAdShowing = false;
    isVideoPlaying = false;
    if (category === 'rss') loadRSSVideos();
    else if (category === 'search') {
        const container = document.getElementById('videoGrid');
        document.getElementById('videoListTitle').textContent = '🔍 Search';
        document.getElementById('videoListCount').textContent = '0';
        container.innerHTML = `<div class="video-no-results"><i class="fas fa-search"></i><p>အပေါ်မှာ ရှာပါ</p></div>`;
    } else renderLocalVideos(category);
}

function renderLocalVideos(category) {
    const container = document.getElementById('videoGrid');
    const title = document.getElementById('videoListTitle');
    const count = document.getElementById('videoListCount');
    container.innerHTML = '';
    let list = getVideosFromLocal(category);
    title.textContent = category === 'myvideo' ? '📽️ My Videos' :
                        category === 'song' ? '🎵 Songs' :
                        category === 'video' ? '🎬 Videos' : '🎨 Cartoons';
    if (!list || list.length === 0) {
        container.innerHTML = `<div class="video-no-results"><i class="fas fa-video-slash"></i><p>Video မရှိသေးပါ</p></div>`;
        count.textContent = '0';
        return;
    }
    count.textContent = list.length;
    list.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'v-card';
        card.innerHTML = `
            <div class="v-thumb">
                <img src="https://img.youtube.com/vi/${item.id}/hqdefault.jpg" loading="lazy" />
                <div class="play-overlay"><div class="play-icon"><i class="fas fa-play"></i></div></div>
            </div>
            <div class="v-title">${item.name}</div>
            <div class="v-channel">📁 Local</div>`;
        card.onclick = () => { if (item.id && item.id.length === 11) loadVideo(item.id); };
        container.appendChild(card);
    });
}

// --- Init ---
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initYTPlayer();
}
// Lazy load RSS videos when user scrolls to videos section
const _videoSectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && allRSSVideos.length === 0 && currentVideoCategory === 'rss') {
            loadRSSVideos();
            _videoSectionObserver.disconnect();
        }
    });
}, { threshold: 0.1 });
setTimeout(() => {
    const vs = document.getElementById('videosSection');
    if (vs) _videoSectionObserver.observe(vs);
}, 1000);
// ============================================================
//  🌈 DIGITAL MARKET PAGE — FULL LOGIC
// ============================================================
(function(){
    const P = [
        { s:'BTC',  b:68000, v:0.8 },
        { s:'ETH',  b:3500,  v:1.0 },
        { s:'COIN', b:0,     v:0.6, m:true },
        { s:'MMK',  b:2100,  v:0.3 },
        { s:'GOLD', b:2050,  v:0.5 },
        { s:'USDT', b:1.00,  v:0.1 },
        { s:'XAU',  b:68.5,  v:0.7 },
        { s:'SILV', b:24.3,  v:0.9 }
    ];
    const C = ['#ff1744','#ff9100','#ffea00','#00e676',
               '#22d3ee','#a855f7','#f472b6','#00e5ff'];

    let state = {}, prev = {}, tickT = null, waveT = null;
    let booted = false, opened = false;

    // ---- Base rate (MMK per 1 coin) ----
    function baseRate(){
        const direct = (typeof coinMmkRate !== 'undefined' && coinMmkRate > 0) ? coinMmkRate : 0;
        return direct > 0 ? direct / 10000 : 0;
    }

    // ---- Color coding ----
    function colorClass(price, all, pr){
        const mx = Math.max(...all), mn = Math.min(...all);
        const r = (mx - mn) || 1;
        const pos = (price - mn) / r;
        if (pos >= 0.92) return 'hi';
        if (pos <= 0.08) return 'lo';
        if (pos >= 0.4 && pos <= 0.6) return 'mid';
        if (pr !== undefined){
            if (price > pr) return 'u';
            if (price < pr) return 'd';
        }
        return 'mid';
    }

    // ---- Ticker item ----
    function tickItem(p, price, pr){
        const d = pr !== undefined ? price - pr : 0;
        const pc = pr ? (d/pr)*100 : 0;
        const all = Object.values(state).filter(v => typeof v === 'number');
        const cc = colorClass(price, all.length ? all : [price], pr);

        let ar = '■', tc = 'm';
        if (d > 0){ ar='▲'; tc='u'; }
        else if (d < 0){ ar='▼'; tc='d'; }
        else if (cc === 'hi'){ ar='🔥'; tc='h'; }
        else if (cc === 'lo'){ ar='❄'; tc='l'; }

        const dp = price < 10 ? 4 : 2;
        const sg = pc >= 0 ? '+' : '';
        return `<span class="dmx-ti">` +
               `<span class="s">${p.s}</span>` +
               `<span class="${tc}"> ${ar} $${price.toFixed(dp)}</span>` +
               `<span class="${pc>=0?'u':'d'}"> (${sg}${pc.toFixed(2)}%)</span>` +
               `</span>`;
    }

    // ---- Render ticker ----
    function updTick(){
        const el = document.getElementById('dmxTrk');
        if (!el) return;
        let h = '';
        P.forEach(p => {
            const v = state[p.s];
            if (typeof v === 'number') h += tickItem(p, v, prev[p.s]);
        });
        el.innerHTML = h + h;
    }

    // ---- Render price board ----
    function updBoard(){
        const el = document.getElementById('dmxBrd');
        if (!el) return;
        const all = Object.values(state).filter(v => typeof v === 'number');
        let h = '';
        P.forEach(p => {
            const v = state[p.s];
            if (typeof v !== 'number') return;
            const pr = prev[p.s];
            const d = pr !== undefined ? v - pr : 0;
            const pc = pr ? (d/pr)*100 : 0;
            const cc = colorClass(v, all, pr);
            const dp = v < 10 ? 4 : 2;
            const ar = d > 0 ? '▲' : d < 0 ? '▼' : '■';
            h += `<div class="dmx-cl" id="dmxC-${p.s}">` +
                 `<div>` +
                 `<div class="dmx-pr">${p.s}${p.m ? ' ⭐' : ''}</div>` +
                 `<div class="dmx-pc ${d>=0?'u':'d'}">${ar} ${pc>=0?'+':''}${pc.toFixed(2)}%</div>` +
                 `</div>` +
                 `<div class="dmx-pv ${cc}">$${v.toFixed(dp)}</div>` +
                 `</div>`;
        });
        el.innerHTML = h;

        // Flash effect
        P.forEach(p => {
            const v = state[p.s], pr = prev[p.s];
            if (typeof v !== 'number' || pr === undefined) return;
            const c = document.getElementById('dmxC-' + p.s);
            if (!c) return;
            if (v > pr){
                c.classList.remove('dmx-fd'); void c.offsetWidth; c.classList.add('dmx-fu');
            } else if (v < pr){
                c.classList.remove('dmx-fu'); void c.offsetWidth; c.classList.add('dmx-fd');
            }
        });
    }

    // ---- Render wave bars ----
    function updWave(){
        const el = document.getElementById('dmxWb');
        if (!el) return;
        let h = '';
        for (let i = 0; i < 26; i++){
            const ht = 6 + Math.random() * 26;
            const c = C[i % C.length];
            h += `<div class="dmx-bar" style="height:${ht}px;background:${c};box-shadow:0 0 6px ${c};"></div>`;
        }
        el.innerHTML = h;
    }

    // ---- Render exact price ----
    function updXp(){
        const el = document.getElementById('dmxXp');
        const rl = document.getElementById('dmxPageRate');
        if (!el) return;
        const b = baseRate();
        const f = (Math.random() * 0.6 - 0.3);
        const d = b * (1 + f/100);

        let col = '#fbbf24', ar = '■';
        if (f > 0.05){ col = '#00e676'; ar = '▲'; }
        else if (f < -0.05){ col = '#ff1744'; ar = '▼'; }

        el.innerHTML = `Current: <span style="color:${col}">${d.toFixed(4)} MMK</span> / 1 Coin <span style="color:${col}">${ar} ${f>=0?'+':''}${f.toFixed(2)}%</span>`;
        if (rl) rl.textContent = `10,000 C = ${typeof coinMmkRate !== 'undefined' && coinMmkRate > 0 ? coinMmkRate.toLocaleString() : '---'} MMK`;
    }

    // ---- Boot ----
    function boot(){
        if (booted) return;
        booted = true;

        // Seed prices
        P.forEach(p => {
            state[p.s] = p.m
                ? Math.max(baseRate(), 0.0001)
                : p.b * (0.98 + Math.random() * 0.04);
            prev[p.s] = state[p.s];
        });

        updTick(); updBoard(); updWave(); updXp();

        // Market tick every 2 sec
        if (tickT) clearInterval(tickT);
        tickT = setInterval(() => {
            P.forEach(p => {
                const old = state[p.s];
                prev[p.s] = old;
                let np;
                if (p.m){
                    const b = baseRate();
                    np = b * (1 + (Math.random() * 0.8 - 0.4) / 100);
                } else {
                    np = old * (1 + (Math.random() * p.v * 2 - p.v) / 100);
                }
                state[p.s] = np;
            });
            updTick(); updBoard(); updXp();
        }, 2000);

        // Wave bars every 400ms
        if (waveT) clearInterval(waveT);
        waveT = setInterval(updWave, 400);
    }

    // ---- Open page ----
    window.openDmxPage = function(){
        const page = document.getElementById('dmxPage');
        if (!page) return;
        page.classList.add('show');
        page.scrollTop = 0;
        document.body.style.overflow = 'hidden';
        opened = true;
        if (!booted) boot();
        updXp();
    };

    // ---- Close page ----
    window.closeDmxPage = function(){
        const page = document.getElementById('dmxPage');
        if (!page) return;
        page.classList.remove('show');
        document.body.style.overflow = '';
        opened = false;
    };

    // ---- Calculator ----
    window.dmxCalc = function(){
        const inp = document.getElementById('dmxIn');
        const out = document.getElementById('dmxOut');
        if (!inp || !out) return;
        const v = parseInt(inp.value) || 0;
        out.textContent = (v * baseRate()).toFixed(2);
    };

    // ---- Execute exchange ----
    window.dmxGo = async function(){
        const inp = document.getElementById('dmxIn');
        if (!inp) return;
        const v = parseInt(inp.value) || 0;
        if (v <= 0){
            if (typeof showToast === 'function') showToast('❌ Enter Coins', 'error');
            return;
        }
        const rate = baseRate();
        if (!rate || rate <= 0){
            if (typeof showToast === 'function') showToast('❌ MMK Rate မသတ်မှတ်ရသေးပါ', 'error');
            return;
        }
        if (!currentUser || typeof db === 'undefined'){
            if (typeof showToast === 'function') showToast('❌ Please login', 'error');
            return;
        }

        const userRef = db.collection('users').doc(currentUser.uid);
        try {
            const result = await db.runTransaction(async (tx) => {
                const snap = await tx.get(userRef);
                if (!snap.exists) throw new Error('USER_NOT_FOUND');
                const d = snap.data() || {};
                const coins = Math.max(0, Number(d.coins) || 0);
                const mmk = Math.max(0, Number(d.mmkBalance) || 0);
                if (coins < v) throw new Error('INSUFFICIENT_COINS');
                const amount = v * rate;
                tx.update(userRef, {
                    coins: coins - v,
                    mmkBalance: mmk + amount
                });
                return { coins: coins - v, mmkBalance: mmk + amount, amount };
            });

            userData.coins = result.coins;
            userData.mmkBalance = result.mmkBalance;
            if (typeof saveCoinsToLocal === 'function') saveCoinsToLocal(userData.coins);
            if (typeof updateUI === 'function') updateUI();

            db.collection('transactions').add({
                userId: currentUser.uid,
                type: 'digital_market_exchange',
                amount: -v,
                mmkAmount: result.amount,
                description: `${v} Coins → ${result.amount.toFixed(2)} MMK`,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(()=>{});

            inp.value = '';
            const out = document.getElementById('dmxOut');
            if (out) out.textContent = '0.00';
            if (typeof showToast === 'function') showToast(`✅ ${result.amount.toFixed(2)} MMK`, 'success');
        } catch(e) {
            if (typeof showToast === 'function') {
                showToast(e.message === 'INSUFFICIENT_COINS' ? '❌ Insufficient Coins' : '❌ Exchange failed', 'error');
            }
        }
    };

    // ---- ESC key close ----
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && opened) window.closeDmxPage();
    });

    console.log('✅ Digital Market page loaded');
})();




function getYangonDateKey(){
    return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Yangon'}).format(new Date());
}
function applyProfileFrame(frameId){
    const wrap = document.getElementById('profileFrameWrap');
    if (!wrap) return;
    const frame = PROFILE_FRAMES.find(f=>f.id===frameId);
    wrap.className = 'profile-frame-wrap ' + (frame ? frame.cls : 'frame-none');
}
function renderFrameShop(){
    const box = document.getElementById('frameShop');
    if (!box) return;
    const owned = Array.isArray(userData.profileFrames) ? userData.profileFrames : [];
    const equipped = userData.profileFrame || 'none';
    box.innerHTML = PROFILE_FRAMES.map(f=>{
        const isOwned = owned.includes(f.id);
        const isEquipped = equipped === f.id;
        return `<div class="frame-card ${isEquipped?'equipped':''}">
            <div class="frame-preview">
                <div class="profile-frame-wrap ${f.cls}">
                    <img src="${document.getElementById('profileImg')?.src || 'https://ui-avatars.com/api/?name=User&background=3b82f6&color=fff&size=90'}" alt="">
                </div>
            </div>
            <h5>${f.icon} ${f.name}</h5>
            <small>${f.price} Coin</small>
            <button onclick="${isOwned ? `equipProfileFrame('${f.id}')` : `buyProfileFrame('${f.id}')`}">
                ${isEquipped ? '✓ အသုံးပြုနေသည်' : (isOwned ? 'အသုံးပြုမည်' : 'ဝယ်မည် · 300 C')}
            </button>
        </div>`;
    }).join('');
}
async function buyProfileFrame(frameId){
    if (!currentUser) {
        showToast('❌ Please login','error');
        return;
    }

    const frame = PROFILE_FRAMES.find(f => f.id === frameId);
    if (!frame) return;

    const owned = Array.isArray(userData.profileFrames)
        ? userData.profileFrames
        : [];

    if (owned.includes(frameId)) {
        await equipProfileFrame(frameId);
        return;
    }

    const localCoins = Math.max(0, Number(userData.coins) || 0);

    if (localCoins < frame.price) {
        showToast('❌ Coin မလုံလောက်ပါ','error');
        return;
    }

    if (!acquireCoinLock()) return;

    try {
        const ref = db.collection('users').doc(currentUser.uid);

        /*
         * 429 FIX
         * Use a single Firestore update instead of runTransaction.
         * The local coin check above prevents normal accidental purchases.
         */
        const newCoins = localCoins - frame.price;
        const newOwned = owned.slice();
        newOwned.push(frameId);

        await ref.update({
            coins: newCoins,
            profileFrames: newOwned,
            profileFrame: frameId
        });

        userData.coins = newCoins;
        userData.profileFrames = newOwned;
        userData.profileFrame = frameId;

        saveCoinsToLocal(newCoins);
        updateUI();
        applyProfileFrame(frameId);
        renderFrameShop();

        /*
         * Transaction record is optional.
         * Keep it as a separate non-blocking write so a temporary
         * Firestore limit does not make the frame purchase look failed.
         */
        db.collection('transactions').add({
            userId: currentUser.uid,
            type: 'profile_frame_purchase',
            amount: -frame.price,
            description: `Purchased ${frame.name} profile frame`,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(e => {
            console.warn('Frame transaction log skipped:', e);
        });

        showToast(`✨ ${frame.name} Frame ဝယ်ပြီးပါပြီ`,'success');

    } catch(e) {
        console.error('❌ PROFILE FRAME PURCHASE FAILED:', e);
        console.error('Frame ID:', frameId);
        console.error('Firebase project:', firebaseConfig.projectId);
        console.error('Current UID:', currentUser ? currentUser.uid : null);
        console.error('Error code:', e && e.code);
        console.error('Error message:', e && e.message);

        showToast(
            e && e.code === 'permission-denied'
                ? '❌ Frame ဝယ်ခွင့် မရှိပါ'
                : '❌ Frame ဝယ်ယူမှု မအောင်မြင်ပါ',
            'error'
        );
    } finally {
        releaseCoinLock();
    }
}

async function equipProfileFrame(frameId){
    if (!currentUser) return;
    const owned = Array.isArray(userData.profileFrames) ? userData.profileFrames : [];
    if (!owned.includes(frameId)) return;
    try{
        await db.collection('users').doc(currentUser.uid).update({profileFrame:frameId});
        userData.profileFrame = frameId;
        applyProfileFrame(frameId);
        renderFrameShop();
        showToast('💎 Profile Frame ပြောင်းပြီးပါပြီ','success');
    }catch(e){ showToast('❌ Frame ပြောင်းမရပါ','error'); }
}







console.log('✅ Digital Market Exchange loaded');
console.log('✅ Video Tasks loaded');
console.log('✅ CASH TUBE Rewards - Orbit Neon UI Loaded');
    

function getReceiptDateKey(){
    const d = new Date();
    const parts = new Intl.DateTimeFormat('en-GB',{
        timeZone:'Asia/Yangon',
        year:'numeric',
        month:'2-digit',
        day:'2-digit'
    }).formatToParts(d);

    const get = k => parts.find(x=>x.type===k)?.value || '';
    return get('year') + get('month') + get('day');
}

function receiptEscape(value){
    return String(value ?? '').replace(/[&<>"']/g,function(c){
        return {
            '&':'&amp;',
            '<':'&lt;',
            '>':'&gt;',
            '"':'&quot;',
            "'":'&#039;'
        }[c];
    });
}

function receiptDate(value){
    if(!value) return '-';

    let d;
    try{
        if(typeof value.toDate === 'function') d = value.toDate();
        else if(value.seconds) d = new Date(value.seconds * 1000);
        else d = new Date(value);

        return new Intl.DateTimeFormat('en-GB',{
            timeZone:'Asia/Yangon',
            year:'numeric',
            month:'2-digit',
            day:'2-digit',
            hour:'2-digit',
            minute:'2-digit',
            hour12:true
        }).format(d);
    }catch(e){
        return '-';
    }
}

function showWithdrawalReceipt(data){
    const overlay = document.getElementById('withdrawalReceiptOverlay');
    const content = document.getElementById('withdrawalReceiptContent');

    if(!overlay || !content) return;

    const status = data.status || 'pending';

    const statusText =
        status === 'approved' ? '✅ Approved' :
        status === 'rejected' ? '❌ Rejected' :
        '⏳ Pending';

    content.innerHTML = `
        <div class="receipt-brand">
            <div class="receipt-icon">🧾</div>
            <div class="receipt-title">Cash Tube</div>
            <div style="font-size:12px;opacity:.65;">Withdrawal Receipt</div>
            <div class="receipt-number">
                ${receiptEscape(data.receiptNo || '-')}
            </div>
        </div>

        <div style="padding-top:5px;">
            <div class="receipt-line">
                <span>User</span>
                <strong>${receiptEscape(data.username || 'User')}</strong>
            </div>

            <div class="receipt-line">
                <span>Amount</span>
                <strong>${Number(data.amount || 0).toLocaleString()} MMK</strong>
            </div>

            <div class="receipt-line">
                <span>Payment</span>
                <strong>${receiptEscape(data.method || '-')}</strong>
            </div>

            <div class="receipt-line">
                <span>Account</span>
                <strong>${receiptEscape(data.accountName || '-')}</strong>
            </div>

            <div class="receipt-line">
                <span>Phone</span>
                <strong>${receiptEscape(data.phone || '-')}</strong>
            </div>

            <div class="receipt-line">
                <span>Date</span>
                <strong>${receiptDate(data.requestedAt)}</strong>
            </div>

            <div class="receipt-line">
                <span>Status</span>
                <strong class="receipt-status">${statusText}</strong>
            </div>
        </div>

        <button class="receipt-close-btn"
                onclick="closeWithdrawalReceipt()">
            ပိတ်မည်
        </button>
    `;

    overlay.classList.add('show');
}

function closeWithdrawalReceipt(){
    const overlay = document.getElementById('withdrawalReceiptOverlay');
    if(overlay) overlay.classList.remove('show');
}

async function openLatestWithdrawalReceipt(){
    if(!currentUser){
        showToast('❌ Please login','error');
        return;
    }

    try{
        const snap = await db.collection('withdrawals')
            .where('userId','==',currentUser.uid)
            .limit(30)
            .get();

        if(snap.empty){
            showToast('🧾 Withdrawal Receipt မရှိသေးပါ','error');
            return;
        }

        const docs = snap.docs.slice().sort(function(a,b){
            const av = a.data().requestedAt;
            const bv = b.data().requestedAt;

            const at = av && typeof av.toMillis === 'function'
                ? av.toMillis()
                : (av && av.seconds ? av.seconds * 1000 : 0);

            const bt = bv && typeof bv.toMillis === 'function'
                ? bv.toMillis()
                : (bv && bv.seconds ? bv.seconds * 1000 : 0);

            return bt - at;
        });

        const doc = docs[0];
        const d = doc.data() || {};

        showWithdrawalReceipt({
            receiptNo:d.receiptNo || ('CT-' + doc.id.slice(-8).toUpperCase()),
            username:d.username || 'User',
            amount:d.amount || 0,
            method:d.method || '-',
            accountName:d.accountName || '-',
            phone:d.phone || '-',
            status:d.status || 'pending',
            requestedAt:d.requestedAt
        });

    }catch(e){
        console.error('Withdrawal receipt error:',e);
        showToast('❌ Receipt ဖတ်မရပါ','error');
    }
}


;

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
