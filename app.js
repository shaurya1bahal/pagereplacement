// app.js
(function () {
  "use strict";

  // Elements
  const framesInput  = document.getElementById("framesInput");
  const algoSelect   = document.getElementById("algoSelect");
  const refInput     = document.getElementById("refInput");
  const speedSelect  = document.getElementById("speedSelect");

  const btnInit   = document.getElementById("btnInit");
  const btnStep   = document.getElementById("btnStep");
  const btnPlay   = document.getElementById("btnPlay");
  const btnPause  = document.getElementById("btnPause");
  const btnReset  = document.getElementById("btnReset");
  const btnRunAll = document.getElementById("btnRunAll");

  const stepNoEl      = document.getElementById("stepNo");
  const totalStepsEl  = document.getElementById("totalSteps");
  const currentPageEl = document.getElementById("currentPage");
  const currentResEl  = document.getElementById("currentResult");

  const tableWrap = document.getElementById("tableWrap");
  const logEl     = document.getElementById("log");

  const hitsEl       = document.getElementById("hits");
  const faultsEl     = document.getElementById("faults");
  const hitRatioEl   = document.getElementById("hitRatio");
  const faultRatioEl = document.getElementById("faultRatio");

  const compareWrap = document.getElementById("compareWrap");

  // State
  let sim = null;          // { steps, summary }
  let stepIndex = 0;       // how many steps already applied
  let timerId = null;

  function safeAlert(msg) {
    alert(msg);
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function parseFramesCount() {
    const n = Number(framesInput.value);
    if (!Number.isFinite(n) || !Number.isInteger(n)) throw new Error("Frames must be an integer.");
    const clamped = clamp(n, 1, 50);
    framesInput.value = String(clamped);
    return clamped;
  }

  function parseRefs(text) {
    const cleaned = String(text || "").trim();
    if (!cleaned) return [];

    const parts = cleaned.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);

    const refs = parts.map((token) => {
      // Accept integer pages (including 0, negative allowed if user wants)
      if (!/^[-+]?\d+$/.test(token)) {
        throw new Error(`Invalid page value: "${token}". Use integers separated by spaces/commas.`);
      }
      const v = Number(token);
      if (!Number.isFinite(v)) throw new Error(`Invalid page value: "${token}".`);
      return v;
    });

    return refs;
  }

  function getSpeedMs() {
    const v = Number(speedSelect.value);
    if (!Number.isFinite(v) || v < 50) return 650;
    return v;
  }

  function stopTimer() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
    btnPause.disabled = true;
    btnPlay.disabled = !(sim && stepIndex < sim.steps.length);
  }

  function setInitializedUI(enabled) {
    btnStep.disabled = !enabled;
    btnPlay.disabled = !enabled;
    btnPause.disabled = true;
  }

  function resetUIOnly() {
    stepNoEl.textContent = "0";
    totalStepsEl.textContent = "0";
    currentPageEl.textContent = "-";
    currentResEl.textContent = "-";

    hitsEl.textContent = "0";
    faultsEl.textContent = "0";
    hitRatioEl.textContent = "0.00";
    faultRatioEl.textContent = "0.00";

    tableWrap.innerHTML = "";
    logEl.innerHTML = "";
    setInitializedUI(false);
  }

  function addLog(text) {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = text;
    logEl.prepend(div);
  }

  function renderEmptyCompareHint() {
    compareWrap.innerHTML = `<div class="muted">Click <strong>Run All & Compare</strong> to see summary here.</div>`;
  }

  function buildTable(framesCount) {
    const table = document.createElement("table");

    const thead = document.createElement("thead");
    const trh = document.createElement("tr");

    const headers = ["Step", "Page"];
    for (let i = 0; i < framesCount; i++) headers.push(`Frame ${i}`);
    headers.push("Hit/Fault", "Replaced", "Reason");

    headers.forEach(h => {
      const th = document.createElement("th");
      th.textContent = h;
      trh.appendChild(th);
    });

    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    tbody.id = "simBody";
    table.appendChild(tbody);

    tableWrap.innerHTML = "";
    tableWrap.appendChild(table);
  }

  function updateStats() {
    if (!sim || stepIndex === 0) {
      hitsEl.textContent = "0";
      faultsEl.textContent = "0";
      hitRatioEl.textContent = "0.00";
      faultRatioEl.textContent = "0.00";
      return;
    }

    let hits = 0, faults = 0;
    for (let i = 0; i < stepIndex; i++) {
      if (sim.steps[i].hit) hits++;
      if (sim.steps[i].fault) faults++;
    }

    hitsEl.textContent = String(hits);
    faultsEl.textContent = String(faults);

    const total = stepIndex;
    hitRatioEl.textContent = (hits / total).toFixed(2);
    faultRatioEl.textContent = (faults / total).toFixed(2);
  }

  function formatCell(v) {
    return (v === null || v === undefined) ? "-" : String(v);
  }

  function applyOneStep() {
    if (!sim) return;
    if (stepIndex >= sim.steps.length) {
      stopTimer();
      btnStep.disabled = true;
      btnPlay.disabled = true;
      addLog(`<strong>Done:</strong> Simulation completed.`);
      return;
    }

    const framesCount = parseFramesCount();
    const s = sim.steps[stepIndex];

    const tbody = document.getElementById("simBody");
    if (!tbody) {
      // Table missing (should not happen) → rebuild safely
      buildTable(framesCount);
    }

    const realTbody = document.getElementById("simBody");
    const tr = document.createElement("tr");

    // Step number
    const tdStep = document.createElement("td");
    tdStep.textContent = String(stepIndex + 1);
    tr.appendChild(tdStep);

    // Page
    const tdRef = document.createElement("td");
    tdRef.textContent = String(s.page);
    tr.appendChild(tdRef);

    // Frames
    for (let i = 0; i < framesCount; i++) {
      const td = document.createElement("td");
      td.textContent = formatCell(s.frames[i]);

      if (s.hit && s.frames[i] === s.page) td.classList.add("cellHit");
      if (s.replacedIndex === i) td.classList.add("cellReplaced");

      if (s.meta && s.meta.refBits) {
        td.title = `Clock bit=${s.meta.refBits[i]}`;
      }

      tr.appendChild(td);
    }

    // Hit/Fault badge
    const tdRes = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "badge " + (s.hit ? "hit" : "fault");
    badge.textContent = s.hit ? "HIT" : "FAULT";
    tdRes.appendChild(badge);
    tr.appendChild(tdRes);

    // Replaced
    const tdRep = document.createElement("td");
    tdRep.textContent = (s.replaced === null || s.replaced === undefined) ? "-" : String(s.replaced);
    tr.appendChild(tdRep);

    // Reason
    const tdNote = document.createElement("td");
    tdNote.className = "left";
    tdNote.textContent = s.note || "-";
    tr.appendChild(tdNote);

    realTbody.appendChild(tr);

    // Update status bar
    stepNoEl.textContent = String(stepIndex + 1);
    totalStepsEl.textContent = String(sim.steps.length);
    currentPageEl.textContent = String(s.page);
    currentResEl.textContent = s.hit ? "HIT" : "FAULT";

    addLog(`<strong>Step ${stepIndex + 1}:</strong> Page ${s.page} → ${s.hit ? "HIT" : "FAULT"}${s.replaced !== null ? ` (replaced ${s.replaced})` : ""}.`);

    stepIndex++;
    updateStats();

    // Auto-scroll tableWrap to bottom
    tableWrap.scrollTop = tableWrap.scrollHeight;

    // If finished, lock controls
    if (stepIndex >= sim.steps.length) {
      stopTimer();
      btnStep.disabled = true;
      btnPlay.disabled = true;
      btnPause.disabled = true;
    }
  }

  function initSimulation() {
    try {
      stopTimer();

      const framesCount = parseFramesCount();
      const algo = algoSelect.value;
      const refs = parseRefs(refInput.value);

      if (refs.length === 0) {
        safeAlert("Please enter a reference string (integers separated by spaces/commas).");
        return;
      }

      sim = PageAlgo.simulate(algo, framesCount, refs);
      stepIndex = 0;

      // Reset view for a clean run
      logEl.innerHTML = "";
      buildTable(framesCount);

      stepNoEl.textContent = "0";
      totalStepsEl.textContent = String(sim.steps.length);
      currentPageEl.textContent = "-";
      currentResEl.textContent = "-";

      updateStats();
      setInitializedUI(true);

      addLog(`<strong>Initialized:</strong> ${algo} with ${framesCount} frame(s), references=${refs.length}.`);
    } catch (err) {
      sim = null;
      stepIndex = 0;
      stopTimer();
      setInitializedUI(false);
      safeAlert(err.message || "Initialization error.");
    }
  }

  function play() {
    if (!sim) return;
    if (timerId !== null) return;
    if (stepIndex >= sim.steps.length) return;

    btnPlay.disabled = true;
    btnPause.disabled = false;
    btnStep.disabled = true; // avoid conflicts

    const delay = getSpeedMs();
    timerId = setInterval(() => {
      if (!sim) {
        stopTimer();
        return;
      }
      if (stepIndex >= sim.steps.length) {
        stopTimer();
        btnStep.disabled = true;
        return;
      }
      applyOneStep();
    }, delay);
  }

  function pause() {
    stopTimer();
    btnStep.disabled = !(sim && stepIndex < sim.steps.length);
  }

  function resetAll() {
    stopTimer();
    sim = null;
    stepIndex = 0;
    resetUIOnly();
    renderEmptyCompareHint();
  }

  function runAllCompare() {
    try {
      stopTimer();
      const framesCount = parseFramesCount();
      const refs = parseRefs(refInput.value);

      if (refs.length === 0) {
        safeAlert("Please enter a reference string first.");
        return;
      }

      const algos = ["FIFO", "LRU", "OPT", "CLOCK"];
      const results = algos.map(a => {
        const r = PageAlgo.simulate(a, framesCount, refs);
        const hits = r.summary.hits;
        const faults = r.summary.faults;
        const total = refs.length;
        return {
          algo: a,
          hits,
          faults,
          hitRatio: hits / total,
          faultRatio: faults / total
        };
      });

      // Sort by least faults, then highest hits
      results.sort((x, y) => (x.faults - y.faults) || (y.hits - x.hits));

      const t = document.createElement("table");
      const thead = document.createElement("thead");
      const trh = document.createElement("tr");
      ["Algorithm", "Hits", "Faults", "Hit Ratio", "Fault Ratio", "Rank (by Faults)"].forEach(h => {
        const th = document.createElement("th");
        th.textContent = h;
        trh.appendChild(th);
      });
      thead.appendChild(trh);
      t.appendChild(thead);

      const tbody = document.createElement("tbody");
      results.forEach((r, idx) => {
        const tr = document.createElement("tr");

        const tdA = document.createElement("td"); tdA.textContent = r.algo; tr.appendChild(tdA);
        const tdH = document.createElement("td"); tdH.textContent = String(r.hits); tr.appendChild(tdH);
        const tdF = document.createElement("td"); tdF.textContent = String(r.faults); tr.appendChild(tdF);
        const tdHR = document.createElement("td"); tdHR.textContent = r.hitRatio.toFixed(2); tr.appendChild(tdHR);
        const tdFR = document.createElement("td"); tdFR.textContent = r.faultRatio.toFixed(2); tr.appendChild(tdFR);
        const tdR = document.createElement("td"); tdR.textContent = String(idx + 1); tr.appendChild(tdR);

        tbody.appendChild(tr);
      });

      t.appendChild(tbody);
      compareWrap.innerHTML = "";
      compareWrap.appendChild(t);
    } catch (err) {
      safeAlert(err.message || "Comparison error.");
    }
  }

  // Events
  btnInit.addEventListener("click", initSimulation);
  btnStep.addEventListener("click", applyOneStep);
  btnPlay.addEventListener("click", play);
  btnPause.addEventListener("click", pause);
  btnReset.addEventListener("click", resetAll);
  btnRunAll.addEventListener("click", runAllCompare);

  // Nice UX: Enter key initializes
  refInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") initSimulation();
  });

  // Initial render
  resetUIOnly();
  renderEmptyCompareHint();
})();
