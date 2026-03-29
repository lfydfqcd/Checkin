# Checkin Rhythm 启动文档

本文档用于指导你在本地快速启动项目并进行基础验证。

## 1. 环境要求

必需：
- 现代浏览器（推荐 Chrome/Edge 最新版）

可选：
- Python 3（用于本地静态服务器）
- Node.js 18+（用于编码检查脚本）

说明：
- 项目是纯前端静态站点，不依赖后端服务。
- 首次运行不需要 `npm install`。

## 2. 获取项目

```bash
git clone <your-repo-url>
cd checkin-rhythm
```

如果你已在本地目录中，可直接跳过此步骤。

## 3. 启动方式（推荐方式 A）

### 方式 A：Python 本地静态服务器（推荐）

在项目根目录执行：

```bash
python -m http.server 5173
```

然后在浏览器打开：

`http://localhost:5173`

### 方式 B：Node 临时静态服务器（可选）

在项目根目录执行：

```bash
npx --yes serve . -l 5173
```

然后在浏览器打开：

`http://localhost:5173`

### 方式 C：VS Code Live Server（可选）

- 用 VS Code 打开项目
- 右键 `index.html` -> `Open with Live Server`

## 4. 启动后自检

进入页面后，请确认以下内容：
- 顶部可见导航：`首页/日历`、`任务管理`、`统计分析`、`数据管理`
- 可点击“新建任务”，并正常保存
- 新建任务后可在首页进行打卡
- 刷新页面后数据仍保留（验证 `localStorage`）

## 5. 常用维护命令

项目内置编码检查脚本（UTF-8 无 BOM）：

```bash
npm run encoding:check
```

如果发现编码问题，可执行修复：

```bash
npm run encoding:repair
npm run encoding:check
```

更多说明见 [`ENCODING-RUNBOOK.md`](./ENCODING-RUNBOOK.md)。

## 6. 常见问题

### 端口被占用

将命令中的端口改为其他值，例如：

```bash
python -m http.server 5180
```

并访问 `http://localhost:5180`。

### 页面空白或模块加载失败

- 不要直接双击 `index.html` 以 `file://` 方式运行
- 请改用本地静态服务器方式（方式 A / B / C）

### 数据丢失

- 本项目数据保存在浏览器本地 `localStorage`
- 清理浏览器缓存或站点数据会删除本地记录
- 建议在“数据管理”页面定期导出 JSON 备份
