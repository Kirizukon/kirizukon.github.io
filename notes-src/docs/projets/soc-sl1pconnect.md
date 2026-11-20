---
title: Projet SOC, POC Blue Team
description: Architecture SOC (Wazuh + OPNsense + WAF + Suricata + DFIR-IRIS) sur CloudStack
---

# CHEATSHEET POC SOC

!!! abstract "Architecture complète"
    `EXT (Kali) → OPNsense (FW) → WAF (ModSecurity) → Docker (cibles)`
    Supervision : Wazuh (SIEM) ← Suricata (IDS) + WAF + Firewall + Docker → DFIR-IRIS (incidents).
    Document de référence pour la soutenance, tout ce qui a été monté, les pièges, les commandes.

---

## 1. Cartographie

| VM            | Rôle                             | IP LAN                      | OS            |
| ------------- | -------------------------------- | --------------------------- | ------------- |
| debian-wazuh  | SIEM (manager+indexer+dashboard) | 192.168.1.142               | Debian 13     |
| debian-waf    | WAF Nginx+ModSecurity+CRS        | 192.168.1.185               | Debian 13     |
| debian-docker | Docker cibles + Suricata + IRIS  | 192.168.1.145               | Debian 13     |
| OPNsense      | Firewall                         | 192.168.1.1 / 10.201.221.68 | OPNsense 26.1 |
| Kali          | Attaquant (Red Team)             | 10.201.221.68               | Kali          |

Pas de segmentation réseau, CloudStack instable, port forwarding impossible.

---

## 2. Wazuh manager

### Services

```bash
sudo systemctl status wazuh-manager wazuh-indexer wazuh-dashboard
sudo systemctl restart wazuh-manager
ss -tulpn | grep -E '1514|1515|9200|55000|443'
```

### Agents

Lister :

```bash
sudo /var/ossec/bin/agent_control -l
```

Supprimer un agent :

```bash
sudo /var/ossec/bin/manage_agents -r <ID>
```

Détails :

```bash
sudo /var/ossec/bin/agent_control -i <ID>
```

### Logs essentiels

```bash
sudo tail -f /var/ossec/logs/alerts/alerts.json
sudo tail -f /var/ossec/logs/integrations.log
sudo tail -f /var/ossec/logs/ossec.log
```

### Tester une règle (interactif)

```bash
sudo /var/ossec/bin/wazuh-logtest
```

### Fichiers clés

- Config manager : `/var/ossec/etc/ossec.conf`
- Règles custom : `/var/ossec/etc/rules/local_rules.xml`
- Scripts intégration : `/var/ossec/integrations/`

---

## 4. Agents Wazuh

### Installer (Debian 13)

Récupérer et installer la clé GPG du dépôt Wazuh :

```bash
curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | sudo gpg --dearmor -o /usr/share/keyrings/wazuh.gpg
```

Créer le fichier de dépôt :

```bash
echo 'deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main' \
  | sudo install /dev/stdin /etc/apt/sources.list.d/wazuh.list
```

Mettre à jour la base apt et installer le paquet :

```bash
sudo apt update
sudo WAZUH_MANAGER="192.168.1.142" apt install wazuh-agent=4.14.5-1 -y
sudo systemctl enable wazuh-agent
```

---

## 5. Conteneurs cibles (debian-docker)

| Conteneur | Port | Techno        | Faille             |
| --------- | ---- | ------------- | ------------------ |
| brief     | 8081 | PHP/Apache    | SQLi + auth faible |
| boxer     | 8080 | Flask         | API sans auth      |
| sensor    | 8082 | Node.js       | Pas de validation  |
| watch     | 9090 | Grafana 8.5.0 | admin/admin        |
| pgsql     | 5432 | PostgreSQL 12 | Données santé      |

Comptes DB : `admin/Sl1p2024`, `denis/password123`, `bob/bob`

---

## 6. WAF Nginx + ModSecurity + CRS OWASP (debian-waf)

### Dépendances

```bash
sudo apt install -y nginx git build-essential libpcre2-dev libxml2-dev libyajl-dev \
  libgeoip-dev liblmdb-dev libcurl4-openssl-dev automake libtool pkg-config zlib1g-dev
```

Debian 13 : pas de moteur ModSecurity dispo en paquet, il faut compiler.

### Compiler ModSecurity (à tester)

```bash
cd /opt
sudo git clone --depth 1 https://github.com/owasp-modsecurity/ModSecurity.git
cd /opt/ModSecurity
sudo git config --global --add safe.directory /opt/ModSecurity
sudo git submodule update --init --recursive
sudo ./build.sh
sudo ./configure
sudo make -j$(nproc)
sudo make install
```

