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
    const li = document.createElement("li");
    li.innerHTML = `<span><strong>${n}</strong> ${a.id}</span>
      <button type="button" data-del="${n}" class="secondary" style="margin:0;padding:0.25rem 0.5rem;">删除</button>`;
    ul.appendChild(li);
  }
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