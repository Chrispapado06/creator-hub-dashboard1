/* Admin panel logic — loads data.json, edits it in memory, saves via /api/save. */
(function () {
  "use strict";

  var PW_KEY = "besties-admin-pw";
  var data = null;
  var dirty = false;
  var password = sessionStorage.getItem(PW_KEY) || "";

  function el(id) { return document.getElementById(id); }

  function authHeaders() {
    return { Authorization: "Bearer " + password };
  }

  function setStatus(text, cls) {
    var s = el("save-status");
    s.textContent = text;
    s.className = "save-status" + (cls ? " " + cls : "");
  }

  function markDirty() {
    if (!dirty) {
      dirty = true;
      setStatus("Unsaved changes", "dirty");
    }
  }

  /* ---------------- login ---------------- */

  function tryLogin(pw, onFail) {
    return fetch("/api/verify", { headers: { Authorization: "Bearer " + pw } })
      .then(function (r) {
        if (r.ok) {
          password = pw;
          sessionStorage.setItem(PW_KEY, pw);
          el("login-scrim").hidden = true;
          el("admin").hidden = false;
          load();
        } else if (onFail) {
          onFail();
        }
      })
      .catch(function () { if (onFail) onFail(); });
  }

  el("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    tryLogin(el("login-password").value, function () {
      el("login-error").hidden = false;
    });
  });

  /* ---------------- data load ---------------- */

  function load() {
    fetch("data.json", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        data = d;
        if (!data.SITE) data.SITE = {};
        if (!Array.isArray(data.CREATORS)) data.CREATORS = [];
        renderSite();
        renderCreators();
        setStatus("Loaded", "");
      })
      .catch(function (err) {
        setStatus("Could not load data.json: " + err.message, "error");
      });
  }

  /* ---------------- site settings ---------------- */

  var SITE_FIELDS = [
    { key: "title", label: "Browser tab title" },
    { key: "pill", label: "Top pill (e.g. Popular)" },
    { key: "tagline", label: "Text next to the pill" },
    { key: "headlinePlain", label: "Headline — dark part" },
    { key: "headlineHighlight", label: "Headline — pink part" },
    { key: "headlineEmoji", label: "Headline emoji" },
    { key: "subtitle", label: "Subtitle", wide: true },
    { key: "featuredButtonText", label: "Featured card button" },
    { key: "stickyCtaText", label: "Floating button ({name} = featured creator)" },
    { key: "footerNote", label: "Footer note", wide: true },
    { key: "supportEmail", label: "Support email" },
    { key: "ageGateTitle", label: "18+ popup title" },
    { key: "ageGateText", label: "18+ popup text", wide: true },
    { key: "ageGateConfirm", label: "18+ confirm button" },
    { key: "ageGateCancel", label: "18+ cancel button" },
  ];

  function renderSite() {
    var grid = el("site-grid");
    grid.innerHTML = "";

    SITE_FIELDS.forEach(function (f) {
      var label = document.createElement("label");
      if (f.wide) label.className = "wide";
      label.append(f.label);
      var input = document.createElement("input");
      input.type = "text";
      input.value = data.SITE[f.key] || "";
      input.addEventListener("input", function () {
        data.SITE[f.key] = input.value;
        markDirty();
      });
      label.appendChild(input);
      grid.appendChild(label);
    });

    var flag = document.createElement("label");
    flag.className = "flag wide";
    var check = document.createElement("input");
    check.type = "checkbox";
    check.checked = !!data.SITE.ageGate;
    check.addEventListener("change", function () {
      data.SITE.ageGate = check.checked;
      markDirty();
    });
    flag.appendChild(check);
    flag.append(" Ask “Are you 18 or older?” before opening links");
    grid.appendChild(flag);
  }

  /* ---------------- creators ---------------- */

  function renderCreators() {
    var list = el("creator-list");
    list.innerHTML = "";
    data.CREATORS.forEach(function (creator, index) {
      list.appendChild(buildCreatorCard(creator, index));
    });
  }

  function updateThumb(card, creator) {
    var img = card.querySelector(".creator-thumb img");
    var fb = card.querySelector(".thumb-fallback");
    fb.textContent = (creator.name || "?").charAt(0).toUpperCase();
    if (creator.image) {
      img.src = creator.image;
      img.hidden = false;
      img.onerror = function () { img.hidden = true; };
    } else {
      img.hidden = true;
    }
    card.classList.toggle("is-featured", !!creator.featured);
  }

  function buildCreatorCard(creator, index) {
    var card = document.getElementById("creator-template").content.firstElementChild.cloneNode(true);

    var nameInput = card.querySelector('[data-field="name"]');
    var linkInput = card.querySelector('[data-field="link"]');
    var imageInput = card.querySelector('[data-field="image"]');
    var hookInput = card.querySelector('[data-field="hook"]');
    var newCheck = card.querySelector('[data-field="isNew"]');
    var featRadio = card.querySelector('[data-field="featured"]');

    nameInput.value = creator.name || "";
    linkInput.value = creator.link || "";
    imageInput.value = creator.image || "";
    hookInput.value = creator.hook || "";
    newCheck.checked = !!creator.isNew;
    featRadio.checked = !!creator.featured;

    nameInput.addEventListener("input", function () {
      creator.name = nameInput.value;
      updateThumb(card, creator);
      markDirty();
    });
    linkInput.addEventListener("input", function () {
      creator.link = linkInput.value;
      markDirty();
    });
    imageInput.addEventListener("input", function () {
      creator.image = imageInput.value.trim();
      updateThumb(card, creator);
      markDirty();
    });
    hookInput.addEventListener("input", function () {
      creator.hook = hookInput.value;
      markDirty();
    });
    newCheck.addEventListener("change", function () {
      creator.isNew = newCheck.checked;
      markDirty();
    });
    featRadio.addEventListener("change", function () {
      data.CREATORS.forEach(function (c) { c.featured = false; });
      creator.featured = true;
      markDirty();
      renderCreators();
    });

    /* upload */
    var uploadBtn = card.querySelector(".upload-btn");
    var uploadInput = card.querySelector(".upload-input");
    uploadBtn.addEventListener("click", function () { uploadInput.click(); });
    uploadInput.addEventListener("change", function () {
      var file = uploadInput.files[0];
      if (!file) return;
      uploadBtn.textContent = "Uploading…";
      uploadBtn.disabled = true;
      fetch("/api/upload?name=" + encodeURIComponent(file.name), {
        method: "POST",
        headers: authHeaders(),
        body: file,
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.j.error || "Upload failed");
          creator.image = res.j.path;
          imageInput.value = res.j.path;
          updateThumb(card, creator);
          markDirty();
        })
        .catch(function (err) { alert("Upload failed: " + err.message); })
        .finally(function () {
          uploadBtn.textContent = "Upload…";
          uploadBtn.disabled = false;
          uploadInput.value = "";
        });
    });

    /* move / delete */
    card.querySelector(".move-up").addEventListener("click", function () {
      if (index === 0) return;
      data.CREATORS.splice(index, 1);
      data.CREATORS.splice(index - 1, 0, creator);
      markDirty();
      renderCreators();
    });
    card.querySelector(".move-down").addEventListener("click", function () {
      if (index === data.CREATORS.length - 1) return;
      data.CREATORS.splice(index, 1);
      data.CREATORS.splice(index + 1, 0, creator);
      markDirty();
      renderCreators();
    });
    card.querySelector(".delete-btn").addEventListener("click", function () {
      if (!confirm("Delete " + (creator.name || "this creator") + "?")) return;
      data.CREATORS.splice(index, 1);
      markDirty();
      renderCreators();
    });

    updateThumb(card, creator);
    return card;
  }

  el("add-creator").addEventListener("click", function () {
    data.CREATORS.push({ name: "", image: "", link: "", isNew: true });
    markDirty();
    renderCreators();
    var cards = el("creator-list").children;
    var last = cards[cards.length - 1];
    last.scrollIntoView({ behavior: "smooth", block: "center" });
    last.querySelector('[data-field="name"]').focus();
  });

  /* ---------------- save ---------------- */

  el("save-btn").addEventListener("click", function () {
    setStatus("Saving…", "");
    fetch("/api/save", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
      body: JSON.stringify(data),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
      .then(function (res) {
        if (res.status === 401) {
          sessionStorage.removeItem(PW_KEY);
          el("admin").hidden = true;
          el("login-scrim").hidden = false;
          setStatus("", "");
          return;
        }
        if (!res.ok) throw new Error(res.j.error || "Save failed");
        dirty = false;
        setStatus("Saved ✓", "saved");
      })
      .catch(function (err) { setStatus("Save failed: " + err.message, "error"); });
  });

  window.addEventListener("beforeunload", function (e) {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  /* ---------------- boot ---------------- */

  if (password) {
    tryLogin(password, function () {
      sessionStorage.removeItem(PW_KEY);
    });
  }
})();
