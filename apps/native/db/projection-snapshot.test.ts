// Unit-level test for readConsistentSnapshot's own retry/freshness logic —
// mocks ensureDashboardProjectionCurrent and getProjectionStatus directly
// (rather than a real SQLite database) since what's under test here is
// purely "does this function correctly repair staleness, detect a revision
// change, and retry," not any particular query's SQL. The integration-level
// proof (a real replaceProjection() landing mid-read, against a real
// database) lives in db/home-read-model.test.ts once the first real
// multi-query composed read exists.
import { beforeEach, describe, it, expect, vi } from "vitest";

const ensureDashboardProjectionCurrent = vi.fn(async () => undefined);
const getProjectionStatus = vi.fn();
vi.mock("./ingestion", () => ({
  ensureProjectionReadable: ensureDashboardProjectionCurrent,
  getProjectionStatus,
}));

const { readConsistentSnapshot } = await import("./projection-snapshot");
const { withIngestionLock } = await import("./single-flight");

describe("readConsistentSnapshot", () => {
  beforeEach(() => {
    ensureDashboardProjectionCurrent.mockReset().mockImplementation(async () => undefined);
    getProjectionStatus.mockReset();
  });

  it("returns the read's result directly when the revision doesn't change", async () => {
    getProjectionStatus.mockResolvedValue({ sourceRevision: 5, projectedRevision: 5 });

    const result = await readConsistentSnapshot(async () => "the result");

    expect(result).toBe("the result");
    expect(getProjectionStatus).toHaveBeenCalledTimes(2);
    expect(ensureDashboardProjectionCurrent).toHaveBeenCalledTimes(1);
  });

  // Regression coverage for the gap the review found: a stable
  // projectedRevision across the before/after reads is not proof the
  // projection is actually caught up with the ledger — sourceRevision
  // could still be ahead of it the whole time, and a bare revision
  // comparison alone would never catch that. Only actually calling
  // ensureDashboardProjectionCurrent() first — and having `read()` run
  // strictly after that repair completes — closes this.
  it("repairs a stable-but-stale projection before read() ever executes, not after", async () => {
    const callOrder: string[] = [];
    let repaired = false;
    ensureDashboardProjectionCurrent.mockImplementationOnce(async () => {
      callOrder.push("ensureFresh");
      repaired = true;
    });
    getProjectionStatus.mockImplementation(async () => {
      callOrder.push("getStatus");
      // Before the repair runs, sourceRevision is ahead of projectedRevision
      // (a genuinely stale-but-quiescent projection); once "repaired," they
      // match. Both calls in a single attempt would report the exact same
      // (stable) numbers either way — the point is read() must only ever
      // observe the post-repair state.
      return repaired
        ? { sourceRevision: 5, projectedRevision: 5 }
        : { sourceRevision: 7, projectedRevision: 5 };
    });

    const result = await readConsistentSnapshot(async () => {
      callOrder.push("read");
      // If read() ran before the repair, this would be false — proving the
      // ordering, not just that ensureDashboardProjectionCurrent() was
      // called at some point during the whole call.
      return repaired;
    });

    expect(result).toBe(true);
    expect(callOrder).toEqual(["ensureFresh", "getStatus", "read", "getStatus"]);
  });

  // Regression coverage for the second race the review found:
  // ensureDashboardProjectionCurrent() only serializes against a writer
  // active *at the moment it's called*. A brand-new multi-page sync can
  // start immediately after it returns, advancing sourceRevision without
  // having published a projection for it yet — both the before- and
  // after-read can then observe the exact same *stale* projectedRevision,
  // which a bare projectedRevision-only comparison would wrongly treat as
  // "unchanged, therefore consistent." Only requiring
  // sourceRevision === projectedRevision on top of the projectedRevision
  // match catches this.
  it("does not accept a snapshot where source and projected revision disagree, even though projectedRevision itself never changed", async () => {
    // Every call — before ensureDashboardProjectionCurrent() even runs, and
    // for both the before- and after-read — reports the exact same
    // projectedRevision (5) with sourceRevision permanently ahead (6),
    // simulating a writer that keeps sourceRevision advancing just out of
    // reach of this reader's own attempts.
    getProjectionStatus.mockResolvedValue({ sourceRevision: 6, projectedRevision: 5 });

    const read = vi.fn(async () => "should never be returned");
    await expect(readConsistentSnapshot(read)).rejects.toThrow(/still catching up/);

    // read() must never run against a projection known to be stale —
    // this is caught before read() is even attempted, on every retry.
    expect(read).not.toHaveBeenCalled();
  });

  it("recovers once a dirty projection catches up on a later attempt", async () => {
    let ensureCalls = 0;
    ensureDashboardProjectionCurrent.mockImplementation(async () => {
      ensureCalls++;
    });
    // First attempt's status read: still dirty (a writer is mid-publish).
    // Every call from the second attempt's ensureDashboardProjectionCurrent()
    // onward: caught up — simulates that second call actually queuing
    // behind the writer and letting it finish before returning.
    getProjectionStatus.mockImplementation(async () =>
      ensureCalls < 2
        ? { sourceRevision: 6, projectedRevision: 5 }
        : { sourceRevision: 6, projectedRevision: 6 },
    );

    const read = vi.fn(async () => "caught up now");
    const result = await readConsistentSnapshot(read);

    expect(result).toBe("caught up now");
    // read() only ever ran once — on the attempt where the projection was
    // already caught up, never on the dirty first attempt.
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("retries when the revision changes between the before- and after-read, and returns the retry's result once stable", async () => {
    getProjectionStatus.mockResolvedValue({ sourceRevision: 6, projectedRevision: 6 });
    getProjectionStatus
      .mockResolvedValueOnce({ sourceRevision: 5, projectedRevision: 5 }) // attempt 1: before
      .mockResolvedValueOnce({ sourceRevision: 6, projectedRevision: 6 }); // attempt 1: after (changed!)
    // Every call from here on (attempt 2's before/after, and any further
    // calls) resolves via the mockResolvedValue default above — a stable
    // revision 6, so attempt 2 must succeed and no attempt 3 is needed.

    let readCount = 0;
    const result = await readConsistentSnapshot(async () => {
      readCount++;
      return `read #${readCount}`;
    });

    // The retried read's result is what's returned — not the first attempt's,
    // which may have combined data from two different revisions.
    expect(result).toBe("read #2");
    expect(readCount).toBe(2);
    // Freshness is re-checked on the retry too, not just the first attempt —
    // a new stale gap could open up between attempts as well.
    expect(ensureDashboardProjectionCurrent).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting every retry attempt, rather than returning a possibly-inconsistent result", async () => {
    // Every attempt sees the revision change — simulates a publisher that
    // never stops moving relative to this reader.
    let revision = 0;
    getProjectionStatus.mockImplementation(async () => {
      revision++;
      return { sourceRevision: revision, projectedRevision: revision };
    });

    await expect(readConsistentSnapshot(async () => "should never be returned")).rejects.toThrow(
      /Projection changed during every one of/,
    );
  });

  it("calls `read` again on each retry, not just re-checking the revision", async () => {
    getProjectionStatus.mockResolvedValue({ sourceRevision: 2, projectedRevision: 2 });
    getProjectionStatus
      .mockResolvedValueOnce({ sourceRevision: 1, projectedRevision: 1 })
      .mockResolvedValueOnce({ sourceRevision: 2, projectedRevision: 2 });

    const read = vi.fn(async () => "value");
    await readConsistentSnapshot(read);

    expect(read).toHaveBeenCalledTimes(2);
  });

  // Readers never queue behind a sync: while a writer holds the ingestion
  // lock, source ahead of projected means "mid-drain", and the last
  // published revision is served. The writer's publish notifies screens.
  it("serves the last published revision while a writer is active instead of waiting", async () => {
    getProjectionStatus.mockResolvedValue({ sourceRevision: 9, projectedRevision: 5 });
    let releaseWriter!: () => void;
    const writer = withIngestionLock(
      () => new Promise<void>((resolve) => (releaseWriter = resolve)),
    );

    const read = vi.fn(async () => "published revision 5");
    await expect(readConsistentSnapshot(read)).resolves.toBe("published revision 5");
    expect(read).toHaveBeenCalledTimes(1);

    releaseWriter();
    await writer;
  });

  it("still rejects a dirty projection once no writer is active (an interrupted publish)", async () => {
    getProjectionStatus.mockResolvedValue({ sourceRevision: 9, projectedRevision: 5 });
    const read = vi.fn(async () => "stale");
    await expect(readConsistentSnapshot(read)).rejects.toThrow(/still catching up/);
    expect(read).not.toHaveBeenCalled();
  });
});
