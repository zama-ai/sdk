import { describe, expect, it } from "vitest";
import { findUnguardedHeadRefs } from "../workflow-head-ref.mjs";

describe("findUnguardedHeadRefs", () => {
  it("flags a one-line condition on the branch name alone", () => {
    const yaml = [
      "steps:",
      "  - name: Check",
      "    if: github.event_name == 'pull_request' && github.head_ref != 'main'",
      "    run: echo",
    ].join("\n");

    expect(findUnguardedHeadRefs(yaml)).toEqual([3]);
  });

  it("flags a multi-line condition and reports its key line", () => {
    const yaml = [
      "jobs:",
      "  x:",
      "    continue-on-error: >-",
      "      ${{ github.event_name == 'pull_request'",
      "      && !startsWith(github.head_ref, 'dependabot/') }}",
      "    runs-on: ubuntu-latest",
    ].join("\n");

    expect(findUnguardedHeadRefs(yaml)).toEqual([3]);
  });

  it("accepts a condition that also checks the PR comes from this repo", () => {
    const yaml = [
      "    continue-on-error: >-",
      "      ${{ github.event.pull_request.head.repo.full_name == github.repository",
      "      && !startsWith(github.head_ref, 'dependabot/') }}",
    ].join("\n");

    expect(findUnguardedHeadRefs(yaml)).toEqual([]);
  });
});
