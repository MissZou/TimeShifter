const STORAGE_KEY = "timeshifter-web-plan";
const DEFAULT_WAKE = "07:00";
const DEFAULT_SLEEP = "23:00";

const form = document.getElementById("planner-form");
const originSelect = document.getElementById("origin-timezone");
const destinationSelect = document.getElementById("destination-timezone");
const departureInput = document.getElementById("departure-datetime");
const arrivalInput = document.getElementById("arrival-datetime");
const sleepInput = document.getElementById("sleep-time");
const wakeInput = document.getElementById("wake-time");
const chronotypeInput = document.getElementById("chronotype");
const prepDaysInput = document.getElementById("prep-days");
const melatoninInput = document.getElementById("melatonin-ok");
const summaryContent = document.getElementById("summary-content");
const timeline = document.getElementById("timeline");
const resetButton = document.getElementById("reset-form");
const exportCalendarButton = document.getElementById("export-calendar");
const supabaseUrlInput = document.getElementById("supabase-url");
const supabaseAnonKeyInput = document.getElementById("supabase-anon-key");
const cloudSyncKeyInput = document.getElementById("cloud-sync-key");
const cloudConnectButton = document.getElementById("cloud-connect");
const cloudLoadLatestButton = document.getElementById("cloud-load-latest");
const cloudStatus = document.getElementById("cloud-status");
const dayCardTemplate = document.getElementById("day-card-template");
let lastRenderedPlan = null;
let supabaseClient = null;

const SUPABASE_CONFIG_KEY = "timeshifter-supabase-config";

bootstrap();

function bootstrap() {
  populateTimezones();
  applyDefaults();
  restoreSavedPlan();

  form.addEventListener("submit", handleSubmit);
  resetButton.addEventListener("click", resetForm);
  exportCalendarButton.addEventListener("click", handleExportCalendar);
}

function populateTimezones() {
  const guessedZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const timeZones = typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : fallbackTimezones();

  const originOptions = timeZones.map((zone) => buildTimezoneOption(zone, zone === guessedZone));
  const destinationOptions = timeZones.map((zone) => buildTimezoneOption(zone, zone === guessedZone));

  originSelect.replaceChildren(...originOptions);
  destinationSelect.replaceChildren(...destinationOptions);
  destinationSelect.value = guessedZone;
}

function buildTimezoneOption(zone, selected) {
  const option = document.createElement("option");
  option.value = zone;
  option.textContent = zone.replaceAll("_", " ");
  option.selected = selected;
  return option;
}

function fallbackTimezones() {
  return [
    "UTC",
    "Asia/Shanghai",
    "Asia/Tokyo",
    "Asia/Singapore",
    "Europe/London",
    "Europe/Paris",
    "America/New_York",
    "America/Los_Angeles",
    "America/Chicago",
    "Australia/Sydney",
  ];
}

function applyDefaults() {
  const now = new Date();
  const departure = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  departure.setHours(9, 0, 0, 0);

  const arrival = new Date(departure.getTime() + 14 * 60 * 60 * 1000);
  arrival.setHours(arrival.getHours() + 1);

  departureInput.value = toDatetimeLocal(departure);
  arrivalInput.value = toDatetimeLocal(arrival);
  sleepInput.value = DEFAULT_SLEEP;
  wakeInput.value = DEFAULT_WAKE;
}

function restoreSavedPlan() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const saved = JSON.parse(raw);
    originSelect.value = saved.originTimezone || originSelect.value;
    destinationSelect.value = saved.destinationTimezone || destinationSelect.value;
    departureInput.value = saved.departureDatetime || departureInput.value;
    arrivalInput.value = saved.arrivalDatetime || arrivalInput.value;
    sleepInput.value = saved.sleepTime || sleepInput.value;
    wakeInput.value = saved.wakeTime || wakeInput.value;
    chronotypeInput.value = saved.chronotype || chronotypeInput.value;
    prepDaysInput.value = saved.prepDays || prepDaysInput.value;
    melatoninInput.checked = Boolean(saved.melatoninOk);

    if (saved.lastPlanInput) {
      const plan = buildPlan(saved.lastPlanInput);
      renderPlan(plan);
      lastRenderedPlan = plan;
      setExportEnabled(true);
    }
  } catch (error) {
    console.warn("Failed to restore saved plan", error);
  }
}

function resetForm() {
  localStorage.removeItem(STORAGE_KEY);
  applyDefaults();
  chronotypeInput.value = "balanced";
  prepDaysInput.value = "3";
  melatoninInput.checked = true;
  destinationSelect.value = originSelect.value;
  summaryContent.className = "empty-state";
  summaryContent.textContent =
    "生成计划后，这里会显示跨时区方向、时差规模、预计适应节奏和旅行日重点提醒。";
  timeline.className = "timeline empty-state";
  timeline.textContent = "还没有计划。先填写行程，再生成你的倒时差时间轴。";
  lastRenderedPlan = null;
  setExportEnabled(false);
}

function handleSubmit(event) {
  event.preventDefault();

  const input = {
    originTimezone: originSelect.value,
    destinationTimezone: destinationSelect.value,
    departureDatetime: departureInput.value,
    arrivalDatetime: arrivalInput.value,
    sleepTime: sleepInput.value,
    wakeTime: wakeInput.value,
    chronotype: chronotypeInput.value,
    prepDays: Number(prepDaysInput.value),
    melatoninOk: melatoninInput.checked,
  };

  try {
    const plan = buildPlan(input);
    renderPlan(plan);
    lastRenderedPlan = plan;
    setExportEnabled(true);
    persist(input);
  } catch (error) {
    summaryContent.className = "empty-state warning";
    summaryContent.textContent = error.message;
    timeline.className = "timeline empty-state";
    timeline.textContent = "请先修正输入信息，然后重新生成计划。";
    setExportEnabled(false);
  }
}

