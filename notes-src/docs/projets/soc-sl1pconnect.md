---
title: SOC SL1PCONNECT, POC Blue Team
description: Architecture SOC complète (Wazuh + OPNsense + WAF + Suricata + DFIR-IRIS) sur CloudStack
---

# CHEATSHEET FINAL, POC SOC SL1PCONNECT (Blue Team)

!!! abstract "Architecture complète"
    `EXT (Kali) → OPNsense (FW) → WAF (ModSecurity) → Docker (cibles)`
    Supervision : Wazuh (SIEM) ← Suricata (IDS) + WAF + Firewall + Docker → DFIR-IRIS (incidents).
    Document de référence pour la soutenance, tout ce qui a été monté, les pièges, les commandes.

---

## 1. Cartographie & accès

| VM | Rôle | IP LAN | Tailscale | OS | Agent |
|---|---|---|---|---|---|
| debian-wazuh | SIEM (manager+indexer+dashboard) | 192.168.1.142 | 100.68.75.4 | Debian 13 | 000 |
| debian-waf | WAF Nginx+ModSecurity+CRS | 192.168.1.185 | | Debian 13 | 003 |
| debian-docker | Docker cibles + Suricata + IRIS | 192.168.1.145 | | Debian 13 | 001 |
| OPNsense | Firewall | LAN 192.168.1.1 / WAN 10.201.221.59 | | OPNsense 26.1 (UFS) | 004 |
| Kali | Attaquant (Red Team) | 10.201.221.68 (voit QUE le WAN) | | Kali | |

**Accès web (via Tailscale) :**

- Wazuh dashboard : `https://192.168.1.142`
- OPNsense : `https://192.168.1.1`
- IRIS : `https://192.168.1.145`

**Identifiants :**

- IRIS : `administrator` / `Sl1pC0nn3ct_SOC_2026!`
- IRIS API key : `B8BA5D730210B50F41C06941582D7965D57319D5685440587F98DFDC45A01594`

**Versions :** Wazuh **4.14.5** partout (agent ≤ manager OBLIGATOIRE). Hyperviseur : CloudStack.

---

## 2. Flux réseau, qui détecte quoi

```
Kali (10.201.221.68)
   │ ne voit QUE l'IP WAN d'OPNsense
   ▼
OPNsense WAN (10.201.221.59)  ──► détecte le SCAN DE PORTS (règle 87702)
   │ NAT : port 80 → WAF, port 9090 → Grafana
   ▼
WAF (192.168.1.185:80)  ──► détecte SQLi / attaques web (ModSecurity 31333/31101)
   │ reverse proxy
   ▼
Docker (192.168.1.145)  ──► Suricata voit le trafic relayé ; Docker logs → règles custom
   ├─ BRIEF 8081  ├─ BOXER 8080  ├─ SENSOR 8082  ├─ WATCH 9090  └─ PGSQL 5432
```

!!! tip "Règle d'or à retenir"
    Comme Kali ne voit que le WAN, **le scan de ports est vu par OPNsense, PAS par Suricata**. Suricata sert de détection complémentaire sur le trafic applicatif relayé. C'est l'argument « défense en profondeur ».

---

## 3. Wazuh manager (debian-wazuh)

### Services & santé

```bash
sudo systemctl status wazuh-manager wazuh-indexer wazuh-dashboard --no-pager
sudo systemctl restart wazuh-manager
ss -tulpn | grep -E '1514|1515|9200|55000|443'   # vérifier les ports d'écoute
```

### Agents

```bash
sudo /var/ossec/bin/agent_control -l        # lister
sudo /var/ossec/bin/agent_control -i <ID>   # détail
sudo /var/ossec/bin/manage_agents -r <ID>   # supprimer
```

### Logs essentiels

```bash
sudo tail -f /var/ossec/logs/alerts/alerts.json       # alertes (la mine d'or)
sudo tail -f /var/ossec/logs/integrations.log         # intégrations IRIS/Discord
sudo tail -f /var/ossec/logs/ossec.log                # log moteur (debug)
```

### Tester une règle (interactif, coller une ligne de log)

```bash
sudo /var/ossec/bin/wazuh-logtest
```

### Fichiers clés

