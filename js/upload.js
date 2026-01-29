// js/upload.js
const supabaseClient = supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY,
);
const BUCKET = window.SUPABASE_BUCKET || "uploads";

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const copyBtn = document.getElementById("copyBtn");
const out = document.getElementById("out");
const hint = document.getElementById("hint");

let selectedFile = null;
let shareUrl = "";

// Optional: if upload.html is opened with ?k=..., we pass it to review link.
// (Useful if you want deletes/back to project in the review page in some flows.)
const params = new URLSearchParams(location.search);
const key = params.get("k");

function guessFileType(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type === "application/pdf") return "pdf";
  return "file";
}

function setSelected(file) {
  selectedFile = file;
  hint.textContent = file ? `Selected: ${file.name}` : "Pick a file.";
}

async function doUpload() {
  if (!selectedFile) {
    hint.textContent = "Pick a file first.";
    return;
  }

  hint.textContent = "Uploading…";
  out.style.display = "none";
  copyBtn.disabled = true;

  const ext = (selectedFile.name.split(".").pop() || "bin").toLowerCase();
  const storagePath = `${crypto.randomUUID()}.${ext}`;

  // 1) Upload to storage
  const { error: upErr } = await supabaseClient.storage
    .from(BUCKET)
    .upload(storagePath, selectedFile, { upsert: false });

  if (upErr) throw upErr;

  // 2) Public URL
  const { data: pub } = supabaseClient.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);
  const fileUrl = pub.publicUrl;

  // 3) Create review row (single-file flow)
  const { data: review, error: insErr } = await supabaseClient
    .from("reviews")
    .insert({
      file_url: fileUrl,
      file_type: guessFileType(selectedFile),
      status: "needs_changes",
      storage_path: storagePath,
    })
    .select("id")
    .single();

  if (insErr) throw insErr;

  // 4) Share link
  shareUrl = `${location.origin}/review.html?id=${review.id}`;
  if (key) shareUrl += `&k=${encodeURIComponent(key)}`;

  out.style.display = "block";
  out.textContent = shareUrl;
  copyBtn.disabled = false;
  hint.textContent = "Done. Send link to your client.";
}

if (dropzone && fileInput) {
  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.style.background = "#151515";
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.style.background = "#121212";
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.style.background = "#121212";
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setSelected(file);
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    setSelected(file);
  });
}

if (uploadBtn) {
  uploadBtn.addEventListener("click", async () => {
    try {
      await doUpload();
    } catch (err) {
      hint.textContent = "Upload error: " + (err?.message || err);
    }
  });
}

if (copyBtn) {
  copyBtn.addEventListener("click", async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    copyBtn.textContent = "Copied ✓";
    setTimeout(() => (copyBtn.textContent = "Copy link"), 1200);
  });
}

// Default hint
if (hint && !hint.textContent) hint.textContent = "Pick a file to upload.";
