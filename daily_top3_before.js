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