### Compiler le connecteur ModSecurity-Nginx

```bash
cd /opt
sudo git clone --depth 1 https://github.com/owasp-modsecurity/ModSecurity-nginx.git

# Sources Nginx de TA version exacte (ici 1.26.3)
sudo wget http://nginx.org/download/nginx-1.26.3.tar.gz
sudo tar zxvf nginx-1.26.3.tar.gz
cd /opt/nginx-1.26.3

# Compiler UNIQUEMENT le module dynamique (chemin ABSOLU vers le connecteur)
sudo ./configure --with-compat --add-dynamic-module=/opt/ModSecurity-nginx
sudo make modules
```

Copier le module au bon endroit :

```bash
sudo mkdir -p /usr/share/nginx/modules
sudo cp objs/ngx_http_modsecurity_module.so /usr/share/nginx/modules/
ls -la /usr/share/nginx/modules/ngx_http_modsecurity_module.so
```

### Charger le module dans Nginx

```bash
sudo nano /etc/nginx/nginx.conf
```

Tout en haut (avant `events {`) :

```nginx
load_module modules/ngx_http_modsecurity_module.so;
```

### Config ModSecurity + CRS OWASP

```bash
# Config de base
sudo mkdir -p /etc/nginx/modsec
sudo cp /opt/ModSecurity/modsecurity.conf-recommended /etc/nginx/modsec/modsecurity.conf
sudo cp /opt/ModSecurity/unicode.mapping /etc/nginx/modsec/

# Mode bloquant
sudo sed -i 's/SecRuleEngine DetectionOnly/SecRuleEngine On/' /etc/nginx/modsec/modsecurity.conf

# CRS OWASP
cd /opt
sudo git clone https://github.com/coreruleset/coreruleset.git
sudo cp /opt/coreruleset/crs-setup.conf.example /opt/coreruleset/crs-setup.conf

# Fichier qui assemble tout
sudo tee /etc/nginx/modsec/main.conf > /dev/null << 'CONF'
Include /etc/nginx/modsec/modsecurity.conf
Include /opt/coreruleset/crs-setup.conf
Include /opt/coreruleset/rules/*.conf
CONF
```

### Fichiers

- Module : `/usr/share/nginx/modules/ngx_http_modsecurity_module.so`
- ModSecurity : `/etc/nginx/modsec/modsecurity.conf` (`SecRuleEngine On`)
- Règles assemblées : `/etc/nginx/modsec/main.conf`
- CRS : `/opt/coreruleset/`
- Site : `/etc/nginx/sites-available/waf`
- Audit : `/var/log/modsec_audit.log`

### Reverse proxy

```nginx
location /        { proxy_pass http://192.168.1.145:8081; }  # BRIEF
location /api/    { proxy_pass http://192.168.1.145:8080; }  # BOXER
location /sensor/ { proxy_pass http://192.168.1.145:8082; }  # SENSOR
```

### Commandes

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo tail -f /var/log/modsec_audit.log
```

### Test firewall (doit donner 403)

```bash
curl -i "http://localhost/?id=1' OR '1'='1"
```

---

## 7. OPNsense Firewall

### Port forwarding

| Règle    | Dest port | Redirect         | Firewall rule |
| -------- | --------- | ---------------- | ------------- |
| WAF HTTP | 80        | 192.168.1.185:80 | Pass          |
| Grafana  | 9090      | 192.168.1.145:9090 | Pass        |

Grafana exposé pour le POC, conforme au sujet.

---

## 8. Suricata IDS

```bash
sudo apt install -y suricata
```

```bash
ip -br a
```

```bash
sudo nvim /etc/suricata/suricata.yaml
```

Remplacer `eth0` par l'interface et configurer le `HOME_NET`.

Définir l'interface dans le service :

```
IFACE=enp3s0
LISTENMODE=af-packet
```

Récupérer les règles et mettre à jour :

```bash
sudo suricata-update enable-source et/open
sudo suricata-update
```

### Branchement à Wazuh

`/var/ossec/etc/ossec.conf` :

```xml
<localfile>
  <log_format>json</log_format>
  <location>/var/log/suricata/eve.json</location>
