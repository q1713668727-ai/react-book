# 登录 / 注册对接 Express 后端（迭代版）

## 后端摘要（`D:\react-server`）

- HTTP 服务默认端口：**8000**（[`bin/www`](D:\react-server\bin\www) 中 `process.env.PORT || '8000'`）。
- 已启用 **`cors()`**（[`app.js`](D:\react-server\app.js)），Expo 开发机需把 API 基址配成可访问宿主机的地址（如 Android 模拟器 `10.0.2.2:8000`，真机用电脑局域网 IP）。
- 登录路由挂载在 **`/login`**（[`app.js`](D:\react-server\app.js) `app.use('/login', loginRouter)`）。

### 登录

| 项 | 说明 |
|----|------|
| 方法与路径 | `POST /login`（[`routes/login.js`](D:\react-server\routes\login.js) `router.post('/')`） |
| 请求体 JSON | `{ account: string, password: string }` |
| 成功 `200` | `{ status: 200, message: 'Login success.', result: user }`，`user` 已去掉 `password`；头像字段由 `avatar` 转为 **`url`**（相对路径，如 `user-avatar/...`） |
| 失败 | `404` 账号不存在或统一文案；`401` 密码错误；`500` 服务异常 |

> 密码为**明文比较**（`password === user.password`），前端仍应使用 HTTPS/内网，后续建议后端改为哈希。

### 注册

| 项 | 说明 |
|----|------|
| 方法与路径 | `POST /login/reg` |
| 请求体 JSON | `{ name, account, password, email, path }` — `path` 为头像在库中的路径，**无头像可先传空字符串 `''`**（与 `INSERT` 字段一致） |
| 成功 `200` | `{ status: 200, message: 'Register success.' }` |
| 失败 | `409` `ER_DUP_ENTRY` → 账号或邮箱已存在；其它错误 `500` |

可选：`/login/regAvatar`、`/login/regAvatarEnd` 用于分块上传头像；首期可不做，注册仅用 `path: ''`。

### 与「我」页相关的其它接口（后续可接）

- `POST /user/getUserInfo` — body `{ account }`，返回用户资料（无密码，`avatar` → `url`）。
- 首页数据等在 `POST /index` 等（[`routes/index.js`](D:\react-server\routes\index.js)），挂载在根路由 **`/`**（即 `POST http://host:8000/index`）。

---

## 前端（`d:\react-demo`）实现要点

### 1. 配置 API 基址

- 新增例如 [`constants/api.ts`](d:\react-demo\constants\api.ts) 或 `app.config` 暴露 `EXPO_PUBLIC_API_URL`（如 `http://192.168.x.x:8000`），所有 `fetch` 使用 `${API_URL}/login` 与 `${API_URL}/login/reg`。
- 文档中说明：模拟器 / 真机与 `localhost` 的差异。

### 2. HTTP 封装

- 小工具函数 `postJson(path, body)`：`headers: { 'Content-Type': 'application/json' }`，`JSON.parse` 响应，按 `status` 字段（业务 200/401/404/409/500）抛错或返回数据。
- **不要用** HTTP 状态码假设业务成功（后端错误处理里部分仍走 `res.send` JSON，需以 body 的 `status` 为准）。

### 3. 认证状态

- `AuthContext`：`user` 存 **`result` 全量**（至少含 `account`、`name`、`email`、`url` 等），`signIn` 调 `POST /login`，成功则 `AsyncStorage` 持久化（如 `@auth_user` JSON）。
- `signUp` 调 `POST /login/reg`，成功后可自动再调登录或引导用户登录（二选一，推荐 **注册成功后直接 `POST /login` 一次** 以拿到完整 `result`）。
- `signOut` 清除本地存储。

### 4. 页面

- [`app/login.tsx`](d:\react-demo\app\login.tsx)、[`app/register.tsx`](d:\react-demo\app\register.tsx)：`TextInput` 绑定 **account**、password；注册页增加 **name**、**email**；错误展示 `message` 字段。
- 根 Stack 注册两屏；**不**做全 App 强制登录（与先前决策一致）：从 [`app/(tabs)/profile.tsx`](d:\react-demo\app\(tabs)\profile.tsx) 进入登录/注册；已登录显示账号信息与退出。

### 5. 头像 URL

- 列表/头像组件使用：`user.url` 若存在则 `${API_URL}/${user.url}`（注意去掉重复斜杠）。

### 6. 依赖

- `npx expo install @react-native-async-storage/async-storage`（持久化会话）。

---

## 验收

- 真机/模拟器在配置正确 `API_URL` 下可登录、注册；错误码与后端文案一致展示。
- 杀进程重开仍为已登录（AsyncStorage）；退出后清空。
- TypeScript 与 lint 通过。
