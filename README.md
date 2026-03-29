# Checkin Rhythm

一个面向个人用户的 PC 端任务打卡网站，支持任务创建、日历打卡、统计复盘与本地数据管理。

## 项目简介

`Checkin Rhythm` 聚焦个人自我管理场景，帮助用户把长期目标拆成可持续执行的日常动作，并通过可视化反馈观察执行质量。

典型使用人群：
- 学生：学习计划、背词、刷题、论文进度
- 运动人群：跑步、健身、拉伸、体重管理
- 上班族：阅读、作息、自我提升、习惯养成

## 功能清单

- 任务管理：新建、编辑、归档、删除任务
- 三种打卡模式：
  - `daily`：每日打卡
  - `phase`：阶段打卡（阶段内完成 1 次即视为完成）
  - `goal`：目标完成（手动标记完成）
- 日历视图：按月查看每日完成比例、日记标记、目标达成标记
- 每日详情：按日期查看任务状态，支持当天/补打卡、记录回看
- 统计分析：7/30 日趋势、分类分布、任务完成率排行
- 数据管理：JSON 导出、导入、清空本地数据

## 技术栈

- `HTML + CSS + Vanilla JavaScript (ES Module)`
- `localStorage` 本地持久化（键名：`checkin_app_data_v1`）
- Hash 路由：`#/`、`#/tasks`、`#/stats`、`#/data`
- 纯静态部署，无后端依赖

## 项目结构

```text
.
├─ index.html
├─ src/
│  ├─ main.js
│  ├─ store.js
│  ├─ date-utils.js
│  └─ styles.css
├─ scripts/
│  ├─ check-encoding.mjs
│  └─ repair-encoding.ps1
├─ STARTUP.md
├─ ENCODING-RUNBOOK.md
└─ checkin-prd-v1.0.md
```

## 快速启动

请先阅读 [`STARTUP.md`](./STARTUP.md)。

## 数据说明

- 所有业务数据默认保存在浏览器本地 `localStorage`
- 清理浏览器站点数据会导致本地记录丢失
- 建议定期使用“数据管理”页面导出备份 JSON

## 当前范围与限制

- 单用户、单设备、本地使用
- 不包含登录注册、多端同步、云存储、消息提醒
- 不包含服务端 API 与协作能力
