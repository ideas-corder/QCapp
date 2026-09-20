// MFA end-to-end test.
const BASE = process.env.API_URL || 'http://127.0.0.1:3002';

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  return data;
}

const { authenticator } = await import('otplib');

(async () => {
  console.log(`MFA test against ${BASE}\n`);

  // 1. Login (no MFA yet)
  let j = await call('POST', '/auth/login', {
    body: { email: 'inspector@qc.local', password: 'Inspector@123' },
  });
  console.log(`1. login mode = ${j.mode}`);
  if (j.mode !== 'authenticated') {
    console.log('  (inspector already has MFA — disabling via /auth/mfa/reset is not implemented, aborting MFA test)');
    process.exit(0);
  }
  const token = j.accessToken;

  // 2. Enroll MFA
  const enroll = await call('POST', '/auth/mfa/enroll', { token });
  console.log(`2. enrolled, secret length = ${enroll.secret.length}`);

  // 3. Confirm with a generated TOTP code
  const code = authenticator.generate(enroll.secret);
  await call('POST', '/auth/mfa/confirm', {
    token,
    body: { totpCode: code },
  });
  console.log('3. confirm = OK');

  // 4. Login again — should now require MFA
  const j2 = await call('POST', '/auth/login', {
    body: { email: 'inspector@qc.local', password: 'Inspector@123' },
  });
  console.log(`4. login mode = ${j2.mode}`);
  if (j2.mode !== 'mfa_required') {
    throw new Error('Expected mfa_required after enrollment');
  }

  // 5. Verify MFA step 2
  const code2 = authenticator.generate(enroll.secret);
  const j3 = await call('POST', '/auth/login/mfa', {
    body: { mfaPendingToken: j2.mfaPendingToken, totpCode: code2 },
  });
  if (!j3.accessToken) throw new Error('MFA step 2 did not return accessToken');
  console.log('5. mfa login ok');

  console.log('\nMFA flow works end-to-end 🎉');
  console.log('(Inspector now has MFA enabled. To reset for repeat testing, set users.mfa_enabled=false in DB.)');
})().catch((e) => {
  console.error('\n❌', e.message);
  process.exit(1);
});