- Config manager : `/var/ossec/etc/ossec.conf`
- Règles custom : `/var/ossec/etc/rules/local_rules.xml`
- Décodeurs custom : `/var/ossec/etc/decoders/local_decoder.xml`
- Scripts intégration : `/var/ossec/integrations/`

!!! warning "Config dashboard (correctifs post-upgrade)"
    `/etc/wazuh-dashboard/opensearch_dashboards.yml`

    ```yaml
    opensearch.hosts: https://127.0.0.1:9200      # 127.0.0.1 PAS localhost (sinon échec IPv6 ::1)
    opensearch.ssl.verificationMode: none          # POC uniquement
    ```

---

## 4. Agents Wazuh

### Installer (Debian)

```bash
curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | sudo gpg --dearmor -o /usr/share/keyrings/wazuh.gpg
echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" | sudo tee /etc/apt/sources.list.d/wazuh.list
sudo apt update
sudo WAZUH_MANAGER="192.168.1.142" apt install wazuh-agent=4.14.5-1 -y
sudo apt-mark hold wazuh-agent          # FIGER la version (évite upgrade > manager)
sudo systemctl enable --now wazuh-agent
```

### Changer l'IP manager

```bash
sudo sed -i 's|<address>OLD</address>|<address>192.168.1.142</address>|' /var/ossec/etc/ossec.conf
sudo systemctl restart wazuh-agent
```

### Agent OPNsense (FreeBSD) → via plugin web

**Services → Wazuh Agent** : Manager=192.168.1.142, Applications=Select All, Active Response=OFF

---

## 5. Conteneurs cibles (debian-docker, `~/docker`)

| Conteneur | Port | Techno | Faille |
|---|---|---|---|
| brief | 8081 | PHP/Apache | SQLi + auth faible |
| boxer | 8080 | Flask | API sans auth |
| sensor | 8082 | Node.js | Pas de validation |
| watch | 9090 | Grafana 8.5.0 | admin/admin |
| pgsql | 5432 | PostgreSQL 12 | Données santé |

```bash
cd ~/docker
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs -f brief
```

Comptes DB : `admin/Sl1p2024`, `denis/password123`, `bob/bob`

---

## 6. WAF, Nginx + ModSecurity + CRS OWASP (debian-waf)

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
# Grafana NON proxifié (supervision interne, exposée en direct pour la démo)
```

### Commandes

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo tail -f /var/log/modsec_audit.log
```

### Test SQLi (doit donner 403)

```bash
curl -i "http://localhost/?id=1' OR '1'='1"
```

---



### Port forwarding : Firewall → NAT → **Destination NAT**

| Règle | Dest port | → Redirect | Firewall rule |
|---|---|---|---|
| WAF HTTP | 80 | 192.168.1.185:80 | Pass |
| Grafana | 9090 | 192.168.1.145:9090 | Pass |

### Console (CloudStack) : 

- Assigner interfaces : option 1 (vtnet1=WAN, vtnet0=LAN)

---

## 8. Suricata, IDS (debian-docker, sur la Debian, PAS dans Docker)

### Branchement à Wazuh, `/var/ossec/etc/ossec.conf` (agent)

```xml
<localfile>
  <log_format>json</log_format>
  <location>/var/log/suricata/eve.json</location>
</localfile>
```

### Commandes

```bash
sudo systemctl status suricata --no-pager
sudo tail -f /var/log/suricata/eve.json | grep -i signature
sudo suricata-update                 # MAJ règles ET OPEN
sudo suricata -T -c /etc/suricata/suricata.yaml   # tester la config
```

### Filtre Wazuh

```
rule.groups: suricata
data.alert.signature: *SCAN* OR data.alert.category: "Attempted Information Leak"
```

---

## 9. DFIR-IRIS, Ticketing (debian-docker, `~/iris-web`)

### Commandes (depuis `~/iris-web`, n'affecte QUE IRIS)

```bash
cd ~/iris-web
sudo docker compose up -d
sudo docker compose down -v       # -v = efface la DB IRIS (repart propre)
sudo docker compose logs -f app
sudo docker compose ps
```

### Accès : `https://192.168.1.145`, `administrator` / `Sl1pC0nn3ct_SOC_2026!`

!!! note "Segmentation"
    Volontairement PAS derrière le WAF (outil SOC interne = argument segmentation).

---

