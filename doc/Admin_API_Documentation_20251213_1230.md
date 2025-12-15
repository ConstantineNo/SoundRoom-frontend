# 后端管理后台 API 文档

**版本**: 1.0  
**日期**: 2025-12-13  
**鉴权**: 所有接口均需要在 Header 中携带 Bearer Token，且用户角色必须为 `admin`。

---

## 1. 仪表盘概览

获取管理后台首页的实时统计数据。

- **URL**: `/admin/dashboard/summary`
- **Method**: `GET`
- **Auth**: Required (Admin)

### 响应示例 (200 OK)
```json
{
  "today_pv": 1250,
  "today_uv": 340,
  "total_users": 89,
  "active_bans": 2
}
```

---

## 2. 访客日志列表

分页获取详细的访客访问记录。

- **URL**: `/admin/logs/visitors`
- **Method**: `GET`
- **Auth**: Required (Admin)

### 请求参数 (Query)

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| page | int | 否 | 1 | 页码 |
| size | int | 否 | 20 | 每页数量 |

### 响应示例 (200 OK)
```json
[
  {
    "id": 1024,
    "ip_address": "203.0.113.45",
    "country": "China",
    "city": "Shanghai",
    "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...",
    "device_type": "pc",
    "os": "Mac OS X",
    "browser": "Chrome",
    "request_path": "/api/v1/scores",
    "request_method": "GET",
    "status_code": 200,
    "created_at": "2025-12-13T10:30:00.123456"
  },
  {
    "id": 1023,
    "ip_address": "198.51.100.2",
    "country": "United States",
    "city": null,
    "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)...",
    "device_type": "mobile",
    "os": "iOS",
    "browser": "Mobile Safari",
    "request_path": "/api/v1/auth/login",
    "request_method": "POST",
    "status_code": 401,
    "created_at": "2025-12-13T10:29:55.654321"
  }
]
```

---

## 3. 每日流量趋势

获取历史每日流量统计数据，用于绘制趋势图。

- **URL**: `/admin/stats/daily`
- **Method**: `GET`
- **Auth**: Required (Admin)

### 请求参数 (Query)

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| start_date | date | 否 | null | 开始日期 (YYYY-MM-DD) |
| end_date | date | 否 | null | 结束日期 (YYYY-MM-DD) |
| limit | int | 否 | 30 | 返回最近多少天的数据 |

### 响应示例 (200 OK)
```json
[
  {
    "id": 5,
    "date": "2025-12-13",
    "pv": 1250,
    "uv": 340,
    "top_urls": {
      "/api/v1/scores": 450,
      "/api/v1/auth/login": 120,
      "/api/v1/recordings": 80
    }
  },
  {
    "id": 4,
    "date": "2025-12-12",
    "pv": 1100,
    "uv": 310,
    "top_urls": {
      "/api/v1/scores": 400
    }
  }
]
```

---

## 4. 获取封禁 IP 列表

查看当前所有被封禁的 IP 记录。

- **URL**: `/admin/security/bans`
- **Method**: `GET`
- **Auth**: Required (Admin)

### 响应示例 (200 OK)
```json
[
  {
    "id": 1,
    "ip_address": "192.0.2.10",
    "reason": "Rate Limit Exceeded",
    "banned_at": "2025-12-13T09:00:00.000000",
    "expires_at": "2025-12-13T10:00:00.000000",
    "is_active": true
  },
  {
    "id": 2,
    "ip_address": "198.51.100.99",
    "reason": "Sensitive Path Scan: .env",
    "banned_at": "2025-12-12T15:30:00.000000",
    "expires_at": null,
    "is_active": true
  }
]
```

---

## 5. 手动封禁 IP

管理员手动添加一个 IP 到封禁列表。

- **URL**: `/admin/security/bans`
- **Method**: `POST`
- **Auth**: Required (Admin)

### 请求参数 (Query)

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| duration_minutes | int | 否 | 封禁时长（分钟）。不填则为永久封禁。 |

### 请求体 (JSON)

```json
{
  "ip_address": "203.0.113.55",
  "reason": "恶意爬虫"
}
```

### 响应示例 (200 OK)
```json
{
  "id": 3,
  "ip_address": "203.0.113.55",
  "reason": "恶意爬虫",
  "banned_at": "2025-12-13T12:00:00.123456",
  "expires_at": null,
  "is_active": true
}
```

---

## 6. 解封 IP

手动移除某个 IP 的封禁状态。

- **URL**: `/admin/security/bans/{ip_address}`
- **Method**: `DELETE`
- **Auth**: Required (Admin)

### 路径参数 (Path)

| 参数名 | 类型 | 说明 |
|---|---|---|
| ip_address | string | 需要解封的 IP 地址 |

### 响应示例 (200 OK)
```json
{
  "message": "IP 203.0.113.55 unbanned successfully"
}
```
