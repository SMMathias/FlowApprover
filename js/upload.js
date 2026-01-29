<!doctype html>
<html lang="da">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Flow Approver — Upload</title>
  <link rel="stylesheet" href="css/upload.css" />
</head>
<body>
  <div class="page">
    <header class="topbar">
      <div class="topbarInner">
        <div class="brand">
          <div class="brandIcon">▢</div>
          <div class="brandTitle">Review</div>
        </div>
        <a class="btn pill" href="index.html">Back</a>
      </div>
    </header>

    <main class="content">
      <div class="h1">New Upload</div>

      <div class="panel">
        <div id="dropzone" class="dropzone">
          <div class="dzIcon">⤒</div>
          <div class="dzTitle">Drag file here or click to upload</div>
          <div class="dzSub">Image / Video / PDF</div>
          <input id="fileInput" type="file" accept="image/*,application/pdf,video/*" />
        </div>

        <div class="row">
          <button id="uploadBtn" class="btn primary pill">Upload & create link</button>
          <button id="copyBtn" class="btn pill" disabled>Copy link</button>
        </div>

        <div id="out" class="out"></div>
        <div id="hint" class="hint"></div>
      </div>
    </main>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="js/config.js"></script>
  <script src="js/upload.js"></script>
</body>
</html>
