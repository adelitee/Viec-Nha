const {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef
} = React;

/* ────────────────────────────────────────────────────────────
   NGƯỜI & CA LÀM
   ──────────────────────────────────────────────────────────── */
// ── Cấu hình lấy từ Google Sheets lúc khởi động ─────────────
let PEOPLE = {};
let PINS = {};
let OWNER = "ban";
let SHIFTS = {};
let ALL_TASKS = [];
let DAILY = [],
  WEEKLY = [],
  MONTHLY = [];
let SEED_RECIPES = [];
let TYPES = ["Món chính", "Món phụ", "Canh", "1 món", "Salad"];
let ING_GROUP = {};
let STAPLE_GROUPS = [];
const TAB_LABEL = {
  today: "Hôm nay",
  meals: "Thực đơn",
  shop: "Đi chợ",
  week: "Tuần"
};
const FALLBACK_COLORS = ["#8B6FE0", "#EF7C9F", "#E8B33C", "#5FC3B4"];
function shade(hex, amt) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  const cl = v => Math.max(0, Math.min(255, v));
  const r = cl((n >> 16 & 255) + amt),
    g = cl((n >> 8 & 255) + amt),
    b = cl((n & 255) + amt);
  return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}
function applyConfig(cfg) {
  PEOPLE = {};
  PINS = {};
  (cfg.people || []).forEach((p, i) => {
    const id = String(p.id || "").trim();
    if (!id) return;
    const color = String(p["màu"] || FALLBACK_COLORS[i % 4]).trim();
    PEOPLE[id] = {
      name: String(p["tên"] || id),
      short: String(p["viết tắt"] || id.slice(0, 2)).toUpperCase(),
      color,
      fg: "#fff",
      deep: shade(color, -70),
      soft: shade(color, 92)
    };
    PINS[id] = String(p.pin || "").padStart(4, "0");
    if (String(p["vai trò"] || "").indexOf("chủ") === 0) OWNER = id;
  });
  SHIFTS = {};
  (cfg.shifts || []).forEach(s => {
    SHIFTS[Number(s["thứ"])] = {
      who: String(s["người"]),
      cap: Number(s["phút chuẩn"]) || 0
    };
  });
  for (let d = 0; d < 7; d++) if (!SHIFTS[d]) SHIFTS[d] = {
    who: OWNER,
    cap: 0
  };
  const kindOf = f => f === "ngày" ? "daily" : f === "tuần" ? "weekly" : "monthly";
  ALL_TASKS = (cfg.tasks || []).filter(t => t.id).map(t => ({
    id: String(t.id),
    name: String(t["tên"]),
    room: String(t["khu vực"] || ""),
    min: Number(t["phút"]) || 0,
    kind: kindOf(String(t["tần suất"]).trim()),
    day: t["thứ"] === "" ? null : Number(t["thứ"]),
    wk: t["tuần"] === "" ? null : Number(t["tuần"]),
    skip: String(t["bỏ qua thứ"] || "").split(",").map(x => Number(x.trim())).filter(x => !isNaN(x))
  }));
  DAILY = ALL_TASKS.filter(t => t.kind === "daily");
  WEEKLY = ALL_TASKS.filter(t => t.kind === "weekly");
  MONTHLY = ALL_TASKS.filter(t => t.kind === "monthly");
  SEED_RECIPES = (cfg.recipes || []).filter(r => r.id).map(r => ({
    id: String(r.id),
    name: String(r["tên"]),
    type: String(r["loại"] || "Món chính"),
    ing: String(r["nguyên liệu"] || "").split(",").map(x => x.trim()).filter(Boolean)
  }));
  const types = [];
  SEED_RECIPES.forEach(r => {
    if (types.indexOf(r.type) < 0) types.push(r.type);
  });
  if (types.length) TYPES = types;
  ING_GROUP = {};
  (cfg.ingredients || []).forEach(i => {
    ING_GROUP[String(i["tên"]).trim()] = String(i["nhóm"] || "Khác");
  });
  const groups = {};
  (cfg.staples || []).forEach(s => {
    const g = String(s["loại"] || "Khác");
    (groups[g] = groups[g] || []).push({
      n: String(s["tên"]),
      c: String(s["nhóm"] || "Khác")
    });
  });
  STAPLE_GROUPS = Object.keys(groups).map(k => ({
    title: k,
    items: groups[k]
  }));
}
function catOf(ing) {
  return ING_GROUP[ing] || "Khác";
}
const CAT_ORDER = ["Rau củ quả", "Thịt · Cá · Trứng", "Đồ khô", "Đồ dùng nhà", "Khác"];
const DAY_VN = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
const DAY_VN_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const fmt = d => {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const parse = s => {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const mondayOf = d => addDays(d, d.getDay() === 0 ? -6 : 1 - d.getDay());
const weekOfMonth = d => Math.floor((d.getDate() - 1) / 7) + 1;
const prettyDate = d => `${DAY_VN[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}`;
const mins = n => `${n}′`;
const hm = m => {
  if (!m) return "0′";
  const h = Math.floor(m / 60),
    r = m % 60;
  return (h ? `${h}h` : "") + (r ? `${h ? " " : ""}${r}′` : "");
};
const taskById = id => ALL_TASKS.find(t => t.id === id);

// Sắp xếp: việc lâu nhất lên trước
const byTime = arr => [...arr].sort((a, b) => b.min - a.min || a.name.localeCompare(b.name, "vi"));
function defaultTasks(date) {
  const dow = date.getDay();
  const wk = weekOfMonth(date);
  if (SHIFTS[dow].cap === 0) return [];
  return byTime(ALL_TASKS.filter(t => {
    if (t.kind === "daily") return !(t.skip || []).includes(dow);
    if (t.kind === "weekly") return t.day === dow;
    return t.day === dow && t.wk === wk;
  }));
}

// Danh sách việc của một ngày — mặc định hoặc đã chỉnh tay
function planFor(week, date) {
  const key = fmt(date);
  const ov = week?.plan?.[key];
  const tasks = ov?.tasks ? byTime(ov.tasks.map(taskById).filter(Boolean)) : defaultTasks(date);
  return {
    tasks,
    assign: ov?.assign || {},
    custom: !!ov?.tasks
  };
}

// Ai làm ca ngày này — mặc định hoặc đã đổi
function whoFor(week, date) {
  return week?.plan?.[fmt(date)]?.shiftWho || SHIFTS[date.getDay()].who;
}

// Giờ làm thực tế — mặc định là ca chuẩn
function hoursFor(week, date) {
  const key = fmt(date);
  const h = week?.hours?.[key];
  const cap = SHIFTS[date.getDay()].cap;
  return {
    actual: h?.actual ?? cap,
    note: h?.note || "",
    edited: h?.actual != null && h.actual !== cap,
    cap
  };
}

/* ────────────────────────────────────────────────────────────
   BỘ NHỚ
   ──────────────────────────────────────────────────────────── */
/* ────────────────────────────────────────────────────────────
   GOOGLE SHEETS API
   ──────────────────────────────────────────────────────────── */
const GS = typeof window !== "undefined" && window.VIECNHA_CONFIG || {};
async function apiLoad() {
  const url = GS.url + "?token=" + encodeURIComponent(GS.token) + "&t=" + Date.now();
  const r = await fetch(url);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "load failed");
  return j;
}

// Apps Script chặn preflight nếu dùng application/json → dùng text/plain
async function apiSave(ops) {
  if (!ops.length) return true;
  const r = await fetch(GS.url, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      token: GS.token,
      ops
    })
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "save failed");
  return true;
}

/* Gom các thao tác ghi rồi gửi 1 lần — đỡ chậm và đỡ chạm giới hạn */
function makeQueue(onState) {
  let pending = [];
  let timer = null;
  const flush = async () => {
    if (!pending.length) return;
    const batch = pending;
    pending = [];
    onState("saving");
    try {
      await apiSave(batch);
      onState("saved");
    } catch (e) {
      onState("error");
      pending = batch.concat(pending);
    }
  };
  return {
    push(ops) {
      pending = pending.concat(ops);
      onState("dirty");
      clearTimeout(timer);
      timer = setTimeout(flush, 900);
    },
    flush
  };
}

/* ── chuyển dòng sheet ⇄ dạng dữ liệu trong app ── */
function buildState(state) {
  const weeks = {},
    days = {},
    notes = {};
  const W = k => weeks[k] = weeks[k] || {
    meals: {},
    bought: {},
    extras: [],
    requests: [],
    plan: {},
    hours: {},
    confirm: {},
    hidden: {}
  };
  const D = k => days[k] = days[k] || {
    done: {}
  };
  (state.hours || []).forEach(r => {
    const date = String(r["ngày"]);
    if (!date) return;
    const wk = fmt(mondayOf(parse(date)));
    const w = W(wk);
    w.hours[date] = {
      actual: Number(r["phút thực tế"]) || 0,
      note: String(r["ghi chú"] || "")
    };
    if (String(r["đã xác nhận"]).trim()) w.confirm[date] = true;
  });
  (state.done || []).forEach(r => {
    const date = String(r["ngày"]);
    if (!date) return;
    D(date).done[String(r["việc"])] = {
      by: String(r["người"] || "")
    };
  });
  (state.plan || []).forEach(r => {
    const date = String(r["ngày"]);
    if (!date) return;
    const w = W(fmt(mondayOf(parse(date))));
    const p = w.plan[date] = w.plan[date] || {
      tasks: null,
      assign: {}
    };
    if (String(r["người ca"] || "")) p.shiftWho = String(r["người ca"]);
    const task = String(r["việc"] || "");
    if (task === "*") {
      p.tasks = p.tasks || [];
    } else if (task) {
      p.tasks = (p.tasks || []).concat([task]);
      if (String(r["người"] || "")) p.assign[task] = String(r["người"]);
    }
  });
  (state.meals || []).forEach(r => {
    const w = W(String(r["tuần"]));
    const dow = Number(r["thứ"]);
    w.meals[dow] = (w.meals[dow] || []).concat([String(r["món"])]);
  });
  (state.shop || []).forEach(r => {
    const w = W(String(r["tuần"]));
    const name = String(r["tên"]),
      src = String(r["nguồn"] || "");
    const bought = String(r["đã mua"]).trim();
    if (src === "ẩn") {
      w.hidden["m:" + name] = true;
      return;
    }
    if (src === "việc") {
      w.requests.push({
        id: name,
        text: name,
        done: !!bought
      });
      return;
    }
    if (src === "tay") w.extras.push({
      id: name,
      name,
      cat: String(r["nhóm"] || "Khác")
    });
    if (bought) w.bought[(src === "tay" ? "e:" : "m:") + name] = true;
  });
  (state.notes || []).forEach(r => {
    const k = String(r["việc"] || "");
    if (k.indexOf("ngày:") === 0) D(k.slice(5)).note = String(r["nội dung"] || "");else if (k) notes[k] = String(r["nội dung"] || "");
  });
  return {
    weeks,
    days,
    notes
  };
}

/* ── sinh ops để ghi ngược lên sheet ── */
const ops = {
  hours: (date, who, actual, confirmed, note) => [{
    sheet: "Giờ công",
    row: {
      "ngày": date,
      "người": who,
      "phút thực tế": actual,
      "đã xác nhận": confirmed ? "x" : "",
      "ghi chú": note || ""
    }
  }],
  done: (date, taskId, who, on) => [on ? {
    sheet: "Đã làm",
    row: {
      "ngày": date,
      "việc": taskId,
      "người": who,
      "lúc": new Date().toISOString()
    }
  } : {
    sheet: "Đã làm",
    row: {
      "ngày": date,
      "việc": taskId
    },
    remove: true
  }],
  plan: (date, tasks, assign, shiftWho) => {
    const out = [{
      sheet: "Phân công",
      clear: {
        "ngày": date
      }
    }];
    if (!tasks) return out;
    if (!tasks.length) out.push({
      sheet: "Phân công",
      row: {
        "ngày": date,
        "việc": "*",
        "người": "",
        "người ca": shiftWho || ""
      }
    });
    tasks.forEach(t => out.push({
      sheet: "Phân công",
      row: {
        "ngày": date,
        "việc": t,
        "người": assign[t] || "",
        "người ca": shiftWho || ""
      }
    }));
    return out;
  },
  meals: (wk, dow, ids) => {
    const out = [{
      sheet: "Thực đơn",
      clear: {
        "tuần": wk,
        "thứ": dow
      }
    }];
    (ids || []).forEach(id => out.push({
      sheet: "Thực đơn",
      row: {
        "tuần": wk,
        "thứ": dow,
        "món": id
      }
    }));
    return out;
  },
  shop: (wk, name, group, source, bought) => [{
    sheet: "Đi chợ",
    row: {
      "tuần": wk,
      "tên": name,
      "nhóm": group || "",
      "nguồn": source,
      "đã mua": bought ? "x" : ""
    }
  }],
  shopDel: (wk, name) => [{
    sheet: "Đi chợ",
    row: {
      "tuần": wk,
      "tên": name
    },
    remove: true
  }],
  note: (key, text) => [text ? {
    sheet: "Hướng dẫn",
    row: {
      "việc": key,
      "nội dung": text
    }
  } : {
    sheet: "Hướng dẫn",
    row: {
      "việc": key
    },
    remove: true
  }],
  recipe: r => [{
    sheet: "Món ăn",
    row: {
      "id": r.id,
      "tên": r.name,
      "loại": r.type,
      "nguyên liệu": r.ing.join(", ")
    }
  }]
};

