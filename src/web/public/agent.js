async function loadAgents() {
  const configPath = document.querySelector('[name=configPath]').value.trim();
  const q = configPath ? `?configPath=${encodeURIComponent(configPath)}` : "";
  const res = await fetch(`/api/config${q}`);
  const data = await res.json();
  const sel = document.getElementById("agentSelect");
  sel.innerHTML = "";
  const names = Object.keys(data.config?.agents || {}).sort();
  if (!names.length) {
    sel.innerHTML = '<option value="">(无 agent — 请先在配置页添加)</option>';
    return;
  }
  for (const n of names) {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent =
      n === data.config.default ? `${n} (默认)` : n;
    sel.appendChild(opt);
  }
  if (data.config.default && names.includes(data.config.default)) {
    sel.value = data.config.default;
  }
}

document.querySelector('[name=configPath]')?.addEventListener("change", loadAgents);
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