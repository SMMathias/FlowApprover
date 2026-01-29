const supabaseClient = supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY,
);

const params = new URLSearchParams(location.search);
const reviewId = params.get("id");

const stage = document.getElementById("stage");
const hintEl = document.getElementById("hint");
const backLink = document.getElementById("backLink");

const statusPill = document.getElementById("statusPill");
const statusText = document.getElementById("statusText");
const approveBtn = document.getElementById("approveBtn");
const changesBtn = document.getElementById("changesBtn");

let tooltipEl = null;

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(status) {
  statusPill.classList.remove("approved", "changes", "waiting");
  if (status === "approved") {
    statusPill.classList.add("approved");
    statusText.textContent = "Approved";
  } else {
    statusPill.classList.add("changes");
    statusText.textContent = "Needs changes";
  }
}

function renderAsset(fileUrl, fileType) {
  stage.innerHTML = "";

  let el;
  if (fileType === "image") {
    el = document.createElement("img");
    el.src = fileUrl;
    el.alt = "Upload";
  } else if (fileType === "video") {
    el = document.createElement("video");
    el.src = fileUrl;
    el.controls = true;
    el.playsInline = true;
  } else {
    el = document.createElement("iframe");
    el.src = fileUrl;
  }
  stage.appendChild(el);
}

function clearPins() {
  stage.querySelectorAll(".pin, .tooltip").forEach((el) => el.remove());
  tooltipEl = null;
}

function showTooltip(xPx, yPx, text, createdAt) {
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.className = "tooltip";
    stage.appendChild(tooltipEl);
  }
  tooltipEl.style.left = xPx + "px";
  tooltipEl.style.top = yPx + "px";
  tooltipEl.innerHTML = `
    <div>${escapeHtml(text)}</div>
    <div style="color:var(--muted); margin-top:6px; font-size:11px;">
      ${new Date(createdAt).toLocaleString()}
    </div>
  `;
  tooltipEl.style.opacity = "1";
  setTimeout(() => {
    if (tooltipEl) tooltipEl.style.opacity = "0";
  }, 1600);
}

async function loadReview() {
  if (!reviewId) {
    hintEl.textContent = "Missing ?id= in URL";
    approveBtn.disabled = true;
    changesBtn.disabled = true;
    return;
  }

  hintEl.textContent = "Loading…";

  const { data: review, error } = await supabaseClient
    .from("reviews")
    .select("*")
    .eq("id", reviewId)
    .single();

  if (error) {
    hintEl.textContent = "Error: " + error.message;
    return;
  }

  // ✅ Back-to-project patch
  if (review.project_id) {
    backLink.href = `project.html?pid=${review.project_id}`;
    backLink.textContent = "← Back to project";
  } else {
    backLink.href = "index.html";
    backLink.textContent = "← Back";
  }

  renderAsset(review.file_url, review.file_type);
  setStatus(review.status);
  hintEl.textContent = "Klik på filen for at efterlade feedback.";
}

async function loadComments() {
  const { data, error } = await supabaseClient
    .from("comments")
    .select("*")
    .eq("review_id", reviewId)
    .order("created_at", { ascending: true });

  if (error) {
    hintEl.textContent = "Error loading comments: " + error.message;
    return;
  }

  clearPins();
  const rect = stage.getBoundingClientRect();

  for (const c of data) {
    const pin = document.createElement("div");
    pin.className = "pin";
    pin.style.left = c.x * rect.width + "px";
    pin.style.top = c.y * rect.height + "px";

    pin.addEventListener("mouseenter", () => {
      showTooltip(c.x * rect.width, c.y * rect.height, c.text, c.created_at);
    });

    stage.appendChild(pin);
  }
}

async function addCommentAt(clientX, clientY) {
  const rect = stage.getBoundingClientRect();
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;

  const text = prompt("Skriv din kommentar:");
  if (!text || !text.trim()) return;

  const { error } = await supabaseClient.from("comments").insert({
    review_id: reviewId,
    x: Math.min(Math.max(x, 0), 1),
    y: Math.min(Math.max(y, 0), 1),
    text: text.trim(),
  });

  if (error) throw error;
  await loadComments();
}

async function updateReviewStatus(nextStatus) {
  const { data, error } = await supabaseClient
    .from("reviews")
    .update({ status: nextStatus })
    .eq("id", reviewId)
    .select()
    .single();

  if (error) {
    hintEl.textContent = "Error: " + error.message;
    return;
  }
  setStatus(data.status);
}

stage.addEventListener("click", async (e) => {
  try {
    await addCommentAt(e.clientX, e.clientY);
  } catch (err) {
    hintEl.textContent = "Error: " + (err?.message || err);
  }
});

approveBtn.addEventListener("click", () => updateReviewStatus("approved"));
changesBtn.addEventListener("click", () => updateReviewStatus("needs_changes"));

window.addEventListener("resize", () => loadComments());

(async () => {
  await loadReview();
  if (!reviewId) return;
  await loadComments();

  supabaseClient
    .channel("rt-review")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "comments",
        filter: `review_id=eq.${reviewId}`,
      },
      () => loadComments(),
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "reviews",
        filter: `id=eq.${reviewId}`,
      },
      async () => {
        const { data } = await supabaseClient
          .from("reviews")
          .select("*")
          .eq("id", reviewId)
          .single();
        if (data) setStatus(data.status);
      },
    )
    .subscribe();
})();