/* ────────────────────────────────────────────────────────────
   MÀN HÌNH ĐĂNG NHẬP
   ──────────────────────────────────────────────────────────── */
function Gate({
  onEnter
}) {
  const [pick, setPick] = useState(null);
  const [pin, setPin] = useState("");
  const [bad, setBad] = useState(false);
  const press = d => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setBad(false);
    if (next.length === 4) {
      setTimeout(() => {
        if (next === PINS[pick]) onEnter(pick);else {
          setBad(true);
          setPin("");
        }
      }, 140);
    }
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, CSS), /*#__PURE__*/React.createElement("div", {
    className: "app gate"
  }, /*#__PURE__*/React.createElement("div", {
    className: "gate-inner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "gate-brand"
  }, "Việc nhà"), !pick ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "gate-q"
  }, "Tên bạn là gì?"), /*#__PURE__*/React.createElement("div", {
    className: "gate-people"
  }, ["diem", "lich", "ban"].map(k => /*#__PURE__*/React.createElement("button", {
    key: k,
    className: "gate-person",
    style: {
      background: PEOPLE[k].color,
      color: PEOPLE[k].fg
    },
    onClick: () => {
      setPick(k);
      setPin("");
      setBad(false);
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "gp-short"
  }, PEOPLE[k].short), /*#__PURE__*/React.createElement("span", {
    className: "gp-name"
  }, PEOPLE[k].name))))) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    className: "gate-back",
    onClick: () => {
      setPick(null);
      setPin("");
      setBad(false);
    }
  }, "‹ Đổi tên"), /*#__PURE__*/React.createElement("div", {
    className: "gate-who"
  }, /*#__PURE__*/React.createElement("span", {
    className: "avatar",
    style: {
      background: PEOPLE[pick].color,
      color: PEOPLE[pick].fg
    }
  }, PEOPLE[pick].short), /*#__PURE__*/React.createElement("span", {
    className: "gate-whoname"
  }, PEOPLE[pick].name)), /*#__PURE__*/React.createElement("div", {
    className: "gate-q sm"
  }, "Nhập mã PIN"), /*#__PURE__*/React.createElement("div", {
    className: "dots" + (bad ? " bad" : "")
  }, [0, 1, 2, 3].map(i => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: "dot" + (pin.length > i ? " on" : "")
  }))), bad && /*#__PURE__*/React.createElement("div", {
    className: "gate-err"
  }, "Mã PIN không đúng, thử lại"), /*#__PURE__*/React.createElement("div", {
    className: "keypad"
  }, [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => /*#__PURE__*/React.createElement("button", {
    key: n,
    onClick: () => press(String(n))
  }, n)), /*#__PURE__*/React.createElement("span", null), /*#__PURE__*/React.createElement("button", {
    onClick: () => press("0")
  }, "0"), /*#__PURE__*/React.createElement("button", {
    className: "kdel",
    onClick: () => {
      setPin(pin.slice(0, -1));
      setBad(false);
    }
  }, "⌫"))))));
}

/* ────────────────────────────────────────────────────────────
   GIAO DIỆN CHUNG
   ──────────────────────────────────────────────────────────── */
function Meter({
  used,
  cap
}) {
  const pct = cap ? Math.min(100, used / cap * 100) : 0;
  const over = used > cap;
  return /*#__PURE__*/React.createElement("div", {
    className: "meter-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "meter-track"
  }, /*#__PURE__*/React.createElement("div", {
    className: "meter-fill",
    style: {
      width: pct + "%",
      background: over ? "var(--clay)" : "var(--jade)"
    }
  }), Array.from({
    length: Math.max(0, Math.floor(cap / 15) - 1)
  }).map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "meter-tick",
    style: {
      left: (i + 1) * 15 / cap * 100 + "%"
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "meter-label"
  }, /*#__PURE__*/React.createElement("span", {
    className: over ? "over" : ""
  }, used, "′"), /*#__PURE__*/React.createElement("span", {
    className: "muted"
  }, " / ", cap, "′")));
}
function Donut({
  pct,
  size = 76
}) {
  const r = (size - 13) / 2,
    c = 2 * Math.PI * r;
  const col = pct >= 100 ? "var(--jade)" : pct >= 50 ? "var(--jade)" : pct > 0 ? "var(--amber)" : "var(--line)";
  return /*#__PURE__*/React.createElement("div", {
    className: "donut",
    style: {
      width: size,
      height: size
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: `0 0 ${size} ${size}`
  }, /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: "var(--brand-soft)",
    strokeWidth: "10"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: col,
    strokeWidth: "10",
    strokeLinecap: "round",
    strokeDasharray: c,
    strokeDashoffset: c - c * Math.min(100, pct) / 100,
    transform: `rotate(-90 ${size / 2} ${size / 2})`,
    style: {
      transition: "stroke-dashoffset .4s ease"
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "donut-val"
  }, pct, /*#__PURE__*/React.createElement("span", null, "%")));
}
const ICONS = {
  today: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M9 5h9M9 12h9M9 19h9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 5.5l1 1L7 4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 12.5l1 1L7 10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 19.5l1 1L7 17"
  })),
  meals: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M6 3v8a2 2 0 0 0 4 0V3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 11v10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M17 3c-1.5 1.5-2 3.5-2 5.5S15.5 12 17 12s2-1.5 2-3.5S18.5 4.5 17 3z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M17 12v9"
  })),
  shop: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "20",
    r: "1.4"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "18",
    cy: "20",
    r: "1.4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M2.5 3h2.2l2.4 12.1a1.6 1.6 0 0 0 1.6 1.3h8.7a1.6 1.6 0 0 0 1.6-1.3L21 7H6"
  })),
  week: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "5",
    width: "18",
    height: "16",
    rx: "2.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 10h18M8 3v4M16 3v4"
  }))
};
function TabIcon({
  name
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    width: "27",
    height: "27",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, ICONS[name]);
}
function TrashIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    width: "19",
    height: "19",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 6h18"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10 11v6M14 11v6"
  }));
}
function Check({
  on,
  onClick,
  who
}) {
  return /*#__PURE__*/React.createElement("button", {
    className: "chk" + (on ? " on" : ""),
    onClick: onClick,
    "aria-pressed": on
  }, on ? who ? PEOPLE[who]?.short || "✓" : "✓" : "");
}

/* Dải lịch tuần — tô màu ngày làm việc */
function WeekStrip({
  today,
  setToday,
  week,
  me,
  isOwner
}) {
  const cur = parse(today);
  const mon = mondayOf(cur);
  const realToday = fmt(new Date());
  const days = Array.from({
    length: 7
  }, (_, i) => {
    const d = addDays(mon, i);
    const {
      tasks,
      assign
    } = planFor(week, d);
    const shiftWho = whoFor(week, d);
    // ai có việc trong ngày này
    const who = new Set(tasks.map(t => assign[t.id] || shiftWho));
    const list = ["diem", "lich"].filter(k => who.has(k));
    return {
      d,
      key: fmt(d),
      people: isOwner ? list : list.filter(k => k === me)
    };
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "strip"
  }, days.map(x => {
    const sel = x.key === today;
    const isToday = x.key === realToday;
    const p = x.people;
    const bg = p.length === 1 ? PEOPLE[p[0]].color : p.length > 1 ? `linear-gradient(135deg, ${PEOPLE[p[0]].color} 50%, ${PEOPLE[p[1]].color} 50%)` : "transparent";
    return /*#__PURE__*/React.createElement("button", {
      key: x.key,
      className: "sday" + (sel ? " sel" : "") + (p.length ? " work" : ""),
      onClick: () => isOwner && setToday(x.key),
      disabled: !isOwner
    }, /*#__PURE__*/React.createElement("span", {
      className: "sday-d"
    }, DAY_VN_SHORT[x.d.getDay()]), /*#__PURE__*/React.createElement("span", {
      className: "sday-n",
      style: p.length ? {
        background: bg,
        color: "#fff"
      } : {}
    }, x.d.getDate()), /*#__PURE__*/React.createElement("span", {
      className: "sday-dot" + (isToday ? " on" : "")
    }));
  }));
}

/* ────────────────────────────────────────────────────────────
   TAB: HÔM NAY
   ──────────────────────────────────────────────────────────── */
