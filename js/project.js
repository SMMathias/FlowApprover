// js/project.js
const supabaseClient = supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY,
);
const BUCKET = window.SUPABASE_BUCKET || "uploads";

const params = new URLSearchParams(location.search);
const projectId = params.get("pid");
const key = params.get("k");

const projectNameEl = document.getElementById("projectName");
const gridEl = document.getElementById("grid");
const hintEl = document.getElementById("hint");
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const shareBtn = document.getElementById("shareBtn");
const deleteProjectBtn = document.getElementById("deleteProjectBtn");

if (!projectId || !key) {
  projectNameEl.textContent = "Invalid link";
  if (dropzone) dropzone.style.display = "none";
  if (hintEl) hintEl.textContent = "Missing pid or key (k=...).";
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function guessFileType(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type === "application/pdf") return "pdf";
  return "file";
}

function statusTag(status) {
  if (status === "approved")
    return `<span class="tag approved">Approved</span>`;
  return `<span class="tag changes">Changes requested</span>`;
}

function fileNameFromUrl(url) {
  try {
    const last = (url || "").split("/").pop() || "file";
    return last.split("?")[0];
  } catch {
    return "file";
  }
}

async function loadProject() {
  if (!projectId || !key) return;

  const { data, error } = await supabaseClient
    .from("projects")
    .select("id,name,access_key,created_at")
    .eq("id", projectId)
    .eq("access_key", key)
    .single();

  if (error || !data) {
    projectNameEl.textContent = "Project not found";
    if (dropzone) dropzone.style.display = "none";
    hintEl.textContent = "Invalid project link (wrong key) or project deleted.";
    return false;
  }

  projectNameEl.textContent = data.name;
  return true;
}

async function loadFiles() {
  if (!projectId || !key) return;

  gridEl.innerHTML = "";
  hintEl.textContent = "Loading files…";

  const { data, error } = await supabaseClient
    .from("reviews")
    .select("id,file_url,file_type,status,created_at,project_id")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    hintEl.textContent = "Error: " + error.message;
    return;
  }

  if (!data || data.length === 0) {
    hintEl.textContent = "No files yet. Upload one above.";
    return;
  }

  hintEl.textContent = "";

  for (const r of data) {
    const card = document.createElement("div");
    card.className = "fileCard";

    const thumb = document.createElement("div");
    thumb.className = "thumb";

    if (r.file_type === "image") {
      thumb.innerHTML = `<img src="${escapeHtml(r.file_url)}" alt="preview" />`;
    } else if (r.file_type === "pdf") {
      thumb.textContent = "PDF Preview";
    } else if (r.file_type === "video") {
      thumb.textContent = "Video Preview";
    } else {
      thumb.textContent = "Preview";
    }

    const row = document.createElement("div");
    row.className = "fileRow";
    row.innerHTML = `
      <div class="fileName">${escapeHtml(fileNameFromUrl(r.file_url))}</div>
      ${statusTag(r.status)}
    `;

    card.appendChild(thumb);
    card.appendChild(row);

    // ✅ pass key into review so review can "Back to project" and delete file with RPC
    card.addEventListener("click", () => {
      location.href = `review.html?id=${r.id}&k=${encodeURIComponent(key)}`;
    });

    gridEl.appendChild(card);
  }
}

async function uploadFile(file) {
  if (!file) return;

  hintEl.textContent = "Uploading…";

  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const storagePath = `${crypto.randomUUID()}.${ext}`;

  // 1) upload to storage
  const { error: upErr } = await supabaseClient.storage
    .from(BUCKET)
    .upload(storagePath, file, { upsert: false });

  if (upErr) throw upErr;

  // 2) get public url
  const { data: pub } = supabaseClient.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);
  const fileUrl = pub.publicUrl;

  // 3) insert review linked to project + save storage_path so we can delete it later
  const { error: insErr } = await supabaseClient.from("reviews").insert({
    project_id: projectId,
    file_url: fileUrl,
    file_type: guessFileType(file),
    status: "needs_changes",
    storage_path: storagePath,
  });

  if (insErr) throw insErr;

  hintEl.textContent = "Done.";
  await loadFiles();
}

/* ===== UI events ===== */
if (dropzone && fileInput) {
  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.style.background = "#151515";
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.style.background = "#121212";
  });

  dropzone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropzone.style.background = "#121212";
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    try {
      await uploadFile(file);
    } catch (err) {
      hintEl.textContent = "Upload error: " + (err?.message || err);
    }
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    try {
      await uploadFile(file);
    } catch (err) {
      hintEl.textContent = "Upload error: " + (err?.message || err);
    } finally {
      fileInput.value = "";
    }
  });
}

if (shareBtn) {
  shareBtn.addEventListener("click", async () => {
    const link = `${location.origin}/project.html?pid=${projectId}&k=${encodeURIComponent(key)}`;
    await navigator.clipboard.writeText(link);
    shareBtn.textContent = "Copied ✓";
    setTimeout(() => (shareBtn.textContent = "⤴︎ Share client link"), 1200);
  });
}

if (deleteProjectBtn) {
  deleteProjectBtn.addEventListener("click", async () => {
    if (!projectId || !key) {
      hintEl.textContent = "Missing pid/key, can't delete.";
      return;
    }
    if (!confirm("Remove this entire project and ALL files/comments?")) return;

    hintEl.textContent = "Deleting project…";

    const { error } = await supabaseClient.rpc("delete_project_with_key", {
      p_project_id: projectId,
      p_access_key: key,
    });

    if (error) {
      hintEl.textContent = "Delete error: " + error.message;
      return;
    }

    location.href = "index.html";
  });
}

/* ===== init + realtime ===== */
(async () => {
  if (!projectId || !key) return;

  const ok = await loadProject();
  if (!ok) return;

  await loadFiles();

  // Realtime refresh on changes to this project's reviews
  supabaseClient
    .channel("rt-project-" + projectId)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "reviews",
        filter: `project_id=eq.${projectId}`,
      },
      () => loadFiles(),
    )
    .subscribe();
})();
