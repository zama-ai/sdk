#!/usr/bin/env bash
# Print one JSON line per review thread, review body, and PR comment on a pull request.
# Usage: fetch-review.sh <pr-number-or-url> [-R owner/repo]
# Read-only. Warns on stderr when a page limit truncates the result.
set -euo pipefail

pr="${1:?usage: fetch-review.sh <pr-number-or-url> [-R owner/repo]}"
shift

meta=$(gh pr view "$pr" "$@" --json number,url,author)
number=$(jq -r .number <<<"$meta")
pr_author=$(jq -r .author.login <<<"$meta")
owner_repo=$(jq -r '.url | capture("github.com/(?<o>[^/]+)/(?<r>[^/]+)/pull") | "\(.o) \(.r)"' <<<"$meta")
read -r owner name <<<"$owner_repo"

gh api graphql -F owner="$owner" -F name="$name" -F pr="$number" -f query='
query($owner:String!,$name:String!,$pr:Int!){
  repository(owner:$owner,name:$name){
    pullRequest(number:$pr){
      reviewThreads(first:100){
        pageInfo{hasNextPage}
        nodes{
          isResolved isOutdated path line originalLine
          comments(first:50){
            pageInfo{hasNextPage}
            nodes{ url body diffHunk originalCommit{oid} author{__typename login} }
          }
        }
      }
      reviews(first:100){
        pageInfo{hasNextPage}
        nodes{ url state body commit{oid} author{__typename login} }
      }
      comments(first:100){
        pageInfo{hasNextPage}
        nodes{ url body author{__typename login} }
      }
    }
  }
}' | jq -c --arg prAuthor "$pr_author" '
  def bot: . != null and ((.__typename == "Bot") or ((.login // "") | test("\\[bot\\]$")));
  .data.repository.pullRequest as $p
  | (if $p.reviewThreads.pageInfo.hasNextPage or $p.reviews.pageInfo.hasNextPage or $p.comments.pageInfo.hasNextPage
       or ([$p.reviewThreads.nodes[].comments.pageInfo.hasNextPage] | any)
     then ("warning: page limit reached, result is truncated\n" | stderr | empty) else empty end),
    ($p.reviewThreads.nodes[]
      | .comments.nodes[0] as $first
      | {source: "thread", url: $first.url, author: $first.author.login, bot: ($first.author | bot),
         path, line: (.line // .originalLine), resolved: .isResolved, outdated: .isOutdated,
         commit: $first.originalCommit.oid, hunk: $first.diffHunk,
         body: ([.comments.nodes[] | "\(.author.login): \(.body)"] | join("\n---\n"))}),
    ($p.reviews.nodes[] | select(.body != "")
      | {source: "review", url, author: .author.login, bot: (.author | bot), state, commit: .commit.oid, body}),
    ($p.comments.nodes[] | select(.author.login != $prAuthor and .body != "" and (.author | bot | not))
      | {source: "comment", url, author: .author.login, bot: (.author | bot), body})
'