function TodayTab({
  today,
  setToday,
  dayData,
  toggle,
  meta,
  setNote,
  week,
  recipes,
  me,
  isOwner,
  dayNote,
  setDayNote
}) {
  const [noteFor, setNoteFor] = useState(null);
  const [draft, setDraft] = useState("");
  const [dn, setDn] = useState(dayNote);
  useEffect(() => {
    setDn(dayNote);
  }, [dayNote, today]);
  const d = parse(today);
  const dow = d.getDay();
  const shift = SHIFTS[dow];
  const whoKey = whoFor(week, d);
  const {
    tasks: allTasks,
    assign
  } = planFor(week, d);
  const {
    actual
  } = hoursFor(week, d);

  // Người giúp việc chỉ thấy việc được giao cho mình
  const tasks = isOwner ? allTasks : allTasks.filter(t => (assign[t.id] || whoKey) === me);
  const person = isOwner ? PEOPLE[whoKey] : PEOPLE[me];
  const capBase = isOwner || whoKey === me ? actual : tasks.reduce((s, t) => s + t.min, 0);
  const daily = tasks.filter(t => t.kind === "daily");
  const weekly = tasks.filter(t => t.kind === "weekly");
  const monthly = tasks.filter(t => t.kind === "monthly");
  const all = tasks;
  const rest = all.length === 0;
  const done = dayData?.done || {};
  const used = all.filter(t => done[t.id]).reduce((s, t) => s + t.min, 0);
  const dinner = (week?.meals?.[dow] || []).map(id => recipes.find(r => r.id === id)).filter(Boolean);
  const openNote = t => {
    setNoteFor(t);
    setDraft(meta.notes?.[t.id] || "");
  };
  const saveNote = () => {
    setNote(noteFor.id, draft.trim());
    setNoteFor(null);
  };
  const Row = ({
    t
  }) => {
    const on = !!done[t.id];
    const note = meta.notes?.[t.id];
    const owner = PEOPLE[assign[t.id] || whoKey] || PEOPLE.ban;
    return /*#__PURE__*/React.createElement("div", {
      className: "row" + (on ? " done" : "")
    }, /*#__PURE__*/React.createElement(Check, {
      on: on,
      who: done[t.id]?.by,
      onClick: () => toggle(t)
    }), /*#__PURE__*/React.createElement("div", {
      className: "row-body",
      onClick: () => toggle(t)
    }, /*#__PURE__*/React.createElement("div", {
      className: "row-name"
    }, t.name), /*#__PURE__*/React.createElement("div", {
      className: "row-meta"
    }, /*#__PURE__*/React.createElement("span", {
      className: "pill"
    }, t.room), assign[t.id] && assign[t.id] !== whoKey && /*#__PURE__*/React.createElement("span", {
      className: "own",
      style: {
        background: owner.color,
        color: owner.fg
      }
    }, owner.name)), note && /*#__PURE__*/React.createElement("div", {
      className: "note"
    }, "✎ ", note)), isOwner && /*#__PURE__*/React.createElement("button", {
      className: "notebtn",
      onClick: () => openNote(t),
      "aria-label": "Ghi chú cho " + t.name
    }, "✎"));
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "tab"
  }, /*#__PURE__*/React.createElement(WeekStrip, {
    today: today,
    setToday: setToday,
    week: week,
    me: me,
    isOwner: isOwner
  }), isOwner && /*#__PURE__*/React.createElement("div", {
    className: "legend"
  }, ["diem", "lich"].map(k => /*#__PURE__*/React.createElement("span", {
    key: k,
    className: "lg"
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      background: PEOPLE[k].color
    }
  }), PEOPLE[k].name))), /*#__PURE__*/React.createElement("div", {
    className: "daynav"
  }, isOwner && /*#__PURE__*/React.createElement("button", {
    onClick: () => setToday(fmt(addDays(d, -1)))
  }, "‹"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "daynav-date"
  }, prettyDate(d)), isOwner && today !== fmt(new Date()) && /*#__PURE__*/React.createElement("button", {
    className: "link",
    onClick: () => setToday(fmt(new Date()))
  }, "về hôm nay")), isOwner && /*#__PURE__*/React.createElement("button", {
    onClick: () => setToday(fmt(addDays(d, 1)))
  }, "›")), rest ? /*#__PURE__*/React.createElement("div", {
    className: "rest-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rest-title"
  }, "Ngày nghỉ"), /*#__PURE__*/React.createElement("div", {
    className: "rest-sub"
  }, "Không có việc nhà được giao."), dinner.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "rest-meal"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Bữa tối"), dinner.map(r => /*#__PURE__*/React.createElement("div", {
    key: r.id,
    className: "dish-line"
  }, r.name)))) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "shift-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "shift-top"
  }, /*#__PURE__*/React.createElement("span", {
    className: "avatar",
    style: {
      background: person.color,
      color: person.fg
    }
  }, person.short), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "shift-name"
  }, person.name), /*#__PURE__*/React.createElement("div", {
    className: "shift-cap"
  }, isOwner || whoKey === me ? `Ca ${hm(actual)}${actual !== shift.cap ? " · đã sửa" : ""}` : `${tasks.length} việc được giao · ${hm(capBase)}`))), /*#__PURE__*/React.createElement(Meter, {
    used: used,
    cap: capBase || shift.cap
  })), dinner.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "dinner-strip"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Bữa tối hôm nay"), dinner.map(r => /*#__PURE__*/React.createElement("div", {
    key: r.id,
    className: "dish-line"
  }, /*#__PURE__*/React.createElement("b", null, r.type), " ", r.name))), /*#__PURE__*/React.createElement(Section, {
    title: "Việc hàng ngày",
    total: daily.reduce((s, t) => s + t.min, 0)
  }, daily.map(t => /*#__PURE__*/React.createElement(Row, {
    key: t.id,
    t: t
  }))), weekly.length > 0 && /*#__PURE__*/React.createElement(Section, {
    title: "Việc hàng tuần",
    total: weekly.reduce((s, t) => s + t.min, 0)
  }, weekly.map(t => /*#__PURE__*/React.createElement(Row, {
    key: t.id,
    t: t
  }))), monthly.length > 0 && /*#__PURE__*/React.createElement(Section, {
    title: `Việc hàng tháng · tuần ${weekOfMonth(d)}`,
    total: monthly.reduce((s, t) => s + t.min, 0)
  }, monthly.map(t => /*#__PURE__*/React.createElement(Row, {
    key: t.id,
    t: t
  }))), weekOfMonth(d) === 5 && (dow === 1 || dow === 2) && /*#__PURE__*/React.createElement("div", {
    className: "hint"
  }, "Tuần thứ 5 của tháng — không có việc hàng tháng."), /*#__PURE__*/React.createElement("div", {
    className: "section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "section-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "Ghi chú gửi BB")), /*#__PURE__*/React.createElement("textarea", {
    className: "daynote",
    rows: 2,
    value: dn,
    onChange: e => setDn(e.target.value),
    onBlur: () => setDayNote(dn),
    placeholder: "Có gì cần báo? Ví dụ: hết nước lau sàn, máy giặt kêu to…"
  }))), noteFor && /*#__PURE__*/React.createElement("div", {
    className: "sheet-bg",
    onClick: () => setNoteFor(null)
  }, /*#__PURE__*/React.createElement("div", {
    className: "sheet",
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "sheet-title"
  }, noteFor.name), /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Hướng dẫn cố định — hiện mỗi lần làm việc này"), /*#__PURE__*/React.createElement("textarea", {
    value: draft,
    onChange: e => setDraft(e.target.value),
    placeholder: "Ví dụ: dùng nước lau chuyên dụng cho mặt đá",
    rows: 4
  }), /*#__PURE__*/React.createElement("div", {
    className: "sheet-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn ghost",
    onClick: () => setNoteFor(null)
  }, "Đóng"), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: saveNote
  }, "Lưu ghi chú")))));
}
function Section({
  title,
  total,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "section-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, title), /*#__PURE__*/React.createElement("span", {
    className: "section-total"
  }, mins(total))), children);
}

/* ────────────────────────────────────────────────────────────
   TAB: THỰC ĐƠN
   ──────────────────────────────────────────────────────────── */
function IngredientInput({
  chips,
  setChips,
  pool
}) {
  const [q, setQ] = useState("");
  const norm = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const sugg = useMemo(() => {
    const t = norm(q.trim());
    return pool.filter(i => !chips.includes(i)).filter(i => t ? norm(i).includes(t) : true).slice(0, t ? 8 : 12);
  }, [q, chips, pool]);
  const exact = pool.some(i => norm(i) === norm(q.trim()));
  const add = v => {
    const x = v.trim();
    if (x && !chips.includes(x)) setChips([...chips, x]);
    setQ("");
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "ingbox"
  }, chips.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "chips"
  }, chips.map(c => /*#__PURE__*/React.createElement("button", {
    key: c,
    className: "chip",
    onClick: () => setChips(chips.filter(x => x !== c))
  }, c, " ", /*#__PURE__*/React.createElement("span", {
    className: "x"
  }, "×")))), /*#__PURE__*/React.createElement("input", {
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "Gõ nguyên liệu…",
    onKeyDown: e => {
      if (e.key === "Enter") {
        e.preventDefault();
        add(q);
      }
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "sugg"
  }, q.trim() && !exact && /*#__PURE__*/React.createElement("button", {
    className: "sugg-btn new",
    onClick: () => add(q)
  }, "+ Thêm mới “", q.trim(), "”"), sugg.map(s => /*#__PURE__*/React.createElement("button", {
    key: s,
    className: "sugg-btn",
    onClick: () => add(s)
  }, s))));
}
function MealsTab({
  week,
  setWeek,
  weekStart,
  shiftWeek,
  recipes,
  setRecipes,
  isOwner
}) {
  const [picker, setPicker] = useState(null);
  const [tab, setTab] = useState("Món chính");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [nn, setNn] = useState("");
  const [ni, setNi] = useState([]);
  const [nt, setNt] = useState("Món chính");
  const ingPool = useMemo(() => {
    const s = new Set();
    recipes.forEach(r => r.ing.forEach(i => s.add(i)));
    return [...s].sort((a, b) => a.localeCompare(b, "vi"));
  }, [recipes]);
  const meals = week.meals || {};
  const usedThisWeek = useMemo(() => {
    const s = new Set();
    Object.values(meals).forEach(arr => (arr || []).forEach(id => s.add(id)));
    return s;
  }, [meals]);
  const days = Array.from({
    length: 7
  }, (_, i) => addDays(weekStart, i));
  const pick = (dow, id) => {
    const cur = meals[dow] || [];
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    setWeek({
      ...week,
      meals: {
        ...meals,
        [dow]: next
      }
    }, ops.meals(fmt(weekStart), dow, next));
  };
  const addRecipe = () => {
    if (!nn.trim()) return;
    const r = {
      id: "u" + Date.now(),
      name: nn.trim(),
      type: nt,
      ing: ni
    };
    setRecipes([...recipes, r]);
    setNn("");
    setNi([]);
    setAdding(false);
  };
  const list = recipes.filter(r => r.type === tab && r.name.toLowerCase().includes(q.toLowerCase()));
  return /*#__PURE__*/React.createElement("div", {
    className: "tab"
  }, /*#__PURE__*/React.createElement("div", {
    className: "weeknav"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => shiftWeek(-1)
  }, "‹"), /*#__PURE__*/React.createElement("span", null, "Tuần ", weekStart.getDate(), "/", weekStart.getMonth() + 1, " – ", addDays(weekStart, 6).getDate(), "/", addDays(weekStart, 6).getMonth() + 1), /*#__PURE__*/React.createElement("button", {
    onClick: () => shiftWeek(1)
  }, "›")), !isOwner && /*#__PURE__*/React.createElement("div", {
    className: "ro-note"
  }, "Thực đơn do BB lên. Cần mua gì thêm, ghi ở tab Đi chợ."), days.map(d => {
    const dow = d.getDay();
    const chosen = (meals[dow] || []).map(id => recipes.find(r => r.id === id)).filter(Boolean);
    return /*#__PURE__*/React.createElement("div", {
      key: dow,
      className: "mealday" + (isOwner ? "" : " ro"),
      onClick: () => isOwner && setPicker(dow)
    }, /*#__PURE__*/React.createElement("div", {
      className: "mealday-head"
    }, /*#__PURE__*/React.createElement("span", {
      className: "dow"
    }, DAY_VN_SHORT[dow]), /*#__PURE__*/React.createElement("span", {
      className: "mealday-date"
    }, d.getDate(), "/", d.getMonth() + 1)), /*#__PURE__*/React.createElement("div", {
      className: "mealday-body"
    }, chosen.length === 0 ? /*#__PURE__*/React.createElement("span", {
      className: "empty"
    }, isOwner ? "Chạm để chọn món" : "Chưa có món") : chosen.map(r => /*#__PURE__*/React.createElement("div", {
      key: r.id,
      className: "dish-chip"
    }, /*#__PURE__*/React.createElement("span", {
      className: "dish-type"
    }, r.type), r.name))));
  }), picker !== null && /*#__PURE__*/React.createElement("div", {
    className: "sheet-bg",
    onClick: () => setPicker(null)
  }, /*#__PURE__*/React.createElement("div", {
    className: "sheet tall",
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "sheet-title"
  }, "Chọn món · ", DAY_VN[picker]), /*#__PURE__*/React.createElement("div", {
    className: "types"
  }, TYPES.map(t => /*#__PURE__*/React.createElement("button", {
    key: t,
    className: "type-btn" + (tab === t ? " on" : ""),
    onClick: () => setTab(t)
  }, t))), /*#__PURE__*/React.createElement("input", {
    className: "search",
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "Tìm món…"
  }), /*#__PURE__*/React.createElement("div", {
    className: "picklist"
  }, list.map(r => {
    const mine = (meals[picker] || []).includes(r.id);
    const usedElse = usedThisWeek.has(r.id) && !mine;
    return /*#__PURE__*/React.createElement("button", {
      key: r.id,
      className: "pick" + (mine ? " on" : "") + (usedElse ? " used" : ""),
      onClick: () => !usedElse && pick(picker, r.id),
      disabled: usedElse
    }, /*#__PURE__*/React.createElement("span", null, r.name), usedElse ? /*#__PURE__*/React.createElement("span", {
      className: "used-tag"
    }, "đã dùng tuần này") : /*#__PURE__*/React.createElement("span", {
      className: "ing"
    }, r.ing.join(", ")));
  }), list.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "empty pad"
  }, "Không có món nào.")), adding ? /*#__PURE__*/React.createElement("div", {
    className: "addbox"
  }, /*#__PURE__*/React.createElement("input", {
    value: nn,
    onChange: e => setNn(e.target.value),
    placeholder: "Tên món"
  }), /*#__PURE__*/React.createElement("div", {
    className: "eyebrow mt"
  }, "Nguyên liệu"), /*#__PURE__*/React.createElement(IngredientInput, {
    chips: ni,
    setChips: setNi,
    pool: ingPool
  }), /*#__PURE__*/React.createElement("select", {
    value: nt,
    onChange: e => setNt(e.target.value)
  }, TYPES.map(t => /*#__PURE__*/React.createElement("option", {
    key: t
  }, t))), /*#__PURE__*/React.createElement("div", {
    className: "sheet-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn ghost",
    onClick: () => setAdding(false)
  }, "Huỷ"), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: addRecipe
  }, "Thêm món"))) : /*#__PURE__*/React.createElement("div", {
    className: "sheet-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn ghost",
    onClick: () => setAdding(true)
  }, "+ Món mới"), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: () => setPicker(null)
  }, "Xong")))));
}

/* ────────────────────────────────────────────────────────────
   TAB: ĐI CHỢ
   ──────────────────────────────────────────────────────────── */
