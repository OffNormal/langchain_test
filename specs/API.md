# 语音绘图工具 — 接口文档

> **版本**: v1.0 | **日期**: 2026-06-15

本文档定义所有系统接口契约。颜色/形状等参考数据见 [SPEC.md](SPEC.md)。

---

## 1. 接口流水线

```
ASR API ──→ NLU API ──→ Command API ──→ Canvas API
语音→文本    文本→意图    意图→绘图指令    指令→渲染
```

---

## 2. ASR 接口

### 2.1 浏览器 Speech API (MVP)

```typescript
const recognition = new webkitSpeechRecognition();
recognition.lang = 'zh-CN';
recognition.continuous = false;
recognition.interimResults = true;

recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript;  // string
  const confidence  = event.results[0][0].confidence;  // 0.0-1.0
  // → 传递给 NLU
};
```

### 2.2 讯飞流式 ASR (V1.0+)

```
POST wss://iat-api.xfyun.cn/v2/iat
Headers: X-Appid, X-CurTime, X-Param, X-CheckSum
Body:   audio/stream (16kHz, 16bit, mono PCM)
Response: { "text": "画一个红色的圆", "confidence": 0.95 }
```

---

## 3. NLU 接口

### 3.1 函数签名

```
Input:  asrText: string
Output: NLUResult
```

### 3.2 意图枚举

```typescript
enum IntentType {
  CREATE_SHAPE   = "CREATE_SHAPE",
  MODIFY_OBJECT  = "MODIFY_OBJECT",
  DELETE_OBJECT  = "DELETE_OBJECT",
  NAVIGATE       = "NAVIGATE",
  FILE_OPERATION = "FILE_OPERATION",
  QUERY          = "QUERY",
}
```

### 3.3 NLUResult Schema

```typescript
interface NLUResult {
  intent: IntentType;
  confidence: number;          // 0.0 - 1.0
  slots: {
    // --- CREATE_SHAPE ---
    shape_type?: 'circle' | 'rect' | 'triangle' | 'line' | 'arrow' | 'ellipse' | 'polygon' | 'text';
    radius?: number;
    width?: number;
    height?: number;
    position?: { x: number | 'center' | 'left' | 'right'; y: number | 'center' | 'top' | 'bottom' };
    fill_color?: string;       // hex 或颜色名称（映射表见 SPEC.md §5.1）
    stroke_color?: string;
    stroke_width?: number;

    // --- MODIFY_OBJECT ---
    target_ref?: string;       // "这个" / "那个圆" / object_id
    property?: 'color' | 'size' | 'position' | 'rotation' | 'text';
    value?: string | number;

    // --- NAVIGATE ---
    zoom_level?: number;       // 0.1 - 5.0
    pan_direction?: 'left' | 'right' | 'up' | 'down';
    pan_distance?: number;

    // --- FILE_OPERATION ---
    file_action?: 'save' | 'export' | 'new' | 'open';
    format?: 'png' | 'svg' | 'pdf';
    filename?: string;
  };
}
```

---

## 4. DrawCommand 接口

NLUResult 经 Command Parser 转换为 DrawCommand 后，交由 Drawing Engine 执行。

### 4.1 DrawCommand Schema

```typescript
interface DrawCommand {
  action: 'draw' | 'modify' | 'delete' | 'navigate' | 'file' | 'undo' | 'redo';
  target: string;              // 对象类型 或 object_id
  params: Record<string, any>;
  idempotency_key: string;     // 格式: "cmd_{timestamp}_{random}"
}
```

### 4.2 指令 JSON 示例

