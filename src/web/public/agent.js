async function loadAgents() {
  const configPath = document.querySelector('[name=configPath]').value.trim();
  const q = configPath ? `?configPath=${encodeURIComponent(configPath)}` : "";
  const res = await fetch(`/api/config${q}`);
  const data = await res.json();
  const sel = document.getElementById("agentSelect");
  sel.innerHTML = "";
  const entries = Object.entries(data.config?.agents || {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const showDisabled = document.getElementById("showDisabled")?.checked ?? false;
  const visible = showDisabled
    ? entries
    : entries.filter(([, agent]) => agent.enabled !== false);
  if (!entries.length) {
    sel.innerHTML = '<option value="">(无 agent — 请先在配置页添加)</option>';
    return;
  }
  if (!visible.length) {
    sel.innerHTML =
      '<option value="">(没有启用 agent — 可勾选显示禁用项查看)</option>';
    return;
  }
  for (const [n, agent] of visible) {
    const enabled = agent.enabled !== false;
    const opt = document.createElement("option");
    opt.value = n;
    opt.disabled = !enabled;
    const suffixes = [];
    if (n === data.config.default) suffixes.push("默认");
    if (!enabled) suffixes.push("禁用");
    opt.textContent = suffixes.length ? `${n} (${suffixes.join(" / ")})` : n;
    sel.appendChild(opt);
  }
  const enabledNames = visible
    .filter(([, agent]) => agent.enabled !== false)
    .map(([name]) => name);
  if (data.config.default && enabledNames.includes(data.config.default)) {
    sel.value = data.config.default;
  } else if (enabledNames.length) {
    sel.value = enabledNames[0];
  }
}

document.querySelector('[name=configPath]')?.addEventListener("change", loadAgents);
document.getElementById("showDisabled")?.addEventListener("change", loadAgents);
loadAgents();

document.getElementById("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const out = document.getElementById("out");
  out.textContent = "请求中…";
  const fd = new FormData(e.target);
  const body = {
    configPath: fd.get("configPath")?.toString().trim() || undefined,
    agentName: fd.get("agent")?.toString(),
    input: fd.get("input")?.toString() || "",
    conversationKey: fd.get("conversationKey")?.toString().trim() || undefined,
    idempotencyKey: fd.get("idempotencyKey")?.toString().trim() || undefined,
  };
  try {
    const res = await fetch("/api/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    out.textContent = JSON.stringify(data, null, 2);
    out.className = res.ok ? "out ok" : "out err";
  } catch (err) {
    out.textContent = String(err);
    out.className = "out err";
  }
});