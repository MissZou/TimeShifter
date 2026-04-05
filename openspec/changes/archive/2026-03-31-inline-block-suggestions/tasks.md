## 1. CSS 调整

- [x] 1.1 修改 `.timeline-detail-popup` 样式：移除 `right: 8px`，将 `width` 改为固定 `280px`，确保 `position: absolute` 和 `z-index: 10` 保持不变
- [x] 1.2 移除 `.timeline-detail-popup` 中可能与 JS 动态 `left` 冲突的 `transform` 或 `right` 相关属性

## 2. positionPanel 函数重写

- [x] 2.1 修改 `positionPanel` 函数：通过 `clickedElement` 的 `offsetLeft` + `offsetWidth` 计算面板的 `left` 值，设置为 `offsetLeft + offsetWidth + 8`（8px 间距）
- [x] 2.2 增加水平边界检测：当 `left + panelWidth > railWidth` 时，将 `left` 回退为 `railWidth - panelWidth - 8`
- [x] 2.3 保留现有纵向定位逻辑（`top` 基于 `getBoundingClientRect` 相对 rail 计算），确保纵向不超出 rail 总高度

## 3. 验证与测试

- [x] 3.1 测试点击左侧列（光照区块）后面板出现在区块右侧
- [x] 3.2 测试点击中间列（咖啡因区块）后面板出现在区块右侧
- [x] 3.3 测试点击右侧列（睡眠区块）后面板在右边界内正确显示（触发边界检测）
- [x] 3.4 测试点击 day-chip 后面板出现在 day-chip 右侧
- [x] 3.5 测试窗口缩放后点击区块，面板位置基于新的渲染位置正确计算
