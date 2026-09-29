# Quantumult X 脚本库

自用的 Quantumult X 配置与脚本集合，包含分流规则、重写规则、定时任务及相关 JS 脚本。

## 目录结构

```
.
├── QuantumultX.conf          主配置文件（分流 / DNS / 策略 / 重写 / 定时任务）
├── Scripts/
│   └── MonkeyCode.js         MonkeyCode 每日签到领积分
└── README.md
```

## 文件说明

### QuantumultX.conf

完整的主配置文件，涵盖以下段落：

| 段落 | 作用 |
|---|---|
| `[general]` | 通用设置，含资源解析器、排除路由、WiFi 切换模式 |
| `[dns]` | DNS 设置，使用 DoH（腾讯 / 阿里） |
| `[policy]` | 策略组，含自动测速、地区分组、Apple / 国内 / 国际分流 |
| `[server_remote]` | 节点订阅 |
| `[filter_remote]` | 远程分流规则 |
| `[rewrite_remote]` | 远程重写规则 |
| `[filter_local]` | 本地分流规则 |
| `[rewrite_local]` | 本地重写规则 |
| `[task_local]` | 定时任务（签到、查询等） |
| `[http_backend]` | HTTP Backend（BoxJS、R·E） |
| `[mitm]` | MitM 证书与解密域名 |

### Scripts/MonkeyCode.js

MonkeyCode 平台（长亭科技在线 AI 开发平台）每日自动签到脚本，支持多账号、自动完成 PoW 人机验证、结果推送通知。

## 使用方式

### 1. 引入配置

在 Quantumult X 中新建配置，或直接引用本仓库的配置文件：

```
https://raw.githubusercontent.com/Niubiprass/Quantumult-X/main/QuantumultX.conf
```

> `[server_remote]` 段落中的节点订阅为占位配置，请替换为你自己的订阅地址。

### 2. MitM 证书

出于安全考虑，本仓库的 `QuantumultX.conf` **已移除原作者的 p12 证书与密码**。重写与脚本功能需要 MitM 证书才能生效，请自行生成：

1. Quantumult X → 设置 → MitM → 生成证书
2. 导出证书为 `.p12` 格式
3. 将证书 Base64 内容与密码填回配置文件的 `[mitm]` 段：

```ini
[mitm]
hostname = ...
passphrase = <你自己的证书密码>
p12 = <你自己的 p12 证书内容>
skip_validating_cert = true
```

若仅使用节点与分流功能，可跳过此步。

### 3. MonkeyCode 签到脚本

脚本支持两种配置方式，任选其一，写入 `[task_local]` 的 `env` 参数。

**方式 A — 邮箱密码（全自动，推荐）**

多个账号用 `&` 连接：

```ini
[task_local]
# 每天早上 9:07 自动签到
7 9 * * * Scripts/MonkeyCode.js, tag=MonkeyCode签到, enabled=true, env=MONKEYCODE_ACCOUNTS=邮箱1,密码1&邮箱2,密码2
```

**方式 B — Cookie（不存密码）**

先手动登录抓取 Cookie，再填入：

```ini
7 9 * * * Scripts/MonkeyCode.js, tag=MonkeyCode签到, enabled=true, env=MONKEYCODE_COOKIES=Cookie字符串1&Cookie字符串2
```

也可以使用远程地址引用脚本：

```ini
7 9 * * * https://raw.githubusercontent.com/Niubiprass/Quantumult-X/main/Scripts/MonkeyCode.js, tag=MonkeyCode签到, enabled=true, env=MONKEYCODE_ACCOUNTS=邮箱,密码
```

脚本功能：

- 自动登录（邮箱 + 密码），无需手动抓 Cookie
- 自动完成 PoW 人机验证（cap.js，纯计算，无需打码）
- 每日签到领取 100 积分
- 幂等处理：当日已签到则不重复请求
- 多账号支持
- 结果推送通知

### 4. 手动运行

脚本兼容 Node.js 18+，可在本地直接调试：

```bash
MONKEYCODE_ACCOUNTS="邮箱,密码" node Scripts/MonkeyCode.js
```

## 注意事项

- **请勿在配置文件中提交真实账号密码。** 账号信息通过 `env` 参数在本地注入，不要写进本仓库的文件里。
- 配置文件中的 `[mitm]` 段与 `[server_remote]` 段需要你自己补充，仓库内提供的是占位或已脱敏内容。
- 本仓库中的规则与脚本部分引用自公开社区（NobyDa、chavyleung、KOP-XIAO、Yuheng0101 等），版权归原作者所有。
- 脚本仅供个人账号自动化使用，请遵守目标平台的服务条款。

## 免责声明

本项目仅供学习与个人使用，使用者需自行承担因使用本配置与脚本产生的一切后果。
