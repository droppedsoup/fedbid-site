// fedbid.us Pro member dashboard: key check, saved searches, bid tracker, company profile and drafting tools.
// Everything a member saves stays in this browser (localStorage); Export/Import moves it to another device.
(function () {
  "use strict";
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var DAY = 864e5;
  function get(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function put(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* private mode */ } }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function daysLeft(b) { return b && b.d ? Math.max(0, Math.floor((Date.parse(b.d) - Date.now()) / DAY)) : null; }
  function fmtDate(iso) {
    if (!iso) return "Not listed";
    var d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  function today() { return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); }
  function download(name, type, text) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  var root = $("#dash");
  if (!root) return;
  var DATA = null, BY_ID = {};
  var STATUSES = ["Watching", "Preparing", "Submitted", "Won", "Lost", "Passed"];

  // ---------------- member key ----------------
  function sha256(text) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
    });
  }
  function checkKey(key) {
    key = (key || "").trim();
    if (!key) return Promise.resolve(false);
    return Promise.all([sha256(key), fetch("/members.json?t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.json(); })])
      .then(function (res) { return res[1].h.indexOf(res[0]) >= 0; })
      .catch(function () { return false; });
  }
  function unlock(key) {
    $("#gate-msg").textContent = "Checking your key...";
    checkKey(key).then(function (ok) {
      if (!ok) {
        $("#gate").hidden = false; $("#app").hidden = true;
        $("#gate-msg").innerHTML = "That key isn't active. New Pro keys switch on within about 15 minutes of signing up. " +
          "Still stuck? Reply to any FedBid email and we'll sort it out the same business day.";
        return;
      }
      put("fb_member", key);
      if (location.hash) history.replaceState(null, "", location.pathname);
      $("#gate").hidden = true; $("#app").hidden = false;
      start();
    });
  }
  $("#gate-form").addEventListener("submit", function (e) { e.preventDefault(); unlock($("#gate-key").value); });
  window.addEventListener("hashchange", function () {   // emailed link opened while the page was already open
    var k = (location.hash.match(/k=([A-Za-z0-9_-]+)/) || [])[1];
    if (k) { $("#gate-key").value = k; unlock(k); }
  });
  var fromLink = (location.hash.match(/k=([A-Za-z0-9_-]+)/) || [])[1];
  var saved = get("fb_member", "");
  if (fromLink || saved) { $("#gate-key").value = fromLink || saved; unlock(fromLink || saved); }
  $("#signout").addEventListener("click", function () {
    try { localStorage.removeItem("fb_member"); } catch (e) { /* ignore */ }
    location.reload();
  });

  // ---------------- tabs ----------------
  function show(tab) {
    $$(".dash-tabs button").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.tab === tab); });
    $$(".dash-panel").forEach(function (p) { p.hidden = p.id !== "p-" + tab; });
    put("fb_tab", tab);
    render(tab);
  }
  $$(".dash-tabs button").forEach(function (b) { b.addEventListener("click", function () { show(b.dataset.tab); }); });

  function start() {
    fetch("/bids.json").then(function (r) { return r.json(); }).then(function (data) {
      DATA = data;
      DATA.bids.forEach(function (b) { BY_ID[b.id] = b; });
      $("#updated").textContent = "Bid data updated " + fmtDate(DATA.updated);
      fillProfile();
      show(get("fb_tab", "overview"));
    }).catch(function () { $("#updated").textContent = "Couldn't load bids. Please refresh."; });
  }

  // ---------------- saved searches ----------------
  // Same matching rules as the Search bids page, applied to a saved query string.
  function matches(b, q) {
    var p = new URLSearchParams(q), now = Date.now();
    var kw = (p.get("q") || "").toLowerCase();
    if (kw && (b.ti + " " + b.ag + " " + b.c + " " + b.n).toLowerCase().indexOf(kw) < 0) return false;
    if (p.get("trade") && b.tr !== p.get("trade")) return false;
    if (p.get("state") && b.s !== p.get("state")) return false;
    if (p.get("agency") && b.ag !== p.get("agency")) return false;
    var list = function (k) { return p.get(k) ? p.get(k).split(",") : []; };
    if (list("naics").length && list("naics").indexOf(b.n) < 0) return false;
    if (list("type").length && list("type").indexOf(b.ty) < 0) return false;
    if (list("sa").length && list("sa").indexOf(b.sg) < 0) return false;
    if (p.get("due") && (!b.d || Date.parse(b.d) - now > +p.get("due") * DAY)) return false;
    if (p.get("posted") && (!b.p || now - Date.parse(b.p + "T00:00:00Z") > +p.get("posted") * DAY)) return false;
    return true;
  }
  function describe(q) {
    var p = new URLSearchParams(q), bits = [];
    if (p.get("q")) bits.push('"' + p.get("q") + '"');
    if (p.get("trade")) bits.push(DATA.trades[p.get("trade")] || p.get("trade"));
    if (p.get("naics")) bits.push("NAICS " + p.get("naics").replace(/,/g, ", "));
    if (p.get("state")) bits.push(p.get("state"));
    if (p.get("agency")) bits.push(p.get("agency"));
    if (p.get("sa")) bits.push(p.get("sa").replace(/,/g, ", "));
    if (p.get("due")) bits.push("due within " + p.get("due") + " days");
    return bits.join(" · ") || "All open bids";
  }
  function searchesHTML(compact) {
    var list = get("fb_searches", []);
    if (!list.length) return '<p class="muted">No saved searches yet. Build one on <a href="/bids.html">Search bids</a> and press ' +
      '<b>Save search</b>, or add one below.</p>';
    return '<ul class="dash-list">' + list.map(function (s, i) {
      var hits = DATA.bids.filter(function (b) { return matches(b, s.q); });
      var fresh = hits.filter(function (b) { return s.seen && s.seen.indexOf(b.id) < 0; }).length;
      return '<li><div class="grow"><b>' + esc(s.name) + "</b>" + (fresh ? ' <span class="tag new">' + fresh + " new</span>" : "") +
        '<div class="muted">' + esc(describe(s.q)) + " · " + hits.length + " open</div></div>" +
        '<a class="btn sm" data-open="' + i + '" href="/bids.html?' + esc(s.q) + '">Open</a>' +
        (compact ? "" : ' <button class="linkbtn" data-del-search="' + i + '">Delete</button>') + "</li>";
    }).join("") + "</ul>";
  }
  root.addEventListener("click", function (e) {
    var open = e.target.getAttribute("data-open");
    if (open !== null) {   // opening a saved search marks its current matches as seen
      var list = get("fb_searches", []), s = list[+open];
      if (s) { s.seen = DATA.bids.filter(function (b) { return matches(b, s.q); }).map(function (b) { return b.id; }); put("fb_searches", list); }
    }
    var del = e.target.getAttribute("data-del-search");
    if (del !== null) {
      var l = get("fb_searches", []); l.splice(+del, 1); put("fb_searches", l); render("searches");
    }
  });
  $("#add-search").addEventListener("submit", function (e) {
    e.preventDefault();
    var p = new URLSearchParams();
    ["q", "trade", "state"].forEach(function (k) { var v = $("#as-" + k).value.trim(); if (v) p.set(k, k === "state" ? v.toUpperCase() : v); });
    var q = p.toString(), list = get("fb_searches", []);
    list.push({ name: $("#as-name").value.trim() || describe(q), q: q,
      seen: DATA.bids.filter(function (b) { return matches(b, q); }).map(function (b) { return b.id; }) });
    put("fb_searches", list); this.reset(); render("searches");
  });

  // ---------------- tracker ----------------
  function tracked() { return get("fb_tracked", {}); }
  function track(id) {
    var t = tracked(), b = BY_ID[id];
    if (!t[id] && b) { t[id] = { status: "Watching", notes: "", added: new Date().toISOString(), bid: b }; put("fb_tracked", t); }
  }
  function trackerRows(filterSoon) {
    var t = tracked(), ids = Object.keys(t);
    ids.sort(function (a, b) { return (Date.parse(t[a].bid.d) || 9e15) - (Date.parse(t[b].bid.d) || 9e15); });
    if (filterSoon) ids = ids.filter(function (id) { var d = daysLeft(t[id].bid); return d !== null && d <= 14 && ["Won", "Lost", "Passed", "Submitted"].indexOf(t[id].status) < 0; });
    return ids.map(function (id) { var x = t[id]; x.bid = BY_ID[id] || x.bid; return x; });
  }
  function leftHTML(b) {
    var d = daysLeft(b);
    if (d === null) return '<span class="muted">No deadline listed</span>';
    var cls = d >= 14 ? "g" : d >= 7 ? "a" : "r";
    return '<span class="left ' + cls + '">' + (Date.parse(b.d) < Date.now() ? "Closed" : d + " day" + (d === 1 ? "" : "s") + " left") + "</span>";
  }
  function trackerHTML() {
    var rows = trackerRows(false);
    if (!rows.length) return '<p class="muted">You aren\'t tracking any bids yet. Press <b>Track</b> on any bid on ' +
      '<a href="/bids.html">Search bids</a>, or find one below.</p>';
    return '<ul class="bids">' + rows.map(function (x) {
      var b = x.bid;
      return '<li class="bid"><h3><a href="' + esc(b.u) + '" target="_blank" rel="noopener">' + esc(b.ti) + "</a></h3>" +
        '<div class="meta">' + esc(b.ag) + " · " + esc([b.c, b.s].filter(Boolean).join(", ") || "Location not listed") +
        " · NAICS " + esc(b.n) + (BY_ID[b.id] ? "" : " · <b>no longer open on SAM.gov</b>") + "</div>" +
        '<div class="row"><span>Due <b>' + fmtDate(b.d) + "</b></span>" + leftHTML(b) +
        '<label class="muted">Status <select data-status="' + esc(b.id) + '">' + STATUSES.map(function (s) {
          return "<option" + (s === x.status ? " selected" : "") + ">" + s + "</option>";
        }).join("") + "</select></label></div>" +
        '<textarea class="notes" data-notes="' + esc(b.id) + '" rows="2" placeholder="Notes: site visit date, questions sent, teaming partner...">' +
        esc(x.notes) + "</textarea>" +
        '<div class="row"><span class="acts"><button class="btn sm" data-draft="' + esc(b.id) + '">Draft response</button>' +
        '<button class="linkbtn" data-untrack="' + esc(b.id) + '">Stop tracking</button></span></div></li>';
    }).join("") + "</ul>";
  }
  root.addEventListener("change", function (e) {
    var id = e.target.getAttribute("data-status") || e.target.getAttribute("data-notes");
    if (!id) return;
    var t = tracked();
    if (!t[id]) return;
    if (e.target.hasAttribute("data-status")) t[id].status = e.target.value; else t[id].notes = e.target.value;
    put("fb_tracked", t);
  });
  root.addEventListener("click", function (e) {
    var un = e.target.getAttribute("data-untrack"), add = e.target.getAttribute("data-track"), dr = e.target.getAttribute("data-draft");
    if (un) { var t = tracked(); delete t[un]; put("fb_tracked", t); render("tracker"); }
    if (add) { track(add); e.target.textContent = "Tracking"; e.target.disabled = true; }
    if (dr) { put("fb_draft_bid", dr); show("draft"); }
  });
  $("#find").addEventListener("input", function () {
    var q = this.value.trim().toLowerCase(), t = tracked();
    var hits = q.length < 3 ? [] : DATA.bids.filter(function (b) {
      return (b.ti + " " + b.ag + " " + b.id + " " + b.c + " " + b.s).toLowerCase().indexOf(q) >= 0;
    }).slice(0, 8);
    $("#find-results").innerHTML = hits.map(function (b) {
      return '<li><div class="grow"><b>' + esc(b.ti) + '</b><div class="muted">' + esc(b.ag) + " · " + esc(b.s || "No location") +
        " · due " + fmtDate(b.d) + '</div></div><button class="btn sm ghost" data-track="' + esc(b.id) + '"' +
        (t[b.id] ? " disabled>Tracking" : ">Track") + "</button></li>";
    }).join("");
  });
  $("#csv").addEventListener("click", function () {
    var head = ["Title", "Agency", "State", "NAICS", "Due", "Status", "Notes", "Link"];
    var lines = [head].concat(trackerRows(false).map(function (x) {
      var b = x.bid; return [b.ti, b.ag, b.s, b.n, b.d, x.status, x.notes, b.u];
    })).map(function (r) { return r.map(function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }).join(","); });
    download("fedbid-tracked-bids.csv", "text/csv", lines.join("\r\n"));
  });

  // ---------------- company profile ----------------
  var FIELDS = ["company", "contact", "title", "phone", "email", "address", "website", "uei", "cage", "naics",
    "certs", "years", "core", "past", "diff"];
  function profile() { return get("fb_profile", {}); }
  function fillProfile() { var p = profile(); FIELDS.forEach(function (f) { var el = $("#pf-" + f); if (el) el.value = p[f] || ""; }); }
  $("#profile").addEventListener("input", function () {
    var p = {}; FIELDS.forEach(function (f) { p[f] = $("#pf-" + f).value; }); put("fb_profile", p);
    $("#pf-saved").textContent = "Saved on this device";
  });

  // ---------------- drafting ----------------
  function lines(text) { return String(text || "").split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean); }
  function bullet(list) { return list.map(function (s) { return "- " + s.replace(/^[-*•]\s*/, ""); }).join("\n"); }
  function need(p) {
    var missing = ["company", "contact", "email", "uei"].filter(function (f) { return !p[f]; });
    return missing.length ? "[Fill in your company profile tab to complete: " + missing.join(", ") + "]\n\n" : "";
  }
  function setAsideLine(b, p) {
    if (!b.sa) return "";
    return "This requirement is set aside (" + b.sa + "). " + (p.company || "[Company]") + " is eligible as " +
      (p.certs ? p.certs.split(/\n|,/)[0].trim() : "[your small business status]") + " and is registered in SAM.gov" +
      (p.uei ? " (UEI " + p.uei + ")" : "") + ".\n\n";
  }
  var DRAFTS = {
    letter: function (b, p) {
      return need(p) + today() + "\n\n" + (b.ag || "Contracting Office") + "\nAttn: Contracting Officer\n\n" +
        "Re: " + b.ti + "\nSAM.gov notice: " + b.u + (b.d ? "\nResponse due: " + fmtDate(b.d) : "") + "\n\n" +
        "Dear Contracting Officer,\n\n" +
        (p.company || "[Company]") + " is pleased to submit this response for " + b.ti + ". " +
        (p.core ? "We specialize in " + lines(p.core).map(function (s) {   // "General construction" -> "general construction", keeps "HVAC"
          return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
        }).join(", ").replace(/,([^,]*)$/, " and$1") : "We perform this type of work") +
        (p.years ? ", with " + p.years + " years of experience" : "") +
        (b.s ? ", and we are ready to perform in " + [b.c, b.s].filter(Boolean).join(", ") : "") + ".\n\n" +
        setAsideLine(b, p) +
        (p.past ? "Relevant past performance:\n" + bullet(lines(p.past)) + "\n\n" : "Relevant past performance:\n- [Contract, agency or client, value, dates, what you delivered]\n\n") +
        (p.diff ? "Why " + (p.company || "us") + ":\n" + bullet(lines(p.diff)) + "\n\n" : "") +
        "We have reviewed the solicitation and its attachments and will meet the requirements of the statement of work. " +
        "[Summarize your approach: staffing, schedule, equipment, quality control and safety.]\n\n" +
        "Please contact me with any questions.\n\nSincerely,\n\n" + (p.contact || "[Name]") + (p.title ? ", " + p.title : "") + "\n" +
        (p.company || "[Company]") + "\n" + [p.phone, p.email].filter(Boolean).join(" · ") +
        (p.uei ? "\nUEI: " + p.uei : "") + (p.cage ? " · CAGE: " + p.cage : "");
    },
    capability: function (b, p) {
      return need(p) + (p.company || "[COMPANY NAME]").toUpperCase() + "\nCAPABILITY STATEMENT\n" +
        [p.address, p.phone, p.email, p.website].filter(Boolean).join(" | ") + "\n\n" +
        "CORE COMPETENCIES\n" + bullet(lines(p.core).length ? lines(p.core) : ["[Service 1]", "[Service 2]", "[Service 3]"]) + "\n\n" +
        "PAST PERFORMANCE\n" + bullet(lines(p.past).length ? lines(p.past) : ["[Agency or client: project, value, year]"]) + "\n\n" +
        "DIFFERENTIATORS\n" + bullet(lines(p.diff).length ? lines(p.diff) : ["[What sets you apart: response time, bonding, local crews, certifications]"]) + "\n\n" +
        "COMPANY DATA\n" + bullet([
          "UEI: " + (p.uei || "[UEI]"), "CAGE: " + (p.cage || "[CAGE]"),
          "NAICS: " + (p.naics || b.n || "[codes]"),
          "Certifications: " + (p.certs ? lines(p.certs).join(", ") : "[e.g. Small Business, SDVOSB, 8(a), HUBZone, WOSB]"),
          p.years ? "In business: " + p.years + " years" : "Accepts government purchase cards"]) + "\n\n" +
        "POINT OF CONTACT\n" + (p.contact || "[Name]") + (p.title ? ", " + p.title : "") + " · " + [p.phone, p.email].filter(Boolean).join(" · ") +
        (b.id ? "\n\nPrepared for: " + b.ti + " (" + b.ag + ")" : "");
    },
    questions: function (b, p) {
      return "Questions for the Contracting Officer\nRe: " + b.ti + " (Notice ID " + b.id + ")\n" +
        "Send before the question deadline in the solicitation, by the method it specifies.\n\n" + [
          "Is there an incumbent contractor, and what is the current contract number and value?",
          "Is this a new requirement or a recompete? If a recompete, why is it being recompeted?",
          "What is the estimated value or magnitude of this requirement?",
          "Will there be a site visit or pre-bid conference? If so, how do we register?",
          "What is the anticipated period of performance, including option periods?",
          "What evaluation method will be used (lowest price technically acceptable or best value tradeoff)?",
          "Are there page limits or required formats for the technical and price volumes?",
          b.sa ? "Please confirm the set-aside (" + b.sa + ") and whether joint ventures or teaming arrangements are permitted."
            : "Is this requirement set aside for small business, and are teaming arrangements permitted?",
          "Are wage determinations (Service Contract Act or Davis-Bacon) attached, and which apply?",
          "Are bonds or specific insurance limits required?"
        ].map(function (q, i) { return (i + 1) + ". " + q; }).join("\n") +
        "\n\n" + (p.contact || "[Name]") + ", " + (p.company || "[Company]") + (p.email ? " · " + p.email : "");
    },
    checklist: function (b, p) {
      var d = daysLeft(b);
      return "Bid checklist: " + b.ti + "\nDue " + fmtDate(b.d) + (d !== null ? " (" + d + " days left)" : "") + "\n\n" + [
        "SAM.gov registration is active and won't expire before award" + (p.uei ? " (UEI " + p.uei + ")" : ""),
        "Downloaded every attachment and amendment from the notice (check again 2 days before the deadline)",
        "Read Section L (instructions) and Section M (evaluation) or the equivalent in the RFQ",
        "NAICS " + b.n + ": your size standard qualifies" + (b.sa ? " for the " + b.sa : ""),
        "Wage determination reviewed and priced in",
        "Site visit attended or questions submitted before the question deadline",
        "Technical response follows the required order and page limits",
        "Price sheet or CLIN schedule completed exactly as provided",
        "Signed SF-1449 / SF-33 / SF-18 (whichever the notice uses) and acknowledged all amendments",
        "Past performance references contacted",
        "Submitted by the required method, with time to spare, and saved the confirmation"
      ].map(function (s) { return "[ ] " + s; }).join("\n");
    }
  };
  function draftPicker() {
    var t = trackerRows(false), cur = get("fb_draft_bid", "");
    var opts = t.map(function (x) { return '<option value="' + esc(x.bid.id) + '"' + (x.bid.id === cur ? " selected" : "") + ">" + esc(x.bid.ti.slice(0, 90)) + "</option>"; }).join("");
    $("#d-bid").innerHTML = '<option value="">General (no specific bid)</option>' + opts;
  }
  function makeDraft() {
    var id = $("#d-bid").value, b = (get("fb_tracked", {})[id] || {}).bid || BY_ID[id] ||
      { id: "[Notice ID]", ti: "[Opportunity title]", ag: "[Agency]", n: profile().naics || "", s: "", c: "", sa: "", d: "" };
    put("fb_draft_bid", id);
    $("#d-out").value = DRAFTS[$("#d-kind").value](b, profile());
  }
  $("#d-make").addEventListener("click", makeDraft);
  $("#d-bid").addEventListener("change", makeDraft);
  $("#d-kind").addEventListener("change", makeDraft);
  $("#d-copy").addEventListener("click", function () {
    var btn = this, done = function () { btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy"; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText($("#d-out").value).then(done); else { $("#d-out").select(); document.execCommand("copy"); done(); }
  });
  $("#d-save").addEventListener("click", function () { download("fedbid-" + $("#d-kind").value + ".txt", "text/plain", $("#d-out").value); });
  $("#d-print").addEventListener("click", function () {
    var w = window.open("", "_blank");
    if (!w) return;
    w.document.write("<!doctype html><title>Draft</title><pre style=\"font:14px/1.5 Georgia,serif;white-space:pre-wrap;max-width:720px;margin:40px auto\">" +
      esc($("#d-out").value) + "</pre>");
    w.document.close(); w.print();
  });

  // ---------------- backup ----------------
  var KEYS = ["fb_searches", "fb_tracked", "fb_profile"];
  $("#export").addEventListener("click", function () {
    var out = {}; KEYS.forEach(function (k) { out[k] = get(k, null); });
    download("fedbid-dashboard-backup.json", "application/json", JSON.stringify(out, null, 1));
  });
  $("#import").addEventListener("change", function () {
    var file = this.files[0]; if (!file) return;
    file.text().then(function (text) {
      var data = JSON.parse(text);
      KEYS.forEach(function (k) { if (data[k]) put(k, data[k]); });
      fillProfile(); show("overview");
    }).catch(function () { alert("That file isn't a FedBid dashboard backup."); });
  });

  // ---------------- render ----------------
  function render(tab) {
    if (!DATA) return;
    if (tab === "overview") {
      var t = trackerRows(false), soon = trackerRows(true);
      var counts = STATUSES.map(function (s) { return [s, t.filter(function (x) { return x.status === s; }).length]; });
      $("#ov-stats").innerHTML = counts.slice(0, 4).map(function (c) {
        return '<div class="stat"><b>' + c[1] + "</b><span>" + c[0] + "</span></div>";
      }).join("");
      $("#ov-soon").innerHTML = soon.length ? '<ul class="dash-list">' + soon.map(function (x) {
        return '<li><div class="grow"><b>' + esc(x.bid.ti) + '</b><div class="muted">' + esc(x.bid.ag) + " · " + x.status + "</div></div>" + leftHTML(x.bid) + "</li>";
      }).join("") + "</ul>" : '<p class="muted">Nothing you\'re tracking is due in the next 14 days.</p>';
      $("#ov-searches").innerHTML = searchesHTML(true);
    }
    if (tab === "searches") $("#searches").innerHTML = searchesHTML(false);
    if (tab === "tracker") $("#tracker").innerHTML = trackerHTML();
    if (tab === "draft") { draftPicker(); makeDraft(); }
  }
})();