```json
// 创建
{ "action": "draw", "target": "circle",  "params": { "r": 100, "fill": "#EF4444", "cx": 400, "cy": 300 } }
{ "action": "draw", "target": "rect",    "params": { "w": 300, "h": 200, "fill": "#3B82F6", "x": 200, "y": 150 } }
{ "action": "draw", "target": "line",    "params": { "x1": 0, "y1": 0, "x2": 200, "y2": 200, "stroke": "#000" } }
{ "action": "draw", "target": "arrow",   "params": { "from": "obj_001", "to": "obj_002" } }
{ "action": "draw", "target": "text",    "params": { "content": "Hello", "fontSize": 16 } }

// 修改
{ "action": "modify", "target": "obj_001", "params": { "property": "fill", "value": "#3B82F6" } }
{ "action": "modify", "target": "obj_001", "params": { "property": "scale", "value": 1.5 } }
{ "action": "modify", "target": "obj_001", "params": { "property": "position", "value": { "dx": 200, "dy": 0 } } }
{ "action": "modify", "target": "obj_001", "params": { "property": "rotation", "value": 45 } }

// 删除
{ "action": "delete", "target": "obj_001", "params": {} }

// 导航
{ "action": "navigate", "target": "canvas", "params": { "zoom": 1.5 } }
{ "action": "navigate", "target": "canvas", "params": { "pan": { "dx": 100, "dy": 0 } } }
{ "action": "navigate", "target": "canvas", "params": { "reset": true } }

// 系统
{ "action": "undo",  "target": "history", "params": { "steps": 1 } }
{ "action": "redo",  "target": "history", "params": { "steps": 1 } }
{ "action": "file",  "target": "export",  "params": { "format": "png" } }
{ "action": "file",  "target": "save",    "params": { "name": "my-drawing" } }
{ "action": "file",  "target": "new",     "params": { "width": 1920, "height": 1080 } }
```

---

## 5. 语音指令契约（含版本标记）

### 5.1 创建类

| 指令模板 | 示例 | 版本 |
|---------|------|------|
| 画 [形状] | 画一个圆 | [MVP] |
| 画 [颜色] 的 [形状] | 画一个红色的圆 | [MVP] |
| 画 [尺寸] 的 [形状] | 画一个半径 100 的圆 | [MVP] |
| 画 [数量] 个 [形状] | 画 3 个矩形 | [V1.0] |
| 在 [位置] 画 [形状] | 在左上角画一个三角形 | [V1.0] |
| 添加文字 [内容] | 添加文字 "Hello" | [V1.0] |
| 连线 [A] 和 [B] | 连线矩形和圆 | [V1.0] |

### 5.2 修改类

| 指令模板 | 示例 | 版本 |
|---------|------|------|
| 把 [对象] 改成 [属性] | 把这个圆改成蓝色 | [MVP] |
| [对象] 变大/小一点 | 这个圆变大一点 | [MVP] |
| 删除 [对象] | 删除这个矩形 | [MVP] |
| [对象] 的 [属性] 设为 [值] | 描边粗细设为 5 | [V1.0] |
| 把 [对象] [变换] | 旋转 45 度 | [V1.0] |
| 复制 [对象] | 复制这个三角形 | [V1.0] |
| 移动 [对象] 到 [位置] | 移动这个圆到中间 | [V1.0] |

### 5.3 导航类

| 指令 | 版本 |
|------|------|
| 放大 / 缩小 | [MVP] |
| 适应窗口 / 重置视图 | [MVP] |
| 平移 (上/下/左/右) | [MVP] |

### 5.4 系统类

| 指令 | 版本 |
|------|------|
| 撤销 / 重做 | [MVP] |
| 保存 / 导出 (PNG/SVG) | [MVP] |
| 新建画布 / 清空 / 帮助 | [MVP] |
| 显示/隐藏网格 | [V1.0] |

---

## 6. Canvas 操作接口 (Fabric.js)

```typescript
// 创建
const obj = new fabric.Circle({ radius: 100, fill: '#EF4444', left: 400, top: 300 });
canvas.add(obj);

// 修改
obj.set('fill', '#3B82F6');
canvas.renderAll();

// 删除
canvas.remove(obj);

// 撤销
const snapshot = JSON.stringify(canvas.toJSON());
undoStack.push(snapshot);
canvas.loadFromJSON(undoStack.pop(), canvas.renderAll.bind(canvas));
```

---

> *参考数据（颜色/形状/术语）见 [SPEC.md](SPEC.md)，架构设计见 [ARCHITECTURE.md](ARCHITECTURE.md)，产品需求见 [PRD_01.md](PRD_01.md)。*
