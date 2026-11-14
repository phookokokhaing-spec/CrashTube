
/* CASHTUBE WEB PUSH REGISTRATION */
window.enablePushNotifications = async function () {
    const status = document.getElementById('pushNotificationStatus');
    const say = (message) => {
        if (status) status.textContent = message;
    };

    try {
        const user = firebase.auth().currentUser;
        if (!user) {
            say('အရင်ဆုံး CashTube အကောင့် Login ဝင်ပါ။');
            return;
        }

        if (!('serviceWorker' in navigator) ||
            !('Notification' in window) ||
            !firebase.messaging) {
            say('ဒီ Browser မှာ Push Notification မရနိုင်ပါ။');
            return;
        }

        const supported = await firebase.messaging.isSupported();
        if (!supported) {
            say('ဒီ Browser သို့မဟုတ် ဖုန်းမှာ Push Notification မထောက်ပံ့ပါ။');
            return;
        }

        if (Notification.permission === 'denied') {
            say('Notification ပိတ်ထားပါတယ်။ Chrome Site Settings မှာ Allow ပြန်လုပ်ပါ။');
            return;
        }

        let permission = Notification.permission;
        if (permission !== 'granted') {
            permission = await Notification.requestPermission();
        }

        if (permission !== 'granted') {
            say('Notification ခွင့်ပြုချက် မရရှိပါ။');
            return;
        }

        say('Notification စနစ် ချိတ်ဆက်နေပါတယ်...');

        const appBase = new URL('./', window.location.href);
        const registration = await navigator.serviceWorker.register(
            new URL('firebase-messaging-sw.js', appBase),
            { scope: appBase.pathname }
        );

        const messaging = firebase.messaging();

        // FOREGROUND PUSH: show Android notification while CashTube is open.
        if (!window.__cashTubeForegroundPushBound) {
            window.__cashTubeForegroundPushBound = true;

            messaging.onMessage(async function(payload) {
                try {
                    const notification = payload.notification || {};
                    const data = payload.data || {};

                    const title =
                        notification.title || data.title || 'CashTube';

                    const body =
                        notification.body ||
                        data.message ||
                        data.body ||
                        'CashTube မှ အသိပေးချက်အသစ် ရှိပါတယ်။';

                    const activeRegistration =
                        await navigator.serviceWorker.getRegistration(
                            appBase.pathname
                        ) || registration;

                    if (
                        Notification.permission === 'granted' &&
                        activeRegistration
                    ) {
                        await activeRegistration.showNotification(title, {
                            body: body,
                            icon: new URL('favicon.ico', appBase).href,
                            data: {
                                url: data.url || './'
                            }
                        });
                    }
                } catch (error) {
                    console.error(
                        'CASHTUBE FOREGROUND PUSH ERROR:',
                        error
                    );
                }
            });
        }

        const token = await messaging.getToken({
            vapidKey: 'BLnmW_udUd--yYnkWRegSuy3DxSN9xHwGYNcjQVcaAJj6Ssi9pMisJmAJR_52OAlMUXoFpsuJhKpZ9SrFIFXuOU',
            serviceWorkerRegistration: registration
        });

        if (!token) {
            say('FCM Token မရရှိပါ။ Browser ကို ပြန်ဖွင့်ပြီး စမ်းပါ။');
            return;
        }

        const tokenId = encodeURIComponent(token);
        const tokenRef = firebase.firestore()
            .collection('users').doc(user.uid)
            .collection('fcmTokens').doc(tokenId);

        const existing = await tokenRef.get();

        if (!existing.exists) {
            await tokenRef.set({
                token: token,
                platform: 'web',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        localStorage.setItem('cashtube_push_enabled_' + user.uid, 'true');
        say('✅ Push Notification ဖွင့်ပြီးပါပြီ။');

        // TEMPORARY LOCAL NOTIFICATION TEST (this device only)
        await registration.showNotification('CashTube စမ်းသပ်ချက်', {
            body: 'ဖုန်း Notification Bar မှာ ဒီစာပေါ်ရပါမယ်။',
            data: { url: './' }
        });
    } catch (error) {
        console.error('CASHTUBE PUSH ERROR:', error);
        say('ချိတ်ဆက်မှု မအောင်မြင်ပါ။ ' + (error.message || 'ပြန်စမ်းပါ။'));
    }
};
