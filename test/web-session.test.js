import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
function authHarness() {
  const start = source.indexOf('const WEB_SESSION_COOKIE =');
  const end = source.indexOf('// Gateway admin token', start);
  return vm.runInNewContext(`${source.slice(start, end)}; ({hasWebSession, establishWebSession})`, {
    crypto, Buffer, Date,
  });
}

test("web session is host bound, signed, and invalid after wrapper restart", () => {
  const auth = authHarness();
  const req = { headers: { host: "alfred.example.com" } };
  let cookie;
  auth.establishWebSession(req, { append(name, value) {
    assert.equal(name, "Set-Cookie"); cookie = value;
  } });
  assert.match(cookie, /; Path=\/; HttpOnly; Secure; SameSite=Strict$/);
  assert.doesNotMatch(cookie, /Max-Age|Domain=/);
  req.headers.cookie = cookie.split(";")[0];
  assert.equal(auth.hasWebSession(req), true);
  assert.equal(auth.hasWebSession({ headers: { ...req.headers, host: "other.example.com" } }), false);
  assert.equal(authHarness().hasWebSession(req), false);
  assert.equal(auth.hasWebSession({ headers: { ...req.headers, cookie: req.headers.cookie + "x" } }), false);
});

test("web session rejects absent, malformed, expired, and oversized cookies", () => {
  const auth = authHarness();
  for (const value of ["", "1.a.b", "0." + "a".repeat(32) + "." + "b".repeat(64), "x".repeat(257)]) {
    assert.equal(auth.hasWebSession({ headers: { host: "alfred.example.com", cookie: `__Host-openclaw-wrapper-session=${value}` } }), false);
  }
});

test("dashboard session allows Bearer requests after the password login", () => {
  const helpers = source.slice(source.indexOf('const WEB_SESSION_COOKIE ='), source.indexOf('// Gateway admin token'));
  const middleware = source.slice(source.indexOf('function requireDashboardAuth('), source.indexOf('// --- Gateway token injection ---'));
  const auth = vm.runInNewContext(`${helpers}\n${middleware}; ({requireDashboardAuth})`, {
    crypto, Buffer, Date, SETUP_PASSWORD: "test-only-password",
  });
  const req = { path: "/avatar/main", headers: { host: "alfred.example.com", authorization: "Basic " + Buffer.from("admin:test-only-password").toString("base64") } };
  let cookie; let calls = 0;
  const res = { append(_name, value) { cookie = value.split(";")[0]; }, set() { throw Error("unexpected challenge"); } };
  auth.requireDashboardAuth(req, res, () => calls++);
  req.headers = { host: req.headers.host, cookie, authorization: "Bearer test-only-gateway-token" };
  auth.requireDashboardAuth(req, res, () => calls++);
  assert.equal(calls, 2);
});
