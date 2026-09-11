#!/usr/bin/env bash
set -euo pipefail

read -rsp "Gmail app password: " smtp_password
printf '\n'

printf '%s\n' \
  'HOST=127.0.0.1' \
  'PORT=4110' \
  'ALLOWED_ORIGINS=https://eskaylife.com,https://www.eskaylife.com' \
  'SMTP_HOST=smtp.gmail.com' \
  'SMTP_PORT=465' \
  'SMTP_USER=hbtrading@skngroup.net' \
  "SMTP_PASS=${smtp_password}" \
  'ADMIN_EMAIL=hbtrading@skngroup.net' \
  'RATE_LIMIT_MAX=5' \
  'RATE_LIMIT_WINDOW_MS=900000' \
  > /etc/eskay-contact-api.env

unset smtp_password
chown root:eskay-mailer /etc/eskay-contact-api.env
chmod 0640 /etc/eskay-contact-api.env
echo 'Configuration saved securely.'