function GroceryTab({
  week,
  setWeek,
  recipes,
  isOwner,
  weekStart
}) {
  const wk = fmt(weekStart);
  const [txt, setTxt] = useState("");
  const [rtxt, setRtxt] = useState("");
  const bought = week.bought || {};
  const extras = week.extras || [];
  const requests = week.requests || [];
  const hidden = week.hidden || {};
  const fromMeals = useMemo(() => {
    const map = {};
    Object.values(week.meals || {}).forEach(arr => (arr || []).forEach(id => {
      const r = recipes.find(x => x.id === id);
      if (!r) return;
      r.ing.forEach(i => {
        map[i] = map[i] || {
          name: i,
          cat: catOf(i),
          for: []
        };
        map[i].for.push(r.name);
      });
    }));
    return Object.values(map);
  }, [week.meals, recipes]);
  const items = [...fromMeals.map(x => ({
    ...x,
    key: "m:" + x.name,
    auto: true
  })), ...extras.map(x => ({
    name: x.name,
    cat: x.cat || "Khác",
    key: "e:" + x.id,
    auto: false,
    id: x.id
  }))].filter(i => !hidden[i.key]);
  const hiddenCount = Object.values(hidden).filter(Boolean).length;
  const grouped = CAT_ORDER.map(c => ({
    cat: c,
    items: items.filter(i => i.cat === c && !bought[i.key])
  })).filter(g => g.items.length);
  const boughtList = items.filter(i => bought[i.key]);
  const toggleBuy = k => {
    const it = items.find(x => x.key === k);
    setWeek({
      ...week,
      bought: {
        ...bought,
        [k]: !bought[k]
      }
    }, it ? ops.shop(wk, it.name, it.cat, it.auto ? "món" : "tay", !bought[k]) : null);
  };

  // Xoá: món tự thêm thì xoá hẳn, món từ thực đơn thì ẩn khỏi tuần này
  const removeItem = i => {
    const nb = {
      ...bought
    };
    delete nb[i.key];
    if (i.auto) setWeek({
      ...week,
      bought: nb,
      hidden: {
        ...hidden,
        [i.key]: true
      }
    }, ops.shop(wk, i.name, i.cat, "ẩn", false));else setWeek({
      ...week,
      bought: nb,
      extras: extras.filter(e => e.id !== i.id)
    }, ops.shopDel(wk, i.name));
  };
  const restoreHidden = () => {
    const names = Object.keys(hidden).filter(k => hidden[k]).map(k => k.slice(2));
    setWeek({
      ...week,
      hidden: {}
    }, names.map(n => ({
      sheet: "Đi chợ",
      row: {
        "tuần": wk,
        "tên": n
      },
      remove: true
    })));
  };
  const addExtra = () => {
    const n = txt.trim();
    if (!n) return;
    setWeek({
      ...week,
      extras: [...extras, {
        id: n,
        name: n,
        cat: "Khác"
      }]
    }, ops.shop(wk, n, "Khác", "tay", false));
    setTxt("");
  };
  const addStaple = s => setWeek({
    ...week,
    extras: [...extras, {
      id: s.n,
      name: s.n,
      cat: s.c
    }]
  }, ops.shop(wk, s.n, s.c, "tay", false));
  const addReq = () => {
    const t = rtxt.trim();
    if (!t) return;
    setWeek({
      ...week,
      requests: [...requests, {
        id: t,
        text: t,
        done: false
      }]
    }, ops.shop(wk, t, "", "việc", false));
    setRtxt("");
  };
  const toggleReq = id => {
    const r0 = requests.find(r => r.id === id);
    setWeek({
      ...week,
      requests: requests.map(r => r.id === id ? {
        ...r,
        done: !r.done
      } : r)
    }, r0 ? ops.shop(wk, r0.text, "", "việc", !r0.done) : null);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "tab"
  }, /*#__PURE__*/React.createElement("div", {
    className: "shopweek"
  }, "Tuần ", weekStart.getDate(), "/", weekStart.getMonth() + 1, " – ", addDays(weekStart, 6).getDate(), "/", addDays(weekStart, 6).getMonth() + 1, /*#__PURE__*/React.createElement("span", {
    className: "muted"
  }, "· danh sách mới mỗi thứ hai")), /*#__PURE__*/React.createElement("div", {
    className: "addrow"
  }, /*#__PURE__*/React.createElement("input", {
    value: txt,
    onChange: e => setTxt(e.target.value),
    placeholder: "Thêm món cần mua…",
    onKeyDown: e => e.key === "Enter" && addExtra()
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn sm",
    onClick: addExtra
  }, "Thêm")), grouped.map(g => /*#__PURE__*/React.createElement("div", {
    key: g.cat,
    className: "section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "section-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, g.cat), /*#__PURE__*/React.createElement("span", {
    className: "section-total"
  }, g.items.length)), g.items.map(i => /*#__PURE__*/React.createElement("div", {
    key: i.key,
    className: "row"
  }, /*#__PURE__*/React.createElement(Check, {
    on: false,
    onClick: () => toggleBuy(i.key)
  }), /*#__PURE__*/React.createElement("div", {
    className: "row-body",
    onClick: () => toggleBuy(i.key)
  }, /*#__PURE__*/React.createElement("div", {
    className: "row-name"
  }, i.name, !i.auto && /*#__PURE__*/React.createElement("span", {
    className: "manual"
  }, "tự thêm")), i.for && /*#__PURE__*/React.createElement("div", {
    className: "row-meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ago"
  }, i.for.join(" · ")))), isOwner && /*#__PURE__*/React.createElement("button", {
    className: "del",
    onClick: () => removeItem(i),
    "aria-label": "Xoá " + i.name
  }, /*#__PURE__*/React.createElement(TrashIcon, null)))))), grouped.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "hint"
  }, "Chưa có gì trong danh sách. Chọn món ở tab Thực đơn để tự động tạo danh sách đi chợ."), hiddenCount > 0 && isOwner && /*#__PURE__*/React.createElement("div", {
    className: "restore"
  }, "Đã ẩn ", hiddenCount, " nguyên liệu từ thực đơn", /*#__PURE__*/React.createElement("button", {
    className: "link",
    onClick: restoreHidden
  }, "hiện lại")), STAPLE_GROUPS.map(g => /*#__PURE__*/React.createElement("div", {
    key: g.title,
    className: "section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "section-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, g.title)), /*#__PURE__*/React.createElement("div", {
    className: "staples"
  }, g.items.map(s => /*#__PURE__*/React.createElement("button", {
    key: s.n,
    className: "staple",
    onClick: () => addStaple(s)
  }, "+ ", s.n))))), /*#__PURE__*/React.createElement("div", {
    className: "section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "section-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "Đồ cần mua khác")), /*#__PURE__*/React.createElement("div", {
    className: "addrow"
  }, /*#__PURE__*/React.createElement("input", {
    value: rtxt,
    onChange: e => setRtxt(e.target.value),
    placeholder: "Ví dụ: cây lau nhà mới",
    onKeyDown: e => e.key === "Enter" && addReq()
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn sm",
    onClick: addReq
  }, "Thêm")), requests.map(r => /*#__PURE__*/React.createElement("div", {
    key: r.id,
    className: "row" + (r.done ? " done" : "")
  }, /*#__PURE__*/React.createElement(Check, {
    on: r.done,
    onClick: () => toggleReq(r.id)
  }), /*#__PURE__*/React.createElement("div", {
    className: "row-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "row-name"
  }, r.text)), isOwner && /*#__PURE__*/React.createElement("button", {
    className: "del",
    onClick: () => setWeek({
      ...week,
      requests: requests.filter(x => x.id !== r.id)
    }, ops.shopDel(wk, r.text)),
    "aria-label": "Xoá " + r.text
  }, /*#__PURE__*/React.createElement(TrashIcon, null))))), boughtList.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "section-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "Đã mua"), /*#__PURE__*/React.createElement("span", {
    className: "section-total"
  }, boughtList.length)), boughtList.map(i => /*#__PURE__*/React.createElement("div", {
    key: i.key,
    className: "row done"
  }, /*#__PURE__*/React.createElement(Check, {
    on: true,
    onClick: () => toggleBuy(i.key)
  }), /*#__PURE__*/React.createElement("div", {
    className: "row-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "row-name"
  }, i.name)), isOwner && /*#__PURE__*/React.createElement("button", {
    className: "del",
    onClick: () => removeItem(i),
    "aria-label": "Xoá " + i.name
  }, /*#__PURE__*/React.createElement(TrashIcon, null))))));
}

/* ────────────────────────────────────────────────────────────
   TAB: TUẦN & LỊCH SỬ
   ──────────────────────────────────────────────────────────── */
