const PRACTICE_DURATION_MS = 45 * 60 * 1000;
const PRACTICE_QUESTION_COUNT = 24;
const PASS_MARK = 18;

const AID_TYPES = [
  { key: "mnemonic",      label: "Mnemonic",      color: "var(--aid-mnemonic)" },
  { key: "story",         label: "Story",         color: "var(--aid-story)" },
  { key: "trivia",        label: "Trivia",        color: "var(--aid-trivia)" },
  { key: "visualization", label: "Visualization", color: "var(--aid-visualization)" },
];

const state = {
  bank: null,
  aids: null,
  mode: "practice",
  practice: null,
  study: null,
};

// ── Utilities ────────────────────────────────────────────────────────────────

function aidKey(q) {
  return `${q.test}_${q.question_id}`;
}

function flatQuestions() {
  const tests = state.bank.tests;
  return Object.keys(tests)
    .sort((a, b) => Number(a) - Number(b))
    .flatMap((t) => tests[t]);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// ── Memory aid grid (shared) ─────────────────────────────────────────────────

function renderAids(question) {
  const aids = state.aids[aidKey(question)];
  if (!aids) {
    return '<p class="muted" style="font-size:14px;margin:var(--space) 0 0">Memory aids not yet generated for this question.</p>';
  }
  const cards = AID_TYPES.map((t) => `
    <div class="aid-card" style="--aid-color:${t.color}">
      <div class="aid-card-label">${t.label}</div>
      <div class="aid-card-body">${escapeHtml(aids[t.key] || "")}</div>
    </div>
  `).join("");
  return `<div class="aid-grid">${cards}</div>`;
}

function attachAidTabs() {
  // No-op — grid layout needs no JS interaction.
}

// ── Data loading ─────────────────────────────────────────────────────────────

async function loadData() {
  // Serve from project root so ../foo.json resolves from /web/index.html
  const base = window.location.pathname.endsWith("/web/") || window.location.pathname.includes("/web/index") ? "../" : "./";
  const [bank, aids] = await Promise.all([
    fetch(base + "life_in_uk_tests.json").then((r) => r.json()),
    fetch(base + "memory_aids.json").then((r) => r.json()).catch(() => ({})),
  ]);
  state.bank = bank;
  state.aids = aids;
}

// ── Routing ───────────────────────────────────────────────────────────────────

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".mode-tab").forEach((el) =>
    el.classList.toggle("is-active", el.dataset.mode === mode)
  );
  render();
}

function render() {
  const main = document.getElementById("app");
  if (!state.bank) {
    main.innerHTML = '<div class="loading">Loading...</div>';
    return;
  }
  if (state.mode === "practice") renderPractice(main);
  else renderStudy(main);
}

// ── Study mode ────────────────────────────────────────────────────────────────
// state.study.results[i] = { verdict: "correct"|"wrong"|"skip"|"reveal", selected: [] }
// state.study.phase      = "answering" | "judged" | "revealed"

function freshStudyState(testNum) {
  return { testNum, index: 0, phase: "answering", selected: [], results: {}, showResults: false };
}

function studyQuestions() {
  const { testNum } = state.study;
  return testNum === "all" ? flatQuestions() : state.bank.tests[testNum];
}

