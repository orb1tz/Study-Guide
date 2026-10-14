# Study Guide

Private source for the Study Guide website. Netlify builds it automatically on every change.

- `site/index.html`: the guide itself. Edit this to change content or dates (key dates live in `KEY_DATES`).
- `build.mjs`: locks the page with your code (Netlify setting `GUIDE_CODE`) and prepares reminders.
- `netlify/functions/push-daily.mjs`: sends reminders every morning (checks every 15 minutes).
- `netlify/functions/push-test.mjs`: the "Send a test" button.

Netlify settings needed: `GUIDE_CODE`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `FIREBASE_SERVICE_ACCOUNT`.
Never upload the service account file or the private key to this repository.