## 10. Intégration Wazuh → IRIS

### Script : `/var/ossec/integrations/custom-iris.py` (debian-wazuh)

- Filtre : alertes **niveau ≥ 12** → crée une alerte IRIS
- Permissions OBLIGATOIRES :

```bash
sudo chmod 750 /var/ossec/integrations/custom-iris /var/ossec/integrations/custom-iris.py
sudo chown root:wazuh /var/ossec/integrations/custom-iris /var/ossec/integrations/custom-iris.py
```

!!! warning "Mapping sévérité IRIS (IDs NON intuitifs !)"
    ```
    6=Critical, 5=High, 1=Medium, 4=Low, 3=Informational, 2=Unspecified
    ```

Dans le script :

```python
if rule_level >= 14:   severity = 6   # Critical
elif rule_level >= 12: severity = 5   # High
elif rule_level >= 7:  severity = 1   # Medium
else:                  severity = 4   # Low
```

### Déclaration, `/var/ossec/etc/ossec.conf`

```xml
<integration>
  <name>custom-iris</name>
  <hook_url>https://192.168.1.145/alerts/add</hook_url>
  <api_key>B8BA5D730210B50F41C06941582D7965D57319D5685440587F98DFDC45A01594</api_key>
  <level>12</level>
  <alert_format>json</alert_format>
</integration>
```

!!! info "Le `<level>12</level>` est OBLIGATOIRE"
    Sans critère, le script n'est jamais appelé.

### Vérifier les sévérités IRIS via API

```bash
curl -k -H "Authorization: Bearer <API_KEY>" https://192.168.1.145/manage/severities/list
```

---

## 11. Règles de détection custom, `local_rules.xml`

### Grafana brute-force

| ID | Lvl | Détection | MITRE |
|---|---|---|---|
| 100400 | 0 | parent (log JSON Grafana) | |
| 100401 | 5 | échec auth | T1110 |
| 100402 | 3 | login réussi | |
| 100403 | 12 | **brute-force 5/90s** | T1110 |
| 100404 | 14 | **compromission (succès après BF)** | T1110 |

### SQLi BRIEF

| ID | Lvl | Détection | MITRE |
|---|---|---|---|
| 100500 | 0 | parent (log web JSON) | |
| 100501 | 12 | mots-clés SQL | T1190 |
| 100502 | 12 | caractères suspects | T1190 |
| 100503 | 12 | SQLi encodée URL | T1190 |
| 100504 | 14 | **bypass auth** | T1190 |
| 100510 | 14 | **SQLmap (User-Agent)** | T1190 |
| 100511 | 14 | **SQLmap blind/time-based** | T1190 |
| 100512 | 15 | **SQLmap scan massif 10/60s** | T1190 |
| 100520 | 13 | **SQLi aboutie (erreur SQL)** | T1190 |
| 100530 | 15 | **INCIDENT P1 exfiltration RGPD art.33** | T1190+T1005 |

### Scan ports OPNsense

| ID | Lvl | Détection | MITRE |
|---|---|---|---|
| 100600 | 3 | blocage FW (hors multicast) | |
| 100602 | 12 | **scan 15+ blocages/30s** | T1046 |

!!! bug "PIÈGE boucle de rétroaction (IRIS)"
    Wazuh lit les logs Docker d'IRIS → quand IRIS logge "Created alert sqli", la règle SQLi re-matche → boucle. **Correctif sur les parentes 100400 + 100500 :**

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

## 13. Tailscale

### Subnet router (debian-wazuh)

```bash
echo 'net.ipv4.ip_forward = 1' | sudo tee -a /etc/sysctl.d/99-tailscale.conf
sudo sysctl -p /etc/sysctl.d/99-tailscale.conf
sudo tailscale up --advertise-routes=192.168.1.0/24
```

Puis APPROUVER la route : <https://login.tailscale.com/admin/machines>

### Poste perso

```bash
sudo tailscale up --accept-routes
```

---

## 14. Démo d'attaque (Kali → IP_WAN OPNsense)

