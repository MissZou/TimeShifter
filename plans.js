const SUPABASE_CONFIG_KEY = "timeshifter-supabase-config";

const plansStatus = document.getElementById("plans-status");
const plansList = document.getElementById("plans-list");
const backHomeButton = document.getElementById("back-home");
const refreshPlansButton = document.getElementById("refresh-plans");

let supabaseClient = null;

bootstrapPlansPage();

function bootstrapPlansPage() {
  backHomeButton.addEventListener("click", () => {
    window.location.href = "index.html";
  });
  refreshPlansButton.addEventListener("click", loadPlans);

  const config = readSupabaseConfig();
  if (!config) {
    plansStatus.textContent = "未发现 Supabase 配置，请先回到主页连接云端。";
    renderEmpty("尚未配置云端", "请返回主页完成 Supabase 连接，即可在此查看所有已保存计划。");
    return;
  }

  supabaseClient = window.supabase.createClient(config.url, config.anonKey);
  loadPlans();
}

function readSupabaseConfig() {
  const raw = localStorage.getItem(SUPABASE_CONFIG_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed.url || !parsed.anonKey) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn("Failed to parse supabase config", error);
    return null;
  }
}

async function loadPlans() {
  if (!supabaseClient) {
    plansStatus.textContent = "Supabase 未初始化。";
    return;
  }

  plansStatus.textContent = "正在加载计划列表...";
  plansList.replaceChildren();

  const { data, error } = await supabaseClient
    .from("plans")
    .select("id, created_at, title, content, meta")
    .order("created_at", { ascending: false });

  if (error) {
    plansStatus.textContent = `加载失败：${error.message}`;
    return;
  }

  if (!data || data.length === 0) {
    plansStatus.textContent = "";
    renderEmpty("暂无已保存计划", "生成并保存第一份计划后，它将出现在这里。");
    return;
  }

  plansStatus.innerHTML = "";
  const badge = document.createElement("span");
  badge.className = "plan-count-badge";
  badge.textContent = `共 ${data.length} 份计划`;
  plansStatus.append(badge);

  const fragments = data.map((item, index) => createPlanCard(item, index));
  plansList.replaceChildren(...fragments);
}

function renderEmpty(title, description) {
  plansList.replaceChildren();
  const box = document.createElement("div");
  box.className = "plans-empty";
  box.innerHTML = `
    <div class="plans-empty-icon">✈</div>
    <p class="plans-empty-text"><strong>${title}</strong><br>${description}</p>
  `;
  plansList.append(box);
}

function createPlanCard(item, index) {
  const card = document.createElement("article");
  card.className = "plan-item";
  card.style.animationDelay = `${index * 60}ms`;

  const top = document.createElement("div");
  top.className = "plan-item-top";

  const header = document.createElement("div");
  header.className = "plan-item-header";

  const title = document.createElement("h3");
  title.className = "plan-item-title";
  title.textContent = item.title || "未命名计划";

  const date = document.createElement("span");
  date.className = "plan-item-date";
  date.textContent = formatDate(item.created_at);

  header.append(title, date);
  top.append(header);

  const meta = item.meta && typeof item.meta === "object" ? item.meta : {};

  if (meta.originTimezone || meta.destinationTimezone) {
    const route = document.createElement("div");
    route.className = "plan-item-route";
    const originCity = timezoneCityLabel(meta.originTimezone);
    const destCity = timezoneCityLabel(meta.destinationTimezone);
    route.innerHTML = `<span>${originCity}</span><span class="plan-item-route-arrow">→</span><span>${destCity}</span>`;
    top.append(route);
  }

  const pills = document.createElement("div");
  pills.className = "plan-item-grid";

  const directionPill = createPill("方向", formatDirection(meta.direction), getDirectionIcon(meta.direction));
  directionPill.classList.add("pill-direction");
  pills.append(
    directionPill,
    createPill("时差", formatHours(meta.absoluteDifference), "⏱"),
    createPill("准备", formatDays(meta.prepDays), "📅"),
    createPill("恢复", formatDays(meta.recoveryDays), "🔄")
  );

  const content = document.createElement("pre");
  content.className = "plan-item-content";
  content.textContent = simplifyContent(item.content || "");

  card.append(top, pills, content);
  return card;
}

function timezoneCityLabel(zone) {
  if (!zone) return "未知";
  const parts = zone.split("/");
  const city = parts[parts.length - 1] || zone;
  return city.replaceAll("_", " ");
}

function getDirectionIcon(direction) {
  if (direction === "east") return "🧭";
  if (direction === "west") return "🧭";
  return "—";
}

function formatDate(raw) {
  if (!raw) {
    return "";
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "今天 " + date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  if (diffDays === 1) {
    return "昨天 " + date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  if (diffDays < 7) {
    return `${diffDays} 天前`;
  }
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function createPill(label, value, icon) {
  const node = document.createElement("div");
  node.className = "plan-pill";
  const k = document.createElement("span");
  k.textContent = label;
  const v = document.createElement("strong");
  v.textContent = icon ? `${icon} ${value}` : value;
  node.append(k, v);
  return node;
}

function formatDirection(direction) {
  if (direction === "east") return "东行";
  if (direction === "west") return "西行";
  if (direction === "none") return "无明显时差";
  return "-";
}

function formatHours(value) {
  if (typeof value !== "number") return "-";
  return `${value.toFixed(1)}h`;
}

function formatDays(value) {
  if (typeof value !== "number") return "-";
  return `${value} 天`;
}

function simplifyContent(raw) {
  const lines = raw.split("\n").filter(Boolean);
  return lines.join("\n");
}
