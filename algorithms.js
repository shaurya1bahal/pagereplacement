// algorithms.js
// Global: window.PageAlgo.simulate(algoName, framesCount, refs)
// Returns: { steps: Step[], summary: { hits, faults } }

(function () {
  "use strict";

  function assert(cond, msg) {
    if (!cond) throw new Error(msg);
  }

  function cloneArray(arr) {
    return arr.slice();
  }

  function makeStep(i, page, frames) {
    return {
      index: i,
      page,
      frames: cloneArray(frames),
      hit: false,
      fault: false,
      replaced: null,
      replacedIndex: null,
      note: "",
      meta: null
    };
  }

  // ---------- FIFO ----------
  function simulateFIFO(framesCount, refs) {
    const frames = Array(framesCount).fill(null);
    let pointer = 0;
    let hits = 0, faults = 0;
    const steps = [];

    for (let i = 0; i < refs.length; i++) {
      const p = refs[i];
      const step = makeStep(i, p, frames);

      const hitIndex = frames.indexOf(p);
      if (hitIndex !== -1) {
        step.hit = true;
        hits++;
        step.note = `HIT: Page ${p} already present.`;
      } else {
        step.fault = true;
        faults++;

        const emptyIndex = frames.indexOf(null);
        if (emptyIndex !== -1) {
          frames[emptyIndex] = p;
          step.note = `FAULT: Empty frame used → inserted ${p} into frame ${emptyIndex}.`;
        } else {
          const victimIndex = pointer;
          const victimPage = frames[victimIndex];
          frames[victimIndex] = p;

          step.replaced = victimPage;
          step.replacedIndex = victimIndex;
          step.note = `FAULT: FIFO replaces oldest page ${victimPage} at frame ${victimIndex}.`;

          pointer = (pointer + 1) % framesCount;
        }
      }

      step.frames = cloneArray(frames);
      steps.push(step);
    }

    return { steps, summary: { hits, faults } };
  }

  // ---------- LRU ----------
  function simulateLRU(framesCount, refs) {
    const frames = Array(framesCount).fill(null);

    // lastUsed maps page -> last reference index
    const lastUsed = new Map();

    let hits = 0, faults = 0;
    const steps = [];

    for (let i = 0; i < refs.length; i++) {
      const p = refs[i];
      const step = makeStep(i, p, frames);

      const hitIndex = frames.indexOf(p);
      if (hitIndex !== -1) {
        step.hit = true;
        hits++;
        lastUsed.set(p, i);
        step.note = `HIT: Page ${p} found → update last-used to step ${i}.`;
      } else {
        step.fault = true;
        faults++;

        const emptyIndex = frames.indexOf(null);
        if (emptyIndex !== -1) {
          frames[emptyIndex] = p;
          lastUsed.set(p, i);
          step.note = `FAULT: Empty frame used → inserted ${p} into frame ${emptyIndex}.`;
        } else {
          // pick the page in frames with minimum lastUsed value
          let victimIndex = -1;
          let victimPage = null;
          let minLastUsed = Infinity;

          for (let fi = 0; fi < framesCount; fi++) {
            const page = frames[fi];
            // should always exist, but safe fallback:
            const t = lastUsed.has(page) ? lastUsed.get(page) : -Infinity;

            if (t < minLastUsed) {
              minLastUsed = t;
              victimIndex = fi;
              victimPage = page;
            }
          }

          frames[victimIndex] = p;
          lastUsed.delete(victimPage);
          lastUsed.set(p, i);

          step.replaced = victimPage;
          step.replacedIndex = victimIndex;
          step.note = `FAULT: LRU replaces ${victimPage} in frame ${victimIndex} (least recently used at step ${minLastUsed}).`;
        }
      }

      step.frames = cloneArray(frames);
      steps.push(step);
    }

    return { steps, summary: { hits, faults } };
  }

  // ---------- OPT (Optimal) ----------
  function simulateOPT(framesCount, refs) {
    const frames = Array(framesCount).fill(null);
    let hits = 0, faults = 0;
    const steps = [];

    for (let i = 0; i < refs.length; i++) {
      const p = refs[i];
      const step = makeStep(i, p, frames);

      const hitIndex = frames.indexOf(p);
      if (hitIndex !== -1) {
        step.hit = true;
        hits++;
        step.note = `HIT: Page ${p} already present.`;
      } else {
        step.fault = true;
        faults++;

        const emptyIndex = frames.indexOf(null);
        if (emptyIndex !== -1) {
          frames[emptyIndex] = p;
          step.note = `FAULT: Empty frame used → inserted ${p} into frame ${emptyIndex}.`;
        } else {
          // Replace the page whose next use is farthest in the future (or never used again).
          let victimIndex = 0;
          let victimPage = frames[0];
          let farthestNextUse = -1; // Infinity beats this

          for (let fi = 0; fi < framesCount; fi++) {
            const page = frames[fi];
            let nextUse = Infinity;

            for (let j = i + 1; j < refs.length; j++) {
              if (refs[j] === page) {
                nextUse = j;
                break;
              }
            }

            if (nextUse > farthestNextUse) {
              farthestNextUse = nextUse;
              victimIndex = fi;
              victimPage = page;
            }
          }

          frames[victimIndex] = p;
          step.replaced = victimPage;
          step.replacedIndex = victimIndex;

          step.note = (farthestNextUse === Infinity)
            ? `FAULT: OPT replaces ${victimPage} (not used again).`
            : `FAULT: OPT replaces ${victimPage} (used farthest in future at step ${farthestNextUse}).`;
        }
      }

      step.frames = cloneArray(frames);
      steps.push(step);
    }

    return { steps, summary: { hits, faults } };
  }

  // ---------- CLOCK (Second Chance) ----------
  function simulateCLOCK(framesCount, refs) {
    const frames = Array(framesCount).fill(null);
    const refBits = Array(framesCount).fill(0);
    let hand = 0;

    let hits = 0, faults = 0;
    const steps = [];

    for (let i = 0; i < refs.length; i++) {
      const p = refs[i];
      const step = makeStep(i, p, frames);

      const hitIndex = frames.indexOf(p);
      if (hitIndex !== -1) {
        step.hit = true;
        hits++;
        refBits[hitIndex] = 1;
        step.note = `HIT: Page ${p} found → set ref bit of frame ${hitIndex} to 1.`;
      } else {
        step.fault = true;
        faults++;

        const emptyIndex = frames.indexOf(null);
        if (emptyIndex !== -1) {
          frames[emptyIndex] = p;
          refBits[emptyIndex] = 1;
          step.note = `FAULT: Empty frame used → inserted ${p} into frame ${emptyIndex}, ref bit=1.`;
        } else {
          // Scan until finding a frame with refBit 0
          let scans = 0;
          while (true) {
            scans++;

            if (refBits[hand] === 0) {
              const victimIndex = hand;
              const victimPage = frames[victimIndex];

              frames[victimIndex] = p;
              refBits[victimIndex] = 1;

              step.replaced = victimPage;
              step.replacedIndex = victimIndex;
              step.note = `FAULT: Clock replaced ${victimPage} at frame ${victimIndex} after ${scans} scan(s) (ref bit was 0).`;

              hand = (hand + 1) % framesCount;
              break;
            } else {
              // second chance: clear bit and advance
              refBits[hand] = 0;
              hand = (hand + 1) % framesCount;
            }

            // absolute safety guard (should never loop forever)
            if (scans > framesCount * 5) {
              throw new Error("Clock algorithm safety break (unexpected loop).");
            }
          }
        }
      }

      step.frames = cloneArray(frames);
      step.meta = { refBits: cloneArray(refBits), hand };
      steps.push(step);
    }

    return { steps, summary: { hits, faults } };
  }

  function simulate(algoName, framesCount, refs) {
    assert(Number.isInteger(framesCount) && framesCount >= 1 && framesCount <= 50, "Frames must be an integer between 1 and 50.");
    assert(Array.isArray(refs) && refs.length > 0, "Reference string cannot be empty.");

    switch (algoName) {
      case "FIFO":  return simulateFIFO(framesCount, refs);
      case "LRU":   return simulateLRU(framesCount, refs);
      case "OPT":   return simulateOPT(framesCount, refs);
      case "CLOCK": return simulateCLOCK(framesCount, refs);
      default: throw new Error("Unknown algorithm: " + algoName);
    }
  }

  window.PageAlgo = { simulate };
})();