function renderStudy(main) {
  if (!state.study) state.study = freshStudyState("1");
  if (state.study.showResults) { renderStudyResults(main); return; }

  const { index, phase, selected, results } = state.study;
  const questions = studyQuestions();
  const q = questions[index];
  const multi = q.correct_answer_ids.length > 1;
  const judged   = phase === "judged";
  const revealed = phase === "revealed";
  const locked   = judged || revealed;

  // Options
  const optionsHtml = Object.entries(q.options).map(([rid, text]) => {
    let cls = "option" + (multi ? " is-multi" : "") + (locked ? " option--disabled" : "");
    if (judged) {
      if (q.correct_answer_ids.includes(rid)) cls += " is-correct";
      else if (selected.includes(rid))        cls += " is-wrong";
    } else if (revealed) {
      if (q.correct_answer_ids.includes(rid)) cls += " is-correct";
    } else if (selected.includes(rid)) {
      cls += " is-selected";
    }
    return `<div class="${cls}" data-rid="${rid}">
      <span class="option-indicator"></span>
      <span class="option-text">${escapeHtml(text)}</span>
    </div>`;
  }).join("");

  // Progress dots — colour-coded by verdict
  const dots = questions.map((_, i) => {
    const r = results[i];
    let cls = "dot" + (i === index ? " is-current" : "");
    if (r) cls += r.verdict === "correct" ? " dot--correct"
               : r.verdict === "wrong"   ? " dot--wrong"
               : r.verdict === "skip"    ? " dot--skip"
               : " is-answered";
    return `<button class="${cls}" data-idx="${i}" aria-label="Q${i + 1}"></button>`;
  }).join("");

  // Action buttons (right side of footer)
  const isLast = index === questions.length - 1;
  let actions = "";
  if (!locked) {
    actions = `
      <button class="btn" id="s-submit"${selected.length === 0 ? " disabled" : ""}>Submit</button>
      <button class="btn btn--ghost" id="s-reveal">Reveal</button>
      <button class="btn btn--ghost" id="s-skip">Skip</button>`;
  } else {
    actions = isLast
      ? `<button class="btn" id="s-results">See results</button>`
      : `<button class="btn" id="s-next">Next →</button>`;
  }

  const answeredCount = Object.keys(results).length;
  const allDone = answeredCount === questions.length;

  const testOptions = Object.keys(state.bank.tests)
    .sort((a, b) => Number(a) - Number(b))
    .map((t) => `<option value="${t}"${t === state.study.testNum ? " selected" : ""}>Test ${t}</option>`)
    .join("");

  main.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:12px">
        <select id="s-test-sel" style="font-family:inherit;font-size:14px;padding:6px 10px;border-radius:8px;border:1px solid var(--color-border)">
          ${testOptions}
          <option value="all"${state.study.testNum === "all" ? " selected" : ""}>All questions</option>
        </select>
        <span class="muted" style="font-size:13px">${answeredCount} / ${questions.length} answered</span>
      </div>
      <div class="dots-row" style="margin-bottom:var(--space)">${dots}</div>
      <p class="muted" style="font-size:13px;margin:0 0 4px">Question ${index + 1} of ${questions.length}</p>
      <h2 style="margin-top:0">${escapeHtml(q.question)}</h2>
      ${multi ? '<p class="muted" style="font-size:13px;margin-top:0">Select all that apply.</p>' : ""}
      <div class="options">${optionsHtml}</div>
      ${locked ? `
        ${revealed ? '<p class="muted" style="font-size:13px;margin-top:var(--space)">Revealed — not counted in score.</p>' : ""}
        <div style="margin-top:var(--space)">
          <p style="margin:0 0 8px"><strong>Explanation:</strong> ${escapeHtml(q.explanation)}</p>
          ${renderAids(q)}
        </div>` : ""}
      <div class="row" style="justify-content:space-between;margin-top:calc(var(--space)*1.5)">
        <button class="btn btn--secondary" id="s-prev"${index === 0 ? " disabled" : ""}>← Previous</button>
        <div class="row" style="gap:8px">${actions}</div>
      </div>
      ${allDone && !locked ? `<p style="text-align:center;margin-top:var(--space)"><button class="btn" id="s-results-early">See results</button></p>` : ""}
    </div>
  `;

  // Option click
  if (!locked) {
    main.querySelectorAll(".option").forEach((el) => {
      el.addEventListener("click", () => {
        const rid = el.dataset.rid;
        const cur = state.study.selected;
        state.study.selected = multi
          ? cur.includes(rid) ? cur.filter((x) => x !== rid) : [...cur, rid]
          : cur.includes(rid) ? [] : [rid];
        render();
      });
    });
  }

  // Dot navigation
  main.querySelectorAll(".dot").forEach((d) =>
    d.addEventListener("click", () => {
      const r = results[Number(d.dataset.idx)];
      state.study.index = Number(d.dataset.idx);
      state.study.phase = r ? "judged" : "answering";
      state.study.selected = r ? (r.selected || []) : [];
      render();
    })
  );

  // Test selector
  document.getElementById("s-test-sel").addEventListener("change", (e) => {
    state.study = freshStudyState(e.target.value);
    render();
  });

  // Footer buttons
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener("click", fn); };

  on("s-prev", () => {
    const r = results[index - 1];
    state.study.index = Math.max(0, index - 1);
    state.study.phase = r ? "judged" : "answering";
    state.study.selected = r ? (r.selected || []) : [];
    render();
  });
  on("s-submit", () => {
    const correct = q.correct_answer_ids;
    const given = selected.slice().sort();
    const truth = correct.slice().sort();
    const verdict = given.length === truth.length && given.every((x, i) => x === truth[i]) ? "correct" : "wrong";
    state.study.results[index] = { verdict, selected: [...selected] };
    state.study.phase = "judged";
    render();
  });
  on("s-reveal", () => {
    state.study.results[index] = { verdict: "reveal", selected: [] };
    state.study.phase = "revealed";
    render();
  });
  on("s-skip", () => {
    state.study.results[index] = { verdict: "skip", selected: [] };
    state.study.index = Math.min(questions.length - 1, index + 1);
    state.study.phase = results[state.study.index] ? "judged" : "answering";
    state.study.selected = [];
    render();
  });
  on("s-next", () => {
    state.study.index = index + 1;
    const r = results[index + 1];
    state.study.phase = r ? "judged" : "answering";
    state.study.selected = r ? (r.selected || []) : [];
    render();
  });
  on("s-results", () => { state.study.showResults = true; render(); });
  on("s-results-early", () => { state.study.showResults = true; render(); });
}

function renderStudyResults(main) {
  const questions = studyQuestions();
  const { results, testNum } = state.study;

  const submitted = Object.values(results).filter((r) => r.verdict === "correct" || r.verdict === "wrong");
  const correct   = submitted.filter((r) => r.verdict === "correct").length;
  const wrong     = submitted.filter((r) => r.verdict === "wrong").length;
  const skipped   = Object.values(results).filter((r) => r.verdict === "skip").length;
  const revealed  = Object.values(results).filter((r) => r.verdict === "reveal").length;
  const unanswered = questions.length - Object.keys(results).length;

  const verdictLabel = { correct: "Correct", wrong: "Wrong", skip: "Skipped", reveal: "Revealed" };
  const verdictColor = { correct: "var(--color-success)", wrong: "var(--color-error)", skip: "var(--color-muted)", reveal: "var(--color-muted)" };

  const rows = questions.map((q, i) => {
    const r = results[i];
    const label = r ? verdictLabel[r.verdict] : "Not answered";
    const color = r ? verdictColor[r.verdict] : "var(--color-muted)";
    return `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--color-border)">
      <span style="font-size:14px">${escapeHtml(q.question)}</span>
      <span style="font-size:13px;font-weight:600;color:${color};white-space:nowrap">${label}</span>
    </div>`;
  }).join("");

  main.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0">Results — ${testNum === "all" ? "All questions" : "Test " + testNum}</h2>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:var(--space)">
        <div class="stat-box" style="--stat-color:var(--color-success)"><div class="stat-num">${correct}</div><div class="stat-lbl">Correct</div></div>
        <div class="stat-box" style="--stat-color:var(--color-error)"><div class="stat-num">${wrong}</div><div class="stat-lbl">Wrong</div></div>
        <div class="stat-box" style="--stat-color:var(--color-muted)"><div class="stat-num">${skipped}</div><div class="stat-lbl">Skipped</div></div>
        <div class="stat-box" style="--stat-color:var(--color-muted)"><div class="stat-num">${revealed + unanswered}</div><div class="stat-lbl">Not scored</div></div>
      </div>
      <p style="font-size:15px;color:${correct > 0 || wrong > 0 ? "var(--color-text)" : "var(--color-muted)"}">
        Score: <strong>${correct} / ${correct + wrong}</strong> submitted questions correct
      </p>
      <button class="btn" id="s-retry">Try again</button>
    </div>
    <h3 style="margin-top:calc(var(--space)*1.5)">Question breakdown</h3>
    <div class="card" style="padding:0 calc(var(--space)*1.5)">${rows}</div>
  `;

  document.getElementById("s-retry").addEventListener("click", () => {
    state.study = freshStudyState(testNum);
    render();
  });
}