function persist(input) {
  const payload = {
    ...input,
    lastPlanInput: input,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function setExportEnabled(enabled) {
  exportCalendarButton.disabled = !enabled;
}

function buildPlan(input) {
  validateInput(input);

  const departureUtc = zonedDateTimeToUtc(input.departureDatetime, input.originTimezone);
  const arrivalUtc = zonedDateTimeToUtc(input.arrivalDatetime, input.destinationTimezone);
  const flightHours = (arrivalUtc.getTime() - departureUtc.getTime()) / (1000 * 60 * 60);
  const arrivalDayOffset = Math.max(
    0,
    getDayDifferenceInZone(departureUtc, arrivalUtc, input.destinationTimezone)
  );

  if (flightHours <= 0) {
    throw new Error("到达时间必须晚于出发时间。请确认日期、航班时长和时区。");
  }

  const offsetOrigin = getOffsetMinutes(input.originTimezone, departureUtc);
  const offsetDestination = getOffsetMinutes(input.destinationTimezone, arrivalUtc);
  const timeDifferenceHours = normalizeHourDifference((offsetDestination - offsetOrigin) / 60);
  const absoluteDifference = Math.abs(timeDifferenceHours);
  const direction = getDirection(timeDifferenceHours);
  const prepDays = absoluteDifference === 0
    ? 0
    : Math.min(input.prepDays, Math.max(2, Math.ceil(absoluteDifference / 2)));
  const recoveryDays = absoluteDifference === 0 ? 0 : Math.max(2, Math.ceil(absoluteDifference / 1.5));
  const totalPlanDays = Math.max(1, prepDays + recoveryDays + 1);
  const baseBed = toMinutes(input.sleepTime);
  const baseWake = toMinutes(input.wakeTime);
  const chronotypeBias = getChronotypeBias(input.chronotype);
  const totalClockShift = -timeDifferenceHours * 60;
  const shiftMagnitude = Math.abs(totalClockShift);

  const dailyPlan = Array.from({ length: totalPlanDays }, (_, index) => {
    const dayOffset = index - prepDays;
    const progress = totalPlanDays === 1 ? 1 : index / (totalPlanDays - 1);
    const shiftMinutes = totalClockShift * easeInOut(progress);
    const remainingShiftRatio = shiftMagnitude === 0
      ? 0
      : Math.abs(totalClockShift - shiftMinutes) / shiftMagnitude;
    const phase = resolvePhase(dayOffset);
    const zone = dayOffset <= 0 ? input.originTimezone : input.destinationTimezone;
    const bedtimeReference = wrapMinutes(baseBed + shiftMinutes + chronotypeBias);
    const wakeReference = wrapMinutes(baseWake + shiftMinutes + chronotypeBias);
    const displayedBedtime = dayOffset <= 0
      ? bedtimeReference
      : wrapMinutes(bedtimeReference + timeDifferenceHours * 60);
    const displayedWake = dayOffset <= 0
      ? wakeReference
      : wrapMinutes(wakeReference + timeDifferenceHours * 60);
    const dateTitle = formatPlanDate(departureUtc, dayOffset, zone);

    const light = getLightWindows(direction, displayedWake, displayedBedtime, {
      remainingShiftRatio,
    });
    const caffeine = getCaffeineWindows(displayedWake, displayedBedtime);
    const nap = getNapWindows(displayedWake, displayedBedtime, {
      direction,
      phase,
      remainingShiftRatio,
    });
    const sleepWindow = [displayedBedtime, displayedWake];
    const normalizedLight = normalizeLightWindows(light, sleepWindow);
    const normalizedCaffeine = normalizeCaffeineWindows(caffeine);
    const normalizedSleep = normalizeSleepWindows({
      sleep: sleepWindow,
      nap: nap.nap,
      napIfTired: nap.napIfTired,
    });

    return {
      label: getDayLabel(dayOffset),
      title: dateTitle,
      phase,
      zone,
      bedtime: minutesToTime(displayedBedtime),
      wakeTime: minutesToTime(displayedWake),
      sleepCore: normalizedSleep.sleep ? formatWindow(...normalizedSleep.sleep) : "不建议",
      nap: normalizedSleep.nap ? formatWindow(...normalizedSleep.nap) : "不建议",
      napIfTired: normalizedSleep.napIfTired ? formatWindow(...normalizedSleep.napIfTired) : "按需",
      lightBright: normalizedLight.bright ? formatWindow(...normalizedLight.bright) : "不建议",
      lightSome: normalizedLight.some ? formatWindow(...normalizedLight.some) : "不建议",
      lightAvoid: normalizedLight.avoid ? formatWindow(...normalizedLight.avoid) : "不建议",
      caffeineUse: normalizedCaffeine.use ? formatWindow(...normalizedCaffeine.use) : "不建议",
      caffeineAvoid: normalizedCaffeine.avoid ? formatWindow(...normalizedCaffeine.avoid) : "不建议",
      melatonin: input.melatoninOk
        ? formatMelatonin(direction, displayedBedtime)
        : "未启用",
      notes: getDayNotes({
        direction,
        dayOffset,
        phase,
        bedtime: displayedBedtime,
        wakeTime: displayedWake,
        melatoninOk: input.melatoninOk,
      }),
    };
  });

  return {
    input,
    summary: {
      direction,
      timeDifferenceHours,
      absoluteDifference,
      prepDays,
      recoveryDays,
      flightHours,
      originTimezone: input.originTimezone,
      destinationTimezone: input.destinationTimezone,
      travelDate: formatLongDate(departureUtc, input.originTimezone),
      arrivalDate: formatLongDate(arrivalUtc, input.destinationTimezone),
      departureOriginTime: formatHm(departureUtc, input.originTimezone),
      departureAsDestinationTime: formatHm(departureUtc, input.destinationTimezone),
      departureAsDestinationLabel: formatLongDate(departureUtc, input.destinationTimezone),
      arrivalDestinationTime: formatHm(arrivalUtc, input.destinationTimezone),
      arrivalDayOffset,
    },
    dailyPlan,
  };
}

function validateInput(input) {
  if (!input.originTimezone || !input.destinationTimezone) {
    throw new Error("请选择出发和目的地时区。");
  }
  if (!input.departureDatetime || !input.arrivalDatetime) {
    throw new Error("请完整填写出发和到达时间。");
  }
  if (!input.sleepTime || !input.wakeTime) {
    throw new Error("请填写平时的睡眠时间。");
  }
}

function renderPlan(plan) {
  renderSummary(plan.summary);
  renderTimeline(plan);
}

function renderSummary(summary) {
  const directionText = getDirectionText(summary.direction);
  const shiftText = `${summary.absoluteDifference.toFixed(1)} 小时`;
  const adaptationText = `${summary.prepDays} 天准备 + ${summary.recoveryDays} 天恢复`;
  const flightText = `${summary.flightHours.toFixed(1)} 小时`;
  const focusText = summary.direction === "east"
    ? "提前作息和早段光照"
    : summary.direction === "west"
      ? "延后作息和傍晚光照"
      : "保持补水、规律进餐和正常睡眠";
  const notesText = summary.absoluteDifference === 0
    ? "这次行程几乎没有时差负担，不需要做多日移相，重点放在飞行疲劳管理即可。"
    : `经验上，${shiftText} 的时差需要连续多天做节律修正。这个版本会把准备动作放在出发前，并把最重要的恢复动作延续到抵达后。`;

  summaryContent.className = "";
  summaryContent.innerHTML = `
    <div class="summary-grid">
      <div class="summary-stat">
        <span>方向</span>
        <strong>${directionText}</strong>
      </div>
      <div class="summary-stat">
        <span>时差</span>
        <strong>${shiftText}</strong>
      </div>
      <div class="summary-stat">
        <span>过渡节奏</span>
        <strong>${adaptationText}</strong>
      </div>
      <div class="summary-stat">
        <span>飞行时长</span>
        <strong>${flightText}</strong>
      </div>
    </div>
    <p class="summary-lead">
      你的行程是 <strong>${summary.travelDate}</strong> 出发，预计在
      <strong>${summary.arrivalDate}</strong> 抵达。建议把重点放在
      <strong>${focusText}</strong>。
    </p>
    <p class="summary-notes">
      ${notesText}
    </p>
  `;
}

function renderTimeline(plan) {
  const { dailyPlan: days, summary } = plan;
  timeline.className = "timeline timeline-continuous";
  timeline.replaceChildren();
  timeline.append(buildContinuousTimeline(days, summary));
}

function getPillMeta(label) {
  if (label === "找光") {
    return { kind: "pill-light-seek", icon: "☀" };
  }
  if (label === "强光") {
    return { kind: "pill-light-seek", icon: "☀" };
  }
  if (label === "一般光照") {
    return { kind: "pill-light-seek-soft", icon: "◐" };
  }
  if (label === "避光") {
    return { kind: "pill-light-avoid", icon: "☾" };
  }
  if (label === "咖啡因") {
    return { kind: "pill-caffeine", icon: "☕" };
  }
  if (label === "使用咖啡因") {
    return { kind: "pill-caffeine", icon: "☕" };
  }
  if (label === "避免咖啡因") {
    return { kind: "pill-caffeine-avoid", icon: "⊘" };
  }
  if (label === "小睡") {
    return { kind: "pill-nap", icon: "◒" };
  }
  if (label === "疲劳可小睡") {
    return { kind: "pill-nap-soft", icon: "◔" };
  }
  if (label === "入睡") {
    return { kind: "pill-sleep", icon: "☾" };
  }
  if (label === "褪黑素") {
    return { kind: "pill-melatonin", icon: "◌" };
  }
  return { kind: "pill-wake", icon: "☀" };
}

function buildContinuousTimeline(days, summary) {
  const board = document.createElement("section");
  board.className = "continuous-board";
  const title = document.createElement("h4");
  title.className = "track-title";
  title.textContent = "连续轨道（每天等高，24:00 与下一天 00:00 连续）";

  const track = document.createElement("div");
  track.className = "continuous-track";

  const labels = document.createElement("div");
  labels.className = "track-hours";
  const labelsRight = document.createElement("div");
  labelsRight.className = "track-hours track-hours-right";

  const rail = document.createElement("div");
  rail.className = "continuous-rail";
  const content = document.createElement("div");
  content.className = "continuous-layout";
  const left = document.createElement("div");
  left.className = "continuous-left";
  const panel = document.createElement("aside");
  panel.className = "timeline-detail-panel";
  const panelTag = document.createElement("p");
  panelTag.className = "detail-tag";
  const panelHeader = document.createElement("div");
  panelHeader.className = "detail-header";
  const panelTitle = document.createElement("h5");
  panelTitle.className = "detail-title";
  const panelSource = document.createElement("span");
  panelSource.className = "detail-source";
  const panelBody = document.createElement("p");
  panelBody.className = "detail-body";
  const panelList = document.createElement("ul");
  panelList.className = "detail-list";
  panelHeader.append(panelTitle, panelSource);
  panel.append(panelTag, panelHeader, panelBody, panelList);

  const dayHeight = 360;
  const totalHeight = days.length * dayHeight;
  labels.style.height = `${totalHeight}px`;
  labelsRight.style.height = `${totalHeight}px`;
  rail.style.height = `${totalHeight}px`;
  track.style.height = `${totalHeight}px`;

  const interactiveItems = [];
  const showDayDetail = (day) => {
    panelTag.textContent = `${day.label} · ${day.phase}`;
    panelSource.textContent = "日建议";
    panelTitle.textContent = day.title;
    panelBody.textContent = `今日关键节律窗口：起床 ${day.wakeTime}，入睡 ${day.bedtime}。`;
    panelList.replaceChildren();
    day.notes.forEach((note) => {
      const item = document.createElement("li");
      item.textContent = note;
      panelList.append(item);
    });
  };

  const showBlockDetail = ({ day, label, value, details, crossesDay }) => {
    panelTag.textContent = `${day.label} · ${day.phase}`;
    panelSource.textContent = "块建议";
    panelTitle.textContent = `${label} · ${value}${crossesDay ? "（跨天）" : ""}`;
    panelBody.textContent = details;
    panelList.replaceChildren();
    const hints = [
      `日期：${day.title}`,
      `建议窗口：${value}`,
      crossesDay ? "该窗口跨越当天与次日，请连续执行。" : "该窗口在当日内完成。",
    ];
    hints.forEach((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      panelList.append(item);
    });
  };

  const setActive = (element) => {
    interactiveItems.forEach((node) => node.classList.remove("is-active"));
    element.classList.add("is-active");
  };

  days.forEach((day, dayIndex) => {
    const dayButton = appendDayDivider(rail, day, dayIndex, dayHeight, summary);
    appendDayHourLabels(labels, dayIndex, dayHeight, {
      isDepartureDay: day.label === "D0",
      departureMinute: summary.departureOriginTime
        ? toMinutes(summary.departureOriginTime)
        : null,
      timeDifferenceMinutes: Math.round(summary.timeDifferenceHours * 60),
    });
    appendDayHourLabels(labelsRight, dayIndex, dayHeight, {
      isDepartureDay: day.label === "D0",
      departureMinute: summary.departureOriginTime
        ? toMinutes(summary.departureOriginTime)
        : null,
      timeDifferenceMinutes: Math.round(summary.timeDifferenceHours * 60),
    });
    dayButton.addEventListener("click", () => {
      setActive(dayButton);
      showDayDetail(day);
    });
    interactiveItems.push(dayButton);

    appendTrackWindow({
      parent: rail,
      className: "segment-sleep",
      label: "入睡",
      value: day.sleepCore,
      start: toMinutes(day.bedtime),
      end: toMinutes(day.wakeTime),
      dayIndex,
      dayHeight,
      details: `${day.label} ${day.title}：主睡眠窗口 ${day.bedtime} 入睡，${day.wakeTime} 起床。`,
      displayOptions: {
        isDepartureDay: day.label === "D0",
        departureMinute: summary.departureOriginTime
          ? toMinutes(summary.departureOriginTime)
          : null,
        timeDifferenceMinutes: Math.round(summary.timeDifferenceHours * 60),
      },
      onClick: ({ element, crossesDay, value, details }) => {
        setActive(element);
        showBlockDetail({ day, label: "入睡", value, details, crossesDay });
      },
      interactiveItems,
    });

    const lightBright = parseWindow(day.lightBright);
    if (lightBright) {
      appendTrackWindow({
        parent: rail,
        className: "segment-light-seek-bright",
        label: "强光",
        value: day.lightBright,
        start: lightBright.start,
        end: lightBright.end,
        dayIndex,
        dayHeight,
        details: `${day.label} ${day.title}：建议在 ${day.lightBright} 接受高照度光照。`,
        displayOptions: {
          isDepartureDay: day.label === "D0",
          departureMinute: summary.departureOriginTime
            ? toMinutes(summary.departureOriginTime)
            : null,
          timeDifferenceMinutes: Math.round(summary.timeDifferenceHours * 60),
        },
        onClick: ({ element, crossesDay, value, details }) => {
          setActive(element);
          showBlockDetail({ day, label: "强光", value, details, crossesDay });
        },
        interactiveItems,
      });
    }

    const lightSome = parseWindow(day.lightSome);
    if (lightSome) {
      appendTrackWindow({
        parent: rail,
        className: "segment-light-seek-soft",
        label: "一般光照",
        value: day.lightSome,
        start: lightSome.start,
        end: lightSome.end,
        dayIndex,
        dayHeight,
        details: `${day.label} ${day.title}：建议在 ${day.lightSome} 接受中等强度自然光。`,
        displayOptions: {
          isDepartureDay: day.label === "D0",
          departureMinute: summary.departureOriginTime
            ? toMinutes(summary.departureOriginTime)
            : null,
          timeDifferenceMinutes: Math.round(summary.timeDifferenceHours * 60),
        },
        onClick: ({ element, crossesDay, value, details }) => {
          setActive(element);
          showBlockDetail({ day, label: "一般光照", value, details, crossesDay });
        },
        interactiveItems,
      });
    }

    const lightAvoid = parseWindow(day.lightAvoid);
    if (lightAvoid) {
      appendTrackWindow({
        parent: rail,
        className: "segment-light-avoid",
        label: "避光",
        value: day.lightAvoid,
        start: lightAvoid.start,
        end: lightAvoid.end,
        dayIndex,
        dayHeight,
        details: `${day.label} ${day.title}：建议在 ${day.lightAvoid} 避免强光与高亮屏幕刺激。`,
        displayOptions: {
          isDepartureDay: day.label === "D0",
          departureMinute: summary.departureOriginTime
            ? toMinutes(summary.departureOriginTime)
            : null,
          timeDifferenceMinutes: Math.round(summary.timeDifferenceHours * 60),
        },
        onClick: ({ element, crossesDay, value, details }) => {
          setActive(element);
          showBlockDetail({ day, label: "避光", value, details, crossesDay });
        },
        interactiveItems,
      });
    }

    const caffeineUse = parseWindow(day.caffeineUse);
    if (caffeineUse) {
      appendTrackWindow({
        parent: rail,
        className: "segment-caffeine-use",
        label: "使用咖啡因",
        value: day.caffeineUse,
        start: caffeineUse.start,
        end: caffeineUse.end,
        dayIndex,
        dayHeight,
        details: `${day.label} ${day.title}：建议在 ${day.caffeineUse} 使用咖啡因。`,
        displayOptions: {
          isDepartureDay: day.label === "D0",
          departureMinute: summary.departureOriginTime
            ? toMinutes(summary.departureOriginTime)
            : null,
          timeDifferenceMinutes: Math.round(summary.timeDifferenceHours * 60),
        },
        onClick: ({ element, crossesDay, value, details }) => {
          setActive(element);
          showBlockDetail({ day, label: "使用咖啡因", value, details, crossesDay });
        },
        interactiveItems,
      });
    }

    const caffeineAvoid = parseWindow(day.caffeineAvoid);
    if (caffeineAvoid) {
      appendTrackWindow({
        parent: rail,
        className: "segment-caffeine-avoid",
        label: "避免咖啡因",
        value: day.caffeineAvoid,
        start: caffeineAvoid.start,
        end: caffeineAvoid.end,
        dayIndex,
        dayHeight,
        details: `${day.label} ${day.title}：在 ${day.caffeineAvoid} 避免摄入咖啡因。`,
        displayOptions: {
          isDepartureDay: day.label === "D0",
          departureMinute: summary.departureOriginTime
            ? toMinutes(summary.departureOriginTime)
            : null,
          timeDifferenceMinutes: Math.round(summary.timeDifferenceHours * 60),
        },
        onClick: ({ element, crossesDay, value, details }) => {
          setActive(element);
          showBlockDetail({ day, label: "避免咖啡因", value, details, crossesDay });
        },
        interactiveItems,
      });
    }

    const nap = parseWindow(day.nap);
    if (nap) {
      appendTrackWindow({
        parent: rail,
        className: "segment-nap",
        label: "小睡",
        value: day.nap,
        start: nap.start,
        end: nap.end,
        dayIndex,
        dayHeight,
        details: `${day.label} ${day.title}：建议短时小睡窗口 ${day.nap}。`,
        displayOptions: {
          isDepartureDay: day.label === "D0",
          departureMinute: summary.departureOriginTime
            ? toMinutes(summary.departureOriginTime)
            : null,
          timeDifferenceMinutes: Math.round(summary.timeDifferenceHours * 60),
        },
        onClick: ({ element, crossesDay, value, details }) => {
          setActive(element);
          showBlockDetail({ day, label: "小睡", value, details, crossesDay });
        },
        interactiveItems,
      });
    }

    const napIfTired = parseWindow(day.napIfTired);
    if (napIfTired) {
      appendTrackWindow({
        parent: rail,
        className: "segment-nap-soft",
        label: "疲劳可小睡",
        value: day.napIfTired,
        start: napIfTired.start,
        end: napIfTired.end,
        dayIndex,
        dayHeight,
        details: `${day.label} ${day.title}：若困倦明显，可在 ${day.napIfTired} 内短睡并及时醒来。`,
        displayOptions: {
          isDepartureDay: day.label === "D0",
          departureMinute: summary.departureOriginTime
            ? toMinutes(summary.departureOriginTime)
            : null,
          timeDifferenceMinutes: Math.round(summary.timeDifferenceHours * 60),
        },
        onClick: ({ element, crossesDay, value, details }) => {
          setActive(element);
          showBlockDetail({ day, label: "疲劳可小睡", value, details, crossesDay });
        },
        interactiveItems,
      });
    }

    const melatonin = parseWindow(day.melatonin);
    if (melatonin) {
      appendTrackWindow({
        parent: rail,
        className: "segment-melatonin",
        label: "褪黑素",
        value: day.melatonin,
        start: melatonin.start,
        end: melatonin.end,
        dayIndex,
        dayHeight,
        details: `${day.label} ${day.title}：如使用褪黑素，建议时间 ${day.melatonin}。`,
        displayOptions: {
          isDepartureDay: day.label === "D0",
          departureMinute: summary.departureOriginTime
            ? toMinutes(summary.departureOriginTime)
            : null,
          timeDifferenceMinutes: Math.round(summary.timeDifferenceHours * 60),
        },
        onClick: ({ element, crossesDay, value, details }) => {
          setActive(element);
          showBlockDetail({ day, label: "褪黑素", value, details, crossesDay });
        },
        interactiveItems,
      });
    }

    appendTrackMarker(rail, "marker-wake", toMinutes(day.wakeTime), dayIndex, dayHeight, `起床 ${day.wakeTime}`);
    appendTrackMarker(rail, "marker-bed", toMinutes(day.bedtime), dayIndex, dayHeight, `入睡 ${day.bedtime}`);

  });

  appendDepartureSwitchMarker(rail, days, summary, dayHeight);
  appendFlightPath(rail, days, summary, dayHeight);

  if (days.length > 0 && interactiveItems.length > 0) {
    setActive(interactiveItems[0]);
    showDayDetail(days[0]);
  } else {
    panelTag.textContent = "暂无数据";
    panelSource.textContent = "日建议";
    panelTitle.textContent = "还没有可展示的建议";
    panelBody.textContent = "请先生成计划。";
    panelList.replaceChildren();
  }

  track.append(labels, rail, labelsRight);
  left.append(track);
  content.append(left, panel);
  board.append(title, content);
  return board;
}

function appendDepartureSwitchMarker(rail, days, summary, dayHeight) {
  const switchDayIndex = days.findIndex((day) => day.label === "D0");
  if (switchDayIndex < 0 || !summary.departureOriginTime) {
    return;
  }

  const switchMinute = toMinutes(summary.departureOriginTime);
  const y = switchDayIndex * dayHeight + (switchMinute / (24 * 60)) * dayHeight;

  const marker = document.createElement("div");
  marker.className = "departure-switch-marker";
  marker.style.top = `${y}px`;

  const chip = document.createElement("div");
  chip.className = "departure-switch-chip";
  chip.style.top = `${y}px`;
  chip.textContent = `出发后按目的地时间执行 · ${summary.departureAsDestinationLabel}`;

  rail.append(marker, chip);
}

function appendFlightPath(rail, days, summary, dayHeight) {
  if (!summary.departureOriginTime || !summary.arrivalDestinationTime) {
    return;
  }

  const departureDayIndex = days.findIndex((day) => day.label === "D0");
  if (departureDayIndex < 0) {
    return;
  }

  const startMinute = toMinutes(summary.departureOriginTime);
  const endMinute = toMinutes(summary.arrivalDestinationTime);
  const offsetDays = Number.isFinite(summary.arrivalDayOffset) ? summary.arrivalDayOffset : 1;
  const endDayIndex = Math.min(days.length - 1, departureDayIndex + Math.max(0, offsetDays));

  const startY = departureDayIndex * dayHeight + (startMinute / (24 * 60)) * dayHeight;
  let endY = endDayIndex * dayHeight + (endMinute / (24 * 60)) * dayHeight;
  if (endY <= startY) {
    endY = Math.min(days.length * dayHeight, endY + dayHeight);
  }
  const height = Math.max(endY - startY, 16);

  const line = document.createElement("div");
  line.className = "flight-path-line";
  line.style.top = `${startY}px`;
  line.style.height = `${height}px`;

  const startNode = document.createElement("div");
  startNode.className = "flight-path-node flight-path-start";
  startNode.style.top = `${startY}px`;
  startNode.textContent = "✈";
  startNode.title = `起飞 ${summary.departureOriginTime}`;

  const endNode = document.createElement("div");
  endNode.className = "flight-path-node flight-path-end";
  endNode.style.top = `${endY}px`;
  endNode.textContent = "✈";
  endNode.title = `落地 ${summary.arrivalDestinationTime}`;

  rail.append(line, startNode, endNode);
}

function appendDayHourLabels(parent, dayIndex, dayHeight, options = {}) {
  const {
    isDepartureDay = false,
    departureMinute = null,
    timeDifferenceMinutes = 0,
  } = options;

  for (let hour = 0; hour < 24; hour += 1) {
    const railMinute = hour * 60;
    const labelMinute = isDepartureDay && departureMinute !== null && railMinute >= departureMinute
      ? wrapMinutes(railMinute + timeDifferenceMinutes)
      : railMinute;

    const item = document.createElement("span");
    item.className = "track-hour-item";
    item.style.top = `${dayIndex * dayHeight + (railMinute / (24 * 60)) * dayHeight}px`;
    item.textContent = minutesToTime(labelMinute);
    parent.append(item);
  }
}

function appendDayDivider(parent, day, dayIndex, dayHeight, summary) {
  const top = dayIndex * dayHeight;
  const header = document.createElement("div");
  header.className = "day-header-row";
  header.style.top = `${top}px`;

  const right = document.createElement("span");
  right.className = "day-zone-clock";
  right.textContent = buildDayRightMeta(day, summary);
  header.append(right);
  parent.append(header);

  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "day-chip";
  chip.style.top = `${top}px`;
  chip.textContent = `${day.label} ${day.title}`;
  parent.append(chip);

  const line = document.createElement("div");
  line.className = "day-divider";
  line.style.top = `${top + 24}px`;
  parent.append(line);
  return chip;
}

function buildDayRightMeta(day, summary) {
  const originCity = timezoneCityLabel(summary.originTimezone);
  const destinationCity = timezoneCityLabel(summary.destinationTimezone);
  const dayOffset = parseDayOffset(day.label);

  if (dayOffset < 0) {
    return `${originCity} 00:00`;
  }
  if (dayOffset === 0) {
    return `${destinationCity} ${summary.departureAsDestinationTime || "00:00"}`;
  }
  return `${destinationCity} 00:00`;
}

function parseDayOffset(label) {
  const match = typeof label === "string" ? label.match(/^D([+-]?\d+)$/) : null;
  return match ? Number(match[1]) : 0;
}

function timezoneCityLabel(zone) {
  if (!zone) {
    return "UTC";
  }
  const parts = zone.split("/");
  const city = parts[parts.length - 1] || zone;
  return city.replaceAll("_", " ");
}

function appendTrackWindow({
  parent,
  className,
  label,
  value,
  start,
  end,
  dayIndex,
  dayHeight,
  details,
  displayOptions = {},
  onClick,
  interactiveItems,
}) {
  const meta = getPillMeta(label);
  const ranges = splitWrappedRange(start, end);
  const crossesDay = wrapMinutes(end) <= wrapMinutes(start);

  ranges.forEach(({ from, to }) => {
    const displayValue = formatWindowBySwitch(value, displayOptions);
    const segment = document.createElement("button");
    segment.type = "button";
    segment.className = `track-pill ${className}`;
    if (crossesDay) {
      segment.classList.add("is-cross-day");
    }
    segment.style.top = `${dayIndex * dayHeight + (from / (24 * 60)) * dayHeight}px`;
    segment.style.height = `${Math.max(((to - from) / (24 * 60)) * dayHeight, 14)}px`;
    segment.dataset.details = crossesDay ? `${details}（跨天窗口）` : details;
    segment.innerHTML = `
      <span class="track-pill-title"><i aria-hidden="true">${meta.icon}</i>${label}</span>
      <strong>${crossesDay ? `${displayValue} · 跨天` : displayValue}</strong>
    `;
    segment.addEventListener("click", () => {
      onClick({
        element: segment,
        crossesDay,
        value: displayValue,
        details: segment.dataset.details || details,
      });
    });
    parent.append(segment);
    interactiveItems.push(segment);
  });
}

function formatWindowBySwitch(value, options = {}) {
  const parsed = parseWindow(value);
  if (!parsed) {
    return value;
  }

  const {
    isDepartureDay = false,
    departureMinute = null,
    timeDifferenceMinutes = 0,
  } = options;

  if (!isDepartureDay || departureMinute === null || timeDifferenceMinutes === 0) {
    return value;
  }

  const crossesDay = wrapMinutes(parsed.end) <= wrapMinutes(parsed.start);
  const convert = (minute, dayOffset = 0) => {
    if (dayOffset > 0) {
      return minute;
    }
    return minute >= departureMinute
      ? wrapMinutes(minute + timeDifferenceMinutes)
      : minute;
  };

  return formatWindow(
    convert(parsed.start, 0),
    convert(parsed.end, crossesDay ? 1 : 0)
  );
}

function appendTrackMarker(parent, className, minute, dayIndex, dayHeight, text) {
  const marker = document.createElement("div");
  marker.className = `track-marker ${className}`;
  marker.style.top = `${dayIndex * dayHeight + (wrapMinutes(minute) / (24 * 60)) * dayHeight}px`;
  marker.title = text;
  parent.append(marker);
}

function splitWrappedRange(start, end) {
  const from = wrapMinutes(start);
  const to = wrapMinutes(end);
  if (from === to) {
    return [{ from: 0, to: 24 * 60 }];
  }
  if (to > from) {
    return [{ from, to }];
  }
  return [
    { from, to: 24 * 60 },
    { from: 0, to },
  ];
}

function parseWindow(value) {
  const match = typeof value === "string"
    ? value.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/)
    : null;
  if (!match) {
    return null;
  }
  return {
    start: toMinutes(match[1]),
    end: toMinutes(match[2]),
  };
}

function handleExportCalendar() {
  if (!lastRenderedPlan) {
    return;
  }

  const ics = buildIcsCalendar(lastRenderedPlan);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildIcsFilename(lastRenderedPlan.summary.travelDate);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildIcsFilename(travelDateText) {
  const safeDate = travelDateText.replace(/[^\d]/g, "").slice(0, 8) || "plan";
  return `timeshifter-${safeDate}.ics`;
}

function buildIcsCalendar(plan) {
  const nowStamp = toIcsDateTime(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TimeShifter Web//Jet Lag Planner//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  plan.dailyPlan.forEach((day, index) => {
    const eventDate = getEventDateFromDayLabel(plan, day.label, index);
    const dateOnly = formatIcsDate(eventDate);
    const wakeDt = combineDateAndTime(eventDate, day.wakeTime);
    const sleepDt = combineDateAndTime(eventDate, day.bedtime);
    const seek = parseWindow(day.lightBright);
    const seekSoft = parseWindow(day.lightSome);
    const avoid = parseWindow(day.lightAvoid);
    const caffeineUse = parseWindow(day.caffeineUse);
    const caffeineAvoid = parseWindow(day.caffeineAvoid);
    const nap = parseWindow(day.nap);
    const napIfTired = parseWindow(day.napIfTired);
    const melatonin = parseWindow(day.melatonin);

    lines.push(
      ...buildAllDayEvent({
        uid: `day-${index}-${dateOnly}@timeshifter-web`,
        stamp: nowStamp,
        dateOnly,
        title: `${day.label} ${day.title} 倒时差总建议`,
        description: [
          `阶段：${day.phase}`,
          `起床：${day.wakeTime}`,
          `入睡：${day.bedtime}`,
          "",
          "当日建议：",
          ...day.notes.map((note) => `- ${note}`),
        ].join("\\n"),
      })
    );

    lines.push(
      ...buildTimedEvent({
        uid: `wake-${index}-${dateOnly}@timeshifter-web`,
        stamp: nowStamp,
        start: wakeDt,
        end: addMinutes(wakeDt, 15),
        title: `起床 (${day.label})`,
        description: `${day.label} ${day.title}：按计划起床。`,
      }),
      ...buildTimedEvent({
        uid: `sleep-${index}-${dateOnly}@timeshifter-web`,
        stamp: nowStamp,
        start: sleepDt,
        end: addMinutes(sleepDt, 20),
        title: `准备入睡 (${day.label})`,
        description: `${day.label} ${day.title}：准备进入主睡眠窗口。`,
      })
    );

    pushWindowEvent(lines, {
      prefix: "seek",
      index,
      dateOnly,
      stamp: nowStamp,
      eventDate,
      window: seek,
      label: "找光",
      raw: day.lightBright,
      day,
    });
    pushWindowEvent(lines, {
      prefix: "seek-soft",
      index,
      dateOnly,
      stamp: nowStamp,
      eventDate,
      window: seekSoft,
      label: "See some light",
      raw: day.lightSome,
      day,
    });
    pushWindowEvent(lines, {
      prefix: "avoid",
      index,
      dateOnly,
      stamp: nowStamp,
      eventDate,
      window: avoid,
      label: "避光",
      raw: day.lightAvoid,
      day,
    });
    pushWindowEvent(lines, {
      prefix: "coffee",
      index,
      dateOnly,
      stamp: nowStamp,
      eventDate,
      window: caffeineUse,
      label: "Use caffeine",
      raw: day.caffeineUse,
      day,
    });
    pushWindowEvent(lines, {
      prefix: "coffee-avoid",
      index,
      dateOnly,
      stamp: nowStamp,
      eventDate,
      window: caffeineAvoid,
      label: "Avoid caffeine",
      raw: day.caffeineAvoid,
      day,
    });
    pushWindowEvent(lines, {
      prefix: "nap",
      index,
      dateOnly,
      stamp: nowStamp,
      eventDate,
      window: nap,
      label: "Nap",
      raw: day.nap,
      day,
    });
    pushWindowEvent(lines, {
      prefix: "nap-soft",
      index,
      dateOnly,
      stamp: nowStamp,
      eventDate,
      window: napIfTired,
      label: "Nap if you're tired",
      raw: day.napIfTired,
      day,
    });
    pushWindowEvent(lines, {
      prefix: "melatonin",
      index,
      dateOnly,
      stamp: nowStamp,
      eventDate,
      window: melatonin,
      label: "褪黑素窗口",
      raw: day.melatonin,
      day,
    });
  });

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

function pushWindowEvent(lines, { prefix, index, dateOnly, stamp, eventDate, window, label, raw, day }) {
  if (!window) {
    return;
  }
  const ranges = splitWrappedRange(window.start, window.end);
  ranges.forEach((range, segmentIndex) => {
    const dayOffset = segmentIndex === 0 ? 0 : 1;
    const startDate = addDays(eventDate, dayOffset);
    const start = combineDateAndTime(startDate, minutesToTime(range.from));
    const end = combineDateAndTime(startDate, minutesToTime(range.to));
    lines.push(
      ...buildTimedEvent({
        uid: `${prefix}-${index}-${segmentIndex}-${dateOnly}@timeshifter-web`,
        stamp,
        start,
        end,
        title: `${label} (${day.label})`,
        description: `${day.label} ${day.title}：${label} ${raw}`,
      })
    );
  });
}

function buildAllDayEvent({ uid, stamp, dateOnly, title, description }) {
  const nextDay = formatIcsDate(addDays(parseIcsDate(dateOnly), 1));
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${dateOnly}`,
    `DTEND;VALUE=DATE:${nextDay}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    "END:VEVENT",
  ];
}

function buildTimedEvent({ uid, stamp, start, end, title, description }) {
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toIcsDateTime(start)}`,
    `DTEND:${toIcsDateTime(end)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    "END:VEVENT",
  ];
}

