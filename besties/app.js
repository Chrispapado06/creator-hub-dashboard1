/* Renders the page from data.json — edit content in the /admin panel, not here. */
(function () {
  "use strict";

  var AGE_KEY = "besties-age-confirmed";
  var pendingLink = null;
  var SITE = null;

  function el(id) { return document.getElementById(id); }

  function openLink(url) {
    if (!url) return;
    window.open(url, "_blank", "noopener");
  }

  function requestOpen(url) {
    if (!SITE.ageGate || localStorage.getItem(AGE_KEY) === "yes") {
      openLink(url);
      return;
    }
    pendingLink = url;
    el("age-scrim").hidden = false;
  }

  function closeAgeGate() {
    pendingLink = null;
    el("age-scrim").hidden = true;
  }

  /* image (with gradient-initial fallback) inside a container */
  function buildImage(container, creator) {
    if (creator.image) {
      var img = document.createElement("img");
      img.alt = creator.name + " portrait";
      img.src = creator.image;
      img.onerror = function () {
        img.remove();
        buildFallback(container, creator);
      };
      container.appendChild(img);
    } else {
      buildFallback(container, creator);
    }
    if (creator.isNew) {
      var badge = document.createElement("span");
      badge.className = "new-badge";
      badge.textContent = "NEW";
      container.appendChild(badge);
    }
  }

  function buildFallback(container, creator) {
    var fb = document.createElement("span");
    fb.className = "image-fallback";
    fb.textContent = (creator.name || "?").charAt(0).toUpperCase();
    container.insertBefore(fb, container.firstChild);
  }

  function render(data) {
    SITE = data.SITE || {};
    var CREATORS = Array.isArray(data.CREATORS) ? data.CREATORS : [];

    /* ---------- intro / footer text ---------- */
    document.title = SITE.title || "";
    el("pill").textContent = SITE.pill || "";
    el("tagline").textContent = SITE.tagline || "";
    el("headline-plain").textContent = (SITE.headlinePlain || "") + " ";
    el("headline-highlight").textContent = SITE.headlineHighlight || "";
    el("headline-emoji").textContent = " " + (SITE.headlineEmoji || "");
    el("subtitle").textContent = SITE.subtitle || "";
    el("footer-note").textContent = SITE.footerNote || "";
    var support = el("support-link");
    if (SITE.supportEmail) {
      support.textContent = SITE.supportEmail;
      support.href = "mailto:" + SITE.supportEmail;
    } else {
      support.hidden = true;
    }

    /* ---------- featured card ---------- */
    var featured = CREATORS.find(function (c) { return c.featured; }) || CREATORS[0];
    var featureCard = el("feature-card");

    if (featured) {
      var media = document.createElement("button");
      media.type = "button";
      media.className = "feature-media";
      media.setAttribute("aria-label", "Open " + featured.name + "'s profile");
      buildImage(media, featured);
      media.addEventListener("click", function () { requestOpen(featured.link); });

      var copy = document.createElement("div");
      copy.className = "feature-copy";

      var h2 = document.createElement("h2");
      h2.textContent = featured.name;
      copy.appendChild(h2);

      if (featured.hook) {
        var hook = document.createElement("p");
        hook.className = "feature-hook";
        hook.textContent = featured.hook;
        copy.appendChild(hook);
      }

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "profile-button";
      btn.textContent = SITE.featuredButtonText || "Open Profile →";
      btn.addEventListener("click", function () { requestOpen(featured.link); });
      copy.appendChild(btn);

      featureCard.appendChild(media);
      featureCard.appendChild(copy);
    } else {
      featureCard.hidden = true;
    }

    /* ---------- roster ---------- */
    var roster = el("roster");
    CREATORS.forEach(function (creator) {
      if (creator === featured) return;

      var article = document.createElement("article");
      article.className = "model-card";

      var link = document.createElement("button");
      link.type = "button";
      link.className = "model-link";
      link.setAttribute("aria-label", "Open " + creator.name + "'s profile");

      var imageWrap = document.createElement("span");
      imageWrap.className = "card-image";
      buildImage(imageWrap, creator);
      link.appendChild(imageWrap);

      var name = document.createElement("strong");
      name.textContent = creator.name;
      link.appendChild(name);

      link.addEventListener("click", function () { requestOpen(creator.link); });

      article.appendChild(link);
      roster.appendChild(article);
    });

    /* ---------- sticky CTA ---------- */
    var sticky = el("sticky-cta");
    if (featured && SITE.stickyCtaText) {
      sticky.textContent = SITE.stickyCtaText.replace("{name}", featured.name);
      sticky.addEventListener("click", function () { requestOpen(featured.link); });
    } else {
      sticky.hidden = true;
    }

    /* ---------- age gate ---------- */
    el("age-title").textContent = SITE.ageGateTitle || "Are you 18 or older?";
    el("age-text").textContent = SITE.ageGateText || "";
    el("age-confirm").textContent = SITE.ageGateConfirm || "Yes";
    el("age-cancel").textContent = SITE.ageGateCancel || "No";

    el("age-confirm").addEventListener("click", function () {
      localStorage.setItem(AGE_KEY, "yes");
      var url = pendingLink;
      closeAgeGate();
      openLink(url);
    });
    el("age-cancel").addEventListener("click", closeAgeGate);
    el("age-close").addEventListener("click", closeAgeGate);
    el("age-scrim").addEventListener("click", function (e) {
      if (e.target === el("age-scrim")) closeAgeGate();
    });
  }

  fetch("data.json", { cache: "no-store" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(render)
    .catch(function (err) {
      document.body.insertAdjacentHTML(
        "afterbegin",
        '<p style="text-align:center;padding:40px;font-weight:800">Could not load data.json (' +
          String(err.message).replace(/[<>&]/g, "") +
          ")</p>"
      );
    });
})();
