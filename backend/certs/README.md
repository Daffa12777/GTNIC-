# Supabase database CA

`supabase-ca.crt` is a public CA certificate, not a credential. Downloaded over HTTPS from:
https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

Subject: Supabase Root 2021 CA, Supabase Inc.
SHA-256 fingerprint: 80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA
Expiry: 2031-04-26.

Runtime and Prisma Migrate verify Supabase database certificates using this CA. If Supabase rotates the CA, obtain its replacement from the project dashboard's Database Settings / SSL Configuration and update this file after verifying its source. Do not disable certificate validation.
