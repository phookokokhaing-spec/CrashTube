CASHTUBE - DAILY ADS + VIP LEVEL UPDATE
======================================

WHAT CHANGED
------------
1. Per-ad 30 Coin reward is disabled for new ad views.
2. Every completed ad adds one count to the daily 300 Ads target.
3. The dashboard shows a 0/300 progress bar.
4. Daily reward is claimable once per Yangon calendar day, after 300 Ads:
   LV1 = 6,000 coins
   LV2 = 8,000 coins
   LV3 = 10,000 coins
   LV4 = 12,000 coins
   LV5 = 14,000 coins
5. Ads-based level thresholds (lifetime totalAds):
   LV1 = 5,000, LV2 = 10,000, LV3 = 15,000, LV4 = 20,000, LV5 = 25,000.
6. A user can request the next level upgrade for 5,000 MMK using WavePay or KBZPay.
   The user enters the payment transaction/reference ID. Admin must verify payment
   independently and approve the request before the account's stored level changes.
7. Admin can configure WavePay and KBZPay account details in Admin Panel and review
   pending level-up requests in the VIP Level Upgrade Requests section.
8. Firestore rules prevent a normal user from changing their own `users/{uid}.level`.
   Only an Admin account recognized by the `admins/{uid}` Firestore document can
   approve level changes.

DEPLOYMENT
----------
From the project folder (the folder containing firebase.json), deploy rules:

  firebase deploy --only firestore:rules --project YOUR_FIREBASE_PROJECT_ID

Before using VIP purchases, confirm that each authorized admin has a document:
  admins/{ADMIN_FIREBASE_AUTH_UID}
with:
  { "active": true }
The frontend's legacy Admin ID login and Firestore's admins/{uid} security check
must both be configured for the same authorized admin account. Do not create an
admin document for an untrusted account.

Then sign in as Admin:
- Open Admin Panel.
- Set WavePay account number/name and KBZPay account number/name.
- Save Payment Accounts.
- Verify each incoming payment outside the app before pressing Approve.

IMPORTANT SECURITY LIMITATION
-----------------------------
This project has no trusted server-side ad verification. The browser timer and
client-side ad counter cannot prove that an ad network actually served a valid
impression. A technically skilled user may still tamper with client-side ad
count data. Firestore rules protect the level field and approval workflow, but
cannot securely validate real ad impressions or all existing client-side coin
operations. Strong anti-fraud enforcement requires a trusted backend/ad-network
verification flow. This update does not add Firebase Cloud Functions.

PAYMENT PROOF
-------------
This version records the payment provider and transaction/reference ID. It does
not upload a receipt image. Admin should verify the transfer using the provider's
own transaction history before approving.

BACKUP
------
The original index.html is preserved as:
index.html.before_daily_ads_level_patch_20261108.bak
