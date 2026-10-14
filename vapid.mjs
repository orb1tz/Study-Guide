// Signs reminders with the app's key pair (Netlify environment variables).
export function setupVapid(push) {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set in Netlify');
  const subject = process.env.VAPID_SUBJECT || (process.env.URL && process.env.URL.startsWith('https://') ? process.env.URL : 'mailto:study-guide@users.noreply.github.com');
  push.setVapidDetails(subject, pub, priv);
}
