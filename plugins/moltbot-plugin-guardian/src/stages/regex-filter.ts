/**
 * Stage 1: Regex Filter
 *
 * Instantly blocks requests matching known malicious patterns
 */

import type { StageResult } from "../guardian-pipe.js";

// Pre-compiled regex patterns for performance
const MALICIOUS_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
    // ========== SYSTEM COMMAND INJECTION ==========
    { name: "rm_rf", pattern: /rm\s+-rf\s+[\/~]/i },
    { name: "sudo_command", pattern: /sudo\s+[a-z]/i },
    { name: "chmod_777", pattern: /chmod\s+777/i },
    { name: "eval_exec", pattern: /\b(eval|exec)\s*\(/i },
    // NEW: Additional destructive commands
    { name: "disk_wipe", pattern: /(dd\s+if=\/dev\/(zero|random)|mkfs\.|format\s+c:|fdisk|parted)/i },
    { name: "system_halt", pattern: /\b(shutdown|reboot|poweroff|halt|init\s+0)\b/i },
    { name: "fork_bomb", pattern: /:\(\)\s*\{\s*:\|:&\s*\}|\.\/:\(\)\s*\{/i },
    { name: "command_substitution", pattern: /\$\((rm|shutdown|reboot|dd|mkfs|poweroff)/i },
    { name: "backtick_exec", pattern: /`(rm|shutdown|reboot|dd|mkfs|poweroff|curl|wget)/i },
    { name: "windows_del", pattern: /\b(del|rmdir|rd)\s+\/[sfq]/i },

    // ========== PRIVILEGE ESCALATION ==========
    { name: "setuid_bit", pattern: /chmod\s+[u\+]*s\s|chmod\s+4[0-7]{3}/i },
    { name: "sudoers_modify", pattern: /(\/etc\/sudoers|NOPASSWD)/i },
    { name: "user_add_root", pattern: /useradd.*(-u\s*0|-o\s+-u\s*0)/i },
    { name: "passwd_modify", pattern: /\bpasswd\s+(root|admin)/i },
    { name: "capability_abuse", pattern: /\bsetcap\b.*cap_/i },
    { name: "chown_sensitive", pattern: /chown.*\/(etc|bin|sbin|root)/i },

    // ========== EMAIL/FILE EXFILTRATION ==========
    { name: "email_forward", pattern: /(forward|send|전달|보내).{0,30}(email|mail|이메일).{0,30}@/i },
    { name: "file_upload", pattern: /(upload|ftp|scp|curl.*-d|wget.*--post)/i },

    // ========== CREDENTIAL THEFT ==========
    { name: "api_key_request", pattern: /(api[_-]?key|token|secret|password|credential).{0,20}(show|tell|give|send|보여|알려)/i },

    // ========== PROMPT INJECTION ==========
    { name: "ignore_instructions", pattern: /ignore\s+(previous|all|your)\s+(instructions?|rules?)/i },
    { name: "jailbreak_dan", pattern: /you\s+are\s+now\s+(DAN|jailbroken|unrestricted)/i },
    { name: "reveal_prompt", pattern: /reveal\s+(your|hidden)\s+(prompt|instructions?|system)/i },
    // NEW: Additional prompt injection patterns
    { name: "prompt_override", pattern: /\[(SYSTEM|ADMIN|ROOT)\].*override/i },
    { name: "prompt_pretend", pattern: /pretend\s+you\s+(are|have)\s+(no|without)\s+(restrictions?|limits?)/i },
    { name: "prompt_endmarker", pattern: /(%%%|###|===)\s*(END|STOP).*(PROMPT|INSTRUCTION)/i },
    { name: "prompt_html_inject", pattern: /<!\s*--.*ignore.*--\s*>/i },

    // ========== SQL INJECTION ==========
    { name: "sql_drop", pattern: /DROP\s+(TABLE|DATABASE)/i },
    { name: "sql_delete_all", pattern: /DELETE\s+FROM\s+\w+\s*(;|WHERE\s+'1'\s*=\s*'1')/i },
    // NEW: Comprehensive SQL injection patterns
    { name: "sql_union", pattern: /UNION\s+(ALL\s+)?SELECT/i },
    { name: "sql_or_bypass", pattern: /'\s*OR\s+'?1'?\s*=\s*'?1/i },
    { name: "sql_comment", pattern: /'\s*--\s*$/i },
    { name: "sql_exec", pattern: /EXEC\s+(xp_|sp_)/i },
    { name: "sql_update", pattern: /UPDATE\s+\w+\s+SET\s+\w+\s*=/i },
    { name: "sql_waitfor", pattern: /WAITFOR\s+DELAY/i },
    { name: "sql_benchmark", pattern: /BENCHMARK\s*\(\s*\d+/i },

    // ========== PATH TRAVERSAL ==========
    { name: "path_traversal", pattern: /\.\.\/(\.\.\/)*[a-z]+/i },
    // NEW: URL encoded and Windows variants
    { name: "path_traversal_encoded", pattern: /%2e%2e[%2f\/\\]/i },
    { name: "path_traversal_windows", pattern: /\.\.[\\\/]/i },
    { name: "path_traversal_null", pattern: /\.\.[%0]+/i },

    // ========== BASE64/ENCODED ATTACKS ==========
    { name: "base64_payload", pattern: /[A-Za-z0-9+\/]{100,}={0,2}/i },
    { name: "base64_shell", pattern: /base64\s+(-d|--decode).*\|\s*(sh|bash|zsh)/i },
    // NEW: Other encoding bypass
    { name: "xxd_decode", pattern: /xxd\s+-r.*\|\s*(sh|bash)/i },
    { name: "gzip_shell", pattern: /gzip\s+-d.*\|\s*(sh|bash)/i },

    // ========== CRYPTO MINING ==========
    { name: "crypto_mining", pattern: /\b(xmrig|cpuminer|minerd|ethminer|claymore|cgminer|bfgminer)\b/i },
    { name: "mining_pool", pattern: /\b(minexmr|nanopool|2miners|f2pool|antpool|poolin|supportxmr|stratum)\b/i },

    // ========== ENVIRONMENT EXFILTRATION ==========
    { name: "env_exfil", pattern: /(printenv|env\s*\||\$\{?[A-Z_]*SECRET|\$\{?[A-Z_]*KEY|\$\{?[A-Z_]*TOKEN)/i },

    // ========== CRON/SCHEDULED TASKS ==========
    { name: "cron_manipulation", pattern: /(crontab|\/etc\/cron|schtasks|at\s+\d)/i },

    // ========== CURL/WGET PIPING ==========
    { name: "curl_shell", pattern: /(curl|wget).*\|\s*(sh|bash|zsh|python|perl|ruby)/i },
    // NEW: Windows variants
    { name: "powershell_download", pattern: /powershell.*(IEX|Invoke-Expression|downloadString|WebClient)/i },
    { name: "certutil_download", pattern: /certutil.*-urlcache/i },

    // ========== REVERSE SHELLS ==========
    { name: "netcat_shell", pattern: /\bnc\b.*(-e|-c|exec)/i },
    { name: "script_shell", pattern: /(python|ruby|perl|php).*(-c|exec|system).*socket/i },
    // NEW: Additional reverse shell patterns
    { name: "bash_revshell", pattern: /bash\s+-i\s*>&\s*\/dev\/tcp/i },
    { name: "devtcp_redirect", pattern: /\/dev\/tcp\/\d+\.\d+\.\d+\.\d+\/\d+/i },
    { name: "socat_shell", pattern: /\bsocat\b.*exec/i },
    { name: "telnet_shell", pattern: /\btelnet\b.*\d+\.\d+\.\d+\.\d+.*\d+/i },

    // ========== CONTAINER ESCAPE ==========
    { name: "docker_privileged", pattern: /docker\s+run.*--privileged/i },
    { name: "docker_mount_root", pattern: /docker\s+run.*-v\s+(\/|\/host)/i },
    { name: "nsenter_escape", pattern: /\bnsenter\b.*--target\s+1/i },
    { name: "kubectl_exec", pattern: /kubectl\s+exec.*(-it?|--)/i },
    { name: "chroot_escape", pattern: /\bchroot\b.*\/(host|mnt)/i },
    { name: "capsh_abuse", pattern: /\bcapsh\b.*(--uid=0|--gid=0)/i },

    // ========== FILE MANIPULATION ==========
    { name: "log_clear", pattern: />\s*\/var\/log|cat\s+\/dev\/null\s*>\s*\/var\/log/i },
    { name: "symlink_attack", pattern: /ln\s+-s?f?\s+\/etc\/(passwd|shadow)/i },
    { name: "sed_passwd", pattern: /sed.*\/etc\/passwd/i },
    { name: "trojan_replace", pattern: /cp\s+.*\/bin\/(bash|sh)|mv\s+.*\/bin\/(bash|sh)/i },

    // ========== REMAINING GAPS (100% Coverage) ==========

    // Ruby TCPSocket reverse shell  
    { name: "ruby_socket", pattern: /ruby.*TCPSocket\.open/i },

    // PowerShell TCPClient (hidden execution)
    { name: "powershell_tcpclient", pattern: /powershell.*System\.Net\.Sockets\.TCPClient/i },

    // wget download + chmod + execute chain
    { name: "wget_execute", pattern: /wget.*&&\s*(chmod|\.\/)/i },

    // Prompt injection: admin privilege claim
    { name: "prompt_admin_claim", pattern: /(admin|root)\s+(privileges?|권한).*execute/i },

    // Prompt injection: pretend without restrictions
    { name: "prompt_no_restrict", pattern: /pretend.*without\s+(restrictions?|limits?)/i },

    // SQL DELETE with always-true WHERE
    { name: "sql_delete_where", pattern: /DELETE\s+FROM.*WHERE.*'1'\s*=\s*'1/i },

    // Path traversal: semicolon bypass (..;/)
    { name: "path_semicolon", pattern: /\.\.;[\/\\]/i },

    // Eval with base64 decode
    { name: "eval_base64", pattern: /eval\s*\$?\(?.*base64/i },

    // ========== EXTENDED COVERAGE (v2.0) ==========

    // ===== XSS ATTACKS =====
    { name: "xss_script", pattern: /<script[^>]*>|<\/script>/i },
    { name: "xss_onerror", pattern: /on(error|load|click|mouse|focus|blur)\s*=/i },
    { name: "xss_javascript", pattern: /javascript\s*:/i },
    { name: "xss_svg_iframe", pattern: /<(svg|iframe|embed|object|frame)/i },
    { name: "xss_data_uri", pattern: /data\s*:\s*text\/html/i },

    // ===== SSRF ATTACKS =====
    { name: "ssrf_metadata", pattern: /169\.254\.169\.254|metadata\.(google|aws|azure)/i },
    { name: "ssrf_localhost", pattern: /(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1):\d+/i },
    { name: "ssrf_internal", pattern: /http:\/\/(10\.\d+|172\.(1[6-9]|2[0-9]|3[01])|192\.168)\.\d+/i },
    { name: "ssrf_file", pattern: /file:\/\/\//i },
    { name: "ssrf_gopher", pattern: /gopher:\/\/|dict:\/\//i },
    { name: "ssrf_redis", pattern: /localhost:6379|127\.0\.0\.1:6379/i },

    // ===== LDAP INJECTION =====
    { name: "ldap_wildcard", pattern: /\*\)\s*\(\s*(uid|cn|objectClass)\s*=/i },
    { name: "ldap_bypass", pattern: /\)\s*\(\|\s*\(/i },
    { name: "ldap_password", pattern: /\)\s*\(&\s*\(password=/i },
    { name: "ldap_null", pattern: /\)\s*%00/i },

    // ===== XML/XXE ATTACKS =====
    { name: "xxe_doctype", pattern: /<!DOCTYPE[^>]*\[/i },
    { name: "xxe_entity", pattern: /<!ENTITY[^>]*(SYSTEM|PUBLIC)/i },
    { name: "xxe_file_read", pattern: /SYSTEM\s*["']file:\/\//i },
    { name: "xxe_expect", pattern: /expect:\/\/|php:\/\/filter/i },

    // ===== NoSQL INJECTION =====
    { name: "nosql_operator", pattern: /\{\s*"\$([gln]te?|eq|ne|in|nin|or|and|not|regex|where)"/i },
    { name: "nosql_where", pattern: /\$where\s*:\s*["']/i },
    { name: "nosql_exists", pattern: /\{\s*"\$exists"\s*:/i },
    { name: "nosql_regex", pattern: /\{\s*"\$regex"\s*:/i },

    // ===== DESERIALIZATION ATTACKS =====
    { name: "java_serialized", pattern: /rO0AB|aced0005|ysoserial/i },
    { name: "php_serialize", pattern: /O:\d+:"|a:\d+:\{/i },
    { name: "python_pickle", pattern: /pickle\.loads|__reduce__|cPickle/i },
    { name: "yaml_unsafe", pattern: /!!python\/(object|apply)|yaml\.load\s*\([^)]*Loader/i },

    // ===== JWT ATTACKS =====
    { name: "jwt_none_alg", pattern: /["']alg["']\s*:\s*["']none["']/i },
    { name: "jwt_kid_path", pattern: /["']kid["']\s*:\s*["']\.{2}[\/\\]/i },
    { name: "jwt_jku", pattern: /["']jku["']\s*:/i },

    // ===== API ABUSE =====
    { name: "api_forward", pattern: /X-Forwarded-(For|Host)\s*:\s*(127\.0\.0\.1|localhost)/i },
    { name: "api_rewrite", pattern: /X-(Original|Rewrite)-URL\s*:/i },
    { name: "api_host_inject", pattern: /Host\s*:\s*(evil|attacker|malicious)/i },

    // ===== ADDITIONAL GAPS =====

    // Kill commands
    { name: "kill_process", pattern: /\b(kill|killall)\s+(-9\s+)?(-1|\d+)/i },

    // Cat sensitive files
    { name: "cat_sensitive", pattern: /cat\s+[\/~]*(etc\/(passwd|shadow|hosts)|\.ssh|\.aws)/i },

    // Whoami/id reconnaissance
    { name: "recon_basic", pattern: /;\s*(id|whoami|uname|hostname)\s*(;|$)/i },

    // LS reconnaissance
    { name: "recon_ls", pattern: /\|\s*ls\s+(-la?\s+)?\/(root|home|etc)/i },

    // Lua socket shell
    { name: "lua_socket", pattern: /lua.*socket\.tcp|require\s*\(\s*['"]socket['"]\s*\)/i },

    // AWK shell
    { name: "awk_shell", pattern: /awk.*\/inet\/tcp/i },

    // MKNOD shell
    { name: "mknod_shell", pattern: /mknod.*\/bin\/sh/i },

    // ZIP exfil
    { name: "zip_exfil", pattern: /zip\s+-r.*&&.*curl/i },

    // Rsync exfil
    { name: "rsync_exfil", pattern: /rsync.*@.*:/i },

    // GPG key theft
    { name: "gpg_export", pattern: /gpg\s+--export-(secret-)?keys/i },

    // PKexec escalation
    { name: "pkexec_abuse", pattern: /pkexec\s+\/bin\/(bash|sh)/i },

    // Usermod escalation
    { name: "usermod_sudo", pattern: /usermod\s+.*-[aG]+\s*sudo/i },

    // Prompt injection: forget/role change
    { name: "prompt_forget", pattern: /forget\s+(everything|all|your)/i },
    { name: "prompt_role", pattern: /(role|act|behave)\s*:\s*(evil|hacker|malicious)/i },
    { name: "prompt_bypass", pattern: /bypass\s+(all\s+)?(restrictions?|safety|policy)/i },
    { name: "prompt_developer", pattern: /developer\s+(backdoor|mode)/i },

    // Curl to file execute
    { name: "curl_to_file", pattern: /curl\s+-o\s+\/tmp.*&&\s*(chmod|\.\/)/, },

    // Docker capabilities abuse
    { name: "docker_cap", pattern: /docker\s+run.*(--cap-add|--security-opt\s+apparmor=unconfined)/i },

    // Crictl container escape
    { name: "crictl_exec", pattern: /crictl\s+exec/i },

    // Fetch BSD command
    { name: "fetch_download", pattern: /fetch\s+-o.*http/i },

    // Bitsadmin download
    { name: "bitsadmin_dl", pattern: /bitsadmin.*\/transfer/i },

    // Insmod rootkit
    { name: "insmod_rootkit", pattern: /insmod.*\.ko/i },

    // NPM malicious package
    { name: "npm_crypto", pattern: /npm\s+install\s+(coinhive|cryptoloot)/i },

    // ========== FINAL GAPS (100% Coverage Target) ==========

    // killall command variants
    { name: "killall_cmd", pattern: /\bkillall\s+(-\d+\s+)?\w+/i },

    // dbus privilege escalation
    { name: "dbus_escalation", pattern: /dbus-send.*org\.freedesktop\.(Accounts|systemd)/i },

    // passwd file manipulation
    { name: "passwd_append", pattern: /echo.*>>\s*\/etc\/passwd/i },

    // Wget with execution
    { name: "wget_cron", pattern: /wget.*-O\s*\/etc\/cron/i },

    // Python crypto miner
    { name: "python_miner", pattern: /python.*cryptominer|--pool=.*:\d{4}/i },

    // Prompt injection: new task/content policy
    { name: "prompt_new_task", pattern: /new\s+task\s*:\s*(exfiltrate|hack|delete|destroy)/i },
    { name: "prompt_content_policy", pattern: /ignore\s+content\s+policy/i },
    { name: "prompt_ethical", pattern: /(no|without)\s+ethical\s+guidelines/i },

    // SQL ORDER BY / TRUNCATE
    { name: "sql_order_by", pattern: /ORDER\s+BY\s+\d{2,}/i },
    { name: "sql_truncate", pattern: /TRUNCATE\s+TABLE/i },
    { name: "sql_grant", pattern: /GRANT\s+(ALL|SELECT|INSERT|UPDATE|DELETE)/i },

    // File overwrite attacks
    { name: "file_overwrite", pattern: />\s*\/(etc|boot|bin|sbin)\//i },
    { name: "dd_overwrite", pattern: /dd\s+.*of=\/(boot|dev\/[hs]d)/i },

    // Encoded hex execution
    { name: "printf_shell", pattern: /printf\s+['"]\\x[0-9a-f].*\|\s*(sh|bash)/i },
    { name: "perl_pack", pattern: /perl\s+-e.*pack\s*\(/i },
    { name: "openssl_decode", pattern: /openssl\s+enc\s+-d.*\|\s*(bash|sh)/i },

    // Docker cp and exec chain
    { name: "docker_cp_exec", pattern: /docker\s+cp.*&&.*docker\s+exec/i },
    { name: "kubectl_create", pattern: /kubectl\s+create\s+(deployment|pod|job)/i },

    // LDAP userPassword bypass
    { name: "ldap_userpassword", pattern: /\(\s*userPassword\s*=/i },

    // JSON injection (deserialization)
    { name: "json_type_inject", pattern: /"@type"\s*:\s*"com\.(sun|oracle|alibaba)/i },

    // NoSQL return statement
    { name: "nosql_return", pattern: /return\s+this\.(password|secret|key)/i },

    // JWT base64 none algorithm
    { name: "jwt_base64_none", pattern: /eyJhbGciOiJub25l/i },
    { name: "jwt_hs256_rsa", pattern: /(alg.*HS256.*public|signed\s+with\s+public\s+RSA)/i },

    // API header injection
    { name: "api_host_internal", pattern: /X-Forwarded-Host\s*:\s*internal/i },
    { name: "api_bearer_null", pattern: /Authorization\s*:\s*Bearer\s+(null|undefined|\{\}|\[\])/i },
    { name: "api_content_mismatch", pattern: /Content-Type\s*:\s*application\/xml.*expecting\s+JSON/i },

    // ========== FINAL 6 GAPS (100% Target) ==========

    // Prompt injection: Human: role injection
    { name: "prompt_human_inject", pattern: /\\n\\nHuman\s*:|Human:\s+Actually/i },

    // Prompt injection: maintenance mode
    { name: "prompt_maintenance", pattern: /maintenance\s+mode.*Execute/i },

    // SQL: AND SELECT subquery
    { name: "sql_and_select", pattern: /AND\s*\(\s*SELECT/i },

    // SQL: EXISTS subquery
    { name: "sql_exists_select", pattern: /EXISTS\s*\(\s*SELECT/i },

    // XSS: JS string escape
    { name: "xss_string_escape", pattern: /['"]-\s*alert\s*\(/i },

    // Path traversal: double URL encoding
    { name: "path_double_encode", pattern: /%25(2e|2f|5c)/i },

    // ========== v3.0 NEW CATEGORIES ==========

    // ===== TEMPLATE INJECTION =====
    { name: "ssti_jinja", pattern: /\{\{\s*[^}]*\s*\}\}/i },
    { name: "ssti_erb", pattern: /<%=?\s*[^%]*\s*%>/i },
    { name: "ssti_thymeleaf", pattern: /\$\{[^}]+\}/i },
    { name: "ssti_freemarker", pattern: /#\{[^}]+\}/i },
    { name: "ssti_spring", pattern: /\*\{T\s*\(/i },
    { name: "ssti_python_class", pattern: /__class__|__mro__|__subclasses__|__globals__|__builtins__/i },

    // ===== GRAPHQL ATTACKS =====
    { name: "graphql_introspection", pattern: /__schema|__type|queryType|introspectionQuery/i },
    { name: "graphql_mutation", pattern: /mutation\s*\{?\s*(delete|drop|remove|update)/i },
    { name: "graphql_query_users", pattern: /\{\s*(users?|accounts?)\s*\{[^}]*(password|secret|token)/i },

    // ===== WEBSOCKET ATTACKS =====
    { name: "websocket_hijack", pattern: /ws:\/\/(evil|attacker|malicious)/i },
    { name: "websocket_proto", pattern: /__proto__|prototype\s*\[/i },
    { name: "websocket_eval", pattern: /"action"\s*:\s*"eval"/i },

    // ===== LOG INJECTION =====
    { name: "log_crlf", pattern: /%0[da]|\\r\\n|\\n.*\[CRITICAL\]|\\n.*ERROR/i },
    { name: "log_jndi", pattern: /\$\{jndi:/i },
    { name: "log4shell", pattern: /\$\{jndi:(ldap|rmi|dns):\/\//i },

    // ===== HTTP SMUGGLING =====
    { name: "http_smuggle_te", pattern: /Transfer-Encoding\s*:\s*(chunked|x)/i },
    { name: "http_smuggle_cl", pattern: /Content-Length\s*:\s*0\s*\\r\\n\s*Transfer-Encoding/i },

    // ===== DNS REBINDING =====
    { name: "dns_rebind", pattern: /(localhost|127\.0\.0\.1)\.(evil|xip\.io|nip\.io|burpcollaborator)/i },
    { name: "dns_rebind_num", pattern: /\d+\.(evil|attacker)\.(com|net|io)/i },

    // ===== PROTOTYPE POLLUTION =====
    { name: "proto_pollution", pattern: /__proto__|constructor\s*\[\s*["']prototype["']\]/i },
    { name: "proto_object", pattern: /Object\.prototype\.\w+\s*=/i },
    { name: "proto_bracket", pattern: /\[\s*["']__proto__["']\s*\]/i },

    // ===== RACE CONDITION =====
    { name: "race_concurrent", pattern: /\b(concurrent|simultaneous|parallel)\s+(requests?|threads?)/i },
    { name: "race_redeem", pattern: /redeem.*x\s*\d{2,}|transfer.*x\s*\d{2,}/i },

    // ===== MEMORY CORRUPTION =====
    { name: "format_string", pattern: /%n|%s%s%s%s|%x%x%x%x|%08x/i },
    { name: "buffer_overflow", pattern: /perl\s+-e\s*['"]print\s+["']A["']\s*x\s*\d{3,}/i },
    { name: "shellcode_hex", pattern: /\\x[0-9a-f]{2}\\x[0-9a-f]{2}\\x[0-9a-f]{2}/i },

    // ===== CLOUD ATTACKS =====
    { name: "aws_cli", pattern: /aws\s+(s3|iam|sts|ec2|lambda)\s+(ls|create|get|list|delete)/i },
    { name: "gcloud_cli", pattern: /gcloud\s+(compute|storage|iam)\s+(instances|buckets)/i },
    { name: "az_cli", pattern: /az\s+(vm|storage|ad)\s+(list|create|delete)/i },
    { name: "kubectl_secrets", pattern: /kubectl\s+(get|describe)\s+secrets/i },
    { name: "gsutil_cmd", pattern: /gsutil\s+(cp|ls|cat)\s+gs:\/\//i },

    // ===== ADDITIONAL GAPS =====

    // Shred command
    { name: "shred_disk", pattern: /\bshred\s+-[vfz]+\s+\/dev\//i },

    // sysrq-trigger
    { name: "sysrq_trigger", pattern: /\/proc\/sysrq-trigger/i },

    // mkfifo shell
    { name: "mkfifo_shell", pattern: /mkfifo\s+\/tmp\/\w+.*\/bin\/sh/i },

    // lwp-download
    { name: "lwp_download", pattern: /lwp-download\s+http/i },

    // ld.so.preload
    { name: "ld_preload", pattern: /\/etc\/ld\.so\.preload/i },

    // SUID finder
    { name: "suid_finder", pattern: /find\s+\/.*-perm\s+-4000/i },
    { name: "getcap_scan", pattern: /getcap\s+-r\s*\//i },

    // XSS additional
    { name: "xss_template_literal", pattern: /\$\{alert\(/i },
    { name: "xss_angular", pattern: /\{\{constructor\.constructor/i },
    { name: "xss_marquee", pattern: /<marquee\s+on\w+=/i },
    { name: "xss_details", pattern: /<details\s+open\s+ontoggle/i },
    { name: "xss_math", pattern: /<math.*xlink:href\s*=\s*javascript:/i },

    // JWT additional
    { name: "jwt_kid_inject", pattern: /"kid"\s*:\s*"[^"]*\|/i },
    { name: "jwt_admin_true", pattern: /"admin"\s*:\s*true/i },

    // Deserialization additional
    { name: "java_read_object", pattern: /ObjectInputStream\.readObject/i },
    { name: "php_unserialize", pattern: /unserialize\s*\(\s*\$_(GET|POST|REQUEST|COOKIE)/i },

    // XML additional
    { name: "xxe_external_dtd", pattern: /<!DOCTYPE.*SYSTEM\s*["']http/i },

    // Container additional
    { name: "docker_sock", pattern: /\/var\/run\/docker\.sock/i },
    { name: "proc_cgroup", pattern: /\/proc\/\d+\/cgroup.*docker/i },

    // ========== v4.0 FINAL GAPS ==========

    // ===== COMMAND INJECTION - Disk Wipe Tools =====
    { name: "wipefs_cmd", pattern: /\bwipefs\s+(-a|--all)/i },
    { name: "blkdiscard_cmd", pattern: /\bblkdiscard\s+\/dev\//i },
    { name: "hdparm_erase", pattern: /\bhdparm\s+--security-erase/i },
    { name: "nvme_format", pattern: /\bnvme\s+format\s+\/dev\//i },
    { name: "dev_urandom", pattern: /\/dev\/(urandom|random)\s*>\s*\/dev\/(sd|hd|nvme)/i },

    // ===== REVERSE SHELL - Additional Types =====
    { name: "zsh_ztcp", pattern: /zsh.*ztcp|zmodload\s+zsh\/net/i },
    { name: "openssl_shell", pattern: /openssl\s+s_client.*\|\s*(\/bin\/)?sh/i },
    { name: "ncat_shell", pattern: /\bncat\s+.*-e\s+\/bin/i },

    // ===== PRIVILEGE ESCALATION - Additional =====
    { name: "polkit_helper", pattern: /polkit-agent-helper/i },
    { name: "cve_pwnkit", pattern: /CVE-\d{4}-\d{4}|pwnkit/i },
    { name: "ld_preload_sudo", pattern: /LD_PRELOAD=.*sudo/i },
    { name: "path_hijack", pattern: /PATH=\/tmp.*sudo/i },

    // ===== CONTAINER ESCAPE - Additional =====
    { name: "ctr_privileged", pattern: /\bctr\s+run\s+--privileged/i },
    { name: "runc_privileged", pattern: /\brunc\s+exec\s+--privileged/i },

    // ===== CRYPTO MINING - Additional =====
    { name: "bfgminer", pattern: /\bbfgminer\s+--scrypt/i },
    { name: "trex_miner", pattern: /\bt-rex\s+-a\s+(ethash|kawpow)/i },

    // ===== SSRF - Numeric IP Bypass =====
    { name: "ssrf_decimal_ip", pattern: /http:\/\/\d{9,10}\//i },
    { name: "ssrf_octal_ip", pattern: /http:\/\/0\d{2,12}\//i },
    { name: "ssrf_ipv6_local", pattern: /http:\/\/\[?fd[0-9a-f]{2}:/i },
    { name: "ssrf_alibaba", pattern: /http:\/\/100\.100\.100\.200/i },

    // ===== ENCODED ATTACKS - Additional =====
    { name: "zcat_shell", pattern: /\bzcat\s+.*\|\s*(sh|bash)/i },
    { name: "bzip_shell", pattern: /\bbzip2\s+-d.*\|\s*(sh|bash)/i },

    // ===== JWT - Additional =====
    { name: "jwt_x5u", pattern: /"x5u"\s*:\s*"http/i },
    { name: "jwt_rs_hs_confusion", pattern: /RS256.*HS256|HS256.*RS256/i },

    // ===== API ABUSE - Header Variants =====
    { name: "api_ip_header", pattern: /X-(Custom-IP|Real-IP|Client-IP|Forwarded-For)\s*:\s*127\./i },
    { name: "api_true_client", pattern: /True-Client-IP\s*:\s*127\./i },
    { name: "api_method_override", pattern: /X-HTTP-Method-Override\s*:\s*(DELETE|PUT|PATCH)/i },

    // ===== GRAPHQL - Additional =====
    { name: "graphql_sqli", pattern: /\{user\(id\s*:\s*".*OR\s+1\s*=\s*1/i },
    { name: "graphql_fragment", pattern: /\bfragment\s+on\s+\w+\s*\{.*password/i },
    { name: "graphql_system", pattern: /query\s*\{?\s*system(Health|Info|Status)/i },

    // ===== NOSQL - Additional =====
    { name: "nosql_or_bypass", pattern: /\$or\s*:\s*\[\s*\{\s*\}/i },
    { name: "nosql_all_nin", pattern: /"\$(all|nin)"\s*:\s*\[\s*\]/i },

    // ===== LDAP - Additional =====
    { name: "ldap_not_password", pattern: /admin\)\s*\(\s*!\s*\(/i },

    // ===== DESERIALIZATION - Additional =====
    { name: "ruby_marshal", pattern: /Marshal\.load\s*\(/i },

    // ===== WEBSOCKET - Additional =====
    { name: "websocket_wss", pattern: /wss?:\/\/(evil|attacker|malicious)/i },

    // ===== DNS REBINDING - Additional Domains =====
    { name: "dns_rebind_network", pattern: /\.(rebind\.network|localtest\.me|lvh\.me)/i },
    { name: "dns_time_rebind", pattern: /\.\d+time\./i },

    // ===== RACE CONDITION - Additional =====
    { name: "race_double_spend", pattern: /double.?spend|parallel\s+transactions/i },

    // ===== MEMORY CORRUPTION - Additional =====
    { name: "python_overflow", pattern: /python\s+-c\s*['"]print\s*\(\s*["']A["']\s*\*\s*\d{3,}/i },

    // ===== BUSINESS LOGIC =====
    { name: "biz_negative", pattern: /(quantity|amount|price|discount)\s*=\s*-?\d*\.?\d*$/i },
    { name: "biz_bypass_flag", pattern: /(skip|bypass)_(verification|payment|auth|check)\s*=\s*(true|1)/i },
    { name: "biz_admin_flag", pattern: /(is_admin|admin|role)\s*=\s*(1|true|admin|administrator)/i },

    // ===== CACHE POISONING =====
    { name: "cache_vary", pattern: /Vary\s*:\s*X-(Poison|Cache|Inject)/i },
    { name: "cache_key", pattern: /X-Cache-Key\s*:\s*\//i },

    // ===== CSRF =====
    { name: "csrf_img_form", pattern: /<(img|form|iframe)\s+[^>]*(src|action)\s*=\s*["']https?:\/\/[^"']*\/(transfer|delete|admin)/i },
    { name: "csrf_fetch", pattern: /fetch\s*\(\s*['"]https?:\/\/.*credentials\s*:\s*['"]include/i },

    // ===== OPEN REDIRECT =====
    { name: "redirect_param", pattern: /(redirect|next|url|continue|return_to|goto)\s*=\s*(https?:\/\/|\/\/|\\\\)[^\/]/i },
    { name: "redirect_js", pattern: /(redirect|url)\s*=\s*javascript:/i },
    { name: "redirect_data", pattern: /(redirect|url)\s*=\s*data:/i },

    // ===== IDOR =====
    { name: "idor_pattern", pattern: /(\/api\/|user_id=|doc_id=|order).*->\s*\//i },
    { name: "idor_id_enum", pattern: /\/api\/(users?|orders?|docs?|accounts?)\/\d+\s*->\s*.*\/\d+/i },

    // ===== SUBDOMAIN TAKEOVER =====
    { name: "subdomain_s3", pattern: /CNAME.*S3\s*bucket|NoSuchBucket/i },
    { name: "subdomain_github", pattern: /There\s+isn't\s+a\s+GitHub\s+Pages/i },
    { name: "subdomain_heroku", pattern: /Heroku\s*\|\s*No\s+such\s+app/i },
    { name: "subdomain_cloudfront", pattern: /CloudFront.*request\s+could\s+not/i },

    // ===== FILE MANIPULATION - Additional =====
    { name: "fallocate_fill", pattern: /\bfallocate\s+-l\s+\d+[KMGT]/i },
    { name: "history_clear", pattern: /\bhistory\s+-c/i },

    // ===== XSS - Additional =====
    { name: "xss_video_audio", pattern: /<(video|audio)\s+src=.*onerror/i },
    { name: "xss_object", pattern: /<object\s+data\s*=\s*["']javascript:/i },
    { name: "xss_meter", pattern: /<meter\s+onmouseover/i },

    // ===== PROMPT INJECTION - Additional =====
    { name: "prompt_disclose", pattern: /disclose.*initial\s+instructions/i },
    { name: "prompt_told", pattern: /what\s+were\s+you\s+told\s+before/i },

    // ===== SQL - Additional =====
    { name: "sql_sp_configure", pattern: /sp_configure.*xp_cmdshell/i },
    { name: "sql_sleep_select", pattern: /SELECT.*SLEEP\s*\(\d+\)/i },

    // ===== MALWARE - Additional =====
    { name: "tftp_download", pattern: /\btftp\s+-g\s+-r.*&&/i },
    { name: "busybox_wget", pattern: /\bbusybox\s+wget\s+http/i },

    // ========== v5.0 NEW CATEGORIES ==========

    // ===== CORS ATTACKS =====
    { name: "cors_origin", pattern: /Origin\s*:\s*https?:\/\/(evil|attacker|malicious)/i },
    { name: "cors_wildcard", pattern: /Access-Control-Allow-Origin\s*:\s*\*/i },
    { name: "cors_credentials", pattern: /Access-Control-Allow-Credentials\s*:\s*true.*wildcard/i },
    { name: "cors_null", pattern: /Origin\s*:\s*null\s+exploit/i },

    // ===== OAUTH ATTACKS =====
    { name: "oauth_redirect", pattern: /redirect_uri\s*=\s*https?:\/\/(evil|attacker|malicious)/i },
    { name: "oauth_state", pattern: /state\s+parameter\s+bypass/i },
    { name: "oauth_leak", pattern: /(Authorization\s+code|Token)\s+(leak|in\s+URL)/i },
    { name: "oauth_pkce", pattern: /PKCE.*bypass|code_verifier\s+bypass/i },

    // ===== WAF BYPASS =====
    { name: "waf_case", pattern: /sElEcT|SeLeCt|uNiOn/i },
    { name: "waf_comment", pattern: /sel\/\*\*\/ect|uni\/\*\*\/on/i },
    { name: "waf_concat", pattern: /concat\s*\(\s*['"]?s['"]?\s*,\s*['"]?e['"]?\s*,\s*['"]?l/i },
    { name: "waf_hex", pattern: /0x736[0-9a-f]+|0x7365/i },
    { name: "waf_newline", pattern: /uni%0[ab]on|sel%0[ab]ect/i },
    { name: "waf_null", pattern: /%00['"]?\s*(or|and)/i },

    // ===== TIMING ATTACKS =====
    { name: "timing_sleep", pattern: /username=.*AND\s+SLEEP\s*\(/i },
    { name: "timing_benchmark", pattern: /BENCHMARK\s*\(\d+\s*,/i },
    { name: "timing_password", pattern: /Compare.*password.*char\s+by\s+char/i },
    { name: "timing_enum", pattern: /Timing-based.*enumeration/i },

    // ===== CLICKJACKING =====
    { name: "clickjack_iframe", pattern: /<iframe[^>]+opacity\s*:\s*0/i },
    { name: "clickjack_xframe", pattern: /X-Frame-Options\s+missing/i },
    { name: "clickjack_div", pattern: /<div[^>]+position\s*:\s*absolute[^>]+opacity\s*:\s*0/i },
    { name: "clickjack_ancestors", pattern: /frame-ancestors\s*['"]?none['"]?\s+missing/i },

    // ===== COMMAND INJECTION - LVM/Crypto =====
    { name: "dmsetup_cmd", pattern: /\bdmsetup\s+(remove|wipe)/i },
    { name: "vgremove_cmd", pattern: /\bvgremove\s+-f/i },
    { name: "lvremove_cmd", pattern: /\blvremove\s+-f/i },
    { name: "cryptsetup_erase", pattern: /\bcryptsetup\s+luks(Erase|Remove)/i },
    { name: "sgdisk_zap", pattern: /\bsgdisk\s+--zap/i },

    // ===== PRIVILEGE ESCALATION - GTFOBins =====
    { name: "gtfobins_find", pattern: /\bfind\s+.*-exec\s+\/bin\/sh/i },
    { name: "gtfobins_python", pattern: /python.*pty\.spawn.*\/bin\/sh/i },
    { name: "gtfobins_perl", pattern: /\bperl\s+-e\s*['"]exec.*\/bin\/sh/i },
    { name: "gtfobins_vi", pattern: /\bvi\s+-c\s*['"]:\!\/bin\/sh/i },
    { name: "gtfobins_less", pattern: /\bless\s+.*!\/?bin\/sh/i },
    { name: "gtfobins_awk", pattern: /\bawk\s+'BEGIN\s*\{\s*system/i },
    { name: "gtfobins_nmap", pattern: /\bnmap\s+--interactive.*!sh/i },

    // ===== REVERSE SHELL - Additional =====
    { name: "telnet_shell", pattern: /\btelnet\s+\S+\s+\d+\s*\|\s*\/bin\/sh/i },
    { name: "node_shell", pattern: /\bnode\s+-e.*child_process.*spawn.*\/bin\/sh/i },
    { name: "groovy_shell", pattern: /\bgroovy\s+-e.*ProcessBuilder/i },

    // ===== PROMPT INJECTION - Additional =====
    { name: "prompt_inst", pattern: /\[INST\]\s*New\s+system\s+message/i },
    { name: "prompt_sys", pattern: /<<SYS>>\s*Override/i },
    { name: "prompt_instruction", pattern: /###\s*Instruction\s*:.*ignore/i },
    { name: "prompt_context", pattern: /"role"\s*:\s*"system"\s*,\s*"content"\s*:\s*".*evil/i },

    // ===== SQL - Additional =====
    { name: "sql_shutdown", pattern: /';?\s*SHUTDOWN\s*;/i },
    { name: "sql_having", pattern: /'\s*HAVING\s+1\s*=\s*1/i },
    { name: "sql_group_having", pattern: /GROUP\s+BY\s+\w+\s+HAVING\s+1\s*=\s*1/i },

    // ===== FILE MANIPULATION - Additional =====
    { name: "shred_logs", pattern: /\bshred\s+-zu.*\.log/i },
    { name: "find_rm_log", pattern: /\bfind\s+\/var\/log.*-exec\s+rm/i },

    // ===== ENCODED - Additional =====
    { name: "xz_shell", pattern: /\bxz\s+-d.*\|\s*(sh|bash)/i },
    { name: "lzma_shell", pattern: /\blzma\s+-d.*\|\s*(sh|bash)/i },

    // ===== CONTAINER - Additional =====
    { name: "podman_privileged", pattern: /\bpodman\s+run\s+--privileged/i },
    { name: "buildah_unshare", pattern: /\bbuildah\s+unshare/i },

    // ===== SSRF - Additional =====
    { name: "ssrf_azure", pattern: /metadata\.azure\.internal/i },
    { name: "ssrf_ecs", pattern: /169\.254\.170\.2\/v1\/credentials/i },

    // ===== XML - Additional =====
    { name: "xxe_netdoc", pattern: /SYSTEM\s*["']netdoc:/i },

    // ===== NOSQL - Additional =====
    { name: "nosql_expr", pattern: /"\$expr"\s*:\s*\{/i },
    { name: "nosql_aggregate", pattern: /\.aggregate\s*\(\s*\[\s*\{\s*\$match/i },

    // ===== JWT - Additional =====
    { name: "jwt_x5c", pattern: /"x5c"\s*:\s*\[/i },

    // ===== WEBSOCKET - Additional =====
    { name: "websocket_exec", pattern: /"type"\s*:\s*"exec"/i },

    // ===== LOG INJECTION - Additional =====
    { name: "log_ldaps", pattern: /\$\{jndi:(ldaps|iiop):/i },

    // ===== HTTP SMUGGLING - Additional =====
    { name: "http_te_tab", pattern: /Transfer-Encoding:\s*\tchunked/i },
    { name: "http_cl_te", pattern: /Content-Length:\s*\d+.*Transfer-Encoding:\s*chunked/i },

    // ===== DNS REBINDING - Additional =====
    { name: "dns_lvh", pattern: /\blvh\.me\b/i },
    { name: "dns_vcap", pattern: /\bvcap\.me\b/i },

    // ===== MEMORY CORRUPTION - Additional =====
    { name: "nop_sled", pattern: /\\x90\\x90\\x90/i },
    { name: "heap_spray", pattern: /heap\s+spray.*0x0c0c0c0c/i },

    // ===== CLOUD - Additional =====
    { name: "aws_s3_cp", pattern: /aws\s+s3\s+cp\s+s3:/i },
    { name: "terraform_state", pattern: /terraform\s+state\s+pull/i },

    // ===== BUSINESS LOGIC - Additional =====
    { name: "biz_verified", pattern: /(verified|approved|status)\s*=\s*(true|1|shipped)/i },
    { name: "biz_balance", pattern: /balance\s*=\s*\d{5,}/i },

    // ===== CACHE POISONING - Additional =====
    { name: "cache_scheme", pattern: /X-Forwarded-Scheme\s*:/i },

    // ===== CSRF - Additional =====
    { name: "csrf_submit", pattern: /<script>.*\.submit\s*\(\s*\)/i },

    // ===== OPEN REDIRECT - Additional =====
    { name: "redirect_goto", pattern: /(goto|dest)\s*=\s*(https?:\/\/|\/\/)/i },

    // ===== IDOR - Additional =====
    { name: "idor_account", pattern: /account_number\s*=.*->/i },
    { name: "idor_file", pattern: /file\s*=\s*private.*->/i },

    // ===== SUBDOMAIN - Additional =====
    { name: "subdomain_fastly", pattern: /Fastly\s+error.*unknown\s+domain/i },
    { name: "subdomain_bitbucket", pattern: /Repository\s+not\s+found.*Bitbucket/i },

    // ===== MALWARE FTP/SMB =====
    { name: "ftp_download", pattern: /\bftp\s+-n.*get\s+malware/i },
    { name: "smb_download", pattern: /\bsmbclient.*get\s+malware/i },

    // ===== CRYPTO MINING - Additional =====
    { name: "lolminer", pattern: /\blolminer\s+--algo/i },
    { name: "nbminer", pattern: /\bnbminer\s+-a/i },

    // ===== XSS - Additional =====
    { name: "xss_embed", pattern: /<embed\s+src\s*=\s*["']javascript:/i },
    { name: "xss_formaction", pattern: /<(form|button)[^>]+formaction\s*=\s*javascript:/i },
    { name: "xss_base", pattern: /<base\s+href\s*=\s*["']javascript:/i },
    { name: "xss_link_import", pattern: /<link\s+rel\s*=\s*import/i },

    // ===== DATA EXFIL - Additional =====
    { name: "etcd_exfil", pattern: /\betcdctl\s+get\s+--prefix/i },
    { name: "vault_exfil", pattern: /\bvault\s+kv\s+get/i },
    { name: "consul_exfil", pattern: /\bconsul\s+kv\s+export/i },

    // ===== DESERIALIZATION - Additional =====
    { name: "xmlrpc_deser", pattern: /xmlrpc\.client\.loads/i },
    { name: "kryo_deser", pattern: /Kryo\.readClassAndObject/i },

    // ===== PATH TRAVERSAL - Additional =====
    { name: "path_c1_1c", pattern: /\.\.%c1%1c/i },
    { name: "path_c1_9c", pattern: /\.\.%c1%9c/i },

    // ===== RACE CONDITION - Additional =====
    { name: "race_toctou", pattern: /TOCTOU\s+(file\s+)?race/i },

    // ===== GRAPHQL - Additional =====
    { name: "graphql_create_admin", pattern: /mutation\s*\{?\s*create(Admin|User).*SUPERUSER/i },
    { name: "graphql_all_users", pattern: /allUsers.*first\s*:\s*\d{3,}/i },

    // ========== v6.0 FINAL GAPS ==========

    // ===== UNICODE ATTACKS =====
    { name: "unicode_null", pattern: /\\u0000|%00|\\x00/i },
    { name: "unicode_fullwidth", pattern: /\\u[Ff][Ff][0-9A-Fa-f]{2}/i },
    { name: "unicode_rtlo", pattern: /\\u202[EeDd]|%E2%80%AE/i },
    { name: "unicode_nel", pattern: /\\u0085|%C2%85/i },
    { name: "unicode_linesep", pattern: /\\u2028|\\u2029/i },

    // ===== FILE UPLOAD ATTACKS =====
    { name: "file_upload_php", pattern: /filename\s*=\s*["'][^"']*\.(php|phtml|php[3-7]|phar)["']/i },
    { name: "file_upload_jsp", pattern: /filename\s*=\s*["'][^"']*\.(jsp|jspx|jsw|jsv)["']/i },
    { name: "file_upload_asp", pattern: /filename\s*=\s*["'][^"']*\.(asp|aspx|ashx|asmx)["']/i },
    { name: "file_upload_null", pattern: /filename\s*=\s*["'][^"']*%00/i },
    { name: "file_upload_htaccess", pattern: /\.htaccess.*AddType/i },
    { name: "file_upload_double", pattern: /filename\s*=\s*["'][^"']*\.\w+\.(jpg|png|gif)["']/i },
    { name: "file_upload_traversal", pattern: /filename\s*=\s*["'][^"']*\.\.\/\.\.\//i },

    // ===== HEADER INJECTION =====
    { name: "header_crlf", pattern: /%0[dD]%0[aA]|\\r\\n|%0d%0a/i },
    { name: "header_set_cookie", pattern: /Set-Cookie\s*:.*\\r\\n/i },
    { name: "header_location", pattern: /Location\s*:.*\\r\\n.*http/i },
    { name: "header_xss_protection", pattern: /X-XSS-Protection\s*:\s*0/i },

    // ===== COMMAND INJECTION - Filesystem =====
    { name: "mdadm_cmd", pattern: /\bmdadm\s+--zero-superblock/i },
    { name: "zpool_destroy", pattern: /\bzpool\s+destroy/i },
    { name: "btrfs_delete", pattern: /\bbtrfs\s+(filesystem\s+)?delete/i },
    { name: "xfs_repair", pattern: /\bxfs_repair\s+-L/i },
    { name: "e2fsck_force", pattern: /\be2fsck\s+-f/i },
    { name: "tune2fs_modify", pattern: /\btune2fs\s+-O/i },

    // ===== REVERSE SHELL - Additional =====
    { name: "gawk_shell", pattern: /\bgawk\s+'BEGIN\s*\{.*\/inet\/tcp/i },
    { name: "ksh_devtcp", pattern: /\bksh\s+-c.*\/dev\/tcp/i },

    // ===== PRIVILEGE ESCALATION - Additional GTFOBins =====
    { name: "gtfobins_docker_exec", pattern: /\bdocker\s+exec.*--privileged.*\/bin\/sh/i },
    { name: "gtfobins_mount", pattern: /\bmount\s+-o\s+bind.*\/bin\/sh.*\/usr\/bin/i },
    { name: "gtfobins_ed", pattern: /\bed\s+'!\/bin\/sh'/i },
    { name: "gtfobins_more", pattern: /\bmore\s+'!\/bin\/sh'/i },

    // ===== MALWARE - Additional =====
    { name: "aria2_download", pattern: /\baria2c\s+http.*-o\s+\/tmp/i },
    { name: "axel_download", pattern: /\baxel\s+http.*-o\s+\/tmp/i },

    // ===== CRYPTO MINING - Additional =====
    { name: "gminer", pattern: /\bgminer\s+-a/i },
    { name: "phoenixminer", pattern: /\bphoenixminer\s+-pool/i },

    // ===== PROMPT INJECTION - Additional =====
    { name: "prompt_leetspeak", pattern: /leetspeak.*bypass.*filter/i },
    { name: "prompt_hypothetically", pattern: /Hypothetically.*no\s+restrictions/i },

    // ===== SQL - Additional =====
    { name: "sql_datadir", pattern: /SELECT\s+@@datadir/i },
    { name: "sql_create_user", pattern: /CREATE\s+USER.*IDENTIFIED\s+BY/i },
    { name: "sql_mysql_files", pattern: /LOAD_FILE.*mysql-files/i },

    // ===== XSS - Additional =====
    { name: "xss_animate", pattern: /<animate\s+onbegin/i },
    { name: "xss_set", pattern: /<set\s+onbegin/i },
    { name: "xss_isindex", pattern: /<isindex\s+onfocus/i },

    // ===== PATH TRAVERSAL - Additional =====
    { name: "path_c0_9v", pattern: /\.\.%c0%9v/i },
    { name: "path_bg_qf", pattern: /\.\.%bg%qf/i },
    { name: "path_backslash_encoded", pattern: /%2e%2e%5c/i },

    // ===== FILE MANIPULATION - Additional =====
    { name: "at_schedule", pattern: /\bat\s+now.*-f\s+\/tmp/i },
    { name: "systemctl_enable", pattern: /\bsystemctl\s+enable\s+\/tmp/i },

    // ===== ENCODED - Additional =====
    { name: "lz4_shell", pattern: /\blz4\s+-d.*\|\s*(sh|bash)/i },
    { name: "zstd_shell", pattern: /\bzstd\s+-d.*\|\s*(sh|bash)/i },

    // ===== CONTAINER - Additional =====
    { name: "containerd_cve", pattern: /containerd-shim.*CVE|CVE.*containerd/i },

    // ===== SSRF - Additional =====
    { name: "ssrf_rancher", pattern: /rancher-metadata/i },
    { name: "ssrf_k8s_svc", pattern: /kubernetes\.default\.svc/i },

    // ===== LDAP - Additional =====
    { name: "ldap_nested", pattern: /\)\s*\(\s*&\s*\(\s*uid=/i },

    // ===== XML - Additional =====
    { name: "xxe_php_input", pattern: /SYSTEM\s*["']php:\/\/input/i },

    // ===== DESERIALIZATION - Additional =====
    { name: "snappy_deser", pattern: /Snappy\.uncompress.*deserialize/i },

    // ===== NOSQL - Additional =====
    { name: "nosql_text", pattern: /"\$text"\s*:\s*\{/i },
    { name: "nosql_mapreduce", pattern: /\.mapReduce\s*\(/i },

    // ===== JWT - Additional =====
    { name: "jwt_jwk", pattern: /"jwk"\s*:\s*\{[^}]*"kty"/i },

    // ===== API ABUSE - Additional =====
    { name: "api_cluster_ip", pattern: /X-Cluster-Client-IP\s*:\s*127\./i },
    { name: "api_forwarded", pattern: /Forwarded\s*:\s*for\s*=\s*127\./i },
    { name: "api_originating_ip", pattern: /X-Originating-IP\s*:\s*127\./i },
    { name: "api_remote_ip", pattern: /X-Remote-(IP|Addr)\s*:\s*127\./i },

    // ===== TEMPLATE - Additional =====
    { name: "ssti_razor", pattern: /@\(\d+\s*\+\s*\d+\)/i },
    { name: "ssti_lipsum", pattern: /\{\{lipsum\.__globals__/i },

    // ===== GRAPHQL - Additional =====
    { name: "graphql_typename", pattern: /\{__typename\}/i },

    // ===== WEBSOCKET - Additional =====
    { name: "websocket_shell", pattern: /"event"\s*:\s*"shell"/i },

    // ===== LOG INJECTION - Additional =====
    { name: "log_ctx", pattern: /\$\{ctx:[^}]+\}/i },

    // ===== HTTP SMUGGLING - Additional =====
    { name: "http_te_identity", pattern: /Transfer-Encoding\s*:\s*chunked\s*,\s*identity/i },

    // ===== DNS REBINDING - Additional =====
    { name: "dns_app_localhost", pattern: /\.\w+\.app\.localhost\b/i },
    { name: "dns_nip_169", pattern: /169\.254\.169\.254\.nip\.io/i },

    // ===== PROTOTYPE POLLUTION - Additional =====
    { name: "proto_object_assign", pattern: /Object\.assign.*__proto__/i },

    // ===== RACE CONDITION - Additional =====
    { name: "race_concurrent", pattern: /Concurrent.*limit\s+bypass/i },

    // ===== MEMORY CORRUPTION - Additional =====
    { name: "stack_smash", pattern: /stack\s+smash(ing|ed)/i },

    // ===== CLOUD - Additional =====
    { name: "aws_ssm", pattern: /aws\s+ssm\s+get-parameters/i },
    { name: "gcloud_token", pattern: /gcloud\s+auth\s+print-access-token/i },

    // ===== BUSINESS LOGIC - Additional =====
    { name: "biz_coupon", pattern: /(coupon|promo)\s*=\s*(100OFF|FREE)/i },

    // ===== CACHE POISONING - Additional =====
    { name: "cache_port", pattern: /X-Forwarded-Port\s*:/i },

    // ===== CSRF - Additional =====
    { name: "csrf_image", pattern: /new\s+Image\s*\(\s*\)\.src\s*=.*http/i },

    // ===== OPEN REDIRECT - Additional =====
    { name: "redirect_target", pattern: /target\s*=\s*https?:\/\//i },

    // ===== IDOR - Additional =====
    { name: "idor_invoice", pattern: /invoice_id\s*=.*->/i },

    // ===== SUBDOMAIN - Additional =====
    { name: "subdomain_azure", pattern: /Azure\s+Web\s+App.*Site\s+not\s+found/i },

    // ===== DATA EXFIL - Additional =====
    { name: "influx_backup", pattern: /\binfluxd\s+backup/i },
    { name: "cassandra_select", pattern: /cassandra-cli.*SELECT/i },

    // ========== ROUND 4 - FIX 20 GAPS ==========

    // ===== PRIVILEGE ESCALATION - sudo -l =====
    { name: "sudo_list", pattern: /\bsudo\s+-l\b/i },

    // ===== PROMPT INJECTION - grandmother bomb =====
    { name: "prompt_grandmother", pattern: /grandmother.*bomb|bomb.*grandmother/i },
    { name: "prompt_deceased", pattern: /deceased.*worked\s+at/i },

    // ===== SQL - AND SLEEP, LOAD_FILE =====
    { name: "sql_and_sleep", pattern: /'\s*AND\s+SLEEP\s*\(/i },
    { name: "sql_loadfile", pattern: /LOAD_FILE\s*\(\s*['"]/i },

    // ===== XSS - var alert =====
    { name: "xss_var_alert", pattern: /var\s+\w+\s*=\s*alert/i },

    // ===== PATH TRAVERSAL - c0ae =====
    { name: "path_c0ae", pattern: /%c0%ae%c0%ae/i },

    // ===== FILE MANIPULATION - chattr, truncate =====
    { name: "chattr_immutable", pattern: /\bchattr\s+-i\s+\/etc/i },
    { name: "truncate_log", pattern: /\btruncate\s+-s\s+0.*log/i },

    // ===== ENCODED - ruby unpack =====
    { name: "ruby_unpack", pattern: /\.unpack\s*\(\s*["']m["']\s*\)/i },

    // ===== JWT - admin token =====
    { name: "jwt_admin_payload", pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]*YWRtaW4/i },

    // ===== API ABUSE - X-Custom-IP =====
    { name: "api_custom_ip", pattern: /X-Custom-IP-Authorization\s*:\s*127\./i },

    // ===== HTTP SMUGGLING - TE with tab =====
    { name: "http_te_colon_tab", pattern: /Transfer-Encoding\s*:\s*\t/i },

    // ===== DNS REBINDING =====
    { name: "dns_burpcollaborator", pattern: /burpcollaborator\.net/i },
    { name: "dns_localtest", pattern: /\blocaltest\.me\b/i },
    { name: "dns_customer_localhost", pattern: /customer\d*\.app\.localhost/i },

    // ===== CLOUD - aws ec2, az keyvault =====
    { name: "aws_ec2_describe", pattern: /aws\s+ec2\s+describe/i },
    { name: "az_keyvault", pattern: /az\s+keyvault\s+secret/i },

    // ===== CACHE POISONING - Method Override =====
    { name: "cache_method_override", pattern: /X-HTTP-Method-Override\s*:\s*(POST|PUT|DELETE)/i },

    // ===== IDOR - user_id, doc_id =====
    { name: "idor_user_id", pattern: /user_id\s*=\s*\d+.*->/i },
    { name: "idor_doc_id", pattern: /doc_id\s*=\s*\w+.*->/i },

    // ========== ROUND 4 - FIX NEW CATEGORIES ==========

    // ===== SUPPLY CHAIN ATTACKS =====
    { name: "npm_install_evil", pattern: /npm\s+install\s+(evil|malicious|backdoor)/i },
    { name: "pip_install_evil", pattern: /pip\s+install\s+(evil|malicious|backdoor)/i },
    { name: "gem_install_evil", pattern: /gem\s+install\s+(backdoor|compromised)/i },
    { name: "go_get_evil", pattern: /go\s+get\s+github\.com\/evil/i },
    { name: "apt_install_compromised", pattern: /apt\s+install\s+compromised/i },
    { name: "docker_pull_infected", pattern: /docker\s+pull\s+infected/i },
    { name: "maven_trojan", pattern: /maven.*dependency.*trojan/i },
    { name: "gradle_backdoor", pattern: /gradle.*plugin.*backdoor/i },

    // ===== KERNEL EXPLOITS =====
    { name: "cve_sudo_baron", pattern: /CVE-2021-3156|baron\s+samedit/i },
    { name: "cve_dirty_pipe", pattern: /CVE-2022-0847|dirty\s+pipe/i },
    { name: "cve_dirty_cow", pattern: /CVE-2016-5195|dirty\s+cow/i },
    { name: "cve_netfilter", pattern: /CVE-2021-22555|netfilter.*heap/i },
    { name: "cve_route4", pattern: /CVE-2022-2588|route4.*uaf/i },
    { name: "overlayfs_priv", pattern: /overlayfs.*priv.*esc/i },
    { name: "modprobe_evil", pattern: /\bmodprobe\s+evil/i },

    // ===== WIRELESS ATTACKS =====
    { name: "aircrack", pattern: /\baircrack-ng\b/i },
    { name: "aireplay_deauth", pattern: /\baireplay-ng\s+--deauth/i },
    { name: "wifite", pattern: /\bwifite\s+--kill/i },
    { name: "bettercap_wifi", pattern: /\bbettercap.*wifi\.recon/i },
    { name: "hostapd_wpe", pattern: /\bhostapd-wpe\b/i },
    { name: "karma_attack", pattern: /karma\s+attack/i },

    // ===== COMMAND INJECTION - Additional Filesystem =====
    { name: "fsck_force", pattern: /\bfsck\s+-y\s+\/dev/i },
    { name: "resize2fs_cmd", pattern: /\bresize2fs\s+\/dev/i },
    { name: "mount_remount", pattern: /\bmount\s+-o\s+remount/i },
    { name: "umount_force", pattern: /\bumount\s+-f\s+\//i },
    { name: "losetup_cmd", pattern: /\blosetup\s+-d\s+\/dev/i },
    { name: "kpartx_cmd", pattern: /\bkpartx\s+-d\s+\/dev/i },

    // ===== REVERSE SHELL - csh/tcsh =====
    { name: "csh_shell", pattern: /\bcsh\s+-c.*telnet/i },
    { name: "tcsh_shell", pattern: /\btcsh\s+-c.*telnet/i },

    // ===== DATA EXFIL - Additional =====
    { name: "couchbase_export", pattern: /couchbase-cli.*bucket-export/i },
    { name: "neo4j_dump", pattern: /neo4j-admin\s+dump/i },

    // ===== MALWARE - Additional =====
    { name: "rclone_copy", pattern: /\brclone\s+copy\s+evil/i },
    { name: "git_clone_evil", pattern: /\bgit\s+clone.*evil.*exploit/i },

    // ===== CRYPTO MINING - Additional =====
    { name: "teamredminer", pattern: /\bteamredminer\s+--algo/i },
    { name: "srbminer", pattern: /\bsrbminer-multi\s+--algorithm/i },

    // ===== PROMPT INJECTION - Additional =====
    { name: "prompt_gpt5", pattern: /GPT-5.*without\s+limits/i },
    { name: "prompt_evil_gpt", pattern: /EVIL-?GPT/i },

    // ===== SQL - Additional =====
    { name: "sql_extractvalue", pattern: /extractvalue\s*\(.*concat/i },
    { name: "sql_declare_exec", pattern: /DECLARE\s+@\w+.*EXEC\s*\(/i },

    // ===== XSS - Additional =====
    { name: "xss_confirm", pattern: /['"];?\s*confirm\s*\(\s*\d+\s*\)/i },
    { name: "xss_prompt", pattern: /['"];?\s*prompt\s*\(\s*\d+\s*\)/i },
    { name: "xss_pointerenter", pattern: /onpointerenter\s*=\s*alert/i },

    // ===== PATH TRAVERSAL - Additional =====
    { name: "path_triple_dots", pattern: /\.\.\.\.\/\/\.\.\.\.\/\//i },
    { name: "path_backslash_encoded2", pattern: /\.\.%5c\.\.%5c/i },

    // ===== FILE MANIPULATION - Additional =====
    { name: "crontab_remove", pattern: /\bcrontab\s+-r\b/i },
    { name: "logrotate_force", pattern: /\blogrotate\s+-f/i },

    // ===== ENCODED - Additional =====
    { name: "tar_to_command", pattern: /\btar\s+.*--to-command\s*=\s*sh/i },

    // ===== CONTAINER - Additional =====
    { name: "crio_cve", pattern: /cri-o.*escape.*CVE|CVE.*cri-o/i },

    // ===== SSRF - Additional =====
    { name: "ssrf_consul", pattern: /consul:\d+\/v1/i },
    { name: "ssrf_vault", pattern: /vault:\d+\/v1/i },

    // ===== LDAP - Additional =====
    { name: "ldap_uid_password", pattern: /\(&\s*\(\s*uid=/i },

    // ===== XML - Additional =====
    { name: "xxe_phar", pattern: /SYSTEM\s*["']phar:\/\//i },

    // ===== DESERIALIZATION - Additional =====
    { name: "fst_deserialize", pattern: /FST\.ObjectInput/i },
    { name: "hessian_deserialize", pattern: /Hessian\.deserialize/i },

    // ===== NOSQL - Additional =====
    { name: "nosql_oid", pattern: /"\$oid"\s*:/i },

    // ===== API ABUSE - Additional =====
    { name: "api_cf_connecting", pattern: /CF-Connecting-IP\s*:\s*127\./i },

    // ===== PRIVILEGE ESCALATION - Additional =====
    { name: "env_binsh", pattern: /\benv\s+\/bin\/sh\b/i },
    { name: "systemctl_user_sh", pattern: /\bsystemctl\s+--user\s+\/bin\/sh/i },

    // ========== FINAL 2 GAPS ==========

    // ===== JWT - eyJ base64 header with admin payload =====
    { name: "jwt_eyj_admin", pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJhZG1pbiI6dHJ1ZX0/i },

    // ===== HTTP SMUGGLING - TE with backslash-t =====
    { name: "http_te_escaped_tab", pattern: /Transfer-Encoding:\\t/i },
];









export class RegexFilter {
    private patterns: Array<{ name: string; pattern: RegExp }>;

    constructor(customPatterns?: Array<{ name: string; pattern: RegExp }>) {
        this.patterns = customPatterns ?? MALICIOUS_PATTERNS;
    }

    /**
     * Check input against all patterns
     */
    check(text: string): StageResult {
        const matched: string[] = [];

        for (const { name, pattern } of this.patterns) {
            if (pattern.test(text)) {
                matched.push(name);
            }
        }

        return {
            blocked: matched.length > 0,
            matched,
        };
    }

    /**
     * Add a custom pattern at runtime
     */
    addPattern(name: string, pattern: RegExp): void {
        this.patterns.push({ name, pattern });
    }

    /**
     * Get all pattern names
     */
    getPatternNames(): string[] {
        return this.patterns.map((p) => p.name);
    }
}
