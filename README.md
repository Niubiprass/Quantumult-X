# Quantumult X 脚本库

自用的 Quantumult X 配置与脚本集合，包含分流规则、重写规则、定时任务及相关 JS 脚本。

## 目录结构

```
.
├── QuantumultX.conf          主配置文件（分流 / DNS / 策略 / 重写 / 定时任务）
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

## 注意事项

- 配置文件中的 `[mitm]` 段与 `[server_remote]` 段需要你自己补充，仓库内提供的是占位或已脱敏内容。
- 配置文件中的 `[mitm]` 段与 `[server_remote]` 段需要你自己补充，仓库内提供的是占位或已脱敏内容。
- 本仓库中的规则与脚本部分引用自公开社区（NobyDa、chavyleung、KOP-XIAO、Yuheng0101 等），版权归原作者所有。
- 脚本仅供个人账号自动化使用，请遵守目标平台的服务条款。

## 免责声明

本项目仅供学习与个人使用，使用者需自行承担因使用本配置与脚本产生的一切后果。
