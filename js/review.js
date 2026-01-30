// js/review.js
const supabaseClient = supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY,
);

const params = new URLSearchParams(location.search);
const reviewId = params.get("id");
const key = params.get("k");

const stage = document.getElementById("stage");
const hintEl = document.getElementById("hint");
const backLink = document.getElementById("backLink");

const statusPill = document.getElementById("statusPill");
const statusText = document.getElementById("statusText");
const approveBtn = document.getElementById("approveBtn");
const changesBtn = document.getElementById("changesBtn");
const removeBtn = document.getElementById("removeBtn");

let tooltipEl = null;
let currentReview = null;

/* ---------- utils ---------- */

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

/* ---------- render asset ---------- */

function renderAsset(url, type) {
  stage.innerHTML = "";

  let el;
  if (type === "image") {
    el = document.createElement("img");
    el.src = url;
  } else if (type === "video") {
    el = document.createElement("video");
    el.src = url;
    el.controls = true;
    el.playsInline = true;
  } else {
    el = document.createElement("iframe");
    el.src = url;
  }

  stage.appendChild(el);
}

/* ---------- comments ---------- */

function clearPins() {
  stage.querySelectorAll(".pin, .tooltip").forEach((el) => el.remove());
  tooltipEl = null;
}

function showTooltip(x, y, text, createdAt) {
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.className = "tooltip";
    stage.appendChild(tooltipEl);
  }

  tooltipEl.style.left = x + "px";
  tooltipEl.style.top = y + "px";
  tooltipEl.innerHTML = `
    <div>${escapeHtml(text)}</div>
    <div style="color:var(--muted);margin-top:6px;font-size:11px;">
      ${new Date(createdAt).toLocaleString()}
    </div>
  `;
  tooltipEl.style.opacity = "1";

  setTimeout(() => {
    if (tooltipEl) tooltipEl.style.opacity = "0";
  }, 1600);
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

  if (error) {
    hintEl.textContent = "Error: " + error.message;
    return;
  }

  await loadComments();
}

/* ---------- review ---------- */

async function loadReview() {
  if (!reviewId) {
    hintEl.textContent = "Missing review id (?id=...)";
    return;
  }

  hintEl.textContent = "Loading…";

  const { data, error } = await supabaseClient
    .from("reviews")
    .select("*")
    .eq("id", reviewId)
    .single();

  if (error || !data) {
    hintEl.textContent = "Review not found.";
    return;
  }

  currentReview = data;

  // back link
  if (data.project_id && key) {
    backLink.href = `project.html?pid=${data.project_id}&k=${encodeURIComponent(
      key,
    )}`;
    backLink.textContent = "← Back to project";
  } else {
    backLink.href = "index.html";
    backLink.textContent = "← Back";
  }

  renderAsset(data.file_url, data.file_type);
  setStatus(data.status);
  hintEl.textContent = "Klik på filen for at efterlade feedback.";
}

async function updateStatus(nextStatus) {
  const { error } = await supabaseClient
    .from("reviews")
    .update({ status: nextStatus })
    .eq("id", reviewId);

  if (error) {
    hintEl.textContent = "Error: " + error.message;
    return;
  }

  setStatus(nextStatus);
}

/* ---------- delete ---------- */

if (removeBtn) {
  removeBtn.addEventListener("click", async () => {
    if (!key) {
      hintEl.textContent = "Missing key (k=...). Cannot delete.";
      return;
    }

    if (!confirm("Remove this file and all comments?")) return;

    const { error } = await supabaseClient.rpc("delete_review_with_key", {
      p_review_id: reviewId,
      p_access_key: key,
    });

    if (error) {
      hintEl.textContent = "Delete error: " + error.message;
      return;
    }

    // go back
    if (currentReview?.project_id) {
      location.href = `project.html?pid=${currentReview.project_id}&k=${encodeURIComponent(
        key,
      )}`;
    } else {
      location.href = "index.html";
    }
  });
}

/* ---------- events ---------- */

stage.addEventListener("click", async (e) => {
  try {
    await addCommentAt(e.clientX, e.clientY);
  } catch (err) {
    hintEl.textContent = "Error: " + (err?.message || err);
  }
});

approveBtn.addEventListener("click", () => updateStatus("approved"));
changesBtn.addEventListener("click", () => updateStatus("needs_changes"));

window.addEventListener("resize", loadComments);

/* ---------- init + realtime ---------- */

(async () => {
  await loadReview();
  await loadComments();

  supabaseClient
    .channel("rt-review-" + reviewId)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "comments",
        filter: `review_id=eq.${reviewId}`,
      },
      loadComments,
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
          .select("status")
          .eq("id", reviewId)
          .single();
        if (data) setStatus(data.status);
      },
    )
    .subscribe();
})();
