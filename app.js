// fedbid.us front end: mobile menu, chart tooltips, email preview tabs, savings calculator and the bid explorer.
(function () {
  "use strict";
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  function store(key, val) {
    try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { return null; }
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Mobile menu
  var mb = $(".menu-btn");
  if (mb) mb.addEventListener("click", function () {
    var open = $(".links").classList.toggle("open");
    mb.setAttribute("aria-expanded", open);
  });

  // Hover tooltips for chart marks (data-tip)
  var tip = document.createElement("div");
  tip.className = "tip"; tip.setAttribute("role", "tooltip");
  document.body.appendChild(tip);
  document.addEventListener("mousemove", function (e) {
    var t = e.target.closest && e.target.closest("[data-tip]");
    if (!t) { tip.style.display = "none"; return; }
    tip.textContent = t.getAttribute("data-tip");
    tip.style.display = "block";
    var x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = x + "px"; tip.style.top = (e.clientY + 16) + "px";
  });

  // Email preview tabs
  $$(".tabs").forEach(function (tabs) {
    var frame = document.getElementById(tabs.getAttribute("data-frame"));
    var label = document.getElementById(tabs.getAttribute("data-label"));
    $$("button", tabs).forEach(function (b) {
      b.addEventListener("click", function () {
        $$("button", tabs).forEach(function (x) { x.setAttribute("aria-selected", x === b); });
        frame.src = b.getAttribute("data-src");
        if (label) label.textContent = b.getAttribute("data-subject");
      });
    });
  });

  // Savings calculator
  var calc = $("#calc");
  if (calc) {
    var run = function () {
      var hrs = parseFloat($("#c-hours").value) || 0, rate = parseFloat($("#c-rate").value) || 0;
      var price = parseFloat(calc.getAttribute("data-price")) || 29;
      var month = hrs * rate * 4.33;
      $("#c-out").textContent = "$" + Math.round(month).toLocaleString() + " of your time each month";
      $("#c-net").textContent = month > price
        ? "That's about " + Math.round(month / price) + "x the $" + price + " subscription."
        : "Even a single missed bid usually costs more than a month of alerts.";
    };
    $$("input", calc).forEach(function (i) { i.addEventListener("input", run); });
    run();
  }

  // ---------------- Bid explorer ----------------
  var root = $("#explorer");
  if (!root) return;
  var DATA = null, shown = 0, PAGE = 25, results = [];
  var f = {
    q: $("#f-q"), trade: $("#f-trade"), state: $("#f-state"), agency: $("#f-agency"),
    due: $("#f-due"), posted: $("#f-posted"), sort: $("#f-sort")
  };
  var DAY = 864e5;

  function daysLeft(b) { return b.d ? Math.max(0, Math.floor((Date.parse(b.d) - Date.now()) / DAY)) : null; }
  function isNew(b) { return b.p && (Date.now() - Date.parse(b.p + "T00:00:00Z")) <= 2 * DAY; }
  function checked(name) { return $$("input[name=" + name + "]:checked", root).map(function (i) { return i.value; }); }

  function readState() {
    return {
      q: f.q.value.trim(), trade: f.trade.value, state: f.state.value, agency: f.agency.value,
      due: f.due.value, posted: f.posted.value, sort: f.sort.value,
      naics: checked("naics"), type: checked("type"), sa: checked("sa")
    };
  }
  function writeState(s) {
    f.q.value = s.q || ""; f.trade.value = s.trade || ""; f.state.value = s.state || "";
    f.agency.value = s.agency || ""; f.due.value = s.due || ""; f.posted.value = s.posted || "";
    f.sort.value = s.sort || "new";
    ["naics", "type", "sa"].forEach(function (k) {
      var want = s[k] || [];
      $$("input[name=" + k + "]", root).forEach(function (i) { i.checked = want.indexOf(i.value) >= 0; });
    });
  }
  function toQuery(s) {
    var p = new URLSearchParams();
    Object.keys(s).forEach(function (k) {
      var v = s[k];
      if (Array.isArray(v)) { if (v.length) p.set(k, v.join(",")); }
      else if (v && !(k === "sort" && v === "new")) p.set(k, v);
    });
    return p.toString();
  }
  function fromQuery(q) {
    var p = new URLSearchParams(q), s = {};
    ["q", "trade", "state", "agency", "due", "posted", "sort"].forEach(function (k) { s[k] = p.get(k) || ""; });
    ["naics", "type", "sa"].forEach(function (k) { s[k] = p.get(k) ? p.get(k).split(",") : []; });
    return s;
  }

  function matches(b, s) {
    if (s.trade && b.tr !== s.trade) return false;
    if (s.naics.length && s.naics.indexOf(b.n) < 0) return false;
    if (s.state && b.s !== s.state) return false;
    if (s.agency && b.ag !== s.agency) return false;
    if (s.type.length && s.type.indexOf(b.ty) < 0) return false;
    if (s.sa.length && s.sa.indexOf(b.sg) < 0) return false;
    if (s.due) { var d = daysLeft(b); if (d === null || d > +s.due) return false; }
    if (s.posted && b.p && (Date.now() - Date.parse(b.p + "T00:00:00Z")) > (+s.posted + 1) * DAY) return false;
    if (s.q) {
      var hay = (b.ti + " " + b.ag + " " + b.id + " " + b.c + " " + b.s + " " + b.sa).toLowerCase();
      var words = s.q.toLowerCase().split(/\s+/);
      for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) < 0) return false;
    }
    return true;
  }
  function sorter(key) {
    return {
      "new": function (a, b) { return (b.p || "").localeCompare(a.p || ""); },
      "due": function (a, b) { return (a.d ? Date.parse(a.d) : 9e15) - (b.d ? Date.parse(b.d) : 9e15); },
      "agency": function (a, b) { return a.ag.localeCompare(b.ag); },
      "title": function (a, b) { return a.ti.localeCompare(b.ti); }
    }[key] || function () { return 0; };
  }

  function fmtDate(iso) {
    if (!iso) return "See notice";
    var d = new Date(iso);
    return isNaN(d) ? "See notice" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  function bidHTML(b) {
    var d = daysLeft(b), cls = d === null ? "" : d >= 14 ? "g" : d >= 7 ? "a" : "r";
    var where = [b.c, b.s].filter(Boolean).join(", ") || "Location not listed";
    return '<li class="bid"><div>' +
      (isNew(b) ? '<span class="tag new">New</span>' : "") +
      (d !== null && d < 7 ? '<span class="tag soon">Closing soon</span>' : "") +
      '<span class="tag type">' + esc(b.ty) + "</span></div>" +
      '<h3><a href="' + esc(b.u) + '" target="_blank" rel="noopener">' + esc(b.ti) + "</a></h3>" +
      '<div class="meta">' + esc(b.ag) + " &middot; " + esc(where) + " &middot; NAICS " + esc(b.n) + "</div>" +
      (b.sa ? '<div class="meta">Set-aside: ' + esc(b.sa) + "</div>" : "") +
      '<div class="row"><span>Due <b>' + fmtDate(b.d) + "</b></span>" +
      (d !== null ? '<span class="left ' + cls + '">' + d + " day" + (d === 1 ? "" : "s") + " left</span>" : "") +
      '<span class="acts"><a class="btn sm" href="' + esc(b.u) + '" target="_blank" rel="noopener">View on SAM.gov</a>' +
      (b.d ? '<button class="linkbtn" data-ics="' + esc(b.id) + '">Add to calendar</button>' : "") +
      '<button class="linkbtn" data-copy="' + esc(b.u) + '">Copy link</button>' +
      (MEMBER ? '<button class="linkbtn" data-track="' + esc(b.id) + '"' + (tracked()[b.id] ? " disabled>Tracking" : ">Track") + "</button>" : "") +
      "</span></div></li>";
  }

  // Pro members (key saved by the dashboard) can track bids and save searches from here.
  var MEMBER = store("fb_member");
  function getJSON(key, fallback) { try { return JSON.parse(store(key)) || fallback; } catch (e) { return fallback; } }
  function tracked() { return getJSON("fb_tracked", {}); }

  function render(reset) {
    var s = readState();
    if (reset) {
      results = DATA.bids.filter(function (b) { return matches(b, s); }).sort(sorter(s.sort));
      shown = 0; $("#list").innerHTML = "";
      var q = toQuery(s);
      history.replaceState(null, "", q ? "?" + q : location.pathname);
      store("fb_filters", q);
      $("#count").textContent = results.length + " open bid" + (results.length === 1 ? "" : "s");
      var t = s.trade || (s.naics.length ? DATA.naics_trade[s.naics[0]] : "");
      var strip = $("#cta-strip");
      if (t && DATA.links[t]) {
        strip.hidden = false;
        $("#cta-text").textContent = "Get new " + DATA.trades[t] + " bids like these emailed every weekday morning.";
        $("#cta-link").href = DATA.links[t];
      } else strip.hidden = true;
    }
    var next = results.slice(shown, shown + PAGE);
    $("#list").insertAdjacentHTML("beforeend", next.map(bidHTML).join(""));
    shown += next.length;
    $("#more").hidden = shown >= results.length;
    $("#empty").hidden = results.length > 0;
  }

  function csv() {
    var head = ["Title", "Agency", "Notice type", "NAICS", "Set-aside", "City", "State", "Posted", "Due", "Days left", "Link"];
    var rows = results.map(function (b) {
      return [b.ti, b.ag, b.ty, b.n, b.sa, b.c, b.s, b.p, b.d, daysLeft(b), b.u];
    });
    var text = [head].concat(rows).map(function (r) {
      return r.map(function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }).join(",");
    }).join("\r\n");
    download("fedbid-bids.csv", "text/csv", text);
  }
  function ics(b) {
    var dt = new Date(b.d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    var stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    var clean = function (s) { return String(s).replace(/[,;\\]/g, "\\$&").replace(/\n/g, " "); };
    var text = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FedBid.us//Bid deadline//EN", "BEGIN:VEVENT",
      "UID:" + b.id + "@fedbid.us", "DTSTAMP:" + stamp, "DTSTART:" + dt, "DTEND:" + dt,
      "SUMMARY:" + clean("Bid due: " + b.ti), "DESCRIPTION:" + clean(b.ag + " " + b.u), "URL:" + b.u,
      "BEGIN:VALARM", "TRIGGER:-P2D", "ACTION:DISPLAY", "DESCRIPTION:Bid due in 2 days", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    download("bid-deadline.ics", "text/calendar", text);
  }
  function download(name, type, text) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  function copy(text, btn) {
    var done = function () { var o = btn.textContent; btn.textContent = "Copied"; setTimeout(function () { btn.textContent = o; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { prompt("Copy this link:", text); });
    else prompt("Copy this link:", text);
  }

  fetch("/bids.json").then(function (r) { return r.json(); }).then(function (data) {
    DATA = data;
    DATA.bids.forEach(function (b) { b.sg = b.sg || ""; });
    var q = location.search.slice(1) || store("fb_filters") || "";
    writeState(fromQuery(q));
    render(true);
    $("#loading").hidden = true;
  }).catch(function () { $("#loading").textContent = "Couldn't load bids. Please refresh the page."; });

  root.addEventListener("input", function (e) { if (e.target.closest(".filters") || e.target === f.sort) render(true); });
  $("#more").addEventListener("click", function () { render(false); });
  $("#clear").addEventListener("click", function () { writeState({}); render(true); });
  $("#csv").addEventListener("click", csv);
  $("#print").addEventListener("click", function () { window.print(); });
  $("#share").addEventListener("click", function (e) { copy(location.href, e.target); });
  $(".filter-toggle").addEventListener("click", function () {
    var open = $(".filters").classList.toggle("open");
    this.setAttribute("aria-expanded", open);
  });
  if (MEMBER) {
    $("#share").insertAdjacentHTML("beforebegin", '<button type="button" class="btn sm" id="save-search">Save search</button>');
    $("#save-search").addEventListener("click", function () {
      var q = toQuery(readState()), name = prompt("Name this search:", "My search");
      if (name === null) return;
      var list = getJSON("fb_searches", []);
      list.push({ name: name || "My search", q: q, seen: results.map(function (b) { return b.id; }) });
      store("fb_searches", JSON.stringify(list));
      this.textContent = "Saved to dashboard";
    });
  }
  $("#list").addEventListener("click", function (e) {
    var t = e.target.getAttribute("data-track");
    if (t) {
      var all = tracked(), b = DATA.bids.filter(function (x) { return x.id === t; })[0];
      all[t] = { status: "Watching", notes: "", added: new Date().toISOString(), bid: b };
      store("fb_tracked", JSON.stringify(all));
      e.target.textContent = "Tracking"; e.target.disabled = true;
    }
    var c = e.target.getAttribute("data-copy"), i = e.target.getAttribute("data-ics");
    if (c) copy(c, e.target);
    if (i) ics(DATA.bids.filter(function (b) { return b.id === i; })[0]);
  });
})();
