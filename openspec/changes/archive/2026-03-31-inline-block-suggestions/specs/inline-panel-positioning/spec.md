## ADDED Requirements

### Requirement: Panel SHALL appear adjacent to clicked block
When a user clicks a track-pill block, the detail popup panel SHALL be positioned so that its left edge is immediately to the right of the clicked block's right edge, with a horizontal gap of 8px. The panel's vertical top SHALL align with the clicked block's top within the rail.

#### Scenario: Click a light-seek block in the leftmost column
- **WHEN** user clicks a light-seek block (positioned at left: 8%, width: 24%)
- **THEN** the panel's left edge SHALL be at approximately 32% + 8px from the rail's left edge, and the panel's top SHALL match the block's top offset within the rail

#### Scenario: Click a caffeine block in the middle column
- **WHEN** user clicks a caffeine-use block (positioned at left: 38%, width: 24%)
- **THEN** the panel's left edge SHALL be at approximately 62% + 8px from the rail's left edge

#### Scenario: Click a sleep block in the rightmost column
- **WHEN** user clicks a sleep block (positioned at left: 68%, width: 24%)
- **THEN** the panel's left edge SHALL be at approximately 92% + 8px from the rail's left edge, subject to boundary clamping

### Requirement: Panel SHALL remain within rail boundaries
The panel MUST NOT extend beyond the right edge of the continuous-rail container. When the calculated position would cause overflow, the panel SHALL be clamped to fit within the rail.

#### Scenario: Right overflow on rightmost column block
- **WHEN** user clicks a block in the rightmost column and calculated left + panelWidth exceeds rail width
- **THEN** the panel's left SHALL be clamped to railWidth - panelWidth - 8px, ensuring the panel remains fully visible within the rail

#### Scenario: Panel vertical position near rail bottom
- **WHEN** user clicks a block near the bottom of the timeline
- **THEN** the panel's top SHALL be adjusted so that the panel does not extend below the rail's total height

### Requirement: Panel positioning SHALL use dynamic pixel calculation
The panel's horizontal position MUST be computed from the clicked element's actual rendered position using `getBoundingClientRect()` or `offsetLeft`/`offsetWidth`, not from hardcoded CSS percentage values.

#### Scenario: Window resize changes block positions
- **WHEN** the viewport is resized causing block pixel positions to change
- **THEN** the next click on a block SHALL position the panel based on the new rendered position

### Requirement: Day chip click SHALL position panel inline
Clicking a day-chip button SHALL also position the panel adjacent to the clicked day-chip, using the same inline positioning logic as track-pill blocks.

#### Scenario: Click a day chip label
- **WHEN** user clicks a day-chip button
- **THEN** the panel SHALL appear to the right of the day-chip, with the same 8px gap and boundary clamping rules
