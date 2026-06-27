let state = { path: null, config: null };

function render() {
  const c = state.config;
  if (!c) return;
  document.getElementById("configPath").textContent = state.path
    ? `配置: ${state.path}`
    : "配置: (内存，保存后写入磁盘)";
  document.querySelector("#globalForm [name=baseUrl]").value =
    c.baseUrl || "https://api.chatgpt.com";
  document.querySelector("#globalForm [name=tokenEnv]").value =
    c.tokenEnv || "GPT_AGENT_ACCESS_TOKEN";
  document.querySelector("#globalForm [name=default]").value = c.default || "";
  const ul = document.getElementById("agentList");
  ul.innerHTML = "";
  for (const [n, a] of Object.entries(c.agents || {}).sort()) {
    const enabled = a.enabled !== false;
    const li = document.createElement("li");
    li.className = enabled ? "agent-row" : "agent-row muted-row";

    const main = document.createElement("span");
    main.className = "agent-main";
    const title = document.createElement("strong");
    title.textContent = n;
    const id = document.createElement("span");
    id.className = "agent-id";
    id.textContent = a.id;
    const status = document.createElement("span");
    status.className = enabled ? "pill" : "pill off";
    status.textContent = enabled ? "启用" : "禁用";
    main.append(title, document.createTextNode(" "), id, status);

    const actions = document.createElement("span");
    actions.className = "actions";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "secondary compact";
    toggle.dataset.toggle = n;
    toggle.textContent = enabled ? "禁用" : "启用";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary compact";
    remove.dataset.del = n;
    remove.textContent = "删除";
    actions.append(toggle, remove);
    li.append(main, actions);
    ul.appendChild(li);
  }
  ul.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const name = btn.getAttribute("data-toggle");
      const profile = name ? state.config.agents[name] : null;
      if (!name || !profile) return;
      const config = { ...state.config, agents: { ...state.config.agents } };
      config.agents[name] = { ...profile, enabled: profile.enabled === false };
      await apiSave({ config });
    });
  });
  ul.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const name = btn.getAttribute("data-del");
      if (!confirm(`删除 ${name}？`)) return;
      await apiSave({ removeAgent: name });
    });
  });
}

async function apiLoad() {
  const res = await fetch("/api/config");
  state = await res.json();
  render();
}

async function apiSave(patch) {
  const res = await fetch("/api/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...patch, config: patch.config ?? state.config }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  state = data;
  render();
  document.getElementById("out").textContent = "已保存";
}

document.getElementById("globalForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const config = { ...state.config };
  config.baseUrl = fd.get("baseUrl")?.toString();
  config.tokenEnv = fd.get("tokenEnv")?.toString();
  config.default = fd.get("default")?.toString() || undefined;
  await apiSave({ config });
});

document.getElementById("addForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const name = fd.get("name")?.toString().trim();
  const config = { ...state.config, agents: { ...state.config.agents } };
  config.agents[name] = {
    id: fd.get("id")?.toString().trim(),
    description: fd.get("description")?.toString().trim() || undefined,
    tokenEnv: fd.get("tokenEnv")?.toString().trim() || undefined,
    enabled: fd.get("enabled") === "on",
  };
  await apiSave({ config });
  e.target.reset();
});

document.getElementById("reload").addEventListener("click", apiLoad);
document.getElementById("doctor").addEventListener("click", async () => {
  const res = await fetch("/api/doctor");
  const data = await res.json();
  document.getElementById("out").textContent = JSON.stringify(data, null, 2);
});

apiLoad();