function WeekTab({
  weekStart,
  shiftWeek,
  weekDays,
  recipes,
  week,
  setWeek
}) {
  const [editing, setEditing] = useState(null); // ISO date
  const days = Array.from({
    length: 7
  }, (_, i) => addDays(weekStart, i));
  const confirm = week.confirm || {};
  let ticked = 0,
    totAll = 0,
    minPlan = 0,
    daysActive = 0,
    daysOk = 0;
  const byPerson = {
    diem: {
      actual: 0,
      std: 0,
      days: [],
      ok: 0,
      n: 0
    },
    lich: {
      actual: 0,
      std: 0,
      days: [],
      ok: 0,
      n: 0
    }
  };
  const rows = days.map(d => {
    const key = fmt(d);
    const {
      tasks,
      assign,
      custom
    } = planFor(week, d);
    const {
      actual,
      note,
      cap
    } = hoursFor(week, d);
    const done = weekDays[key]?.done || {};
    const nd = tasks.filter(t => done[t.id]).length;
    const mp = tasks.reduce((s, t) => s + t.min, 0);
    const whoKey = whoFor(week, d);
    const active = cap > 0 || tasks.length > 0;
    const ok = !!confirm[key];
    ticked += nd;
    totAll += tasks.length;
    minPlan += mp;
    if (active) {
      daysActive += 1;
      if (ok) daysOk += 1;
    }
    if (byPerson[whoKey] && active) {
      byPerson[whoKey].actual += actual;
      byPerson[whoKey].std += cap;
      byPerson[whoKey].n += 1;
      if (ok) byPerson[whoKey].ok += 1;
      byPerson[whoKey].days.push({
        d: DAY_VN_SHORT[d.getDay()],
        m: actual,
        cap,
        ok
      });
    }
    return {
      d,
      key,
      tasks,
      assign,
      custom,
      done,
      nd,
      mp,
      actual,
      note,
      cap,
      whoKey,
      who: PEOPLE[whoKey],
      active,
      ok
    };
  });
  const pct = daysActive ? Math.round(daysOk / daysActive * 100) : 0;
  const actualTot = byPerson.diem.actual + byPerson.lich.actual;
  const setHours = (key, patch) => {
    const hours = {
      ...(week.hours || {})
    };
    hours[key] = {
      ...(hours[key] || {}),
      ...patch
    };
    const row = rows.find(x => x.key === key);
    const actual = hours[key].actual != null ? hours[key].actual : row ? row.cap : 0;
    setWeek({
      ...week,
      hours
    }, ops.hours(key, row ? row.whoKey : "", actual, !!confirm[key], hours[key].note || ""));
  };
  const toggleConfirm = r => {
    const c = {
      ...confirm
    };
    const on = !c[r.key];
    if (on) c[r.key] = Date.now();else delete c[r.key];
    const h = week.hours?.[r.key] || {};
    setWeek({
      ...week,
      confirm: c
    }, ops.hours(r.key, r.whoKey, h.actual != null ? h.actual : r.cap, on, h.note || ""));
  };
  const setPlan = (key, patch) => {
    const plan = {
      ...(week.plan || {})
    };
    plan[key] = {
      ...(plan[key] || {}),
      ...patch
    };
    const p = plan[key];
    setWeek({
      ...week,
      plan
    }, ops.plan(key, p.tasks, p.assign || {}, p.shiftWho));
  };
  const resetPlan = key => {
    const plan = {
      ...(week.plan || {})
    };
    delete plan[key];
    setWeek({
      ...week,
      plan
    }, [{
      sheet: "Phân công",
      clear: {
        "ngày": key
      }
    }]);
  };
  const editRow = editing ? rows.find(r => r.key === editing) : null;
  return /*#__PURE__*/React.createElement("div", {
    className: "tab"
  }, /*#__PURE__*/React.createElement("div", {
    className: "weeknav"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => shiftWeek(-1)
  }, "‹"), /*#__PURE__*/React.createElement("span", null, "Tuần ", weekStart.getDate(), "/", weekStart.getMonth() + 1, " – ", addDays(weekStart, 6).getDate(), "/", addDays(weekStart, 6).getMonth() + 1), /*#__PURE__*/React.createElement("button", {
    onClick: () => shiftWeek(1)
  }, "›")), /*#__PURE__*/React.createElement("div", {
    className: "topsum"
  }, /*#__PURE__*/React.createElement(Donut, {
    pct: pct,
    size: 92
  }), /*#__PURE__*/React.createElement("div", {
    className: "topsum-side"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Bạn đã xác nhận"), /*#__PURE__*/React.createElement("div", {
    className: "topsum-line"
  }, daysOk, "/", daysActive, " ngày"), /*#__PURE__*/React.createElement("div", {
    className: "topsum-sub"
  }, hm(actualTot), " giờ công · Lịch/Diễm tự tick ", ticked, "/", totAll, " việc"))), /*#__PURE__*/React.createElement("div", {
    className: "section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "section-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "Giờ công theo người"), /*#__PURE__*/React.createElement("span", {
    className: "section-total"
  }, "để tính lương")), ["diem", "lich"].map(k => {
    const p = byPerson[k];
    const diff = p.actual - p.std;
    return /*#__PURE__*/React.createElement("div", {
      key: k,
      className: "pcard"
    }, /*#__PURE__*/React.createElement("div", {
      className: "pcard-top"
    }, /*#__PURE__*/React.createElement("span", {
      className: "avatar sm",
      style: {
        background: PEOPLE[k].color,
        color: PEOPLE[k].fg
      }
    }, PEOPLE[k].short), /*#__PURE__*/React.createElement("span", {
      className: "pname"
    }, PEOPLE[k].name), /*#__PURE__*/React.createElement("div", {
      className: "pstats"
    }, /*#__PURE__*/React.createElement("div", {
      className: "pbig"
    }, hm(p.actual)), /*#__PURE__*/React.createElement("div", {
      className: "psub"
    }, "chuẩn ", hm(p.std), diff !== 0 && /*#__PURE__*/React.createElement("span", {
      className: diff > 0 ? "over" : "under"
    }, " · ", diff > 0 ? "+" : "", diff, "′")))), p.days.length ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      className: "dgrid"
    }, p.days.map((x, idx) => /*#__PURE__*/React.createElement("div", {
      key: idx,
      className: "dcol" + (x.m !== x.cap ? " off" : "") + (x.ok ? " ok" : ""),
      title: (x.ok ? "Đã xác nhận" : "Chưa xác nhận") + (x.m !== x.cap ? " · khác ca chuẩn" : "")
    }, /*#__PURE__*/React.createElement("span", {
      className: "dcol-d"
    }, x.d, x.ok ? " ✓" : ""), /*#__PURE__*/React.createElement("span", {
      className: "dcol-t"
    }, x.m !== x.cap ? "≠ " : "", hm(x.m))))), /*#__PURE__*/React.createElement("div", {
      className: "psub pad"
    }, p.ok, "/", p.n, " ca đã xác nhận")) : /*#__PURE__*/React.createElement("div", {
      className: "psub pad"
    }, "Không có ca tuần này"));
  })), rows.map(r => /*#__PURE__*/React.createElement("div", {
    key: r.key,
    className: "wday" + (r.ok ? " finished" : "")
  }, /*#__PURE__*/React.createElement("div", {
    className: "wday-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dow"
  }, DAY_VN_SHORT[r.d.getDay()]), /*#__PURE__*/React.createElement("span", {
    className: "wday-date"
  }, r.d.getDate(), "/", r.d.getMonth() + 1), !r.active ? /*#__PURE__*/React.createElement("span", {
    className: "tag-rest"
  }, "nghỉ") : /*#__PURE__*/React.createElement("span", {
    className: "avatar sm",
    style: {
      background: r.who.color,
      color: r.who.fg
    }
  }, r.who.short), r.custom && /*#__PURE__*/React.createElement("span", {
    className: "tag-custom"
  }, "đã sửa"), r.ok && /*#__PURE__*/React.createElement("span", {
    className: "tag-ok"
  }, "đã xác nhận"), /*#__PURE__*/React.createElement("button", {
    className: "edit-btn",
    onClick: () => setEditing(r.key)
  }, "Sửa")), r.active && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "hours-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "Giờ thực tế"), /*#__PURE__*/React.createElement("div", {
    className: "stepper"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setHours(r.key, {
      actual: Math.max(0, (Math.ceil(r.actual / 30) - 1) * 30)
    })
  }, "−"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: r.actual,
    step: 30,
    min: 0,
    onChange: e => setHours(r.key, {
      actual: Math.max(0, Number(e.target.value) || 0)
    })
  }), /*#__PURE__*/React.createElement("span", {
    className: "unit"
  }, "phút"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setHours(r.key, {
      actual: (Math.floor(r.actual / 30) + 1) * 30
    })
  }, "+"))), /*#__PURE__*/React.createElement("div", {
    className: "hours-meta"
  }, /*#__PURE__*/React.createElement("span", null, hm(r.actual)), r.actual !== r.cap && /*#__PURE__*/React.createElement("span", {
    className: r.actual > r.cap ? "over" : "under"
  }, r.actual > r.cap ? " +" : " ", r.actual - r.cap, "′ so với ca chuẩn ", hm(r.cap)), r.actual === r.cap && /*#__PURE__*/React.createElement("span", {
    className: "muted"
  }, " đúng ca chuẩn"), /*#__PURE__*/React.createElement("button", {
    className: "link",
    onClick: () => setHours(r.key, {
      actual: r.cap
    })
  }, "đặt lại")), /*#__PURE__*/React.createElement("input", {
    className: "hnote",
    value: r.note,
    placeholder: "Ghi chú giờ công (về sớm, làm thêm…)",
    onChange: e => setHours(r.key, {
      note: e.target.value
    })
  }), /*#__PURE__*/React.createElement("div", {
    className: "wday-time"
  }, /*#__PURE__*/React.createElement(Meter, {
    used: r.mp,
    cap: r.actual || r.cap
  })), /*#__PURE__*/React.createElement("div", {
    className: "wday-plan"
  }, r.tasks.length, " việc · kế hoạch ", r.mp, "′", r.mp !== r.actual && /*#__PURE__*/React.createElement("span", {
    className: r.mp > r.actual ? "over" : "under"
  }, r.mp > r.actual ? ` · vượt ${r.mp - r.actual}′` : ` · dư ${r.actual - r.mp}′`)), /*#__PURE__*/React.createElement("div", {
    className: "wday-tasks"
  }, r.tasks.map(t => {
    const owner = r.assign[t.id];
    return /*#__PURE__*/React.createElement("span", {
      key: t.id,
      className: "mini" + (r.done[t.id] ? " on" : "")
    }, r.done[t.id] ? "✓ " : "", t.name, owner && owner !== r.whoKey && /*#__PURE__*/React.createElement("b", {
      style: {
        color: PEOPLE[owner].deep
      }
    }, " ", PEOPLE[owner].short));
  }), r.tasks.length === 0 && /*#__PURE__*/React.createElement("span", {
    className: "empty"
  }, "Chưa giao việc nào")), weekDays[r.key]?.note && /*#__PURE__*/React.createElement("div", {
    className: "daynote-show"
  }, "✎ ", r.who.name, ": ", weekDays[r.key].note), r.tasks.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "tickinfo"
  }, r.who.name, " đã tự tick ", r.nd, "/", r.tasks.length, " việc", /*#__PURE__*/React.createElement("span", {
    className: "muted"
  }, " — chỉ để tham khảo")), /*#__PURE__*/React.createElement("button", {
    className: "done-btn" + (r.ok ? " on" : ""),
    onClick: () => toggleConfirm(r)
  }, r.ok ? "✓ Đã xác nhận — bỏ xác nhận" : "Xác nhận ngày này hoàn thành"))), !r.active && /*#__PURE__*/React.createElement("div", {
    className: "wday-plan"
  }, "Không có người giúp việc. Chạm “Sửa” để giao việc."))), /*#__PURE__*/React.createElement(Backup, null), editRow && /*#__PURE__*/React.createElement(PlanEditor, {
    row: editRow,
    onClose: () => setEditing(null),
    setPlan: setPlan,
    resetPlan: resetPlan
  }));
}

/* Sao lưu dữ liệu — dán ra ngoài để giữ lịch sử giờ công */
function Backup() {
  const [state, setState] = useState("idle"); // idle | working | ready | error
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const run = async () => {
    setState("working");
    setCopied(false);
    try {
      const data = await apiLoad();
      const json = JSON.stringify(data, null, 2);
      setText(json);
      setState("ready");
      try {
        await navigator.clipboard.writeText(json);
        setCopied(true);
      } catch {}
    } catch {
      setState("error");
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "section backup"
  }, /*#__PURE__*/React.createElement("div", {
    className: "section-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "Sao lưu dữ liệu"), /*#__PURE__*/React.createElement("span", {
    className: "section-total"
  }, "bản sao từ Google Sheets")), state !== "ready" ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    className: "btn wide",
    onClick: run,
    disabled: state === "working"
  }, state === "working" ? "Đang lấy dữ liệu…" : "Xuất toàn bộ dữ liệu"), state === "error" && /*#__PURE__*/React.createElement("div", {
    className: "backup-note err-t"
  }, "Không lấy được dữ liệu. Thử lại sau."), state === "idle" && /*#__PURE__*/React.createElement("div", {
    className: "backup-note"
  }, "Nên xuất mỗi cuối tháng. Dán nội dung vào Notes hoặc Google Docs để lưu.")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "backup-note ok-t"
  }, copied ? "✓ Đã sao chép. Dán vào Notes hoặc Google Docs để lưu." : "Chọn hết nội dung bên dưới rồi sao chép."), /*#__PURE__*/React.createElement("textarea", {
    className: "backup-box",
    readOnly: true,
    value: text,
    onFocus: e => e.target.select(),
    rows: 6
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn ghost wide",
    onClick: () => {
      setState("idle");
      setText("");
    }
  }, "Đóng")));
}

/* Bảng chọn việc & người cho một ngày */
function PlanEditor({
  row,
  onClose,
  setPlan,
  resetPlan
}) {
  const [ids, setIds] = useState(row.tasks.map(t => t.id));
  const [assign, setAssign] = useState(row.assign);
  const [shiftWho, setShiftWho] = useState(row.whoKey);
  const defWho = shiftWho;
  const groups = [{
    title: "Việc hàng ngày",
    items: byTime(ALL_TASKS.filter(t => t.kind === "daily"))
  }, {
    title: "Việc hàng tuần",
    items: byTime(ALL_TASKS.filter(t => t.kind === "weekly"))
  }, {
    title: "Việc hàng tháng",
    items: byTime(ALL_TASKS.filter(t => t.kind === "monthly"))
  }];
  const total = ids.map(i => taskById(i)).filter(Boolean).reduce((s, t) => s + t.min, 0);
  const toggle = id => setIds(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  const setWho = (id, who) => {
    const a = {
      ...assign
    };
    if (who === defWho) delete a[id];else a[id] = who;
    setAssign(a);
  };
  const [askReset, setAskReset] = useState(false);
  const save = () => {
    setPlan(row.key, {
      tasks: ids,
      assign,
      shiftWho
    });
    onClose();
  };
  const reset = () => {
    resetPlan(row.key);
    onClose();
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "sheet-bg",
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    className: "sheet tall",
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "sheet-title"
  }, "Việc ngày ", DAY_VN[row.d.getDay()], " ", row.d.getDate(), "/", row.d.getMonth() + 1), /*#__PURE__*/React.createElement("div", {
    className: "shiftpick"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "Người làm ca này"), /*#__PURE__*/React.createElement("div", {
    className: "whopick"
  }, ["diem", "lich", "ban"].map(k => /*#__PURE__*/React.createElement("button", {
    key: k,
    className: "wpn" + (shiftWho === k ? " on" : ""),
    style: shiftWho === k ? {
      background: PEOPLE[k].color,
      borderColor: PEOPLE[k].color,
      color: PEOPLE[k].fg
    } : {},
    onClick: () => setShiftWho(k)
  }, PEOPLE[k].name)))), shiftWho !== SHIFTS[row.d.getDay()].who && /*#__PURE__*/React.createElement("div", {
    className: "swap-note"
  }, "Đổi ca: giờ công ngày này sẽ tính cho ", PEOPLE[shiftWho].name, " thay vì ", PEOPLE[SHIFTS[row.d.getDay()].who].name, "."), /*#__PURE__*/React.createElement("div", {
    className: "editor-bar"
  }, /*#__PURE__*/React.createElement("span", null, ids.length, " việc · ", total, "′"), /*#__PURE__*/React.createElement("span", {
    className: total > row.actual ? "over" : "under"
  }, "ca ", hm(row.actual), " ", total > row.actual ? `· vượt ${total - row.actual}′` : `· dư ${row.actual - total}′`)), /*#__PURE__*/React.createElement("div", {
    className: "picklist"
  }, groups.map(g => /*#__PURE__*/React.createElement("div", {
    key: g.title,
    className: "egroup"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, g.title), g.items.map(t => {
    const on = ids.includes(t.id);
    const who = assign[t.id] || defWho;
    return /*#__PURE__*/React.createElement("div", {
      key: t.id,
      className: "erow" + (on ? " on" : "")
    }, /*#__PURE__*/React.createElement(Check, {
      on: on,
      onClick: () => toggle(t.id)
    }), /*#__PURE__*/React.createElement("div", {
      className: "erow-body",
      onClick: () => toggle(t.id)
    }, /*#__PURE__*/React.createElement("div", {
      className: "erow-name"
    }, t.name), /*#__PURE__*/React.createElement("div", {
      className: "row-meta"
    }, /*#__PURE__*/React.createElement("span", {
      className: "pill"
    }, t.room), /*#__PURE__*/React.createElement("span", {
      className: "mins"
    }, mins(t.min)), t.kind === "monthly" && /*#__PURE__*/React.createElement("span", {
      className: "ago"
    }, "tuần ", t.wk))), on && /*#__PURE__*/React.createElement("div", {
      className: "whopick"
    }, ["diem", "lich", "ban"].map(k => /*#__PURE__*/React.createElement("button", {
      key: k,
      className: "wp" + (who === k ? " on" : ""),
      style: who === k ? {
        background: PEOPLE[k].color,
        borderColor: PEOPLE[k].color,
        color: PEOPLE[k].fg
      } : {},
      onClick: () => setWho(t.id, k)
    }, PEOPLE[k].short))));
  })))), /*#__PURE__*/React.createElement("div", {
    className: "sheet-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn ghost" + (askReset ? " danger" : ""),
    onClick: () => askReset ? reset() : setAskReset(true)
  }, askReset ? "Xoá tuỳ chỉnh?" : "Về mặc định"), /*#__PURE__*/React.createElement("button", {
    className: "btn ghost",
    onClick: onClose
  }, "Huỷ"), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: save
  }, "Lưu"))));
}