</localfile>
```

### Commandes

```bash
sudo systemctl status suricata
sudo tail -f /var/log/suricata/eve.json
sudo suricata-update                              # MAJ règles ET OPEN
sudo suricata -T -c /etc/suricata/suricata.yaml   # tester la config
```

### Filtre Wazuh

```
rule.groups: suricata
```

---

## 10. Intégration Wazuh → IRIS

### Script : `/var/ossec/integrations/custom-iris.py` (debian-wazuh)

- Filtre : alertes **niveau ≥ 12** créent une alerte IRIS
- Permissions OBLIGATOIRES :

```bash
sudo chmod 750 /var/ossec/integrations/custom-iris /var/ossec/integrations/custom-iris.py
sudo chown root:wazuh /var/ossec/integrations/custom-iris /var/ossec/integrations/custom-iris.py
```

### Mapping sévérité IRIS

```
6=Critical, 5=High, 1=Medium, 4=Low, 3=Informational, 2=Unspecified
```

### Déclaration dans `/var/ossec/etc/ossec.conf`

```xml
<integration>
  <name>custom-iris</name>
  <hook_url>https://192.168.1.145/alerts/add</hook_url>
  <api_key>B8BA5D730210B50F41C06941582D7965D57319D5685440587F98DFDC45A01594</api_key>
  <level>12</level>
  <alert_format>json</alert_format>
</integration>
```

### Vérifier les sévérités IRIS via API

```bash
curl -k -H "API_KEY>" https://192.168.1.145/manage/severities/list
```

---

## 11. Règles de détection custom, `local_rules.xml`

### Grafana brute-force

| ID     | Lvl | Détection                           | MITRE |
| ------ | --- | ----------------------------------- | ----- |
| 100400 | 0   | parent (log JSON Grafana)           |       |
| 100401 | 5   | échec auth                          | T1110 |
| 100402 | 3   | login réussi                        |       |
| 100403 | 12  | **brute-force 5/90s**               | T1110 |
| 100404 | 14  | **compromission (succès après BF)** | T1110 |

### SQLi BRIEF

| ID     | Lvl | Détection                                | MITRE       |
| ------ | --- | ---------------------------------------- | ----------- |
| 100500 | 0   | parent (log web JSON)                    |             |
| 100501 | 12  | mots-clés SQL                            | T1190       |
| 100502 | 12  | caractères suspects                      | T1190       |
| 100503 | 12  | SQLi encodée URL                         | T1190       |
| 100504 | 14  | **bypass auth**                          | T1190       |
| 100510 | 14  | **SQLmap (User-Agent)**                  | T1190       |
| 100511 | 14  | **SQLmap blind/time-based**              | T1190       |
| 100512 | 15  | **SQLmap scan massif 10/60s**            | T1190       |
| 100520 | 13  | **SQLi aboutie (erreur SQL)**            | T1190       |
| 100530 | 15  | **INCIDENT P1 exfiltration RGPD art.33** | T1190+T1005 |

### Scan ports OPNsense

| ID     | Lvl | Détection                   | MITRE |
| ------ | --- | --------------------------- | ----- |
| 100600 | 3   | blocage FW (hors multicast) |       |
| 100602 | 12  | **scan 15+ blocages/30s**   | T1046 |

!!! bug "Piège : boucle de rétroaction (IRIS)"
    Wazuh lit les logs Docker d'IRIS, quand IRIS logge "Created alert sqli" la règle SQLi re-matche, boucle infinie. **Correctif sur les parentes 100400 + 100500 :**

    ```xml
    <field name="log" negate="yes" type="pcre2">(?i)(iris|track_activity|Created alert|tracker)</field>
    ```

---

## 12. Corrélation, concepts

| Balise | Effet |
|---|---|
| `<if_sid>X</if_sid>` | si règle X vient de matcher (parent immédiat) |
| `<if_matched_sid>X</if_matched_sid>` | si X a matché dans la fenêtre `timeframe` |
| `<if_matched_group>grp</if_matched_group>` | idem sur un groupe |
| `<frequency>N</frequency>` + `<timeframe>S</timeframe>` | N fois en S secondes |
| `<same_source_ip />` | même IP source |
| `<same_field>x</same_field>` | corréler sur un champ commun |

**Types :** fréquence (brute-force), enchaînement (100404 = succès APRÈS brute-force), multi-sources (scan FW → SQLi WAF → accès DB = kill chain).

---

## 14. Démo d'attaque (Kali → IP_WAN OPNsense)

```bash
# 1. SCAN
nmap -sS -p 1-1000 IP_WAN

# 2. ACCÈS WEB
curl -I http://IP_WAN

# 3. SQLi (403 WAF)
curl -i "http://IP_WAN/?action=login" --data "username=admin' OR '1'='1&password=x"

# 4. BRUTE FORCE GRAFANA → 100403 puis 100404
for i in $(seq 1 8); do
  curl -s -X POST http://IP_WAN:9090/login -H "Content-Type: application/json" \
    -d '{"user":"admin","password":"wrong'$i'"}' >/dev/null
done

