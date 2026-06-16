# 🎨 语音绘图工具 (Voice Drawing Tool)

> 纯语音控制的 Web 绘图工具。不碰鼠标/键盘，仅通过自然语言完成绘图创作。
>
> 「像与人对话一样画画 —— 你说，它画。」

## 快速体验

```bash
# 1. 安装依赖
npm install
pip install -r api/requirements.txt

# 2. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填入:
#   DEEPSEEK_API_KEY=sk-xxx
#   IFLYTEK_APP_ID=xxx
#   IFLYTEK_API_KEY=xxx
#   IFLYTEK_API_SECRET=xxx

# 3. 启动后端 (两个终端)
python api/iflytek_auth.py &   # 讯飞鉴权服务, 端口 8000
python api/nlu.py &            # LangChain NLU 服务, 端口 8001

# 4. 启动前端
npm run dev                     # 默认 http://localhost:5173
```

打开浏览器，**按空格键**开始说话，说完再按空格结束。试试：

> 画一个红色的圆
> 把它改成蓝色
> 撤销
> 导出为 PNG

## 架构

```
语音输入 → 讯飞 IAT WebSocket → 规则引擎(匹配?→直接返回) → LangChain LLM → Command Parser → Fabric.js Canvas
```

| 模块 | 职责 | 输入 → 输出 |
|------|------|-------------|
| **voice** | 麦克风采集、讯飞流式 ASR 转写 | 语音 → `{ transcript, confidence }` |
| **nlu** | 规则引擎优先(<5ms) + LLM 兜底 | 文本 → `NLUResult` |
| **parser** | 坐标解析、颜色映射、默认值填充 | `NLUResult` → `DrawCommand` |
| **engine** | Fabric.js 渲染、对象 CRUD、Undo/Redo | `DrawCommand` → Canvas 更新 |
| **state** | 全局 DrawingState（Zustand） | 各模块读写 |
| **ui** | React 界面：语音按钮、Canvas、状态回显 | — |

```
voice ──→ nlu ──→ parser ──→ engine ──→ ui
                                 │        │
                                 └── state ──┘
```

## 技术栈

| 层 | 技术 |
|----|------|
| 前端框架 | React 18 + TypeScript |
| 画布渲染 | Fabric.js 6.x |
| ASR | 讯飞流式语音转写 (WebSocket IAT) |
| NLU | LangChain + DeepSeek |
| 状态管理 | Zustand |
| 构建 | Vite |
| 部署 | Vercel |

## 语音指令

### 绘图

| 指令示例 | 效果 |
|---------|------|
| 画一个红色的圆 | 创建红色圆形 |
| 画一个蓝色矩形 | 创建蓝色矩形 |
| 画一个绿色三角形 | 创建绿色三角形 |
| 画一条直线 | 创建直线 |
| 画一个箭头 | 创建箭头 |

### 修改

| 指令示例 | 效果 |
|---------|------|
| 把它改成蓝色 | 将最近创建的对象改为蓝色 |
| 把填充色改成红色 | 修改填充颜色 |
| 把颜色变成绿色 | 修改颜色 |

### 导航与文件

| 指令示例 | 效果 |
|---------|------|
| 撤销 | 回退一步 |
| 撤销 3 步 | 回退三步 |
| 放大 / 缩小 | 缩放画布 |
| 向左移动 200 像素 | 平移画布 |
| 导出为 PNG / 导出为 SVG | 下载文件 |
| 清空画布 | 清除所有内容 |

### 支持的颜色

红、橙、黄、绿、蓝、紫、粉、黑、白、灰、青、棕（及其 "色" 后缀形式）

### 支持的形状

圆/圆形、矩形/长方形/正方形、三角形、直线/线、箭头

## 容错机制

| 环节 | 策略 |
|------|------|
| ASR | 纯标点帧过滤，领域词汇优先 |
| NLU | 规则引擎 100% 覆盖高频指令 → LLM 兜底 → 重试 1 次 → 友好提示 |
| 引擎 | 每次操作前保存快照，说"撤销"即可回退 |
| UI | ErrorBoundary 防止白屏，管道每步可视化 |

## 性能目标 (MVP)

| 环节 | 目标 |
|------|------|
| 音频采集 + 标点过滤 | <200ms |
| ASR 转写 | <800ms |
| NLU（规则命中） | <5ms |
| NLU（LLM 兜底） | <1500ms |
| Canvas 渲染 | <200ms |
| **端到端 P50** | **<3s** |

## 项目结构

```
voice-drawing-tool/
├── src/
│   ├── voice/          # 模块1: 语音采集 + 讯飞 ASR
│   │   ├── iflytek.ts  #   讯飞 WebSocket 流式转写
│   │   ├── speech.ts   #   浏览器 Speech API (备用)
│   │   └── vad.ts      #   语音活动检测
│   ├── nlu/            # 模块2: 规则引擎 + LLM NLU
│   │   ├── rules.ts    #   规则引擎 (高频指令 <5ms 匹配)
│   │   ├── llm.ts      #   LangChain LLM 调用
│   │   └── types.ts    #   NLUResult / IntentType 类型
│   ├── parser/         # 模块3: Command Parser
│   │   ├── coords.ts   #   坐标解析
│   │   ├── colors.ts   #   颜色 Hex 映射
│   │   └── defaults.ts #   默认参数填充
│   ├── engine/         # 模块4: Drawing Engine
│   │   ├── shapes.ts   #   图形创建 (Fabric.js)
│   │   ├── modify.ts   #   对象修改/删除
│   │   └── history.ts  #   Undo/Redo 历史栈
│   ├── state/          # 模块5: 全局状态 (Zustand)
│   │   └── store.ts
│   └── ui/             # 模块6: React UI
│       └── App.tsx     #   主界面 (含 ErrorBoundary)
├── api/                # Python 后端服务
│   ├── nlu.py          #   FastAPI: LangChain NLU endpoint
│   ├── iflytek_auth.py #   FastAPI: 讯飞 WebSocket 鉴权
│   └── requirements.txt
├── specs/              # 设计文档
│   ├── PRD_01.md       #   产品需求
│   ├── ARCHITECTURE.md #   架构设计
│   ├── SPEC.md         #   技术规范 (颜色/形状/术语参考)
│   └── API.md          #   接口契约
└── CLAUDE.md           # AI 辅助开发指南
```

## 开发指引

模块按依赖顺序开发：`state → voice → nlu → parser → engine → ui`

每个模块可**独立测试**：

| 模块 | 测试方式 |
|------|---------|
| voice | 对麦克风说话，看 console 打印 ASR 转写文本 |
| nlu | 传入文本字符串（不走语音），验证 NLUResult |
| parser | 构造 NLUResult 对象，验证 DrawCommand 坐标和颜色 |
| engine | 构造 DrawCommand 对象，验证 Canvas 图形 |
| ui | `npm run dev` + 空格键语音输入，端到端验证 |

## 提交规范

```text
<type>(<scope>): <简短描述>

type:  feat / fix / refactor / docs / test / chore
scope: voice | nlu | parser | engine | state | ui | api | specs
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥（LLM NLU） |
| `DEEPSEEK_BASE_URL` | DeepSeek API 地址，默认 `https://api.deepseek.com` |
| `IFLYTEK_APP_ID` | 讯飞控制台应用 ID |
| `IFLYTEK_API_KEY` | 讯飞 API Key |
| `IFLYTEK_API_SECRET` | 讯飞 API Secret |

## 浏览器兼容

Chrome/Edge 114+。MVP 需联网（LLM API 调用）。

## License

MIT