/* ────────────────────────────────────────────────────────────
   APP
   ──────────────────────────────────────────────────────────── */
function App() {
  const [tab, setTab] = useState("today");
  const [today, setToday] = useState(fmt(new Date()));
  const [weekStart, setWeekStart] = useState(mondayOf(new Date()));
  const [me, setMe] = useState(null);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [recipes, setRecipesState] = useState([]);
  const [meta, setMetaState] = useState({
    notes: {}
  });
  const [days, setDays] = useState({});
  const [weeks, setWeeks] = useState({});
  const [err, setErr] = useState(null);
  const [sync, setSync] = useState("saved"); // dirty | saving | saved | error
  const [ready, setReady] = useState(false);
  const wKey = fmt(weekStart);
  const week = weeks[wKey] || {
    meals: {},
    bought: {},
    extras: [],
    requests: [],
    plan: {},
    hours: {},
    confirm: {},
    hidden: {}
  };
  const queue = useRef(null);
  if (!queue.current) queue.current = makeQueue(setSync);
  const push = o => queue.current.push(o);

  // ── nạp toàn bộ dữ liệu từ Google Sheets ──
  const loadAll = useCallback(async () => {
    if (!GS.url || GS.url.indexOf("PASTE") === 0) {
      setErr("Chưa cấu hình. Mở config.js và dán URL + token của Google Apps Script.");
      setLoading(false);
      return;
    }
    try {
      const j = await apiLoad();
      applyConfig(j.config || {});
      const built = buildState(j.state || {});
      setRecipesState(SEED_RECIPES);
      setWeeks(built.weeks);
      setDays(built.days);
      setMetaState({
        notes: built.notes
      });
      setReady(true);
      setErr(null);
    } catch (e) {
      setErr("Không kết nối được Google Sheets. Kiểm tra URL, token và quyền truy cập (Anyone).");
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // nhớ người dùng trên thiết bị này
  useEffect(() => {
    try {
      const k = localStorage.getItem("vn:me");
      if (k) setMe(k);
    } catch {}
    setChecking(false);
  }, []);
  const signIn = k => {
    setMe(k);
    try {
      localStorage.setItem("vn:me", k);
    } catch {}
  };
  const signOut = () => {
    setMe(null);
    try {
      localStorage.removeItem("vn:me");
    } catch {}
  };
  const patchWeek = w => setWeeks(p => ({
    ...p,
    [wKey]: w
  }));

  // ── ghi ──
  const setWeek = useCallback((w, o) => {
    patchWeek(w);
    if (o) push(o);
  }, [wKey]);
  const setRecipes = useCallback(list => {
    const added = list[list.length - 1];
    setRecipesState(list);
    SEED_RECIPES = list;
    if (added) push(ops.recipe(added));
  }, []);
  const setMeta = useCallback((m, o) => {
    setMetaState(m);
    if (o) push(o);
  }, []);
  const toggle = t => {
    const cur = days[today]?.done || {};
    const on = !!cur[t.id];
    const nextDone = {
      ...cur
    };
    if (on) delete nextDone[t.id];else nextDone[t.id] = {
      by: me
    };
    setDays(p => ({
      ...p,
      [today]: {
        ...(p[today] || {}),
        done: nextDone
      }
    }));
    push(ops.done(today, t.id, me, !on));
  };
  const setDayNote = text => {
    setDays(p => ({
      ...p,
      [today]: {
        ...(p[today] || {
          done: {}
        }),
        note: text
      }
    }));
    push(ops.note("ngày:" + today, text));
  };
  const setNote = (id, text) => {
    const notes = {
      ...(meta.notes || {})
    };
    if (text) notes[id] = text;else delete notes[id];
    setMeta({
      ...meta,
      notes
    }, ops.note(id, text));
  };
  const isOwner = me === OWNER;

  // Người giúp việc chỉ xem được ngày hôm nay
  useEffect(() => {
    if (me && !isOwner) setToday(fmt(new Date()));
  }, [me, isOwner]);

  // Tab Hôm nay luôn dùng dữ liệu của tuần chứa ngày đang xem
  useEffect(() => {
    if (tab !== "today") return;
    const m = mondayOf(parse(today));
    if (fmt(m) !== fmt(weekStart)) setWeekStart(m);
  }, [tab, today, weekStart]);

  // Qua ngày mới thì tự chuyển, kể cả khi app mở suốt đêm
  const lastNow = useRef(fmt(new Date()));
  useEffect(() => {
    const id = setInterval(() => {
      const now = fmt(new Date());
      if (now === lastNow.current) return;
      const was = lastNow.current;
      lastNow.current = now;
      // chỉ nhảy sang ngày mới nếu đang xem "hôm nay"
      setToday(prev => !isOwner || prev === was ? now : prev);
    }, 60000);
    return () => clearInterval(id);
  }, [isOwner]);
  if (checking || loading) return /*#__PURE__*/React.createElement("div", {
    className: "loading"
  }, "Đang tải…");
  if (err) return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, CSS), /*#__PURE__*/React.createElement("div", {
    className: "app gate"
  }, /*#__PURE__*/React.createElement("div", {
    className: "gate-inner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "gate-brand"
  }, "Việc nhà"), /*#__PURE__*/React.createElement("div", {
    className: "setup-err"
  }, err), /*#__PURE__*/React.createElement("button", {
    className: "btn wide",
    onClick: () => {
      setLoading(true);
      loadAll();
    }
  }, "Thử lại"))));
  if (!ready) return /*#__PURE__*/React.createElement("div", {
    className: "loading"
  }, "Đang tải…");
  if (!me) return /*#__PURE__*/React.createElement(Gate, {
    onEnter: signIn
  });
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, CSS), /*#__PURE__*/React.createElement("div", {
    className: "app"
  }, /*#__PURE__*/React.createElement("header", {
    className: "hdr"
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand"
  }, /*#__PURE__*/React.createElement("span", {
    className: "brand-icon"
  }, /*#__PURE__*/React.createElement(TabIcon, {
    name: tab
  })), /*#__PURE__*/React.createElement("span", null, TAB_LABEL[tab])), /*#__PURE__*/React.createElement("button", {
    className: "refresh",
    onClick: () => {
      queue.current.flush();
      loadAll();
    },
    title: "Tải lại từ Google Sheets",
    "aria-label": "Tải lại"
  }, "⟳"), /*#__PURE__*/React.createElement("button", {
    className: "whoami",
    onClick: signOut,
    title: "Đổi người"
  }, /*#__PURE__*/React.createElement("span", {
    className: "whoami-n"
  }, PEOPLE[me].name), /*#__PURE__*/React.createElement("span", {
    className: "avatar sm",
    style: {
      background: PEOPLE[me].color,
      color: PEOPLE[me].fg
    }
  }, PEOPLE[me].short))), err && /*#__PURE__*/React.createElement("div", {
    className: "err"
  }, err), sync !== "saved" && /*#__PURE__*/React.createElement("div", {
    className: "syncbar " + sync
  }, sync === "saving" ? "Đang lưu…" : sync === "error" ? "⚠ Chưa lưu được — sẽ thử lại. Kiểm tra mạng." : "Có thay đổi chưa lưu"), /*#__PURE__*/React.createElement("main", null, tab === "today" && /*#__PURE__*/React.createElement(TodayTab, {
    today: today,
    setToday: setToday,
    dayData: days[today],
    toggle: toggle,
    meta: meta,
    setNote: setNote,
    week: week,
    recipes: recipes,
    me: me,
    isOwner: isOwner,
    dayNote: days[today]?.note || "",
    setDayNote: setDayNote
  }), tab === "meals" && /*#__PURE__*/React.createElement(MealsTab, {
    week: week,
    setWeek: setWeek,
    weekStart: weekStart,
    shiftWeek: shiftWeek,
    recipes: recipes,
    setRecipes: setRecipes,
    isOwner: isOwner
  }), tab === "shop" && /*#__PURE__*/React.createElement(GroceryTab, {
    week: week,
    setWeek: setWeek,
    recipes: recipes,
    isOwner: isOwner,
    weekStart: weekStart
  }), tab === "week" && isOwner && /*#__PURE__*/React.createElement(WeekTab, {
    weekStart: weekStart,
    shiftWeek: shiftWeek,
    weekDays: days,
    recipes: recipes,
    week: week,
    setWeek: setWeek
  })), /*#__PURE__*/React.createElement("nav", {
    className: "tabs"
  }, [["today", "Hôm nay"], ["meals", "Thực đơn"], ["shop", "Đi chợ"], ...(isOwner ? [["week", "Tuần"]] : [])].map(([k, l]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    className: tab === k ? "on" : "",
    onClick: () => setTab(k)
  }, /*#__PURE__*/React.createElement(TabIcon, {
    name: k
  }), /*#__PURE__*/React.createElement("span", null, l))))));
}

