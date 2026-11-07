#!/bin/bash
# ============================================================
# Eisenhower Portfolio Manager — TLS Certificate Generation
# ============================================================
#
# Generates self-signed TLS certificates for internal service
# communication.  In production, replace with certificates from
# a trusted CA (e.g., Let's Encrypt, internal PKI).
#
# Usage:
#   ./generate-tls-certs.sh [output_dir]
#
# Output:
#   <output_dir>/ca.crt          — CA certificate
#   <output_dir>/ca.key          — CA private key
#   <output_dir>/server.crt      — Server certificate
#   <output_dir>/server.key      — Server private key
#   <output_dir>/redis.crt       — Redis TLS certificate
#   <output_dir>/redis.key       — Redis TLS private key
# ============================================================

set -euo pipefail

OUTPUT_DIR="${1:-deploy/tls}"
DAYS=3650  # 10 years for internal certs

echo "Generating TLS certificates in ${OUTPUT_DIR}..."
mkdir -p "${OUTPUT_DIR}"

# -----------------------------------------------------------
# 1. Generate CA (Certificate Authority)
# -----------------------------------------------------------
echo "[1/4] Generating CA key and certificate..."
openssl genrsa -out "${OUTPUT_DIR}/ca.key" 4096
openssl req -new -x509 -days ${DAYS} -key "${OUTPUT_DIR}/ca.key" \
    -out "${OUTPUT_DIR}/ca.crt" \
    -subj "/C=GB/ST=London/L=London/O=Eisenhower/OU=CA/CN=Eisenhower Internal CA"

# -----------------------------------------------------------
# 2. Generate server certificate for Nginx / FastAPI
# -----------------------------------------------------------
echo "[2/4] Generating server key and certificate..."
openssl genrsa -out "${OUTPUT_DIR}/server.key" 4096
openssl req -new -key "${OUTPUT_DIR}/server.key" \
    -out "${OUTPUT_DIR}/server.csr" \
    -subj "/C=GB/ST=London/L=London/O=Eisenhower/OU=Server/CN=localhost"

# SAN (Subject Alternative Names) for localhost and internal DNS
cat > "${OUTPUT_DIR}/server_ext.cnf" <<EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = GB
ST = London
L = London
O = Eisenhower
OU = Server
CN = localhost

[v3_req]
subjectAltName = @alt_names
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth, clientAuth

[alt_names]
DNS.1 = localhost
DNS.2 = eisenhower-backend
DNS.3 = eisenhower-frontend
DNS.4 = eisenhower-postgres
DNS.5 = eisenhower-redis
DNS.6 = eisenhower-minio
IP.1 = 127.0.0.1
IP.2 = 172.28.0.2
IP.3 = 172.28.0.3
IP.4 = 172.28.0.4
IP.5 = 172.28.0.5
EOF

openssl x509 -req -days ${DAYS} \
    -in "${OUTPUT_DIR}/server.csr" \
    -CA "${OUTPUT_DIR}/ca.crt" \
    -CAkey "${OUTPUT_DIR}/ca.key" \
    -CAcreateserial \
    -out "${OUTPUT_DIR}/server.crt" \
    -extfile "${OUTPUT_DIR}/server_ext.cnf" \
    -extensions v3_req

# -----------------------------------------------------------
# 3. Generate Redis TLS certificate
# -----------------------------------------------------------
echo "[3/4] Generating Redis TLS key and certificate..."
openssl genrsa -out "${OUTPUT_DIR}/redis.key" 4096
openssl req -new -key "${OUTPUT_DIR}/redis.key" \
    -out "${OUTPUT_DIR}/redis.csr" \
    -subj "/C=GB/ST=London/L=London/O=Eisenhower/OU=Redis/CN=eisenhower-redis"

openssl x509 -req -days ${DAYS} \
    -in "${OUTPUT_DIR}/redis.csr" \
    -CA "${OUTPUT_DIR}/ca.crt" \
    -CAkey "${OUTPUT_DIR}/ca.key" \
    -CAcreateserial \
    -out "${OUTPUT_DIR}/redis.crt" \
    -extfile "${OUTPUT_DIR}/server_ext.cnf" \
    -extensions v3_req

# -----------------------------------------------------------
# 4. Set permissions and clean up
# -----------------------------------------------------------
echo "[4/4] Setting permissions..."
chmod 600 "${OUTPUT_DIR}/ca.key"
chmod 600 "${OUTPUT_DIR}/server.key"
chmod 600 "${OUTPUT_DIR}/redis.key"
chmod 644 "${OUTPUT_DIR}/ca.crt"
chmod 644 "${OUTPUT_DIR}/server.crt"
chmod 644 "${OUTPUT_DIR}/redis.crt"

# Clean up CSR and config files
rm -f "${OUTPUT_DIR}"/*.csr
rm -f "${OUTPUT_DIR}"/*.cnf
rm -f "${OUTPUT_DIR}"/*.srl

echo ""
echo "TLS certificates generated successfully in ${OUTPUT_DIR}/"
echo ""
echo "Files:"
ls -la "${OUTPUT_DIR}/"
echo ""
echo "IMPORTANT: In production, replace these self-signed certificates"
echo "with certificates from a trusted CA (e.g., Let's Encrypt, internal PKI)."
