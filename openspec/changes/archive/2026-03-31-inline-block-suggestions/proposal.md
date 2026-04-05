## Why

点击轨道上的区块时，详情建议面板（`timeline-detail-popup`）使用 `position: absolute` 配合 `positionPanel` 基于点击元素在 rail 中的位置计算 `top`，但面板实际通过 `right: 8px` 固定在轨道右侧内部。当用户点击不同天、不同纵向位置的区块时，面板虽然能在纵向跟随，但横向始终紧贴轨道右边缘，而非紧挨所点击区块的右侧。对于左侧列（光照类 `left: 8%`）和中间列（咖啡因类 `left: 38%`）的区块，面板与被点击区块之间存在明显的空间断裂，用户难以直观关联建议与区块。

## What Changes

- 修改 `positionPanel` 函数：除了计算 `top` 之外，增加 `left` 的计算，使面板出现在所点击区块的正右侧（区块右边缘 + 间距）
- 调整 `.timeline-detail-popup` 的 CSS：移除 `right: 8px` 固定定位，改为由 JS 动态设置 `left`
- 增加边界检测：当面板超出轨道右边界时，自动改为在区块左侧显示（或向左偏移以保持可见）
- 确保面板在纵向上不超出轨道底部边界

## Capabilities

### New Capabilities
- `inline-panel-positioning`: 将区块详情面板定位到被点击区块的正右侧，而非固定在轨道右边缘，包含边界检测和自适应方向

### Modified Capabilities

## Impact

- `app.js`：修改 `positionPanel` 函数逻辑（~第455-461行）
- `styles.css`：调整 `.timeline-detail-popup` 样式（~第837-845行），移除 `right` 固定值，可能需要调整 `width`、`max-height` 以适配内联定位
- 不涉及新依赖、API 或外部系统变更
