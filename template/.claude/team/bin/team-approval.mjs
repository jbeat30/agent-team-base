#!/usr/bin/env node
// 직접 승인 추적용 CLI, 사용자의 명령 실행을 인증하지 않으며 메인 shell의 위조를 방어하지 않음
import { mkdirSync, readFileSync, realpathSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash, paths, snapshot, validateGrant, verifyRegistration } from './team-policy.mjs';

const root = realpathSync.native(process.cwd());
const [command, value, flag, expectedHash] = process.argv.slice(2);
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const save = (file, data) => writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
const p = () => paths(root, value ?? 'review');

try {
  if (command === 'review-grant') {
    const scope = validateGrant(root, readJson(value));
    console.log(JSON.stringify({ scope, sha256: hash(scope), warning: 'review the content, then run the grant command yourself; agents must not run it for you' }, null, 2));
  } else if (command === 'grant') {
    const scope = validateGrant(root, readJson(value));
    if (flag !== '--hash' || expectedHash !== hash(scope)) throw new Error('--hash from review-grant required');
    const location = paths(root, 'grant');
    mkdirSync(location.guard, { recursive: true });
    save(location.grant, { schemaVersion: 1, projectRoot: root, scope, id: randomUUID(), recordedAt: new Date().toISOString(), source: 'direct approval command; user execution is not authenticated' });
    if (existsSync(location.active)) unlinkSync(location.active);
    console.log(JSON.stringify({ ok: true, message: 'approval scope recorded; existing registration invalidated' }));
  } else if (command === 'review-plan') {
    console.log(JSON.stringify(snapshot(root, value), null, 2));
  } else if (command === 'approve') {
    const current = snapshot(root, value);
    if (flag !== '--hash' || expectedHash !== current.planSha256) throw new Error('plan --hash from review-plan required');
    save(p().approval, { snapshot: current, id: randomUUID(), recordedAt: new Date().toISOString(), source: 'direct approval command; user execution is not authenticated' });
    console.log(JSON.stringify({ ok: true, runId: value, planSha256: current.planSha256 }));
  } else if (command === 'register') {
    const current = snapshot(root, value);
    let receipt = null;
    if (existsSync(p().approval)) receipt = readJson(p().approval);
    const userConfirmed = receipt && hash(receipt.snapshot) === hash(current);
    if (!userConfirmed && !current.pmEligible) throw new Error('direct user approval of the current plan required');
    const active = { runId: value, snapshot: current, confirmedBy: userConfirmed ? 'user' : 'pm-agent', approvalSha256: userConfirmed ? hash(receipt) : null, registeredAt: new Date().toISOString() };
    save(p().active, active);
    console.log(JSON.stringify({ ok: true, ...active }));
  } else if (command === 'verify') {
    console.log(JSON.stringify({ ok: true, registration: verifyRegistration(root, value) }));
  } else if (command === 'revoke') {
    const active = readJson(p().active);
    if (active.runId !== value) throw new Error('active run unit mismatch');
    unlinkSync(p().active);
    console.log(JSON.stringify({ ok: true, message: 'registration released; approval scope and records kept' }));
  } else throw new Error('usage: review-grant <json> | grant <json> --hash <sha256> | review-plan <runId> | approve <runId> --hash <planSha256> | register/verify/revoke <runId>');
} catch (error) {
  console.error(`team-approval: ${error.message}`);
  process.exit(2);
}