```bash
# 1. SCAN → règle 87702 (OPNsense, T1110)
nmap -sS -p 1-1000 IP_WAN

# 2. ACCÈS WEB → web-accesslog
curl -I http://IP_WAN

# 3. SQLI → 403 WAF + règles 31333/31101 (+ custom 100501/2)
curl -i "http://IP_WAN/?action=login" --data "username=admin' OR '1'='1&password=x"

# 4. BRUTE FORCE GRAFANA → 100403 puis 100404
for i in $(seq 1 8); do
  curl -s -X POST http://IP_WAN:9090/login -H "Content-Type: application/json" \
    -d '{"user":"admin","password":"wrong'$i'"}' >/dev/null
done

# 5. → alertes ≥12 créent un INCIDENT dans IRIS automatiquement
```

!!! success "Détection multi-sources prouvée"
    OPNsense + WAF + Suricata + Docker → Wazuh → IRIS

---

## 15. Dashboard Wazuh (4.14.5) & filtres

| Menu | Usage |
|---|---|
| Threat intelligence → **Threat Hunting** | alertes + graphiques |
| Threat intelligence → **MITRE ATT&CK** | matrice (top démo) |
| Security operations → **GDPR / PCI DSS / NIST 800-53** | conformité (volet ISO) |
| Endpoint security → **File Integrity Monitoring** | modifs fichiers |

### Filtres démo

```
rule.level >= 7                               # masque le bruit
rule.id:31333 or rule.id:31101                # SQLi
rule.level >= 5 and not rule.groups:pfsense   # attaques sans bruit mDNS firewall
data.alert.signature: *SCAN*                  # scans Suricata
```

---

## 16. PIÈGES, ce qui nous a bloqués (à connaître pour le jury / le futur)

| Problème | Cause | Solution |
|---|---|---|
| Agent "Disconnected" | version agent > manager | aligner en 4.14.5, `apt-mark hold` |
| Dashboard boucle (503) | certs manquants OU IPv6 | régénérer certs / `127.0.0.1` + `verificationMode: none` |
| Dashboard `ECONNREFUSED ::1` | localhost résout en IPv6 | mettre `127.0.0.1` dans `opensearch.hosts` |
| `unable to verify first certificate` | CA dashboard ≠ CA indexer | `verificationMode: none` (POC) |
| WAF compile : Mbed TLS not found | submodules git absents | `git submodule update --init --recursive` |
| WAF : libmodsecurity not found | `make install` oublié | `cd /opt/ModSecurity && make install` |
| nginx : module .so introuvable | mauvais chemin | `/usr/share/nginx/modules/` (pas `/etc/nginx/`) |
| OPNsense : NAT ne passe pas | Block private networks (WAN privé) | décocher dans Interfaces→WAN |
| OPNsense agent casse le FW | plugin force un update OPNsense | installer FW sur disque AVANT, ne pas interrompre l'update |
| OPNsense reboot = WAN vide | live ISO (non persistant) | installer sur disque (UFS) |
| OPNsense reboot = pas d'IP WAN | DHCP CloudStack ne répond pas | IP statique sur le WAN |
| IRIS sous `/iris/` cassé | redirections absolues vers `/dashboard` | accès direct racine (pas de sous-chemin) |
| Intégration IRIS jamais appelée | `<level>` manquant + perms | ajouter `<level>12</level>` + chmod 750 root:wazuh |
| Toutes alertes IRIS en "Low" | mapping `severity_id` IRIS non intuitif | 6=Critical 5=High 1=Medium 4=Low |
| Boucle d'alertes SQLi | Wazuh lit les logs d'IRIS | exclure (negate) `iris/track_activity/Created alert` |
| Suricata crash en boucle | install instable sur debian-wazuh | désinstaller, mettre sur debian-docker |
| Bruit mDNS firewall | 5353→224.0.0.251 = multicast normal | filtrer `not rule.groups:pfsense` |

---

## 17. Ports de référence

| Port | Service |
|---|---|
| 1514/TCP | agent ↔ manager |
| 1515/TCP | enrôlement agents |
| 443 | dashboard Wazuh / OPNsense / IRIS |
| 9200 | indexer (OpenSearch) |
| 55000 | API Wazuh |
| 80 | WAF (entrée web) |
| 9090 | Grafana (exposé) |
| 41641/UDP | Tailscale |

---

*POC SOC SL1PCONNECT, Blue Team. Stack 100 % open source : Wazuh, OPNsense, Nginx+ModSecurity, Suricata, DFIR-IRIS, Tailscale.*
