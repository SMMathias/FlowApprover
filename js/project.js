const supabaseClient = supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY,
);
const BUCKET = window.SUPABASE_BUCKET;

const params = new URLSearchParams(location.search);
const projectId = params.get("pid");

const projectNameEl = document.getElementById("projectName");
const gridEl = document.getElementById("grid");
const hintEl = document.getElementById("hint");
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const shareBtn = document.getElementById("shareBtn");

if (!projectId) {
  projectNameEl.textContent = "Missing project id (?pid=...)";
  dropzone.style.display = "none";
  hintEl.textContent = "Go back and open/create a project.";
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

async function loadProject() {
  const { data, error } = await supabaseClient
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (error) {
    projectNameEl.textContent = "Could not load project";
    hintEl.textContent = error.message;
    return;
  }
  projectNameEl.textContent = data.name;
}

async function loadFiles() {
  gridEl.innerHTML = "";
  hintEl.textContent = "Loading files…";

  const { data, error } = await supabaseClient
    .from("reviews")
    .select("*")
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

    const fileName = (r.file_url.split("/").pop() || "file").split("?")[0];

    const row = document.createElement("div");
    row.className = "fileRow";
    row.innerHTML = `
      <div class="fileName">${escapeHtml(fileName)}</div>
      ${statusTag(r.status)}
    `;

    card.appendChild(thumb);
    card.appendChild(row);

    card.addEventListener("click", () => {
      location.href = `review.html?id=${r.id}`;
    });

    gridEl.appendChild(card);
  }
}

async function uploadFile(file) {
  hintEl.textContent = "Uploading…";

  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabaseClient.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false });

  if (upErr) throw upErr;

  const { data: pub } = supabaseClient.storage.from(BUCKET).getPublicUrl(path);
  const fileUrl = pub.publicUrl;

  const { error: insErr } = await supabaseClient.from("reviews").insert({
    project_id: projectId,
    file_url: fileUrl,
    file_type: guessFileType(file),
    status: "needs_changes",
  });

  if (insErr) throw insErr;

  hintEl.textContent = "Done.";
  await loadFiles();
}

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

shareBtn.addEventListener("click", async () => {
  const link = `${location.origin}/project.html?pid=${projectId}`;
  await navigator.clipboard.writeText(link);
  shareBtn.textContent = "Copied ✓";
  setTimeout(() => (shareBtn.textContent = "⤴︎ Share client link"), 1200);
});

(async () => {
  if (!projectId) return;
  await loadProject();
  await loadFiles();

  supabaseClient
    .channel("rt-project")
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
