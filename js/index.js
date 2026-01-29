const supabaseClient = supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY,
);

const projectsEl = document.getElementById("projects");
const emptyEl = document.getElementById("empty");
const errEl = document.getElementById("err");
const newProjectBtn = document.getElementById("newProjectBtn");

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function getProjectStats(projectId) {
  const { data, error } = await supabaseClient
    .from("reviews")
    .select("status")
    .eq("project_id", projectId);

  if (error) return { total: 0, approved: 0, waiting: 0 };
  const total = data.length;
  const approved = data.filter((r) => r.status === "approved").length;
  const waiting = total - approved; // MVP: needs_changes counts as waiting
  return { total, approved, waiting };
}

async function renderProjects() {
  errEl.style.display = "none";
  emptyEl.style.display = "none";
  projectsEl.innerHTML = "";

  const { data: projects, error } = await supabaseClient
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    errEl.style.display = "block";
    errEl.textContent = "Error loading projects: " + error.message;
    return;
  }

  if (!projects || projects.length === 0) {
    emptyEl.style.display = "block";
    return;
  }

  for (const p of projects) {
    const stats = await getProjectStats(p.id);

    let dotClass = "yellow";
    let label = `${stats.waiting} waiting`;
    if (stats.total > 0 && stats.waiting === 0) {
      dotClass = "green";
      label = `${stats.approved} approved`;
    }

    const card = document.createElement("div");
    card.className = "projectCard";
    card.innerHTML = `
      <div class="projectLeft">
        <div class="projectTitle">${escapeHtml(p.name)}</div>
        <div class="projectMetaRow">
          <span class="metaItem">${stats.total} files</span>
          <span class="metaItem"><span class="dot ${dotClass}"></span>${label}</span>
        </div>
      </div>
      <a class="btn openBtn" href="project.html?pid=${p.id}">Open</a>
    `;
    projectsEl.appendChild(card);
  }
}

newProjectBtn.addEventListener("click", async () => {
  const name = prompt("Project name:", "Brand Identity — Nordisk Kaffe");
  if (!name || !name.trim()) return;

  const { data, error } = await supabaseClient
    .from("projects")
    .insert({ name: name.trim() })
    .select()
    .single();

  if (error) {
    alert("Error creating project: " + error.message);
    return;
  }

  location.href = `project.html?pid=${data.id}`;
});

renderProjects();
