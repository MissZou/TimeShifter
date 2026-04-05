## Context

TimeShifter 是一个纯前端时区适应计划应用。时间轴由 `buildContinuousTimeline` 构建，区块（`track-pill`）按类型分布在三列（光照 8%、咖啡因 38%、睡眠 68%），通过 `position: absolute` 定位在 `continuous-rail` 中。

当前点击区块后，详情面板（`aside.timeline-detail-popup`）的定位逻辑：
- **纵向**：`positionPanel` 通过 `clickedElement.getBoundingClientRect()` 相对 rail 计算 `top`
- **横向**：CSS 固定 `right: 8px`，面板始终在轨道右边缘内部

问题：面板与被点击区块之间可能存在较大横向距离，用户难以关联。

## Goals / Non-Goals

**Goals:**
- 面板出现在被点击区块的正右侧，视觉上与区块直接关联
- 当右侧空间不足时，自动调整到可见区域（降级到轨道右边缘或区块左侧）
- 保持现有面板的所有功能（内容、关闭、滚动）不变

**Non-Goals:**
- 不改变面板的内容结构或视觉风格
- 不改变区块的列布局或区块本身的样式
- 不引入新的依赖或框架

## Decisions

**决策 1：使用 JS 动态计算 `left` 而非 CSS `transform`**

面板定位改为由 `positionPanel` 同时计算 `top` 和 `left`。`left` 基于被点击元素的 `offsetLeft + offsetWidth + gap`。

理由：区块的 `left` 和 `width` 使用百分比定义（如 `left: 8%; width: 24%`），在不同视口下像素值不同。通过 `getBoundingClientRect()` 可获取实际像素值，保证精确定位。

替代方案：使用 CSS `anchor positioning`——浏览器兼容性不足，排除。

**决策 2：边界检测策略——右溢出时改用右对齐**

当 `left + panelWidth > railWidth` 时，将面板的 `left` 回退为 `railWidth - panelWidth - 8px`，确保面板在轨道内可见。

理由：轨道右侧有标签列，面板不应溢出 rail 边界。向左弹出（区块左侧）会覆盖其他区块，体验更差。

**决策 3：移除 CSS `right` 固定值，完全由 JS 控制横向位置**

从 `.timeline-detail-popup` 中移除 `right: 8px`，改为 JS 设置 `left`。同时将 `width` 从 `min(300px, 45%)` 改为固定 `280px`，避免百分比宽度与动态 `left` 的计算冲突。

## Risks / Trade-offs

- **[面板遮挡相邻区块]** → 面板有 `z-index: 10` 且背景不透明，可接受；用户可通过关闭按钮关闭面板
- **[窄屏下面板空间不足]** → 边界检测回退到右对齐，保证可见性
- **[性能影响]** → 仅在点击事件中执行一次 `getBoundingClientRect()`，性能影响可忽略