# 5. → alertes ≥ 12 créent un INCIDENT dans IRIS automatiquement
```

Détection multi-sources prouvée : OPNsense + WAF + Suricata + Docker → Wazuh → IRIS.

---

## 15. Ports de référence

| Port     | Service                           |
| -------- | --------------------------------- |
| 1514/TCP | agent ↔ manager                   |
| 1515/TCP | enrôlement agents                 |
| 443      | dashboard Wazuh / OPNsense / IRIS |
| 9200     | indexer (OpenSearch)              |
| 55000    | API Wazuh                         |
| 80       | WAF (entrée web)                  |
| 9090     | Grafana (exposé)                  |

---

## 16. Configurations

### WAF (Nginx)

```nginx
server {
    listen 80;
    server_name _;
    modsecurity on;
    modsecurity_rules_file /etc/nginx/modsec/main.conf;

    # BRIEF
    location / {
        proxy_pass http://192.168.1.145:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    # BOXER
    location /api/ {
        proxy_pass http://192.168.1.145:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    # SENSOR
    location /sensor/ {
        proxy_pass http://192.168.1.145:8082;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# IRIS
server {
    listen 8443 ssl;
    server_name _;

    ssl_certificate     /etc/nginx/ssl/waf.crt;
    ssl_certificate_key /etc/nginx/ssl/waf.key;

    location / {
        proxy_pass https://192.168.1.145:443/;
        proxy_ssl_verify off;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Agent Wazuh WAF (`ossec.conf`)

```xml
<ossec_config>
  <localfile>
    <log_format>journald</log_format>
    <location>journald</location>
  </localfile>

  <localfile>
    <log_format>apache</log_format>
    <location>/var/log/nginx/access.log</location>
  </localfile>

  <localfile>
    <log_format>apache</log_format>
    <location>/var/log/nginx/error.log</location>
  </localfile>

  <localfile>
    <log_format>syslog</log_format>
    <location>/var/ossec/logs/active-responses.log</location>
  </localfile>

  <localfile>
    <log_format>syslog</log_format>
    <location>/var/log/dpkg.log</location>
  </localfile>
</ossec_config>
```

### Intégration Wazuh → IRIS

```xml
<!-- Iris -->
<integration>
  <name>custom-iris</name>
  <hook_url>https://192.168.1.145/alerts/add</hook_url>
  <api_key>B8BA5D730210B50F41C06941582D7965D57319D5685440587F98DFDC45A01594</api_key>
  <level>12</level>
  <alert_format>json</alert_format>
</integration>
```

### Docker (cibles)

```yaml
services:

  brief:
    image: php:7.4-apache
    container_name: brief
    ports:
      - "8081:80"
    volumes:
      - ./brief:/var/www/html
    restart: unless-stopped
    command: bash -c "apt-get update && apt-get install -y libcurl4-openssl-dev && docker-php-ext-install curl && apache2-foreground"

  watch:
    image: grafana/grafana:8.5.0
    container_name: watch
    ports:
      - "9090:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_SECURITY_ADMIN_USER=admin
    restart: unless-stopped

  boxer:
    image: python:3.9-slim
    container_name: boxer
    ports:
      - "8080:5000"
    volumes:
      - ./boxer:/app
    working_dir: /app
    command: bash -c "pip install flask psycopg2-binary && python app.py"
    restart: unless-stopped

  sensor:
    image: node:16-slim
    container_name: sensor
    ports:
      - "8082:3000"
    volumes:
      - ./sensor:/app
    working_dir: /app
    command: node app.js
    restart: unless-stopped

  pgsql:
    image: postgres:12
    container_name: pgsql
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=admin
      - POSTGRES_PASSWORD=Sl1p2024
      - POSTGRES_DB=slipconnect_health
    volumes:
      - ./pgsql/init.sql:/docker-entrypoint-initdb.d/init.sql
    restart: unless-stopped
```

### Agent Wazuh Docker (`ossec.conf`)

```xml
<localfile>
  <log_format>journald</log_format>
  <location>journald</location>
</localfile>

<localfile>
  <log_format>syslog</log_format>
  <location>/var/ossec/logs/active-responses.log</location>
</localfile>

<localfile>
  <log_format>syslog</log_format>
  <location>/var/log/dpkg.log</location>
</localfile>

<localfile>
  <log_format>json</log_format>
  <location>/var/lib/docker/containers/*/*-json.log</location>
</localfile>

<localfile>
  <log_format>syslog</log_format>
  <location>/var/log/auth.log</location>
</localfile>

<localfile>
  <log_format>json</log_format>
  <location>/var/log/suricata/eve.json</location>
</localfile>
```