// ── Practice mode ─────────────────────────────────────────────────────────────

function startPractice() {
  const shuffled = [...flatQuestions()].sort(() => Math.random() - 0.5);
  state.practice = {
    questions: shuffled.slice(0, PRACTICE_QUESTION_COUNT),
    answers: {},
    index: 0,
    startedAt: Date.now(),
    submitted: false,
    timerId: null,
  };
  state.practice.timerId = setInterval(() => {
    if (Date.now() - state.practice.startedAt >= PRACTICE_DURATION_MS) {
      submitPractice();
    } else if (state.mode === "practice" && !state.practice.submitted) {
      const el = document.getElementById("practice-timer");
      if (el) el.textContent = formatRemaining();
    }
  }, 1000);
  render();
}

function formatRemaining() {
  const remaining = Math.max(0, PRACTICE_DURATION_MS - (Date.now() - state.practice.startedAt));
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function toggleAnswer(qIdx, rid) {
  const q = state.practice.questions[qIdx];
  const multi = q.correct_answer_ids.length > 1;
  const current = state.practice.answers[qIdx] || [];
  state.practice.answers[qIdx] = multi
    ? current.includes(rid) ? current.filter((x) => x !== rid) : [...current, rid]
    : [rid];
  render();
}

function submitPractice() {
  if (state.practice.submitted) return;
  state.practice.submitted = true;
  if (state.practice.timerId) clearInterval(state.practice.timerId);
  render();
}

function scorePractice() {
  return state.practice.questions.reduce((total, q, i) => {
    const given = (state.practice.answers[i] || []).slice().sort();
    const truth = q.correct_answer_ids.slice().sort();
    return total + (given.length === truth.length && given.every((x, j) => x === truth[j]) ? 1 : 0);
  }, 0);
}

function renderPractice(main) {
  if (!state.practice) {
    main.innerHTML = `
      <div class="card">
        <h2 style="margin-top:0">Practice test</h2>
        <p>24 random questions, 45-minute timer. Pass mark is 18 / 24 (75%).</p>
        <button class="btn" id="practice-start">Start practice test</button>
      </div>
    `;
    document.getElementById("practice-start").addEventListener("click", startPractice);
    return;
  }

  if (state.practice.submitted) {
    renderPracticeResults(main);
    return;
  }

  const { questions, answers, index } = state.practice;
  const q = questions[index];
  const selected = answers[index] || [];
  const multi = q.correct_answer_ids.length > 1;

  const dots = questions.map((_, i) => {
    const answered = (answers[i] || []).length > 0;
    return `<button class="dot${answered ? " is-answered" : ""}${i === index ? " is-current" : ""}" data-idx="${i}" aria-label="Question ${i + 1}"></button>`;
  }).join("");

  main.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:var(--space)">
        <span class="muted">Question ${index + 1} of ${questions.length}</span>
        <span class="timer" id="practice-timer">${formatRemaining()}</span>
      </div>
      <div class="dots-row" style="margin-bottom:var(--space)">${dots}</div>
      <h2 style="margin-top:0">${escapeHtml(q.question)}</h2>
      ${multi ? '<p class="muted" style="font-size:13px;margin-top:0">Select all that apply.</p>' : ""}
      <div class="options">
        ${Object.entries(q.options).map(([rid, text]) =>
          `<div class="option${multi ? " is-multi" : ""}${selected.includes(rid) ? " is-selected" : ""}" data-rid="${rid}">
            <span class="option-indicator"></span>
            <span class="option-text">${escapeHtml(text)}</span>
          </div>`
        ).join("")}
      </div>
      <div class="row" style="justify-content:space-between;margin-top:calc(var(--space)*1.5)">
        <button class="btn btn--secondary" id="practice-prev"${index === 0 ? " disabled" : ""}>← Previous</button>
        ${index === questions.length - 1
          ? `<button class="btn" id="practice-submit">Submit test</button>`
          : `<button class="btn btn--secondary" id="practice-next">Next →</button>`}
      </div>
    </div>
  `;

  main.querySelectorAll(".option").forEach((el) =>
    el.addEventListener("click", () => toggleAnswer(index, el.dataset.rid))
  );
  main.querySelectorAll(".dot").forEach((d) =>
    d.addEventListener("click", () => { state.practice.index = Number(d.dataset.idx); render(); })
  );
  const prev = document.getElementById("practice-prev");
  if (prev) prev.addEventListener("click", () => { state.practice.index--; render(); });
  const next = document.getElementById("practice-next");
  if (next) next.addEventListener("click", () => { state.practice.index++; render(); });
  const submit = document.getElementById("practice-submit");
  if (submit) submit.addEventListener("click", submitPractice);
}

function renderPracticeResults(main) {
  const score = scorePractice();
  const passed = score >= PASS_MARK;
  const pct = Math.round((score / state.practice.questions.length) * 100);

  const reviews = state.practice.questions.map((q, i) => {
    const given = state.practice.answers[i] || [];
    const correct = q.correct_answer_ids;
    const isRight = given.slice().sort().join() === correct.slice().sort().join();
    const isMulti = correct.length > 1;
    const optionsHtml = Object.entries(q.options).map(([rid, text]) => {
      let cls = "option option--disabled";
      if (isMulti) cls += " is-multi";
      if (correct.includes(rid)) cls += " is-correct";
      else if (given.includes(rid)) cls += " is-wrong";
      return `<div class="${cls}"><span class="option-indicator"></span><span class="option-text">${escapeHtml(text)}</span></div>`;
    }).join("");
    return `
      <details class="card" style="margin-bottom:12px">
        <summary style="cursor:pointer;font-weight:500">Q${i + 1}. ${escapeHtml(q.question)} ${isRight ? "✓" : "✗"}</summary>
        <div style="margin-top:12px">
          ${optionsHtml}
          <p style="margin-top:var(--space)"><strong>Explanation:</strong> ${escapeHtml(q.explanation)}</p>
          ${renderAids(q)}
        </div>
      </details>
    `;
  }).join("");

  main.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0">Result: ${score} / ${state.practice.questions.length}</h2>
      <p style="font-size:18px;color:${passed ? "var(--color-success)" : "var(--color-error)"}">
        ${passed ? "Passed" : "Did not pass"} (${pct}%)
      </p>
      <button class="btn" id="practice-restart">Try another test</button>
    </div>
    <h3 style="margin-top:calc(var(--space)*2)">Review</h3>
    ${reviews}
  `;

  document.getElementById("practice-restart").addEventListener("click", () => {
    state.practice = null;
    render();
  });
  main.querySelectorAll("details").forEach((d) =>
    d.addEventListener("toggle", () => { if (d.open) attachAidTabs(d); })
  );
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.querySelectorAll(".mode-tab").forEach((el) =>
  el.addEventListener("click", () => setMode(el.dataset.mode))
);

(async function init() {
  try {
    await loadData();
  } catch (err) {
    document.getElementById("app").innerHTML =
      '<div class="card"><p>Failed to load data. Serve from the project root: <code>python -m http.server 8000</code> then open <code>http://localhost:8000/web/</code></p></div>';
    console.error(err);
    return;
  }
  render();
})();