/* ────────────────────────────────────────────────────────────
   CSS
   ──────────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;800&display=swap');

.app, .app * { box-sizing: border-box; }
.app {
  --paper:#FAF7F2; --card:#FFFFFF; --ink:#2C2142; --muted:#8A8290;
  --line:#EAE4DC;
  --brand:#7C5CD6; --brand-soft:#EFEAFC;
  --jade:#4FBFAE; --indigo:#7C5CD6; --amber:#EE9A4D; --clay:#E8654F;
  --violet:#8B6FE0; --violet-deep:#5B3FB0; --violet-soft:#EDE6FC;
  --pink:#EF7C9F; --pink-deep:#C24468; --pink-soft:#FCE6EE;
  --gold:#E8B33C; --gold-deep:#9A6E0C; --gold-soft:#FCF2DC;
  --teal:#5FC3B4; --peach:#F8A97C;
  font-family:'Be Vietnam Pro', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  background:var(--paper); color:var(--ink);
  max-width:560px; margin:0 auto; min-height:100vh;
  padding-bottom:106px; font-size:18.8px; line-height:1.45;
}
.loading{ padding:60px 20px; text-align:center; color:#6E7F76; font-family:system-ui,sans-serif; }

.hdr{ position:sticky; top:0; z-index:20; background:var(--paper);
  padding:11px 16px; border-bottom:1px solid var(--line);
  display:flex; align-items:center; justify-content:space-between; gap:12px; }
.brand{ display:flex; align-items:center; gap:10px;
  font-weight:800; font-size:22.5px; letter-spacing:-.02em; }
.brand-icon{ width:38px; height:38px; border-radius:10px; background:var(--brand-soft);
  color:var(--brand); display:grid; place-items:center; flex:none; }
.brand-icon svg{ width:21px; height:21px; }
.whoami{ display:flex; align-items:center; gap:8px; border:1px solid var(--line);
  background:var(--card); border-radius:999px; padding:3px 4px 3px 12px;
  font-family:inherit; cursor:pointer; color:var(--ink); }
.whoami-n{ font-size:16.9px; font-weight:700; }

main{ padding:14px 16px 24px; }
.err{ margin:12px 16px; padding:10px 12px; background:#FBE9E7; color:var(--clay);
  border-radius:10px; font-size:16.2px; }

.eyebrow{ font-size:13.1px; text-transform:uppercase; letter-spacing:.11em;
  color:var(--muted); font-weight:600; }

.strip{ display:flex; gap:4px; background:var(--card); border:1px solid var(--line);
  border-radius:18px; padding:10px 7px; margin-bottom:10px; }
.sday{ flex:1; display:flex; flex-direction:column; align-items:center; gap:5px;
  background:none; border:none; padding:5px 0 3px; font-family:inherit; cursor:pointer;
  border-radius:13px; }
.sday:disabled{ cursor:default; }
.sday.sel{ background:var(--brand-soft); }
.sday-d{ font-size:13.1px; font-weight:700; color:var(--muted); letter-spacing:.03em; }
.sday-n{ width:38px; height:38px; border-radius:50%; display:grid; place-items:center;
  font-size:16.2px; font-weight:700; color:var(--muted); font-variant-numeric:tabular-nums; }
.sday.work .sday-n{ box-shadow:0 2px 7px rgba(44,33,66,.16); }
.sday-dot{ width:4px; height:4px; border-radius:50%; background:transparent; }
.sday-dot.on{ background:var(--brand); }
.legend{ display:flex; gap:14px; justify-content:center; margin-bottom:12px; }
.lg{ display:flex; align-items:center; gap:5px; font-size:14.4px; color:var(--muted); font-weight:600; }
.lg i{ width:9px; height:9px; border-radius:50%; display:inline-block; }

.daynav, .weeknav{ display:flex; align-items:center; justify-content:space-between;
  gap:10px; margin-bottom:14px; }
.daynav>button, .weeknav>button{ width:44px; height:44px; border-radius:10px; border:1px solid var(--line);
  background:var(--card); font-size:23.8px; color:var(--ink); cursor:pointer; flex:none; line-height:1; }
.daynav>div{ text-align:center; flex:1; }
.daynav-date{ font-weight:700; font-size:21.2px; letter-spacing:-.01em; }
.weeknav>span{ font-weight:600; font-size:17.5px; }
.link{ background:none; border:none; color:var(--jade); font-size:15px;
  text-decoration:underline; cursor:pointer; font-family:inherit; padding:2px; }

.shift-card{ background:var(--card); border:1px solid var(--line); border-radius:14px;
  padding:14px; margin-bottom:14px; }
.shift-top{ display:flex; align-items:center; gap:11px; margin-bottom:12px; }
.avatar{ width:42px; height:42px; border-radius:50%; color:#fff; display:grid; place-items:center;
  font-weight:800; font-size:16.2px; flex:none; }
.avatar.sm{ width:30px; height:30px; font-size:13.1px; }
.shift-name{ font-weight:700; font-size:20px; }
.shift-cap{ font-size:15px; color:var(--muted); }

.meter-wrap{ display:flex; align-items:center; gap:10px; }
.meter-track{ position:relative; flex:1; height:9px; background:var(--brand-soft); border-radius:5px; overflow:hidden; }
.meter-fill{ position:absolute; inset:0 auto 0 0; border-radius:5px; transition:width .25s ease; }
.meter-tick{ position:absolute; top:0; bottom:0; width:1px; background:rgba(255,255,255,.75); }
.meter-label{ font-size:15.6px; font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap; }
.meter-label .muted{ color:var(--muted); font-weight:400; }
.meter-label .over{ color:var(--clay); }

.dinner-strip, .rest-meal{ background:var(--card); border:1px solid var(--line);
  border-left:3px solid var(--amber); border-radius:12px; padding:11px 13px; margin-bottom:14px; }
.dish-line{ font-size:17.5px; margin-top:3px; }
.dish-line b{ font-size:13.1px; text-transform:uppercase; letter-spacing:.08em;
  color:var(--muted); font-weight:600; margin-right:6px; }

.section{ margin-bottom:18px; }
.section-head{ display:flex; justify-content:space-between; align-items:baseline;
  padding:0 2px 7px; }
.section-total{ font-size:15px; color:var(--muted); font-variant-numeric:tabular-nums; }

.row{ display:flex; gap:11px; align-items:flex-start; background:var(--card);
  border:1px solid var(--line); border-radius:12px; padding:11px 12px; margin-bottom:7px; }
.row.done{ background:#F4FBF9; border-color:#DBF0EB; }
.row.done .row-name{ text-decoration:line-through; color:var(--muted); }
.row-body{ flex:1; min-width:0; cursor:pointer; }
.row-name{ font-size:18.1px; font-weight:500; }
.row-meta{ display:flex; gap:7px; align-items:center; margin-top:3px; flex-wrap:wrap; }
.pill{ font-size:13.1px; background:var(--brand-soft); color:var(--brand); padding:2px 7px;
  border-radius:999px; font-weight:600; }
.mins{ font-size:14.4px; color:var(--muted); font-variant-numeric:tabular-nums; }
.ago{ font-size:14.4px; color:var(--muted); }
.manual{ font-size:12.5px; color:var(--amber); margin-left:7px; font-weight:600; }
.note{ margin-top:5px; font-size:15.6px; color:var(--muted); background:#F6F4EC;
  padding:5px 8px; border-radius:7px; }

.chk{ width:32px; height:32px; border-radius:8px; border:1.5px solid var(--line);
  background:#fff; flex:none; cursor:pointer; font-size:15px; font-weight:700;
  color:#fff; display:grid; place-items:center; font-family:inherit; margin-top:1px; }
.chk.on{ background:var(--brand); border-color:var(--brand); }

.rest-card{ background:var(--card); border:1px solid var(--line); border-radius:14px;
  padding:22px 16px; text-align:center; }
.rest-title{ font-weight:700; font-size:21.2px; }
.rest-sub{ font-size:16.2px; color:var(--muted); margin-top:5px; }
.rest-meal{ margin-top:14px; text-align:left; }

.hint{ font-size:16.2px; color:var(--muted); background:var(--card); border:1px dashed var(--line);
  border-radius:12px; padding:14px; text-align:center; }

.btn{ background:var(--brand); color:#fff; border:none; border-radius:10px;
  padding:10px 15px; font-size:17.5px; font-weight:600; font-family:inherit; cursor:pointer;
  text-decoration:none; display:inline-block; text-align:center; }
.btn.ghost{ background:var(--card); color:var(--ink); border:1px solid var(--line); font-weight:500; }
.btn.sm{ padding:8px 12px; font-size:16.2px; }
.btn.wide{ width:100%; margin-top:6px; }

.mealday{ background:var(--card); border:1px solid var(--line); border-radius:12px;
  padding:11px 12px; margin-bottom:7px; cursor:pointer; }
.mealday-head{ display:flex; align-items:center; gap:8px; }
.dow{ font-weight:800; font-size:15px; background:var(--brand); color:#fff;
  border-radius:6px; padding:2px 7px; letter-spacing:.02em; }
.mealday-date, .wday-date{ font-size:15px; color:var(--muted); }
.tag-rest{ font-size:12.5px; background:#F2EEE2; color:var(--amber); padding:2px 7px;
  border-radius:999px; font-weight:600; }
.mealday-body{ margin-top:7px; display:flex; flex-direction:column; gap:3px; }
.dish-chip{ font-size:17.5px; }
.dish-type{ font-size:12.5px; text-transform:uppercase; letter-spacing:.07em;
  color:var(--muted); margin-right:7px; font-weight:600; }
.empty{ font-size:16.2px; color:var(--muted); font-style:italic; }
.empty.pad{ padding:18px; text-align:center; }

.sheet-bg{ position:fixed; inset:0; background:rgba(44,33,66,.42); z-index:50;
  display:flex; align-items:flex-end; justify-content:center; }
.sheet{ background:var(--paper); width:100%; max-width:560px; border-radius:18px 18px 0 0;
  padding:18px 16px calc(18px + env(safe-area-inset-bottom)); max-height:88vh; overflow:auto; }
.sheet.tall{ height:88vh; display:flex; flex-direction:column; }
.sheet-title{ font-weight:700; font-size:20px; margin-bottom:12px; }
.sheet textarea, .sheet input, .sheet select, .addrow input, .search{
  width:100%; border:1px solid var(--line); border-radius:10px; padding:10px 12px;
  font-family:inherit; font-size:17.5px; background:#fff; color:var(--ink); margin-top:6px; }
.sheet-actions{ display:flex; gap:8px; justify-content:flex-end; margin-top:12px; }

.types{ display:flex; gap:6px; overflow-x:auto; padding-bottom:4px; }
.type-btn{ border:1px solid var(--line); background:var(--card); border-radius:999px;
  padding:6px 12px; font-size:16.2px; white-space:nowrap; font-family:inherit;
  color:var(--ink); cursor:pointer; }
.type-btn.on{ background:var(--brand); color:#fff; border-color:var(--brand); }
.picklist{ flex:1; overflow:auto; margin-top:10px; }
.pick{ display:flex; flex-direction:column; align-items:flex-start; gap:2px; width:100%;
  text-align:left; background:var(--card); border:1px solid var(--line); border-radius:10px;
  padding:10px 12px; margin-bottom:6px; font-family:inherit; cursor:pointer; color:var(--ink); }
.pick span:first-child{ font-size:18.1px; font-weight:500; }
.pick.on{ border-color:var(--brand); background:var(--brand-soft); }
.pick.used{ opacity:.45; cursor:not-allowed; }
.ing{ font-size:14.4px; color:var(--muted); }
.used-tag{ font-size:13.8px; color:var(--clay); }
.addbox{ border-top:1px solid var(--line); padding-top:10px; margin-top:10px; }

.addrow{ display:flex; gap:8px; margin-bottom:14px; align-items:stretch; }
.addrow input{ margin-top:0; }
.staples{ display:flex; flex-wrap:wrap; gap:6px; }
.staple{ border:1px solid var(--line); background:var(--card); border-radius:999px;
  padding:6px 11px; font-size:15.6px; font-family:inherit; color:var(--ink); cursor:pointer; }

.summary{ display:flex; gap:10px; margin-bottom:16px; }
.summary>div{ flex:1; background:var(--card); border:1px solid var(--line);
  border-radius:12px; padding:13px; }
.big{ font-size:32.5px; font-weight:800; letter-spacing:-.03em; font-variant-numeric:tabular-nums; }
.slash{ font-size:18.8px; font-weight:500; color:var(--muted); }

.wday{ background:var(--card); border:1px solid var(--line); border-radius:12px;
  padding:11px 12px; margin-bottom:7px; }
.wday-head{ display:flex; align-items:center; gap:8px; }
.wday-count{ margin-left:auto; font-size:15.6px; color:var(--muted);
  font-variant-numeric:tabular-nums; }
.wday-shift{ font-size:13.8px; background:#EDF1EB; color:var(--muted); padding:2px 7px;
  border-radius:999px; font-weight:600; }
.wday-time{ margin-top:9px; }
.wday-plan{ margin-top:6px; font-size:14.4px; color:var(--muted);
  font-variant-numeric:tabular-nums; }
.wday-plan .over{ color:var(--clay); font-weight:600; }
.wday-plan .under{ color:var(--jade); font-weight:600; }
.tag-custom{ font-size:12.5px; background:#EAF0F7; color:var(--indigo); padding:2px 7px;
  border-radius:999px; font-weight:600; }
.edit-btn{ margin-left:auto; border:1px solid var(--line); background:#fff; color:var(--ink);
  border-radius:8px; padding:4px 11px; font-size:15px; font-family:inherit; cursor:pointer; }

.hours-row{ display:flex; align-items:center; justify-content:space-between; gap:10px;
  margin-top:11px; padding-top:11px; border-top:1px dashed var(--line); }
.stepper{ display:flex; align-items:center; gap:5px; }
.stepper button{ width:35px; height:35px; border-radius:8px; border:1px solid var(--line);
  background:#fff; font-size:20px; line-height:1; color:var(--ink); cursor:pointer;
  font-family:inherit; flex:none; }
.stepper input{ width:70px; text-align:center; border:1px solid var(--line); border-radius:8px;
  padding:5px 4px; font-family:inherit; font-size:17.5px; font-weight:600; background:#fff;
  color:var(--ink); font-variant-numeric:tabular-nums; }
.stepper .unit{ font-size:14.4px; color:var(--muted); }
.hours-meta{ margin-top:5px; font-size:14.4px; color:var(--muted); display:flex;
  align-items:center; gap:4px; flex-wrap:wrap; font-variant-numeric:tabular-nums; }
.hours-meta .over{ color:var(--clay); font-weight:600; }
.hours-meta .under{ color:var(--amber); font-weight:600; }
.hnote{ width:100%; margin-top:7px; border:1px solid var(--line); border-radius:9px;
  padding:7px 10px; font-family:inherit; font-size:15.6px; background:#fff; color:var(--ink); }

.prow{ display:flex; align-items:center; gap:9px; background:var(--card);
  border:1px solid var(--line); border-radius:10px; padding:11px 12px; margin-bottom:6px; }
.pname{ font-size:17.5px; font-weight:600; width:56px; flex:none; }
.pstats{ margin-left:auto; text-align:right; }
.pbig{ font-size:21.2px; font-weight:800; letter-spacing:-.02em; font-variant-numeric:tabular-nums; }
.psub{ font-size:13.8px; color:var(--muted); font-variant-numeric:tabular-nums; }
.psub .over{ color:var(--clay); font-weight:600; }
.psub .under{ color:var(--amber); font-weight:600; }

.topsum{ display:flex; align-items:center; gap:16px; background:var(--card);
  border:1px solid var(--line); border-radius:14px; padding:16px; margin-bottom:16px; }
.donut{ position:relative; flex:none; }
.donut-val{ position:absolute; inset:0; display:grid; place-items:center;
  font-size:25px; font-weight:800; letter-spacing:-.03em; font-variant-numeric:tabular-nums; }
.donut-val span{ font-size:13.8px; font-weight:600; margin-left:1px; }
.topsum-side{ min-width:0; }
.topsum-line{ font-size:23.8px; font-weight:800; letter-spacing:-.02em; margin-top:3px;
  font-variant-numeric:tabular-nums; }
.topsum-sub{ font-size:15px; color:var(--muted); margin-top:2px;
  font-variant-numeric:tabular-nums; }

.pleft{ min-width:0; }
.pcard{ background:var(--card); border:1px solid var(--line); border-radius:12px;
  padding:12px; margin-bottom:7px; }
.pcard-top{ display:flex; align-items:center; gap:9px; }
.dgrid{ display:flex; gap:6px; margin-top:11px; }
.dcol{ flex:1; min-width:0; display:flex; flex-direction:column; align-items:center;
  gap:2px; background:#F3F6F2; border:1px solid transparent; border-radius:9px; padding:7px 4px; }
.dcol.off{ background:#FBF3E6; border-color:#EEDFC4; }
.dcol-d{ font-size:13.8px; font-weight:800; letter-spacing:.03em; color:var(--muted); }
.dcol-t{ font-size:16.2px; font-weight:700; font-variant-numeric:tabular-nums; }
.dcol.off .dcol-t{ color:var(--amber); }
.psub.pad{ margin-top:9px; }
.pdays{ display:flex; gap:3px; margin-top:4px; flex-wrap:wrap; }
.dchip{ font-size:13.1px; font-weight:700; background:#EDF1EB; color:var(--muted);
  padding:2px 6px; border-radius:5px; letter-spacing:.02em; }

.tag-ok{ font-size:12.5px; background:#DFF4F0; color:#2E8577; padding:2px 7px;
  border-radius:999px; font-weight:600; }
.tickinfo{ margin-top:10px; font-size:14.4px; color:var(--muted);
  background:#F5F7F4; border-radius:8px; padding:7px 10px; }
.dcol.ok{ background:var(--jade); border-color:var(--jade); box-shadow:none; }
.dcol.ok .dcol-d{ color:rgba(255,255,255,.72); }
.dcol.ok .dcol-t{ color:#fff; }
.dcol.off.ok .dcol-t{ color:#F4DCA6; }
.done-btn{ width:100%; margin-top:9px; border:1px solid var(--jade); background:#fff;
  color:#2E8577; border-radius:10px; padding:11px; font-size:16.9px; font-weight:600;
  font-family:inherit; cursor:pointer; }
.done-btn.on{ background:var(--jade); color:#fff; }
.wday.finished{ border-color:#BDE9E1; background:#F4FBF9; }

.shiftpick{ display:flex; align-items:center; justify-content:space-between; gap:10px;
  background:var(--card); border:1px solid var(--line); border-radius:10px;
  padding:10px 12px; margin-bottom:8px; }
.wpn{ border:1px solid var(--line); background:#fff; color:var(--ink); border-radius:8px;
  padding:5px 11px; font-size:15.6px; font-family:inherit; cursor:pointer; }
.wpn.on{ font-weight:600; }
.swap-note{ font-size:14.4px; color:var(--indigo); background:#EEF3F9;
  border-radius:9px; padding:8px 11px; margin-bottom:10px; }

.gate{ background:var(--paper); display:flex; align-items:center; justify-content:center; padding:24px 20px; }
.gate-inner{ width:100%; max-width:330px; text-align:center; }
.gate-brand{ font-weight:800; font-size:18.8px; letter-spacing:.16em; text-transform:uppercase;
  color:var(--muted); margin-bottom:26px; }
.gate-q{ font-size:28.8px; font-weight:800; letter-spacing:-.02em; margin-bottom:20px; }
.gate-q.sm{ font-size:18.8px; font-weight:600; color:var(--muted); margin:14px 0 16px; }
.gate-people{ display:flex; flex-direction:column; gap:10px; }
.gate-person{ display:flex; align-items:center; gap:14px; border:none; border-radius:18px;
  padding:18px 20px; box-shadow:0 6px 16px rgba(44,33,66,.10); font-family:inherit; cursor:pointer; text-align:left; }
.gp-short{ font-size:18.8px; font-weight:800; width:47px; height:47px; border-radius:50%;
  background:rgba(255,255,255,.25); display:grid; place-items:center; flex:none; }
.gp-name{ font-size:23.8px; font-weight:700; letter-spacing:-.01em; }
.gate-back{ background:none; border:none; color:var(--muted); font-family:inherit;
  font-size:16.2px; cursor:pointer; padding:4px; }
.gate-who{ display:flex; align-items:center; justify-content:center; gap:10px; margin-top:10px; }
.gate-whoname{ font-size:23.8px; font-weight:700; }
.dots{ display:flex; gap:13px; justify-content:center; margin-bottom:6px; }
.dots.bad{ animation:shake .3s; }
@keyframes shake{ 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }
.dot{ width:15px; height:15px; border-radius:50%; background:#fff;
  box-shadow:inset 0 0 0 1.5px var(--line); }
.dot.on{ background:var(--brand); box-shadow:none; }
.gate-err{ font-size:15.6px; color:var(--clay); margin-top:8px; }
.keypad{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-top:22px; }
.keypad button{ height:66px; border-radius:14px; border:1px solid var(--line);
  background:var(--card); font-family:inherit; font-size:26.2px; font-weight:600;
  color:var(--ink); cursor:pointer; }
.keypad button:active{ background:var(--brand-soft); }
.keypad .kdel{ font-size:21.2px; color:var(--muted); }


.ro-note{ font-size:15.6px; color:var(--muted); background:var(--card);
  border:1px dashed var(--line); border-radius:10px; padding:9px 12px; margin-bottom:12px; }
.mealday.ro{ cursor:default; }

.err.warn{ background:#FDF4E3; color:#8A5A12; display:flex; align-items:center;
  justify-content:space-between; gap:10px; }
.err.warn button{ background:none; border:none; color:inherit; font-family:inherit;
  font-size:15px; text-decoration:underline; cursor:pointer; flex:none; }
.notebtn{ flex:none; width:37px; height:37px; border-radius:8px; border:1px solid var(--line);
  background:#fff; color:var(--muted); font-size:16.2px; font-family:inherit; cursor:pointer;
  align-self:center; }
.notebtn:hover{ color:var(--brand); border-color:#D5C9F2; }
.daynote{ width:100%; border:1px solid var(--line); border-radius:10px; padding:10px 12px;
  font-family:inherit; font-size:16.9px; background:#fff; color:var(--ink); resize:vertical; }
.daynote-show{ margin-top:10px; font-size:15.6px; color:var(--ink);
  background:#FDF7E8; border:1px solid #EFE2C4; border-radius:9px; padding:8px 11px; }
.backup{ margin-top:22px; padding-top:18px; border-top:1px solid var(--line); }
.backup-note{ font-size:15px; color:var(--muted); margin-top:8px; line-height:1.5; }
.backup-note.ok-t{ color:var(--jade); font-weight:600; }
.backup-note.err-t{ color:var(--clay); font-weight:600; }
.backup-box{ width:100%; margin-top:9px; border:1px solid var(--line); border-radius:10px;
  padding:10px 12px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:13.8px;
  background:#fff; color:var(--muted); resize:vertical; }
.btn:disabled{ opacity:.55; cursor:default; }

.shopweek{ font-size:15.6px; color:var(--ink); font-weight:600; margin-bottom:12px; }
.shopweek .muted{ color:var(--muted); font-weight:400; margin-left:4px; }
.btn.ghost.danger{ border-color:var(--clay); color:var(--clay); font-weight:600; }

.syncbar{ margin:0 16px 10px; padding:8px 12px; border-radius:10px; font-size:14px; }
.syncbar.dirty{ background:#F4F1EA; color:var(--muted); }
.syncbar.saving{ background:var(--brand-soft); color:var(--brand); font-weight:600; }
.syncbar.error{ background:#FBE9E7; color:var(--clay); font-weight:600; }
.refresh{ margin-left:auto; margin-right:8px; width:38px; height:38px; border-radius:12px;
  border:1px solid var(--line); background:var(--card); color:var(--muted); font-size:20px;
  line-height:1; cursor:pointer; font-family:inherit; }
.setup-err{ background:#FBE9E7; color:var(--clay); border-radius:12px; padding:16px;
  font-size:16px; line-height:1.5; margin-bottom:16px; text-align:left; }
.own{ font-size:12.5px; padding:2px 7px; border-radius:999px; font-weight:700; }
.del{ flex:none; width:37px; height:37px; border-radius:8px; border:1px solid transparent;
  background:none; color:var(--muted); cursor:pointer; font-family:inherit;
  align-self:center; display:grid; place-items:center; padding:0; }
.del:hover, .del:focus-visible{ background:#FBE9E7; color:var(--clay); border-color:#F3D6D2; }
.restore{ display:flex; align-items:center; justify-content:space-between; gap:10px;
  font-size:15.6px; color:var(--muted); background:var(--card); border:1px dashed var(--line);
  border-radius:10px; padding:9px 12px; margin-bottom:18px; }
.mt{ margin-top:11px; display:block; }

.ingbox{ margin-top:4px; }
.chips{ display:flex; flex-wrap:wrap; gap:5px; margin-bottom:6px; }
.chip{ background:var(--jade); color:#fff; border:none; border-radius:999px;
  padding:4px 9px; font-size:15.6px; font-family:inherit; cursor:pointer; }
.chip .x{ opacity:.7; margin-left:2px; }
.sugg{ display:flex; flex-wrap:wrap; gap:5px; margin-top:7px; max-height:104px; overflow:auto; }
.sugg-btn{ border:1px solid var(--line); background:var(--card); border-radius:999px;
  padding:4px 10px; font-size:15.6px; font-family:inherit; color:var(--ink); cursor:pointer; }
.sugg-btn.new{ border-style:dashed; border-color:var(--amber); color:var(--amber); font-weight:600; }

.editor-bar{ display:flex; justify-content:space-between; font-size:15.6px;
  background:var(--card); border:1px solid var(--line); border-radius:10px;
  padding:9px 12px; margin-bottom:10px; font-variant-numeric:tabular-nums; }
.editor-bar .over{ color:var(--clay); font-weight:600; }
.editor-bar .under{ color:var(--jade); font-weight:600; }
.egroup{ margin-bottom:14px; }
.egroup .eyebrow{ display:block; margin-bottom:6px; }
.erow{ display:flex; align-items:center; gap:10px; background:var(--card);
  border:1px solid var(--line); border-radius:10px; padding:9px 11px; margin-bottom:5px; }
.erow.on{ border-color:var(--brand); background:var(--brand-soft); }
.erow-body{ flex:1; min-width:0; cursor:pointer; }
.erow-name{ font-size:16.9px; font-weight:500; }
.whopick{ display:flex; gap:3px; flex:none; }
.wp{ width:32px; height:32px; border-radius:7px; border:1px solid var(--line);
  background:#fff; font-size:13.8px; font-weight:700; color:var(--muted);
  font-family:inherit; cursor:pointer; }
.wp.on{ font-weight:800; }
.wday-tasks{ display:flex; flex-wrap:wrap; gap:4px; margin-top:8px; }
.mini{ font-size:13.8px; padding:3px 8px; border-radius:999px; background:var(--brand-soft);
  color:var(--muted); }
.mini.on{ background:#DFF4F0; color:#2E8577; font-weight:600; }


.tabs{ position:fixed; bottom:0; left:0; right:0; max-width:560px; margin:0 auto;
  display:flex; background:var(--card); border-top:1px solid var(--line); z-index:30;
  padding:8px 6px calc(8px + env(safe-area-inset-bottom));
  box-shadow:0 -4px 18px rgba(44,33,66,.06); }
.tabs button{ flex:1; display:flex; flex-direction:column; align-items:center; gap:5px;
  padding:10px 4px 9px; background:none; border:none; font-family:inherit; border-radius:14px;
  font-size:14.4px; font-weight:600; color:var(--muted); cursor:pointer; min-height:72px; }
.tabs button.on{ color:var(--brand); background:var(--brand-soft); }
.tabs button.on svg{ stroke-width:2.1; }

@media print{
  .tabs, .hdr, .daynav, .weeknav, .btn { display:none !important; }
  .app{ padding:0; max-width:none; background:#fff; }
  .wday, .row, .section{ break-inside:avoid; }
}
@media (prefers-reduced-motion: reduce){ *{ transition:none !important; } }
`;
window.ViecNhaApp = App;