function getEventDateFromDayLabel(plan, label, index) {
  const departureUtc = zonedDateTimeToUtc(
    plan.input.departureDatetime,
    plan.input.originTimezone
  );
  const base = new Date(departureUtc.getTime());
  const match = label.match(/^D([+-]?\d+)$/);
  if (match) {
    base.setUTCDate(base.getUTCDate() + Number(match[1]));
    return toLocalDateOnly(base);
  }
  base.setUTCDate(base.getUTCDate() + index);
  return toLocalDateOnly(base);
}

function toLocalDateOnly(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function combineDateAndTime(baseDate, hhmm) {
  const [hour, minute] = hhmm.split(":").map(Number);
  return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hour, minute, 0, 0);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function formatIcsDate(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function parseIcsDate(dateText) {
  const year = Number(dateText.slice(0, 4));
  const month = Number(dateText.slice(4, 6)) - 1;
  const day = Number(dateText.slice(6, 8));
  return new Date(year, month, day);
}

function toIcsDateTime(date) {
  return `${formatIcsDate(date)}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function escapeIcsText(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function getLightWindows(direction, wakeTime, bedtime, options = {}) {
  const { remainingShiftRatio = 1 } = options;
  const easeBack = remainingShiftRatio <= 0.2;

  if (direction === "none") {
    return {
      bright: [wakeTime + 30, wakeTime + 120],
      some: [wakeTime + 120, wakeTime + 210],
      avoid: [bedtime - 90, bedtime],
    };
  }

  if (direction === "east") {
    if (easeBack) {
      return {
        bright: [wakeTime + 40, wakeTime + 120],
        some: [wakeTime + 120, wakeTime + 210],
        avoid: [bedtime - 90, bedtime],
      };
    }
    return {
      bright: [wakeTime + 20, wakeTime + 120],
      some: [wakeTime + 120, wakeTime + 240],
      avoid: [bedtime - 180, bedtime],
    };
  }

  if (easeBack) {
    return {
      bright: [wakeTime + 60, wakeTime + 150],
      some: [wakeTime + 150, wakeTime + 240],
      avoid: [bedtime - 90, bedtime],
    };
  }

  return {
    bright: [bedtime - 360, bedtime - 210],
    some: [bedtime - 210, bedtime - 90],
    avoid: [wakeTime, wakeTime + 120],
  };
}

function getCaffeineWindows(wakeTime, bedtime) {
  const useStart = wakeTime + 30;
  const useEnd = bedtime - 8 * 60;
  const avoidStart = useEnd;
  const avoidEnd = bedtime + 120;
  return {
    use: [useStart, useEnd],
    avoid: [avoidStart, avoidEnd],
  };
}

function getNapWindows(wakeTime, bedtime, options = {}) {
  const { direction = "none", phase = "恢复期", remainingShiftRatio = 1 } = options;
  const hasLargeShift = direction !== "none" && remainingShiftRatio > 0.25;
  const daytimeWindow = [wakeTime + 7 * 60, wakeTime + 8 * 60];
  const tiredWindow = [wakeTime + 6 * 60, wakeTime + 9 * 60];

  if (phase === "出发日" || phase === "抵达日" || hasLargeShift) {
    return {
      nap: daytimeWindow,
      napIfTired: tiredWindow,
    };
  }
  return {
    nap: null,
    napIfTired: tiredWindow,
  };
}

function normalizeLightWindows(light, sleepWindow) {
  const sleepIntervals = toIntervals(sleepWindow);
  const bright = subtractWindowByIntervals(light.bright, sleepIntervals);
  const someBase = subtractWindowByIntervals(light.some, sleepIntervals);
  const avoidBase = subtractWindowByIntervals(light.avoid, sleepIntervals);
  const some = subtractWindowByIntervals(someBase, toIntervals(bright));
  const avoid = subtractWindowByIntervals(avoidBase, toIntervals(bright).concat(toIntervals(some)));
  return { bright, some, avoid };
}

function normalizeCaffeineWindows(caffeine) {
  const use = clampWindowMinimumDuration(caffeine.use, 20);
  const avoidBase = caffeine.avoid;
  const avoid = subtractWindowByIntervals(avoidBase, toIntervals(use));
  return { use, avoid };
}

function normalizeSleepWindows(sleepSet) {
  const sleep = sleepSet.sleep;
  const napBase = sleepSet.nap;
  const napIfTiredBase = sleepSet.napIfTired;

  const nap = subtractWindowByIntervals(napBase, toIntervals(sleep));
  const napIfTired = subtractWindowByIntervals(
    napIfTiredBase,
    toIntervals(sleep).concat(toIntervals(nap))
  );
  return { sleep, nap, napIfTired };
}

function toIntervals(window) {
  if (!window) {
    return [];
  }
  const [start, end] = window;
  return splitWrappedRange(start, end).map((item) => [item.from, item.to]);
}

function subtractWindowByIntervals(window, blockedIntervals) {
  if (!window) {
    return null;
  }
  const fragments = splitWrappedRange(window[0], window[1]).map((part) => [part.from, part.to]);
  const remaining = fragments.flatMap((fragment) => subtractIntervalSet(fragment, blockedIntervals));
  if (!remaining.length) {
    return null;
  }
  const longest = remaining.reduce((best, current) => (
    current[1] - current[0] > best[1] - best[0] ? current : best
  ));
  return [longest[0], longest[1]];
}

function subtractIntervalSet(interval, blockers) {
  let segments = [interval];
  blockers.forEach((blocker) => {
    segments = segments.flatMap((segment) => subtractSingleInterval(segment, blocker));
  });
  return segments;
}

function subtractSingleInterval(segment, blocker) {
  const [a, b] = segment;
  const [x, y] = blocker;
  const overlapStart = Math.max(a, x);
  const overlapEnd = Math.min(b, y);
  if (overlapStart >= overlapEnd) {
    return [segment];
  }
  const next = [];
  if (a < overlapStart) {
    next.push([a, overlapStart]);
  }
  if (overlapEnd < b) {
    next.push([overlapEnd, b]);
  }
  return next;
}

function clampWindowMinimumDuration(window, minimumMinutes) {
  if (!window) {
    return null;
  }
  const [start, end] = window;
  const duration = minutesSpan(start, end);
  if (duration < minimumMinutes) {
    return null;
  }
  return [start, end];
}

function minutesSpan(start, end) {
  const wrappedStart = wrapMinutes(start);
  const wrappedEnd = wrapMinutes(end);
  if (wrappedEnd > wrappedStart) {
    return wrappedEnd - wrappedStart;
  }
  return 24 * 60 - wrappedStart + wrappedEnd;
}

function formatMelatonin(direction, bedtime) {
  if (direction === "none") {
    return "通常不需要";
  }
  if (direction === "west") {
    return "通常不作为首选";
  }
  return formatWindow(bedtime - 240, bedtime - 180);
}

function getDayNotes({ direction, dayOffset, phase, bedtime, wakeTime, melatoninOk }) {
  const notes = [];

  if (dayOffset < 0) {
    notes.push("今天以试运行模式执行，尽量靠近建议的起床和入睡时间。");
  }

  if (phase === "出发日") {
    notes.push("航班上优先补水，餐食和小睡尽量朝目的地作息靠拢。");
    notes.push("如果需要小睡，控制在 20 到 30 分钟，避免拖到主睡眠窗口。");
  }

  if (phase === "抵达日") {
    notes.push("落地后先按当地白天活动，不要太早躲回酒店睡长觉。");
  }

  if (direction === "none") {
    notes.push("这趟行程没有明显时差，维持原本作息比强行调整更重要。");
    notes.push("把注意力放在补水、拉伸和避免过量饮酒。");
  } else if (direction === "east") {
    notes.push(`早些暴露在自然光下，${minutesToTime(wakeTime)} 后尽快开始活动。`);
    notes.push("晚上尽量减少强光和高强度屏幕刺激。");
    if (melatoninOk) {
      notes.push("如果你平时能耐受褪黑素，可在建议窗口内使用低剂量版本。");
    }
  } else {
    notes.push("下午到傍晚适度外出，利用光照帮助延后节律。");
    notes.push(`早晨前 ${minutesToTime(wakeTime + 120)} 尽量不要把自己暴露在强光下。`);
    notes.push("晚上不要过早上床，否则容易凌晨醒。");
  }

  if (minutesDistance(bedtime, wakeTime) < 6 * 60) {
    notes.push("今天建议的睡眠窗口偏短，务必减少额外社交和饮酒。");
  }

  return notes;
}

function resolvePhase(dayOffset) {
  if (dayOffset < 0) {
    return "准备期";
  }
  if (dayOffset === 0) {
    return "出发日";
  }
  if (dayOffset === 1) {
    return "抵达日";
  }
  return "恢复期";
}

function getDayLabel(dayOffset) {
  if (dayOffset < 0) {
    return `D${dayOffset}`;
  }
  if (dayOffset === 0) {
    return "D0";
  }
  return `D+${dayOffset}`;
}

function formatPlanDate(anchorDate, dayOffset, timeZone) {
  const utcDate = new Date(anchorDate.getTime());
  utcDate.setUTCDate(utcDate.getUTCDate() + dayOffset);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(utcDate);
}

function formatLongDate(date, timeZone) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatHm(date, timeZone) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function easeInOut(progress) {
  return progress * progress * (3 - 2 * progress);
}

function getChronotypeBias(chronotype) {
  if (chronotype === "early") {
    return -20;
  }
  if (chronotype === "late") {
    return 25;
  }
  return 0;
}

function toDatetimeLocal(date) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function zonedDateTimeToUtc(datetimeLocal, timeZone) {
  const [datePart, timePart] = datetimeLocal.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  let guess = Date.UTC(year, month - 1, day, hour, minute);

  for (let index = 0; index < 4; index += 1) {
    const offset = getOffsetMinutes(timeZone, new Date(guess));
    const adjusted = Date.UTC(year, month - 1, day, hour, minute) - offset * 60 * 1000;
    if (adjusted === guess) {
      break;
    }
    guess = adjusted;
  }

  return new Date(guess);
}

function getOffsetMinutes(timeZone, date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  });
  const timeZonePart = formatter.formatToParts(date).find((part) => part.type === "timeZoneName");
  const offset = timeZonePart ? timeZonePart.value : "GMT+0";
  return parseOffset(offset);
}

function parseOffset(text) {
  if (text === "GMT" || text === "UTC") {
    return 0;
  }

  const match = text.match(/([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) {
    return 0;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
}

function getDayDifferenceInZone(startDate, endDate, timeZone) {
  const start = getZonedDateParts(startDate, timeZone);
  const end = getZonedDateParts(endDate, timeZone);
  const startDay = Date.UTC(start.year, start.month - 1, start.day) / 86400000;
  const endDay = Date.UTC(end.year, end.month - 1, end.day) / 86400000;
  return endDay - startDay;
}

function getZonedDateParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
  };
}

function normalizeHourDifference(hours) {
  let value = hours;
  while (value > 12) {
    value -= 24;
  }
  while (value < -12) {
    value += 24;
  }
  return value;
}

function getDirection(timeDifferenceHours) {
  if (timeDifferenceHours === 0) {
    return "none";
  }
  return timeDifferenceHours > 0 ? "east" : "west";
}

function getDirectionText(direction) {
  if (direction === "east") {
    return "向东";
  }
  if (direction === "west") {
    return "向西";
  }
  return "无明显时差";
}

function toMinutes(timeValue) {
  const [hour, minute] = timeValue.split(":").map(Number);
  return hour * 60 + minute;
}

function minutesToTime(totalMinutes) {
  const normalized = wrapMinutes(totalMinutes);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${pad(hours)}:${pad(minutes)}`;
}

function wrapMinutes(value) {
  const fullDay = 24 * 60;
  return ((Math.round(value) % fullDay) + fullDay) % fullDay;
}

function formatWindow(start, end) {
  return `${minutesToTime(start)} - ${minutesToTime(end)}`;
}

function minutesDistance(a, b) {
  const raw = Math.abs(wrapMinutes(a) - wrapMinutes(b));
  return Math.min(raw, 24 * 60 - raw);
}

function pad(value) {
  return String(value).padStart(2, "0");
}
