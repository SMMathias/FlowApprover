const supabaseClient = supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY,
);
const BUCKET = window.SUPABASE_BUCKET;

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const copyBtn = document.getElementById("copyBtn");
const out = document.getElementById("out");
const hint = document.getElementById("hint");

let selectedFile = null;
let shareUrl = "";

function guessFileType(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type === "application/pdf") return "pdf";
  return "file";
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
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabaseClient.storage
    .from(BUCKET)
    .upload(path, selectedFile, { upsert: false });
  if (upErr) throw upErr;

  const { data: pub } = supabaseClient.storage.from(BUCKET).getPublicUrl(path);
  const fileUrl = pub.publicUrl;

  const { data: review, error: insErr } = await supabaseClient
    .from("reviews")
    .insert({
      file_url: fileUrl,
      file_type: guessFileType(selectedFile),
      status: "needs_changes",
    })
    .select()
    .single();

  if (insErr) throw insErr;

  shareUrl = `${location.origin}/review.html?id=${review.id}`;
  out.style.display = "block";
  out.textContent = shareUrl;
  copyBtn.disabled = false;
  hint.textContent = "Done. Send link to your client.";
}

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
  selectedFile = file;
  hint.textContent = `Selected: ${file.name}`;
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  selectedFile = file;
  hint.textContent = `Selected: ${file.name}`;
});

uploadBtn.addEventListener("click", async () => {
  try {
    await doUpload();
  } catch (err) {
    hint.textContent = "Upload error: " + (err?.message || err);
  }
});

copyBtn.addEventListener("click", async () => {
  if (!shareUrl) return;
  await navigator.clipboard.writeText(shareUrl);
  copyBtn.textContent = "Copied ✓";
  setTimeout(() => (copyBtn.textContent = "Copy link"), 1200);
});
